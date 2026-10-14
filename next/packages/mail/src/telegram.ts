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

export interface QuietHours {
  quietStart: number | null;
  quietEnd: number | null;
  timeZone: string;
}

/** Hour (0–23) and minute in a time zone. Falls back to UTC for an unknown zone. */
export function localTime(now: Date, timeZone: string): { hour: number; minute: number; second: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
  } catch {
    return { hour: now.getUTCHours(), minute: now.getUTCMinutes(), second: now.getUTCSeconds() };
  }
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { hour: get('hour') % 24, minute: get('minute'), second: get('second') };
}

/**
 * When quiet hours are on at `now`, the instant they end; otherwise null (send now).
 * Quiet hours are [start, end) in local whole hours; start > end wraps past midnight (22 → 7).
 */
export function quietUntil(now: Date, q: QuietHours): Date | null {
  if (q.quietStart === null || q.quietEnd === null || q.quietStart === q.quietEnd) return null;
  const { hour, minute, second } = localTime(now, q.timeZone);
  const inside =
    q.quietStart < q.quietEnd
      ? hour >= q.quietStart && hour < q.quietEnd
      : hour >= q.quietStart || hour < q.quietEnd;
  if (!inside) return null;
  const hoursLeft = (q.quietEnd - hour + 24) % 24;
  const ms = hoursLeft * 3600_000 - minute * 60_000 - second * 1000 - now.getUTCMilliseconds();
  return new Date(now.getTime() + ms);
}

/** The code from a `/start <code>` message (deep link), or null. */
export function parseStartCode(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const m = /^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{16,64})\s*$/.exec(text.trim());
  return m ? m[1]! : null;
}
