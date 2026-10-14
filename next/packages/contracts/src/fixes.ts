import { z } from 'zod';
import { FIX_KINDS, FIX_SEVERITIES, FIX_STATUSES } from './constants';

/**
 * "What to fix" feed (slice 3). The API returns structured evidence; the web app turns it into
 * sentences in the reader's language, so nothing here is user-facing English.
 */

export const FixKind = z.enum(FIX_KINDS);
export const FixSeverity = z.enum(FIX_SEVERITIES);
export const FixStatus = z.enum(FIX_STATUSES);
export type FixKind = z.infer<typeof FixKind>;
export type FixSeverity = z.infer<typeof FixSeverity>;
export type FixStatus = z.infer<typeof FixStatus>;

const count = z.number().int().min(0);

/** What a click detector saw over its window. Stored as `issues.evidence`. */
export const ClickEvidence = z.object({
  /** Path pattern the issue is on (ids collapsed to `*`). */
  path: z.string(),
  /** CSS-ish selector of the element, as the SDK reported it. */
  selector: z.string(),
  windowHours: count,
  /** Distinct visits that hit the problem in the window. */
  visits: count,
  /** Rage/dead click events (one per burst). */
  occurrences: count,
  /** Rage clicks only: total clicks across bursts and the biggest single burst. */
  clicks: count.optional(),
  maxBurst: count.optional(),
  /** Of the affected visits, how many ended on this page. */
  leftOnPage: count,
  devices: z.object({ desktop: count, mobile: count, tablet: count }),
  /** Most common browser/OS among affected visits, when one clearly dominates. */
  topBrowser: z.object({ browser: z.string(), os: z.string(), visits: count }).nullable(),
  sampleVisitIds: z.array(z.string()).max(10),
});
export type ClickEvidence = z.infer<typeof ClickEvidence>;

/** Stored as `issues.impact`. Revenue at risk arrives with order values (slice 3, later). */
export const FixImpact = z.object({
  visitsPerDay: z.number().min(0),
  leftPerDay: z.number().min(0),
});
export type FixImpact = z.infer<typeof FixImpact>;

export const Fix = z.object({
  id: z.string(),
  /** Per-organization running number shown as "Fix #12". */
  number: z.number().int().positive(),
  siteId: z.string(),
  siteName: z.string(),
  siteDomain: z.string(),
  kind: FixKind,
  severity: FixSeverity,
  status: FixStatus,
  evidence: ClickEvidence,
  impact: FixImpact.nullable(),
  firstSeen: z.string(),
  lastSeen: z.string(),
  updatedAt: z.string(),
  fixedAt: z.string().nullable(),
  verifiedAt: z.string().nullable(),
  /** Evidence visits that have a session replay (slice 4), newest first. */
  replayIds: z.array(z.string()),
});
export type Fix = z.infer<typeof Fix>;

export const FixList = z.object({ fixes: z.array(Fix) });
export type FixList = z.infer<typeof FixList>;

export const FixListQuery = z.object({
  status: FixStatus.optional(),
  siteId: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export type FixListQuery = z.input<typeof FixListQuery>;

export const FixHistoryEntry = z.object({
  fromStatus: FixStatus.nullable(),
  toStatus: FixStatus,
  /** null = changed by the system (detection, regression, verification). */
  actorUserId: z.string().nullable(),
  actorName: z.string().nullable(),
  at: z.string(),
});
export const FixDetail = z.object({ fix: Fix, history: z.array(FixHistoryEntry) });
export type FixDetail = z.infer<typeof FixDetail>;

export const FixStatusUpdate = z.object({ status: FixStatus });
export type FixStatusUpdate = z.infer<typeof FixStatusUpdate>;
