import type { TrackingEvidence } from '@pulse/contracts';
import { fingerprintOf } from './paths';
import {
  TRACKING_BASELINE_DAYS,
  TRACKING_CRITICAL_DAILY_VISITS,
  TRACKING_EXPECTED_GAPS,
  TRACKING_MIN_DAILY_VISITS,
  TRACKING_SILENT_MIN_HOURS,
} from './thresholds';
import type { Finding } from './types';

export interface TrackingInput {
  now: Date;
  /** Latest visit activity on the site, or null if it never sent data. */
  lastEventAt: Date | null;
  /** Visits started in the TRACKING_BASELINE_DAYS before `lastEventAt`. */
  baselineVisits: number;
}

/** One fingerprint per site: there is only one "this site stopped sending data". */
export const TRACKING_FINGERPRINT = fingerprintOf('tracking_broken', '', '');

/** Hours of silence after which a site with this much traffic counts as broken. */
export function silenceLimitHours(dailyVisits: number): number {
  if (dailyVisits <= 0) return Infinity;
  return Math.max(TRACKING_SILENT_MIN_HOURS, (TRACKING_EXPECTED_GAPS * 24) / dailyVisits);
}

/**
 * A live site that used to send data and has gone quiet for much longer than its traffic
 * explains (the snippet was removed, a deploy broke it, the CSP blocks it). Runs on a schedule,
 * not on activity, because a broken site produces no activity to trigger on.
 */
export function detectTrackingBroken(input: TrackingInput): Finding<TrackingEvidence> | null {
  if (!input.lastEventAt) return null;
  const daily = input.baselineVisits / TRACKING_BASELINE_DAYS;
  if (daily < TRACKING_MIN_DAILY_VISITS) return null;
  const silentHours = (input.now.getTime() - input.lastEventAt.getTime()) / 3600_000;
  if (silentHours < silenceLimitHours(daily)) return null;
  return {
    kind: 'tracking_broken',
    fingerprint: TRACKING_FINGERPRINT,
    severity: daily >= TRACKING_CRITICAL_DAILY_VISITS ? 'critical' : 'watch',
    firstSeen: input.lastEventAt,
    lastSeen: input.now,
    evidence: {
      type: 'tracking',
      lastEventAt: input.lastEventAt.toISOString(),
      silentHours: Math.round(silentHours * 10) / 10,
      typicalDailyVisits: Math.round(daily * 10) / 10,
    },
    impact: null,
  };
}

/** Data is flowing again after the issue was last confirmed silent. */
export const trackingResumed = (issueLastSeen: Date, lastEventAt: Date | null) =>
  !!lastEventAt && lastEventAt > issueLastSeen;
