import type { FixEvidence, FixImpact, FixKind, FixSeverity } from '@pulse/contracts';

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
  /** NetworkInformation.effectiveType when the browser reported it. */
  network?: string | null;
  /** Set once the visit has been idle for 30 minutes. */
  endedAt?: Date | null;
}

export interface DetectorInput {
  events: readonly DetectorEvent[];
  visits: ReadonlyMap<string, VisitFacts>;
  windowHours: number;
  /**
   * End of the window. Detectors never read the clock; when omitted, the latest event counts as
   * "now" (only form abandonment uses it, to give open visits time to submit).
   */
  now?: Date;
  /** Per fingerprint: ignore occurrences before this instant (a fixed issue in its cooldown). */
  ignoreBefore?: ReadonlyMap<string, Date>;
}

export interface Finding<E extends FixEvidence = FixEvidence> {
  kind: FixKind;
  fingerprint: string;
  severity: FixSeverity;
  firstSeen: Date;
  lastSeen: Date;
  evidence: E;
  impact: FixImpact | null;
}
