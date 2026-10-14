import type { IngestEvent, IngestJob } from '@pulse/contracts/ingest';
import { createDatabase, withOrg } from '@pulse/db';
import { funnelHash } from '@pulse/insights';
import {
  loadSiteInsights,
  loadWeekSummary,
  rollupReportSource,
  rollupSite,
  saveFunnel,
  sitesForInsights,
} from '@pulse/insights/db';
import type { Boss } from '@pulse/jobs';
import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { applyIngest } from '../src/ingest';
import { sweepInsights } from '../src/insights';

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

/** A fixed "now" in the past, so day boundaries never race the wall clock. */
const NOW = new Date('2026-09-15T10:00:00Z');
const TODAY = '2026-09-15';
const YESTERDAY = '2026-09-14';
const at = (iso: string) => new Date(iso);

beforeEach(async () => {
  await admin(
    `truncate rollup_funnel_day, rollup_vitals_day, rollup_page_day, rollup_site_day, site_funnels,
      issue_events, issues, events, ingest_dedupe, visits, audit_log, sites, org_plans, invitation, member,
      organization, verification, account, session, "user" cascade`,
  );
  await admin(
    `insert into organization (id, name, slug) values ('org_a','Org A','org-a'), ('org_b','Org B','org-b')`,
  );
  await admin(`insert into sites (id, org_id, name, domain, public_key, allowed_origins, status) values
    ('site_a','org_a','Shop A','shop-a.et','pk_a','{https://shop-a.et}','live'),
    ('site_b','org_b','Shop B','shop-b.et','pk_b','{https://shop-b.et}','live')`);
});

const A = { siteId: 'site_a', orgId: 'org_a', k: 'pk_a' };
const B = { siteId: 'site_b', orgId: 'org_b', k: 'pk_b' };

let seq = 0;
async function visit(
  visitId: string,
  when: Date,
  ev: IngestEvent[],
  opts: { site?: typeof A; ua?: string; net?: '4g' | '3g' | '2g' | 'slow-2g' } = {},
) {
  const site = opts.site ?? A;
  const job: IngestJob = {
    siteId: site.siteId,
    orgId: site.orgId,
    receivedAt: when.toISOString(),
    userAgent: opts.ua ?? ANDROID,
    batch: {
      v: 3,
      k: site.k,
      vid: visitId,
      seq: seq++,
      sv: '3.0.0',
      ctx: {
        vw: opts.ua === DESKTOP ? 1440 : 390,
        vh: 844,
        plat: 'web',
        ...(opts.net ? { net: opts.net } : {}),
      },
      ev,
    },
  };
  expect((await applyIngest(database.db, job)).status).toBe('applied');
}

const t = Date.parse('2026-09-15T09:00:00Z');
const pv = (p: string): IngestEvent => ({ t: 'pv', ts: t, p });
const lcp = (p: string, v: number): IngestEvent => ({ t: 'vt', ts: t, p, n: 'LCP', v });

/** Today: 3 shoppers on phones (one pays, one rage-clicks, one errors), 1 desktop reader. */
async function seedToday(site = A) {
  const id = (n: string) => `${site.siteId}_${n}`.replace(/_/g, '-');
  await visit(
    id('paid0001'),
    at('2026-09-15T08:00:00Z'),
    [
      pv('/products/kemis'),
      lcp('/products/kemis', 3000),
      pv('/cart'),
      pv('/checkout'),
      { t: 'ce', ts: t, p: '/checkout', n: 'purchase' },
    ],
    { site, net: '4g' },
  );
  await visit(
    id('rage0001'),
    at('2026-09-15T08:10:00Z'),
    [
      pv('/products/kemis'),
      lcp('/products/kemis', 5000),
      pv('/checkout'),
      { t: 'rc', ts: t, p: '/checkout', s: 'button.pay', n: 6 },
    ],
    { site, net: '3g' },
  );
  await visit(
    id('errs0001'),
    at('2026-09-15T08:20:00Z'),
    [pv('/products/123'), { t: 'er', ts: t, p: '/products/123', m: 'x is undefined' }],
    { site, net: 'slow-2g' },
  );
  await visit(id('read0001'), at('2026-09-15T08:30:00Z'), [pv('/'), lcp('/', 1200)], { site, ua: DESKTOP });
}

const funnelConfig = {
  name: 'telebirr checkout',
  template: 'telebirr_checkout' as const,
  steps: [
    { label: 'Viewed a product', match: [{ kind: 'path' as const, glob: '/product*' }] },
    { label: 'Started checkout', match: [{ kind: 'path' as const, glob: '/checkout*' }] },
    { label: 'Paid', match: [{ kind: 'event' as const, name: 'purchase' }] },
  ],
};

describe('rollupSite', () => {
  it('rolls up today and yesterday from raw rows, and is idempotent', async () => {
    await seedToday();
    // One visit yesterday; the bounce flag is set when the visit closes.
    await visit('yday0001', at('2026-09-14T12:00:00Z'), [pv('/')]);
    await admin(`update visits set bounced = true, ended_at = last_seen_at where id = 'yday0001'`);
    await admin(`update visits set bounced = false, ended_at = last_seen_at where id = 'site-a-paid0001'`);
    await withOrg(database.db, 'org_a', (tx) => saveFunnel(tx, 'org_a', 'site_a', funnelConfig, null));

    const res = await rollupSite(database.db, { siteId: 'site_a', orgId: 'org_a' }, NOW);
    expect(res).toEqual({ status: 'ok', days: [YESTERDAY, TODAY], funnelDays: [] });

    const site = await admin(
      `select day::text, visits, pageviews, closed_visits, bounced_visits, friction_visits, error_visits,
              rage_clicks, dead_clicks, errors, org_id from rollup_site_day order by day`,
    );
    expect(site.rows).toEqual([
      {
        day: YESTERDAY,
        visits: 1,
        pageviews: 1,
        closed_visits: 1,
        bounced_visits: 1,
        friction_visits: 0,
        error_visits: 0,
        rage_clicks: 0,
        dead_clicks: 0,
        errors: 0,
        org_id: 'org_a',
      },
      {
        day: TODAY,
        visits: 4,
        pageviews: 7,
        closed_visits: 1,
        bounced_visits: 0,
        friction_visits: 1,
        error_visits: 1,
        rage_clicks: 1,
        dead_clicks: 0,
        errors: 1,
        org_id: 'org_a',
      },
    ]);

    const pages = await admin(
      `select path, visits, pageviews, entries, bounces, friction_visits, error_visits
         from rollup_page_day where day = $1 order by path`,
      [TODAY],
    );
    expect(pages.rows).toEqual([
      { path: '/', visits: 1, pageviews: 1, entries: 0, bounces: 0, friction_visits: 0, error_visits: 0 },
      { path: '/cart', visits: 1, pageviews: 1, entries: 0, bounces: 0, friction_visits: 0, error_visits: 0 },
      {
        path: '/checkout',
        visits: 2,
        pageviews: 2,
        entries: 0,
        bounces: 0,
        friction_visits: 1,
        error_visits: 0,
      },
      // /products/123 collapses into the template; the ended paid visit entered here
      {
        path: '/products/*',
        visits: 1,
        pageviews: 1,
        entries: 0,
        bounces: 0,
        friction_visits: 0,
        error_visits: 1,
      },
      {
        path: '/products/kemis',
        visits: 2,
        pageviews: 2,
        entries: 1,
        bounces: 0,
        friction_visits: 0,
        error_visits: 0,
      },
    ]);

    const vitals = await admin(
      `select metric, device, network, path, values from rollup_vitals_day where day = $1 order by values[1]`,
      [TODAY],
    );
    expect(vitals.rows).toEqual([
      { metric: 'LCP', device: 'desktop', network: 'unknown', path: '/', values: [1200] },
      { metric: 'LCP', device: 'mobile', network: '4g', path: '/products/kemis', values: [3000] },
      { metric: 'LCP', device: 'mobile', network: '3g', path: '/products/kemis', values: [5000] },
    ]);

    const funnel = await admin(`select day::text, hash, counts from rollup_funnel_day order by day`);
    const hash = funnelHash(funnelConfig);
    expect(funnel.rows).toEqual([
      { day: YESTERDAY, hash, counts: [0, 0, 0] },
      { day: TODAY, hash, counts: [3, 2, 1] },
    ]);

    // Re-running changes nothing.
    const before = await admin(`select * from rollup_page_day order by day, path`);
    await rollupSite(database.db, { siteId: 'site_a', orgId: 'org_a' }, NOW);
    expect((await admin(`select * from rollup_page_day order by day, path`)).rows).toEqual(before.rows);
    expect((await admin(`select count(*)::int as n from rollup_vitals_day`)).rows[0].n).toBe(3);
  });

  it('recomputes recent days when the funnel changes, replacing old-step rollups', async () => {
    // Relative to the wall clock: the sweep's SQL helper looks back from now().
    const now = new Date();
    const oldAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 10, 10));
    const oldDay = oldAt.toISOString().slice(0, 10);
    // A visit 10 days ago, rolled up back then with no funnel.
    await visit('old00001', oldAt, [pv('/products/a'), pv('/checkout')]);
    await rollupSite(database.db, A, new Date(oldAt.getTime() + 2 * 3600_000));
    expect((await admin(`select count(*)::int as n from rollup_funnel_day`)).rows[0].n).toBe(0);
    expect(await sitesForInsights(database.db)).toEqual([]);

    await withOrg(database.db, 'org_a', (tx) => saveFunnel(tx, 'org_a', 'site_a', funnelConfig, null));
    expect(await sitesForInsights(database.db)).toEqual([{ siteId: 'site_a', orgId: 'org_a' }]);
    const res = await rollupSite(database.db, A, now);
    expect(res.funnelDays).toEqual([oldDay]);
    expect(
      (await admin(`select counts from rollup_funnel_day where day = $1`, [oldDay])).rows[0].counts,
    ).toEqual([1, 1, 0]);
    expect(await sitesForInsights(database.db)).toEqual([]);

    // Editing the steps makes the old rows stale; the next run replaces them.
    const edited = { ...funnelConfig, steps: funnelConfig.steps.slice(0, 2) };
    await withOrg(database.db, 'org_a', (tx) => saveFunnel(tx, 'org_a', 'site_a', edited, null));
    expect(await sitesForInsights(database.db)).toEqual([{ siteId: 'site_a', orgId: 'org_a' }]);
    expect((await rollupSite(database.db, A, now)).funnelDays).toEqual([oldDay]);
    const row = (await admin(`select hash, counts from rollup_funnel_day where day = $1`, [oldDay])).rows[0];
    expect(row).toEqual({ hash: funnelHash(edited), counts: [1, 1] });
  });

  it('stays inside the org: another org’s site is gone, and its rows are untouched', async () => {
    await seedToday(A);
    await seedToday(B);
    expect(await rollupSite(database.db, { siteId: 'site_b', orgId: 'org_a' }, NOW)).toEqual({
      status: 'site_gone',
      days: [],
      funnelDays: [],
    });
    await rollupSite(database.db, A, NOW);
    const rows = await admin(`select distinct site_id, org_id from rollup_site_day`);
    expect(rows.rows).toEqual([{ site_id: 'site_a', org_id: 'org_a' }]);
    // Org B can't see org A's rollups through RLS.
    const seen = await withOrg(database.db, 'org_b', (tx) => loadSiteInsights(tx, 'site_a', '7d', NOW));
    expect(seen.visits.value).toBe(0);
    expect(seen.pages).toEqual([]);
  });

  it('skips deleted sites', async () => {
    await seedToday();
    await admin(`update sites set deleted_at = now() where id = 'site_a'`);
    expect((await rollupSite(database.db, A, NOW)).status).toBe('site_gone');
  });
});

describe('reading insights from rollups', () => {
  it('builds the insights without touching raw events', async () => {
    await seedToday();
    await withOrg(database.db, 'org_a', (tx) => saveFunnel(tx, 'org_a', 'site_a', funnelConfig, null));
    await rollupSite(database.db, A, NOW);
    // Raw events gone: insights must still come out the same (they read rollups only).
    await admin(`delete from events`);
    const ins = await withOrg(database.db, 'org_a', (tx) => loadSiteInsights(tx, 'site_a', '7d', NOW));
    expect(ins).toMatchObject({
      siteId: 'site_a',
      range: '7d',
      from: '2026-09-09',
      to: TODAY,
      enoughData: false,
      health: { score: null },
      visits: { value: 4, previous: 0, trend: [0, 0, 0, 0, 0, 0, 4] },
      pageviews: { value: 7, previous: 0 },
      frictionRate: { value: 0.25 },
      errorRate: { value: 0.25 },
      vitals: { lcp: { p75: null, samples: 3 } },
      funnel: {
        name: 'telebirr checkout',
        stale: false,
        steps: [
          { label: 'Viewed a product', count: 3 },
          { label: 'Started checkout', count: 2 },
          { label: 'Paid', count: 1 },
        ],
        conversion: { value: 1 / 3, previous: null },
      },
    });
    expect(ins.updatedAt).not.toBeNull();
  });

  it('serves report numbers and the week summary from rollups', async () => {
    await seedToday();
    for (let i = 0; i < 5; i++)
      await visit(`phone${i}00000`, at('2026-09-15T07:00:00Z'), [pv('/'), lcp('/', 2000 + i * 100)]);
    await rollupSite(database.db, A, NOW);
    await admin(
      `insert into issues (id, org_id, site_id, number, kind, fingerprint, severity, status, evidence, first_seen, last_seen, verified_at)
       values ('iss_v1','org_a','site_a',1,'rage_click','fp1','watch','verified','{}', now(), now(), '2026-09-03T00:00:00Z')`,
    );
    const { totals, week, buckets } = await withOrg(database.db, 'org_a', async (tx) => ({
      totals: await rollupReportSource.totals(
        tx,
        'site_a',
        at('2026-09-01T00:00:00Z'),
        at('2026-10-01T00:00:00Z'),
      ),
      buckets: await rollupReportSource.bucketVisits(tx, 'site_a', {
        start: at('2026-09-01T00:00:00Z'),
        end: at('2026-10-01T00:00:00Z'),
      }),
      week: await loadWeekSummary(tx, NOW),
    }));
    // Phone LCPs: 3000, 5000, 2000..2400 → sorted p75 index floor(6 × .75) = 4 → 2400
    expect(totals).toEqual({ visits: 9, pageviews: 12, closedVisits: 0, bouncedVisits: 0, lcpP75: 2400 });
    expect(buckets).toEqual([0, 0, 9, 0, 0]);
    expect(week).toEqual({
      visits: { value: 9, previous: 0, trend: [0, 0, 0, 0, 0, 0, 9] },
      conversion: null,
      verifiedThisMonth: { value: 1, previous: 0 },
    });
  });
});

describe('sweep', () => {
  it('queues one staggered rollup per recently active site', async () => {
    const now = new Date();
    await visit('live0001', new Date(now.getTime() - 60_000), [pv('/')]);
    await visit('live0002', new Date(now.getTime() - 60_000), [pv('/')], { site: B });
    await visit('stale001', new Date(now.getTime() - 3 * 3600_000), [pv('/')]);
    const sent: { name: string; data: object; options: Record<string, unknown> }[] = [];
    const boss = {
      send: async (name: string, data: object, options: Record<string, unknown>) => {
        sent.push({ name, data, options });
        return 'job';
      },
    } as unknown as Boss;
    expect(await sweepInsights(database.db, boss, () => 0.5)).toBe(2);
    expect(sent.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))).toEqual([
      {
        name: 'insights.site',
        data: { siteId: 'site_a', orgId: 'org_a' },
        options: { singletonKey: 'site_a', startAfter: 120 },
      },
      {
        name: 'insights.site',
        data: { siteId: 'site_b', orgId: 'org_b' },
        options: { singletonKey: 'site_b', startAfter: 120 },
      },
    ]);
  });
});
