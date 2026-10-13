import { describe, expect, it } from 'vitest';
import {
  DEAD_CLICK_CRITICAL_VISITS,
  DEAD_CLICK_MIN_VISITS,
  MAX_SAMPLE_VISITS,
  MONEY_PATH_CRITICAL_VISITS,
  RAGE_CLICK_CRITICAL_VISITS,
  RAGE_CLICK_MIN_VISITS,
  REGRESSION_COOLDOWN_MINUTES,
  cooldownCutoff,
  detectDeadClicks,
  detectRageClicks,
  fingerprintOf,
  normalizePath,
  planUpsert,
  runDetectors,
  type DetectorEvent,
  type DetectorInput,
  type Finding,
  type VisitFacts,
} from './index';

const T0 = new Date('2026-10-12T08:00:00Z');
const at = (min: number) => new Date(T0.getTime() + min * 60_000);

const rage = (visitId: string, min: number, path = '/products', s = 'button.buy', n = 4): DetectorEvent => ({
  visitId,
  at: at(min),
  type: 'rc',
  path,
  props: { s, n },
});
const dead = (visitId: string, min: number, path = '/menu', s = 'a.menu-item'): DetectorEvent => ({
  visitId,
  at: at(min),
  type: 'dc',
  path,
  props: { s },
});
const input = (events: DetectorEvent[], visits = new Map<string, VisitFacts>()): DetectorInput => ({
  events,
  visits,
  windowHours: 24,
});
const many = (count: number, make: (id: string, i: number) => DetectorEvent) =>
  Array.from({ length: count }, (_, i) => make(`v${i}`, i));

describe('normalizePath', () => {
  it.each([
    ['/', '/'],
    ['/checkout/', '/checkout'],
    ['/orders/8812', '/orders/*'],
    ['/orders/8812/receipt', '/orders/*/receipt'],
    ['/u/3f2b9c1e-8a6d-4c2e-9b1a-1234567890ab', '/u/*'],
    ['/p/64f0c2a9e1b3c4d5e6f70812', '/p/*'],
    ['/products/habesha-kemis', '/products/habesha-kemis'],
    ['/products/habesha-kemis-1042', '/products/*'],
    ['/search?q=x#top', '/search'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePath(input)).toBe(expected);
  });
  it('rejects empty and non-absolute paths', () => {
    expect(normalizePath(null)).toBeNull();
    expect(normalizePath('')).toBeNull();
    expect(normalizePath('checkout')).toBeNull();
  });
});

describe('fingerprintOf', () => {
  it('is stable and distinguishes kind, page and element', () => {
    const a = fingerprintOf('rage_click', '/checkout', 'button.pay');
    expect(a).toBe(fingerprintOf('rage_click', '/checkout', 'button.pay'));
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toBe(fingerprintOf('dead_click', '/checkout', 'button.pay'));
    expect(a).not.toBe(fingerprintOf('rage_click', '/cart', 'button.pay'));
    expect(a).not.toBe(fingerprintOf('rage_click', '/checkout', 'button.buy'));
  });
});

describe('rage clicks', () => {
  it(`needs ${RAGE_CLICK_MIN_VISITS} distinct visits`, () => {
    const below = many(RAGE_CLICK_MIN_VISITS - 1, (id, i) => rage(id, i));
    expect(detectRageClicks(input(below))).toEqual([]);
    const at = many(RAGE_CLICK_MIN_VISITS, (id, i) => rage(id, i));
    expect(detectRageClicks(input(at))).toHaveLength(1);
  });

  it('counts visits, not bursts: one visitor raging ten times is not a pattern', () => {
    const events = Array.from({ length: 10 }, (_, i) => rage('same-visit', i));
    expect(detectRageClicks(input(events))).toEqual([]);
  });

  it('groups by page template and element, so ids in the URL do not split an issue', () => {
    const events = [
      rage('a', 1, '/orders/1001', 'button.pay'),
      rage('b', 2, '/orders/2002', 'button.pay'),
      rage('c', 3, '/orders/3003/', 'button.pay'),
      rage('d', 4, '/orders/4004', 'button.cancel'),
    ];
    const [finding, ...rest] = detectRageClicks(input(events));
    expect(rest).toEqual([]);
    expect(finding!.evidence).toMatchObject({ path: '/orders/*', selector: 'button.pay', visits: 3 });
    expect(finding!.fingerprint).toBe(fingerprintOf('rage_click', '/orders/*', 'button.pay'));
  });

  it('builds evidence and impact from the affected visits', () => {
    const visits = new Map<string, VisitFacts>([
      ['a', { device: 'mobile', browser: 'Chrome', os: 'Android', exitPath: '/products' }],
      ['b', { device: 'mobile', browser: 'Chrome', os: 'Android', exitPath: '/products/' }],
      ['c', { device: 'mobile', browser: 'Chrome', os: 'Android', exitPath: '/thanks' }],
      ['d', { device: 'desktop', browser: 'Firefox', os: 'Windows', exitPath: null }],
    ]);
    const events = [
      rage('a', 5, '/products', 'button.buy', 6),
      rage('b', 1),
      rage('c', 3),
      rage('d', 2),
      rage('a', 9, '/products', 'button.buy', 3),
    ];
    const [f] = detectRageClicks(input(events, visits));
    expect(f).toMatchObject({
      kind: 'rage_click',
      severity: 'watch',
      firstSeen: at(1),
      lastSeen: at(9),
      evidence: {
        path: '/products',
        selector: 'button.buy',
        windowHours: 24,
        visits: 4,
        occurrences: 5,
        clicks: 6 + 4 + 4 + 4 + 3,
        maxBurst: 6,
        leftOnPage: 2,
        devices: { desktop: 1, mobile: 3, tablet: 0 },
        topBrowser: { browser: 'Chrome', os: 'Android', visits: 3 },
        // most recent first
        sampleVisitIds: ['a', 'c', 'd', 'b'],
      },
      impact: { visitsPerDay: 4, leftPerDay: 2 },
    });
  });

  it('only names a browser when it clearly dominates', () => {
    const visits = new Map<string, VisitFacts>([
      ['a', { device: 'mobile', browser: 'Chrome', os: 'Android', exitPath: null }],
      ['b', { device: 'mobile', browser: 'Safari', os: 'iOS', exitPath: null }],
      ['c', { device: 'desktop', browser: 'Edge', os: 'Windows', exitPath: null }],
    ]);
    const [f] = detectRageClicks(input([rage('a', 1), rage('b', 2), rage('c', 3)], visits));
    expect(f!.evidence.topBrowser).toBeNull();
  });

  it(`keeps at most ${MAX_SAMPLE_VISITS} sample visits`, () => {
    const [f] = detectRageClicks(input(many(12, (id, i) => rage(id, i))));
    expect(f!.evidence.sampleVisitIds).toEqual(['v11', 'v10', 'v9', 'v8', 'v7']);
  });

  it(`turns critical at ${RAGE_CLICK_CRITICAL_VISITS} visits, or ${MONEY_PATH_CRITICAL_VISITS} on money pages`, () => {
    const sev = (n: number, path: string) =>
      detectRageClicks(input(many(n, (id, i) => rage(id, i, path))))[0]!.severity;
    expect(sev(RAGE_CLICK_CRITICAL_VISITS - 1, '/products')).toBe('watch');
    expect(sev(RAGE_CLICK_CRITICAL_VISITS, '/products')).toBe('critical');
    expect(sev(MONEY_PATH_CRITICAL_VISITS - 1, '/checkout')).toBe('watch');
    expect(sev(MONEY_PATH_CRITICAL_VISITS, '/checkout')).toBe('critical');
    expect(sev(MONEY_PATH_CRITICAL_VISITS, '/shop/cart/')).toBe('critical');
    expect(sev(MONEY_PATH_CRITICAL_VISITS, '/carts-and-wagons')).toBe('watch');
  });

  it('ignores malformed events instead of throwing', () => {
    const events: DetectorEvent[] = [
      { visitId: 'a', at: at(1), type: 'rc', path: null, props: { s: 'b', n: 3 } },
      { visitId: 'b', at: at(1), type: 'rc', path: '/x', props: {} },
      { visitId: 'c', at: at(1), type: 'rc', path: '/x', props: { s: '   ' } },
      { visitId: 'd', at: at(1), type: 'pv', path: '/x', props: { s: 'b' } },
    ];
    expect(detectRageClicks(input(events))).toEqual([]);
  });
});

describe('dead clicks', () => {
  it(`needs ${DEAD_CLICK_MIN_VISITS} visits and turns critical at ${DEAD_CLICK_CRITICAL_VISITS}`, () => {
    const run = (n: number, path = '/menu') => detectDeadClicks(input(many(n, (id, i) => dead(id, i, path))));
    expect(run(DEAD_CLICK_MIN_VISITS - 1)).toEqual([]);
    expect(run(DEAD_CLICK_MIN_VISITS)[0]!.severity).toBe('watch');
    expect(run(DEAD_CLICK_CRITICAL_VISITS - 1)[0]!.severity).toBe('watch');
    expect(run(DEAD_CLICK_CRITICAL_VISITS)[0]!.severity).toBe('critical');
    // Money pages: critical as soon as it's an issue at all (never below the detector minimum).
    expect(run(DEAD_CLICK_MIN_VISITS, '/book')[0]!.severity).toBe('critical');
  });

  it('has no click counts in its evidence', () => {
    const [f] = detectDeadClicks(input(many(DEAD_CLICK_MIN_VISITS, (id, i) => dead(id, i))));
    expect(f!.kind).toBe('dead_click');
    expect(f!.evidence).not.toHaveProperty('clicks');
    expect(f!.evidence).not.toHaveProperty('maxBurst');
  });
});

describe('cooldown after a fix', () => {
  it('ignores occurrences before the cutoff for that fingerprint only', () => {
    const fp = fingerprintOf('rage_click', '/products', 'button.buy');
    const events = [...many(5, (id, i) => rage(id, i)), rage('late1', 100), rage('late2', 101)];
    const cut = { ...input(events), ignoreBefore: new Map([[fp, at(50)]]) };
    expect(detectRageClicks(cut)).toEqual([]); // only 2 visits after the cutoff
    const third = { ...cut, events: [...events, rage('late3', 102)] };
    const [f] = detectRageClicks(third);
    expect(f!.evidence.visits).toBe(3);
    expect(f!.firstSeen).toEqual(at(100));
  });
});

describe('runDetectors', () => {
  it('runs every detector and puts critical findings first', () => {
    const events = [
      ...many(DEAD_CLICK_MIN_VISITS, (id, i) => dead(id, i)),
      ...many(MONEY_PATH_CRITICAL_VISITS, (id, i) => rage(id, i, '/checkout', 'button.pay')),
    ];
    const findings = runDetectors(input(events));
    expect(findings.map((f) => [f.kind, f.severity])).toEqual([
      ['rage_click', 'critical'],
      ['dead_click', 'watch'],
    ]);
  });
  it('is deterministic for the same input', () => {
    const events = many(8, (id, i) => rage(id, i));
    expect(runDetectors(input(events))).toEqual(runDetectors(input([...events].reverse())));
  });
});

describe('planUpsert', () => {
  const finding = (over: Partial<Finding> = {}): Finding => ({
    ...detectRageClicks(input(many(4, (id, i) => rage(id, i))))[0]!,
    ...over,
  });
  const fixedAt = at(0);
  const cooldownEnds = at(REGRESSION_COOLDOWN_MINUTES);

  it('creates new issues', () => {
    expect(planUpsert(undefined, finding())).toEqual({ action: 'create' });
  });
  it('refreshes open, in-progress and dismissed issues without changing their status', () => {
    for (const status of ['open', 'fixing', 'dismissed'] as const) {
      expect(
        planUpsert({ status, severity: 'watch', fixedAt: null, verifiedAt: null }, finding()).action,
      ).toBe('refresh');
    }
  });
  it('flags escalation from watch to critical, but not for dismissed issues', () => {
    const critical = finding({ severity: 'critical' });
    expect(
      planUpsert({ status: 'open', severity: 'watch', fixedAt: null, verifiedAt: null }, critical),
    ).toEqual({
      action: 'refresh',
      escalated: true,
    });
    expect(
      planUpsert({ status: 'open', severity: 'critical', fixedAt: null, verifiedAt: null }, critical),
    ).toEqual({ action: 'refresh', escalated: false });
    expect(
      planUpsert({ status: 'dismissed', severity: 'watch', fixedAt: null, verifiedAt: null }, critical),
    ).toEqual({ action: 'refresh', escalated: false });
  });
  it('reopens fixed or verified issues only after the cooldown', () => {
    const fixed = { status: 'fixed' as const, severity: 'watch' as const, fixedAt, verifiedAt: null };
    expect(cooldownCutoff(fixed)).toEqual(cooldownEnds);
    expect(planUpsert(fixed, finding({ lastSeen: new Date(cooldownEnds.getTime() - 1) }))).toEqual({
      action: 'skip',
    });
    expect(planUpsert(fixed, finding({ lastSeen: cooldownEnds }))).toEqual({ action: 'reopen' });
    const verified = { ...fixed, status: 'verified' as const, verifiedAt: at(60 * 24 * 3) };
    expect(planUpsert(verified, finding({ lastSeen: at(60 * 24 * 4) }))).toEqual({ action: 'reopen' });
  });
  it('has no cutoff for issues that are not fixed', () => {
    expect(cooldownCutoff({ status: 'open', severity: 'watch', fixedAt, verifiedAt: null })).toBeUndefined();
  });
});
