/**
 * Data retention (task 14). One function decides how long an org's raw visitor data is kept, so
 * billing (task 11) can set it by plan by changing this function only.
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
  /** Per-org default until billing sets retention by plan (`DATA_RETENTION_DAYS`). */
  defaultDays?: number;
}

/**
 * Days of raw events and visits to keep for an org. Until billing (slice 7) sets retention by
 * plan, every org gets the same per-org default. Billing overrides this function.
 */
export function retentionDaysFor(org: RetentionOrg, defaults: RetentionDefaults = {}): number {
  void org;
  const days = defaults.defaultDays ?? DEFAULT_RETENTION_DAYS;
  if (!Number.isInteger(days) || days < MIN_RETENTION_DAYS) return DEFAULT_RETENTION_DAYS;
  return days;
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
