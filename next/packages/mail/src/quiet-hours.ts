/**
 * Quiet hours: the one rule every instant channel (Telegram, web push) follows. Stored per org in
 * `notification_settings`. A message that falls inside quiet hours waits until they end; it is
 * never dropped.
 */

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
