import type { FixEvidence, FixKind } from '@pulse/contracts';
import type { IngestEvent, IngestJob } from '@pulse/contracts/ingest';
import { createDatabase, withOrg } from '@pulse/db';
import { U_TURN_MAX_SECONDS } from '@pulse/detectors';
import {
  backfillCandidates,
  backfillRollups,
  measureFixWindow,
  purgeOrgData,
  rollupReportSource,
  runRetention,
  verifyDayWindows,
} from '@pulse/insights/db';
import { buildReportSnapshot, rawEventsSource, type ReportMetricsSource } from '@pulse/reports';
import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { applyIngest } from '../src/ingest';
import { verifyIssue } from '../src/verify';

/**
 * Task 14: rollup backfill, reports and verification on rollups (with raw fallbacks), and
 * retention — all against Postgres, through the real ingest path.
 */

const user = process.env.USER ?? 'postgres';
const APP_DB =
  process.env.TEST_DATABASE_URL ?? 'postgres://pulse_app:pulse_app_dev@localhost:5432/pulse_test';
const ADMIN_DB = process.env.TEST_DATABASE_ADMIN_URL ?? `postgres://${user}@localhost:5432/pulse_test`;
const database = createDatabase(APP_DB, { max: 3 });
afterAll(() => database.close());

async function admin(text: string, values: unknown[] = []) {
  const c = new pg.Client({ connectionString: ADMIN_DB });
  await c.connect();
  try {
    return await c.query(text, values);
  } finally {
    await c.end();
  }
}

const ANDROID =
  'Mozilla/5.0 (Linux; Android 13; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36';
const DESKTOP =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const SEC = 1000;
const DAY = 86_400_000;
const at = (iso: string) => new Date(iso);

/** Fixes ship mid-day, so report windows have partial days at both ends. */
const FIXED_AT = at('2026-09-10T12:00:00Z');
/** Report "now": October 2nd, so September is complete and settled. */
const NOW = at('2026-10-02T12:00:00Z');

const A = { siteId: 'site_a', orgId: 'org_a', k: 'pk_a' };
const B = { siteId: 'site_b', orgId: 'org_b', k: 'pk_b' };

beforeEach(async () => {
  await admin(
    `truncate rollup_funnel_day, rollup_vitals_day, rollup_page_day, rollup_site_day, site_funnels, reports,
      issue_events, issues, events, ingest_dedupe, visits, audit_log, sites, org_plans, invitation, member,
      organization, verification, account, session, "user" cascade`,
  );
  await admin(
    `insert into organization (id, name, slug) values ('org_a','Org A','org-a'), ('org_b','Org B','org-b')`,
  );
  await admin(`insert into org_plans (org_id, plan) values ('org_a','free'), ('org_b','business')`);
  await admin(`insert into sites (id, org_id, name, domain, public_key, allowed_origins, status) values
    ('site_a','org_a','Shop A','shop-a.et','pk_a','{https://shop-a.et}','live'),
    ('site_b','org_b','Shop B','shop-b.et','pk_b','{https://shop-b.et}','live')`);
});

let seq = 0;
/** One visit's batch through the real ingest path, received at `when`. */
async function visit(visitId: string, when: Date, ev: IngestEvent[], site = A, ua = ANDROID) {
  const job: IngestJob = {
    siteId: site.siteId,
    orgId: site.orgId,
    receivedAt: when.toISOString(),
    userAgent: ua,
    batch: {
      v: 3,
      k: site.k,
      vid: visitId,
      seq: seq++,
      sv: '3.0.0',
      ctx: { vw: ua === DESKTOP ? 1440 : 390, vh: 844, plat: 'web' },
      ev,
    },
  };
  expect((await applyIngest(database.db, job)).status).toBe('applied');
}
/** Visits that went idle long ago are closed (and their bounce decided), as in production. */
const closeVisits = () => admin(`select pulse_close_idle_visits(30)`);

const pv = (p: string, ts: number): IngestEvent => ({ t: 'pv', ts, p });

/**
 * A month of traffic on `site`: 6 visits a day from Aug 28 to Sep 20 (none crossing midnight).
 * Before the fix (Sep 10, noon) some visitors U-turn on /pricing, rage-tap the pay button, hit an
 * error, give up on the lead form and get slow pages; after it, nobody does.
 */
async function seedMonth(site = A) {
  const start = Date.parse('2026-08-28T00:00:00Z');
  for (let d = 0; d < 24; d++) {
    for (let i = 0; i < 6; i++) {
      const t = start + d * DAY + (8 + i) * 3600 * SEC;
      const broken = t < FIXED_AT.getTime();
      const ev: IngestEvent[] = [pv('/', t), pv('/pricing', t + 5 * SEC)];
      ev.push(pv(broken && i % 3 === 0 ? '/' : '/contact', t + 9 * SEC));
      ev.push({ t: 'fs', ts: t + 10 * SEC, p: '/contact', f: 'lead' });
      if (!broken || i % 2 === 0) ev.push({ t: 'fx', ts: t + 20 * SEC, p: '/contact', f: 'lead' });
      ev.push(pv('/checkout', t + 30 * SEC));
      if (broken && i % 2 === 1)
        ev.push({ t: 'rc', ts: t + 31 * SEC, p: '/checkout', s: 'button.pay', n: 4 });
      if (broken && i % 3 === 1) ev.push({ t: 'er', ts: t + 32 * SEC, p: '/checkout', m: 'x is undefined' });
      ev.push({
        t: 'vt',
        ts: t + 33 * SEC,
        p: '/checkout',
        n: 'LCP',
        v: broken ? 2500 + i * 400 : 1800 + i * 10,
      });
      await visit(
        `${site.siteId}-${String(d).padStart(2, '0')}-${i}`.replace(/_/g, '-'),
        new Date(t),
        ev,
        site,
        i === 5 ? DESKTOP : ANDROID,
      );
    }
  }
  await closeVisits();
}

const common = {
  windowHours: 168,
  visits: 10,
  leftOnPage: 0,
  devices: { desktop: 0, mobile: 10, tablet: 0 },
  topBrowser: null,
  sampleVisitIds: [],
};
const EVIDENCE: Record<Exclude<FixKind, 'dead_click' | 'tracking_broken'>, FixEvidence> = {
  rage_click: { type: 'click', ...common, path: '/checkout', selector: 'button.pay', occurrences: 10 },
  form_abandon: {
    type: 'form',
    ...common,
    path: '/contact',
    form: 'lead',
    starts: 20,
    submits: 10,
    abandonRate: 0.5,
    errorFields: [],
  },
  slow_page: {
    type: 'slow_page',
    ...common,
    path: '/checkout',
    metric: 'LCP',
    measured: 30,
    p75: 4100,
    threshold: 4000,
    networks: [],
  },
  js_error: {
    type: 'js_error',
    ...common,
    path: '/checkout',
    message: 'x is undefined',
    source: null,
    line: null,
    occurrences: 10,
    pages: [],
  },
  u_turn: {
    type: 'u_turn',
    ...common,
    path: '/pricing',
    uTurns: 10,
    reached: 30,
    rate: 0.33,
    medianSeconds: 4,
    from: [],
  },
};
const KINDS = Object.keys(EVIDENCE) as (keyof typeof EVIDENCE)[];

async function seedFixedIssues(site = A, fixedAt = FIXED_AT) {
  let n = 1;
  for (const kind of KINDS) {
    await admin(
      `insert into issues (id, org_id, site_id, number, kind, fingerprint, severity, status, evidence, first_seen, last_seen, fixed_at)
       values ($1, $2, $3, $4, $5, $6, 'critical', 'fixed', $7, $8, $8, $8)`,
      [
        `iss_${kind}`,
        site.orgId,
        site.siteId,
        n++,
        kind,
        `fp_${kind}`,
        JSON.stringify(EVIDENCE[kind]),
        fixedAt,
      ],
    );
  }
}

/** Every rollup row of every table, in a stable order, with when it was computed. */
async function rollupDump() {
  const out: Record<string, unknown[]> = {};
  for (const [table, order] of [
    ['rollup_site_day', 'site_id, day'],
    ['rollup_page_day', 'site_id, day, path'],
    ['rollup_vitals_day', 'site_id, day, metric, device, network, path'],
    ['rollup_funnel_day', 'site_id, day'],
  ] as const)
    out[table] = (await admin(`select *, day::text as day_text from ${table} order by ${order}`)).rows;
  return out;
}

const snapshot = (source: ReportMetricsSource, now = NOW, site = A) =>
  withOrg(database.db, site.orgId, (tx) =>
    buildReportSnapshot(tx, { siteId: site.siteId, period: '2026-09', now }, source),
  );

describe('rollup backfill', () => {
  it('builds every settled day that has raw events, and a second run changes nothing', async () => {
    await seedMonth();
    // A day that hasn't settled yet (Oct 2 at 01:00, before yesterday's 03:00 settle point).
    await visit('site-a-late', at('2026-10-01T22:00:00Z'), [pv('/', Date.parse('2026-10-01T22:00:00Z'))]);
    const first = await backfillRollups(database.db, at('2026-10-02T01:00:00Z'));
    expect(first).toEqual({ days: 24, sites: 1, stuck: 0 });
    const days = (await admin(`select day::text as day from rollup_site_day order by day`)).rows.map(
      (r) => r.day,
    );
    expect(days[0]).toBe('2026-08-28');
    expect(days.at(-1)).toBe('2026-09-20');
    expect(days).not.toContain('2026-10-01');
    expect((await admin(`select distinct version from rollup_site_day`)).rows).toEqual([{ version: 2 }]);

    const before = await rollupDump();
    expect(await backfillCandidates(database.db, at('2026-10-02T01:00:00Z'))).toEqual([]);
    expect(await backfillRollups(database.db, at('2026-10-02T01:00:00Z'))).toEqual({
      days: 0,
      sites: 0,
      stuck: 0,
    });
    expect(await rollupDump()).toEqual(before);

    // Once Oct 1 has settled, only that day is added; everything else is untouched.
    expect(await backfillRollups(database.db, at('2026-10-02T03:00:00Z'))).toEqual({
      days: 1,
      sites: 1,
      stuck: 0,
    });
    const after = await rollupDump();
    expect(
      after.rollup_site_day!.filter((r) => (r as { day_text: string }).day_text !== '2026-10-01'),
    ).toEqual(before.rollup_site_day);
  });

  it('rebuilds missing, stale and old-version days only, and skips deleted sites', async () => {
    await seedMonth();
    await seedMonth(B);
    await backfillRollups(database.db, NOW);
    const full = await rollupDump();
    const strip = (rows: unknown[]) => rows.map((r) => ({ ...(r as object), computed_at: null }));

    const a = `site_id = 'site_a'`;
    await admin(`delete from rollup_page_day where ${a} and day = '2026-09-02'`);
    await admin(`delete from rollup_site_day where ${a} and day = '2026-09-02'`);
    await admin(`update rollup_site_day set version = 1 where ${a} and day = '2026-09-03'`);
    await admin(
      `update rollup_site_day set computed_at = '2026-09-05T01:00:00Z' where ${a} and day = '2026-09-04'`,
    );
    await admin(`update sites set deleted_at = now() where id = 'site_b'`);
    await admin(`delete from rollup_site_day where site_id = 'site_b' and day = '2026-09-05'`);

    const res = await backfillRollups(database.db, NOW);
    // A's missing, old-version and stale days (09-02, 09-03, 09-04); B's site is deleted.
    expect(res).toEqual({ days: 3, sites: 1, stuck: 0 });
    const rebuilt = await rollupDump();
    expect(strip(rebuilt.rollup_page_day!)).toEqual(strip(full.rollup_page_day!));
    expect(strip(rebuilt.rollup_site_day!)).toEqual(
      strip(
        full.rollup_site_day!.filter((r) => {
          const row = r as { site_id: string; day_text: string };
          return !(row.site_id === 'site_b' && row.day_text === '2026-09-05');
        }),
      ),
    );
  });
});

describe('report sources', () => {
  it('give the same report from raw events and from rollups, with or without every day rolled up', async () => {
    await seedMonth();
    await seedFixedIssues();
    const raw = await snapshot(rawEventsSource);
    // Nothing rolled up yet: the rollup source falls back to raw events for every day.
    expect(await snapshot(rollupReportSource)).toEqual(raw);
    await backfillRollups(database.db, NOW);
    expect(await snapshot(rollupReportSource)).toEqual(raw);
    // Half the month rolled up, half not.
    await admin(`delete from rollup_site_day where day between '2026-09-05' and '2026-09-15'`);
    expect(await snapshot(rollupReportSource)).toEqual(raw);

    // Real numbers, not just equal ones: Sep 1–20, 6 visits a day, 5 phones each.
    expect(raw.kpis.visits).toEqual({ value: 120, previous: 24 });
    expect(raw.kpis.lcp.value).not.toBeNull();
    expect(raw.trend.map((t) => t.visits)).toEqual([42, 42, 36, 0, 0]);
    // Task 10's kinds now have a before/after instead of "too early to tell".
    const byKind = Object.fromEntries(raw.fixed.map((f) => [f.kind, f]));
    for (const kind of ['form_abandon', 'slow_page', 'js_error', 'u_turn'] as const) {
      expect(byKind[kind]!.before.perDay, kind).toBeGreaterThan(0);
      expect(byKind[kind]!.after.perDay, kind).toBe(0);
    }
  });

  it('reads rollups, not raw events, for days that have them', async () => {
    await seedMonth();
    await seedFixedIssues();
    await backfillRollups(database.db, NOW);
    const before = await snapshot(rollupReportSource);
    // Raw page views are gone; the rollup source doesn't notice (fix measures use their own events).
    await admin(`delete from events where type = 'pv'`);
    await admin(`delete from visits`);
    const after = await snapshot(rollupReportSource);
    expect(after.kpis).toEqual(before.kpis);
    expect(after.trend).toEqual(before.trend);
    expect((await snapshot(rawEventsSource)).kpis.visits.value).toBe(0);
  });
});

describe('verification on rollups', () => {
  it('measures the same from rollups as from raw events, and needs no raw page views', async () => {
    await seedMonth();
    await seedFixedIssues();
    const w = verifyDayWindows('rage_click', FIXED_AT);
    expect(w.before).toEqual({ start: at('2026-09-03T00:00:00Z'), end: at('2026-09-10T00:00:00Z') });
    expect(w.after).toEqual({ start: at('2026-09-13T00:00:00Z'), end: at('2026-09-17T00:00:00Z') });

    const measureAll = () =>
      withOrg(database.db, 'org_a', async (tx) => {
        const out: Record<string, unknown> = {};
        for (const kind of KINDS)
          for (const side of ['before', 'after'] as const)
            out[`${kind}.${side}`] = await measureFixWindow(
              tx,
              'site_a',
              kind,
              EVIDENCE[kind],
              verifyDayWindows(kind, FIXED_AT)[side],
            );
        return out;
      });
    const raw = await measureAll();
    expect(raw['rage_click.before']).toEqual({
      measure: { affected: 21, exposed: 42, value: 0.5 },
      rollupDays: 0,
    });
    expect(raw['u_turn.before']).toEqual({
      measure: { affected: 14, exposed: 42, value: 0.3333 },
      rollupDays: 0,
    });
    expect(raw['js_error.before']).toEqual({
      measure: { affected: 14, exposed: 42, value: 0.3333 },
      rollupDays: 0,
    });

    await backfillRollups(database.db, NOW);
    await admin(`delete from events where type = 'pv'`);
    const rolled = await measureAll();
    for (const key of Object.keys(raw)) {
      const r = raw[key] as { measure: unknown };
      const o = rolled[key] as { measure: unknown; rollupDays: number };
      expect(o.measure, key).toEqual(r.measure);
      // Exposure from page views comes from rollups for every whole day of the window.
      if (/^(rage_click|js_error|u_turn)\./.test(key))
        expect(o.rollupDays, key).toBe(key.endsWith('before') ? 7 : 4);
    }

    // The job itself: verified from rollups alone.
    for (const kind of ['rage_click', 'js_error', 'u_turn'] as const) {
      const res = await verifyIssue(database.db, { issueId: `iss_${kind}`, orgId: 'org_a' }, NOW);
      expect(res.status, kind).toBe('verified');
      expect(res.verification!.before).toEqual((raw[`${kind}.before`] as { measure: unknown }).measure);
    }
  });

  it('falls back to raw events for days without a complete rollup, and never crosses orgs', async () => {
    await seedMonth();
    await seedMonth(B);
    await seedFixedIssues();
    await backfillRollups(database.db, NOW);
    await admin(`update rollup_site_day set version = 1 where site_id = 'site_a' and day = '2026-09-05'`);
    const m = await withOrg(database.db, 'org_a', (tx) =>
      measureFixWindow(tx, 'site_a', 'u_turn', EVIDENCE.u_turn, verifyDayWindows('u_turn', FIXED_AT).before),
    );
    expect(m).toEqual({ measure: { affected: 14, exposed: 42, value: 0.3333 }, rollupDays: 6 });
    // Org B's own data is never mixed in (same paths, same days), and B can't read A's site.
    const other = await withOrg(database.db, 'org_b', (tx) =>
      measureFixWindow(tx, 'site_a', 'u_turn', EVIDENCE.u_turn, verifyDayWindows('u_turn', FIXED_AT).before),
    );
    expect(other.measure).toEqual({ affected: 0, exposed: 0, value: null });
  });
});

describe('before/after measures for task 10 kinds (report)', () => {
  const F = FIXED_AT.getTime();
  const before = { start: new Date(F - 7 * DAY), end: FIXED_AT };
  const after = { start: FIXED_AT, end: new Date(F + 7 * DAY) };
  const sources = { raw: rawEventsSource, rollup: rollupReportSource };

  /** Counts with both sources (rollups backfilled), and checks they agree. */
  async function affected(kind: keyof typeof EVIDENCE, range: { start: Date; end: Date }) {
    await backfillRollups(database.db, NOW);
    const out: Record<string, number | null> = {};
    for (const [name, source] of Object.entries(sources))
      out[name] = await withOrg(database.db, 'org_a', (tx) =>
        source.fixAffected(tx, 'site_a', kind, EVIDENCE[kind], range),
      );
    expect(out.rollup, `${kind}: rollup = raw`).toBe(out.raw);
    return out.raw;
  }

  it('form abandonment: visits that started the form and left, inside [start, end) exactly', async () => {
    const start = (id: string, ts: number, submit = false) =>
      visit(id, new Date(ts), [
        pv('/contact', ts),
        { t: 'fs', ts, p: '/contact', f: 'lead' },
        ...(submit ? [{ t: 'fx' as const, ts, p: '/contact', f: 'lead' }] : []),
      ]);
    await start('form-edge-start', F - 7 * DAY); // first instant of the window: counted
    await start('form-too-early', F - 7 * DAY - SEC); // just before: not counted
    await start('form-last-second', F - SEC); // last second before the fix: counted
    await start('form-submitted', F - DAY, true); // submitted: not abandoned
    await start('form-at-fix', F); // the fix instant belongs to "after"
    await closeVisits();
    expect(await affected('form_abandon', before)).toBe(2);
    expect(await affected('form_abandon', after)).toBe(1);
  });

  it('slow pages: visits whose page load was at or over the threshold', async () => {
    const load = (id: string, ts: number, v: number) =>
      visit(id, new Date(ts), [pv('/checkout', ts), { t: 'vt', ts, p: '/checkout', n: 'LCP', v }]);
    await load('slow-at-line', F - 2 * DAY, 4000); // exactly the threshold: slow
    await load('slow-under', F - 2 * DAY, 3999); // a millisecond under: fine
    await load('slow-other-page', F - 2 * DAY, 9000).then(() =>
      visit('slow-other-pg2', new Date(F - 2 * DAY), [
        { t: 'vt', ts: F - 2 * DAY, p: '/', n: 'LCP', v: 9000 },
      ]),
    );
    await load('slow-inp', F - 2 * DAY, 5000);
    await admin(
      `update events set props = jsonb_set(props, '{n}', '"INP"') where visit_id = 'slow-inp' and type = 'vt'`,
    );
    await closeVisits();
    // slow-at-line and slow-other-page (whose LCP on /checkout is 9000); not the / page, not INP.
    expect(await affected('slow_page', before)).toBe(2);
  });

  it('JS errors: visits that hit this error (message and source), not others', async () => {
    const err = (id: string, ts: number, m: string, src?: string) =>
      visit(id, new Date(ts), [
        pv('/checkout', ts),
        { t: 'er', ts, p: '/checkout', m, ...(src ? { src } : {}) },
      ]);
    await err('err-same', F - DAY, 'x is undefined');
    await err('err-other-msg', F - DAY, 'y is undefined');
    await err('err-other-src', F - DAY, 'x is undefined', 'https://cdn.example/app.js');
    await err('err-after', F + DAY, 'x is undefined');
    await closeVisits();
    expect(await affected('js_error', before)).toBe(1);
    expect(await affected('js_error', after)).toBe(1);
  });

  it(`U-turns: back within ${U_TURN_MAX_SECONDS} seconds counts, a second later doesn't`, async () => {
    const trip = (id: string, ts: number, seconds: number) =>
      visit(id, new Date(ts), [pv('/', ts), pv('/pricing', ts + SEC), pv('/', ts + SEC + seconds * SEC)]);
    // Whole days (rollups) and the partial day at the window's start (raw) both count.
    await trip('turn-at-limit', F - 3 * DAY, U_TURN_MAX_SECONDS);
    await trip('turn-over-limit', F - 3 * DAY, U_TURN_MAX_SECONDS + 1);
    await trip('turn-edge-day', F - 7 * DAY + 3600 * SEC, 2);
    await trip('turn-after', F + 4 * DAY, 2);
    await closeVisits();
    expect(await affected('u_turn', before)).toBe(2);
    expect(await affected('u_turn', after)).toBe(1);
  });

  it('says "too early" for less than a day after the fix, and measures from one day', async () => {
    await seedMonth();
    await seedFixedIssues(A, at('2026-09-20T12:00:00Z'));
    await backfillRollups(database.db, NOW);
    for (const [name, source] of Object.entries(sources)) {
      const early = await snapshot(source, at('2026-09-21T11:59:59.999Z'));
      const day = await snapshot(source, at('2026-09-21T12:00:00Z'));
      for (const kind of ['form_abandon', 'slow_page', 'js_error', 'u_turn']) {
        expect(early.fixed.find((f) => f.kind === kind)!.after.perDay, `${name} ${kind}`).toBeNull();
        expect(day.fixed.find((f) => f.kind === kind)!.after.perDay, `${name} ${kind}`).not.toBeNull();
      }
    }
  });
});

describe('retention', () => {
  const counts = async (orgId: string) => {
    const q = async (table: string) =>
      Number((await admin(`select count(*)::int as n from ${table} where org_id = $1`, [orgId])).rows[0].n);
    return {
      events: await q('events'),
      visits: await q('visits'),
      siteDays: await q('rollup_site_day'),
      pageDays: await q('rollup_page_day'),
      vitalDays: await q('rollup_vitals_day'),
    };
  };

  it("purges an org's data past its retention, whole days at a time, and never touches another org", async () => {
    await seedMonth();
    await seedMonth(B);
    await backfillRollups(database.db, NOW);
    const b = await counts('org_b');
    const a = await counts('org_a');

    // Org A keeps 20 days at Oct 2 (from Sep 13); org B keeps the default. Rollups: 400 days.
    const res = await runRetention(database.db, { daysFor: (org) => (org.id === 'org_a' ? 20 : 90) }, NOW);
    expect(res).toMatchObject({ orgs: 2, rollups: 0, partitions: 0 });
    expect(await counts('org_b')).toEqual(b);
    const left = await counts('org_a');
    expect(left.visits).toBe(8 * 6); // Sep 13–20
    expect(left.events).toBeLessThan(a.events);
    expect(left.siteDays).toBe(a.siteDays);
    expect(
      (await admin(`select min(ts_server) as t from events where org_id = 'org_a'`)).rows[0].t.toISOString(),
    ).toBe('2026-09-13T08:00:00.000Z');

    // Even a purge of everything for A (rollups too) leaves B exactly as it was.
    await purgeOrgData(database.db, { id: 'org_a', plan: 'free' }, 1, at('2030-01-01T00:00:00Z'));
    expect(await counts('org_a')).toEqual({ events: 0, visits: 0, siteDays: 0, pageDays: 0, vitalDays: 0 });
    expect(await counts('org_b')).toEqual(b);
  });

  it('drops old empty partitions only, and the backfill never rebuilds purged days', async () => {
    await admin(
      `create table events_20200101 partition of events for values from ('2020-01-01T00:00:00Z') to ('2020-01-02T00:00:00Z')`,
    );
    await admin(
      `create table events_20200102 partition of events for values from ('2020-01-02T00:00:00Z') to ('2020-01-03T00:00:00Z')`,
    );
    await visit('site-b-old', at('2020-01-02T10:00:00Z'), [pv('/', Date.parse('2020-01-02T10:00:00Z'))], B);
    // Retention for org A only would leave B's 2020 row; the empty 2020-01-01 partition goes.
    const res = await runRetention(database.db, { daysFor: (org) => (org.id === 'org_a' ? 7 : 3650) }, NOW);
    expect(res.partitions).toBe(1);
    const parts = await admin(
      `select relname from pg_class where relname in ('events_20200101','events_20200102')`,
    );
    expect(parts.rows).toEqual([{ relname: 'events_20200102' }]);
    expect((await counts('org_b')).events).toBe(1);
    await admin(`delete from events where org_id = 'org_b'`);
    await admin(`drop table events_20200102`);
  });
});
