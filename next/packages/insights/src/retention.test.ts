import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
  ROLLUP_MIN_RETENTION_DAYS,
  retentionCutoffDay,
  retentionDaysFor,
  rollupRetentionDays,
} from './retention';

describe('retention', () => {
  const org = { id: 'org_a', plan: 'free' };

  it('keeps what the plan allows (7 / 30 / 90 days), with no plan row counted as Free', () => {
    expect(retentionDaysFor(org)).toBe(7);
    expect(retentionDaysFor({ id: 'org_b', plan: null })).toBe(7);
    expect(retentionDaysFor({ id: 'org_c', plan: 'business' })).toBe(30);
    expect(retentionDaysFor({ id: 'org_d', plan: 'growth' })).toBe(90);
    expect(retentionDaysFor({ id: 'org_e', plan: 'agency' })).toBe(90);
  });

  it('uses the server-wide default for an unknown plan, and caps every plan at it', () => {
    const odd = { id: 'org_x', plan: 'legacy' };
    expect(retentionDaysFor(odd)).toBe(DEFAULT_RETENTION_DAYS);
    expect(retentionDaysFor(odd, { defaultDays: 30 })).toBe(30);
    expect(retentionDaysFor({ id: 'org_d', plan: 'growth' }, { defaultDays: 30 })).toBe(30);
    expect(retentionDaysFor({ id: 'org_d', plan: 'growth' }, { defaultDays: MIN_RETENTION_DAYS })).toBe(
      MIN_RETENTION_DAYS,
    );
    // A broken setting never shortens retention below the floor.
    expect(retentionDaysFor(odd, { defaultDays: MIN_RETENTION_DAYS - 1 })).toBe(DEFAULT_RETENTION_DAYS);
    expect(retentionDaysFor(odd, { defaultDays: 1.5 })).toBe(DEFAULT_RETENTION_DAYS);
    expect(retentionDaysFor({ id: 'org_d', plan: 'growth' }, { defaultDays: 1.5 })).toBe(90);
  });

  it('keeps rollups at least ROLLUP_MIN_RETENTION_DAYS, or as long as raw data', () => {
    expect(rollupRetentionDays(7)).toBe(ROLLUP_MIN_RETENTION_DAYS);
    expect(rollupRetentionDays(ROLLUP_MIN_RETENTION_DAYS + 1)).toBe(ROLLUP_MIN_RETENTION_DAYS + 1);
  });

  it('keeps today and the days - 1 whole days before it', () => {
    const now = new Date('2026-09-15T00:00:00Z');
    expect(retentionCutoffDay(now, 1)).toBe('2026-09-15');
    expect(retentionCutoffDay(now, 7)).toBe('2026-09-09');
    expect(retentionCutoffDay(new Date('2026-09-15T23:59:59.999Z'), 7)).toBe('2026-09-09');
    expect(retentionCutoffDay(new Date('2026-03-02T10:00:00Z'), 3)).toBe('2026-02-28');
  });
});
