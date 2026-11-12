import { describe, expect, it } from 'vitest';
import { isCompleteRollup, lastSettledDay, settledAt, wholeDays } from './backfill';
import { verifyDayWindows } from './measure';
import { ROLLUP_VERSION } from './rollup';

const at = (iso: string) => new Date(iso);

describe('rollup completeness', () => {
  it('settles a day 3 hours after it ends', () => {
    expect(settledAt('2026-09-14')).toEqual(at('2026-09-15T03:00:00Z'));
    expect(lastSettledDay(at('2026-09-15T02:59:59.999Z'))).toBe('2026-09-13');
    expect(lastSettledDay(at('2026-09-15T03:00:00Z'))).toBe('2026-09-14');
  });

  it('trusts a rollup only from the current version, computed once the day settled', () => {
    const settled = at('2026-09-15T03:00:00Z');
    expect(isCompleteRollup('2026-09-14', { version: ROLLUP_VERSION, computedAt: settled })).toBe(true);
    expect(
      isCompleteRollup('2026-09-14', {
        version: ROLLUP_VERSION,
        computedAt: new Date(settled.getTime() - 1),
      }),
    ).toBe(false);
    expect(isCompleteRollup('2026-09-14', { version: ROLLUP_VERSION - 1, computedAt: settled })).toBe(false);
  });

  it('lists the whole UTC days inside a range', () => {
    expect(wholeDays({ start: at('2026-09-03T12:00:00Z'), end: at('2026-09-06T12:00:00Z') })).toEqual([
      '2026-09-04',
      '2026-09-05',
    ]);
    expect(wholeDays({ start: at('2026-09-03T00:00:00Z'), end: at('2026-09-05T00:00:00Z') })).toEqual([
      '2026-09-03',
      '2026-09-04',
    ]);
    expect(wholeDays({ start: at('2026-09-03T00:00:00Z'), end: at('2026-09-03T23:59:59.999Z') })).toEqual([]);
  });
});

describe('verification day windows', () => {
  it('uses the 7 whole days before the fix day and days 3–6 after it', () => {
    for (const fixedAt of ['2026-09-10T00:00:00Z', '2026-09-10T12:00:00Z', '2026-09-10T23:59:59.999Z']) {
      expect(verifyDayWindows('u_turn', at(fixedAt))).toEqual({
        before: { start: at('2026-09-03T00:00:00Z'), end: at('2026-09-10T00:00:00Z') },
        after: { start: at('2026-09-13T00:00:00Z'), end: at('2026-09-17T00:00:00Z') },
      });
    }
  });

  it('never ends after the check is due (fixed_at + 7 days)', () => {
    const fixedAt = at('2026-09-10T00:00:00Z');
    expect(verifyDayWindows('js_error', fixedAt).after.end.getTime()).toBeLessThanOrEqual(
      fixedAt.getTime() + 7 * 86_400_000,
    );
  });

  it('keeps tracking on the exact 24 hours after the fix', () => {
    const fixedAt = at('2026-09-10T12:00:00Z');
    expect(verifyDayWindows('tracking_broken', fixedAt).after).toEqual({
      start: fixedAt,
      end: at('2026-09-11T12:00:00Z'),
    });
  });
});
