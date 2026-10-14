import { REPORT_MIN_VISITS, ReportSnapshot } from '@pulse/contracts';
import { describe, expect, it } from 'vitest';
import {
  assembleSnapshot,
  bounceRate,
  bucketIndex,
  fixWindows,
  hashShareToken,
  isFuturePeriod,
  isPartialPeriod,
  lastCompletePeriod,
  newShareToken,
  perDay,
  periodOf,
  periodRange,
  previousPeriod,
  trendBuckets,
  type PeriodTotals,
  type SnapshotInput,
} from './index';

const d = (s: string) => new Date(s);

describe('periods', () => {
  it('maps a month to UTC bounds, end exclusive', () => {
    expect(periodRange('2026-09')).toEqual({
      period: '2026-09',
      start: d('2026-09-01T00:00:00Z'),
      end: d('2026-10-01T00:00:00Z'),
    });
    expect(periodRange('2026-12').end).toEqual(d('2027-01-01T00:00:00Z'));
    expect(() => periodRange('2026-13')).toThrow(RangeError);
    expect(() => periodRange('2026-9')).toThrow(RangeError);
  });

  it('steps back across a year and finds the last complete month', () => {
    expect(previousPeriod('2026-01')).toBe('2025-12');
    expect(previousPeriod('2026-03')).toBe('2026-02');
    expect(periodOf(d('2026-10-14T12:00:00Z'))).toBe('2026-10');
    expect(lastCompletePeriod(d('2026-10-01T04:23:00Z'))).toBe('2026-09');
  });

  it('knows future and partial months', () => {
    const now = d('2026-10-14T12:00:00Z');
    expect(isFuturePeriod('2026-11', now)).toBe(true);
    expect(isFuturePeriod('2026-10', now)).toBe(false);
    expect(isPartialPeriod('2026-10', now)).toBe(true);
    expect(isPartialPeriod('2026-09', now)).toBe(false);
  });

  it('splits a month into 7-day buckets from the 1st', () => {
    const sep = periodRange('2026-09');
    expect(trendBuckets(sep).map((b) => b.getUTCDate())).toEqual([1, 8, 15, 22, 29]);
    expect(trendBuckets(periodRange('2026-02'))).toHaveLength(4);
    expect(bucketIndex(sep, d('2026-09-08T00:00:00Z'))).toBe(1);
    expect(bucketIndex(sep, d('2026-09-30T23:59:59Z'))).toBe(4);
    expect(bucketIndex(sep, d('2026-10-01T00:00:00Z'))).toBe(-1);
  });
});

describe('fix measurement', () => {
  it('compares the week before a fix with up to a week after', () => {
    const fixedAt = d('2026-09-10T00:00:00Z');
    const w = fixWindows(fixedAt, d('2026-10-01T00:00:00Z'));
    expect(w.before).toEqual({ from: d('2026-09-03T00:00:00Z'), to: fixedAt, days: 7 });
    expect(w.after).toEqual({ from: fixedAt, to: d('2026-09-17T00:00:00Z'), days: 7 });
  });

  it('cuts the after window at now, and says nothing under a day', () => {
    const fixedAt = d('2026-09-30T12:00:00Z');
    const w = fixWindows(fixedAt, d('2026-10-01T00:00:00Z'));
    expect(w.after.days).toBe(0.5);
    expect(perDay(3, w.after.days)).toEqual({ perDay: null, days: 0.5 });
    expect(perDay(45, 7)).toEqual({ perDay: 6.4, days: 7 });
    expect(perDay(null, 7)).toEqual({ perDay: null, days: 7 });
  });

  it('bounce rate is over closed visits only, and null without any', () => {
    const t = (closed: number, bounced: number): PeriodTotals => ({
      visits: 100,
      pageviews: 200,
      closedVisits: closed,
      bouncedVisits: bounced,
      lcpP75: null,
    });
    expect(bounceRate(t(80, 20))).toBe(0.25);
    expect(bounceRate(t(0, 0))).toBeNull();
  });
});

const totals = (visits: number, over: Partial<PeriodTotals> = {}): PeriodTotals => ({
  visits,
  pageviews: visits * 2,
  closedVisits: visits,
  bouncedVisits: Math.floor(visits / 4),
  lcpP75: 3100,
  ...over,
});

function input(over: Partial<SnapshotInput> = {}): SnapshotInput {
  return {
    range: periodRange('2026-09'),
    now: d('2026-10-01T04:00:00Z'),
    site: { name: 'Demo shop', domain: 'demostore.et' },
    agency: 'Demo Agency',
    current: totals(400),
    previous: totals(300, { lcpP75: 4500 }),
    bucketVisits: [90, 100, 110, 80, 20],
    fixed: [],
    open: [],
    ...over,
  };
}

describe('assembleSnapshot', () => {
  it('builds a valid, complete month', () => {
    const s = assembleSnapshot(
      input({
        fixed: [
          {
            number: 7,
            kind: 'rage_click',
            path: '/checkout',
            selector: 'button.pay',
            status: 'verified',
            fixedAt: d('2026-09-20T10:00:00Z'),
            verifiedAt: d('2026-09-27T10:00:00Z'),
            beforeCount: 70,
            afterCount: 7,
          },
          {
            number: 3,
            kind: 'dead_click',
            path: '/',
            selector: 'a.logo',
            status: 'fixed',
            fixedAt: d('2026-09-02T10:00:00Z'),
            verifiedAt: null,
            beforeCount: 14,
            afterCount: 0,
          },
        ],
      }),
    );
    expect(ReportSnapshot.parse(s)).toEqual(s);
    expect(s.partial).toBe(false);
    expect(s.enoughData).toBe(true);
    expect(s.kpis).toEqual({
      visits: { value: 400, previous: 300 },
      pageviews: { value: 800, previous: 600 },
      bounceRate: { value: 0.25, previous: 0.25 },
      lcp: { value: 3100, previous: 4500 },
    });
    expect(s.trend.map((p) => [p.start, p.visits, p.fixesShipped])).toEqual([
      ['2026-09-01', 90, 1],
      ['2026-09-08', 100, 0],
      ['2026-09-15', 110, 1],
      ['2026-09-22', 80, 0],
      ['2026-09-29', 20, 0],
    ]);
    // Oldest fix first; before/after per day.
    expect(s.fixed.map((f) => [f.number, f.before.perDay, f.after.perDay])).toEqual([
      [3, 2, 0],
      [7, 10, 1],
    ]);
  });

  it('flags a partial month, leaves out weeks that have not started, and too-few visits', () => {
    const s = assembleSnapshot(
      input({
        range: periodRange('2026-10'),
        now: d('2026-10-09T12:00:00Z'),
        current: totals(REPORT_MIN_VISITS - 1),
        bucketVisits: [20, 9, 0, 0, 0],
      }),
    );
    expect(s.partial).toBe(true);
    expect(s.enoughData).toBe(false);
    expect(s.trend.map((p) => p.start)).toEqual(['2026-10-01', '2026-10-08']);
  });

  it('keeps unmeasured numbers null instead of inventing them', () => {
    const s = assembleSnapshot(
      input({ current: totals(0, { closedVisits: 0, lcpP75: null }), previous: totals(0, { lcpP75: null }) }),
    );
    expect(s.kpis.bounceRate.value).toBeNull();
    expect(s.kpis.lcp).toEqual({ value: null, previous: null });
  });

  it('lists the three most pressing open fixes for next month', () => {
    const open = [
      { number: 1, severity: 'watch' as const, visits: 50 },
      { number: 2, severity: 'critical' as const, visits: 5 },
      { number: 3, severity: 'watch' as const, visits: 80 },
      { number: 4, severity: 'critical' as const, visits: 12 },
    ].map((o) => ({ ...o, kind: 'rage_click' as const, path: '/x', selector: 'b' }));
    expect(assembleSnapshot(input({ open })).open.map((o) => o.number)).toEqual([4, 2, 3]);
  });
});

describe('share tokens', () => {
  it('are long, URL-safe and stored only as a SHA-256 hash', () => {
    const token = newShareToken();
    expect(token).toMatch(/^[A-Za-z0-9]{32}$/);
    expect(newShareToken()).not.toBe(token);
    const hash = hashShareToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(hashShareToken(token)).toBe(hash);
  });
});
