/**
 * Registers our Telegram webhook (setWebhook with secret_token) so nobody has to call the Bot API
 * by hand. Runs on API start and from `pnpm --filter @pulse/api telegram:webhook`.
 *
 * Idempotent: when Telegram already points at our URL with the same update types and isn't
 * reporting auth failures (a rotated secret shows up as 401s in `last_error_message`), nothing is
 * changed. The bot token and the webhook secret never appear in results, errors or logs.
 */

export const WEBHOOK_PATH = '/api/v1/telegram/webhook';
/** We only read messages (`/start <code>`). */
export const ALLOWED_UPDATES = ['message'] as const;

export type WebhookResult =
  | { status: 'skipped'; reason: 'no_token' | 'no_secret' | 'not_https' }
  | { status: 'unchanged'; url: string }
  | { status: 'registered'; url: string }
  | { status: 'failed'; error: string };

interface WebhookInfo {
  url?: string;
  allowed_updates?: string[];
  last_error_message?: string;
}

export interface RegisterOptions {
  token: string | undefined;
  secret: string | undefined;
  /** Public origin Telegram can reach (API_URL); must be https. */
  publicUrl: string;
  /** Re-register even when it looks current (CLI `--force`, e.g. after rotating the secret). */
  force?: boolean;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

/** Replaces any occurrence of the given secrets with [redacted]. */
export function redact(text: string, secrets: (string | undefined)[]): string {
  let out = text;
  for (const s of secrets) if (s) out = out.split(s).join('[redacted]');
  return out;
}

export function webhookUrl(publicUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(WEBHOOK_PATH, publicUrl);
  } catch {
    return null;
  }
  return url.protocol === 'https:' ? url.toString() : null;
}

export async function registerTelegramWebhook(opts: RegisterOptions): Promise<WebhookResult> {
  const { token, secret } = opts;
  if (!token) return { status: 'skipped', reason: 'no_token' };
  if (!secret) return { status: 'skipped', reason: 'no_secret' };
  const url = webhookUrl(opts.publicUrl);
  if (!url) return { status: 'skipped', reason: 'not_https' };
  const doFetch = opts.fetchImpl ?? fetch;
  const api = `${opts.baseUrl ?? 'https://api.telegram.org'}/bot${token}`;

  const call = async <T>(method: string, body?: unknown): Promise<T> => {
    const res = await doFetch(`${api}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(10_000),
    });
    let json: { ok?: boolean; result?: T; description?: unknown } = {};
    try {
      json = (await res.json()) as typeof json;
    } catch {
      // keep empty
    }
    if (!res.ok || !json.ok) {
      const description = typeof json.description === 'string' ? json.description : res.statusText;
      throw new Error(`${method} failed (${res.status}): ${description.slice(0, 200)}`);
    }
    return json.result as T;
  };

  try {
    if (!opts.force) {
      const info = await call<WebhookInfo>('getWebhookInfo');
      const sameUpdates =
        JSON.stringify([...(info.allowed_updates ?? [])].sort()) === JSON.stringify([...ALLOWED_UPDATES]);
      const authFailing = /\b(401|403)\b|unauthori[sz]ed|forbidden/i.test(info.last_error_message ?? '');
      if (info.url === url && sameUpdates && !authFailing) return { status: 'unchanged', url };
    }
    await call<boolean>('setWebhook', {
      url,
      secret_token: secret,
      allowed_updates: ALLOWED_UPDATES,
      drop_pending_updates: false,
    });
    return { status: 'registered', url };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return { status: 'failed', error: redact(message, [token, secret]) };
  }
}
