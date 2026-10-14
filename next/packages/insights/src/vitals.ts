import { VITALS_MIN_SAMPLES, type Device, type Network, type VitalSummary } from '@pulse/contracts';
import { rateMetric } from '@pulse/metrics';

export const VITAL_METRICS = ['LCP', 'INP', 'CLS'] as const;
export type VitalMetric = (typeof VITAL_METRICS)[number];

/**
 * The percentile every Pulse number uses (behaviour contract 21): sort the values and take the one
 * at index `floor((n - 1) × p)`. Always an observed value, never interpolated. Null for no values.
 */
export function percentile(values: readonly number[], p: number): number | null {
  if (!values.length) return null;
  if (p < 0 || p > 1) throw new RangeError(`percentile must be 0–1, got ${p}`);
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * p)]!;
}

/** p75, or null below the minimum sample count (an honest "not enough data"). */
export function p75(values: readonly number[], minSamples = VITALS_MIN_SAMPLES): number | null {
  return values.length >= minSamples ? percentile(values, 0.75) : null;
}

/** Stored precision: ms are whole numbers, CLS keeps 3 decimals. */
export function roundVital(metric: VitalMetric, v: number): number {
  return metric === 'CLS' ? Math.round(v * 1000) / 1000 : Math.round(v);
}

const metricId = { LCP: 'lcp', INP: 'inp', CLS: 'cls' } as const;

export function summarizeVital(
  metric: VitalMetric,
  current: readonly number[],
  previous: readonly number[],
): VitalSummary {
  const now = p75(current);
  const before = p75(previous);
  return {
    p75: now === null ? null : roundVital(metric, now),
    previous: before === null ? null : roundVital(metric, before),
    samples: current.length,
    rating: now === null ? null : rateMetric(metricId[metric], roundVital(metric, now)),
  };
}

/**
 * One group of final vital values from the rollups. `path` is the page template; `device` and
 * `network` come from the visit.
 */
export interface VitalSamples {
  metric: VitalMetric;
  device: Device;
  network: Network;
  path: string;
  values: number[];
}

/** All values of one metric across groups, optionally filtered. */
export function collect(
  groups: readonly VitalSamples[],
  metric: VitalMetric,
  where: (g: VitalSamples) => boolean = () => true,
): number[] {
  const out: number[] = [];
  for (const g of groups) if (g.metric === metric && where(g)) out.push(...g.values);
  return out;
}

/** p75 LCP/INP/CLS for each value of one dimension, in a fixed order, skipping empty buckets. */
export function vitalsBy<K extends 'device' | 'network'>(
  groups: readonly VitalSamples[],
  key: K,
  order: readonly VitalSamples[K][],
) {
  return order
    .map((value) => {
      const pick = (m: VitalMetric) => collect(groups, m, (g) => g[key] === value);
      const lcp = pick('LCP');
      const at = (m: VitalMetric, vals: number[]) => {
        const v = p75(vals);
        return v === null ? null : roundVital(m, v);
      };
      return {
        [key]: value,
        lcp: at('LCP', lcp),
        inp: at('INP', pick('INP')),
        cls: at('CLS', pick('CLS')),
        samples: lcp.length,
      } as { lcp: number | null; inp: number | null; cls: number | null; samples: number } & Record<
        K,
        VitalSamples[K]
      >;
    })
    .filter((row) => row.samples > 0 || row.inp !== null || row.cls !== null);
}
