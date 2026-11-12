/**
 * Before/after measures for fixes over daily rollups (task 14). Page-view exposure — the expensive
 * part, since every visit has page views — comes from rollups for whole days that have a complete
 * one; the rare event types a problem is made of (taps, errors, form events, vitals) and any day
 * without a complete rollup come from raw events. Used by `issue.verify` and by reports.
 */
import type { FixEvidence, FixKind, VerificationMeasure } from '@pulse/contracts';
import { sql, type Tx } from '@pulse/db';
import {
  VERIFY_AFTER_END_DAYS,
  VERIFY_AFTER_START_DAYS,
  VERIFY_BEFORE_DAYS,
  measureIssue,
  verificationWindows,
  verifyEventTypes,
  type TimeRange,
} from '@pulse/detectors';
import { loadDetectorInput, rawFixAffected } from '@pulse/reports';
import { splitByRollups } from './backfill';
import { dayStart, utcDay } from './compute';

const DAY_MS = 86_400_000;

/** Same rounding as the detectors' rates (4 decimals). */
const rate = (affected: number, exposed: number): VerificationMeasure => ({
  affected,
  exposed,
  value: exposed ? Math.round((affected / exposed) * 10_000) / 10_000 : null,
});

/**
 * Verification windows on whole UTC days, so rollups can answer them: the 7 days before the day
 * the fix shipped vs days 3–6 after it (the fix day is day 0 and is left out of both). The check
 * is due once the after window ends, which is never later than the detector's own due time.
 * Tracking keeps its exact 24 hours after the fix.
 */
export function verifyDayWindows(kind: FixKind, fixedAt: Date): { before: TimeRange; after: TimeRange } {
  if (kind === 'tracking_broken') {
    const w = verificationWindows(kind, fixedAt);
    return { before: w.before, after: w.after };
  }
  const fixDay = dayStart(utcDay(fixedAt)).getTime();
  return {
    before: { start: new Date(fixDay - VERIFY_BEFORE_DAYS * DAY_MS), end: new Date(fixDay) },
    after: {
      start: new Date(fixDay + VERIFY_AFTER_START_DAYS * DAY_MS),
      end: new Date(fixDay + VERIFY_AFTER_END_DAYS * DAY_MS),
    },
  };
}

const dayRanges = (days: readonly string[]): TimeRange[] =>
  days.map((d) => ({ start: dayStart(d), end: new Date(dayStart(d).getTime() + DAY_MS) }));

const daysSql = (days: readonly string[]) =>
  sql.join(
    days.map((d) => sql`${d}::date`),
    sql`, `,
  );

/** Exposure (and U-turns) for whole rollup days of one page template or the whole site. */
async function rollupExposure(tx: Tx, siteId: string, evidence: FixEvidence, days: string[]) {
  if (!days.length) return { exposed: 0, turned: 0 };
  if (evidence.type === 'js_error') {
    const res = await tx.execute<{ n: number }>(sql`
      select coalesce(sum(pv_visits), 0)::int as n from rollup_site_day
       where site_id = ${siteId} and day in (${daysSql(days)})`);
    return { exposed: Number(res.rows[0]!.n), turned: 0 };
  }
  if (evidence.type !== 'click' && evidence.type !== 'u_turn') return { exposed: 0, turned: 0 };
  const res = await tx.execute<{ visits: number; reached: number; turned: number }>(sql`
    select coalesce(sum(visits), 0)::int as visits, coalesce(sum(uturn_reached), 0)::int as reached,
           coalesce(sum(uturn_turned), 0)::int as turned
      from rollup_page_day
     where site_id = ${siteId} and path = ${evidence.path} and day in (${daysSql(days)})`);
  const r = res.rows[0]!;
  return evidence.type === 'u_turn'
    ? { exposed: Number(r.reached), turned: Number(r.turned) }
    : { exposed: Number(r.visits), turned: 0 };
}

/** Kinds whose exposure needs page views (and so can come from rollups). */
const PV_EXPOSURE = new Set<FixEvidence['type']>(['click', 'js_error', 'u_turn']);

export interface FixWindowMeasure {
  measure: VerificationMeasure;
  /** Whole days answered by rollups; the rest of the window came from raw events. */
  rollupDays: number;
}

/**
 * Measures one fix's problem over [start, end): visits that could have hit it (exposed) and that
 * did (affected), the way the detector found it. Visits that cross midnight count once per day on
 * rollup days. Runs inside the org-scoped transaction.
 */
export async function measureFixWindow(
  tx: Tx,
  siteId: string,
  kind: FixKind,
  evidence: FixEvidence,
  range: TimeRange,
): Promise<FixWindowMeasure> {
  const types = verifyEventTypes(kind);
  if (!PV_EXPOSURE.has(evidence.type)) {
    // Forms, vitals and tracking are measured from their own (rare) events; nothing to roll up.
    const input = await loadDetectorInput(tx, siteId, types, [range]);
    return { measure: measureIssue(kind, evidence, input), rollupDays: 0 };
  }
  const { rollupDays, rawRanges } = await splitByRollups(tx, siteId, range);
  const raw = measureIssue(kind, evidence, await loadDetectorInput(tx, siteId, types, rawRanges));
  if (!rollupDays.length) return { measure: raw, rollupDays: 0 };

  const exposure = await rollupExposure(tx, siteId, evidence, rollupDays);
  let affected: number;
  if (evidence.type === 'u_turn') affected = exposure.turned;
  else {
    // Only the problem's own events (taps on the element, the error), never page views.
    const narrow = types.filter((t) => t !== 'pv');
    const input = await loadDetectorInput(tx, siteId, narrow, dayRanges(rollupDays));
    affected = measureIssue(kind, evidence, input).affected;
  }
  // A visit that hit the problem was exposed to it, even if its page view came in another batch.
  const exposed = Math.max(exposure.exposed, affected);
  return {
    measure: rate(raw.affected + affected, raw.exposed + exposed),
    rollupDays: rollupDays.length,
  };
}

/**
 * Visits a fixed problem affected in [start, end) — the reports' before/after measure for task 10's
 * kinds — from rollups where they answer it (U-turns), raw events otherwise.
 */
export async function rollupFixAffected(
  tx: Tx,
  siteId: string,
  kind: FixKind,
  evidence: FixEvidence,
  range: TimeRange,
): Promise<number | null> {
  if (kind !== 'u_turn') return rawFixAffected(tx, siteId, kind, evidence, range);
  if (range.end <= range.start) return 0;
  return (await measureFixWindow(tx, siteId, kind, evidence, range)).measure.affected;
}
