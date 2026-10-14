import { describe, expect, it } from 'vitest';
import {
  FORM_ABANDON_CRITICAL_VISITS,
  FORM_ABANDON_GRACE_MINUTES,
  FORM_ABANDON_MIN_RATE,
  FORM_ABANDON_MIN_VISITS,
  JS_ERROR_CRITICAL_VISITS,
  JS_ERROR_MIN_VISITS,
  MONEY_PATH_CRITICAL_VISITS,
  SLOW_INP_POOR_MS,
  SLOW_LCP_CRITICAL_MS,
  SLOW_LCP_POOR_MS,
  SLOW_NETWORK_MIN_VISITS,
  SLOW_PAGE_MIN_VISITS,
  TRACKING_CRITICAL_DAILY_VISITS,
  TRACKING_MIN_DAILY_VISITS,
  TRACKING_SILENT_MIN_HOURS,
  U_TURN_CRITICAL_VISITS,
  U_TURN_MAX_SECONDS,
  U_TURN_MIN_RATE,
  U_TURN_MIN_VISITS,
  VERIFY_MIN_EXPOSED,
  VERIFY_MIN_SPEED_SAMPLES,
  detectFormAbandonment,
  detectJsErrors,
  detectSlowPages,
  detectTrackingBroken,
  detectUTurns,
  judgeVerification,
  measureIssue,
  normalizeErrorMessage,
  normalizeErrorSource,
  runDetectors,
  silenceLimitHours,
  trackingResumed,
  verificationWindows,
  type DetectorEvent,
  type DetectorInput,
  type VisitFacts,
} from './index';

const T0 = new Date('2026-10-12T08:00:00Z');
const at = (min: number) => new Date(T0.getTime() + min * 60_000);
const sec = (s: number) => new Date(T0.getTime() + s * 1000);
const NOW = at(24 * 60);

const ev = (visitId: string, when: Date, type: string, path: string, props: Record<string, unknown> = {}) =>
  ({ visitId, at: when, type, path, props }) satisfies DetectorEvent;
const input = (
  events: DetectorEvent[],
  visits = new Map<string, VisitFacts>(),
  now: Date | undefined = NOW,
): DetectorInput => ({ events, visits, windowHours: 24, now });
const ids = (n: number, prefix = 'v') => Array.from({ length: n }, (_, i) => `${prefix}${i}`);
const facts = (over: Partial<VisitFacts> = {}): VisitFacts => ({
  device: 'mobile',
  browser: 'Chrome',
  os: 'Android',
  exitPath: null,
  ...over,
});

/* ── Form abandonment ──────────────────────────────────────────────────────── */
describe('form abandonment', () => {
  /** `abandon` visits start and leave, `submit` visits start and submit. */
  const forms = (abandon: number, submit: number, path = '/contact', form = 'lead') => [
    ...ids(abandon, 'a').map((id, i) => ev(id, at(i), 'fs', path, { f: form })),
    ...ids(submit, 's').flatMap((id, i) => [
      ev(id, at(i), 'fs', path, { f: form }),
      ev(id, at(i + 1), 'fx', path, { f: form }),
    ]),
  ];

  it(`needs ${FORM_ABANDON_MIN_VISITS} abandoned visits`, () => {
    expect(detectFormAbandonment(input(forms(FORM_ABANDON_MIN_VISITS - 1, 0)))).toEqual([]);
    const [f] = detectFormAbandonment(input(forms(FORM_ABANDON_MIN_VISITS, 0)));
    expect(f).toMatchObject({
      kind: 'form_abandon',
      severity: 'watch',
      evidence: {
        type: 'form',
        path: '/contact',
        form: 'lead',
        visits: 5,
        starts: 5,
        submits: 0,
        abandonRate: 1,
      },
    });
  });

  it(`needs an abandon rate of at least ${FORM_ABANDON_MIN_RATE * 100}%`, () => {
    // 10 abandoned of 25 started = exactly the minimum rate.
    const atRate = detectFormAbandonment(input(forms(10, 15)));
    expect(atRate[0]!.evidence.abandonRate).toBe(FORM_ABANDON_MIN_RATE);
    // 10 of 26 is just under it.
    expect(detectFormAbandonment(input(forms(10, 16)))).toEqual([]);
  });

  it(`turns critical at ${FORM_ABANDON_CRITICAL_VISITS} visits, or ${MONEY_PATH_CRITICAL_VISITS} on money pages`, () => {
    const sev = (n: number, path: string) => detectFormAbandonment(input(forms(n, 0, path)))[0]!.severity;
    expect(sev(FORM_ABANDON_CRITICAL_VISITS - 1, '/contact')).toBe('watch');
    expect(sev(FORM_ABANDON_CRITICAL_VISITS, '/contact')).toBe('critical');
    expect(sev(FORM_ABANDON_MIN_VISITS, '/checkout')).toBe('critical');
  });

  it(`gives visits still on the site ${FORM_ABANDON_GRACE_MINUTES} minutes before counting them`, () => {
    const events = ids(5).map((id) => ev(id, at(0), 'fs', '/contact', { f: 'lead' }));
    const justNow = at(FORM_ABANDON_GRACE_MINUTES - 1);
    expect(detectFormAbandonment(input(events, new Map(), justNow))).toEqual([]);
    expect(detectFormAbandonment(input(events, new Map(), at(FORM_ABANDON_GRACE_MINUTES)))).toHaveLength(1);
    // Ended visits count straight away.
    const ended = new Map(ids(5).map((id) => [id, facts({ endedAt: at(1) })]));
    expect(detectFormAbandonment(input(events, ended, justNow))).toHaveLength(1);
  });

  it('reports the fields that showed errors to the visitors who left', () => {
    const events = [
      ...forms(6, 0),
      ...ids(4, 'a').map((id) =>
        ev(id, at(2), 'fe', '/contact', { f: 'lead', n: 'phone', m: 'Invalid number' }),
      ),
      ev('a5', at(2), 'fe', '/contact', { f: 'lead', n: 'email' }),
    ];
    const [f] = detectFormAbandonment(input(events));
    expect(f!.evidence.errorFields).toEqual([
      { field: 'phone', visits: 4, message: 'Invalid number' },
      { field: 'email', visits: 1, message: null },
    ]);
  });

  it('groups by page template and form, and ignores malformed events', () => {
    const events = [
      ...ids(5).map((id) => ev(id, at(0), 'fs', `/orders/${id === 'v0' ? 1001 : 2002}`, { f: 'pay' })),
      ev('x', at(0), 'fs', '/contact', {}),
      ev('y', at(0), 'fs', 'not-a-path', { f: 'lead' }),
    ];
    const findings = detectFormAbandonment(input(events));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.evidence.path).toBe('/orders/*');
  });
});

/* ── Slow pages ────────────────────────────────────────────────────────────── */
describe('slow pages', () => {
  const lcp = (n: number, value: number, path = '/products', prefix = 'v') =>
    ids(n, prefix).map((id, i) => ev(id, at(i), 'vt', path, { n: 'LCP', v: value }));

  it(`needs ${SLOW_PAGE_MIN_VISITS} measured visits`, () => {
    expect(detectSlowPages(input(lcp(SLOW_PAGE_MIN_VISITS - 1, 9000)))).toEqual([]);
    expect(detectSlowPages(input(lcp(SLOW_PAGE_MIN_VISITS, 9000)))).toHaveLength(1);
  });

  it(`flags a p75 at the poor line (${SLOW_LCP_POOR_MS} ms LCP), not below it`, () => {
    expect(detectSlowPages(input(lcp(12, SLOW_LCP_POOR_MS - 1)))).toEqual([]);
    const [f] = detectSlowPages(input(lcp(12, SLOW_LCP_POOR_MS)));
    expect(f).toMatchObject({
      kind: 'slow_page',
      severity: 'watch',
      evidence: {
        metric: 'LCP',
        p75: SLOW_LCP_POOR_MS,
        threshold: SLOW_LCP_POOR_MS,
        measured: 12,
        visits: 12,
      },
    });
  });

  it('uses the 75th percentile, not the average', () => {
    // 8 fast + 4 slow: the p75 is the 9th of 12 values, which is slow.
    const events = [...lcp(8, 1000), ...lcp(4, 6000, '/products', 's')];
    expect(detectSlowPages(input(events))[0]!.evidence.p75).toBe(6000);
    // 9 fast + 3 slow: rank 9 is fast.
    const fine = [...lcp(9, 1000), ...lcp(3, 6000, '/products', 's')];
    expect(detectSlowPages(input(fine))).toEqual([]);
  });

  it(`turns critical at ${SLOW_LCP_CRITICAL_MS} ms, or on money pages`, () => {
    expect(detectSlowPages(input(lcp(12, SLOW_LCP_CRITICAL_MS - 1)))[0]!.severity).toBe('watch');
    expect(detectSlowPages(input(lcp(12, SLOW_LCP_CRITICAL_MS)))[0]!.severity).toBe('critical');
    expect(detectSlowPages(input(lcp(12, SLOW_LCP_POOR_MS, '/checkout')))[0]!.severity).toBe('critical');
  });

  it('flags a page that is only slow on one network with enough visits', () => {
    const visits = new Map<string, VisitFacts>();
    const events = [
      ...lcp(20, 1500, '/products', 'f'),
      ...lcp(SLOW_NETWORK_MIN_VISITS, 7000, '/products', 's'),
    ];
    ids(20, 'f').forEach((id) => visits.set(id, facts({ network: '4g' })));
    ids(SLOW_NETWORK_MIN_VISITS, 's').forEach((id) => visits.set(id, facts({ network: '3g' })));
    const [f] = detectSlowPages(input(events, visits));
    expect(f!.evidence.p75).toBe(1500);
    expect(f!.evidence.networks).toEqual([
      { network: '3g', visits: SLOW_NETWORK_MIN_VISITS, p75: 7000 },
      { network: '4g', visits: 20, p75: 1500 },
    ]);
    expect(f!.evidence.visits).toBe(SLOW_NETWORK_MIN_VISITS);
    // One fewer slow visit on 3G: too few to judge that network, and the overall p75 is fine.
    ids(SLOW_NETWORK_MIN_VISITS, 's').forEach((id) => visits.set(id, facts({ network: '3g' })));
    const fewer = [
      ...lcp(20, 1500, '/products', 'f'),
      ...lcp(SLOW_NETWORK_MIN_VISITS - 1, 7000, '/products', 's'),
    ];
    expect(detectSlowPages(input(fewer, visits))).toEqual([]);
  });

  it(`judges INP against ${SLOW_INP_POOR_MS} ms and keeps each visit's worst value`, () => {
    const events = ids(10).flatMap((id, i) => [
      ev(id, at(i), 'vt', '/menu', { n: 'INP', v: 100 }),
      ev(id, at(i + 1), 'vt', '/menu', { n: 'INP', v: SLOW_INP_POOR_MS }),
      ev(id, at(i), 'vt', '/menu', { n: 'CLS', v: 0.9 }),
    ]);
    const findings = detectSlowPages(input(events));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.evidence).toMatchObject({ metric: 'INP', p75: SLOW_INP_POOR_MS, measured: 10 });
  });
});

/* ── JS errors ─────────────────────────────────────────────────────────────── */
describe('JS errors', () => {
  const err = (
    n: number,
    m = "Cannot read properties of undefined (reading 'price')",
    path = '/products',
    src = 'https://shop.et/app.js?v=12',
  ) => ids(n).map((id, i) => ev(id, at(i), 'er', path, { m, src, l: 120 }));

  it('normalizes messages and sources so one bug groups together', () => {
    expect(normalizeErrorMessage('Item 88123 failed at https://x.et/a?b=1  now')).toBe(
      'Item * failed at <url> now',
    );
    expect(normalizeErrorMessage('id 3f2b9c1e-8a6d-4c2e-9b1a-1234567890ab')).toBe('id *');
    expect(normalizeErrorSource('https://shop.et/app.js?v=12#x')).toBe('https://shop.et/app.js');
    expect(normalizeErrorSource('')).toBeNull();
  });

  it(`needs ${JS_ERROR_MIN_VISITS} visits and turns critical at ${JS_ERROR_CRITICAL_VISITS}`, () => {
    expect(detectJsErrors(input(err(JS_ERROR_MIN_VISITS - 1)))).toEqual([]);
    const [f] = detectJsErrors(input(err(JS_ERROR_MIN_VISITS)));
    expect(f).toMatchObject({
      kind: 'js_error',
      severity: 'watch',
      evidence: {
        type: 'js_error',
        path: '/products',
        source: 'https://shop.et/app.js',
        line: 120,
        visits: JS_ERROR_MIN_VISITS,
        occurrences: JS_ERROR_MIN_VISITS,
        pages: [{ path: '/products', visits: JS_ERROR_MIN_VISITS }],
      },
    });
    expect(detectJsErrors(input(err(JS_ERROR_CRITICAL_VISITS - 1)))[0]!.severity).toBe('watch');
    expect(detectJsErrors(input(err(JS_ERROR_CRITICAL_VISITS)))[0]!.severity).toBe('critical');
    expect(detectJsErrors(input(err(JS_ERROR_MIN_VISITS, 'x is not defined', '/pay')))[0]!.severity).toBe(
      'critical',
    );
  });

  it('is one issue across pages, and ignores noise like "Script error."', () => {
    const events = [
      ...ids(3).map((id) => ev(id, at(0), 'er', '/a', { m: 'boom 1234' })),
      ...ids(3, 'w').map((id) => ev(id, at(1), 'er', '/b', { m: 'boom 9999' })),
      ...ids(9, 'n').map((id) => ev(id, at(1), 'er', '/b', { m: 'Script error.' })),
    ];
    const findings = detectJsErrors(input(events));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.evidence).toMatchObject({ message: 'boom *', visits: 6, source: null });
    expect(findings[0]!.evidence.pages.map((p) => p.path).sort()).toEqual(['/a', '/b']);
  });
});

/* ── U-turns ───────────────────────────────────────────────────────────────── */
describe('U-turns', () => {
  /** Visit goes /products → page → back to /products after `back` seconds. */
  const turn = (id: string, back: number, page = '/delivery') => [
    ev(id, sec(0), 'pv', '/products'),
    ev(id, sec(10), 'pv', page),
    ev(id, sec(10 + back), 'pv', '/products'),
  ];
  const stay = (id: string, page = '/delivery') => [
    ev(id, sec(0), 'pv', '/products'),
    ev(id, sec(10), 'pv', page),
  ];

  it(`counts going back within ${U_TURN_MAX_SECONDS} seconds`, () => {
    const within = ids(U_TURN_MIN_VISITS).flatMap((id) => turn(id, U_TURN_MAX_SECONDS));
    const [f] = detectUTurns(input(within));
    expect(f).toMatchObject({
      kind: 'u_turn',
      severity: 'watch',
      evidence: {
        type: 'u_turn',
        path: '/delivery',
        visits: U_TURN_MIN_VISITS,
        uTurns: U_TURN_MIN_VISITS,
        reached: U_TURN_MIN_VISITS,
        rate: 1,
        medianSeconds: U_TURN_MAX_SECONDS,
        from: [{ path: '/products', visits: U_TURN_MIN_VISITS }],
      },
    });
    const slower = ids(U_TURN_MIN_VISITS).flatMap((id) => turn(id, U_TURN_MAX_SECONDS + 1));
    expect(detectUTurns(input(slower))).toEqual([]);
  });

  it(`needs ${U_TURN_MIN_VISITS} visits and a rate of ${U_TURN_MIN_RATE * 100}%`, () => {
    expect(detectUTurns(input(ids(U_TURN_MIN_VISITS - 1).flatMap((id) => turn(id, 3))))).toEqual([]);
    // 5 of 20 reached = exactly the minimum rate; 5 of 21 is under it.
    const ok = [...ids(5).flatMap((id) => turn(id, 3)), ...ids(15, 's').flatMap((id) => stay(id))];
    expect(detectUTurns(input(ok))[0]!.evidence.rate).toBe(U_TURN_MIN_RATE);
    const under = [...ids(5).flatMap((id) => turn(id, 3)), ...ids(16, 's').flatMap((id) => stay(id))];
    expect(detectUTurns(input(under))).toEqual([]);
  });

  it(`turns critical at ${U_TURN_CRITICAL_VISITS} visits, or on money pages`, () => {
    const sev = (n: number, page: string) =>
      detectUTurns(input(ids(n).flatMap((id) => turn(id, 3, page))))[0]!.severity;
    expect(sev(U_TURN_CRITICAL_VISITS - 1, '/delivery')).toBe('watch');
    expect(sev(U_TURN_CRITICAL_VISITS, '/delivery')).toBe('critical');
    expect(sev(U_TURN_MIN_VISITS, '/cart')).toBe('critical');
  });

  it('collapses reloads and ignores A → B → C', () => {
    const reload = ids(5).flatMap((id) => [
      ev(id, sec(0), 'pv', '/products'),
      ev(id, sec(1), 'pv', '/products'),
      ev(id, sec(5), 'pv', '/delivery'),
      ev(id, sec(6), 'pv', '/delivery'),
      ev(id, sec(8), 'pv', '/products'),
    ]);
    expect(detectUTurns(input(reload))).toHaveLength(1);
    const onward = ids(5).flatMap((id) => [
      ev(id, sec(0), 'pv', '/products'),
      ev(id, sec(5), 'pv', '/delivery'),
      ev(id, sec(8), 'pv', '/checkout'),
    ]);
    expect(detectUTurns(input(onward))).toEqual([]);
  });
});

/* ── Tracking broken ───────────────────────────────────────────────────────── */
describe('tracking broken', () => {
  const run = (silentHours: number, baselineVisits: number) =>
    detectTrackingBroken({
      now: NOW,
      lastEventAt: new Date(NOW.getTime() - silentHours * 3600_000),
      baselineVisits,
    });

  it(`ignores sites under ${TRACKING_MIN_DAILY_VISITS} visits a day, and sites that never sent data`, () => {
    expect(run(100, TRACKING_MIN_DAILY_VISITS * 7 - 1)).toBeNull();
    expect(run(100, TRACKING_MIN_DAILY_VISITS * 7)).not.toBeNull();
    expect(detectTrackingBroken({ now: NOW, lastEventAt: null, baselineVisits: 1000 })).toBeNull();
  });

  it(`waits at least ${TRACKING_SILENT_MIN_HOURS} hours, longer for quiet sites`, () => {
    expect(silenceLimitHours(1000)).toBe(TRACKING_SILENT_MIN_HOURS);
    expect(silenceLimitHours(TRACKING_MIN_DAILY_VISITS)).toBeCloseTo((8 * 24) / TRACKING_MIN_DAILY_VISITS);
    expect(run(TRACKING_SILENT_MIN_HOURS - 0.1, 7000)).toBeNull();
    expect(run(TRACKING_SILENT_MIN_HOURS, 7000)).not.toBeNull();
    // 5 visits/day: one every ~4.8 h, so 30 h of silence isn't alarming yet; 38.4 h is.
    expect(run(30, 35)).toBeNull();
    expect(run(38.4, 35)).not.toBeNull();
  });

  it(`is critical from ${TRACKING_CRITICAL_DAILY_VISITS} visits a day`, () => {
    expect(run(48, TRACKING_CRITICAL_DAILY_VISITS * 7 - 1)!.severity).toBe('watch');
    const f = run(48, TRACKING_CRITICAL_DAILY_VISITS * 7)!;
    expect(f).toMatchObject({
      kind: 'tracking_broken',
      severity: 'critical',
      evidence: { type: 'tracking', silentHours: 48, typicalDailyVisits: TRACKING_CRITICAL_DAILY_VISITS },
      impact: null,
    });
  });

  it('knows when data came back', () => {
    expect(trackingResumed(at(10), at(11))).toBe(true);
    expect(trackingResumed(at(10), at(10))).toBe(false);
    expect(trackingResumed(at(10), null)).toBe(false);
  });
});

describe('runDetectors', () => {
  it('runs every activity detector and orders critical first', () => {
    const events = [
      ...ids(5).map((id, i) => ev(id, at(i), 'er', '/blog', { m: 'oops' })),
      ...ids(5, 'c').map((id, i) => ev(id, at(i), 'fs', '/checkout', { f: 'pay' })),
    ];
    expect(runDetectors(input(events)).map((f) => [f.kind, f.severity])).toEqual([
      ['form_abandon', 'critical'],
      ['js_error', 'watch'],
    ]);
  });
});

/* ── Verification ──────────────────────────────────────────────────────────── */
describe('verification', () => {
  const fixedAt = new Date('2026-10-01T12:00:00Z');
  const day = 86_400_000;

  it('compares the 7 days before with days 3–7 after; tracking with the next 24 h', () => {
    const w = verificationWindows('rage_click', fixedAt);
    expect(w.before).toEqual({ start: new Date(fixedAt.getTime() - 7 * day), end: fixedAt });
    expect(w.after).toEqual({
      start: new Date(fixedAt.getTime() + 3 * day),
      end: new Date(fixedAt.getTime() + 7 * day),
    });
    expect(w.dueAt).toEqual(w.after.end);
    expect(w.giveUpAt).toEqual(new Date(fixedAt.getTime() + 28 * day));
    const t = verificationWindows('tracking_broken', fixedAt);
    expect(t.after).toEqual({ start: fixedAt, end: new Date(fixedAt.getTime() + day) });
  });

  const click = {
    type: 'click' as const,
    path: '/checkout',
    selector: 'button.pay',
    windowHours: 24,
    visits: 5,
    occurrences: 5,
    leftOnPage: 0,
    devices: { desktop: 0, mobile: 5, tablet: 0 },
    topBrowser: null,
    sampleVisitIds: [],
  };

  it('measures exposed and affected visits the way the detector grouped them', () => {
    const events = [
      ...ids(10).map((id) => ev(id, at(0), 'pv', '/checkout')),
      ...ids(3).map((id) => ev(id, at(1), 'rc', '/checkout', { s: 'button.pay', n: 4 })),
      ev('v1', at(2), 'rc', '/checkout', { s: 'button.other', n: 4 }),
      ev('x', at(2), 'rc', '/checkout/', { s: 'button.pay', n: 3 }), // no pageview seen, still exposed
    ];
    expect(measureIssue('rage_click', click, input(events))).toEqual({
      affected: 4,
      exposed: 11,
      value: 0.3636,
    });
    expect(measureIssue('dead_click', click, input(events))).toEqual({ affected: 0, exposed: 10, value: 0 });
  });

  const m = (affected: number, exposed: number) => ({
    affected,
    exposed,
    value: exposed ? affected / exposed : null,
  });

  it(`waits for ${VERIFY_MIN_EXPOSED} exposed visits after the fix`, () => {
    expect(judgeVerification(click, m(20, 100), m(0, VERIFY_MIN_EXPOSED - 1))).toBe('waiting');
    expect(judgeVerification(click, m(20, 100), m(0, VERIFY_MIN_EXPOSED))).toBe('verified');
  });

  it('verifies when the rate at least halved, reopens otherwise', () => {
    expect(judgeVerification(click, m(20, 100), m(10, 100))).toBe('verified');
    expect(judgeVerification(click, m(20, 100), m(11, 100))).toBe('reopened');
    // Nothing measured before (data gap) but it still happens after: not verified.
    expect(judgeVerification(click, m(0, 0), m(5, 100))).toBe('reopened');
  });

  it('judges slow pages on the poor line', () => {
    const slow = {
      type: 'slow_page' as const,
      path: '/',
      metric: 'LCP' as const,
      measured: 20,
      p75: 6000,
      threshold: SLOW_LCP_POOR_MS,
      networks: [],
      windowHours: 24,
      visits: 20,
      leftOnPage: 0,
      devices: { desktop: 0, mobile: 0, tablet: 0 },
      topBrowser: null,
      sampleVisitIds: [],
    };
    const p = (value: number, exposed = 20) => ({ affected: 0, exposed, value });
    expect(judgeVerification(slow, p(6000), p(SLOW_LCP_POOR_MS - 1))).toBe('verified');
    expect(judgeVerification(slow, p(6000), p(SLOW_LCP_POOR_MS))).toBe('reopened');
    expect(judgeVerification(slow, p(6000), p(1000, VERIFY_MIN_SPEED_SAMPLES - 1))).toBe('waiting');
  });

  it('verifies tracking once data keeps flowing', () => {
    const tracking = {
      type: 'tracking' as const,
      lastEventAt: null,
      silentHours: 10,
      typicalDailyVisits: 50,
    };
    expect(judgeVerification(tracking, m(0, 0), { affected: 0, exposed: 3, value: 3 })).toBe('verified');
    expect(judgeVerification(tracking, m(0, 0), { affected: 0, exposed: 0, value: 0 })).toBe('reopened');
  });
});
