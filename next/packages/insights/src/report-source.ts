/**
 * Report numbers from daily rollups, falling back to raw events for any part of the period without
 * a complete rollup (partial days at the edges, days not yet backfilled, old-version rollups).
 * Implements `ReportMetricsSource` from @pulse/reports and gives the same numbers as
 * `rawEventsSource` on the same data (tested in the worker).
 */
import { sql, type Tx } from '@pulse/db';
import type { TimeRange } from '@pulse/detectors';
import { TREND_BUCKET_DAYS, type PeriodTotals, type ReportMetricsSource } from '@pulse/reports';
import { splitByRollups } from './backfill';
import { dayStart } from './compute';
import { rollupFixAffected } from './measure';
import { percentile } from './vitals';

const DAY_MS = 86_400_000;
const ts = (d: Date) => sql`${d.toISOString()}::timestamptz`;
const daysSql = (days: readonly string[]) =>
  sql.join(
    days.map((d) => sql`${d}::date`),
    sql`, `,
  );

/** Visits started per UTC day in the raw ranges (visit numbers count where the visit started). */
async function rawVisitDays(tx: Tx, siteId: string, ranges: readonly TimeRange[]) {
  const out: { day: string; visits: number; pageviews: number; closed: number; bounced: number }[] = [];
  for (const r of ranges) {
    const res = await tx.execute<{
      day: string;
      visits: number;
      pageviews: number;
      closed: number;
      bounced: number;
    }>(sql`
      select (started_at at time zone 'UTC')::date::text as day, count(*)::int as visits,
             coalesce(sum(pageviews), 0)::int as pageviews,
             count(*) filter (where bounced is not null)::int as closed,
             count(*) filter (where bounced)::int as bounced
        from visits
       where site_id = ${siteId} and started_at >= ${ts(r.start)} and started_at < ${ts(r.end)}
       group by 1`);
    for (const row of res.rows)
      out.push({
        day: row.day,
        visits: Number(row.visits),
        pageviews: Number(row.pageviews),
        closed: Number(row.closed),
        bounced: Number(row.bounced),
      });
  }
  return out;
}

/** Final LCP values on phones in the raw ranges (one per page view), as the rollup job keeps them. */
async function rawPhoneLcp(tx: Tx, siteId: string, ranges: readonly TimeRange[]) {
  const values: number[] = [];
  for (const r of ranges) {
    const res = await tx.execute<{ v: number }>(sql`
      select (e.props->>'v')::float8 as v
        from events e
        join visits v on v.site_id = e.site_id and v.id = e.visit_id
       where e.site_id = ${siteId} and e.type = 'vt' and e.props->>'n' = 'LCP'
         and (e.props->>'v')::float8 >= 0
         and e.ts_server >= ${ts(r.start)} and e.ts_server < ${ts(r.end)}
         and v.device = 'mobile'`);
    for (const row of res.rows) values.push(Number(row.v));
  }
  return values;
}

async function rollupVisitDays(tx: Tx, siteId: string, days: readonly string[]) {
  if (!days.length) return [];
  const res = await tx.execute<{
    day: string;
    visits: number;
    pageviews: number;
    closed: number;
    bounced: number;
  }>(sql`
    select day::text as day, visits, pageviews, closed_visits as closed, bounced_visits as bounced
      from rollup_site_day where site_id = ${siteId} and day in (${daysSql(days)})`);
  return res.rows.map((r) => ({
    day: r.day,
    visits: Number(r.visits),
    pageviews: Number(r.pageviews),
    closed: Number(r.closed),
    bounced: Number(r.bounced),
  }));
}

async function rollupPhoneLcp(tx: Tx, siteId: string, days: readonly string[]) {
  if (!days.length) return [];
  const res = await tx.execute<{ v: number }>(sql`
    select unnest(values)::float8 as v from rollup_vitals_day
     where site_id = ${siteId} and metric = 'LCP' and device = 'mobile' and day in (${daysSql(days)})`);
  return res.rows.map((r) => Number(r.v));
}

/** Per-day visit numbers over [from, to): rollups where complete, raw events elsewhere. */
async function visitDays(tx: Tx, siteId: string, range: TimeRange) {
  const { rollupDays, rawRanges } = await splitByRollups(tx, siteId, range);
  return [...(await rollupVisitDays(tx, siteId, rollupDays)), ...(await rawVisitDays(tx, siteId, rawRanges))];
}

export const rollupReportSource: ReportMetricsSource = {
  async totals(tx, siteId, from, to): Promise<PeriodTotals> {
    const range = { start: from, end: to };
    const { rollupDays, rawRanges } = await splitByRollups(tx, siteId, range);
    const days = [
      ...(await rollupVisitDays(tx, siteId, rollupDays)),
      ...(await rawVisitDays(tx, siteId, rawRanges)),
    ];
    const lcp = [
      ...(await rollupPhoneLcp(tx, siteId, rollupDays)),
      ...(await rawPhoneLcp(tx, siteId, rawRanges)),
    ];
    const p = percentile(lcp, 0.75);
    return {
      visits: days.reduce((a, d) => a + d.visits, 0),
      pageviews: days.reduce((a, d) => a + d.pageviews, 0),
      closedVisits: days.reduce((a, d) => a + d.closed, 0),
      bouncedVisits: days.reduce((a, d) => a + d.bounced, 0),
      lcpP75: p === null ? null : Math.round(p),
    };
  },

  /** Visits per 7-day bucket from `range.start` (the report's trend). */
  async bucketVisits(tx, siteId, range) {
    const days = await visitDays(tx, siteId, { start: range.start, end: range.end });
    const n = Math.ceil((range.end.getTime() - range.start.getTime()) / DAY_MS / TREND_BUCKET_DAYS);
    const out = Array.from({ length: n }, () => 0);
    for (const d of days) {
      const b = Math.floor((dayStart(d.day).getTime() - range.start.getTime()) / DAY_MS / TREND_BUCKET_DAYS);
      if (b >= 0 && b < n) out[b]! += d.visits;
    }
    return out;
  },

  fixAffected: rollupFixAffected,
};
