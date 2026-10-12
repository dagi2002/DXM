/**
 * Pure detectors (ADR-007): events in, findings out. No I/O, no clock — the worker loads the
 * window, runs these, and upserts `issues` by fingerprint.
 */
import { detectDeadClicks, detectRageClicks, type DetectorInput, type Finding } from './click';

export * from './click';
export * from './paths';
export * from './reconcile';
export * from './thresholds';

/** Every detector that runs on the per-site schedule. */
export const DETECTORS = [detectRageClicks, detectDeadClicks] as const;

/** Runs all detectors; critical first, then by how many visits ran into it. */
export function runDetectors(input: DetectorInput): Finding[] {
  return DETECTORS.flatMap((d) => d(input)).sort(
    (a, b) =>
      (a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1) ||
      b.evidence.visits - a.evidence.visits ||
      a.fingerprint.localeCompare(b.fingerprint),
  );
}

/** Event types the detectors read — the worker loads only these. */
export const DETECTOR_EVENT_TYPES = ['rc', 'dc'] as const;
