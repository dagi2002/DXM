import { NETWORKS, type Network, type SlowMetric, type SlowPageEvidence } from '@pulse/contracts';
import { fingerprintOf, normalizePath } from './paths';
import { describeVisits, percentile, perDay, sampleVisits, upsert } from './shared';
import {
  MONEY_PATH_RE,
  SLOW_INP_CRITICAL_MS,
  SLOW_INP_POOR_MS,
  SLOW_LCP_CRITICAL_MS,
  SLOW_LCP_POOR_MS,
  SLOW_NETWORK_MIN_VISITS,
  SLOW_PAGE_MIN_VISITS,
  SLOW_PERCENTILE,
} from './thresholds';
import type { DetectorInput, Finding } from './types';

export const SLOW_LINES: Record<SlowMetric, { poor: number; critical: number }> = {
  LCP: { poor: SLOW_LCP_POOR_MS, critical: SLOW_LCP_CRITICAL_MS },
  INP: { poor: SLOW_INP_POOR_MS, critical: SLOW_INP_CRITICAL_MS },
};

const isMetric = (v: unknown): v is SlowMetric => v === 'LCP' || v === 'INP';
export const networkOf = (v: string | null | undefined): Network =>
  (NETWORKS as readonly string[]).includes(v ?? '') ? (v as Network) : 'unknown';

export interface SpeedStats {
  path: string;
  metric: SlowMetric;
  fingerprint: string;
  /** visit id → worst value on this template, and when */
  visits: Map<string, { value: number; at: Date }>;
}

/** Worst LCP/INP per visit, grouped by (page template, metric). */
export function speedStats(input: DetectorInput): Map<string, SpeedStats> {
  const groups = new Map<string, SpeedStats>();
  for (const e of input.events) {
    if (e.type !== 'vt' || !isMetric(e.props.n)) continue;
    const value = e.props.v;
    const path = normalizePath(e.path);
    if (!path || typeof value !== 'number' || !Number.isFinite(value) || value < 0) continue;
    const metric = e.props.n;
    const g = upsert(groups, `${path}\u0000${metric}`, () => ({
      path,
      metric,
      fingerprint: fingerprintOf('slow_page', path, metric),
      visits: new Map<string, { value: number; at: Date }>(),
    }));
    const cutoff = input.ignoreBefore?.get(g.fingerprint);
    if (cutoff && e.at < cutoff) continue;
    const prev = g.visits.get(e.visitId);
    if (!prev || value > prev.value) g.visits.set(e.visitId, { value, at: e.at });
  }
  return groups;
}

/** p75 of a speed group (all networks). */
export const p75Of = (s: SpeedStats) =>
  percentile(
    [...s.visits.values()].map((v) => v.value),
    SLOW_PERCENTILE,
  );

/**
 * Page templates where the p75 LCP or INP is poor — overall, or on any one network with enough
 * visits (a page that's fine on 4G but unusable on 3G is still a problem in Ethiopia).
 */
export function detectSlowPages(input: DetectorInput): Finding<SlowPageEvidence>[] {
  const findings: Finding<SlowPageEvidence>[] = [];
  for (const s of speedStats(input).values()) {
    if (s.visits.size < SLOW_PAGE_MIN_VISITS) continue;
    const line = SLOW_LINES[s.metric];
    const overall = p75Of(s)!;
    const byNetwork = new Map<Network, number[]>();
    for (const [id, v] of s.visits) {
      upsert(byNetwork, networkOf(input.visits.get(id)?.network), () => []).push(v.value);
    }
    const networks = [...byNetwork.entries()]
      .filter(([, values]) => values.length >= SLOW_NETWORK_MIN_VISITS)
      .map(([network, values]) => ({
        network,
        visits: values.length,
        p75: Math.round(percentile(values, SLOW_PERCENTILE)!),
      }))
      .sort((a, b) => b.p75 - a.p75 || a.network.localeCompare(b.network));
    const worst = Math.max(overall, ...networks.map((n) => n.p75));
    if (worst < line.poor) continue;

    const slow = new Map<string, Date>();
    for (const [id, v] of s.visits) if (v.value >= line.poor) slow.set(id, v.at);
    const times = [...slow.values()].map((d) => d.getTime());
    const facts = describeVisits(slow.keys(), s.path, input);
    findings.push({
      kind: 'slow_page',
      fingerprint: s.fingerprint,
      severity: worst >= line.critical || MONEY_PATH_RE.test(s.path) ? 'critical' : 'watch',
      firstSeen: new Date(Math.min(...times)),
      lastSeen: new Date(Math.max(...times)),
      evidence: {
        type: 'slow_page',
        path: s.path,
        metric: s.metric,
        windowHours: input.windowHours,
        visits: slow.size,
        measured: s.visits.size,
        p75: Math.round(overall),
        threshold: line.poor,
        networks,
        ...facts,
        sampleVisitIds: sampleVisits(slow),
      },
      impact: {
        visitsPerDay: perDay(slow.size, input.windowHours),
        leftPerDay: perDay(facts.leftOnPage, input.windowHours),
      },
    });
  }
  return findings;
}
