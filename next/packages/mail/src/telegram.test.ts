import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpTelegramClient, TelegramError, localTime, parseStartCode, quietUntil } from './telegram';

const ADDIS = 'Africa/Addis_Ababa'; // UTC+3, no DST

describe('quietUntil', () => {
  const q = (quietStart: number | null, quietEnd: number | null, timeZone = ADDIS) => ({
    quietStart,
    quietEnd,
    timeZone,
  });

  it('sends right away without quiet hours', () => {
    expect(quietUntil(new Date('2026-10-14T21:00:00Z'), q(null, null))).toBeNull();
  });

  it('wraps past midnight and ends on the hour, in local time', () => {
    // 23:30 in Addis (20:30 UTC), quiet 22 → 7: wait until 07:00 Addis = 04:00 UTC.
    expect(quietUntil(new Date('2026-10-14T20:30:00Z'), q(22, 7))).toEqual(new Date('2026-10-15T04:00:00Z'));
    // 06:59 Addis is still quiet; 07:00 is not; 21:59 is not; 22:00 is.
    expect(quietUntil(new Date('2026-10-15T03:59:00Z'), q(22, 7))).toEqual(new Date('2026-10-15T04:00:00Z'));
    expect(quietUntil(new Date('2026-10-15T04:00:00Z'), q(22, 7))).toBeNull();
    expect(quietUntil(new Date('2026-10-14T18:59:59Z'), q(22, 7))).toBeNull();
    expect(quietUntil(new Date('2026-10-14T19:00:00Z'), q(22, 7))).toEqual(new Date('2026-10-15T04:00:00Z'));
  });

  it('handles same-day quiet hours', () => {
    // 13:15 Addis, quiet 12 → 14.
    expect(quietUntil(new Date('2026-10-14T10:15:00Z'), q(12, 14))).toEqual(new Date('2026-10-14T11:00:00Z'));
    expect(quietUntil(new Date('2026-10-14T11:00:00Z'), q(12, 14))).toBeNull();
  });

  it('falls back to UTC for an unknown time zone', () => {
    expect(localTime(new Date('2026-10-14T10:15:00Z'), 'Not/AZone')).toEqual({
      hour: 10,
      minute: 15,
      second: 0,
    });
  });
});

describe('parseStartCode', () => {
  it('reads the deep-link code and nothing else', () => {
    expect(parseStartCode('/start abcdefghijklmnop1234')).toBe('abcdefghijklmnop1234');
    expect(parseStartCode('/start@DxmPulseBot abcdefghijklmnop1234')).toBe('abcdefghijklmnop1234');
    expect(parseStartCode('/start')).toBeNull();
    expect(parseStartCode('/start short')).toBeNull();
    expect(parseStartCode('/start abcdefghijklmnop1234 extra')).toBeNull();
    expect(parseStartCode('hello')).toBeNull();
    expect(parseStartCode(42)).toBeNull();
  });
});

describe('HttpTelegramClient', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('posts plain text and never puts the token in errors', async () => {
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(
        JSON.stringify({ ok: false, description: 'Forbidden: bot was blocked by the user' }),
        {
          status: 403,
        },
      );
    });
    const client = new HttpTelegramClient('123:SECRET-TOKEN', 'https://tg.test');
    const err = await client.sendMessage('42', 'hi').catch((e: unknown) => e);
    expect(calls[0]!.url).toBe('https://tg.test/bot123:SECRET-TOKEN/sendMessage');
    expect(calls[0]!.body).toMatchObject({ chat_id: '42', text: 'hi' });
    expect(calls[0]!.body).not.toHaveProperty('parse_mode');
    expect(err).toBeInstanceOf(TelegramError);
    expect((err as TelegramError).permanent).toBe(true);
    expect(String((err as Error).message)).not.toContain('SECRET');
  });

  it('treats only a blocked bot or a missing chat as permanent', () => {
    expect(new TelegramError(403, 'Forbidden').permanent).toBe(true);
    expect(new TelegramError(400, 'Bad Request: chat not found').permanent).toBe(true);
    expect(new TelegramError(400, 'Bad Request: message is too long').permanent).toBe(false);
    expect(new TelegramError(429, 'Too Many Requests').permanent).toBe(false);
  });
});
