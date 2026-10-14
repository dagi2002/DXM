import type { IngestEvent, IngestJob } from '@pulse/contracts/ingest';
import { createDatabase } from '@pulse/db';
import {
  FORM_ABANDON_GRACE_MINUTES,
  FORM_ABANDON_MIN_VISITS,
  JS_ERROR_MIN_VISITS,
  SLOW_PAGE_MIN_VISITS,
  U_TURN_MIN_VISITS,
  VERIFY_MIN_EXPOSED,
} from '@pulse/detectors';
import type { Boss } from '@pulse/jobs';
import { MemoryTelegramClient, TelegramError } from '@pulse/mail/telegram';
import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { recommendFix, parseSuggestion, type AiClient } from '../src/ai';
import { alertJobFor, formatAlert, sendTelegramAlert } from '../src/alerts';
import { detectSite } from '../src/detect';
import { applyIngest } from '../src/ingest';
import { checkTracking, liveSites, sweepTracking } from '../src/tracking';
import { issuesDueForVerification, sweepVerification, verifyIssue } from '../src/verify';

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
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const SITE_A = { siteId: 'site_a', orgId: 'org_a', k: 'pk_a' };
const SITE_B = { siteId: 'site_b', orgId: 'org_b', k: 'pk_b' };

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
    ('site_b','org_b','Shop B','shop-b.et','pk_b','{https://shop-b.et}','live')`);
});

let seq = 0;
/** One visit's batch through the real ingest path, landing at `at`. */
async function visit(visitId: string, at: Date, ev: IngestEvent[], site = SITE_A, net?: '3g' | '4g') {
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
      ctx: { vw: 390, vh: 844, plat: 'web', ...(net ? { net } : {}) },
      ev,
    },
  };
  expect((await applyIngest(database.db, job)).status).toBe('applied');
}
const vid = (prefix: string, i: number) => `${prefix}${String(i).padStart(6, '0')}`;
const issueRows = () => admin('select * from issues order by number');

describe('detectSite with the new detectors', () => {
  it('finds form abandonment, slow pages, JS errors and U-turns from ingested visits', async () => {
    const now = new Date();
    const early = new Date(now.getTime() - 2 * HOUR);
    const ts = early.getTime();
    for (let i = 0; i < FORM_ABANDON_MIN_VISITS; i++) {
      await visit(vid('form_', i), early, [
        { t: 'pv', ts, p: '/contact' },
        { t: 'fs', ts, p: '/contact', f: 'lead' },
        { t: 'fe', ts, p: '/contact', f: 'lead', n: 'phone', m: 'Invalid' },
      ]);
    }
    for (let i = 0; i < SLOW_PAGE_MIN_VISITS; i++) {
      await visit(
        vid('slow_', i),
        early,
        [{ t: 'vt', ts, p: '/products/1042', n: 'LCP', v: 9000 }],
        SITE_A,
        '3g',
      );
    }
    for (let i = 0; i < JS_ERROR_MIN_VISITS; i++) {
      await visit(vid('errs_', i), early, [
        { t: 'er', ts, p: '/blog', m: `boom at ${1000 + i}`, src: '/app.js?v=3' },
      ]);
    }
    for (let i = 0; i < U_TURN_MIN_VISITS; i++) {
      // One batch: the server time is shared, the client clock orders it.
      await visit(vid('turn_', i), early, [
        { t: 'pv', ts, p: '/products' },
        { t: 'pv', ts: ts + 4000, p: '/delivery' },
        { t: 'pv', ts: ts + 7000, p: '/products' },
      ]);
    }

    const res = await detectSite(database.db, { siteId: 'site_a', orgId: 'org_a' }, now);
    expect(res.created).toHaveLength(4);
    const { rows } = await issueRows();
    const byKind = Object.fromEntries(rows.map((r) => [r.kind, r]));
    expect(Object.keys(byKind).sort()).toEqual(['form_abandon', 'js_error', 'slow_page', 'u_turn']);
    expect(byKind.form_abandon.evidence).toMatchObject({
      type: 'form',
      path: '/contact',
      form: 'lead',
      visits: FORM_ABANDON_MIN_VISITS,
      errorFields: [{ field: 'phone', visits: FORM_ABANDON_MIN_VISITS, message: 'Invalid' }],
    });
    expect(byKind.slow_page.evidence).toMatchObject({
      type: 'slow_page',
      path: '/products/*',
      metric: 'LCP',
      p75: 9000,
      networks: [{ network: '3g', visits: SLOW_PAGE_MIN_VISITS, p75: 9000 }],
    });
    expect(byKind.js_error.evidence).toMatchObject({ message: 'boom at *', source: '/app.js' });
    expect(byKind.u_turn.evidence).toMatchObject({ path: '/delivery', medianSeconds: 3, rate: 1 });
    // Org B saw nothing.
    expect((await detectSite(database.db, { siteId: 'site_b', orgId: 'org_b' }, now)).findings).toBe(0);
  });

  it(`waits ${FORM_ABANDON_GRACE_MINUTES} minutes before calling an open visit's form abandoned`, async () => {
    const now = new Date();
    const recent = new Date(now.getTime() - (FORM_ABANDON_GRACE_MINUTES - 5) * 60_000);
    for (let i = 0; i < FORM_ABANDON_MIN_VISITS; i++) {
      await visit(vid('form_', i), recent, [{ t: 'fs', ts: recent.getTime(), p: '/contact', f: 'lead' }]);
    }
    expect((await detectSite(database.db, { siteId: 'site_a', orgId: 'org_a' }, now)).findings).toBe(0);
    const later = new Date(now.getTime() + 10 * 60_000);
    expect((await detectSite(database.db, { siteId: 'site_a', orgId: 'org_a' }, later)).created).toHaveLength(
      1,
    );
  });
});

/* ── Tracking broken ───────────────────────────────────────────────────────── */
describe('tracking-broken check', () => {
  /** `perDay` visits a day for the week before `lastAt`. */
  async function traffic(perDay: number, lastAt: Date, site = SITE_A) {
    let n = 0;
    for (let d = 7; d >= 1; d--) {
      for (let i = 0; i < perDay; i++) {
        const at = new Date(lastAt.getTime() - d * DAY + i * 60_000 + DAY - perDay * 60_000);
        await visit(vid(`t${site.siteId}_`, n++), at, [{ t: 'pv', ts: at.getTime(), p: '/' }], site);
      }
    }
  }

  it('opens a critical issue for a busy live site gone silent, refreshes it, and marks it fixed when data resumes', async () => {
    const now = new Date();
    const lastAt = new Date(now.getTime() - 10 * HOUR);
    await traffic(60, lastAt);
    expect(await liveSites(database.db)).toEqual(
      [SITE_A, SITE_B].map(({ siteId, orgId }) => ({ siteId, orgId })),
    );

    const first = await checkTracking(database.db, { siteId: 'site_a', orgId: 'org_a' }, now);
    expect(first.created).toHaveLength(1);
    let [row] = (await issueRows()).rows;
    expect(row).toMatchObject({
      kind: 'tracking_broken',
      severity: 'critical',
      status: 'open',
      site_id: 'site_a',
    });
    expect(row.evidence.type).toBe('tracking');
    expect(row.evidence.typicalDailyVisits).toBeCloseTo(60, 0);
    expect(row.evidence.silentHours).toBeGreaterThanOrEqual(10);

    const later = new Date(now.getTime() + HOUR);
    expect((await checkTracking(database.db, { siteId: 'site_a', orgId: 'org_a' }, later)).refreshed).toBe(1);

    // Data comes back.
    const back = new Date(later.getTime() + 30 * 60_000);
    await visit('back_000001', back, [{ t: 'pv', ts: back.getTime(), p: '/' }]);
    const resumed = await checkTracking(
      database.db,
      { siteId: 'site_a', orgId: 'org_a' },
      new Date(back.getTime() + 60_000),
    );
    expect(resumed.resumed).toEqual([row.id]);
    [row] = (await issueRows()).rows;
    expect(row.status).toBe('fixed');
    expect(new Date(row.fixed_at)).toEqual(back);
    const history = await admin(`select to_status, reason from issue_events order by created_at, id`);
    expect(history.rows.map((h) => h.reason)).toEqual(['detected', 'resumed']);
  });

  it('leaves quiet sites, paused sites and other orgs alone', async () => {
    const now = new Date();
    await traffic(2, new Date(now.getTime() - 3 * DAY)); // too small to judge
    await traffic(60, new Date(now.getTime() - 10 * HOUR), SITE_B);
    await admin(`update sites set status = 'paused' where id = 'site_b'`);
    expect(await sweepTracking(database.db, now)).toEqual([]);
    // Asked to check org B's site under org A's scope: RLS hides it.
    expect((await checkTracking(database.db, { siteId: 'site_b', orgId: 'org_a' }, now)).created).toEqual([]);
    expect((await issueRows()).rowCount).toBe(0);
  });
});

/* ── Verification ──────────────────────────────────────────────────────────── */
describe('issue.verify', () => {
  /** A rage-click issue on /checkout fixed at `fixedAt`, with traffic around it. */
  async function fixedIssue(
    fixedAt: Date,
    opts: { beforeRage: number; afterRage: number; afterVisits: number },
  ) {
    const before = new Date(fixedAt.getTime() - 2 * DAY);
    const after = new Date(fixedAt.getTime() + 5 * DAY);
    for (let i = 0; i < 40; i++) {
      const ev: IngestEvent[] = [{ t: 'pv', ts: before.getTime(), p: '/checkout' }];
      if (i < opts.beforeRage)
        ev.push({ t: 'rc', ts: before.getTime(), p: '/checkout', s: 'button.pay', n: 4 });
      await visit(vid('pre_', i), before, ev);
    }
    for (let i = 0; i < opts.afterVisits; i++) {
      const ev: IngestEvent[] = [{ t: 'pv', ts: after.getTime(), p: '/checkout' }];
      if (i < opts.afterRage)
        ev.push({ t: 'rc', ts: after.getTime(), p: '/checkout', s: 'button.pay', n: 4 });
      await visit(vid('post_', i), after, ev);
    }
    const evidence = {
      type: 'click',
      path: '/checkout',
      selector: 'button.pay',
      windowHours: 24,
      visits: opts.beforeRage,
      occurrences: opts.beforeRage,
      leftOnPage: 0,
      devices: { desktop: 0, mobile: opts.beforeRage, tablet: 0 },
      topBrowser: null,
      sampleVisitIds: [],
    };
    await admin(
      `insert into issues (id, org_id, site_id, number, kind, fingerprint, severity, status, evidence, first_seen, last_seen, fixed_at)
       values ('iss_v', 'org_a', 'site_a', 1, 'rage_click', 'fp', 'critical', 'fixed', $1, $2, $2, $3)`,
      [JSON.stringify(evidence), before, fixedAt],
    );
  }

  it('verifies a fix when the rate at least halved, and lists due issues across orgs', async () => {
    const fixedAt = new Date(Date.now() - 8 * DAY);
    await fixedIssue(fixedAt, { beforeRage: 20, afterRage: 2, afterVisits: 40 });
    expect(await issuesDueForVerification(database.db)).toEqual([{ issueId: 'iss_v', orgId: 'org_a' }]);
    const sent: unknown[] = [];
    const boss = { send: async (...args: unknown[]) => sent.push(args) } as unknown as Boss;
    expect(await sweepVerification(database.db, boss)).toBe(1);
    expect(sent).toEqual([['issue.verify', { issueId: 'iss_v', orgId: 'org_a' }, { singletonKey: 'iss_v' }]]);

    const res = await verifyIssue(database.db, { issueId: 'iss_v', orgId: 'org_a' });
    expect(res.status).toBe('verified');
    const [row] = (await issueRows()).rows;
    expect(row.status).toBe('verified');
    expect(row.verified_at).not.toBeNull();
    expect(row.verification).toMatchObject({
      outcome: 'verified',
      measure: 'rate',
      before: { affected: 20, exposed: 40, value: 0.5 },
      after: { affected: 2, exposed: 40, value: 0.05 },
    });
    const history = await admin('select from_status, to_status, reason, actor_user_id from issue_events');
    expect(history.rows).toEqual([
      { from_status: 'fixed', to_status: 'verified', reason: 'verified', actor_user_id: null },
    ]);
    expect(await issuesDueForVerification(database.db)).toEqual([]);
  });

  it('reopens a fix that did not work', async () => {
    await fixedIssue(new Date(Date.now() - 8 * DAY), { beforeRage: 20, afterRage: 15, afterVisits: 40 });
    const res = await verifyIssue(database.db, { issueId: 'iss_v', orgId: 'org_a' });
    expect(res).toMatchObject({ status: 'reopened', siteId: 'site_a' });
    const [row] = (await issueRows()).rows;
    expect(row).toMatchObject({ status: 'open', fixed_at: null });
    expect(row.verification.outcome).toBe('reopened');
  });

  it(`waits while the after window has fewer than ${VERIFY_MIN_EXPOSED} visits`, async () => {
    await fixedIssue(new Date(Date.now() - 8 * DAY), {
      beforeRage: 20,
      afterRage: 0,
      afterVisits: VERIFY_MIN_EXPOSED - 1,
    });
    expect((await verifyIssue(database.db, { issueId: 'iss_v', orgId: 'org_a' })).status).toBe('waiting');
    const [row] = (await issueRows()).rows;
    expect(row.status).toBe('fixed');
    expect(row.verification.outcome).toBe('waiting');
  });

  it('is not due before the after window ends, and never crosses orgs', async () => {
    await fixedIssue(new Date(Date.now() - 6 * DAY), { beforeRage: 20, afterRage: 0, afterVisits: 0 });
    expect(await issuesDueForVerification(database.db)).toEqual([]);
    expect((await verifyIssue(database.db, { issueId: 'iss_v', orgId: 'org_a' })).status).toBe('not_due');
    // Org B can't see (or verify) org A's issue.
    expect(
      (await verifyIssue(database.db, { issueId: 'iss_v', orgId: 'org_b' }, new Date(Date.now() + 9 * DAY)))
        .status,
    ).toBe('skipped');
  });
});

/* ── Telegram alerts ───────────────────────────────────────────────────────── */
describe('Telegram alerts', () => {
  async function openIssue(id: string, number: number, severity = 'critical', status = 'open') {
    const evidence = {
      type: 'click',
      path: '/checkout',
      selector: 'button.pay-telebirr',
      windowHours: 24,
      visits: 31,
      occurrences: 40,
      leftOnPage: 27,
      devices: { desktop: 0, mobile: 31, tablet: 0 },
      topBrowser: null,
      sampleVisitIds: [],
    };
    await admin(
      `insert into issues (id, org_id, site_id, number, kind, fingerprint, severity, status, evidence, first_seen, last_seen)
       values ($1, 'org_a', 'site_a', $2, 'rage_click', $1, $3, $4, $5, now(), now())`,
      [id, number, severity, status, JSON.stringify(evidence)],
    );
  }
  const link = (quiet: [number, number] | null = null, locale = 'en') =>
    admin(
      `insert into telegram_links (id, org_id, chat_id, chat_title, quiet_start, quiet_end, locale)
       values ('tgl_1', 'org_a', '-100123', 'Shop A team', $1, $2, $3)`,
      [quiet?.[0] ?? null, quiet?.[1] ?? null, locale],
    );
  const job = {
    orgId: 'org_a',
    siteId: 'site_a',
    alerts: [{ issueId: 'iss_1', reason: 'created' as const }],
  };

  it('builds one job per detection run with news, and none without', () => {
    expect(alertJobFor(SITE_A, { created: [], escalated: [], reopened: [] })).toBeNull();
    expect(
      alertJobFor({ siteId: 's', orgId: 'o' }, { created: ['a'], escalated: ['b'], reopened: ['c'] }),
    ).toEqual({
      siteId: 's',
      orgId: 'o',
      alerts: [
        { issueId: 'a', reason: 'created' },
        { issueId: 'b', reason: 'escalated' },
        { issueId: 'c', reason: 'reopened' },
      ],
    });
  });

  it('formats alerts in English and Amharic', () => {
    const item = {
      number: 12,
      kind: 'form_abandon' as const,
      severity: 'critical' as const,
      reason: 'reopened' as const,
      evidence: {
        type: 'form' as const,
        path: '/contact',
        form: 'lead',
        windowHours: 24,
        visits: 7,
        starts: 9,
        submits: 2,
        abandonRate: 0.778,
        errorFields: [],
        leftOnPage: 0,
        devices: { desktop: 0, mobile: 7, tablet: 0 },
        topBrowser: null,
        sampleVisitIds: [],
      },
      url: 'https://app.test/fixes/iss_1',
    };
    expect(formatAlert('en', 'Shop A', [item], 'https://app.test/today')).toBe(
      [
        'Shop A: 1 fix needs you',
        '',
        'Critical · Back again · #12',
        'Visitors give up on the lead form on /contact',
        '7 visitors in 24 h',
        'Open: https://app.test/fixes/iss_1',
      ].join('\n'),
    );
    const am = formatAlert('am', 'Shop A', [item], 'https://app.test/today');
    expect(am).toContain('አስቸኳይ · ተመልሶ መጣ · #12');
    expect(am).toContain('https://app.test/fixes/iss_1');
    const tracking = {
      ...item,
      kind: 'tracking_broken' as const,
      evidence: { type: 'tracking' as const, lastEventAt: null, silentHours: 9.6, typicalDailyVisits: 50 },
    };
    expect(formatAlert('en', 'Shop A', [tracking], 'x')).toContain(
      'Shop A stopped sending data\nNo data for 10 h',
    );
    // Long lists point to Today.
    const many = Array.from({ length: 7 }, (_, i) => ({ ...item, number: i + 1 }));
    const text = formatAlert('en', 'Shop A', many, 'https://app.test/today');
    expect(text.startsWith('Shop A: 7 fixes need you')).toBe(true);
    expect(text.match(/#\d+/g)).toHaveLength(5);
    expect(text.endsWith('Open: https://app.test/today')).toBe(true);
  });

  it('sends to the linked chat, skips orgs without one, and drops fixes that are no longer open', async () => {
    const client = new MemoryTelegramClient();
    await openIssue('iss_1', 1);
    expect(await sendTelegramAlert(database.db, client, 'https://app.test', job)).toEqual({
      status: 'no_link',
    });
    await link();
    expect(await sendTelegramAlert(database.db, client, 'https://app.test', job)).toEqual({
      status: 'sent',
      count: 1,
    });
    expect(client.sent).toHaveLength(1);
    expect(client.sent[0]!.chatId).toBe('-100123');
    expect(client.sent[0]!.text).toContain('People tap button.pay-telebirr again and again on /checkout');
    await admin(`update issues set status = 'dismissed'`);
    expect(await sendTelegramAlert(database.db, client, 'https://app.test', job)).toEqual({
      status: 'nothing',
    });
    // Org B's job can't reach org A's chat or issues.
    const other = await sendTelegramAlert(database.db, client, 'https://app.test', {
      ...job,
      orgId: 'org_b',
    });
    expect(other).toEqual({ status: 'no_link' });
  });

  it('defers during quiet hours until they end', async () => {
    await openIssue('iss_1', 1);
    await link([22, 7]);
    const client = new MemoryTelegramClient();
    const night = new Date('2026-10-14T20:30:00Z'); // 23:30 in Addis Ababa
    expect(await sendTelegramAlert(database.db, client, 'https://app.test', job, night)).toEqual({
      status: 'deferred',
      until: new Date('2026-10-15T04:00:00Z'),
    });
    expect(client.sent).toEqual([]);
    const morning = new Date('2026-10-15T04:00:00Z');
    expect((await sendTelegramAlert(database.db, client, 'https://app.test', job, morning)).status).toBe(
      'sent',
    );
  });

  it('unlinks a chat that blocked the bot, and retries other failures', async () => {
    await openIssue('iss_1', 1);
    await link();
    const client = new MemoryTelegramClient();
    client.failWith = new TelegramError(429, 'Too Many Requests');
    await expect(sendTelegramAlert(database.db, client, 'https://app.test', job)).rejects.toThrow(/429/);
    client.failWith = new TelegramError(403, 'Forbidden: bot was kicked from the group chat');
    expect(await sendTelegramAlert(database.db, client, 'https://app.test', job)).toEqual({
      status: 'unlinked',
    });
    expect((await admin('select count(*)::int as n from telegram_links')).rows[0].n).toBe(0);
  });
});

/* ── AI suggestions ────────────────────────────────────────────────────────── */
describe('ai.recommend', () => {
  const reply = JSON.stringify({
    text: 'A banner covers the button on small screens.',
    code: '.banner{position:static}',
  });
  function fakeAi(text = reply) {
    const calls: { system: string; prompt: string }[] = [];
    const client: AiClient = {
      complete: async (req) => {
        calls.push(req);
        return { text, model: 'test-model', inputTokens: 100, outputTokens: 50 };
      },
    };
    return { client, calls };
  }
  async function seedIssue(id = 'iss_ai', org = 'org_a', site = 'site_a') {
    const evidence = {
      type: 'click',
      path: '/checkout',
      selector: 'button.pay',
      windowHours: 24,
      visits: 5,
      occurrences: 5,
      leftOnPage: 0,
      devices: { desktop: 0, mobile: 5, tablet: 0 },
      topBrowser: null,
      sampleVisitIds: ['visit_secret_1'],
    };
    await admin(
      `insert into issues (id, org_id, site_id, number, kind, fingerprint, severity, status, evidence, first_seen, last_seen)
       values ($1, $2, $3, 1, 'rage_click', $1, 'critical', 'open', $4, now(), now())`,
      [id, org, site, JSON.stringify(evidence)],
    );
  }
  const on = { enabled: true, monthlyBudget: 2 };

  it('does nothing when AI is off', async () => {
    await seedIssue();
    const { client, calls } = fakeAi();
    expect(
      await recommendFix(
        database.db,
        client,
        { enabled: false, monthlyBudget: 9 },
        { issueId: 'iss_ai', orgId: 'org_a' },
      ),
    ).toEqual({
      status: 'disabled',
    });
    expect(await recommendFix(database.db, null, on, { issueId: 'iss_ai', orgId: 'org_a' })).toEqual({
      status: 'disabled',
    });
    expect(calls).toEqual([]);
  });

  it('stores one suggestion per evidence, never sends visitor ids, and caches', async () => {
    await seedIssue();
    const { client, calls } = fakeAi();
    expect(await recommendFix(database.db, client, on, { issueId: 'iss_ai', orgId: 'org_a' })).toEqual({
      status: 'created',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.prompt).toContain('button.pay');
    expect(calls[0]!.prompt).not.toContain('visit_secret_1');
    const { rows } = await admin('select org_id, issue_id, model, content, input_tokens from ai_artifacts');
    expect(rows).toEqual([
      {
        org_id: 'org_a',
        issue_id: 'iss_ai',
        model: 'test-model',
        content: { text: 'A banner covers the button on small screens.', code: '.banner{position:static}' },
        input_tokens: 100,
      },
    ]);
    expect(await recommendFix(database.db, client, on, { issueId: 'iss_ai', orgId: 'org_a' })).toEqual({
      status: 'cached',
    });
    expect(calls).toHaveLength(1);
  });

  it('respects the per-org monthly budget', async () => {
    await seedIssue('iss_1');
    await admin(`update issues set number = 2 where id = 'iss_1'`);
    await seedIssue('iss_2');
    await admin(`update issues set number = 3 where id = 'iss_2'`);
    await seedIssue('iss_3');
    await seedIssue('iss_b', 'org_b', 'site_b');
    const { client, calls } = fakeAi();
    const one = { enabled: true, monthlyBudget: 1 };
    expect((await recommendFix(database.db, client, one, { issueId: 'iss_1', orgId: 'org_a' })).status).toBe(
      'created',
    );
    expect((await recommendFix(database.db, client, one, { issueId: 'iss_2', orgId: 'org_a' })).status).toBe(
      'over_budget',
    );
    // Another org has its own budget.
    expect((await recommendFix(database.db, client, one, { issueId: 'iss_b', orgId: 'org_b' })).status).toBe(
      'created',
    );
    // And can't touch org A's issues.
    expect((await recommendFix(database.db, client, on, { issueId: 'iss_3', orgId: 'org_b' })).status).toBe(
      'skipped',
    );
    expect(calls).toHaveLength(2);
  });

  it('stores nothing when the reply is not the JSON we asked for', async () => {
    await seedIssue();
    const { client } = fakeAi('Sorry, I cannot help with that.');
    expect((await recommendFix(database.db, client, on, { issueId: 'iss_ai', orgId: 'org_a' })).status).toBe(
      'unparseable',
    );
    expect((await admin('select count(*)::int as n from ai_artifacts')).rows[0].n).toBe(0);
    expect(parseSuggestion('Here you go: {"text": "Do X", "code": ""}')).toEqual({
      text: 'Do X',
      code: null,
    });
    expect(parseSuggestion('{"code": "x"}')).toBeNull();
  });
});
