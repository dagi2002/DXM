import type { FixSeverity, FixStatus } from '@pulse/contracts';
import type { Finding } from './types';
import { REGRESSION_COOLDOWN_MINUTES } from './thresholds';

/** The parts of a stored issue that decide what a new finding does to it. */
export interface ExistingIssue {
  status: FixStatus;
  severity: FixSeverity;
  fixedAt: Date | null;
  verifiedAt: Date | null;
}

export type UpsertPlan =
  /** New problem: create an open issue. */
  | { action: 'create' }
  /** Known problem: refresh evidence, severity and last_seen; status untouched. */
  | { action: 'refresh'; escalated: boolean }
  /** A fixed/verified problem came back after the cooldown: reopen it. */
  | { action: 'reopen' }
  /** Nothing to do (only occurrences inside the cooldown). */
  | { action: 'skip' };

/**
 * For fixed or verified issues: occurrences before this instant don't count (deploy lag,
 * cached pages). Undefined for issues that aren't fixed.
 */
export function cooldownCutoff(issue: ExistingIssue): Date | undefined {
  if (issue.status !== 'fixed' && issue.status !== 'verified') return undefined;
  const since = issue.fixedAt ?? issue.verifiedAt;
  if (!since) return undefined;
  return new Date(since.getTime() + REGRESSION_COOLDOWN_MINUTES * 60_000);
}

/**
 * Decides what a finding does to the issue with the same fingerprint. Dismissed issues are never
 * reopened by detection (the owner said "not a problem"); they still record when it last happened.
 */
export function planUpsert(existing: ExistingIssue | undefined, finding: Finding): UpsertPlan {
  if (!existing) return { action: 'create' };
  switch (existing.status) {
    case 'open':
    case 'fixing':
    case 'dismissed':
      return {
        action: 'refresh',
        escalated:
          existing.status !== 'dismissed' && existing.severity === 'watch' && finding.severity === 'critical',
      };
    case 'fixed':
    case 'verified': {
      const cutoff = cooldownCutoff(existing);
      if (cutoff && finding.lastSeen < cutoff) return { action: 'skip' };
      return { action: 'reopen' };
    }
    default:
      return existing.status satisfies never;
  }
}
