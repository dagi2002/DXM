import type { ClickEvidence, FixKind } from '@pulse/contracts';
import { fingerprintOf, normalizePath } from './paths';
import { describeVisits, perDay, sampleVisits, upsert, visitSeverity } from './shared';
import {
  DEAD_CLICK_CRITICAL_VISITS,
  DEAD_CLICK_MIN_VISITS,
  RAGE_CLICK_CRITICAL_VISITS,
  RAGE_CLICK_MIN_VISITS,
} from './thresholds';
import type { DetectorEvent, DetectorInput, Finding } from './types';

export interface ClickRule {
  kind: Extract<FixKind, 'rage_click' | 'dead_click'>;
  eventType: 'rc' | 'dc';
  minVisits: number;
  criticalVisits: number;
}

export const RAGE_CLICK_RULE: ClickRule = {
  kind: 'rage_click',
  eventType: 'rc',
  minVisits: RAGE_CLICK_MIN_VISITS,
  criticalVisits: RAGE_CLICK_CRITICAL_VISITS,
};
export const DEAD_CLICK_RULE: ClickRule = {
  kind: 'dead_click',
  eventType: 'dc',
  minVisits: DEAD_CLICK_MIN_VISITS,
  criticalVisits: DEAD_CLICK_CRITICAL_VISITS,
};

export interface ClickGroup {
  path: string;
  selector: string;
  fingerprint: string;
  occurrences: number;
  clicks: number;
  maxBurst: number;
  first: Date;
  last: Date;
  /** visit id → its latest occurrence */
  visits: Map<string, Date>;
}

export const severityFor = (rule: ClickRule, path: string, visits: number) =>
  visitSeverity(path, visits, rule);

/** (page template, element) of a click event, or null when it's malformed. */
export function clickKey(e: DetectorEvent): { path: string; selector: string } | null {
  const path = normalizePath(e.path);
  const selector = typeof e.props.s === 'string' ? e.props.s.trim() : '';
  return path && selector ? { path, selector } : null;
}

/** Groups rage or dead clicks by (page template, element). */
export function clickGroups(rule: ClickRule, input: DetectorInput): Map<string, ClickGroup> {
  const groups = new Map<string, ClickGroup>();
  for (const e of input.events) {
    if (e.type !== rule.eventType) continue;
    const key = clickKey(e);
    if (!key) continue;
    const g = upsert(groups, `${key.path}\u0000${key.selector}`, () => ({
      ...key,
      fingerprint: fingerprintOf(rule.kind, key.path, key.selector),
      occurrences: 0,
      clicks: 0,
      maxBurst: 0,
      first: e.at,
      last: e.at,
      visits: new Map<string, Date>(),
    }));
    const cutoff = input.ignoreBefore?.get(g.fingerprint);
    if (cutoff && e.at < cutoff) continue;
    const burst = typeof e.props.n === 'number' && e.props.n > 0 ? Math.floor(e.props.n) : 1;
    // `first` starts at the first event seen even if it was cut off; fix it on the first kept one.
    if (g.occurrences === 0 || e.at < g.first) g.first = e.at;
    if (e.at > g.last || g.occurrences === 0) g.last = e.at;
    g.occurrences += 1;
    g.clicks += burst;
    g.maxBurst = Math.max(g.maxBurst, burst);
    const prev = g.visits.get(e.visitId);
    if (!prev || e.at > prev) g.visits.set(e.visitId, e.at);
  }
  return groups;
}

/**
 * Reports the (page template, element) groups that enough distinct visits ran into. The SDK
 * already collapses bursts, so one event = one frustrated moment.
 */
export function detectClicks(rule: ClickRule, input: DetectorInput): Finding<ClickEvidence>[] {
  const findings: Finding<ClickEvidence>[] = [];
  for (const g of clickGroups(rule, input).values()) {
    const visitCount = g.visits.size;
    if (visitCount < rule.minVisits) continue;
    const facts = describeVisits(g.visits.keys(), g.path, input);
    const evidence: ClickEvidence = {
      type: 'click',
      path: g.path,
      selector: g.selector,
      windowHours: input.windowHours,
      visits: visitCount,
      occurrences: g.occurrences,
      ...(rule.kind === 'rage_click' ? { clicks: g.clicks, maxBurst: g.maxBurst } : {}),
      ...facts,
      sampleVisitIds: sampleVisits(g.visits),
    };
    findings.push({
      kind: rule.kind,
      fingerprint: g.fingerprint,
      severity: severityFor(rule, g.path, visitCount),
      firstSeen: g.first,
      lastSeen: g.last,
      evidence,
      impact: {
        visitsPerDay: perDay(visitCount, input.windowHours),
        leftPerDay: perDay(facts.leftOnPage, input.windowHours),
      },
    });
  }
  return findings;
}

export const detectRageClicks = (input: DetectorInput) => detectClicks(RAGE_CLICK_RULE, input);
export const detectDeadClicks = (input: DetectorInput) => detectClicks(DEAD_CLICK_RULE, input);
