import { z } from 'zod';
import { FIX_KINDS, FIX_SEVERITIES, FIX_STATUSES, NETWORKS, SLOW_METRICS } from './constants';

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

const share = z.number().min(0).max(1);
const pathCount = z.object({ path: z.string(), visits: count });

/** What every visitor-facing detector reports about the visits it saw. */
const visitorEvidence = {
  /** Path pattern the issue is on (ids collapsed to `*`). */
  path: z.string(),
  windowHours: count,
  /** Distinct visits that hit the problem in the window. */
  visits: count,
  /** Of the affected visits, how many ended on this page. */
  leftOnPage: count,
  devices: z.object({ desktop: count, mobile: count, tablet: count }),
  /** Most common browser/OS among affected visits, when one clearly dominates. */
  topBrowser: z.object({ browser: z.string(), os: z.string(), visits: count }).nullable(),
  sampleVisitIds: z.array(z.string()).max(10),
};

/** Rage or dead clicks on one element. */
export const ClickEvidence = z.object({
  type: z.literal('click'),
  ...visitorEvidence,
  /** CSS-ish selector of the element, as the SDK reported it. */
  selector: z.string(),
  /** Rage/dead click events (one per burst). */
  occurrences: count,
  /** Rage clicks only: total clicks across bursts and the biggest single burst. */
  clicks: count.optional(),
  maxBurst: count.optional(),
});
export type ClickEvidence = z.infer<typeof ClickEvidence>;

/** Visitors start a form and leave without submitting it. `visits` = abandoned visits. */
export const FormEvidence = z.object({
  type: z.literal('form'),
  ...visitorEvidence,
  /** Form id or name, as the SDK reported it. */
  form: z.string(),
  starts: count,
  submits: count,
  abandonRate: share,
  /** Fields that showed validation errors to visitors who then left, most first. */
  errorFields: z.array(z.object({ field: z.string(), visits: count, message: z.string().nullable() })).max(5),
});
export type FormEvidence = z.infer<typeof FormEvidence>;

/** A page template whose p75 LCP or INP is poor. `visits` = visits that got a poor value. */
export const SlowPageEvidence = z.object({
  type: z.literal('slow_page'),
  ...visitorEvidence,
  metric: z.enum(SLOW_METRICS),
  /** Visits measured on this template in the window. */
  measured: count,
  /** p75 across all networks, in milliseconds. */
  p75: z.number().min(0),
  /** The "poor" line the p75 crossed, in milliseconds. */
  threshold: z.number().min(0),
  /** p75 per network with enough visits to judge, slowest first. */
  networks: z.array(z.object({ network: z.enum(NETWORKS), visits: count, p75: z.number().min(0) })),
});
export type SlowPageEvidence = z.infer<typeof SlowPageEvidence>;

/** One JavaScript error (message + source) seen by several visits. `path` = where it's most common. */
export const JsErrorEvidence = z.object({
  type: z.literal('js_error'),
  ...visitorEvidence,
  message: z.string(),
  source: z.string().nullable(),
  line: count.nullable(),
  occurrences: count,
  pages: z.array(pathCount).max(5),
});
export type JsErrorEvidence = z.infer<typeof JsErrorEvidence>;

/** Visitors open a page and go straight back. `visits` = visits that U-turned. */
export const UTurnEvidence = z.object({
  type: z.literal('u_turn'),
  ...visitorEvidence,
  uTurns: count,
  /** Visits that opened the page at all. */
  reached: count,
  rate: share,
  /** Median time on the page before going back. */
  medianSeconds: z.number().min(0),
  /** Where they came from (and went back to), most first. */
  from: z.array(pathCount).max(5),
});
export type UTurnEvidence = z.infer<typeof UTurnEvidence>;

/** A live site stopped sending data. */
export const TrackingEvidence = z.object({
  type: z.literal('tracking'),
  lastEventAt: z.string().nullable(),
  silentHours: z.number().min(0),
  /** Average visits per day over the week before it went quiet. */
  typicalDailyVisits: z.number().min(0),
});
export type TrackingEvidence = z.infer<typeof TrackingEvidence>;

const EvidenceUnion = z.discriminatedUnion('type', [
  ClickEvidence,
  FormEvidence,
  SlowPageEvidence,
  JsErrorEvidence,
  UTurnEvidence,
  TrackingEvidence,
]);

/**
 * Stored as `issues.evidence`. Rows written before slice 3 part 2 have no `type`; they are all
 * click evidence (migration 0014 backfills it, this keeps old payloads readable either way).
 */
export const FixEvidence = z.preprocess(
  (v) => (v && typeof v === 'object' && !('type' in v) ? { ...v, type: 'click' } : v),
  EvidenceUnion,
);
export type FixEvidence = z.infer<typeof EvidenceUnion>;
export type FixEvidenceType = FixEvidence['type'];

/** Which evidence shape each detector kind writes. */
export const EVIDENCE_TYPE_OF: Record<FixKind, FixEvidenceType> = {
  rage_click: 'click',
  dead_click: 'click',
  form_abandon: 'form',
  slow_page: 'slow_page',
  js_error: 'js_error',
  u_turn: 'u_turn',
  tracking_broken: 'tracking',
};

/** One side of a before/after check. `value` is a rate (0–1), a p75 in ms, or an event count. */
export const VerificationMeasure = z.object({
  affected: count,
  exposed: count,
  value: z.number().min(0).nullable(),
});
export type VerificationMeasure = z.infer<typeof VerificationMeasure>;

/** Result of the `issue.verify` job. Stored as `issues.verification`. */
export const FixVerification = z.object({
  outcome: z.enum(['verified', 'reopened', 'waiting']),
  /** What `value` means: share of exposed visits, p75 milliseconds, or events received. */
  measure: z.enum(['rate', 'p75', 'events']),
  before: VerificationMeasure,
  after: VerificationMeasure,
  checkedAt: z.string(),
});
export type FixVerification = z.infer<typeof FixVerification>;

/** AI suggested fix (only present when AI is enabled for this deployment and generated). */
export const FixSuggestion = z.object({
  text: z.string(),
  code: z.string().nullable(),
  model: z.string(),
  createdAt: z.string(),
});
export type FixSuggestion = z.infer<typeof FixSuggestion>;

/** Stored as `issues.impact`. Revenue at risk arrives with order values (later). */
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
  evidence: FixEvidence,
  impact: FixImpact.nullable(),
  verification: FixVerification.nullable(),
  suggestion: FixSuggestion.nullable(),
  firstSeen: z.string(),
  lastSeen: z.string(),
  updatedAt: z.string(),
  fixedAt: z.string().nullable(),
  verifiedAt: z.string().nullable(),
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
