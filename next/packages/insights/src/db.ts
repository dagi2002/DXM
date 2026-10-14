/**
 * Database side of site insights: the rollup job (worker) and loading insights from rollups
 * (API, reports). Every function here takes an org-scoped transaction (`withOrg`), so RLS applies.
 */
import { FunnelConfig, type InsightsRange, type SiteInsights, type WeekSummary } from '@pulse/contracts';
import {
  and,
  eq,
  inArray,
  isNull,
  rollupFunnelDay,
  rollupPageDay,
  rollupSiteDay,
  rollupVitalsDay,
  siteFunnels,
  sites,
  sql,
  visits,
  withOrg,
  type Db,
  type Tx,
} from '@pulse/db';
import { computeSiteInsights, computeWeekSummary, dayStart, rangeDays, utcDay } from './compute';
import { FUNNEL_EVENT_TYPES, funnelCounts, funnelHash, type FunnelEvent } from './funnels';
import {
  rollupPagesDay,
  rollupSiteDay as rollupSiteDayRows,
  rollupVitalsDay as rollupVitalsDayRows,
  type DayEvent,
  type DayVisit,
  type DayVital,
  type VisitDims,
} from './rollup';
import { percentile, type VitalMetric, type VitalSamples } from './vitals';
import type { Device, InsightNetwork } from '@pulse/contracts';

const DAY_MS = 86_400_000;
/** Funnel steps can happen after midnight for a visit that started before it. */
const FUNNEL_TAIL_MS = 2 * 3600_000;
/** How far back a new or edited funnel is recomputed. */
export const FUNNEL_BACKFILL_DAYS = 30;
/** The insights sweep looks for sites with visitor activity this recent. */
export const INSIGHTS_SWEEP_LOOKBACK_MINUTES = 30;

/** Timestamps go to Postgres as explicit timestamptz literals (no driver time-zone guessing). */
const ts = (d: Date) => sql`${d.toISOString()}::timestamptz`;

/* ── Funnel config ───────────────────────────────────────────────────────── */

export async function loadFunnel(tx: Tx, siteId: string) {
  const [row] = await tx.select().from(siteFunnels).where(eq(siteFunnels.siteId, siteId)).limit(1);
  if (!row) return null;
  const parsed = FunnelConfig.safeParse({ name: row.name, template: row.template, steps: row.steps });
  if (!parsed.success) return null;
  return { config: parsed.data, hash: row.hash, updatedAt: row.updatedAt };
}

export async function saveFunnel(
  tx: Tx,
  orgId: string,
  siteId: string,
  config: FunnelConfig,
  userId: string | null,
) {
  const hash = funnelHash(config);
  const values = {
    siteId,
    orgId,
    name: config.name,
    template: config.template,
    steps: config.steps,
    hash,
    updatedBy: userId,
  };
  const [row] = await tx
    .insert(siteFunnels)
    .values(values)
    .onConflictDoUpdate({ target: siteFunnels.siteId, set: { ...values, updatedAt: new Date() } })
    .returning({ updatedAt: siteFunnels.updatedAt });
  return { hash, updatedAt: row!.updatedAt };
}

/* ── Rollup job ──────────────────────────────────────────────────────────── */

async function dayVisits(tx: Tx, siteId: string, from: Date, to: Date) {
  const res = await tx.execute<{
    id: string;
    entry_path: string | null;
    bounced: boolean | null;
    pageviews: number;
  }>(sql`
    select id, entry_path, bounced, pageviews from visits
     where site_id = ${siteId} and started_at >= ${ts(from)} and started_at < ${ts(to)}`);
  return res.rows.map<DayVisit>((r) => ({
    id: r.id,
    entryPath: r.entry_path,
    bounced: r.bounced,
    pageviews: Number(r.pageviews),
  }));
}

async function visitDims(tx: Tx, siteId: string, ids: string[]) {
  const dims = new Map<string, VisitDims>();
  if (!ids.length) return dims;
  const rows = await tx
    .select({ id: visits.id, device: visits.device, network: visits.network })
    .from(visits)
    .where(and(eq(visits.siteId, siteId), inArray(visits.id, ids)));
  for (const r of rows) dims.set(r.id, { device: r.device, network: r.network });
  return dims;
}

/** Recomputes the funnel rollup for one day (visits that started that day). */
async function rollupFunnelForDay(
  tx: Tx,
  orgId: string,
  siteId: string,
  day: string,
  funnel: { config: FunnelConfig; hash: string },
) {
  const from = dayStart(day);
  const to = new Date(from.getTime() + DAY_MS);
  const res = await tx.execute<{
    visit_id: string;
    type: string;
    path: string | null;
    props: Record<string, unknown>;
  }>(sql`
    select e.visit_id, e.type, e.path, e.props
      from events e
      join visits v on v.site_id = e.site_id and v.id = e.visit_id
     where e.site_id = ${siteId}
       and v.started_at >= ${ts(from)} and v.started_at < ${ts(to)}
       and e.ts_server >= ${ts(from)} and e.ts_server < ${ts(new Date(to.getTime() + FUNNEL_TAIL_MS))}
       and e.type in (${sql.join(
         FUNNEL_EVENT_TYPES.map((t) => sql`${t}`),
         sql`, `,
       )})
     order by e.visit_id, e.ts_server, e.id`);
  const byVisit = new Map<string, FunnelEvent[]>();
  for (const r of res.rows) {
    let list = byVisit.get(r.visit_id);
    if (!list) byVisit.set(r.visit_id, (list = []));
    list.push({ type: r.type, path: r.path, props: r.props ?? {} });
  }
  const counts = funnelCounts(funnel.config.steps, byVisit.values());
  await tx
    .insert(rollupFunnelDay)
    .values({ siteId, orgId, day, hash: funnel.hash, counts })
    .onConflictDoUpdate({
      target: [rollupFunnelDay.siteId, rollupFunnelDay.day],
      set: { hash: funnel.hash, counts, computedAt: new Date() },
    });
}

/**
 * Recomputes every rollup of one site for one UTC day from raw rows: delete-and-insert, so it's
 * idempotent and safe to re-run (the sweep re-runs today and yesterday each time).
 */
export async function rollupDay(
  tx: Tx,
  orgId: string,
  siteId: string,
  day: string,
  funnel: { config: FunnelConfig; hash: string } | null,
) {
  const from = dayStart(day);
  const to = new Date(from.getTime() + DAY_MS);
  const dayRows = await dayVisits(tx, siteId, from, to);
  const evRes = await tx.execute<{
    visit_id: string;
    type: string;
    path: string | null;
    n: string | null;
    v: number | null;
  }>(sql`
    select visit_id, type, path,
           case when type = 'vt' then props->>'n' end as n,
           case when type = 'vt' then (props->>'v')::float8 end as v
      from events
     where site_id = ${siteId} and ts_server >= ${ts(from)} and ts_server < ${ts(to)}
       and type in ('pv', 'rc', 'dc', 'er', 'vt')`);
  const events: DayEvent[] = [];
  const vitals: DayVital[] = [];
  for (const r of evRes.rows) {
    if (r.type === 'vt') {
      if (r.n && r.v !== null)
        vitals.push({ visitId: r.visit_id, path: r.path, name: r.n, value: Number(r.v) });
    } else events.push({ visitId: r.visit_id, type: r.type, path: r.path });
  }
  const dims = await visitDims(tx, siteId, [...new Set(vitals.map((v) => v.visitId))]);

  const site = rollupSiteDayRows(dayRows, events);
  const pages = rollupPagesDay(dayRows, events);
  const vitalGroups = rollupVitalsDayRows(vitals, dims);

  await tx
    .insert(rollupSiteDay)
    .values({ siteId, orgId, day, ...site })
    .onConflictDoUpdate({
      target: [rollupSiteDay.siteId, rollupSiteDay.day],
      set: { ...site, computedAt: new Date() },
    });
  await tx.delete(rollupPageDay).where(and(eq(rollupPageDay.siteId, siteId), eq(rollupPageDay.day, day)));
  if (pages.length) await tx.insert(rollupPageDay).values(pages.map((p) => ({ siteId, orgId, day, ...p })));
  await tx
    .delete(rollupVitalsDay)
    .where(and(eq(rollupVitalsDay.siteId, siteId), eq(rollupVitalsDay.day, day)));
  if (vitalGroups.length)
    await tx.insert(rollupVitalsDay).values(vitalGroups.map((g) => ({ siteId, orgId, day, ...g })));

  if (funnel) await rollupFunnelForDay(tx, orgId, siteId, day, funnel);
  else
    await tx
      .delete(rollupFunnelDay)
      .where(and(eq(rollupFunnelDay.siteId, siteId), eq(rollupFunnelDay.day, day)));
  return { visits: site.visits, pages: pages.length, vitalGroups: vitalGroups.length };
}

/** Recent days with visits whose funnel rollup is missing or made with another step list. */
async function staleFunnelDays(tx: Tx, siteId: string, hash: string, today: string) {
  const res = await tx.execute<{ day: string }>(sql`
    select r.day::text as day from rollup_site_day r
     where r.site_id = ${siteId} and r.visits > 0
       and r.day > ${today}::date - ${FUNNEL_BACKFILL_DAYS}::int
       and not exists (select 1 from rollup_funnel_day f
                        where f.site_id = r.site_id and f.day = r.day and f.hash = ${hash})
     order by 1`);
  return res.rows.map((r) => r.day);
}

export interface SiteRollupResult {
  status: 'ok' | 'site_gone';
  days: string[];
  funnelDays: string[];
}

/**
 * The `insights.site` job: refreshes today and yesterday (UTC) for one site, plus any recent
 * day whose funnel rollup doesn't match the current funnel. Runs inside the site's org scope.
 */
export async function rollupSite(
  db: Db,
  job: { siteId: string; orgId: string },
  now: Date = new Date(),
): Promise<SiteRollupResult> {
  const { siteId, orgId } = job;
  return withOrg(db, orgId, async (tx) => {
    const [site] = await tx
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.id, siteId), isNull(sites.deletedAt)))
      .limit(1);
    if (!site) return { status: 'site_gone', days: [], funnelDays: [] };
    const today = utcDay(now);
    const yesterday = utcDay(new Date(dayStart(today).getTime() - DAY_MS));
    const funnel = await loadFunnel(tx, siteId);
    const days = [yesterday, today];
    for (const day of days) await rollupDay(tx, orgId, siteId, day, funnel);
    const funnelDays: string[] = [];
    if (funnel) {
      for (const day of await staleFunnelDays(tx, siteId, funnel.hash, today)) {
        await rollupFunnelForDay(tx, orgId, siteId, day, funnel);
        funnelDays.push(day);
      }
    }
    return { status: 'ok', days, funnelDays };
  });
}

/** Cross-org: sites whose rollups need refreshing (narrow SECURITY DEFINER function). */
export async function sitesForInsights(db: Db, lookbackMinutes = INSIGHTS_SWEEP_LOOKBACK_MINUTES) {
  const res = await db.execute<{ site_id: string; org_id: string }>(
    sql`select site_id, org_id from pulse_sites_for_insights(${lookbackMinutes})`,
  );
  return res.rows.map((r) => ({ siteId: r.site_id, orgId: r.org_id }));
}

/* ── Reading insights ────────────────────────────────────────────────────── */

async function loadVitals(tx: Tx, siteId: string, days: string[]): Promise<VitalSamples[]> {
  const rows = await tx
    .select({
      metric: rollupVitalsDay.metric,
      device: rollupVitalsDay.device,
      network: rollupVitalsDay.network,
      path: rollupVitalsDay.path,
      values: rollupVitalsDay.values,
    })
    .from(rollupVitalsDay)
    .where(and(eq(rollupVitalsDay.siteId, siteId), inArray(rollupVitalsDay.day, days)));
  return rows.map((r) => ({
    metric: r.metric as VitalMetric,
    device: r.device as Device,
    network: r.network as InsightNetwork,
    path: r.path,
    values: r.values,
  }));
}

/** The open (or in-progress) fixes of a site, by page template, for "pages that need you". */
async function openFixesByPath(tx: Tx, siteId: string) {
  const res = await tx.execute<{ path: string | null; severity: 'critical' | 'watch' }>(sql`
    select evidence->>'path' as path, severity from issues
     where site_id = ${siteId} and status in ('open', 'fixing')`);
  return res.rows.filter((r): r is { path: string; severity: 'critical' | 'watch' } => !!r.path);
}

/**
 * Site insights for a range ending `now`, from rollups only. This is the computation task 9
 * (reports) reuses to freeze a snapshot: call it inside the report's org-scoped transaction.
 */
export async function loadSiteInsights(
  tx: Tx,
  siteId: string,
  range: InsightsRange,
  now: Date = new Date(),
): Promise<SiteInsights> {
  const { days, previousDays } = rangeDays(range, now);
  const all = [...previousDays, ...days];
  const siteRows = await tx
    .select()
    .from(rollupSiteDay)
    .where(and(eq(rollupSiteDay.siteId, siteId), inArray(rollupSiteDay.day, all)));
  const pageRows = await tx
    .select()
    .from(rollupPageDay)
    .where(and(eq(rollupPageDay.siteId, siteId), inArray(rollupPageDay.day, days)));
  const [current, previous] = await Promise.all([
    loadVitals(tx, siteId, days),
    loadVitals(tx, siteId, previousDays),
  ]);
  const funnel = await loadFunnel(tx, siteId);
  const funnelRows = funnel
    ? await tx
        .select({ day: rollupFunnelDay.day, hash: rollupFunnelDay.hash, counts: rollupFunnelDay.counts })
        .from(rollupFunnelDay)
        .where(and(eq(rollupFunnelDay.siteId, siteId), inArray(rollupFunnelDay.day, all)))
    : [];
  const updatedAt = siteRows
    .filter((r) => days.includes(r.day))
    .reduce<Date | null>((a, r) => (!a || r.computedAt > a ? r.computedAt : a), null);

  return computeSiteInsights({
    siteId,
    range,
    days,
    previousDays,
    siteDays: siteRows,
    pageDays: pageRows,
    vitals: { current, previous },
    funnel: funnel ? { config: funnel.config, hash: funnel.hash, days: funnelRows } : null,
    openFixes: await openFixesByPath(tx, siteId),
    updatedAt,
  });
}

/** Today's "this week" panel for the whole organization (current org scope). */
export async function loadWeekSummary(tx: Tx, now: Date = new Date()): Promise<WeekSummary> {
  const { days, previousDays } = rangeDays('7d', now);
  const all = [...previousDays, ...days];
  const visitRows = await tx.execute<{ day: string; visits: number }>(sql`
    select r.day::text as day, sum(r.visits)::int as visits
      from rollup_site_day r join sites s on s.id = r.site_id and s.deleted_at is null
     where r.day >= ${all[0]}::date and r.day <= ${all.at(-1)}::date
     group by r.day`);
  const funnelRows = await tx.execute<{ site_id: string; day: string; counts: number[] }>(sql`
    select fd.site_id, fd.day::text as day, fd.counts
      from rollup_funnel_day fd
      join site_funnels f on f.site_id = fd.site_id and f.hash = fd.hash
      join sites s on s.id = fd.site_id and s.deleted_at is null
     where fd.day >= ${all[0]}::date and fd.day <= ${all.at(-1)}::date`);
  const funnels = new Map<string, Map<string, number[]>>();
  for (const r of funnelRows.rows) {
    let m = funnels.get(r.site_id);
    if (!m) funnels.set(r.site_id, (m = new Map()));
    m.set(r.day, r.counts.map(Number));
  }
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const lastMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const verified = await tx.execute<{ this_month: number; last_month: number }>(sql`
    select count(*) filter (where i.verified_at >= ${ts(monthStart)})::int as this_month,
           count(*) filter (where i.verified_at >= ${ts(lastMonthStart)} and i.verified_at < ${ts(monthStart)})::int as last_month
      from issues i join sites s on s.id = i.site_id and s.deleted_at is null
     where i.status = 'verified' and i.verified_at >= ${ts(lastMonthStart)}`);
  const v = verified.rows[0]!;
  return computeWeekSummary({
    days,
    previousDays,
    visitsByDay: new Map(visitRows.rows.map((r) => [r.day, Number(r.visits)])),
    funnels: [...funnels.values()],
    verified: { thisMonth: Number(v.this_month), lastMonth: Number(v.last_month) },
  });
}

/* ── For reports (task 9) ────────────────────────────────────────────────── */

/**
 * Report numbers from rollups. Structurally matches task 9's `ReportMetricsSource`
 * (`packages/reports/src/source.ts`), so it can be passed straight to `buildReportSnapshot`.
 * Day boundaries are UTC; `from`/`to` are rounded to whole days.
 */
export const rollupReportSource = {
  async totals(tx: Tx, siteId: string, from: Date, to: Date) {
    const res = await tx.execute<{ visits: number; pageviews: number; closed: number; bounced: number }>(sql`
      select coalesce(sum(visits), 0)::int as visits, coalesce(sum(pageviews), 0)::int as pageviews,
             coalesce(sum(closed_visits), 0)::int as closed, coalesce(sum(bounced_visits), 0)::int as bounced
        from rollup_site_day
       where site_id = ${siteId} and day >= ${utcDay(from)}::date and day < ${utcDay(to)}::date`);
    const lcp = await tx.execute<{ v: number }>(sql`
      select unnest(values) as v from rollup_vitals_day
       where site_id = ${siteId} and metric = 'LCP' and device = 'mobile'
         and day >= ${utcDay(from)}::date and day < ${utcDay(to)}::date`);
    const p = percentile(
      lcp.rows.map((r) => Number(r.v)),
      0.75,
    );
    const row = res.rows[0]!;
    return {
      visits: Number(row.visits),
      pageviews: Number(row.pageviews),
      closedVisits: Number(row.closed),
      bouncedVisits: Number(row.bounced),
      lcpP75: p === null ? null : Math.round(p),
    };
  },

  /** Visits per `bucketDays`-day bucket from `range.start` (7-day buckets, as reports use). */
  async bucketVisits(tx: Tx, siteId: string, range: { start: Date; end: Date }, bucketDays = 7) {
    const res = await tx.execute<{ b: number; n: number }>(sql`
      select floor((day - ${utcDay(range.start)}::date) / ${bucketDays})::int as b, sum(visits)::int as n
        from rollup_site_day
       where site_id = ${siteId} and day >= ${utcDay(range.start)}::date and day < ${utcDay(range.end)}::date
       group by 1`);
    const days = Math.round((range.end.getTime() - range.start.getTime()) / DAY_MS);
    const out = Array.from({ length: Math.ceil(days / bucketDays) }, () => 0);
    for (const r of res.rows) if (r.b >= 0 && r.b < out.length) out[r.b] = Number(r.n);
    return out;
  },
};
