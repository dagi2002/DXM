import {
  REPORT_MIN_VISITS,
  ReportSnapshot,
  type ReportFix,
  type ReportOpenFix,
  type ReportSnapshot as Snapshot,
} from '@pulse/contracts';
import { DAY_MS, isoDate, trendBuckets, type PeriodRange } from './period';

/**
 * Pure assembly of a report snapshot from numbers already loaded. Kept free of I/O so the rules
 * (what counts as enough data, how before/after is measured, what goes in "next month") are
 * unit-tested on their own.
 */

/** Before/after windows around a fix: the week before it shipped vs. up to a week after. */
export const FIX_MEASURE_DAYS = 7;
/** Less than a day since the fix shipped: too early to say anything. */
export const FIX_MIN_AFTER_DAYS = 1;
/** How many still-open fixes the "next month" section lists. */
export const REPORT_OPEN_LIMIT = 3;
export const REPORT_FIXED_LIMIT = 50;

/** What a metrics source returns for one site over one time range. */
export interface PeriodTotals {
  visits: number;
  pageviews: number;
  /** Visits with a known bounce flag (closed visits), and how many of those bounced. */
  closedVisits: number;
  bouncedVisits: number;
  /** p75 LCP on phones, ms; null when no phone reported one. */
  lcpP75: number | null;
}

export interface FixWindow {
  from: Date;
  to: Date;
  days: number;
}

/** The before and after windows for a fix shipped at `fixedAt`, measured at `now`. */
export function fixWindows(fixedAt: Date, now: Date): { before: FixWindow; after: FixWindow } {
  const span = FIX_MEASURE_DAYS * DAY_MS;
  const beforeFrom = new Date(fixedAt.getTime() - span);
  const afterTo = new Date(Math.max(fixedAt.getTime(), Math.min(fixedAt.getTime() + span, now.getTime())));
  return {
    before: { from: beforeFrom, to: fixedAt, days: FIX_MEASURE_DAYS },
    after: { from: fixedAt, to: afterTo, days: (afterTo.getTime() - fixedAt.getTime()) / DAY_MS },
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Events per day over a window; null when the window is too short to mean anything. */
export function perDay(count: number | null, days: number, minDays = FIX_MIN_AFTER_DAYS) {
  return {
    perDay: count === null || days < minDays ? null : round1(count / days),
    days: round1(days),
  };
}

export const bounceRate = (t: PeriodTotals): number | null =>
  t.closedVisits > 0 ? Math.min(1, t.bouncedVisits / t.closedVisits) : null;

export interface FixedIssueInput {
  number: number;
  kind: ReportFix['kind'];
  path: string | null;
  selector: string | null;
  status: 'fixed' | 'verified';
  fixedAt: Date;
  verifiedAt: Date | null;
  /** Friction events in the before / after windows; null = this kind isn't measured that way. */
  beforeCount: number | null;
  afterCount: number | null;
}

export interface OpenIssueInput {
  number: number;
  kind: ReportOpenFix['kind'];
  path: string | null;
  selector: string | null;
  severity: ReportOpenFix['severity'];
  visits: number;
}

export interface SnapshotInput {
  range: PeriodRange;
  now: Date;
  site: { name: string; domain: string };
  agency: string;
  current: PeriodTotals;
  previous: PeriodTotals;
  /** Visits per trend bucket (same order as `trendBuckets(range)`). */
  bucketVisits: number[];
  fixed: FixedIssueInput[];
  open: OpenIssueInput[];
}

export function assembleSnapshot(input: SnapshotInput): Snapshot {
  const { range, now } = input;
  const buckets = trendBuckets(range);
  const partial = range.end > now;
  // Buckets that haven't started yet are left out rather than drawn as zero.
  const shown = buckets.filter((b) => b <= now);
  const span = 7 * DAY_MS;
  const fixed = [...input.fixed]
    .sort((a, b) => a.fixedAt.getTime() - b.fixedAt.getTime() || a.number - b.number)
    .slice(0, REPORT_FIXED_LIMIT);

  const trend = shown.map((start, i) => ({
    start: isoDate(start),
    visits: input.bucketVisits[i] ?? 0,
    fixesShipped: fixed.filter(
      (f) => f.fixedAt >= start && f.fixedAt.getTime() < Math.min(start.getTime() + span, range.end.getTime()),
    ).length,
  }));

  const snapshot = {
    version: 1 as const,
    generatedAt: now.toISOString(),
    period: range.period,
    periodStart: range.start.toISOString(),
    periodEnd: range.end.toISOString(),
    partial,
    site: input.site,
    agency: input.agency,
    enoughData: input.current.visits >= REPORT_MIN_VISITS,
    kpis: {
      visits: { value: input.current.visits, previous: input.previous.visits },
      pageviews: { value: input.current.pageviews, previous: input.previous.pageviews },
      bounceRate: { value: bounceRate(input.current), previous: bounceRate(input.previous) },
      lcp: { value: input.current.lcpP75, previous: input.previous.lcpP75 },
    },
    trend,
    fixed: fixed.map((f) => {
      const w = fixWindows(f.fixedAt, now);
      return {
        number: f.number,
        kind: f.kind,
        path: f.path,
        selector: f.selector,
        status: f.status,
        fixedAt: f.fixedAt.toISOString(),
        verifiedAt: f.verifiedAt?.toISOString() ?? null,
        before: perDay(f.beforeCount, w.before.days),
        after: perDay(f.afterCount, w.after.days),
      };
    }),
    open: [...input.open]
      .sort(
        (a, b) =>
          (a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1) ||
          b.visits - a.visits ||
          a.number - b.number,
      )
      .slice(0, REPORT_OPEN_LIMIT),
  };
  // Validated here so a bad snapshot never gets frozen into the database.
  return ReportSnapshot.parse(snapshot);
}
