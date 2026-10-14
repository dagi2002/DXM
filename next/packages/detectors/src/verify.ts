import type { FixEvidence, FixKind, FixVerification, VerificationMeasure } from '@pulse/contracts';
import { DEAD_CLICK_RULE, RAGE_CLICK_RULE, clickKey } from './click';
import { errorGroups } from './errors';
import { formStats } from './form';
import { fingerprintOf, normalizePath } from './paths';
import { p75Of, speedStats } from './slow';
import {
  VERIFY_AFTER_END_DAYS,
  VERIFY_AFTER_START_DAYS,
  VERIFY_BEFORE_DAYS,
  VERIFY_GIVE_UP_DAYS,
  VERIFY_MAX_REMAINING,
  VERIFY_MIN_EXPOSED,
  VERIFY_MIN_SPEED_SAMPLES,
  VERIFY_TRACKING_HOURS,
} from './thresholds';
import type { DetectorInput } from './types';
import { uTurnStats } from './uturn';

const DAY = 86_400_000;

export interface TimeRange {
  start: Date;
  end: Date;
}

export interface VerifyWindows {
  before: TimeRange;
  after: TimeRange;
  /** The check can run from here (the after window is complete). */
  dueAt: Date;
  /** After this, a fix that never got enough traffic to judge stays "fixed". */
  giveUpAt: Date;
}

/** 7 days before vs days 3–7 after `fixed_at` (tracking: the 24 h after data resumed). */
export function verificationWindows(kind: FixKind, fixedAt: Date): VerifyWindows {
  const t = fixedAt.getTime();
  const giveUpAt = new Date(t + VERIFY_GIVE_UP_DAYS * DAY);
  const before = { start: new Date(t - VERIFY_BEFORE_DAYS * DAY), end: fixedAt };
  if (kind === 'tracking_broken') {
    const end = new Date(t + VERIFY_TRACKING_HOURS * 3600_000);
    return { before, after: { start: fixedAt, end }, dueAt: end, giveUpAt };
  }
  const end = new Date(t + VERIFY_AFTER_END_DAYS * DAY);
  return { before, after: { start: new Date(t + VERIFY_AFTER_START_DAYS * DAY), end }, dueAt: end, giveUpAt };
}

export const MEASURE_OF: Record<FixKind, FixVerification['measure']> = {
  rage_click: 'rate',
  dead_click: 'rate',
  form_abandon: 'rate',
  js_error: 'rate',
  u_turn: 'rate',
  slow_page: 'p75',
  tracking_broken: 'events',
};

/** Event types the worker loads to measure an issue of this kind. */
export function verifyEventTypes(kind: FixKind): string[] {
  switch (kind) {
    case 'rage_click':
      return ['pv', 'rc'];
    case 'dead_click':
      return ['pv', 'dc'];
    case 'form_abandon':
      return ['fs', 'fx', 'fe'];
    case 'slow_page':
      return ['vt'];
    case 'js_error':
      return ['pv', 'er'];
    case 'u_turn':
      return ['pv'];
    case 'tracking_broken':
      return ['pv'];
    default:
      return kind satisfies never;
  }
}

const rate = (affected: number, exposed: number): VerificationMeasure => ({
  affected,
  exposed,
  value: exposed ? Math.round((affected / exposed) * 10_000) / 10_000 : null,
});

/**
 * Measures one issue over one window of events: how many visits could have hit it (exposed) and
 * how many did (affected). Uses the same grouping as the detectors, so before and after are
 * counted exactly the way the issue was found.
 */
export function measureIssue(kind: FixKind, evidence: FixEvidence, input: DetectorInput): VerificationMeasure {
  const visitsWith = (pred: (path: string | null, type: string) => boolean) => {
    const ids = new Set<string>();
    for (const e of input.events) if (pred(normalizePath(e.path), e.type)) ids.add(e.visitId);
    return ids;
  };
  switch (evidence.type) {
    case 'click': {
      const rule = kind === 'rage_click' ? RAGE_CLICK_RULE : DEAD_CLICK_RULE;
      const exposed = visitsWith((p, t) => t === 'pv' && p === evidence.path);
      const affected = new Set<string>();
      for (const e of input.events) {
        if (e.type !== rule.eventType) continue;
        const key = clickKey(e);
        if (key?.path === evidence.path && key.selector === evidence.selector) {
          affected.add(e.visitId);
          exposed.add(e.visitId);
        }
      }
      return rate(affected.size, exposed.size);
    }
    case 'form': {
      const s = formStats(input).get(`${evidence.path}\u0000${evidence.form}`);
      return rate(s?.abandoned.size ?? 0, s?.starts ?? 0);
    }
    case 'js_error': {
      const exposed = visitsWith(() => true);
      const fp = fingerprintOf('js_error', evidence.message, evidence.source ?? '');
      return rate(errorGroups(input).get(fp)?.visits.size ?? 0, exposed.size);
    }
    case 'u_turn': {
      const s = uTurnStats(input).get(evidence.path);
      return rate(s?.turned.size ?? 0, s?.reached.size ?? 0);
    }
    case 'slow_page': {
      const s = speedStats(input).get(`${evidence.path}\u0000${evidence.metric}`);
      if (!s) return { affected: 0, exposed: 0, value: null };
      const affected = [...s.visits.values()].filter((v) => v.value >= evidence.threshold).length;
      return { affected, exposed: s.visits.size, value: Math.round(p75Of(s)!) };
    }
    case 'tracking': {
      const exposed = visitsWith(() => true).size;
      return { affected: 0, exposed, value: exposed };
    }
    default:
      return evidence satisfies never;
  }
}

/**
 * Verified when the problem clearly went away in the after window; reopened when it didn't;
 * waiting while there isn't enough traffic after the fix to tell.
 */
export function judgeVerification(
  evidence: FixEvidence,
  before: VerificationMeasure,
  after: VerificationMeasure,
): FixVerification['outcome'] {
  if (evidence.type === 'tracking') return after.exposed > 0 ? 'verified' : 'reopened';
  if (evidence.type === 'slow_page') {
    if (after.exposed < VERIFY_MIN_SPEED_SAMPLES || after.value === null) return 'waiting';
    return after.value < evidence.threshold ? 'verified' : 'reopened';
  }
  if (after.exposed < VERIFY_MIN_EXPOSED) return 'waiting';
  if (after.affected === 0) return 'verified';
  if (!before.value) return 'reopened';
  return after.value! <= before.value * VERIFY_MAX_REMAINING ? 'verified' : 'reopened';
}
