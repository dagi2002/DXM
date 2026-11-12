import { createECDH, randomBytes } from 'node:crypto';
import { NotificationSettings, TelegramStatus } from '@pulse/contracts';
import { MemoryPushClient, generateVapidKeys } from '@pulse/mail/push';
import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { redactPath } from '../src/routes/public-reports';
import {
  Client,
  TEST_DATABASE_URL,
  adminQuery,
  createTestContext,
  resetDatabase,
  signUp,
  signUpWithOrg,
  type TestContext,
} from './helpers';

const vapid = generateVapidKeys();
const push = new MemoryPushClient();
const on = createTestContext(
  { VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey },
  { push },
);
const off = createTestContext();
beforeEach(async () => {
  await resetDatabase();
  push.sent.length = 0;
  push.gone.clear();
});
afterAll(async () => {
  await on.database.close();
  await off.database.close();
});

/** What a browser's `PushSubscription.toJSON()` gives. */
function browserSubscription(
  endpoint = `https://fcm.googleapis.com/fcm/send/${randomBytes(8).toString('hex')}`,
) {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    endpoint,
    keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') },
  };
}

async function inviteAndJoin(ctx: TestContext, owner: Client, email: string, role: string) {
  const inv = await owner.post('/api/auth/organization/invite-member', { email, role });
  expect(inv.status).toBe(200);
  const id = ctx.mailer.lastTo(email)!.text.match(/accept-invitation\/(\S+)/)![1]!;
  const invitee = await signUp(ctx.app, email);
  expect((await invitee.post('/api/auth/organization/accept-invitation', { invitationId: id })).status).toBe(
    200,
  );
  return invitee;
}

const settingsOf = async (client: Client) =>
  NotificationSettings.parse((await client.get('/api/v1/notifications')).body);

describe('web push settings', () => {
  it('says "not configured" without VAPID keys and refuses subscriptions', async () => {
    const { client } = await signUpWithOrg(off.app, 'a@shop.et');
    expect(await settingsOf(client)).toEqual({
      quietHours: { quietStart: null, quietEnd: null, timeZone: 'Africa/Addis_Ababa' },
      weeklyDigest: true,
      push: { configured: false, publicKey: null, devices: 0 },
    });
    expect((await client.post('/api/v1/notifications/push', browserSubscription())).status).toBe(409);
    expect((await client.post('/api/v1/notifications/push/test')).status).toBe(409);
  });

  it('gives the public key, stores this browser once, sends a test and removes it', async () => {
    const { client } = await signUpWithOrg(on.app, 'a@shop.et', 'Shop');
    expect((await settingsOf(client)).push).toEqual({
      configured: true,
      publicKey: vapid.publicKey,
      devices: 0,
    });
    const sub = browserSubscription();
    const res = await client.post('/api/v1/notifications/push', sub);
    expect(res.status).toBe(201);
    expect(NotificationSettings.parse(res.body).push.devices).toBe(1);
    // Subscribing again (keys refreshed) updates the same row.
    expect(
      (await client.post('/api/v1/notifications/push', { ...sub, keys: browserSubscription().keys })).status,
    ).toBe(201);
    expect((await settingsOf(client)).push.devices).toBe(1);

    expect((await client.post('/api/v1/notifications/push/test')).body).toEqual({ sent: 1 });
    expect(push.sent).toEqual([
      {
        endpoint: sub.endpoint,
        message: expect.objectContaining({ title: 'Pulse — test', body: expect.stringContaining('Shop') }),
      },
    ]);

    const del = await client.delete('/api/v1/notifications/push', { endpoint: sub.endpoint });
    expect(NotificationSettings.parse(del.body).push.devices).toBe(0);
    expect((await client.post('/api/v1/notifications/push/test')).status).toBe(404);
  });

  it('rejects endpoints that are not browser push services, and malformed keys', async () => {
    const { client } = await signUpWithOrg(on.app, 'a@shop.et');
    for (const endpoint of ['https://evil.example/collect', 'http://fcm.googleapis.com/fcm/send/x']) {
      expect((await client.post('/api/v1/notifications/push', browserSubscription(endpoint))).status).toBe(
        400,
      );
    }
    const sub = browserSubscription();
    expect(
      (await client.post('/api/v1/notifications/push', { ...sub, keys: { ...sub.keys, p256dh: 'short' } }))
        .status,
    ).toBe(400);
    expect((await adminQuery('select count(*)::int as n from push_subscriptions')).rows[0]!.n).toBe(0);
  });

  it('drops a subscription the push service says is gone', async () => {
    const { client } = await signUpWithOrg(on.app, 'a@shop.et');
    const sub = browserSubscription();
    await client.post('/api/v1/notifications/push', sub);
    push.gone.add(sub.endpoint);
    expect((await client.post('/api/v1/notifications/push/test')).status).toBe(502);
    expect((await settingsOf(client)).push.devices).toBe(0);
  });

  it('keeps subscriptions per member: nobody sees or removes another member’s browsers', async () => {
    const owner = await signUpWithOrg(on.app, 'owner@shop.et', 'Shop');
    const dev = await inviteAndJoin(on, owner.client, 'dev@shop.et', 'member');
    const sub = browserSubscription();
    await owner.client.post('/api/v1/notifications/push', sub);
    expect((await settingsOf(dev)).push.devices).toBe(0);
    await dev.delete('/api/v1/notifications/push', { endpoint: sub.endpoint });
    expect((await settingsOf(owner.client)).push.devices).toBe(1);
    expect((await dev.post('/api/v1/notifications/push/test')).status).toBe(404);
    expect(push.sent).toEqual([]);
  });

  it('isolates orgs: another org never sees, tests or removes these subscriptions', async () => {
    const a = await signUpWithOrg(on.app, 'owner@shop.et', 'Shop');
    const b = await signUpWithOrg(on.app, 'owner@other.et', 'Other');
    const sub = browserSubscription();
    await a.client.post('/api/v1/notifications/push', sub);
    expect((await settingsOf(b.client)).push.devices).toBe(0);
    expect((await b.client.post('/api/v1/notifications/push/test')).status).toBe(404);
    await b.client.delete('/api/v1/notifications/push', { endpoint: sub.endpoint });
    expect((await settingsOf(a.client)).push.devices).toBe(1);

    // The same browser can subscribe in another org: a separate row, scoped to that org.
    expect((await b.client.post('/api/v1/notifications/push', sub)).status).toBe(201);
    const rows = await adminQuery('select org_id from push_subscriptions order by org_id');
    expect(rows.rows.map((r) => r.org_id).sort()).toEqual([a.orgId, b.orgId].sort());

    // At the database: the app role only ever sees its own org's rows, and can't write into another.
    const db = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await db.connect();
    try {
      await db.query(`select set_config('app.org_id', $1, false)`, [b.orgId]);
      const seen = await db.query('select org_id from push_subscriptions');
      expect(seen.rows).toEqual([{ org_id: b.orgId }]);
      await expect(
        db.query(
          `insert into push_subscriptions (id, org_id, user_id, endpoint, p256dh, auth)
           select 'x', $1, user_id, 'https://fcm.googleapis.com/x', 'k', 'a' from push_subscriptions limit 1`,
          [a.orgId],
        ),
      ).rejects.toThrow(/row-level security|violates/);
    } finally {
      await db.end();
    }
  });

  it('hides notifications from client viewers', async () => {
    const owner = await signUpWithOrg(on.app, 'owner@shop.et', 'Shop');
    const viewer = await inviteAndJoin(on, owner.client, 'client@shop.et', 'client_viewer');
    expect((await viewer.get('/api/v1/notifications')).status).toBe(403);
    expect((await viewer.post('/api/v1/notifications/push', browserSubscription())).status).toBe(403);
  });

  it('removes a member’s subscriptions when they leave the org', async () => {
    const owner = await signUpWithOrg(on.app, 'owner@shop.et', 'Shop');
    const dev = await inviteAndJoin(on, owner.client, 'dev@shop.et', 'member');
    await dev.post('/api/v1/notifications/push', browserSubscription());
    await adminQuery(`delete from member where role = 'member'`);
    expect((await adminQuery('select count(*)::int as n from push_subscriptions')).rows[0]!.n).toBe(0);
  });
});

describe('quiet hours (shared by Telegram and push)', () => {
  it('owners set them once for every channel; members read them', async () => {
    const owner = await signUpWithOrg(on.app, 'owner@shop.et', 'Shop');
    const dev = await inviteAndJoin(on, owner.client, 'dev@shop.et', 'member');
    const res = await owner.client.put('/api/v1/notifications/quiet-hours', { quietStart: 22, quietEnd: 7 });
    expect(res.status).toBe(200);
    expect(NotificationSettings.parse(res.body).quietHours).toEqual({
      quietStart: 22,
      quietEnd: 7,
      timeZone: 'Africa/Addis_Ababa',
    });
    expect((await settingsOf(dev)).quietHours.quietStart).toBe(22);
    expect(
      (await dev.put('/api/v1/notifications/quiet-hours', { quietStart: null, quietEnd: null })).status,
    ).toBe(403);
    const audit = await adminQuery(
      `select action, metadata from audit_log where action like 'notifications.%'`,
    );
    expect(audit.rows).toEqual([
      { action: 'notifications.quiet_hours', metadata: { quietStart: 22, quietEnd: 7 } },
    ]);
    // Off again.
    await owner.client.put('/api/v1/notifications/quiet-hours', { quietStart: null, quietEnd: null });
    expect((await settingsOf(owner.client)).quietHours.quietStart).toBeNull();
  });

  it('validates both ends', async () => {
    const { client } = await signUpWithOrg(on.app, 'owner@shop.et');
    const put = (body: unknown) => client.put('/api/v1/notifications/quiet-hours', body);
    expect((await put({ quietStart: 22, quietEnd: null })).status).toBe(400);
    expect((await put({ quietStart: 7, quietEnd: 7 })).status).toBe(400);
    expect((await put({ quietStart: 24, quietEnd: 7 })).status).toBe(400);
  });

  it('is what the Telegram settings show, and isolated per org', async () => {
    const tg = createTestContext({
      TELEGRAM_BOT_TOKEN: '123:test-token',
      TELEGRAM_BOT_USERNAME: 'DxmPulseBot',
      TELEGRAM_WEBHOOK_SECRET: 'webhook-secret-0123456789',
    });
    try {
      const a = await signUpWithOrg(tg.app, 'owner@shop.et', 'Shop');
      const b = await signUpWithOrg(tg.app, 'owner@other.et', 'Other');
      await adminQuery(
        `insert into telegram_links (id, org_id, chat_id) values ('tgl_a', $1, '-1'), ('tgl_b', $2, '-2')`,
        [a.orgId, b.orgId],
      );
      await a.client.put('/api/v1/notifications/quiet-hours', { quietStart: 21, quietEnd: 6 });
      expect(TelegramStatus.parse((await a.client.get('/api/v1/telegram')).body).link).toMatchObject({
        quietStart: 21,
        quietEnd: 6,
      });
      expect(TelegramStatus.parse((await b.client.get('/api/v1/telegram')).body).link).toMatchObject({
        quietStart: null,
        quietEnd: null,
      });
      expect((await settingsOf(b.client)).quietHours.quietStart).toBeNull();
    } finally {
      await tg.database.close();
    }
  });
});

describe('Monday digest preference and unsubscribe', () => {
  const tokenOf = async (email: string) =>
    (
      await adminQuery<{ unsubscribe_token: string; weekly_digest: boolean }>(
        `select p.unsubscribe_token, p.weekly_digest from notification_prefs p
           join "user" u on u.id = p.user_id where u.email = $1`,
        [email],
      )
    ).rows[0];

  it('is on by default and each member switches their own', async () => {
    const owner = await signUpWithOrg(on.app, 'owner@shop.et', 'Shop');
    const dev = await inviteAndJoin(on, owner.client, 'dev@shop.et', 'member');
    const res = await dev.put('/api/v1/notifications/digest', { weeklyDigest: false });
    expect(NotificationSettings.parse(res.body).weeklyDigest).toBe(false);
    expect((await settingsOf(owner.client)).weeklyDigest).toBe(true);
    expect((await settingsOf(dev)).weeklyDigest).toBe(false);
    await dev.put('/api/v1/notifications/digest', { weeklyDigest: true });
    expect((await settingsOf(dev)).weeklyDigest).toBe(true);
    expect((await dev.put('/api/v1/notifications/digest', { weeklyDigest: 'no' })).status).toBe(400);
  });

  it('unsubscribes with the email link only by POST, only that member, and keeps tokens out of logs', async () => {
    const owner = await signUpWithOrg(on.app, 'owner@shop.et', 'Shop');
    const dev = await inviteAndJoin(on, owner.client, 'dev@shop.et', 'member');
    await owner.client.put('/api/v1/notifications/digest', { weeklyDigest: true });
    await dev.put('/api/v1/notifications/digest', { weeklyDigest: true });
    const token = (await tokenOf('dev@shop.et'))!.unsubscribe_token;
    expect(token).toMatch(/^[A-Za-z0-9]{32}$/);

    const anon = new Client(on.app);
    // A link scanner's GET changes nothing.
    expect((await anon.get(`/api/v1/public/digest/unsubscribe/${token}`)).status).toBe(404);
    expect((await tokenOf('dev@shop.et'))!.weekly_digest).toBe(true);

    // One-click (RFC 8058): mail clients POST without an Origin header.
    const res = await on.app.request(`/api/v1/public/digest/unsubscribe/${token}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=One-Click',
    });
    expect(res.status).toBe(200);
    expect((await tokenOf('dev@shop.et'))!.weekly_digest).toBe(false);
    expect((await tokenOf('owner@shop.et'))!.weekly_digest).toBe(true);
    // Idempotent.
    expect((await anon.post(`/api/v1/public/digest/unsubscribe/${token}`)).status).toBe(200);

    for (const bad of ['A'.repeat(32), 'short', '%27%20or%201%3D1--']) {
      expect((await anon.post(`/api/v1/public/digest/unsubscribe/${bad}`)).status).toBe(404);
    }
    expect(redactPath(`/api/v1/public/digest/unsubscribe/${token}`)).toBe(
      '/api/v1/public/digest/unsubscribe/:token',
    );
  });
});
