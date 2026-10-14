import {
  REPLAY_MARK_TYPES,
  ReplayListQuery,
  canManage,
  canWorkOnFixes,
  type ReplayDetail,
  type ReplayList,
  type ReplayMark,
  type ReplaySummary,
} from '@pulse/contracts';
import { auditLog, newId, sql, withOrg, type Tx } from '@pulse/db';
import { replayVisitPrefix, type BlobStore } from '@pulse/storage';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { z } from 'zod';
import type { AppDeps } from '../app';
import { requireOrg, requireSession } from '../guards';
import { forbidden, notFound, type AppEnv } from '../http';

/** Event types that count as friction on the replay timeline. */
const FRICTION = ['rc', 'dc', 'er', 'fe'] as const;
const FRICTION_SQL = sql.raw(`(${FRICTION.map((t) => `'${t}'`).join(',')})`);
const MARK_SQL = sql.raw(`(${REPLAY_MARK_TYPES.map((t) => `'${t}'`).join(',')})`);
/** Server receive time can trail the browser clock; look this far back for a visit's events. */
const EVENT_SLACK = sql.raw(`interval '1 day'`);

const VisitParam = z.string().regex(/^[A-Za-z0-9_-]{8,40}$/);
const SiteParam = z.object({ siteId: z.string().min(1).max(64).optional() });

interface SummaryRow extends Record<string, unknown> {
  site_id: string;
  visit_id: string;
  site_name: string;
  site_domain: string;
  first_ts: Date;
  last_ts: Date;
  started_at: Date | null;
  pageviews: number | null;
  entry_path: string | null;
  device: 'desktop' | 'mobile' | 'tablet' | null;
  browser: string | null;
  os: string | null;
  network: string | null;
  friction: number;
  fix_ids: string[] | null;
}

const toSummary = (r: SummaryRow): ReplaySummary => ({
  id: r.visit_id,
  siteId: r.site_id,
  siteName: r.site_name,
  siteDomain: r.site_domain,
  startedAt: (r.started_at ?? r.first_ts).toISOString(),
  durationMs: Math.max(0, r.last_ts.getTime() - r.first_ts.getTime()),
  pageviews: r.pageviews ?? 0,
  entryPath: r.entry_path,
  device: r.device,
  browser: r.browser,
  os: r.os,
  network: r.network,
  frictionCount: Number(r.friction),
  fixIds: r.fix_ids ?? [],
});

/**
 * Replays = visits with at least one stored chunk that starts with a full snapshot (so they can
 * be played). Runs inside the org scope: RLS hides every other org's chunks, visits and issues.
 */
async function listReplays(
  tx: Tx,
  f: { siteId?: string; visitId?: string; friction?: boolean; fixId?: string; page?: string; limit: number },
): Promise<SummaryRow[]> {
  const res = await tx.execute<SummaryRow>(sql`
    with r as (
      select site_id, visit_id, min(first_ts) as first_ts, max(last_ts) as last_ts,
             max(received_at) as received_at
        from replay_chunks
       where true
         ${f.siteId ? sql`and site_id = ${f.siteId}` : sql``}
         ${f.visitId ? sql`and visit_id = ${f.visitId}` : sql``}
       group by site_id, visit_id
      having bool_or(has_snapshot)
    )
    select r.site_id, r.visit_id, r.first_ts, r.last_ts,
           s.name as site_name, s.domain as site_domain,
           v.started_at, v.pageviews, v.entry_path, v.device, v.browser, v.os, v.network,
           (select count(*)::int from events e
             where e.site_id = r.site_id and e.visit_id = r.visit_id
               and e.type in ${FRICTION_SQL}
               and e.ts_server >= r.first_ts - ${EVENT_SLACK}) as friction,
           (select array_agg(i.id order by i.last_seen desc) from issues i
             where i.site_id = r.site_id
               and i.evidence -> 'sampleVisitIds' ? r.visit_id) as fix_ids
      from r
      join sites s on s.id = r.site_id and s.deleted_at is null
      left join visits v on v.site_id = r.site_id and v.id = r.visit_id
     where true
       ${
         f.fixId
           ? sql`and exists (select 1 from issues i where i.id = ${f.fixId} and i.site_id = r.site_id
                               and i.evidence -> 'sampleVisitIds' ? r.visit_id)`
           : sql``
       }
       ${
         f.page
           ? sql`and exists (select 1 from events e where e.site_id = r.site_id and e.visit_id = r.visit_id
                               and e.type = 'pv' and e.path = ${f.page}
                               and e.ts_server >= r.first_ts - ${EVENT_SLACK})`
           : sql``
       }
       ${
         f.friction
           ? sql`and exists (select 1 from events e where e.site_id = r.site_id and e.visit_id = r.visit_id
                               and e.type in ${FRICTION_SQL}
                               and e.ts_server >= r.first_ts - ${EVENT_SLACK})`
           : sql``
       }
     order by r.received_at desc, r.visit_id
     limit ${f.limit}`);
  return res.rows.map((row) => ({
    ...row,
    first_ts: new Date(row.first_ts),
    last_ts: new Date(row.last_ts),
    started_at: row.started_at ? new Date(row.started_at) : null,
  }));
}

/** Friction and navigation marks for the timeline, as offsets from the first recorded event. */
async function loadMarks(tx: Tx, row: SummaryRow): Promise<ReplayMark[]> {
  const res = await tx.execute<{
    type: (typeof REPLAY_MARK_TYPES)[number];
    path: string | null;
    props: Record<string, unknown>;
    ts: Date;
  }>(sql`
    select type, path, props, coalesce(ts_client, ts_server) as ts
      from events
     where site_id = ${row.site_id} and visit_id = ${row.visit_id}
       and type in ${MARK_SQL}
       and ts_server >= ${row.first_ts.toISOString()}::timestamptz - ${EVENT_SLACK}
     order by coalesce(ts_client, ts_server), id
     limit 500`);
  const start = row.first_ts.getTime();
  const end = row.last_ts.getTime();
  const str = (v: unknown) => (typeof v === 'string' ? v : null);
  return res.rows.map((e) => {
    const p = e.props ?? {};
    const detail =
      e.type === 'rc' || e.type === 'dc'
        ? str(p.s)
        : e.type === 'fs' || e.type === 'fx'
          ? str(p.f)
          : e.type === 'fe'
            ? [str(p.f), str(p.n)].filter(Boolean).join(' · ') || null
            : e.type === 'er'
              ? str(p.m)
              : e.type === 'ce'
                ? str(p.n)
                : null;
    const at = Math.min(Math.max(0, new Date(e.ts).getTime() - start), Math.max(0, end - start));
    return {
      at,
      type: e.type,
      path: e.path,
      detail,
      friction: (FRICTION as readonly string[]).includes(e.type),
    };
  });
}

/** Client viewers only see shared reports; replays show visitor behaviour, so they're team-only. */
const requireTeam = createMiddleware<AppEnv>(async (c, next) => {
  if (!canWorkOnFixes(c.get('role'))) throw forbidden();
  await next();
});

export function replayRoutes(deps: AppDeps & { blobs: BlobStore }) {
  const r = new Hono<AppEnv>();
  r.use('*', requireSession(deps), requireOrg(deps), requireTeam);

  /** The newest playable replay for this visit id (visit ids are random per tab, so collisions are theoretical). */
  const findOne = async (tx: Tx, visitId: string, siteId?: string) => {
    const [row] = await listReplays(tx, { visitId, siteId, limit: 1 });
    if (!row) throw notFound('Replay');
    return row;
  };

  r.get('/', async (c) => {
    const q = ReplayListQuery.parse(c.req.query());
    const rows = await withOrg(deps.db, c.get('orgId')!, (tx) =>
      listReplays(tx, {
        siteId: q.siteId,
        fixId: q.fixId,
        page: q.page,
        friction: Boolean(q.friction),
        limit: q.limit,
      }),
    );
    const body: ReplayList = { replays: rows.map(toSummary) };
    return c.json(body);
  });

  r.get('/:visitId', async (c) => {
    const visitId = VisitParam.safeParse(c.req.param('visitId'));
    if (!visitId.success) throw notFound('Replay');
    const { siteId } = SiteParam.parse(c.req.query());
    const body = await withOrg(deps.db, c.get('orgId')!, async (tx): Promise<ReplayDetail> => {
      const row = await findOne(tx, visitId.data, siteId);
      const chunks = await tx.execute<{ seq: number; bytes: number; object_key: string }>(sql`
        select seq, bytes, object_key from replay_chunks
         where site_id = ${row.site_id} and visit_id = ${row.visit_id}
         order by seq`);
      const urls = await Promise.all(
        chunks.rows.map(
          async (ch) =>
            (await deps.blobs.signedUrl(ch.object_key, 600)) ??
            `/api/v1/replays/${encodeURIComponent(row.visit_id)}/chunks/${ch.seq}?siteId=${encodeURIComponent(row.site_id)}`,
        ),
      );
      return {
        replay: toSummary(row),
        startTs: row.first_ts.getTime(),
        endTs: row.last_ts.getTime(),
        marks: await loadMarks(tx, row),
        chunks: chunks.rows.map((ch, i) => ({ seq: ch.seq, bytes: ch.bytes, url: urls[i]! })),
      };
    });
    return c.json(body);
  });

  /** Streams one gzip'd chunk. The player decompresses it (DecompressionStream). */
  r.get('/:visitId/chunks/:seq', async (c) => {
    const visitId = VisitParam.safeParse(c.req.param('visitId'));
    const seq = z.coerce.number().int().min(0).max(100_000).safeParse(c.req.param('seq'));
    if (!visitId.success || !seq.success) throw notFound('Replay');
    const { siteId } = SiteParam.parse(c.req.query());
    const key = await withOrg(deps.db, c.get('orgId')!, async (tx) => {
      const res = await tx.execute<{ object_key: string }>(sql`
        select object_key from replay_chunks
         where visit_id = ${visitId.data} and seq = ${seq.data}
           ${siteId ? sql`and site_id = ${siteId}` : sql``}
           and site_id in (select id from sites where deleted_at is null)
         order by received_at desc
         limit 1`);
      return res.rows[0]?.object_key;
    });
    if (!key) throw notFound('Replay');
    const data = await deps.blobs.get(key);
    if (!data) throw notFound('Replay');
    c.header('content-type', 'application/gzip');
    c.header('cache-control', 'private, max-age=3600');
    c.header('x-content-type-options', 'nosniff');
    return c.body(data as Uint8Array<ArrayBuffer>);
  });

  /** Deletes one visit's recording (a visitor asked to be forgotten). Owners and admins only. */
  r.delete('/:visitId', async (c) => {
    if (!canManage(c.get('role'))) throw forbidden();
    const visitId = VisitParam.safeParse(c.req.param('visitId'));
    if (!visitId.success) throw notFound('Replay');
    const { siteId } = SiteParam.parse(c.req.query());
    const orgId = c.get('orgId')!;
    const sitesHit = await withOrg(deps.db, orgId, async (tx) => {
      const res = await tx.execute<{ site_id: string }>(sql`
        delete from replay_chunks
         where visit_id = ${visitId.data}
           ${siteId ? sql`and site_id = ${siteId}` : sql``}
        returning site_id`);
      const ids = [...new Set(res.rows.map((x) => x.site_id))];
      if (!ids.length) throw notFound('Replay');
      await tx.insert(auditLog).values({
        id: newId('aud'),
        orgId,
        actorUserId: c.get('user')!.id,
        action: 'replay.delete',
        targetType: 'replay',
        targetId: visitId.data,
        metadata: { siteIds: ids, chunks: res.rows.length },
        ip: c.get('clientIp'),
      });
      return ids;
    });
    for (const id of sitesHit) {
      await deps.blobs.deletePrefix(replayVisitPrefix({ orgId, siteId: id, visitId: visitId.data }));
    }
    return c.body(null, 204);
  });

  return r;
}

/** Evidence visits that have a replay, per site — for the fix feed's "Watch replays". */
export async function replayIdsFor(tx: Tx, pairs: { siteId: string; visitIds: string[] }[]) {
  const wanted = pairs.flatMap((p) => p.visitIds.map((v) => `${p.siteId} ${v}`));
  if (!wanted.length) return new Set<string>();
  const res = await tx.execute<{ k: string }>(sql`
    select distinct site_id || ' ' || visit_id as k from replay_chunks
     where has_snapshot and (site_id || ' ' || visit_id) = any(${sql.param(wanted)}::text[])`);
  return new Set(res.rows.map((r) => r.k));
}
