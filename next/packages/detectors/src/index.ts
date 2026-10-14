/**
 * Pure detectors (ADR-007): events in, findings out. No I/O, no clock — the worker loads the
 * window, runs these, and upserts `issues` by fingerprint.
 */
import { detectDeadClicks, detectRageClicks } from './click';
import { detectJsErrors } from './errors';
import { detectFormAbandonment } from './form';
import { detectSlowPages } from './slow';
import type { DetectorInput, Finding } from './types';
import { detectUTurns } from './uturn';

export * from './click';
export * from './errors';
export * from './form';
export * from './paths';
export * from './reconcile';
export * from './shared';
export * from './slow';
export * from './thresholds';
export * from './tracking';
export * from './types';
export * from './uturn';
export * from './verify';

/**
 * Every detector that runs on the per-site activity schedule. Tracking-broken is not here: it
 * runs on its own schedule because a broken site produces no activity to trigger on.
 */
export const DETECTORS: readonly ((input: DetectorInput) => Finding[])[] = [
  detectRageClicks,
  detectDeadClicks,
  detectFormAbandonment,
  detectSlowPages,
  detectJsErrors,
  detectUTurns,
];

/** Runs all detectors; critical first, then by how many visits ran into it. */
export function runDetectors(input: DetectorInput): Finding[] {
  const visits = (f: Finding) => ('visits' in f.evidence ? f.evidence.visits : 0);
  return DETECTORS.flatMap((d) => d(input)).sort(
    (a, b) =>
      (a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1) ||
      visits(b) - visits(a) ||
      a.fingerprint.localeCompare(b.fingerprint),
  );
}

/** Event types the detectors read — the worker loads only these. */
export const DETECTOR_EVENT_TYPES = ['rc', 'dc', 'fs', 'fx', 'fe', 'vt', 'er', 'pv'] as const;
