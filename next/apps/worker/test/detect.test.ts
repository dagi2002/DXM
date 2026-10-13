import type { IngestEvent, IngestJob } from '@pulse/contracts/ingest';
import { createDatabase } from '@pulse/db';
import {
  DEAD_CLICK_MIN_VISITS,
  MONEY_PATH_CRITICAL_VISITS,
  RAGE_CLICK_CRITICAL_VISITS,
  RAGE_CLICK_MIN_VISITS,
  REGRESSION_COOLDOWN_MINUTES,
} from '@pulse/detectors';
import type { Boss } from '@pulse/jobs';
import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { detectSite, sitesWithRecentActivity, sweepDetection } from '../src/detect';
import { applyIngest } from '../src/ingest';

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
const NOW = new Date(Date.now() - 60_000); // a minute ago, so "now" in detectSite is after it
const minutes = (m: number) => new Date(NOW.getTime() + m * 60_000);

beforeEach(async () => {
  await admin(
    'truncate issue_events, issues, events, ingest_dedupe, visits, audit_log, sites, org_plans, invitation, member, organization, verification, account, session, "user" cascade',
  );
  await admin(`insert into "user" (id, name, email) values ('u1','Tigist','owner@a.et')`);
  await admin(
    `insert into organization (id, name, slug) values ('org_a','Org A','org-a'), ('org_b','Org B','org-b')`,
  );
  await admin(`insert into sites (id, org_id, name, domain, public_key, allowed_origins, status) values
    ('site_a','org_a','Shop A','shop-a.et','pk_a','{https://shop-a.et}','live'),
    ('site_a2','org_a','Blog A','blog-a.et','pk_a2','{https://blog-a.et}','live'),
    ('site_b','org_b','Shop B','shop-b.et','pk_b','{https://shop-b.et}','live')`);
});

let seq = 0;
/** One visit's batch through the real ingest path, landing at `at`. */
async function visit(
  visitId: string,
  at: Date,
  ev: IngestEvent[],
  site: { siteId: string; orgId: string; k: string } = { siteId: 'site_a', orgId: 'org_a', k: 'pk_a' },
) {
  const job: IngestJob = {
    siteId: site.siteId,
    orgId: site.orgId,
    receivedAt: at.toISOString(),
    userAgent: ANDROID,
    batch: {
      v: 3,
      k: site.k,
      vid: visitId,
      seq: seq++,
      sv: '3.0.0',
      ctx: { vw: 390, vh: 844, plat: 'web' },
      ev,
    },
  };
  const res = await applyIngest(database.db, job);
  expect(res.status).toBe('applied');
}

const ts = Date.now();
const rageAt = (p: string, s = 'button.pay', n = 5): IngestEvent[] => [
  { t: 'pv', ts, p },
  { t: 'rc', ts, p, s, n },
];
const deadAt = (p: string, s = 'a.menu'): IngestEvent[] => [
  { t: 'pv', ts, p },
  { t: 'dc', ts, p, s },
];

async function rageVisits(count: number, at: Date, prefix = 'visit_r', path = '/products/kemis') {
  for (let i = 0; i < count; i++) await visit(`${prefix}${String(i).padStart(4, '0')}`, at, rageAt(path));
}

const issueRows = () => admin('select * from issues order by number');

describe('detectSite', () => {
  it('creates numbered issues with evidence and a history entry, and is idempotent', async () => {
    await rageVisits(RAGE_CLICK_MIN_VISITS, minutes(-30));
    for (let i = 0; i < DEAD_CLICK_MIN_VISITS; i++)
      await visit(`visit_d${String(i).padStart(4, '0')}`, minutes(-20), deadAt('/menu'));

    const first = await detectSite(database.db, { siteId: 'site_a', orgId: 'org_a' });
    expect(first).toMatchObject({ status: 'ok', findings: 2, refreshed: 0, reopened: [], escalated: [] });
    expect(first.created).toHaveLength(2);

    const { rows } = await issueRows();
    // Same severity: the one more visits ran into gets the lower number.
    expect(rows.map((r) => [r.number, r.kind, r.status, r.severity])).toEqual([
      [1, 'dead_click', 'open', 'watch'],
      [2, 'rage_click', 'open', 'watch'],
    ]);
    const rage = rows[1]!;
    expect(rage.id).toMatch(/^iss_/);
    expect(rage.org_id).toBe('org_a');
    expect(new Date(rage.first_seen)).toEqual(minutes(-30));
    expect(rage.evidence).toMatchObject({
      path: '/products/kemis',
      selector: 'button.pay',
      visits: RAGE_CLICK_MIN_VISITS,
      occurrences: RAGE_CLICK_MIN_VISITS,
      clicks: RAGE_CLICK_MIN_VISITS * 5,
      maxBurst: 5,
      leftOnPage: RAGE_CLICK_MIN_VISITS,
      devices: { desktop: 0, mobile: RAGE_CLICK_MIN_VISITS, tablet: 0 },
      topBrowser: { browser: 'Chrome', os: 'Android', visits: RAGE_CLICK_MIN_VISITS },
    });
    expect(rage.impact).toEqual({ visitsPerDay: RAGE_CLICK_MIN_VISITS, leftPerDay: RAGE_CLICK_MIN_VISITS });
    const history = await admin('select from_status, to_status, reason, actor_user_id from issue_events');
    expect(history.rows).toEqual([
      { from_status: null, to_status: 'open', reason: 'detected', actor_user_id: null },
      { from_status: null, to_status: 'open', reason: 'detected', actor_user_id: null },
    ]);

    const again = await detectSite(database.db, { siteId: 'site_a', orgId: 'org_a' });
    expect(again).toMatchObject({ created: [], refreshed: 2 });
    expect((await issueRows()).rowCount).toBe(2);
    expect((await admin('select count(*)::int as n from issue_events')).rows[0].n).toBe(2);
  });

  it('refreshes last_seen and evidence, and reports escalation to critical', async () => {
    await rageVisits(RAGE_CLICK_MIN_VISITS, minutes(-40));
    await detectSite(database.db, { siteId: 'site_a', orgId: 'org_a' });
    await rageVisits(RAGE_CLICK_CRITICAL_VISITS - RAGE_CLICK_MIN_VISITS, minutes(-5), 'visit_s');

    const res = await detectSite(database.db, { siteId: 'site_a', orgId: 'org_a' });
    const [row] = (await issueRows()).rows;
    expect(res.escalated).toEqual([row.id]);
    expect(row.severity).toBe('critical');
    expect(row.evidence.visits).toBe(RAGE_CLICK_CRITICAL_VISITS);
    expect(new Date(row.first_seen)).toEqual(minutes(-40));
    expect(new Date(row.last_seen)).toEqual(minutes(-5));
  });

  it('numbers issues per organization and never mixes tenants', async () => {
    const siteB = { siteId: 'site_b', orgId: 'org_b', k: 'pk_b' };
    // Same visit ids and pages on both orgs.
    for (let i = 0; i < MONEY_PATH_CRITICAL_VISITS; i++) {
      await visit(`visit_x${i}xxxx`, minutes(-10), rageAt('/checkout'));
      await visit(`visit_x${i}xxxx`, minutes(-10), rageAt('/checkout'), siteB);
    }
    // Org A's second site detects too: numbering continues across sites of one org.
    await rageVisits(RAGE_CLICK_MIN_VISITS, minutes(-10), 'visit_q', '/');
    await admin(`update events set site_id = 'site_a2' where visit_id like 'visit_q%'`);
    await admin(`update visits set site_id = 'site_a2' where id like 'visit_q%'`);

    await detectSite(database.db, { siteId: 'site_a', orgId: 'org_a' });
    await detectSite(database.db, { siteId: 'site_b', orgId: 'org_b' });
    await detectSite(database.db, { siteId: 'site_a2', orgId: 'org_a' });

    const { rows } = await admin(
      'select org_id, site_id, number, severity, evidence from issues order by org_id, number',
    );
    expect(rows.map((r) => [r.org_id, r.site_id, r.number, r.severity])).toEqual([
      ['org_a', 'site_a', 1, 'critical'],
      ['org_a', 'site_a2', 2, 'watch'],
      ['org_b', 'site_b', 1, 'critical'],
    ]);
    // Each org's evidence counts only its own visits.
    expect(rows[0]!.evidence.visits).toBe(MONEY_PATH_CRITICAL_VISITS);
    expect(rows[2]!.evidence.visits).toBe(MONEY_PATH_CRITICAL_VISITS);
  });

  it('cannot read another org’s site even when asked to (RLS scope)', async () => {
    await rageVisits(RAGE_CLICK_MIN_VISITS, minutes(-10));
    const res = await detectSite(database.db, { siteId: 'site_a', orgId: 'org_b' });
    expect(res.status).toBe('site_gone');
    expect((await issueRows()).rowCount).toBe(0);
  });

  it('ignores a fixed issue during the cooldown, then reopens it on regression', async () => {
    await rageVisits(RAGE_CLICK_MIN_VISITS, minutes(-120));
    await detectSite(database.db, { siteId: 'site_a', orgId: 'org_a' }, minutes(-100));
    const fixedAt = minutes(-90);
    await admin(`update issues set status = 'fixed', fixed_at = $1`, [fixedAt]);

    // Occurrences inside the cooldown (deploy still rolling out) don't count.
    const inCooldown = new Date(fixedAt.getTime() + (REGRESSION_COOLDOWN_MINUTES - 5) * 60_000);
    await rageVisits(RAGE_CLICK_MIN_VISITS, inCooldown, 'visit_c');
    let res = await detectSite(database.db, { siteId: 'site_a', orgId: 'org_a' });
    expect(res).toMatchObject({ findings: 0, reopened: [], created: [] });
    expect((await issueRows()).rows[0].status).toBe('fixed');

    // After the cooldown, enough visits hit it again: reopened on the same row.
    await rageVisits(RAGE_CLICK_MIN_VISITS, minutes(-10), 'visit_after');
    res = await detectSite(database.db, { siteId: 'site_a', orgId: 'org_a' });
    const { rows } = await issueRows();
    expect(rows).toHaveLength(1);
    expect(res.reopened).toEqual([rows[0].id]);
    expect(rows[0]).toMatchObject({ status: 'open', fixed_at: null, verified_at: null, number: 1 });
    expect(rows[0].evidence.visits).toBe(RAGE_CLICK_MIN_VISITS); // only post-cooldown visits
    const history = await admin(
      `select from_status, to_status, reason from issue_events order by created_at, reason`,
    );
    expect(history.rows.at(-1)).toEqual({ from_status: 'fixed', to_status: 'open', reason: 'regressed' });
  });

  it('keeps dismissed issues dismissed but records when it last happened', async () => {
    await rageVisits(RAGE_CLICK_MIN_VISITS, minutes(-60));
    await detectSite(database.db, { siteId: 'site_a', orgId: 'org_a' });
    await admin(`update issues set status = 'dismissed'`);
    await rageVisits(1, minutes(-2), 'visit_late');
    const res = await detectSite(database.db, { siteId: 'site_a', orgId: 'org_a' });
    const [row] = (await issueRows()).rows;
    expect(res).toMatchObject({ reopened: [], escalated: [], refreshed: 1 });
    expect(row.status).toBe('dismissed');
    expect(new Date(row.last_seen)).toEqual(minutes(-2));
  });

  it('only looks at the detection window', async () => {
    await rageVisits(RAGE_CLICK_MIN_VISITS, new Date(NOW.getTime() - 25 * 3600_000));
    const res = await detectSite(database.db, { siteId: 'site_a', orgId: 'org_a' });
    expect(res.findings).toBe(0);
  });

  it('stops for deleted sites', async () => {
    await rageVisits(RAGE_CLICK_MIN_VISITS, minutes(-10));
    await admin(`update sites set deleted_at = now() where id = 'site_a'`);
    expect((await detectSite(database.db, { siteId: 'site_a', orgId: 'org_a' })).status).toBe('site_gone');
  });
});

describe('detection sweep', () => {
  it('finds recently active, non-deleted sites across orgs and queues one staggered run each', async () => {
    await visit('visit_aaaaaaaa', new Date(), [{ t: 'pv', ts, p: '/' }]);
    await visit('visit_bbbbbbbb', new Date(), [{ t: 'pv', ts, p: '/' }], {
      siteId: 'site_b',
      orgId: 'org_b',
      k: 'pk_b',
    });
    await visit('visit_old00000', new Date(Date.now() - 3600_000), [{ t: 'pv', ts, p: '/' }], {
      siteId: 'site_a2',
      orgId: 'org_a',
      k: 'pk_a2',
    });
    const active = await sitesWithRecentActivity(database.db);
    expect(active.sort((a, b) => a.siteId.localeCompare(b.siteId))).toEqual([
      { siteId: 'site_a', orgId: 'org_a' },
      { siteId: 'site_b', orgId: 'org_b' },
    ]);

    await admin(`update sites set deleted_at = now() where id = 'site_b'`);
    const sent: { name: string; data: object; options: Record<string, unknown> }[] = [];
    const boss = {
      send: async (name: string, data: object, options: Record<string, unknown>) => {
        sent.push({ name, data, options });
        return 'job';
      },
    } as unknown as Boss;
    expect(await sweepDetection(database.db, boss, () => 0.5)).toBe(1);
    expect(sent).toEqual([
      {
        name: 'detect.site',
        data: { siteId: 'site_a', orgId: 'org_a' },
        options: { singletonKey: 'site_a', startAfter: 30 },
      },
    ]);
  });
});
