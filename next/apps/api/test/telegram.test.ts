import { PublicConfig, TelegramLinkCode, TelegramStatus } from '@pulse/contracts';
import { MemoryTelegramClient } from '@pulse/mail/telegram';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { hashCode } from '../src/routes/telegram';
import {
  Client,
  adminQuery,
  createTestContext,
  resetDatabase,
  signUp,
  signUpWithOrg,
  type TestContext,
} from './helpers';

const SECRET = 'webhook-secret-0123456789';
const tg = new MemoryTelegramClient();
const on = createTestContext(
  {
    TELEGRAM_BOT_TOKEN: '123:test-token',
    TELEGRAM_BOT_USERNAME: 'DxmPulseBot',
    TELEGRAM_WEBHOOK_SECRET: SECRET,
  },
  { telegram: tg },
);
const off = createTestContext();
beforeEach(async () => {
  await resetDatabase();
  tg.sent.length = 0;
});
afterAll(async () => {
  await on.database.close();
  await off.database.close();
});

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

/** Telegram calling our webhook. */
const webhook = (ctx: TestContext, update: unknown, secret: string | null = SECRET) =>
  ctx.app.request('/api/v1/telegram/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(secret ? { 'x-telegram-bot-api-secret-token': secret } : {}),
    },
    body: JSON.stringify(update),
  });
const start = (code: string, chatId = -100777, title = 'Shop team') => ({
  update_id: 1,
  message: { message_id: 1, text: `/start ${code}`, chat: { id: chatId, type: 'group', title } },
});

async function linkedOrg(email = 'owner@shop.et') {
  const owner = await signUpWithOrg(on.app, email, 'Shop');
  const res = await owner.client.post('/api/v1/telegram/link-code');
  expect(res.status).toBe(201);
  const code = TelegramLinkCode.parse(res.body);
  expect((await webhook(on, start(code.code))).status).toBe(200);
  return owner;
}

describe('public config', () => {
  it('says whether Telegram and AI are available, and AI is off by default', async () => {
    const cfg = PublicConfig.parse((await new Client(off.app).get('/api/v1/public-config')).body);
    expect(cfg).toEqual({ googleEnabled: false, aiEnabled: false, telegramEnabled: false });
    expect(
      PublicConfig.parse((await new Client(on.app).get('/api/v1/public-config')).body).telegramEnabled,
    ).toBe(true);
    // AI needs both the switch and a key.
    const switchOnly = createTestContext({ AI_ENABLED: '1' });
    const both = createTestContext({ AI_ENABLED: '1', ANTHROPIC_API_KEY: 'sk-test' });
    try {
      expect((await new Client(switchOnly.app).get('/api/v1/public-config')).body.aiEnabled).toBe(false);
      expect((await new Client(both.app).get('/api/v1/public-config')).body.aiEnabled).toBe(true);
    } finally {
      await switchOnly.database.close();
      await both.database.close();
    }
  });
});

describe('Telegram settings', () => {
  it('reports "not set up" without a bot token and refuses to make a link', async () => {
    const { client } = await signUpWithOrg(off.app, 'a@shop.et');
    const status = TelegramStatus.parse((await client.get('/api/v1/telegram')).body);
    expect(status).toEqual({ configured: false, botUsername: null, link: null });
    expect((await client.post('/api/v1/telegram/link-code')).status).toBe(409);
  });

  it('links a chat through a one-time /start code and confirms in the chat', async () => {
    const { client } = await signUpWithOrg(on.app, 'owner@shop.et', 'Shop');
    const res = await client.post('/api/v1/telegram/link-code');
    expect(res.status).toBe(201);
    const code = TelegramLinkCode.parse(res.body);
    expect(code.url).toBe(`https://t.me/DxmPulseBot?start=${code.code}`);
    // Only the hash is stored.
    const stored = await adminQuery('select code_hash from telegram_link_codes');
    expect(stored.rows).toEqual([{ code_hash: hashCode(code.code) }]);

    expect((await webhook(on, start(code.code))).status).toBe(200);
    expect(tg.sent).toEqual([
      {
        chatId: '-100777',
        text: 'This chat now gets Pulse alerts for Shop. Change quiet hours or unlink in Settings.',
      },
    ]);
    const status = TelegramStatus.parse((await client.get('/api/v1/telegram')).body);
    expect(status).toMatchObject({
      configured: true,
      botUsername: 'DxmPulseBot',
      link: {
        chatTitle: 'Shop team',
        quietStart: null,
        quietEnd: null,
        timeZone: 'Africa/Addis_Ababa',
        locale: 'en',
      },
    });

    // Single use: the same code again only gets "expired".
    expect((await webhook(on, start(code.code, -100888))).status).toBe(200);
    expect(tg.sent.at(-1)!.text).toMatch(/expired/);
    expect((await adminQuery('select chat_id from telegram_links')).rows).toEqual([{ chat_id: '-100777' }]);
  });

  it('rejects webhook calls without the secret and ignores expired codes and noise', async () => {
    const { client } = await signUpWithOrg(on.app, 'owner@shop.et');
    const code = TelegramLinkCode.parse((await client.post('/api/v1/telegram/link-code')).body);
    expect((await webhook(on, start(code.code), null)).status).toBe(401);
    expect((await webhook(on, start(code.code), 'wrong-secret-0123456789xx')).status).toBe(401);
    expect((await webhook(off, start(code.code), SECRET)).status).toBe(401); // no secret configured
    expect((await webhook(on, { update_id: 2, message: { text: 'hello', chat: { id: 1 } } })).status).toBe(
      200,
    );
    expect((await webhook(on, { update_id: 3 })).status).toBe(200);
    await adminQuery(`update telegram_link_codes set expires_at = now() - interval '1 minute'`);
    expect((await webhook(on, start(code.code))).status).toBe(200);
    expect((await adminQuery('select count(*)::int as n from telegram_links')).rows[0]!.n).toBe(0);
    expect((await adminQuery('select count(*)::int as n from telegram_link_codes')).rows[0]!.n).toBe(0);
  });

  it('sets quiet hours and language, sends a test, and unlinks', async () => {
    const { client } = await linkedOrg();
    const bad = await client.patch('/api/v1/telegram', { quietStart: 22, quietEnd: null, locale: 'en' });
    expect(bad.status).toBe(400);
    expect(
      (await client.patch('/api/v1/telegram', { quietStart: 7, quietEnd: 7, locale: 'en' })).status,
    ).toBe(400);
    const ok = await client.patch('/api/v1/telegram', { quietStart: 22, quietEnd: 7, locale: 'am' });
    expect(ok.status).toBe(200);
    expect(TelegramStatus.parse(ok.body).link).toMatchObject({ quietStart: 22, quietEnd: 7, locale: 'am' });

    expect((await client.post('/api/v1/telegram/test')).status).toBe(200);
    expect(tg.sent.at(-1)).toEqual({ chatId: '-100777', text: 'ከPulse የተላከ ሙከራ፦ የShop ማሳወቂያዎች እዚህ ይደርሳሉ።' });

    const audit = await adminQuery(
      `select action from audit_log where target_type = 'telegram_link' order by created_at`,
    );
    expect(audit.rows.map((r) => r.action)).toEqual(['telegram.updated']);
    const del = await client.delete('/api/v1/telegram');
    expect(del.status).toBe(200);
    expect(TelegramStatus.parse(del.body).link).toBeNull();
    expect((await client.delete('/api/v1/telegram')).status).toBe(404);
    expect((await client.post('/api/v1/telegram/test')).status).toBe(404);
  });

  it('lets members see but not change it, and hides it from client viewers', async () => {
    const owner = await linkedOrg();
    const member = await inviteAndJoin(on, owner.client, 'dev@shop.et', 'member');
    const viewer = await inviteAndJoin(on, owner.client, 'client@shop.et', 'client_viewer');
    expect(TelegramStatus.parse((await member.get('/api/v1/telegram')).body).link).not.toBeNull();
    expect((await member.post('/api/v1/telegram/link-code')).status).toBe(403);
    expect(
      (await member.patch('/api/v1/telegram', { quietStart: null, quietEnd: null, locale: 'en' })).status,
    ).toBe(403);
    expect((await member.delete('/api/v1/telegram')).status).toBe(403);
    expect((await viewer.get('/api/v1/telegram')).status).toBe(403);
  });

  it("never shows or changes another org's chat", async () => {
    await linkedOrg('owner@shop.et');
    const other = await signUpWithOrg(on.app, 'owner@other.et', 'Other');
    expect(TelegramStatus.parse((await other.client.get('/api/v1/telegram')).body).link).toBeNull();
    expect(
      (await other.client.patch('/api/v1/telegram', { quietStart: 1, quietEnd: 2, locale: 'en' })).status,
    ).toBe(404);
    expect((await other.client.delete('/api/v1/telegram')).status).toBe(404);
    expect((await adminQuery('select count(*)::int as n from telegram_links')).rows[0]!.n).toBe(1);
  });
});
