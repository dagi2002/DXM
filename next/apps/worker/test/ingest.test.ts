import type { IngestJob } from '@pulse/contracts/ingest';
import { createDatabase, events, sql, visits, withOrg } from '@pulse/db';
import { MemoryMailer } from '@pulse/mail';
import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { applyIngest, clampClientTs, parseUserAgent } from '../src/ingest';
import { notifySiteLive } from '../src/notify';

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
const now = new Date();

beforeEach(async () => {
  await admin(
    'truncate events, ingest_dedupe, visits, audit_log, sites, org_plans, invitation, member, organization, verification, account, session, "user" cascade',
  );
  await admin(
    `insert into "user" (id, name, email, locale) values ('u1','Tigist','owner@a.et','am'), ('u2','Dawit','member@a.et','en'), ('u3','Sara','admin@a.et','en')`,
  );
  await admin(
    `insert into organization (id, name, slug) values ('org_a','Org A','org-a'), ('org_b','Org B','org-b')`,
  );
  await admin(
    `insert into member (id, organization_id, user_id, role) values ('m1','org_a','u1','owner'), ('m2','org_a','u2','member'), ('m3','org_a','u3','admin')`,
  );
  await admin(`insert into sites (id, org_id, name, domain, public_key, allowed_origins) values
    ('site_a','org_a','Shop A','shop-a.et','pk_a','{https://shop-a.et}'),
    ('site_b','org_b','Shop B','shop-b.et','pk_b','{https://shop-b.et}')`);
});

const job = (
  over: Partial<IngestJob> & { ev?: IngestJob['batch']['ev']; seq?: number; vid?: string } = {},
): IngestJob => ({
  siteId: over.siteId ?? 'site_a',
  orgId: over.orgId ?? 'org_a',
  receivedAt: (over.receivedAt as string) ?? now.toISOString(),
  userAgent: ANDROID,
  batch: {
    v: 3,
    k: 'pk_a',
    vid: over.vid ?? 'visit_aaaaaaaa',
    seq: over.seq ?? 0,
    sv: '3.0.0',
    ctx: { vw: 390, vh: 844, lang: 'am-ET', net: '3g', plat: 'web' },
    ev: over.ev ?? [
      { t: 'pv', ts: now.getTime(), p: '/', q: 'utm_source=telegram&utm_campaign=meskel', r: 't.me' },
      { t: 'cl', ts: now.getTime(), p: '/', s: 'button.buy', x: 0.5, y: 600 },
      { t: 'sc', ts: now.getTime(), p: '/', d: 70 },
    ],
  },
});

describe('applyIngest', () => {
  it('creates the visit with entry facts, appends events, and flips the site live once', async () => {
    const first = await applyIngest(database.db, job());
    expect(first).toEqual({ status: 'applied', becameLive: true });
    const {
      rows: [v],
    } = await admin('select * from visits');
    expect(v).toMatchObject({
      site_id: 'site_a',
      id: 'visit_aaaaaaaa',
      org_id: 'org_a',
      entry_path: '/',
      referrer_host: 't.me',
      utm_source: 'telegram',
      utm_campaign: 'meskel',
      device: 'mobile',
      browser: 'Chrome',
      os: 'Android',
      language: 'am-ET',
      network: '3g',
      pageviews: 1,
      clicks: 1,
      events_count: 3,
      max_scroll_pct: 70,
    });
    const ev = await admin('select type, path, props from events order by id');
    expect(ev.rows).toEqual([
      { type: 'pv', path: '/', props: { q: 'utm_source=telegram&utm_campaign=meskel', r: 't.me' } },
      { type: 'cl', path: '/', props: { s: 'button.buy', x: 0.5, y: 600 } },
      { type: 'sc', path: '/', props: { d: 70 } },
    ]);
    const {
      rows: [s],
    } = await admin(`select status, verified_at from sites where id = 'site_a'`);
    expect(s.status).toBe('live');
    expect(s.verified_at).not.toBeNull();

    const second = await applyIngest(
      database.db,
      job({ seq: 1, ev: [{ t: 'pv', ts: now.getTime(), p: '/checkout' }] }),
    );
    expect(second).toEqual({ status: 'applied', becameLive: false });
    const {
      rows: [v2],
    } = await admin('select pageviews, events_count, exit_path, entry_path from visits');
    expect(v2).toMatchObject({ pageviews: 2, events_count: 4, exit_path: '/checkout', entry_path: '/' });
  });

  it('drops duplicate deliveries of the same batch', async () => {
    await applyIngest(database.db, job());
    expect(await applyIngest(database.db, job())).toEqual({ status: 'duplicate', becameLive: false });
    expect((await admin('select count(*)::int as n from events')).rows[0].n).toBe(3);
  });

  it('keeps the same visit id on two sites completely separate (no cross-tenant merge)', async () => {
    await applyIngest(database.db, job());
    await applyIngest(database.db, job({ siteId: 'site_b', orgId: 'org_b' }));
    const { rows } = await admin('select site_id, org_id, events_count from visits order by site_id');
    expect(rows).toEqual([
      { site_id: 'site_a', org_id: 'org_a', events_count: 3 },
      { site_id: 'site_b', org_id: 'org_b', events_count: 3 },
    ]);
    // Through the app role, each org only sees its own rows.
    expect(await withOrg(database.db, 'org_b', (tx) => tx.select().from(visits))).toHaveLength(1);
    expect(await withOrg(database.db, 'org_b', (tx) => tx.select().from(events))).toHaveLength(3);
    expect(await database.db.select().from(events)).toEqual([]);
  });

  it('ignores batches for deleted sites', async () => {
    await admin(`update sites set deleted_at = now() where id = 'site_a'`);
    expect(await applyIngest(database.db, job())).toEqual({ status: 'site_gone', becameLive: false });
  });

  it('closes idle visits and decides bounces in the database', async () => {
    await applyIngest(
      database.db,
      job({ vid: 'bounce_aaaaaa', ev: [{ t: 'pv', ts: now.getTime(), p: '/' }] }),
    );
    await applyIngest(database.db, job({ vid: 'engaged_aaaaa' }));
    await admin(`update visits set last_seen_at = now() - interval '45 minutes'`);
    const res = await database.db.execute<{ n: number }>(sql`select pulse_close_idle_visits(30) as n`);
    expect(res.rows[0]!.n).toBe(2);
    const { rows } = await admin('select id, bounced, ended_at is not null as ended from visits order by id');
    expect(rows).toEqual([
      { id: 'bounce_aaaaaa', bounced: true, ended: true },
      { id: 'engaged_aaaaa', bounced: false, ended: true },
    ]);
  });
});

describe('notifySiteLive', () => {
  it('emails owners and admins in their own language, not members', async () => {
    const mailer = new MemoryMailer();
    const sent = await notifySiteLive(database.db, mailer, 'https://app.dxmpulse.et', {
      siteId: 'site_a',
      orgId: 'org_a',
    });
    expect(sent).toBe(2);
    expect(mailer.lastTo('owner@a.et')?.subject).toBe('Pulse ከShop A ጉብኝቶችን መቀበል ጀምሯል');
    expect(mailer.lastTo('admin@a.et')?.text).toContain('https://app.dxmpulse.et/sites/site_a');
    expect(mailer.lastTo('member@a.et')).toBeUndefined();
  });
});

describe('helpers', () => {
  it('parses user agents coarsely', () => {
    expect(parseUserAgent(ANDROID, 390)).toEqual({ browser: 'Chrome', os: 'Android', device: 'mobile' });
    expect(parseUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Safari/604.1', 820).device).toBe(
      'tablet',
    );
    expect(parseUserAgent('Mozilla/5.0 (Windows NT 10.0) Chrome/128 Safari/537.36 Edg/128', 1440)).toEqual({
      browser: 'Edge',
      os: 'Windows',
      device: 'desktop',
    });
  });
  it('drops client timestamps more than a day off', () => {
    const r = new Date('2026-10-05T10:00:00Z');
    expect(clampClientTs(r.getTime() - 5000, r)?.getTime()).toBe(r.getTime() - 5000);
    expect(clampClientTs(r.getTime() - 3 * 86_400_000, r)).toBeNull();
  });
});
