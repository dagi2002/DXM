import { sql, type Tx } from '@pulse/db';
import { TREND_BUCKET_DAYS, type PeriodRange } from './period';
import type { PeriodTotals } from './snapshot';

/**
 * Where a report's site numbers come from. The default reads `visits` and `events` directly,
 * which is fine once a month per site. Site insights (task 8, slice 5) adds daily rollups and
 * insight functions; plugging them in means implementing this interface over the rollups and
 * passing it to `buildReportSnapshot` — nothing else in reports changes.
 *
 * Every call runs inside the caller's org-scoped transaction (RLS applies).
 */
export interface ReportMetricsSource {
  totals(tx: Tx, siteId: string, from: Date, to: Date): Promise<PeriodTotals>;
  /** Visits started in each trend bucket of the range (buckets from `trendBuckets`). */
  bucketVisits(tx: Tx, siteId: string, range: PeriodRange): Promise<number[]>;
}

/** Timestamps go to Postgres as explicit timestamptz literals (no driver time-zone guessing). */
export const ts = (d: Date) => sql`${d.toISOString()}::timestamptz`;

export const rawEventsSource: ReportMetricsSource = {
  async totals(tx, siteId, from, to) {
    const v = await tx.execute<{ visits: number; pageviews: number; closed: number; bounced: number }>(sql`
      select count(*)::int as visits,
             coalesce(sum(pageviews), 0)::int as pageviews,
             count(*) filter (where bounced is not null)::int as closed,
             count(*) filter (where bounced)::int as bounced
        from visits
       where site_id = ${siteId} and started_at >= ${ts(from)} and started_at < ${ts(to)}`);
    // p75 LCP on phones: one final LCP per page view, from the deferred vitals script.
    const lcp = await tx.execute<{ p75: number | null }>(sql`
      select percentile_cont(0.75) within group (order by (e.props->>'v')::float8) as p75
        from events e
        join visits v on v.site_id = e.site_id and v.id = e.visit_id
       where e.site_id = ${siteId} and e.type = 'vt' and e.props->>'n' = 'LCP'
         and e.ts_server >= ${ts(from)} and e.ts_server < ${ts(to)}
         and v.device = 'mobile'`);
    const row = v.rows[0]!;
    const p75 = lcp.rows[0]?.p75;
    return {
      visits: Number(row.visits),
      pageviews: Number(row.pageviews),
      closedVisits: Number(row.closed),
      bouncedVisits: Number(row.bounced),
      lcpP75: p75 === null || p75 === undefined ? null : Math.round(Number(p75)),
    };
  },

  async bucketVisits(tx, siteId, range) {
    const seconds = TREND_BUCKET_DAYS * 86_400;
    const res = await tx.execute<{ b: number; n: number }>(sql`
      select floor(extract(epoch from (started_at - ${ts(range.start)})) / ${seconds})::int as b,
             count(*)::int as n
        from visits
       where site_id = ${siteId} and started_at >= ${ts(range.start)} and started_at < ${ts(range.end)}
       group by 1`);
    const days = (range.end.getTime() - range.start.getTime()) / 86_400_000;
    const out = Array.from({ length: Math.ceil(days / TREND_BUCKET_DAYS) }, () => 0);
    for (const r of res.rows) if (r.b >= 0 && r.b < out.length) out[r.b] = Number(r.n);
    return out;
  },
};
