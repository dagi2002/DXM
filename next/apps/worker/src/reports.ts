import { newId, reports, sql, withOrg, type Db } from '@pulse/db';
import { sendJob, type Boss } from '@pulse/jobs';
import {
  ReportSiteGoneError,
  buildReportSnapshot,
  lastCompletePeriod,
  periodRange,
  type ReportMetricsSource,
} from '@pulse/reports';

/** Spreads the month's report builds over an hour so they don't all hit Postgres at once. */
export const REPORT_STAGGER_SECONDS = 3600;

export interface MonthlyReportJob {
  siteId: string;
  orgId: string;
  period: string;
}

/**
 * The monthly fan-out (runs on the 1st): every site visited last month gets one `reports.site`
 * job. The site list comes from a narrow SECURITY DEFINER function, so no role reads across orgs.
 */
export async function sweepMonthlyReports(
  db: Db,
  boss: Boss,
  now: Date = new Date(),
  random: () => number = Math.random,
): Promise<{ period: string; queued: number }> {
  const period = lastCompletePeriod(now);
  const { start, end } = periodRange(period);
  const res = await db.execute<{ site_id: string; org_id: string }>(
    sql`select site_id, org_id from pulse_report_candidates(${start.toISOString()}::timestamptz, ${end.toISOString()}::timestamptz)`,
  );
  for (const row of res.rows) {
    await sendJob(
      boss,
      'reports.site',
      { siteId: row.site_id, orgId: row.org_id, period },
      { singletonKey: `${row.site_id}:${period}`, startAfter: Math.floor(random() * REPORT_STAGGER_SECONDS) },
    );
  }
  return { period, queued: res.rows.length };
}

/**
 * Builds and freezes the automatic report for one site and month, inside that org's RLS scope.
 * Idempotent: a second run (retry, re-sent job) finds the existing auto report and does nothing.
 */
export async function generateMonthlyReport(
  db: Db,
  job: MonthlyReportJob,
  now: Date = new Date(),
  source?: ReportMetricsSource,
): Promise<{ status: 'created' | 'exists' | 'site_gone'; reportId?: string }> {
  return withOrg(db, job.orgId, async (tx) => {
    const existing = await tx.execute<{ id: string }>(
      sql`select id from reports where site_id = ${job.siteId} and period = ${job.period} and source = 'auto' limit 1`,
    );
    if (existing.rows[0]) return { status: 'exists', reportId: existing.rows[0].id };
    let snapshot;
    try {
      snapshot = await buildReportSnapshot(tx, { siteId: job.siteId, period: job.period, now }, source);
    } catch (err) {
      if (err instanceof ReportSiteGoneError) return { status: 'site_gone' };
      throw err;
    }
    const id = newId('rpt');
    const inserted = await tx
      .insert(reports)
      .values({
        id,
        orgId: job.orgId,
        siteId: job.siteId,
        period: job.period,
        source: 'auto',
        snapshot,
        createdBy: null,
      })
      .onConflictDoNothing({
        target: [reports.siteId, reports.period],
        where: sql`${reports.source} = 'auto'`,
      })
      .returning({ id: reports.id });
    return inserted[0] ? { status: 'created', reportId: id } : { status: 'exists' };
  });
}
