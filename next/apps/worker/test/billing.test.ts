import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FakeChapaClient,
  advanceSubscription,
  createPayLink,
  ingestState,
  requestPlan,
  settlePayment,
} from '@pulse/billing';
import { GRACE_DAYS, PLANS, RENEWAL_LEAD_DAYS, TRIAL_DAYS } from '@pulse/contracts/constants';
import type { IngestJob } from '@pulse/contracts/ingest';
import type { ReplayChunkJob } from '@pulse/contracts/replays';
import { createDatabase, visits, withOrg } from '@pulse/db';
import { MemoryMailer } from '@pulse/mail';
import { LocalDiskBlobStore, replayObjectKey } from '@pulse/storage';
import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sweepBilling } from '../src/billing';
import { applyIngest } from '../src/ingest';
import { applyReplayChunk, purgeReplays } from '../src/replays';

const user = process.env.USER ?? 'postgres';
const APP_DB =
  process.env.TEST_DATABASE_URL ?? 'postgres://pulse_app:pulse_app_dev@localhost:5432/pulse_test';
const ADMIN_DB = process.env.TEST_DATABASE_ADMIN_URL ?? `postgres://${user}@localhost:5432/pulse_test`;
const database = createDatabase(APP_DB, { max: 4 });
const db = database.db;
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

const DAY = 86_400_000;
const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36';
const now = new Date();
const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

beforeEach(async () => {
  await admin(
    'truncate replay_chunks, events, ingest_dedupe, visits, audit_log, sites, org_plans, invitation, member, organization, verification, account, session, "user" cascade',
  );
  await admin(
    `insert into "user" (id, name, email, locale) values ('u1','Tigist','owner@a.et','en'), ('u2','Dawit','admin@a.et','en'), ('u3','Sara','owner@b.et','am')`,
  );
  await admin(
    `insert into organization (id, name, slug) values ('org_a','Org A','org-a'), ('org_b','Org B','org-b')`,
  );
  await admin(
    `insert into member (id, organization_id, user_id, role) values ('m1','org_a','u1','owner'), ('m2','org_a','u2','admin'), ('m3','org_b','u3','owner')`,
  );
  await admin(`insert into sites (id, org_id, name, domain, public_key, allowed_origins) values
    ('site_a','org_a','Shop A','shop-a.et','pk_a','{https://shop-a.et}'),
    ('site_b','org_b','Shop B','shop-b.et','pk_b','{https://shop-b.et}')`);
});

const visit = (
  vid: string,
  over: { seq?: number; orgId?: string; siteId?: string; at?: Date } = {},
): IngestJob => ({
  siteId: over.siteId ?? 'site_a',
  orgId: over.orgId ?? 'org_a',
  receivedAt: (over.at ?? now).toISOString(),
  userAgent: UA,
  batch: {
    v: 3,
    k: 'pk_a',
    vid,
    seq: over.seq ?? 0,
    ctx: { vw: 390, vh: 844, plat: 'web' },
    ev: [{ t: 'pv', ts: (over.at ?? now).getTime(), p: '/' }],
  },
});
const visitCount = async (orgId = 'org_a') =>
  (await admin('select count(*)::int as n from visits where org_id = $1', [orgId])).rows[0].n as number;
const used = async (orgId = 'org_a') =>
  (await admin('select coalesce(sum(sessions), 0)::int as n from org_usage where org_id = $1', [orgId]))
    .rows[0].n as number;
const sub = async (orgId = 'org_a') =>
  (await admin('select * from subscriptions where org_id = $1', [orgId])).rows[0];
const actor = { userId: 'u1' };

describe('session quota at ingest', () => {
  it('counts each new session once, and later batches of it not at all', async () => {
    expect(await applyIngest(db, visit('visit_aaaaaaa1'))).toMatchObject({ status: 'applied' });
    expect(await applyIngest(db, visit('visit_aaaaaaa1', { seq: 1 }))).toMatchObject({ status: 'applied' });
    expect(await applyIngest(db, visit('visit_aaaaaaa1', { seq: 1 }))).toMatchObject({ status: 'duplicate' });
    expect(await applyIngest(db, visit('visit_aaaaaaa2'))).toMatchObject({ status: 'applied' });
    expect(await used()).toBe(2);
    expect(await ingestState(db, 'org_a')).toMatchObject({
      plan: 'free',
      status: null,
      sessions: 2,
      sessionLimit: 1000,
      blocked: false,
      periodStart: monthStart,
    });
  });

  it('stores the last session the plan allows and not one more (the boundary)', async () => {
    const limit = PLANS.free.sessions;
    await admin(`insert into org_usage (org_id, period_start, sessions) values ('org_a', $1, $2)`, [
      monthStart,
      limit - 2,
    ]);
    expect((await applyIngest(db, visit('visit_under000'))).status).toBe('applied'); // limit - 1
    expect((await applyIngest(db, visit('visit_atlimit0'))).status).toBe('applied'); // exactly the limit
    expect(await used()).toBe(limit);
    expect((await ingestState(db, 'org_a')).blocked).toBe(true);

    const over = await applyIngest(db, visit('visit_over0000'));
    expect(over).toEqual({ status: 'over_quota', becameLive: false });
    expect(await used()).toBe(limit); // not counted
    expect(await visitCount()).toBe(2); // not stored
    expect(
      (await admin(`select count(*)::int as n from events where visit_id = 'visit_over0000'`)).rows[0].n,
    ).toBe(0);
    expect(
      (await admin(`select count(*)::int as n from ingest_dedupe where visit_id = 'visit_over0000'`)).rows[0]
        .n,
    ).toBe(0);

    // A session that is already stored keeps being accepted…
    expect((await applyIngest(db, visit('visit_atlimit0', { seq: 1 }))).status).toBe('applied');
    // …and the org can still read everything it has.
    expect(await withOrg(db, 'org_a', (tx) => tx.select().from(visits))).toHaveLength(2);
    // Another org is not affected.
    expect(
      (await applyIngest(db, visit('visit_other000', { orgId: 'org_b', siteId: 'site_b' }))).status,
    ).toBe('applied');
  });

  it('holds the limit when new sessions race', async () => {
    const limit = PLANS.free.sessions;
    await admin(`insert into org_usage (org_id, period_start, sessions) values ('org_a', $1, $2)`, [
      monthStart,
      limit - 3,
    ]);
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => applyIngest(db, visit(`visit_race000${i}`))),
    );
    expect(results.filter((r) => r.status === 'applied')).toHaveLength(3);
    expect(results.filter((r) => r.status === 'over_quota')).toHaveLength(5);
    expect(await used()).toBe(limit);
    expect(await visitCount()).toBe(3);
  });

  it('lifts the quota the moment the org upgrades', async () => {
    await admin(`insert into org_usage (org_id, period_start, sessions) values ('org_a', $1, $2)`, [
      monthStart,
      PLANS.free.sessions,
    ]);
    expect((await applyIngest(db, visit('visit_before00'))).status).toBe('over_quota');
    await requestPlan(db, 'org_a', { plan: 'business', interval: 'month' }, actor); // starts the trial
    expect((await applyIngest(db, visit('visit_before00'))).status).toBe('applied'); // same batch, retried
    expect(await ingestState(db, 'org_a')).toMatchObject({
      plan: 'business',
      sessionLimit: 15_000,
      blocked: false,
    });
  });

  it('starts a fresh count each usage month', async () => {
    const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    await admin(`insert into org_usage (org_id, period_start, sessions) values ('org_a', $1, $2)`, [
      lastMonth,
      PLANS.free.sessions,
    ]);
    expect((await applyIngest(db, visit('visit_newmonth'))).status).toBe('applied');
    expect(await ingestState(db, 'org_a')).toMatchObject({ sessions: 1, blocked: false });
    // A subscriber's months are counted from the start of the billing period.
    const start = new Date(now.getTime() - 40 * DAY);
    await admin(
      `insert into subscriptions (org_id, plan, status, current_period_start, current_period_end)
       values ('org_b', 'growth', 'active', $1, $2)`,
      [start, new Date(now.getTime() + 325 * DAY)],
    );
    const state = await ingestState(db, 'org_b');
    const second = new Date(start);
    second.setUTCMonth(second.getUTCMonth() + 1);
    expect(state.plan).toBe('growth');
    expect(Math.abs(state.periodStart.getTime() - second.getTime())).toBeLessThan(2 * DAY); // month 2 of the period
    expect(state.periodStart.getTime()).toBeLessThanOrEqual(now.getTime());
  });

  it('drops replay chunks for sessions that were not stored, and keeps them for ones that were', async () => {
    const store = new LocalDiskBlobStore(mkdtempSync(join(tmpdir(), 'worker-billing-')));
    const chunk = (visitId: string): ReplayChunkJob => {
      const base = { orgId: 'org_a', siteId: 'site_a', visitId, seq: 0 };
      return {
        ...base,
        bytes: 10,
        objectKey: replayObjectKey(base),
        events: 2,
        firstTs: now.toISOString(),
        lastTs: now.toISOString(),
        hasSnapshot: true,
        receivedAt: now.toISOString(),
      };
    };
    await applyIngest(db, visit('visit_stored00'));
    await admin(`update org_usage set sessions = $1 where org_id = 'org_a'`, [PLANS.free.sessions]);
    const dropped = chunk('visit_unknown0');
    await store.put(dropped.objectKey, new Uint8Array([1]));
    expect(await applyReplayChunk(db, store, dropped)).toBe('over_quota');
    expect(await store.get(dropped.objectKey)).toBeNull();
    expect(await applyReplayChunk(db, store, chunk('visit_stored00'))).toBe('applied');
  });
});

describe('the subscription clock', () => {
  const start = new Date('2026-03-01T09:00:00.000Z');
  const trialEnd = new Date(start.getTime() + TRIAL_DAYS * DAY);
  const at = (base: Date, days: number, ms = 0) => new Date(base.getTime() + days * DAY + ms);
  const mailer = new MemoryMailer();
  beforeEach(async () => {
    mailer.outbox.length = 0;
    expect(await requestPlan(db, 'org_a', { plan: 'business', interval: 'month' }, actor, start)).toEqual({
      outcome: 'trial_started',
    });
  });
  const run = (when: Date) => sweepBilling(db, mailer, 'https://app.example.et', when);

  it('trial → invoice a week before the end → past due → restricted, each step once', async () => {
    expect(await sub()).toMatchObject({ status: 'trialing', plan: 'business' });
    expect(new Date((await sub()).current_period_end)).toEqual(trialEnd);

    // Too early for an invoice.
    expect(await run(at(trialEnd, -RENEWAL_LEAD_DAYS, -1000))).toEqual({ orgs: 0, events: 0, failed: 0 });
    // The lead window opens: one invoice, one email to the owner (not the admin).
    expect(await run(at(trialEnd, -RENEWAL_LEAD_DAYS))).toEqual({ orgs: 1, events: 1, failed: 0 });
    const [invoice] = (await admin('select * from invoices')).rows;
    expect(invoice).toMatchObject({
      number: 1,
      status: 'open',
      plan: 'business',
      amount_santim: 240_000,
      currency: 'ETB',
    });
    expect(new Date(invoice.period_start)).toEqual(trialEnd);
    expect(new Date(invoice.due_at)).toEqual(trialEnd);
    expect(mailer.outbox.map((m) => m.to)).toEqual(['owner@a.et']);
    expect(mailer.outbox[0]!.subject).toContain('invoice #1');
    expect(mailer.outbox[0]!.text).toContain('ETB 2,400');
    expect(mailer.outbox[0]!.text).toContain('https://app.example.et/settings?tab=billing');

    // Running again changes nothing and sends nothing.
    expect((await run(at(trialEnd, -3))).events).toBe(0);
    expect((await run(at(trialEnd, 0, -1000))).events).toBe(0);
    expect(await sub()).toMatchObject({ status: 'trialing' });
    expect(mailer.outbox).toHaveLength(1);

    // The period ends unpaid: past due, with the grace period running from the due date.
    expect((await run(trialEnd)).events).toBe(1);
    const pastDue = await sub();
    expect(pastDue.status).toBe('past_due');
    expect(new Date(pastDue.grace_ends_at)).toEqual(at(trialEnd, GRACE_DAYS));
    expect(mailer.outbox.at(-1)!.subject).toContain('overdue');
    // In grace the plan still works: full quota, sessions stored.
    expect(await ingestState(db, 'org_a', at(trialEnd, 1))).toMatchObject({
      sessionLimit: 15_000,
      blocked: false,
    });
    expect((await applyIngest(db, visit('visit_ingrace0', { at: at(trialEnd, 1) }))).status).toBe('applied');

    // One second before the grace ends: still past due.
    expect((await run(at(trialEnd, GRACE_DAYS, -1000))).events).toBe(0);
    expect((await sub()).status).toBe('past_due');
    // The grace ends: restricted.
    expect((await run(at(trialEnd, GRACE_DAYS))).events).toBe(1);
    expect((await sub()).status).toBe('restricted');
    expect(mailer.outbox.at(-1)!.subject).toContain('stopped storing new sessions');
    expect((await run(at(trialEnd, GRACE_DAYS + 30))).orgs).toBe(0); // nothing more to do
    expect(mailer.outbox).toHaveLength(3);

    const actions = (
      await admin(`select action from audit_log where org_id = 'org_a' order by created_at, action`)
    ).rows.map((r) => r.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'billing.trial_started',
        'billing.invoice_created',
        'billing.past_due',
        'billing.restricted',
      ]),
    );
  });

  it('a restricted org stores no new sessions but keeps reading, and paying brings it back', async () => {
    await applyIngest(db, visit('visit_early000', { at: at(start, 1) }));
    await run(at(trialEnd, -1));
    await run(trialEnd);
    await run(at(trialEnd, GRACE_DAYS));
    const late = at(trialEnd, GRACE_DAYS + 2);
    expect(await ingestState(db, 'org_a', late)).toMatchObject({
      status: 'restricted',
      sessionLimit: 0,
      blocked: true,
      replay: false,
    });
    expect((await applyIngest(db, visit('visit_blocked0', { at: late }))).status).toBe('over_quota');
    expect((await applyIngest(db, visit('visit_early000', { seq: 1, at: late }))).status).toBe('applied');
    expect(await withOrg(db, 'org_a', (tx) => tx.select().from(visits))).toHaveLength(1);

    const chapa = new FakeChapaClient();
    const [invoice] = (await admin('select id from invoices')).rows;
    const payer = { userId: 'u1', email: 'owner@a.et', name: 'Tigist Bekele' };
    const { txRef } = await createPayLink(
      db,
      chapa,
      'org_a',
      invoice.id,
      payer,
      'https://app.example.et/x',
      late,
    );
    chapa.pay(txRef);
    expect(await settlePayment(db, chapa, txRef, { mode: 'test', now: late })).toMatchObject({
      outcome: 'paid',
      applied: true,
    });
    const back = await sub();
    expect(back).toMatchObject({ status: 'active', grace_ends_at: null });
    // The paid month starts on the day they came back, not on the old due date.
    expect(new Date(back.current_period_start)).toEqual(late);
    expect((await applyIngest(db, visit('visit_blocked0', { at: late }))).status).toBe('applied');
  });

  it('paid on time: the period rolls on and nothing goes past due', async () => {
    await run(at(trialEnd, -RENEWAL_LEAD_DAYS));
    const chapa = new FakeChapaClient();
    const [invoice] = (await admin('select id, period_end from invoices')).rows;
    const payer = { userId: 'u1', email: 'owner@a.et', name: 'Tigist' };
    const { txRef } = await createPayLink(
      db,
      chapa,
      'org_a',
      invoice.id,
      payer,
      'https://x',
      at(trialEnd, -2),
    );
    chapa.pay(txRef);
    await settlePayment(db, chapa, txRef, { mode: 'test', now: at(trialEnd, -2) });
    const active = await sub();
    expect(active.status).toBe('active');
    expect(new Date(active.current_period_end)).toEqual(new Date(invoice.period_end));
    expect((await run(trialEnd)).events).toBe(0);
    expect((await run(at(trialEnd, GRACE_DAYS + 1))).events).toBe(0);
    expect((await sub()).status).toBe('active');
    // A week before the paid month ends, the next invoice (#2) appears.
    const nextEnd = new Date(active.current_period_end);
    expect((await run(at(nextEnd, -RENEWAL_LEAD_DAYS))).events).toBe(1);
    expect((await admin('select number, status from invoices order by number')).rows).toEqual([
      { number: 1, status: 'paid' },
      { number: 2, status: 'open' },
    ]);
  });

  it('keeps each organization on its own clock', async () => {
    await requestPlan(db, 'org_b', { plan: 'agency', interval: 'year' }, { userId: 'u3' }, at(start, 10));
    await run(trialEnd);
    expect((await sub('org_a')).status).toBe('past_due');
    expect((await sub('org_b')).status).toBe('trialing');
    expect((await admin(`select org_id from invoices order by org_id`)).rows).toEqual([{ org_id: 'org_a' }]);
    await run(at(start, 10 + TRIAL_DAYS - 1));
    const b = (await admin(`select amount_santim, interval from invoices where org_id = 'org_b'`)).rows[0];
    expect(b).toEqual({ amount_santim: 9_900_000, interval: 'year' });
    // Org B's owner reads Amharic.
    expect(mailer.lastTo('owner@b.et')!.subject).toContain('ደረሰኝ');
    // Advancing org A again does nothing, and never touches org B's invoice.
    expect(await advanceSubscription(db, 'org_a', at(trialEnd, 1))).toEqual([]);
    expect((await admin(`select count(*)::int as n from invoices where org_id = 'org_b'`)).rows[0].n).toBe(1);
  });
});

describe('replay retention by plan', () => {
  it('keeps 7 days on free, 30 on business, and treats a restricted org as free', async () => {
    const store = new LocalDiskBlobStore(mkdtempSync(join(tmpdir(), 'worker-retention-')));
    await admin(`insert into organization (id, name, slug) values ('org_c','Org C','org-c')`);
    await admin(`insert into sites (id, org_id, name, domain, public_key, allowed_origins) values
      ('site_c','org_c','Shop C','shop-c.et','pk_c','{https://shop-c.et}')`);
    await admin(`insert into org_plans (org_id, plan) values ('org_b', 'business'), ('org_c', 'business')`);
    await admin(
      `insert into subscriptions (org_id, plan, status, current_period_start, current_period_end)
       values ('org_b', 'business', 'active', now() - interval '5 days', now() + interval '25 days'),
              ('org_c', 'business', 'restricted', now() - interval '60 days', now() - interval '30 days')`,
    );
    const keys: Record<string, string> = {};
    for (const [org, site] of [
      ['org_a', 'site_a'],
      ['org_b', 'site_b'],
      ['org_c', 'site_c'],
    ] as const) {
      for (const [seq, ageDays] of [
        [0, 3],
        [1, 10],
        [2, 40],
      ] as const) {
        const base = { orgId: org, siteId: site, visitId: 'visit_retain00', seq };
        const key = replayObjectKey(base);
        keys[`${org}:${seq}`] = key;
        await store.put(key, new Uint8Array([1]));
        await admin(
          `insert into replay_chunks (site_id, visit_id, seq, org_id, bytes, object_key, events, first_ts, last_ts, received_at)
           values ($1, 'visit_retain00', $2, $3, 10, $4, 1, now(), now(), now() - make_interval(days => $5))`,
          [site, seq, org, key, ageDays],
        );
      }
    }
    const res = await purgeReplays(db, store, 90, 2);
    expect(res).toEqual({ rows: 5, blobs: 5, failed: 0 });
    const left = (await admin('select org_id, seq from replay_chunks order by org_id, seq')).rows;
    expect(left).toEqual([
      { org_id: 'org_a', seq: 0 }, // free: 7 days
      { org_id: 'org_b', seq: 0 }, // business: 30 days
      { org_id: 'org_b', seq: 1 },
      { org_id: 'org_c', seq: 0 }, // restricted: as free
    ]);
    expect(await store.get(keys['org_a:1']!)).toBeNull();
    expect(await store.get(keys['org_b:1']!)).not.toBeNull();
    // The server-wide cap still wins over a plan.
    expect((await purgeReplays(db, store, 5)).rows).toBe(1); // org_b's 10-day-old chunk
  });
});
