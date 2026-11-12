import type { IngestEvent, IngestJob } from '@pulse/contracts/ingest';
import { ingestState } from '@pulse/billing/ingest';
import { and, eq, events, ingestDedupe, isNull, sites, sql, visits, withOrg, type Db } from '@pulse/db';

/* ── User agent → browser / OS / device (coarse on purpose; no fingerprinting) ── */
export function parseUserAgent(ua: string, viewportWidth: number) {
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /SamsungBrowser/.test(ua)
        ? 'Samsung Internet'
        : /UCBrowser/.test(ua)
          ? 'UC Browser'
          : /FxiOS|Firefox\//.test(ua)
            ? 'Firefox'
            : /CriOS|Chrome\//.test(ua)
              ? 'Chrome'
              : /Safari\//.test(ua)
                ? 'Safari'
                : 'Other';
  const os = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPad|iPod/.test(ua)
      ? 'iOS'
      : /CrOS/.test(ua)
        ? 'ChromeOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X/.test(ua)
            ? 'macOS'
            : /Linux/.test(ua)
              ? 'Linux'
              : 'Other';
  const device: 'desktop' | 'mobile' | 'tablet' =
    /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))
      ? 'tablet'
      : /Mobi|iPhone|iPod/.test(ua) || (viewportWidth > 0 && viewportWidth < 768)
        ? 'mobile'
        : 'desktop';
  return { browser, os, device };
}

/** Client clocks are often wrong; keep their timestamp only when it's within a day of ours. */
export function clampClientTs(ts: number, received: Date): Date | null {
  return Math.abs(ts - received.getTime()) <= 24 * 3600 * 1000 ? new Date(ts) : null;
}

function utm(q: string | undefined) {
  if (!q) return {};
  const sp = new URLSearchParams(q);
  return {
    utmSource: sp.get('utm_source')?.slice(0, 100) ?? null,
    utmMedium: sp.get('utm_medium')?.slice(0, 100) ?? null,
    utmCampaign: sp.get('utm_campaign')?.slice(0, 100) ?? null,
  };
}

export interface IngestResult {
  /** `over_quota`: a new session the plan has no room for (or the org is restricted). Nothing is stored. */
  status: 'applied' | 'duplicate' | 'site_gone' | 'over_quota';
  becameLive: boolean;
}

/** Thrown inside the transaction so a new session over quota leaves no trace (visit, events, dedupe). */
class QuotaExceeded extends Error {}

/**
 * Applies one batch atomically inside the org's RLS scope: de-duplicate, upsert the visit,
 * append events, and flip the site to live on its first data.
 *
 * Session quota (05-behavior-contracts §17): a *new* visit counts against the plan's sessions for
 * the usage period. Over quota, or restricted, it is not stored; batches for visits that already
 * exist always are. The count is bumped atomically, so the limit holds under concurrency, and an
 * upgrade lifts it on the very next batch.
 */
export async function applyIngest(db: Db, job: IngestJob): Promise<IngestResult> {
  try {
    return await applyIngestTx(db, job);
  } catch (err) {
    if (err instanceof QuotaExceeded) return { status: 'over_quota', becameLive: false };
    throw err;
  }
}

async function applyIngestTx(db: Db, job: IngestJob): Promise<IngestResult> {
  const { batch, siteId, orgId } = job;
  const received = new Date(job.receivedAt);

  return withOrg(db, orgId, async (tx) => {
    const [site] = await tx
      .select({ status: sites.status })
      .from(sites)
      .where(and(eq(sites.id, siteId), isNull(sites.deletedAt)))
      .limit(1);
    if (!site) return { status: 'site_gone', becameLive: false };

    if (batch.seq !== undefined) {
      const fresh = await tx
        .insert(ingestDedupe)
        .values({ siteId, visitId: batch.vid, seq: batch.seq, orgId })
        .onConflictDoNothing()
        .returning({ seq: ingestDedupe.seq });
      if (!fresh.length) return { status: 'duplicate', becameLive: false };
    }

    const ev = batch.ev;
    const pageviews = ev.filter((e) => e.t === 'pv') as Extract<IngestEvent, { t: 'pv' }>[];
    const firstPv = pageviews[0];
    const count = (t: IngestEvent['t']) => ev.filter((e) => e.t === t).length;
    const maxScroll = Math.max(0, ...ev.filter((e) => e.t === 'sc').map((e) => (e as { d: number }).d));
    const { browser, os, device } = parseUserAgent(job.userAgent, batch.ctx.vw);

    const [upserted] = await tx
      .insert(visits)
      .values({
        siteId,
        id: batch.vid,
        orgId,
        startedAt: received,
        lastSeenAt: received,
        entryPath: firstPv?.p ?? ev[0]!.p,
        exitPath: ev.at(-1)!.p,
        referrerHost: firstPv?.r ?? null,
        ...utm(firstPv?.q),
        device,
        browser,
        os,
        language: batch.ctx.lang ?? null,
        network: batch.ctx.net ?? null,
        platform: batch.ctx.plat,
        country: job.country ?? null,
        sdkVersion: batch.sv ?? null,
        pageviews: pageviews.length,
        eventsCount: ev.length,
        clicks: count('cl'),
        errors: count('er'),
        maxScrollPct: maxScroll,
      })
      .onConflictDoUpdate({
        target: [visits.siteId, visits.id],
        set: {
          lastSeenAt: sql`greatest(${visits.lastSeenAt}, excluded.last_seen_at)`,
          exitPath: sql`excluded.exit_path`,
          pageviews: sql`${visits.pageviews} + excluded.pageviews`,
          eventsCount: sql`${visits.eventsCount} + excluded.events_count`,
          clicks: sql`${visits.clicks} + excluded.clicks`,
          errors: sql`${visits.errors} + excluded.errors`,
          maxScrollPct: sql`greatest(${visits.maxScrollPct}, excluded.max_scroll_pct)`,
          // A late batch reopens a visit the closer ended; it will be re-closed when idle again.
          endedAt: null,
          bounced: null,
        },
      })
      // xmax = 0 only for a freshly inserted row: this batch started a new session.
      .returning({ isNew: sql<boolean>`(xmax = 0)` });

    if (upserted?.isNew) {
      const state = await ingestState(tx, orgId, received);
      const counted =
        state.sessionLimit > 0
          ? await tx.execute(sql`
              insert into org_usage (org_id, period_start, sessions)
              values (${orgId}, ${state.periodStart.toISOString()}::timestamptz, 1)
              on conflict (org_id, period_start) do update set sessions = org_usage.sessions + 1
                where org_usage.sessions < ${state.sessionLimit}
              returning sessions`)
          : { rows: [] };
      if (!counted.rows.length) throw new QuotaExceeded();
    }

    await tx.insert(events).values(
      ev.map((e) => {
        const { t, ts, p, ...props } = e;
        return {
          orgId,
          siteId,
          visitId: batch.vid,
          tsServer: received,
          tsClient: clampClientTs(ts, received),
          type: t,
          path: p,
          props,
        };
      }),
    );

    const live =
      site.status === 'install'
        ? await tx
            .update(sites)
            .set({ status: 'live', verifiedAt: received })
            .where(and(eq(sites.id, siteId), eq(sites.status, 'install')))
            .returning({ id: sites.id })
        : [];
    return { status: 'applied', becameLive: live.length > 0 };
  });
}
