/**
 * Rollup backfill (task 14): builds the daily rollups from raw events for every day that still has
 * raw events but no complete rollup. Idempotent: a day it has finished is complete, so a second
 * run finds nothing to do and changes nothing.
 */
import { and, eq, isNull, sites, sql, withOrg, type Db, type Tx } from '@pulse/db';
import type { TimeRange } from '@pulse/detectors';
import { dayStart, utcDay } from './compute';
import { loadFunnel, rollupDay } from './db';
import { ROLLUP_VERSION } from './rollup';

const DAY_MS = 86_400_000;

/**
 * A day's rollup is final once it was computed this long after the day ended: late batches have
 * arrived, open visits have closed (30 minutes idle) and funnel steps after midnight (2 h) are in.
 */
export const ROLLUP_SETTLE_HOURS = 3;
/** Site-days per candidate query; the backfill loops until none are left. */
export const BACKFILL_BATCH = 500;

/** When a rollup of `day` counts as final. */
export const settledAt = (day: string) =>
  new Date(dayStart(day).getTime() + DAY_MS + ROLLUP_SETTLE_HOURS * 3600_000);

/** The last UTC day whose rollup can be final at `now`. */
export function lastSettledDay(now: Date): string {
  return utcDay(new Date(now.getTime() - DAY_MS - ROLLUP_SETTLE_HOURS * 3600_000));
}

/** True when a rollup row can be trusted as the whole day: current version, computed after it settled. */
export const isCompleteRollup = (day: string, row: { version: number; computedAt: Date }) =>
  row.version >= ROLLUP_VERSION && row.computedAt.getTime() >= settledAt(day).getTime();

/** Of `days`, those with a complete site rollup for `siteId` (current org scope). */
export async function completeRollupDays(tx: Tx, siteId: string, days: readonly string[]) {
  if (!days.length) return new Set<string>();
  const res = await tx.execute<{ day: string; version: number; computed_at: string }>(sql`
    select day::text as day, version, to_char(computed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as computed_at
      from rollup_site_day
     where site_id = ${siteId} and day in (${sql.join(
       days.map((d) => sql`${d}::date`),
       sql`, `,
     )})`);
  return new Set(
    res.rows
      .filter((r) =>
        isCompleteRollup(r.day, { version: Number(r.version), computedAt: new Date(r.computed_at) }),
      )
      .map((r) => r.day),
  );
}

/** Whole UTC days inside [start, end). */
export function wholeDays(range: TimeRange): string[] {
  const out: string[] = [];
  let t = Math.ceil(range.start.getTime() / DAY_MS) * DAY_MS;
  while (t + DAY_MS <= range.end.getTime()) {
    out.push(utcDay(new Date(t)));
    t += DAY_MS;
  }
  return out;
}

/**
 * Splits [start, end) into whole days with a complete rollup and the raw ranges left over
 * (partial days at the edges, and days whose rollup is missing, stale or from an older version).
 */
export async function splitByRollups(
  tx: Tx,
  siteId: string,
  range: TimeRange,
): Promise<{ rollupDays: string[]; rawRanges: TimeRange[] }> {
  if (range.end <= range.start) return { rollupDays: [], rawRanges: [] };
  const complete = await completeRollupDays(tx, siteId, wholeDays(range));
  const rollupDays = wholeDays(range).filter((d) => complete.has(d));
  const rawRanges: TimeRange[] = [];
  let cursor = range.start.getTime();
  for (const d of rollupDays) {
    const s = dayStart(d).getTime();
    if (s > cursor) rawRanges.push({ start: new Date(cursor), end: new Date(s) });
    cursor = s + DAY_MS;
  }
  if (cursor < range.end.getTime()) rawRanges.push({ start: new Date(cursor), end: range.end });
  return { rollupDays, rawRanges };
}

export interface BackfillCandidate {
  siteId: string;
  orgId: string;
  day: string;
}

/** Cross-org: site-days that need a rollup (narrow SECURITY DEFINER function, ids and days only). */
export async function backfillCandidates(
  db: Db,
  now: Date = new Date(),
  limit = BACKFILL_BATCH,
): Promise<BackfillCandidate[]> {
  const res = await db.execute<{ site_id: string; org_id: string; day: string }>(sql`
    select site_id, org_id, day::text as day
      from pulse_rollup_backfill_candidates(${lastSettledDay(now)}::date, ${ROLLUP_SETTLE_HOURS}, ${ROLLUP_VERSION}, ${limit})`);
  return res.rows.map((r) => ({ siteId: r.site_id, orgId: r.org_id, day: r.day }));
}

export interface BackfillResult {
  /** Site-days rebuilt. */
  days: number;
  sites: number;
  /** Site-days still not complete after a rebuild (clock skew between worker and database). */
  stuck: number;
}

/**
 * The `insights.backfill` job: rebuilds every candidate site-day inside its org's RLS scope, in
 * batches, until none are left. Uses the same `rollupDay` as the live rollup job, so a backfilled
 * day is identical to one the sweep would have made.
 */
export async function backfillRollups(
  db: Db,
  now: Date = new Date(),
  opts: { batch?: number; maxDays?: number } = {},
): Promise<BackfillResult> {
  const done = new Set<string>();
  const touched = new Set<string>();
  let stuck = 0;
  for (;;) {
    const batch = (await backfillCandidates(db, now, opts.batch ?? BACKFILL_BATCH)).filter((c) => {
      const key = `${c.siteId}\u0000${c.day}`;
      if (!done.has(key)) return true;
      stuck += 1;
      return false;
    });
    if (!batch.length) break;
    const bySite = new Map<string, BackfillCandidate[]>();
    for (const c of batch) {
      const list = bySite.get(c.siteId) ?? [];
      list.push(c);
      bySite.set(c.siteId, list);
    }
    for (const [siteId, list] of bySite) {
      const orgId = list[0]!.orgId;
      await withOrg(db, orgId, async (tx) => {
        const [site] = await tx
          .select({ id: sites.id })
          .from(sites)
          .where(and(eq(sites.id, siteId), isNull(sites.deletedAt)))
          .limit(1);
        if (!site) return;
        const funnel = await loadFunnel(tx, siteId);
        for (const c of list) await rollupDay(tx, orgId, siteId, c.day, funnel);
      });
      touched.add(siteId);
      for (const c of list) done.add(`${c.siteId}\u0000${c.day}`);
    }
    if (opts.maxDays && done.size >= opts.maxDays) break;
    // A batch that couldn't be completed would otherwise come back forever.
    if (stuck) break;
  }
  return { days: done.size, sites: touched.size, stuck };
}
