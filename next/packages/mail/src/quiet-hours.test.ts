import { describe, expect, it } from 'vitest';
import { quietUntil } from './quiet-hours';

/** Boundaries of the one quiet-hours rule Telegram and web push share. Addis Ababa is UTC+3. */
const ADDIS = 'Africa/Addis_Ababa';
const q = (quietStart: number | null, quietEnd: number | null, timeZone = ADDIS) => ({
  quietStart,
  quietEnd,
  timeZone,
});
/** An instant at hh:mm:ss Addis time on 2026-11-16. */
const at = (hh: number, mm = 0, ss = 0) => new Date(Date.UTC(2026, 10, 16, hh - 3, mm, ss));

describe('quiet hours (shared by Telegram and push)', () => {
  it('is off without hours, or with start = end', () => {
    expect(quietUntil(at(23), q(null, null))).toBeNull();
    expect(quietUntil(at(23), q(22, 22))).toBeNull();
  });

  describe('wrapping past midnight (22 → 7)', () => {
    it('starts exactly at 22:00, not a second before', () => {
      expect(quietUntil(at(21, 59, 59), q(22, 7))).toBeNull();
      expect(quietUntil(at(22), q(22, 7))).toEqual(at(31)); // 07:00 next day
    });
    it('holds through midnight', () => {
      expect(quietUntil(at(24), q(22, 7))).toEqual(at(31));
      expect(quietUntil(at(23, 59, 59), q(22, 7))).toEqual(at(31));
    });
    it('ends exactly at 07:00 (end is exclusive)', () => {
      expect(quietUntil(at(30, 59, 59), q(22, 7))).toEqual(at(31));
      expect(quietUntil(at(31), q(22, 7))).toBeNull();
    });
  });

  describe('within one day (13 → 15)', () => {
    it('covers [13:00, 15:00) only', () => {
      expect(quietUntil(at(12, 59, 59), q(13, 15))).toBeNull();
      expect(quietUntil(at(13), q(13, 15))).toEqual(at(15));
      expect(quietUntil(at(14, 30), q(13, 15))).toEqual(at(15));
      expect(quietUntil(at(15), q(13, 15))).toBeNull();
    });
  });

  it('a one-hour window (23 → 0) ends at midnight', () => {
    expect(quietUntil(at(23, 15), q(23, 0))).toEqual(at(24));
    expect(quietUntil(at(24), q(23, 0))).toBeNull();
  });

  it('uses the configured time zone', () => {
    // 22:30 UTC is 22:30 in UTC but 01:30 in Addis.
    const now = new Date('2026-11-16T22:30:00Z');
    expect(quietUntil(now, q(22, 23, 'UTC'))).toEqual(new Date('2026-11-16T23:00:00Z'));
    expect(quietUntil(now, q(22, 23, ADDIS))).toBeNull();
  });

  it('falls back to UTC for an unknown zone instead of throwing', () => {
    const now = new Date('2026-11-16T22:30:00Z');
    expect(quietUntil(now, q(22, 23, 'Mars/Olympus'))).toEqual(new Date('2026-11-16T23:00:00Z'));
  });
});
