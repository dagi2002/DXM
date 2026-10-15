import type { ReportSnapshot } from '@pulse/contracts';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n, withI18n } from '../test/i18n';
import { formatPeriod, publicReportQuery, recentPeriods, useReportText } from './reports';

const snapshot = (over: Partial<ReportSnapshot> = {}): ReportSnapshot => ({
  version: 1,
  generatedAt: '2026-10-01T04:23:00.000Z',
  period: '2026-09',
  periodStart: '2026-09-01T00:00:00.000Z',
  periodEnd: '2026-10-01T00:00:00.000Z',
  partial: false,
  site: { name: 'Shop', domain: 'shop.et' },
  agency: 'Agency',
  enoughData: true,
  kpis: {
    visits: { value: 400, previous: 300 },
    pageviews: { value: 800, previous: 600 },
    bounceRate: { value: 0.25, previous: null },
    lcp: { value: null, previous: null },
  },
  trend: [],
  fixed: [],
  open: [],
  ...over,
});

const fix = {
  number: 3,
  kind: 'dead_click' as const,
  path: '/promo',
  selector: 'a.link',
  status: 'verified' as const,
  fixedAt: '2026-09-10T00:00:00.000Z',
  verifiedAt: null,
  before: { perDay: 4.5, days: 7 },
  after: { perDay: null, days: 0.5 },
};

async function text(lng: 'en' | 'am' = 'en') {
  const i18n = await createTestI18n(lng);
  return renderHook(() => useReportText(), { wrapper: withI18n(i18n) }).result.current;
}

describe('report text', () => {
  it('writes the headline from what happened, in the reader’s language', async () => {
    const en = await text();
    expect(en.headline(snapshot({ fixed: [fix, { ...fix, number: 4 }] }))).toBe(
      'We fixed 2 problems in September 2026.',
    );
    expect(en.headline(snapshot({ enoughData: false }))).toBe(
      'Not enough visits yet to measure September 2026.',
    );
    expect(en.headline(snapshot())).toBe('400 visits in September 2026, and no fixes shipped.');
    expect(en.summary(snapshot({ open: [{ ...fix, severity: 'critical', visits: 3 }] }))).toBe(
      'No fixes shipped this month. 1 problem is still open and is first on next month’s plan.',
    );
    const am = await text('am');
    expect(am.headline(snapshot({ fixed: [fix] }))).toMatch(/1 ችግር አስተካክለናል።$/);
  });

  it('names fixes from their evidence and is honest about early numbers', async () => {
    const en = await text();
    expect(en.fixTitle(fix)).toBe('Tapping “a.link” on /promo does nothing');
    expect(en.fixTitle({ ...fix, path: null, selector: null })).toBe('Dead clicks · fix #3');
    expect(en.perDay(4.5)).toBe('4.5/day');
    expect(en.perDay(null)).toBe('Too early to tell');
    expect(en.measure(fix)).toBe('Taps that did nothing, per day');
    expect(en.unmeasured(fix)).toBe(false);
    expect(en.unmeasured({ ...fix, before: { perDay: null, days: 7 } })).toBe(true);
  });
});

describe('report helpers', () => {
  afterEach(() => vi.restoreAllMocks());

  it('formats months and lists the last 12, newest first', () => {
    expect(formatPeriod('2026-09', 'en')).toBe('September 2026');
    const periods = recentPeriods(new Date('2026-01-15T00:00:00Z'));
    expect(periods).toHaveLength(12);
    expect(periods.slice(0, 3)).toEqual(['2026-01', '2025-12', '2025-11']);
  });

  it('maps a 404 share link to the expired state (null), and keeps other errors', async () => {
    const run = (token: string) =>
      publicReportQuery(token).queryFn!({ signal: new AbortController().signal } as never);
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 'not_found', message: 'x' } }), { status: 404 }),
      );
    await expect(run('a b')).resolves.toBeNull();
    expect(spy.mock.calls[0]![0]).toBe('/api/v1/public/reports/a%20b');
    spy.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'rate_limited', message: 'x' } }), { status: 429 }),
    );
    await expect(run('t')).rejects.toMatchObject({ status: 429 });
  });
});
