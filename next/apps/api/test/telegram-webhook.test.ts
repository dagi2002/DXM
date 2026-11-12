import { describe, expect, it } from 'vitest';
import { ALLOWED_UPDATES, registerTelegramWebhook, webhookUrl } from '../src/telegram-webhook';

const TOKEN = '123456:AAE-very-secret-bot-token';
const SECRET = 'webhook-secret-0123456789abcdef';
const URL_OK = 'https://app.dxmpulse.et/api/v1/telegram/webhook';

/** A fake Bot API that records calls and keeps the current webhook. */
function fakeTelegram(
  info: { url?: string; allowed_updates?: string[]; last_error_message?: string } = {},
  fail?: { method: string; status: number; description: string },
) {
  const calls: { method: string; body: Record<string, unknown>; url: string }[] = [];
  const state = { ...info };
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const method = url.split('/').pop()!;
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    calls.push({ method, body, url });
    if (fail?.method === method)
      return Response.json({ ok: false, description: fail.description }, { status: fail.status });
    if (method === 'getWebhookInfo') return Response.json({ ok: true, result: state });
    if (method === 'setWebhook') {
      state.url = body.url as string;
      state.allowed_updates = body.allowed_updates as string[];
      delete state.last_error_message;
      return Response.json({ ok: true, result: true, description: 'Webhook was set' });
    }
    return Response.json({ ok: false, description: 'Not Found' }, { status: 404 });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl, state };
}

const opts = (fetchImpl: typeof fetch, extra: object = {}) => ({
  token: TOKEN,
  secret: SECRET,
  publicUrl: 'https://app.dxmpulse.et',
  fetchImpl,
  ...extra,
});

describe('Telegram webhook registration', () => {
  it('is skipped when the token or the secret is missing, or the URL is not https', async () => {
    const t = fakeTelegram();
    expect(await registerTelegramWebhook(opts(t.fetchImpl, { token: undefined }))).toEqual({
      status: 'skipped',
      reason: 'no_token',
    });
    expect(await registerTelegramWebhook(opts(t.fetchImpl, { secret: undefined }))).toEqual({
      status: 'skipped',
      reason: 'no_secret',
    });
    expect(await registerTelegramWebhook(opts(t.fetchImpl, { publicUrl: 'http://localhost:4100' }))).toEqual({
      status: 'skipped',
      reason: 'not_https',
    });
    expect(t.calls).toEqual([]);
  });

  it('registers with the secret and only message updates, then is a no-op on the next start', async () => {
    const t = fakeTelegram();
    expect(await registerTelegramWebhook(opts(t.fetchImpl))).toEqual({ status: 'registered', url: URL_OK });
    const set = t.calls.find((c) => c.method === 'setWebhook')!;
    expect(set.body).toEqual({
      url: URL_OK,
      secret_token: SECRET,
      allowed_updates: [...ALLOWED_UPDATES],
      drop_pending_updates: false,
    });

    t.calls.length = 0;
    expect(await registerTelegramWebhook(opts(t.fetchImpl))).toEqual({ status: 'unchanged', url: URL_OK });
    expect(t.calls.map((c) => c.method)).toEqual(['getWebhookInfo']);
  });

  it('re-registers when the URL changed or Telegram reports our webhook rejecting it (rotated secret)', async () => {
    const moved = fakeTelegram({ url: 'https://old.example/hook', allowed_updates: ['message'] });
    expect((await registerTelegramWebhook(opts(moved.fetchImpl))).status).toBe('registered');

    const rotated = fakeTelegram({
      url: URL_OK,
      allowed_updates: ['message'],
      last_error_message: 'Wrong response from the webhook: 401 Unauthorized',
    });
    expect((await registerTelegramWebhook(opts(rotated.fetchImpl))).status).toBe('registered');

    const forced = fakeTelegram({ url: URL_OK, allowed_updates: ['message'] });
    expect((await registerTelegramWebhook(opts(forced.fetchImpl, { force: true }))).status).toBe(
      'registered',
    );
    expect(forced.calls.map((c) => c.method)).toEqual(['setWebhook']);
  });

  it('never puts the token or the secret in a result, even when Telegram echoes them', async () => {
    const t = fakeTelegram(
      {},
      {
        method: 'setWebhook',
        status: 400,
        description: `Bad Request: bad webhook for bot${TOKEN} with ${SECRET}`,
      },
    );
    const result = await registerTelegramWebhook(opts(t.fetchImpl));
    expect(result.status).toBe('failed');
    const text = JSON.stringify(result);
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain(SECRET);
    expect(text).toContain('[redacted]');

    const down = (async () => {
      throw new Error(`connect ECONNREFUSED for https://api.telegram.org/bot${TOKEN}/getWebhookInfo`);
    }) as unknown as typeof fetch;
    const r2 = await registerTelegramWebhook(opts(down));
    expect(r2.status).toBe('failed');
    expect(JSON.stringify(r2)).not.toContain(TOKEN);
  });

  it('builds the webhook URL from the public API origin', () => {
    expect(webhookUrl('https://app.dxmpulse.et')).toBe(URL_OK);
    expect(webhookUrl('https://app.dxmpulse.et/')).toBe(URL_OK);
    expect(webhookUrl('http://app.dxmpulse.et')).toBeNull();
  });
});
