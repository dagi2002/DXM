import { z } from 'zod';
import {
  FIX_KINDS,
  FIX_SEVERITIES,
  REPORT_SHARE_DEFAULT_DAYS,
  REPORT_SHARE_MAX_DAYS,
} from './constants';

/**
 * Client reports (slice 6). A report is a frozen snapshot of one site's calendar month. Like the
 * fix feed, the snapshot is structured data, not prose: the web app writes the headline and the
 * sentences in the reader's language, so a report shared with an Amharic-speaking client reads in
 * Amharic without regenerating it.
 */

/** Calendar month in UTC, `YYYY-MM`. */
export const ReportPeriod = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'invalid_period');
export type ReportPeriod = z.infer<typeof ReportPeriod>;


const count = z.number().int().min(0);
/** A number this month and the same number last month; null = no data to measure it. */
const pair = <T extends z.ZodType>(v: T) => z.object({ value: v.nullable(), previous: v.nullable() });

export const ReportKpis = z.object({
  visits: z.object({ value: count, previous: count }),
  pageviews: z.object({ value: count, previous: count }),
  /** 0–1 */
  bounceRate: pair(z.number().min(0).max(1)),
  /** p75 Largest Contentful Paint on phones, ms. */
  lcp: pair(z.number().min(0)),
});
export type ReportKpis = z.infer<typeof ReportKpis>;

/** One week of the month (the last one may be shorter). */
export const ReportTrendPoint = z.object({
  /** ISO date of the bucket's first day. */
  start: z.string(),
  visits: count,
  /** Fixes marked fixed during this bucket. */
  fixesShipped: count,
});
export type ReportTrendPoint = z.infer<typeof ReportTrendPoint>;

/** Friction events per day on the fixed element: the week before the fix vs. since it shipped. */
export const FixMeasure = z.object({
  perDay: z.number().min(0).nullable(),
  /** Days measured (after: 0 = too early to tell). */
  days: z.number().min(0),
});

export const ReportFix = z.object({
  number: z.number().int().positive(),
  kind: z.enum(FIX_KINDS),
  /** From the issue's evidence; null for kinds that aren't tied to one page or element. */
  path: z.string().nullable(),
  selector: z.string().nullable(),
  status: z.enum(['fixed', 'verified']),
  fixedAt: z.string(),
  verifiedAt: z.string().nullable(),
  before: FixMeasure,
  after: FixMeasure,
});
export type ReportFix = z.infer<typeof ReportFix>;

/** Still-open work, for the "next month" section. */
export const ReportOpenFix = z.object({
  number: z.number().int().positive(),
  kind: z.enum(FIX_KINDS),
  /** From the issue's evidence; null for kinds that aren't tied to one page or element. */
  path: z.string().nullable(),
  selector: z.string().nullable(),
  severity: z.enum(FIX_SEVERITIES),
  visits: count,
});
export type ReportOpenFix = z.infer<typeof ReportOpenFix>;

export const ReportSnapshot = z.object({
  version: z.literal(1),
  generatedAt: z.string(),
  period: ReportPeriod,
  /** Inclusive start / exclusive end, ISO instants (UTC month bounds). */
  periodStart: z.string(),
  periodEnd: z.string(),
  /** Made before the month ended: numbers cover the month so far. */
  partial: z.boolean(),
  site: z.object({ name: z.string(), domain: z.string() }),
  /** Who prepared it (the organization's name). */
  agency: z.string(),
  /** False when the month had fewer than REPORT_MIN_VISITS visits. */
  enoughData: z.boolean(),
  kpis: ReportKpis,
  trend: z.array(ReportTrendPoint).max(6),
  fixed: z.array(ReportFix).max(50),
  open: z.array(ReportOpenFix).max(5),
});
export type ReportSnapshot = z.infer<typeof ReportSnapshot>;

export const ReportShare = z.object({
  id: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
  revokedAt: z.string().nullable(),
  /** Unexpired and unrevoked. */
  active: z.boolean(),
});
export type ReportShare = z.infer<typeof ReportShare>;

export const ReportSummary = z.object({
  id: z.string(),
  siteId: z.string(),
  siteName: z.string(),
  siteDomain: z.string(),
  period: ReportPeriod,
  source: z.enum(['auto', 'manual']),
  partial: z.boolean(),
  createdAt: z.string(),
  createdByName: z.string().nullable(),
  activeShares: count,
});
export type ReportSummary = z.infer<typeof ReportSummary>;

export const ReportList = z.object({ reports: z.array(ReportSummary) });
export type ReportList = z.infer<typeof ReportList>;

export const ReportDetail = z.object({
  report: ReportSummary.extend({ snapshot: ReportSnapshot }),
  shares: z.array(ReportShare),
});
export type ReportDetail = z.infer<typeof ReportDetail>;

export const ReportListQuery = z.object({ siteId: z.string().min(1).max(64).optional() });

export const ReportCreate = z.object({ siteId: z.string().min(1).max(64), period: ReportPeriod });
export type ReportCreate = z.infer<typeof ReportCreate>;

export const ReportShareCreate = z.object({
  expiresInDays: z.number().int().min(1).max(REPORT_SHARE_MAX_DAYS).default(REPORT_SHARE_DEFAULT_DAYS),
});
export type ReportShareCreate = z.input<typeof ReportShareCreate>;

/** The token is returned once, here, and never again: only its hash is stored. */
export const ReportShareCreated = z.object({ share: ReportShare, token: z.string() });
export type ReportShareCreated = z.infer<typeof ReportShareCreated>;

/** `GET /api/v1/public/reports/:token` — only the snapshot, nothing else about the org. */
export const PublicReport = z.object({
  report: z.object({ period: ReportPeriod, expiresAt: z.string(), snapshot: ReportSnapshot }),
});
export type PublicReport = z.infer<typeof PublicReport>;

/** Share tokens are URL-safe base62; anything else is rejected before touching the database. */
export const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{8,128}$/;
