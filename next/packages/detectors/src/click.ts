import type { ClickEvidence, FixImpact, FixKind, FixSeverity } from '@pulse/contracts';
import { fingerprintOf, normalizePath } from './paths';
import {
  DEAD_CLICK_CRITICAL_VISITS,
  DEAD_CLICK_MIN_VISITS,
  MAX_SAMPLE_VISITS,
  MONEY_PATH_CRITICAL_VISITS,
  MONEY_PATH_RE,
  RAGE_CLICK_CRITICAL_VISITS,
  RAGE_CLICK_MIN_VISITS,
  TOP_BROWSER_MIN_SHARE,
} from './thresholds';

/** One stored event, as the worker loads it from `events`. */
export interface DetectorEvent {
  visitId: string;
  at: Date;
  type: string;
  path: string | null;
  props: Record<string, unknown>;
}

/** What the detectors need to know about a visit (from `visits`). */
export interface VisitFacts {
  device: 'desktop' | 'mobile' | 'tablet';
  browser: string | null;
  os: string | null;
  exitPath: string | null;
}

export interface DetectorInput {
  events: readonly DetectorEvent[];
  visits: ReadonlyMap<string, VisitFacts>;
  windowHours: number;
  /** Per fingerprint: ignore occurrences before this instant (a fixed issue in its cooldown). */
  ignoreBefore?: ReadonlyMap<string, Date>;
}

export interface Finding {
  kind: FixKind;
  fingerprint: string;
  severity: FixSeverity;
  firstSeen: Date;
  lastSeen: Date;
  evidence: ClickEvidence;
  impact: FixImpact;
}

interface ClickRule {
  kind: FixKind;
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

interface Group {
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

export function severityFor(rule: ClickRule, path: string, visits: number): FixSeverity {
  const critical = MONEY_PATH_RE.test(path)
    ? Math.max(rule.minVisits, Math.min(rule.criticalVisits, MONEY_PATH_CRITICAL_VISITS))
    : rule.criticalVisits;
  return visits >= critical ? 'critical' : 'watch';
}

const perDay = (n: number, windowHours: number) =>
  Math.round(((n * 24) / Math.max(1, windowHours)) * 10) / 10;

/**
 * Groups rage or dead clicks by (page template, element) and reports the groups that enough
 * distinct visits ran into. The SDK already collapses bursts, so one event = one frustrated moment.
 */
export function detectClicks(rule: ClickRule, input: DetectorInput): Finding[] {
  const groups = new Map<string, Group>();
  for (const e of input.events) {
    if (e.type !== rule.eventType) continue;
    const path = normalizePath(e.path);
    const selector = typeof e.props.s === 'string' ? e.props.s.trim() : '';
    if (!path || !selector) continue;
    const key = `${path}\u0000${selector}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        path,
        selector,
        fingerprint: fingerprintOf(rule.kind, path, selector),
        occurrences: 0,
        clicks: 0,
        maxBurst: 0,
        first: e.at,
        last: e.at,
        visits: new Map(),
      };
      groups.set(key, g);
    }
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

  const findings: Finding[] = [];
  for (const g of groups.values()) {
    const visitCount = g.visits.size;
    if (visitCount < rule.minVisits) continue;

    const devices = { desktop: 0, mobile: 0, tablet: 0 };
    const browsers = new Map<string, { browser: string; os: string; visits: number }>();
    let leftOnPage = 0;
    for (const id of g.visits.keys()) {
      const v = input.visits.get(id);
      if (!v) continue;
      devices[v.device] += 1;
      if (normalizePath(v.exitPath) === g.path) leftOnPage += 1;
      if (v.browser && v.os) {
        const k = `${v.browser}\u0000${v.os}`;
        const b = browsers.get(k) ?? { browser: v.browser, os: v.os, visits: 0 };
        b.visits += 1;
        browsers.set(k, b);
      }
    }
    const top = [...browsers.values()].sort((a, b) => b.visits - a.visits)[0];
    const sampleVisitIds = [...g.visits.entries()]
      .sort((a, b) => b[1].getTime() - a[1].getTime() || a[0].localeCompare(b[0]))
      .slice(0, MAX_SAMPLE_VISITS)
      .map(([id]) => id);

    const evidence: ClickEvidence = {
      path: g.path,
      selector: g.selector,
      windowHours: input.windowHours,
      visits: visitCount,
      occurrences: g.occurrences,
      ...(rule.kind === 'rage_click' ? { clicks: g.clicks, maxBurst: g.maxBurst } : {}),
      leftOnPage,
      devices,
      topBrowser: top && top.visits / visitCount >= TOP_BROWSER_MIN_SHARE ? top : null,
      sampleVisitIds,
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
        leftPerDay: perDay(leftOnPage, input.windowHours),
      },
    });
  }
  return findings;
}

export const detectRageClicks = (input: DetectorInput) => detectClicks(RAGE_CLICK_RULE, input);
export const detectDeadClicks = (input: DetectorInput) => detectClicks(DEAD_CLICK_RULE, input);
