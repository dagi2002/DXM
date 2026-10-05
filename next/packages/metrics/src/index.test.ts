import { describe, expect, it } from 'vitest';
import { formatDelta, formatDuration, formatMetric, formatMoney, rateMetric } from './index';

describe('formatMetric', () => {
  it('formats ratios stored as 0–1 as percentages', () => {
    expect(formatMetric('bounce_rate', 0.382)).toBe('38.2%');
    expect(formatMetric('conversion_rate', 0)).toBe('0%');
  });

  it('refuses ratios outside 0–1 (the legacy "1820% bounce rate" bug)', () => {
    expect(() => formatMetric('bounce_rate', 18.2)).toThrow(RangeError);
  });

  it('renders missing values as an em dash', () => {
    expect(formatMetric('visitors', null)).toBe('—');
    expect(formatMetric('lcp', undefined)).toBe('—');
  });

  it('formats vitals latency and CLS', () => {
    expect(formatMetric('lcp', 2400)).toBe('2.4 s');
    expect(formatMetric('inp', 180)).toBe('180 ms');
    expect(formatMetric('cls', 0.1)).toBe('0.10');
  });

  it('formats counts with grouping in both locales', () => {
    expect(formatMetric('visitors', 1284)).toBe('1,284');
    expect(formatMetric('visitors', 1284, 'am')).toBe('1,284');
  });

  it('formats health score and rejects out-of-range scores', () => {
    expect(formatMetric('health_score', 81.4)).toBe('81/100');
    expect(() => formatMetric('health_score', 140)).toThrow(RangeError);
  });

  it('formats visit duration', () => {
    expect(formatMetric('avg_visit_duration', 192_000)).toBe('3m 12s');
    expect(formatDuration(192_000, 'am')).toBe('3 ደቂቃ 12 ሰከንድ');
    expect(formatDuration(4_000_000)).toBe('1h 6m');
  });
});

describe('formatMoney', () => {
  it('stores santim and shows birr in each locale', () => {
    expect(formatMoney(149_000)).toBe('ETB 1,490');
    expect(formatMoney(149_000, 'am')).toBe('1,490 ብር');
    expect(formatMoney(150)).toBe('ETB 1.50');
  });
});

describe('rateMetric', () => {
  it('uses Google thresholds for lower-is-better vitals', () => {
    expect(rateMetric('lcp', 2500)).toBe('good');
    expect(rateMetric('lcp', 3000)).toBe('needs-work');
    expect(rateMetric('lcp', 5000)).toBe('poor');
    expect(rateMetric('cls', 0.3)).toBe('poor');
  });
  it('handles higher-is-better scores', () => {
    expect(rateMetric('health_score', 80)).toBe('good');
    expect(rateMetric('health_score', 60)).toBe('needs-work');
    expect(rateMetric('health_score', 30)).toBe('poor');
  });
  it('returns null for metrics without thresholds', () => {
    expect(rateMetric('visitors', 10)).toBeNull();
  });
});

describe('formatDelta', () => {
  it('compares counts relatively and judges by direction', () => {
    expect(formatDelta('visitors', 118, 100)).toEqual({ direction: 'up', sentiment: 'good', text: '18%' });
    expect(formatDelta('lcp', 2000, 2500)).toEqual({ direction: 'down', sentiment: 'good', text: '20%' });
  });
  it('compares ratios in percentage points', () => {
    expect(formatDelta('bounce_rate', 0.382, 0.341)).toEqual({
      direction: 'up',
      sentiment: 'bad',
      text: '4.1 pts',
    });
    expect(formatDelta('bounce_rate', 0.382, 0.341, 'am')?.text).toBe('4.1 ነጥብ');
  });
  it('treats tiny changes as flat and handles a zero baseline', () => {
    expect(formatDelta('visitors', 1000, 1002)?.direction).toBe('flat');
    expect(formatDelta('visitors', 5, 0)).toEqual({ direction: 'up', sentiment: 'good', text: 'new' });
    expect(formatDelta('visitors', 5, null)).toBeNull();
  });
});
