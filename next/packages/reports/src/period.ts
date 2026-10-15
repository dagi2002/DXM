/**
 * Report periods are calendar months in UTC (`YYYY-MM`). Pure date math, no clock: callers pass
 * `now` so the worker, the API and the tests all agree.
 */

const DAY_MS = 86_400_000;
/** Trend buckets are 7-day weeks counted from the 1st (so the last one is 1–3 days long). */
export const TREND_BUCKET_DAYS = 7;

export interface PeriodRange {
  period: string;
  /** Inclusive. */
  start: Date;
  /** Exclusive. */
  end: Date;
}

const PERIOD_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function periodRange(period: string): PeriodRange {
  const m = PERIOD_RE.exec(period);
  if (!m) throw new RangeError(`invalid report period: ${period}`);
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  return { period, start: new Date(Date.UTC(year, month, 1)), end: new Date(Date.UTC(year, month + 1, 1)) };
}

export const periodOf = (d: Date): string =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

export function previousPeriod(period: string): string {
  const { start } = periodRange(period);
  return periodOf(new Date(start.getTime() - DAY_MS));
}

/** The month that ended most recently (what the monthly job reports on). */
export const lastCompletePeriod = (now: Date): string => previousPeriod(periodOf(now));

/** A month that hasn't started yet can't be reported on. */
export const isFuturePeriod = (period: string, now: Date): boolean => periodRange(period).start > now;

/** Still running at `now`: the report covers the month so far. */
export const isPartialPeriod = (period: string, now: Date): boolean => periodRange(period).end > now;

/** Week starts within [start, end): the 1st, 8th, 15th, 22nd and 29th. */
export function trendBuckets(range: PeriodRange): Date[] {
  const out: Date[] = [];
  for (let t = range.start.getTime(); t < range.end.getTime(); t += TREND_BUCKET_DAYS * DAY_MS) {
    out.push(new Date(t));
  }
  return out;
}

/** Index of the trend bucket that `at` falls in, or -1 outside the range. */
export function bucketIndex(range: PeriodRange, at: Date): number {
  if (at < range.start || at >= range.end) return -1;
  return Math.floor((at.getTime() - range.start.getTime()) / (TREND_BUCKET_DAYS * DAY_MS));
}

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
export { DAY_MS };
