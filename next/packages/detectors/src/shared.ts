import type { FixSeverity } from '@pulse/contracts';
import { normalizePath } from './paths';
import {
  MAX_SAMPLE_VISITS,
  MONEY_PATH_CRITICAL_VISITS,
  MONEY_PATH_RE,
  TOP_BROWSER_MIN_SHARE,
} from './thresholds';
import type { DetectorInput } from './types';

/** Visits per day, from a count over a window of `windowHours`. One decimal. */
export const perDay = (n: number, windowHours: number) =>
  Math.round(((n * 24) / Math.max(1, windowHours)) * 10) / 10;

/**
 * Severity from distinct affected visits. On money pages (checkout, pay, sign-up…) friction is
 * critical sooner, but never below the detector's own minimum.
 */
export function visitSeverity(
  path: string,
  visits: number,
  rule: { minVisits: number; criticalVisits: number },
): FixSeverity {
  const critical = MONEY_PATH_RE.test(path)
    ? Math.max(rule.minVisits, Math.min(rule.criticalVisits, MONEY_PATH_CRITICAL_VISITS))
    : rule.criticalVisits;
  return visits >= critical ? 'critical' : 'watch';
}

/** Nearest-rank percentile (p in 0–1) of unsorted values; null for an empty list. */
export function percentile(values: readonly number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(p * sorted.length));
  return sorted[rank - 1]!;
}

/** Latest instant per visit id → "most recent first" sample of ids. */
export function sampleVisits(latest: ReadonlyMap<string, Date>): string[] {
  return [...latest.entries()]
    .sort((a, b) => b[1].getTime() - a[1].getTime() || a[0].localeCompare(b[0]))
    .slice(0, MAX_SAMPLE_VISITS)
    .map(([id]) => id);
}

/** The visitor facts every detector reports: devices, a dominant browser, who left on the page. */
export function describeVisits(ids: Iterable<string>, path: string, input: DetectorInput) {
  const devices = { desktop: 0, mobile: 0, tablet: 0 };
  const browsers = new Map<string, { browser: string; os: string; visits: number }>();
  let leftOnPage = 0;
  let total = 0;
  for (const id of ids) {
    total += 1;
    const v = input.visits.get(id);
    if (!v) continue;
    devices[v.device] += 1;
    if (normalizePath(v.exitPath) === path) leftOnPage += 1;
    if (v.browser && v.os) {
      const k = `${v.browser}\u0000${v.os}`;
      const b = browsers.get(k) ?? { browser: v.browser, os: v.os, visits: 0 };
      b.visits += 1;
      browsers.set(k, b);
    }
  }
  const top = [...browsers.values()].sort((a, b) => b.visits - a.visits)[0];
  return {
    devices,
    leftOnPage,
    topBrowser: top && total > 0 && top.visits / total >= TOP_BROWSER_MIN_SHARE ? top : null,
  };
}

/** Groups by key with a factory for new entries. */
export function upsert<K, V>(map: Map<K, V>, key: K, create: () => V): V {
  let v = map.get(key);
  if (v === undefined) {
    v = create();
    map.set(key, v);
  }
  return v;
}

/** The end of the window: `now` when given, else the latest event. */
export function windowEnd(input: DetectorInput): Date {
  if (input.now) return input.now;
  let max = 0;
  for (const e of input.events) max = Math.max(max, e.at.getTime());
  return new Date(max);
}
