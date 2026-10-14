import { INSIGHTS_MIN_VISITS, type HealthParts } from '@pulse/contracts';
import { METRICS } from '@pulse/metrics';

/**
 * The health score — the one definition (documented in docs/rebuild/insights.md). Change it only
 * together with that doc.
 *
 *   health = round(100 × weighted mean of the parts that have data)
 *
 *   speed    (weight 0.40) mean of the LCP, INP and CLS sub-scores at p75, all devices
 *   friction (weight 0.35) 1 − frictionRate / 0.20, floored at 0
 *   errors   (weight 0.25) 1 − errorRate / 0.10, floored at 0
 *
 * A vital's sub-score is 1 at or under Google's "good" threshold, falls linearly to 0.5 at the
 * "poor" threshold, then linearly to 0 at twice the poor threshold. A vital without enough samples
 * is left out of the speed mean; with no vitals at all, speed is left out and the other weights are
 * renormalised. Under INSIGHTS_MIN_VISITS visits there is no score.
 */
export const HEALTH_WEIGHTS = { speed: 0.4, friction: 0.35, errors: 0.25 } as const;
/** Share of visits with a rage or dead click at which the friction part reaches 0. */
export const FRICTION_RATE_FLOOR = 0.2;
/** Share of visits with a JavaScript error at which the errors part reaches 0. */
export const ERROR_RATE_FLOOR = 0.1;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** 0–1 score for one vital at p75 against its Google thresholds. */
export function vitalScore(id: 'lcp' | 'inp' | 'cls', value: number): number {
  const { good, poor } = METRICS[id].thresholds;
  if (value <= good) return 1;
  if (value <= poor) return 1 - (0.5 * (value - good)) / (poor - good);
  return clamp01(0.5 * (1 - (value - poor) / poor));
}

export interface HealthInput {
  visits: number;
  /** p75 values (null = not enough samples). */
  lcp: number | null;
  inp: number | null;
  cls: number | null;
  /** Visits with a rage or dead click / all visits. */
  frictionRate: number | null;
  /** Visits with a JavaScript error / all visits. */
  errorRate: number | null;
}

export function healthParts(input: HealthInput): HealthParts {
  const vitals = (
    [
      ['lcp', input.lcp],
      ['inp', input.inp],
      ['cls', input.cls],
    ] as const
  )
    .filter((x): x is readonly ['lcp' | 'inp' | 'cls', number] => x[1] !== null)
    .map(([id, v]) => vitalScore(id, v));
  return {
    speed: vitals.length ? vitals.reduce((a, b) => a + b, 0) / vitals.length : null,
    friction: input.frictionRate === null ? null : clamp01(1 - input.frictionRate / FRICTION_RATE_FLOOR),
    errors: input.errorRate === null ? null : clamp01(1 - input.errorRate / ERROR_RATE_FLOOR),
  };
}

/** The health score (0–100), or null when there aren't enough visits to say. */
export function healthScore(input: HealthInput, minVisits = INSIGHTS_MIN_VISITS): number | null {
  if (input.visits < minVisits) return null;
  const parts = healthParts(input);
  let weight = 0;
  let sum = 0;
  for (const key of Object.keys(HEALTH_WEIGHTS) as (keyof typeof HEALTH_WEIGHTS)[]) {
    const part = parts[key];
    if (part === null) continue;
    weight += HEALTH_WEIGHTS[key];
    sum += HEALTH_WEIGHTS[key] * part;
  }
  return weight === 0 ? null : Math.round((100 * sum) / weight);
}
