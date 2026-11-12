/**
 * Telegram Bot API delivery, shared by the API (link confirmations, test messages) and the worker
 * (alerts). The bot token is a secret: it only ever appears in the request URL, never in errors
 * or logs.
 */

export interface TelegramClient {
  sendMessage(chatId: string, text: string): Promise<void>;
}

/** A Bot API error. `permanent` = retrying won't help (bot blocked, kicked, chat gone). */
export class TelegramError extends Error {
  constructor(
    readonly status: number,
    readonly description: string,
  ) {
    super(`Telegram responded ${status}: ${description.slice(0, 200)}`);
    this.name = 'TelegramError';
  }
  get permanent() {
    return (
      this.status === 403 ||
      (this.status === 400 && /chat not found|chat was upgraded/i.test(this.description))
    );
  }
}

/** Telegram caps messages at 4096 characters. */
export const TELEGRAM_MAX_TEXT = 4096;

export class HttpTelegramClient implements TelegramClient {
  constructor(
    private readonly token: string,
    private readonly baseUrl = 'https://api.telegram.org',
  ) {}
  async sendMessage(chatId: string, text: string) {
    const res = await fetch(`${this.baseUrl}/bot${this.token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // Plain text: no parse_mode, so nothing a site name or error message contains is markup.
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, TELEGRAM_MAX_TEXT),
        link_preview_options: { is_disabled: true },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return;
    let description = res.statusText;
    try {
      const body = (await res.json()) as { description?: unknown };
      if (typeof body.description === 'string') description = body.description;
    } catch {
      // keep statusText
    }
    throw new TelegramError(res.status, description);
  }
}

/** Keeps messages in memory — tests read `sent`. Never used in production. */
export class MemoryTelegramClient implements TelegramClient {
  readonly sent: { chatId: string; text: string }[] = [];
  /** Set to make the next send fail. */
  failWith: TelegramError | null = null;
  async sendMessage(chatId: string, text: string) {
    if (this.failWith) {
      const err = this.failWith;
      this.failWith = null;
      throw err;
    }
    this.sent.push({ chatId, text });
  }
}

export { localTime, quietUntil, type QuietHours } from './quiet-hours';

/** The code from a `/start <code>` message (deep link), or null. */
export function parseStartCode(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const m = /^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{16,64})\s*$/.exec(text.trim());
  return m ? m[1]! : null;
}
