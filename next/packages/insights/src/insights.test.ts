import { FUNNEL_TEMPLATE_DEFS, FunnelConfig, SiteInsights, type FunnelStep } from '@pulse/contracts';
import { describe, expect, it } from 'vitest';
import {
  computeSiteInsights,
  computeWeekSummary,
  conversionOf,
  funnelCounts,
  funnelHash,
  funnelReach,
  globMatch,
  healthParts,
  healthScore,
  p75,
  pageKey,
  percentile,
  rangeDays,
  rankPages,
  rollupPagesDay,
  rollupSiteDay,
  rollupVitalsDay,
  summarizeVital,
  toNetwork,
  vitalScore,
  vitalsBy,
  worstStep,
  type FunnelEvent,
  type InsightInputs,
  type VitalSamples,
} from './index';

describe('globMatch', () => {
  it('treats * as any run of characters and everything else literally', () => {
    expect(globMatch('/checkout*', '/checkout')).toBe(true);
    expect(globMatch('/checkout*', '/checkout/pay')).toBe(true);
    expect(globMatch('/checkout*', '/cart')).toBe(false);
    expect(globMatch('*thank*', '/order/thank-you')).toBe(true);
    expect(globMatch('*', '')).toBe(true);
    expect(globMatch('/a.b', '/aXb')).toBe(false); // no regex semantics
    expect(globMatch('/p/(x)', '/p/(x)')).toBe(true);
    expect(globMatch('a*b*c', 'aXXbYYc')).toBe(true);
    expect(globMatch('a*b*c', 'aXXbYY')).toBe(false);
  });

  it('stays fast on adversarial input', () => {
    const t0 = performance.now();
    expect(globMatch('*a*a*a*a*a*a*b', 'a'.repeat(300))).toBe(false);
    expect(performance.now() - t0).toBeLessThan(50);
  });
});

describe('percentile / p75', () => {
  it('uses floor((n-1) × p) on sorted values (contract 21)', () => {
    expect(percentile([4, 1, 3, 2], 0.75)).toBe(3); // floor(2.25) = 2 → 3
    expect(percentile([1, 2], 0.75)).toBe(1); // floor(0.75) = 0
    expect(percentile([5, 1, 4, 2, 3], 0.75)).toBe(4);
    expect(percentile([], 0.75)).toBeNull();
    expect(() => percentile([1], 2)).toThrow(RangeError);
  });

  it('returns null below the minimum sample count', () => {
    expect(p75([1000, 2000, 3000, 4000])).toBeNull();
    expect(p75([1000, 2000, 3000, 4000, 5000])).toBe(4000);
  });

  it('summarizes a vital with rating and previous value', () => {
    expect(summarizeVital('LCP', [1000, 2000, 3000, 4500, 5000], [800, 900, 1000, 1100, 1200])).toEqual({
      p75: 4500,
      previous: 1100,
      samples: 5,
      rating: 'poor',
    });
    expect(summarizeVital('CLS', [0.01, 0.02, 0.031, 0.04, 0.05], [])).toMatchObject({
      p75: 0.04,
      previous: null,
      rating: 'good',
    });
  });
});

describe('health score', () => {
  it('scores each vital: 1 at good, 0.5 at poor, 0 at twice poor', () => {
    expect(vitalScore('lcp', 2000)).toBe(1);
    expect(vitalScore('lcp', 2500)).toBe(1);
    expect(vitalScore('lcp', 3250)).toBeCloseTo(0.75);
    expect(vitalScore('lcp', 4000)).toBe(0.5);
    expect(vitalScore('lcp', 6000)).toBeCloseTo(0.25);
    expect(vitalScore('lcp', 9000)).toBe(0);
    expect(vitalScore('cls', 0.25)).toBe(0.5);
  });

  const good = { visits: 100, lcp: 2000, inp: 150, cls: 0.05, frictionRate: 0, errorRate: 0 };

  it('is 100 for a healthy site and drops with friction, errors and slowness', () => {
    expect(healthScore(good)).toBe(100);
    // friction 10% → part 0.5 → 100 - 35×0.5
    expect(healthScore({ ...good, frictionRate: 0.1 })).toBe(83);
    // errors 5% → part 0.5 → 100 - 25×0.5
    expect(healthScore({ ...good, errorRate: 0.05 })).toBe(88);
    // LCP at poor → speed part (0.5 + 1 + 1) / 3
    expect(healthScore({ ...good, lcp: 4000 })).toBe(93);
    expect(healthScore({ ...good, frictionRate: 0.5, errorRate: 0.5, lcp: 20000, inp: 5000, cls: 1 })).toBe(
      0,
    );
  });

  it('leaves out parts without data and renormalises the rest', () => {
    expect(healthParts({ ...good, lcp: null, inp: null, cls: null })).toEqual({
      speed: null,
      friction: 1,
      errors: 1,
    });
    expect(healthScore({ ...good, lcp: null, inp: null, cls: null, frictionRate: 0.1 })).toBe(
      Math.round((100 * (0.35 * 0.5 + 0.25)) / 0.6),
    );
  });

  it('has no score under the minimum visits', () => {
    expect(healthScore({ ...good, visits: 29 })).toBeNull();
    expect(healthScore({ ...good, visits: 30 })).toBe(100);
  });
});

const ev = (type: string, path: string | null, props: Record<string, unknown> = {}): FunnelEvent => ({
  type,
  path,
  props,
});

describe('funnels', () => {
  const telebirr = FUNNEL_TEMPLATE_DEFS.find((t) => t.id === 'telebirr_checkout')!;
  const steps: FunnelStep[] = telebirr.steps.map((s, i) => ({ label: `s${i}`, match: s.match }));

  it('every template is a valid funnel config', () => {
    for (const t of FUNNEL_TEMPLATE_DEFS) {
      const r = FunnelConfig.safeParse({
        name: t.id,
        template: t.id,
        steps: t.steps.map((s) => ({ label: s.labelKey, match: s.match })),
      });
      expect(r.success, t.id).toBe(true);
    }
  });

  it('counts steps reached in order only', () => {
    const paid = [
      ev('pv', '/products/kemis'),
      ev('pv', '/cart'),
      ev('pv', '/checkout'),
      ev('cl', '/checkout', { s: 'button.pay-telebirr' }),
      ev('ce', '/checkout', { n: 'purchase' }),
    ];
    expect(funnelReach(steps, paid)).toBe(5);
    // Checkout before any product view doesn't count the later steps.
    expect(funnelReach(steps, [ev('pv', '/checkout'), ev('pv', '/products/x')])).toBe(1);
    // One event satisfies one step at most.
    expect(funnelReach([steps[2]!, steps[2]!], [ev('pv', '/checkout')])).toBe(1);
    expect(funnelReach(steps, [])).toBe(0);
  });

  it('matches forms by stage and optional form name', () => {
    const lead: FunnelStep[] = [
      { label: 'a', match: [{ kind: 'path', glob: '*' }] },
      { label: 'b', match: [{ kind: 'form', stage: 'start', form: 'contact*' }] },
      { label: 'c', match: [{ kind: 'form', stage: 'submit' }] },
    ];
    expect(
      funnelReach(lead, [ev('pv', '/'), ev('fs', '/', { f: 'newsletter' }), ev('fx', '/', { f: 'x' })]),
    ).toBe(1);
    expect(
      funnelReach(lead, [ev('pv', '/'), ev('fs', '/', { f: 'contact-us' }), ev('fx', '/', { f: 'x' })]),
    ).toBe(3);
  });

  it('aggregates visits into non-increasing step counts, finds the worst drop and conversion', () => {
    const counts = funnelCounts(steps.slice(0, 3), [
      [ev('pv', '/product/a'), ev('pv', '/cart'), ev('pv', '/checkout')],
      [ev('pv', '/product/a'), ev('pv', '/cart')],
      [ev('pv', '/product/a')],
      [ev('pv', '/product/b')],
    ]);
    expect(counts).toEqual([4, 2, 1]);
    expect(worstStep(counts)).toBe(1); // 50% drop at step 1 (ties keep the first)
    expect(worstStep([10, 8, 2])).toBe(2);
    expect(worstStep([0, 0])).toBeNull();
    expect(conversionOf(counts)).toBe(0.25);
    expect(conversionOf([0, 0])).toBeNull();
  });

  it('hashes the matchers, not the labels', () => {
    const a = { steps: [{ label: 'One', match: [{ kind: 'path' as const, glob: '/a' }] }] };
    const b = { steps: [{ label: 'Uno', match: [{ glob: '/a', kind: 'path' as const }] }] };
    const c = { steps: [{ label: 'One', match: [{ kind: 'path' as const, glob: '/b' }] }] };
    expect(funnelHash(a)).toBe(funnelHash(b));
    expect(funnelHash(a)).not.toBe(funnelHash(c));
  });
});

describe('day rollups', () => {
  const visits = [
    { id: 'v1', entryPath: '/', bounced: true, pageviews: 1 },
    { id: 'v2', entryPath: '/products/123', bounced: false, pageviews: 3 },
    { id: 'v3', entryPath: '/', bounced: null, pageviews: 2 },
  ];
  const events = [
    { visitId: 'v1', type: 'pv', path: '/' },
    { visitId: 'v2', type: 'pv', path: '/products/123' },
    { visitId: 'v2', type: 'pv', path: '/products/456' },
    { visitId: 'v2', type: 'rc', path: '/products/456' },
    { visitId: 'v2', type: 'dc', path: '/products/456' },
    { visitId: 'v3', type: 'pv', path: '/' },
    { visitId: 'v3', type: 'er', path: '/' },
    { visitId: 'v3', type: 'er', path: '/' },
  ];

  it('rolls up the site day', () => {
    expect(rollupSiteDay(visits, events)).toEqual({
      visits: 3,
      pageviews: 6,
      closedVisits: 2,
      bouncedVisits: 1,
      frictionVisits: 1,
      errorVisits: 1,
      rageClicks: 1,
      deadClicks: 1,
      errors: 2,
    });
  });

  it('rolls up pages by template, with bounce over ended entries', () => {
    expect(rollupPagesDay(visits, events)).toEqual([
      { path: '/', visits: 2, pageviews: 2, entries: 1, bounces: 1, frictionVisits: 0, errorVisits: 1 },
      {
        path: '/products/*',
        visits: 1,
        pageviews: 2,
        entries: 1,
        bounces: 0,
        frictionVisits: 1,
        errorVisits: 0,
      },
    ]);
  });

  it('groups vitals by metric, device, network and page; drops unknown metrics', () => {
    const dims = new Map([
      ['v1', { device: 'mobile', network: 'slow-2g' }],
      ['v2', { device: 'desktop', network: null }],
    ]);
    const groups = rollupVitalsDay(
      [
        { visitId: 'v1', path: '/', name: 'LCP', value: 3000 },
        { visitId: 'v1', path: '/', name: 'LCP', value: 3100 },
        { visitId: 'v2', path: '/products/9', name: 'INP', value: 120 },
        { visitId: 'v2', path: '/', name: 'TTFB', value: 300 },
        { visitId: 'gone', path: '/', name: 'CLS', value: 0.1 },
      ],
      dims,
    );
    expect(groups).toEqual([
      { metric: 'LCP', device: 'mobile', network: '2g', path: '/', values: [3000, 3100] },
      { metric: 'INP', device: 'desktop', network: 'unknown', path: '/products/*', values: [120] },
      { metric: 'CLS', device: 'desktop', network: 'unknown', path: '/', values: [0.1] },
    ]);
    expect(toNetwork('4g')).toBe('4g');
    expect(toNetwork('wifi')).toBe('unknown');
    expect(pageKey(null)).toBe('(unknown)');
  });
});

const vit = (
  metric: VitalSamples['metric'],
  values: number[],
  over: Partial<VitalSamples> = {},
): VitalSamples => ({
  metric,
  device: 'mobile',
  network: '4g',
  path: '/',
  values,
  ...over,
});

describe('vitals by device and network', () => {
  it('computes p75 per bucket in a fixed order and skips empty buckets', () => {
    const groups = [
      vit('LCP', [1000, 1200, 1400, 1600, 1800]),
      vit('LCP', [4000, 4100, 4200, 4300, 5000], { network: '3g' }),
      vit('LCP', [900, 900, 900, 900, 900], { device: 'desktop', network: 'unknown' }),
      vit('INP', [100, 100, 100, 100, 300]),
    ];
    expect(vitalsBy(groups, 'network', ['4g', '3g', '2g', 'unknown'])).toEqual([
      { network: '4g', lcp: 1600, inp: 100, cls: null, samples: 5 },
      { network: '3g', lcp: 4300, inp: null, cls: null, samples: 5 },
      { network: 'unknown', lcp: 900, inp: null, cls: null, samples: 5 },
    ]);
    expect(vitalsBy(groups, 'device', ['mobile', 'desktop', 'tablet']).map((d) => [d.device, d.lcp])).toEqual(
      [
        ['mobile', 4100],
        ['desktop', 900],
      ],
    );
  });
});

describe('pages that need you', () => {
  const page = (path: string, over: Partial<Parameters<typeof rankPages>[0][number]> = {}) => ({
    path,
    visits: 100,
    pageviews: 120,
    entries: 50,
    bounces: 10,
    frictionVisits: 0,
    errorVisits: 0,
    ...over,
  });

  it('ranks by critical fixes, then visits that likely had a bad time', () => {
    const ranked = rankPages(
      [
        page('/'),
        page('/slow'),
        page('/rage', { frictionVisits: 20 }),
        page('/errors', { errorVisits: 10 }),
        page('/fixme', { visits: 2 }),
        page('/tiny', { visits: 3, frictionVisits: 3 }),
        page('(unknown)', { frictionVisits: 99 }),
      ],
      [vit('LCP', [5000, 5000, 5000, 5000, 5000], { path: '/slow' })],
      [{ path: '/fixme', severity: 'critical' }],
    );
    expect(ranked.map((p) => [p.path, p.need])).toEqual([
      ['/fixme', 0],
      ['/slow', 50],
      ['/rage', 20],
      ['/errors', 10],
    ]);
    expect(ranked[1]).toMatchObject({ lcp: 5000, bounce: 0.2, openFixes: { critical: 0, watch: 0 } });
  });

  it('adds page rows across days', () => {
    const [p] = rankPages([page('/a', { frictionVisits: 1 }), page('/a', { frictionVisits: 2 })], [], []);
    expect(p).toMatchObject({ path: '/a', visits: 200, pageviews: 240, frictionVisits: 3, bounce: 0.2 });
  });
});

describe('computeSiteInsights', () => {
  const now = new Date('2026-10-14T09:00:00Z');
  const { days, previousDays } = rangeDays('7d', now);
  const dayRow = (day: string, visits: number, over: Record<string, number> = {}) => ({
    day,
    visits,
    pageviews: visits * 2,
    closedVisits: visits,
    bouncedVisits: Math.round(visits / 4),
    frictionVisits: 0,
    errorVisits: 0,
    rageClicks: 0,
    deadClicks: 0,
    errors: 0,
    ...over,
  });
  const config = FunnelConfig.parse({
    name: 'telebirr checkout',
    template: 'telebirr_checkout',
    steps: [
      { label: 'Viewed', match: [{ kind: 'path', glob: '/product*' }] },
      { label: 'Cart', match: [{ kind: 'path', glob: '/cart*' }] },
      { label: 'Paid', match: [{ kind: 'event', name: 'purchase' }] },
    ],
  });
  const hash = funnelHash(config);

  const base = (): InsightInputs => ({
    siteId: 'site_1',
    range: '7d',
    days,
    previousDays,
    siteDays: [
      ...days.map((d, i) => dayRow(d, 10 + i, i === 6 ? { frictionVisits: 8 } : {})),
      ...previousDays.map((d) => dayRow(d, 10)),
    ],
    pageDays: [],
    vitals: {
      current: [vit('LCP', [2000, 2600, 3000, 3200, 3400])],
      previous: [vit('LCP', [2000, 2100, 2200, 2300, 2400])],
    },
    funnel: {
      config,
      hash,
      days: [
        ...days.map((day) => ({ day, hash, counts: [10, 5, 2] })),
        ...previousDays.map((day) => ({ day, hash, counts: [10, 5, 4] })),
      ],
    },
    openFixes: [],
    updatedAt: new Date('2026-10-14T08:45:00Z'),
  });

  it('uses the last 7 UTC days including today, and the 7 before', () => {
    expect(days[0]).toBe('2026-10-08');
    expect(days.at(-1)).toBe('2026-10-14');
    expect(previousDays).toEqual(rangeDays('7d', now).previousDays);
    expect(previousDays[0]).toBe('2026-10-01');
    expect(previousDays.at(-1)).toBe('2026-10-07');
    expect(rangeDays('30d', now).days).toHaveLength(30);
  });

  it('computes key numbers, deltas, vitals, funnel and health in contract shape', () => {
    const ins = SiteInsights.parse(computeSiteInsights(base()));
    expect(ins.from).toBe('2026-10-08');
    expect(ins.enoughData).toBe(true);
    expect(ins.visits).toEqual({ value: 91, previous: 70, trend: [10, 11, 12, 13, 14, 15, 16] });
    expect(ins.pageviews).toEqual({ value: 182, previous: 140 });
    expect(ins.frictionRate.value).toBeCloseTo(8 / 91);
    expect(ins.frictionRate.previous).toBe(0);
    expect(ins.vitals.lcp).toEqual({ p75: 3200, previous: 2300, samples: 5, rating: 'needs-work' });
    expect(ins.lcpPhones.p75).toBe(3200);
    expect(ins.byNetwork).toEqual([{ network: '4g', lcp: 3200, inp: null, cls: null, samples: 5 }]);
    expect(ins.funnel).toMatchObject({
      name: 'telebirr checkout',
      stale: false,
      steps: [
        { label: 'Viewed', count: 70 },
        { label: 'Cart', count: 35 },
        { label: 'Paid', count: 14 },
      ],
      worst: 2,
      conversion: { value: 0.2, previous: 0.4 },
    });
    expect(ins.health.score).toBeLessThan(ins.health.previous!);
    expect(ins.updatedAt).toBe('2026-10-14T08:45:00.000Z');
  });

  it('says there is not enough data instead of scoring a quiet site', () => {
    const quiet = base();
    quiet.siteDays = [dayRow(days[6]!, 3)];
    const ins = computeSiteInsights(quiet);
    expect(ins.enoughData).toBe(false);
    expect(ins.health.score).toBeNull();
    expect(ins.health.previous).toBeNull();
    expect(ins.visits.previous).toBe(0);
  });

  it('marks the funnel stale when rollups were made with another step list or are missing', () => {
    const old = base();
    old.funnel!.days = old.funnel!.days.map((d) => (d.day === days[6] ? { ...d, hash: 'old' } : d));
    const ins = computeSiteInsights(old);
    expect(ins.funnel!.stale).toBe(true);
    expect(ins.funnel!.steps[0]!.count).toBe(60); // the old-hash day is left out, not mixed in
    expect(ins.funnel!.trend.at(-1)).toBeNull();

    const missing = base();
    missing.funnel!.days = [];
    expect(computeSiteInsights(missing).funnel).toMatchObject({
      stale: true,
      worst: null,
      conversion: { value: null },
    });
  });

  it('has no funnel section without a funnel', () => {
    expect(computeSiteInsights({ ...base(), funnel: null }).funnel).toBeNull();
  });
});

describe('computeWeekSummary', () => {
  it('sums visits across sites and funnel ends across sites with funnels', () => {
    const { days, previousDays } = rangeDays('7d', new Date('2026-10-14T09:00:00Z'));
    const visitsByDay = new Map([...days.map((d) => [d, 10] as const), [previousDays[0]!, 35]]);
    const w = computeWeekSummary({
      days,
      previousDays,
      visitsByDay,
      funnels: [
        new Map([[days[0]!, [10, 4]]]),
        new Map([
          [days[1]!, [30, 6]],
          [previousDays[2]!, [10, 5]],
        ]),
      ],
      verified: { thisMonth: 3, lastMonth: 1 },
    });
    expect(w.visits).toEqual({ value: 70, previous: 35, trend: [10, 10, 10, 10, 10, 10, 10] });
    expect(w.conversion).toEqual({
      value: 0.25,
      previous: 0.5,
      trend: [0.4, 0.2, null, null, null, null, null],
    });
    expect(w.verifiedThisMonth).toEqual({ value: 3, previous: 1 });
    expect(
      computeWeekSummary({
        days,
        previousDays,
        visitsByDay,
        funnels: [],
        verified: { thisMonth: 0, lastMonth: 0 },
      }).conversion,
    ).toBeNull();
  });
});
