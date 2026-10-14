import type { Fix } from '@pulse/contracts';
import am from '@pulse/i18n/locales/am.json';
import en from '@pulse/i18n/locales/en.json';
import i18next from 'i18next';
import ICU from 'i18next-icu';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fixesQuery, toFixView, type ViewContext } from './fixes';

const respond = (body: unknown) =>
  vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(
      new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }),
    );

describe('fixesQuery', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads the real feed from the API, and an empty feed stays empty (no sample fallback)', async () => {
    const spy = respond({ fixes: [{ id: 'iss_1' }] });
    const run = () => fixesQuery('org_1').queryFn!({ signal: new AbortController().signal } as never);
    await expect(run()).resolves.toEqual([{ id: 'iss_1' }]);
    expect(spy.mock.calls[0]![0]).toBe('/api/v1/fixes');
    spy.mockResolvedValue(new Response(JSON.stringify({ fixes: [] }), { status: 200 }));
    await expect(run()).resolves.toEqual([]);
  });
});

const i18n = i18next.createInstance();
beforeAll(async () => {
  await i18n.use(ICU).init({
    lng: 'en',
    resources: { en: { translation: en }, am: { translation: am } },
    interpolation: { escapeValue: false },
  });
});
const NOW = new Date('2026-10-14T09:00:00Z');
const ctx = (locale: 'en' | 'am' = 'en'): ViewContext => ({
  t: i18n.getFixedT(locale),
  locale,
  formatDate: (d) => String(d),
  now: NOW,
});
const visitor = {
  windowHours: 24,
  leftOnPage: 3,
  devices: { desktop: 0, mobile: 7, tablet: 0 },
  topBrowser: { browser: 'Chrome', os: 'Android', visits: 7 },
  sampleVisitIds: [],
};
const fix = (over: Partial<Fix>): Fix => ({
  id: 'iss_1',
  number: 4,
  siteId: 'site_1',
  siteName: 'Shop',
  siteDomain: 'shop.et',
  kind: 'rage_click',
  severity: 'critical',
  status: 'open',
  evidence: {
    type: 'click',
    ...visitor,
    path: '/checkout',
    selector: 'button.pay',
    visits: 7,
    occurrences: 9,
  },
  impact: { visitsPerDay: 7, leftPerDay: 3 },
  verification: null,
  suggestion: null,
  firstSeen: '2026-10-14T06:00:00.000Z',
  lastSeen: '2026-10-14T08:55:00.000Z',
  updatedAt: '2026-10-14T08:55:00.000Z',
  fixedAt: null,
  verifiedAt: null,
  replayIds: [],
  ...over,
});

describe('toFixView', () => {
  it('describes every detector kind in plain language', () => {
    const form = toFixView(
      fix({
        kind: 'form_abandon',
        evidence: {
          type: 'form',
          ...visitor,
          path: '/contact',
          form: 'lead',
          visits: 7,
          starts: 10,
          submits: 3,
          abandonRate: 0.7,
          errorFields: [{ field: 'phone', visits: 4, message: null }],
        },
      }),
      ctx(),
    );
    expect(form.title).toBe('Visitors give up on the “lead” form on /contact');
    expect(form.summary).toBe(
      '7 visitors started it and left without sending it in the last 24 hours — 70% of everyone who started.',
    );
    expect(form.chips).toEqual([
      '7 visitors affected',
      'Mostly phones',
      'Android · Chrome',
      'Form: lead',
      'Errors on “phone”',
    ]);

    const slow = toFixView(
      fix({
        kind: 'slow_page',
        evidence: {
          type: 'slow_page',
          ...visitor,
          path: '/products/*',
          metric: 'LCP',
          visits: 5,
          measured: 20,
          p75: 6100,
          threshold: 4000,
          networks: [{ network: '3g', visits: 8, p75: 7200 }],
        },
      }),
      ctx(),
    );
    expect(slow.title).toBe('/products/* takes too long to load');
    expect(slow.summary).toBe(
      'One in four visits waits 6.1 s or longer; good pages stay under 4 s. 5 visits were slower than that in the last 24 hours.',
    );
    expect(slow.chips).toContain('Slowest on 3g: 7.2 s');

    const err = toFixView(
      fix({
        kind: 'js_error',
        evidence: {
          type: 'js_error',
          ...visitor,
          path: '/blog',
          visits: 7,
          message: 'x is not defined',
          source: '/app.js',
          line: 3,
          occurrences: 9,
          pages: [],
        },
      }),
      ctx(),
    );
    expect(err.title).toBe('A JavaScript error breaks /blog');
    expect(err.summary).toBe('“x is not defined” hit 7 visitors in the last 24 hours.');

    const turn = toFixView(
      fix({
        kind: 'u_turn',
        evidence: {
          type: 'u_turn',
          ...visitor,
          path: '/delivery',
          visits: 7,
          uTurns: 8,
          reached: 20,
          rate: 0.35,
          medianSeconds: 3,
          from: [{ path: '/products', visits: 7 }],
        },
      }),
      ctx(),
    );
    expect(turn.title).toBe('Visitors open /delivery and go straight back');
    expect(turn.chips).toContain('Most came from /products');

    const tracking = toFixView(
      fix({
        kind: 'tracking_broken',
        impact: null,
        evidence: { type: 'tracking', lastEventAt: null, silentHours: 26.4, typicalDailyVisits: 80 },
      }),
      ctx(),
    );
    expect(tracking).toMatchObject({
      page: null,
      title: 'shop.et stopped sending data',
      chips: [],
      impact: null,
    });
    expect(tracking.summary).toContain('No visits have arrived for 26 hours. It usually gets about 80 a day');
  });

  it('speaks Amharic', () => {
    const v = toFixView(fix({}), ctx('am'));
    expect(v.title).toBe('ጎብኚዎች በ/checkout ላይ “button.pay”ን ደጋግመው ይነኩታል');
    expect(v.kind).toBe('የተደጋገሙ ንክኪዎች');
  });

  it('carries the AI suggestion only when the API sent one', () => {
    expect(toFixView(fix({}), ctx()).suggestion).toBeNull();
    const withAi = toFixView(
      fix({
        suggestion: { text: 'Lower the banner.', code: null, model: 'm', createdAt: NOW.toISOString() },
      }),
      ctx(),
    );
    expect(withAi.suggestion).toEqual({ text: 'Lower the banner.', code: null });
  });

  it('shows the before/after on verified fixes and a note while waiting or reopened', () => {
    const verification = {
      outcome: 'verified' as const,
      measure: 'rate' as const,
      before: { affected: 20, exposed: 40, value: 0.5 },
      after: { affected: 1, exposed: 50, value: 0.02 },
      checkedAt: '2026-10-14T08:00:00.000Z',
    };
    const verified = toFixView(
      fix({ status: 'verified', verification, verifiedAt: '2026-10-14T08:00:00.000Z' }),
      ctx(),
    );
    expect(verified.verified).toMatchObject({
      label: 'Rage clicks · share of visits',
      before: '50%',
      after: '2%',
    });
    expect(verified.verifyNote).toBeNull();

    const waiting = toFixView(
      fix({ status: 'fixed', verification: { ...verification, outcome: 'waiting' } }),
      ctx(),
    );
    expect(waiting.verified).toBeNull();
    expect(waiting.verifyNote).toMatch(/^Waiting for more visits/);

    const reopened = toFixView(
      fix({
        status: 'open',
        verification: {
          ...verification,
          outcome: 'reopened',
          after: { affected: 15, exposed: 40, value: 0.375 },
        },
      }),
      ctx(),
    );
    expect(reopened.verifyNote).toContain('(50% → 37.5%)');
  });
});
