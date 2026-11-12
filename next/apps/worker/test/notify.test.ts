import { createDatabase } from '@pulse/db';
import type { Boss } from '@pulse/jobs';
import { MemoryMailer } from '@pulse/mail';
import { MemoryPushClient } from '@pulse/mail/push';
import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  digestWeek,
  formatDigest,
  hasActivity,
  sendWeeklyDigest,
  sweepDigest,
  type DigestData,
} from '../src/digest';
import { sendPushAlert } from '../src/push-alerts';

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

const APP = 'https://app.test';
/** The reported week: Monday 2 Nov → Sunday 8 Nov 2026 (UTC). */
const WEEK = '2026-11-02';
const IN_WEEK = '2026-11-04T10:00:00Z';
const BEFORE = '2026-10-20T10:00:00Z';

beforeEach(async () => {
  await admin(
    `truncate rollup_funnel_day, rollup_vitals_day, rollup_page_day, rollup_site_day, site_funnels,
     issue_events, issues, events, visits, audit_log, sites, org_plans, invitation, member, organization,
     verification, account, session, "user" cascade`,
  );
  await admin(`insert into "user" (id, name, email, locale) values
    ('u_owner','Tigist','owner@a.et','en'), ('u_dev','Abebe','dev@a.et','am'),
    ('u_client','Client','client@a.et','en'), ('u_b','Other','owner@b.et','en')`);
  await admin(
    `insert into organization (id, name, slug) values ('org_a','Shop A','org-a'), ('org_b','Shop B','org-b')`,
  );
  await admin(`insert into member (id, organization_id, user_id, role) values
    ('m1','org_a','u_owner','owner'), ('m2','org_a','u_dev','member'),
    ('m3','org_a','u_client','client_viewer'), ('m4','org_b','u_b','owner')`);
  await admin(`insert into sites (id, org_id, name, domain, public_key, allowed_origins, status) values
    ('site_a','org_a','Shop A web','shop-a.et','pk_a','{https://shop-a.et}','live'),
    ('site_b','org_b','Shop B web','shop-b.et','pk_b','{https://shop-b.et}','live')`);
});

async function issue(
  id: string,
  number: number,
  o: {
    org?: string;
    site?: string;
    status?: string;
    severity?: string;
    created?: string;
    fixed?: string | null;
    verified?: string | null;
    visits?: number;
  } = {},
) {
  const evidence = {
    type: 'click',
    selector: 'button.pay',
    path: '/checkout',
    windowHours: 24,
    visits: o.visits ?? 12,
    occurrences: 40,
    leftOnPage: 10,
    devices: { desktop: 0, mobile: o.visits ?? 12, tablet: 0 },
    topBrowser: null,
    sampleVisitIds: [],
  };
  await admin(
    `insert into issues (id, org_id, site_id, number, kind, fingerprint, severity, status, evidence,
                         first_seen, last_seen, fixed_at, verified_at, created_at)
     values ($1, $2, $3, $4, 'rage_click', $1, $5, $6, $7, $8, $8, $9, $10, $8)`,
    [
      id,
      o.org ?? 'org_a',
      o.site ?? 'site_a',
      number,
      o.severity ?? 'watch',
      o.status ?? 'open',
      JSON.stringify(evidence),
      o.created ?? IN_WEEK,
      o.fixed ?? null,
      o.verified ?? null,
    ],
  );
}

describe('weekly digest', () => {
  it('reports the 7 UTC days before the latest Monday', () => {
    expect(digestWeek(new Date('2026-11-09T04:13:00Z')).week).toBe('2026-11-02');
    expect(digestWeek(new Date('2026-11-12T12:00:00Z')).week).toBe('2026-11-02');
    expect(digestWeek(new Date('2026-11-08T23:59:59Z')).week).toBe('2026-10-26');
  });

  it('sends nothing to an org with no activity that week', async () => {
    // An old open fix and visits outside the week don't count as activity.
    await issue('iss_old', 1, { created: BEFORE });
    await admin(
      `insert into rollup_site_day (site_id, org_id, day, visits) values ('site_a','org_a','2026-10-20', 50)`,
    );
    const mailer = new MemoryMailer();
    expect(await sendWeeklyDigest(database.db, mailer, APP, { orgId: 'org_a', week: WEEK })).toEqual({
      status: 'quiet',
    });
    expect(mailer.outbox).toEqual([]);
    expect((await admin('select count(*)::int as n from notification_prefs')).rows[0].n).toBe(0);
  });

  it('emails each team member in their language, with fixes, the top fix, site health and unsubscribe', async () => {
    await issue('iss_new', 1, { created: IN_WEEK, severity: 'critical', visits: 30 });
    await issue('iss_small', 2, { created: IN_WEEK, visits: 50 });
    await issue('iss_fixed', 3, { created: BEFORE, status: 'fixed', fixed: IN_WEEK });
    await issue('iss_ver', 4, { created: BEFORE, status: 'verified', fixed: BEFORE, verified: IN_WEEK });
    await issue('iss_other_org', 1, { org: 'org_b', site: 'site_b', created: IN_WEEK });
    await admin(`insert into rollup_site_day (site_id, org_id, day, visits) values
      ('site_a','org_a','2026-11-03', 40), ('site_a','org_a','2026-10-28', 35)`);

    const mailer = new MemoryMailer();
    const result = await sendWeeklyDigest(database.db, mailer, APP, { orgId: 'org_a', week: WEEK });
    expect(result).toEqual({ status: 'sent', sent: 2, skipped: 0 });
    expect(mailer.outbox.map((m) => m.to).sort()).toEqual(['dev@a.et', 'owner@a.et']);

    const en = mailer.lastTo('owner@a.et')!;
    expect(en.subject).toBe('Shop A: your week on Pulse');
    expect(en.text).toContain('Fixes: 2 new, 1 marked fixed, 1 verified.');
    // Critical beats more visitors; the other org's fix never shows up.
    expect(en.text).toContain('#1 · Critical · People tap button.pay again and again on /checkout');
    expect(en.text).toContain(`${APP}/fixes/iss_new`);
    expect(en.text).toMatch(/Shop A web: health \d+/);
    expect(en.text).not.toContain('Shop B');
    const token = (await admin(`select unsubscribe_token from notification_prefs where user_id = 'u_owner'`))
      .rows[0].unsubscribe_token as string;
    expect(en.text).toContain(`${APP}/unsubscribe/${token}`);
    expect(en.headers).toEqual({
      'List-Unsubscribe': `<${APP}/api/v1/public/digest/unsubscribe/${token}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });

    const am = mailer.lastTo('dev@a.et')!;
    expect(am.subject).toBe('Shop A፦ የሳምንቱ ማጠቃለያ በPulse');
    expect(am.text).toContain('ጥገናዎች፦ 2 አዲስ');
    // Each member has their own token.
    expect(am.text).not.toContain(token);
  });

  it('skips members who unsubscribed and members already sent this week (a retried job)', async () => {
    await issue('iss_new', 1);
    const mailer = new MemoryMailer();
    await sendWeeklyDigest(database.db, mailer, APP, { orgId: 'org_a', week: WEEK });
    expect(mailer.outbox).toHaveLength(2);

    const again = await sendWeeklyDigest(database.db, mailer, APP, { orgId: 'org_a', week: WEEK });
    expect(again).toEqual({ status: 'sent', sent: 0, skipped: 2 });
    expect(mailer.outbox).toHaveLength(2);

    await admin(`update notification_prefs set weekly_digest = false where user_id = 'u_dev'`);
    const next = await sendWeeklyDigest(database.db, mailer, APP, { orgId: 'org_a', week: '2026-11-09' });
    // Nothing happened in the week of 9 Nov.
    expect(next).toEqual({ status: 'quiet' });
    await issue('iss_later', 2, { created: '2026-11-10T08:00:00Z' });
    expect(await sendWeeklyDigest(database.db, mailer, APP, { orgId: 'org_a', week: '2026-11-09' })).toEqual({
      status: 'sent',
      sent: 1,
      skipped: 1,
    });
    expect(mailer.outbox.at(-1)!.to).toBe('owner@a.et');
  });

  it('switches off through the one-click helper, for that member only', async () => {
    await issue('iss_new', 1);
    await sendWeeklyDigest(database.db, new MemoryMailer(), APP, { orgId: 'org_a', week: WEEK });
    const token = (await admin(`select unsubscribe_token from notification_prefs where user_id = 'u_dev'`))
      .rows[0].unsubscribe_token;
    // As the app role, with no org scope at all (the public unsubscribe route has none).
    const app = new pg.Client({ connectionString: APP_DB });
    await app.connect();
    const res = await app
      .query('select pulse_digest_unsubscribe($1) as ok', [token])
      .finally(() => app.end());
    expect(res.rows[0].ok).toBe(true);
    const prefs = await admin(`select user_id, weekly_digest from notification_prefs order by user_id`);
    expect(prefs.rows).toEqual([
      { user_id: 'u_dev', weekly_digest: false },
      { user_id: 'u_owner', weekly_digest: true },
    ]);
  });

  it('queues one job per org with sites, keyed by org and week', async () => {
    const sent: { name: string; data: unknown; opts: { singletonKey?: string } }[] = [];
    const boss = {
      send: async (name: string, data: unknown, opts: { singletonKey?: string }) => {
        sent.push({ name, data, opts });
        return 'id';
      },
    } as unknown as Boss;
    expect(await sweepDigest(database.db, boss, new Date('2026-11-09T04:13:00Z'))).toBe(2);
    expect(sent.map((s) => [s.name, s.data, s.opts.singletonKey])).toEqual([
      ['digest.org', { orgId: 'org_a', week: WEEK }, `org_a:${WEEK}`],
      ['digest.org', { orgId: 'org_b', week: WEEK }, `org_b:${WEEK}`],
    ]);
  });

  it('formats the health change and the empty states in both languages', () => {
    const data: DigestData = {
      org: 'Shop',
      opened: 0,
      fixed: 0,
      verified: 0,
      topFix: null,
      sites: [
        { name: 'Up', score: 80, previous: 70, visits: 100 },
        { name: 'Down', score: 60, previous: 65, visits: 100 },
        { name: 'Same', score: 50, previous: 50, visits: 100 },
        { name: 'New', score: 90, previous: null, visits: 100 },
        { name: 'Tiny', score: null, previous: null, visits: 1 },
      ],
    };
    expect(hasActivity(data)).toBe(true);
    expect(hasActivity({ ...data, sites: data.sites.map((s) => ({ ...s, visits: 0 })) })).toBe(false);
    const ctx = {
      start: new Date('2026-11-02T00:00:00Z'),
      end: new Date('2026-11-09T00:00:00Z'),
      appUrl: APP,
      unsubscribeUrl: `${APP}/unsubscribe/x`,
    };
    const en = formatDigest('en', data, ctx).text;
    expect(en).toContain('Here is last week for Shop (2 Nov 2026 – 8 Nov 2026).');
    expect(en).toContain('No open fixes right now.');
    expect(en).toContain('Up: health 80 (up 10 on the week before)');
    expect(en).toContain('Down: health 60 (down 5 on the week before)');
    expect(en).toContain('Same: health 50 (no change on the week before)');
    expect(en).toContain('New: health 90');
    expect(en).toContain('Tiny: not enough visits for a health score yet (1 visit)');
    const am = formatDigest('am', data, ctx).text;
    expect(am).toContain('Up፦ ጤና 80 (ካለፈው ሳምንት በ10 ጨምሯል)');
    expect(am).toContain('አሁን ክፍት ጥገና የለም።');
    // Amharic readers get Ethiopian calendar dates.
    expect(am).toContain('ዓ.ም');
  });
});

describe('web push alerts', () => {
  const job = {
    orgId: 'org_a',
    siteId: 'site_a',
    alerts: [
      { issueId: 'iss_1', reason: 'created' as const },
      { issueId: 'iss_2', reason: 'escalated' as const },
    ],
  };
  const subscribe = (id: string, userId: string, endpoint: string, org = 'org_a') =>
    admin(
      `insert into push_subscriptions (id, org_id, user_id, endpoint, p256dh, auth) values ($1, $2, $3, $4, 'k', 'a')`,
      [id, org, userId, endpoint],
    );
  const EP = (n: string) => `https://fcm.googleapis.com/fcm/send/${n}`;

  it('sends one notification per browser of the team, in each member’s language', async () => {
    await issue('iss_1', 1, { visits: 9 });
    await issue('iss_2', 2, { severity: 'critical' });
    await subscribe('ps_owner', 'u_owner', EP('owner'));
    await subscribe('ps_dev', 'u_dev', EP('dev'));
    await subscribe('ps_client', 'u_client', EP('client'));
    await subscribe('ps_b', 'u_b', EP('b'), 'org_b');
    const client = new MemoryPushClient();
    const result = await sendPushAlert(database.db, client, APP, job);
    expect(result).toEqual({ status: 'sent', delivered: 2, removed: 0, failed: 0 });
    // Client viewers and other orgs get nothing.
    expect(client.sent.map((s) => s.endpoint).sort()).toEqual([EP('dev'), EP('owner')]);
    const en = client.sent.find((s) => s.endpoint === EP('owner'))!.message;
    expect(en).toEqual({
      title: 'Shop A web: 2 fixes need you',
      body: 'Now critical · People tap button.pay again and again on /checkout\nand 1 more',
      url: `${APP}/today`,
      tag: 'site:site_a',
    });
    const am = client.sent.find((s) => s.endpoint === EP('dev'))!.message;
    expect(am.title).toContain('ጥገናዎች ይጠብቁዎታል');
    const ok = await admin(`select id from push_subscriptions where last_success_at is not null order by id`);
    expect(ok.rows.map((r) => r.id)).toEqual(['ps_dev', 'ps_owner']);
  });

  it('links straight to the fix when there is one', async () => {
    await issue('iss_1', 1);
    await subscribe('ps_owner', 'u_owner', EP('owner'));
    const client = new MemoryPushClient();
    await sendPushAlert(database.db, client, APP, { ...job, alerts: [job.alerts[0]!] });
    expect(client.sent[0]!.message).toMatchObject({
      title: 'Shop A web: 1 fix needs you',
      url: `${APP}/fixes/iss_1`,
    });
  });

  it('waits for the same quiet hours as Telegram', async () => {
    await issue('iss_1', 1);
    await subscribe('ps_owner', 'u_owner', EP('owner'));
    await admin(`insert into notification_settings (org_id, quiet_start, quiet_end) values ('org_a', 22, 7)`);
    const client = new MemoryPushClient();
    const night = new Date('2026-10-14T20:30:00Z'); // 23:30 in Addis Ababa
    expect(await sendPushAlert(database.db, client, APP, job, night)).toEqual({
      status: 'deferred',
      until: new Date('2026-10-15T04:00:00Z'),
    });
    expect(client.sent).toEqual([]);
    // 06:59:59 is still quiet; 07:00 sends.
    expect(
      (await sendPushAlert(database.db, client, APP, job, new Date('2026-10-15T03:59:59Z'))).status,
    ).toBe('deferred');
    expect(
      (await sendPushAlert(database.db, client, APP, job, new Date('2026-10-15T04:00:00Z'))).status,
    ).toBe('sent');
    // Org B has no quiet hours of its own.
    await issue('iss_b', 1, { org: 'org_b', site: 'site_b' });
    await subscribe('ps_b', 'u_b', EP('b'), 'org_b');
    const b = await sendPushAlert(
      database.db,
      client,
      APP,
      { orgId: 'org_b', siteId: 'site_b', alerts: [{ issueId: 'iss_b', reason: 'created' }] },
      night,
    );
    expect(b.status).toBe('sent');
  });

  it('deletes subscriptions the push service says are gone, and skips fixes no longer open', async () => {
    await issue('iss_1', 1);
    await issue('iss_2', 2, { status: 'fixed', fixed: IN_WEEK });
    await subscribe('ps_owner', 'u_owner', EP('owner'));
    await subscribe('ps_dev', 'u_dev', EP('dev'));
    const client = new MemoryPushClient();
    client.gone.add(EP('dev'));
    expect(await sendPushAlert(database.db, client, APP, job)).toEqual({
      status: 'sent',
      delivered: 1,
      removed: 1,
      failed: 0,
    });
    expect(client.sent[0]!.message.title).toBe('Shop A web: 1 fix needs you');
    expect((await admin('select id from push_subscriptions')).rows).toEqual([{ id: 'ps_owner' }]);

    await admin(`update issues set status = 'dismissed'`);
    expect((await sendPushAlert(database.db, client, APP, job)).status).toBe('nothing');
  });

  it('does nothing for an org with no subscribers, and never reads another org’s issues', async () => {
    await issue('iss_b', 1, { org: 'org_b', site: 'site_b' });
    await subscribe('ps_owner', 'u_owner', EP('owner'));
    expect(await sendPushAlert(database.db, new MemoryPushClient(), APP, { ...job, orgId: 'org_b' })).toEqual(
      {
        status: 'no_subscribers',
      },
    );
    // org_a's scope can't see org_b's issue even when the job names it.
    expect(
      (
        await sendPushAlert(database.db, new MemoryPushClient(), APP, {
          orgId: 'org_a',
          siteId: 'site_b',
          alerts: [{ issueId: 'iss_b', reason: 'created' }],
        })
      ).status,
    ).toBe('nothing');
  });
});
