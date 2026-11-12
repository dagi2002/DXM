import { PLANS, retentionDaysForPlan, type PlanId } from '@pulse/contracts';

/**
 * Data retention (task 14, set by plan since billing, task 11). One function decides how long an
 * org's raw visitor data is kept.
 */

/** Raw-data retention when nothing else says otherwise (the most generous paid plan). */
export const DEFAULT_RETENTION_DAYS = 90;
/** The shortest retention any org can get (the free plan's). */
export const MIN_RETENTION_DAYS = 7;
/**
 * Daily rollups hold counts and vital values only, no visitor ids, and monthly reports compare a
 * month with the one before it. They are kept at least this long, or longer if raw data is.
 */
export const ROLLUP_MIN_RETENTION_DAYS = 400;

export interface RetentionOrg {
  id: string;
  /** Current plan (`org_plans.plan`); null when the org has no plan row yet. */
  plan: string | null;
}

export interface RetentionDefaults {
  /**
   * Server-wide default and cap (`DATA_RETENTION_DAYS`): what an org with an unknown plan keeps,
   * and the most any plan keeps on this server.
   */
  defaultDays?: number;
}

const isPlanId = (plan: string): plan is PlanId => Object.hasOwn(PLANS, plan);

/**
 * Days of raw events and visits to keep for an org.
 * - Task 14's default: `DATA_RETENTION_DAYS` (default 90, never under 7), for any org whose plan
 *   isn't one billing knows.
 * - Billing's rule on top: an org keeps what its plan allows (`retentionDaysForPlan`; no plan row
 *   means Free), never more than the server-wide default. A restricted org keeps its plan's
 *   retention here: it stays able to read its data until it pays (replays follow billing's own
 *   restricted rule).
 */
export function retentionDaysFor(org: RetentionOrg, defaults: RetentionDefaults = {}): number {
  const configured = defaults.defaultDays ?? DEFAULT_RETENTION_DAYS;
  const cap =
    Number.isInteger(configured) && configured >= MIN_RETENTION_DAYS ? configured : DEFAULT_RETENTION_DAYS;
  const plan = org.plan ?? 'free';
  if (!isPlanId(plan)) return cap;
  return Math.max(MIN_RETENTION_DAYS, Math.min(retentionDaysForPlan(plan), cap));
}

/** Days of daily rollups to keep for an org with `rawDays` of raw-data retention. */
export const rollupRetentionDays = (rawDays: number) => Math.max(rawDays, ROLLUP_MIN_RETENTION_DAYS);

/**
 * First UTC day that is kept with `days` of retention at `now`: today and the `days - 1` days
 * before it. Everything from earlier days is deleted, whole days at a time, so a day is never
 * left half-purged (which would let the backfill rebuild its rollup from partial data).
 */
export function retentionCutoffDay(now: Date, days: number): string {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(today - (days - 1) * 86_400_000).toISOString().slice(0, 10);
}
