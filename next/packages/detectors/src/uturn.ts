import type { UTurnEvidence } from '@pulse/contracts';
import { fingerprintOf, normalizePath } from './paths';
import { describeVisits, percentile, perDay, sampleVisits, upsert, visitSeverity } from './shared';
import { U_TURN_CRITICAL_VISITS, U_TURN_MAX_SECONDS, U_TURN_MIN_RATE, U_TURN_MIN_VISITS } from './thresholds';
import type { DetectorInput, Finding } from './types';

export interface UTurnStats {
  path: string;
  fingerprint: string;
  /** Visits that opened the page. */
  reached: Set<string>;
  /** visit id → when it went back */
  turned: Map<string, Date>;
  occurrences: number;
  seconds: number[];
  /** previous page → visits that came from it and went straight back */
  from: Map<string, Set<string>>;
}

/**
 * U-turns per page template: a visit goes A → B → back to A within U_TURN_MAX_SECONDS. B is the
 * page that didn't give them what they expected. Reloads (A → A) are collapsed first.
 */
export function uTurnStats(input: DetectorInput): Map<string, UTurnStats> {
  const byVisit = new Map<string, { path: string; at: Date }[]>();
  for (const e of input.events) {
    if (e.type !== 'pv') continue;
    const path = normalizePath(e.path);
    if (path) upsert(byVisit, e.visitId, () => []).push({ path, at: e.at });
  }
  const stats = new Map<string, UTurnStats>();
  const statsFor = (path: string) =>
    upsert(stats, path, () => ({
      path,
      fingerprint: fingerprintOf('u_turn', path, ''),
      reached: new Set<string>(),
      turned: new Map<string, Date>(),
      occurrences: 0,
      seconds: [],
      from: new Map<string, Set<string>>(),
    }));
  for (const [visitId, raw] of byVisit) {
    raw.sort((a, b) => a.at.getTime() - b.at.getTime());
    const views = raw.filter((v, i) => i === 0 || v.path !== raw[i - 1]!.path);
    for (let i = 0; i < views.length; i++) {
      const b = views[i]!;
      const s = statsFor(b.path);
      const cutoff = input.ignoreBefore?.get(s.fingerprint);
      if (cutoff && b.at < cutoff) continue;
      s.reached.add(visitId);
      const a = views[i - 1];
      const back = views[i + 1];
      if (!a || !back || back.path !== a.path) continue;
      const seconds = (back.at.getTime() - b.at.getTime()) / 1000;
      if (seconds > U_TURN_MAX_SECONDS) continue;
      s.occurrences += 1;
      s.seconds.push(seconds);
      const prev = s.turned.get(visitId);
      if (!prev || back.at > prev) s.turned.set(visitId, back.at);
      upsert(s.from, a.path, () => new Set()).add(visitId);
    }
  }
  return stats;
}

/** Pages a meaningful share of visitors open and immediately leave the way they came. */
export function detectUTurns(input: DetectorInput): Finding<UTurnEvidence>[] {
  const findings: Finding<UTurnEvidence>[] = [];
  for (const s of uTurnStats(input).values()) {
    const visits = s.turned.size;
    if (visits < U_TURN_MIN_VISITS) continue;
    const rate = s.reached.size ? visits / s.reached.size : 0;
    if (rate < U_TURN_MIN_RATE) continue;
    const times = [...s.turned.values()].map((d) => d.getTime());
    const facts = describeVisits(s.turned.keys(), s.path, input);
    findings.push({
      kind: 'u_turn',
      fingerprint: s.fingerprint,
      severity: visitSeverity(s.path, visits, {
        minVisits: U_TURN_MIN_VISITS,
        criticalVisits: U_TURN_CRITICAL_VISITS,
      }),
      firstSeen: new Date(Math.min(...times)),
      lastSeen: new Date(Math.max(...times)),
      evidence: {
        type: 'u_turn',
        path: s.path,
        windowHours: input.windowHours,
        visits,
        uTurns: s.occurrences,
        reached: s.reached.size,
        rate: Math.round(rate * 1000) / 1000,
        medianSeconds: Math.round(percentile(s.seconds, 0.5)! * 10) / 10,
        from: [...s.from.entries()]
          .map(([path, ids]) => ({ path, visits: ids.size }))
          .sort((a, b) => b.visits - a.visits || a.path.localeCompare(b.path))
          .slice(0, 5),
        ...facts,
        sampleVisitIds: sampleVisits(s.turned),
      },
      impact: {
        visitsPerDay: perDay(visits, input.windowHours),
        leftPerDay: perDay(facts.leftOnPage, input.windowHours),
      },
    });
  }
  return findings;
}
