/**
 * The single source of truth for every number Pulse shows (ADR-010).
 *
 * Storage rules:
 *   ratio  → 0..1 (never 0..100)
 *   ms     → integer milliseconds
 *   cls    → unitless layout-shift score
 *   score  → 0..100 integer (health score)
 *   count  → integer
 *   money  → integer santim (1 birr = 100 santim) in ETB
 *
 * UI, reports, Telegram and AI text must format through `formatMetric` — never by hand.
 */

export type Locale = 'en' | 'am';
export type Unit = 'ratio' | 'ms' | 'cls' | 'score' | 'count' | 'money';
export type Rating = 'good' | 'needs-work' | 'poor';
export type Sentiment = 'good' | 'bad' | 'neutral';

export interface MetricDef {
  id: string;
  unit: Unit;
  /** true: higher is better; false: lower is better; null: direction carries no judgement */
  isUpGood: boolean | null;
  /** Rating thresholds in the metric's own unit. For lower-is-better metrics, value <= good is good. */
  thresholds?: { good: number; poor: number };
}

const def = <T extends MetricDef>(d: T) => d;

export const METRICS = {
  visitors: def({ id: 'visitors', unit: 'count', isUpGood: true }),
  pageviews: def({ id: 'pageviews', unit: 'count', isUpGood: true }),
  bounce_rate: def({ id: 'bounce_rate', unit: 'ratio', isUpGood: false }),
  conversion_rate: def({ id: 'conversion_rate', unit: 'ratio', isUpGood: true }),
  avg_visit_duration: def({ id: 'avg_visit_duration', unit: 'ms', isUpGood: true }),
  // Core Web Vitals at p75 — Google thresholds.
  lcp: def({ id: 'lcp', unit: 'ms', isUpGood: false, thresholds: { good: 2500, poor: 4000 } }),
  inp: def({ id: 'inp', unit: 'ms', isUpGood: false, thresholds: { good: 200, poor: 500 } }),
  cls: def({ id: 'cls', unit: 'cls', isUpGood: false, thresholds: { good: 0.1, poor: 0.25 } }),
  fcp: def({ id: 'fcp', unit: 'ms', isUpGood: false, thresholds: { good: 1800, poor: 3000 } }),
  ttfb: def({ id: 'ttfb', unit: 'ms', isUpGood: false, thresholds: { good: 800, poor: 1800 } }),
  health_score: def({
    id: 'health_score',
    unit: 'score',
    isUpGood: true,
    thresholds: { good: 75, poor: 50 },
  }),
  revenue_at_risk: def({ id: 'revenue_at_risk', unit: 'money', isUpGood: false }),
} as const;

export type MetricId = keyof typeof METRICS;

const intlLocale = (locale: Locale) => (locale === 'am' ? 'am-ET' : 'en-US');

const RATIO_TOLERANCE = 1e-9;

function assertValid(metric: MetricDef, value: number): void {
  if (!Number.isFinite(value)) throw new RangeError(`${metric.id}: value must be finite, got ${value}`);
  if (metric.unit === 'ratio' && (value < -RATIO_TOLERANCE || value > 1 + RATIO_TOLERANCE)) {
    throw new RangeError(`${metric.id}: ratio metrics are stored as 0–1, got ${value}`);
  }
  if (metric.unit === 'score' && (value < 0 || value > 100)) {
    throw new RangeError(`${metric.id}: scores are 0–100, got ${value}`);
  }
}

const DURATION_UNITS: Record<Locale, { s: string; m: string; h: string }> = {
  en: { s: 's', m: 'm', h: 'h' },
  am: { s: ' ሰከንድ', m: ' ደቂቃ', h: ' ሰዓት' },
};

/** Short human duration: 850 → "850 ms", 2400 → "2.4 s" (vitals style). */
function formatLatency(ms: number, locale: Locale): string {
  const nf = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1 });
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${nf.format(ms / 1000)} s`;
}

/** Visit-length duration: 192000 → "3m 12s" / "3 ደቂቃ 12 ሰከንድ". */
export function formatDuration(ms: number, locale: Locale = 'en'): string {
  const u = DURATION_UNITS[locale];
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}${u.h} ${m}${u.m}`;
  if (m > 0) return `${m}${u.m} ${s}${u.s}`;
  return `${s}${u.s}`;
}

export function formatMoney(santim: number, locale: Locale = 'en'): string {
  const birr = santim / 100;
  const nf = new Intl.NumberFormat(intlLocale(locale), {
    maximumFractionDigits: Number.isInteger(birr) ? 0 : 2,
    minimumFractionDigits: Number.isInteger(birr) ? 0 : 2,
  });
  return locale === 'am' ? `${nf.format(birr)} ብር` : `ETB ${nf.format(birr)}`;
}

export function formatMetric(id: MetricId, value: number | null | undefined, locale: Locale = 'en'): string {
  if (value === null || value === undefined) return '—';
  const metric: MetricDef = METRICS[id];
  assertValid(metric, value);
  const loc = intlLocale(locale);
  switch (metric.unit) {
    case 'ratio':
      return new Intl.NumberFormat(loc, { style: 'percent', maximumFractionDigits: 1 }).format(value);
    case 'ms':
      return id === 'avg_visit_duration' ? formatDuration(value, locale) : formatLatency(value, locale);
    case 'cls':
      return new Intl.NumberFormat(loc, { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(value);
    case 'score':
      return `${Math.round(value)}/100`;
    case 'count':
      return new Intl.NumberFormat(loc, { maximumFractionDigits: 0 }).format(value);
    case 'money':
      return formatMoney(value, locale);
  }
}

export function rateMetric(id: MetricId, value: number): Rating | null {
  const metric: MetricDef = METRICS[id];
  if (!metric.thresholds) return null;
  assertValid(metric, value);
  const { good, poor } = metric.thresholds;
  if (metric.isUpGood) return value >= good ? 'good' : value >= poor ? 'needs-work' : 'poor';
  return value <= good ? 'good' : value <= poor ? 'needs-work' : 'poor';
}

export interface Delta {
  direction: 'up' | 'down' | 'flat';
  sentiment: Sentiment;
  /** Formatted magnitude, e.g. "18%" for counts or "4.1 pts" for ratios. */
  text: string;
}

/**
 * Change vs a previous period. Ratios compare in percentage points (no relative-of-a-percent confusion);
 * everything else compares relatively.
 */
export function formatDelta(
  id: MetricId,
  current: number,
  previous: number | null | undefined,
  locale: Locale = 'en',
): Delta | null {
  if (previous === null || previous === undefined) return null;
  const metric: MetricDef = METRICS[id];
  assertValid(metric, current);
  assertValid(metric, previous);
  const nf = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1 });
  const pct = new Intl.NumberFormat(intlLocale(locale), { style: 'percent', maximumFractionDigits: 0 });

  let magnitude: number;
  let text: string;
  if (metric.unit === 'ratio') {
    magnitude = (current - previous) * 100; // percentage points
    text = `${nf.format(Math.abs(magnitude))} ${locale === 'am' ? 'ነጥብ' : 'pts'}`;
  } else if (previous === 0) {
    if (current === 0) return { direction: 'flat', sentiment: 'neutral', text: '0' };
    return {
      direction: 'up',
      sentiment: metric.isUpGood === null ? 'neutral' : metric.isUpGood ? 'good' : 'bad',
      text: locale === 'am' ? 'አዲስ' : 'new',
    };
  } else {
    magnitude = (current - previous) / previous;
    text = pct.format(Math.abs(magnitude));
  }

  const FLAT = metric.unit === 'ratio' ? 0.05 : 0.005;
  if (Math.abs(magnitude) < FLAT) return { direction: 'flat', sentiment: 'neutral', text };
  const direction = magnitude > 0 ? 'up' : 'down';
  const sentiment: Sentiment =
    metric.isUpGood === null ? 'neutral' : (direction === 'up') === metric.isUpGood ? 'good' : 'bad';
  return { direction, sentiment, text };
}
