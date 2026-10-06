import { z } from 'zod';

/**
 * Wire format between the browser SDK (v3) and the collector. Field names are short because
 * every byte is paid for on Ethiopian mobile data. Validation here is the collector's only
 * trust boundary: anything a visitor's browser sends is untrusted.
 */

const ts = z.number().int().min(0).max(1e13);
const path = z.string().max(300);
const selector = z.string().max(120);

const base = { ts, p: path };

export const IngestEvent = z.discriminatedUnion('t', [
  /** pageview (first one in a visit also carries the referrer host and UTM tags) */
  z.object({
    t: z.literal('pv'),
    ...base,
    q: z.string().max(300).optional(),
    r: z.string().max(253).optional(),
  }),
  /** click: x as a 0–1 ratio of viewport width (layout-independent), y in document px */
  z.object({
    t: z.literal('cl'),
    ...base,
    s: selector,
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1e6),
  }),
  /** rage click: n rapid clicks on the same target */
  z.object({ t: z.literal('rc'), ...base, s: selector, n: z.number().int().min(3).max(1000) }),
  /** dead click: no DOM change, navigation or focus after a click */
  z.object({ t: z.literal('dc'), ...base, s: selector }),
  /** max scroll depth reached on the page, percent */
  z.object({ t: z.literal('sc'), ...base, d: z.number().int().min(0).max(100) }),
  /** form start / submit / error — field names only, never values */
  z.object({ t: z.literal('fs'), ...base, f: z.string().max(80) }),
  z.object({ t: z.literal('fx'), ...base, f: z.string().max(80) }),
  z.object({
    t: z.literal('fe'),
    ...base,
    f: z.string().max(80),
    n: z.string().max(80),
    m: z.string().max(120).optional(),
  }),
  /** JavaScript error */
  z.object({
    t: z.literal('er'),
    ...base,
    m: z.string().max(300),
    src: z.string().max(200).optional(),
    l: z.number().int().min(0).max(1e7).optional(),
  }),
  /** Core Web Vital, one final value per page */
  z.object({
    t: z.literal('vt'),
    ...base,
    n: z.enum(['LCP', 'INP', 'CLS', 'FCP', 'TTFB']),
    v: z.number().min(0).max(600_000),
  }),
  /** custom event */
  z.object({
    t: z.literal('ce'),
    ...base,
    n: z.string().min(1).max(64),
    pr: z
      .record(z.string().max(40), z.union([z.string().max(200), z.number(), z.boolean()]))
      .refine((o) => Object.keys(o).length <= 10, 'max 10 props')
      .optional(),
  }),
]);
export type IngestEvent = z.infer<typeof IngestEvent>;
export type IngestEventType = IngestEvent['t'];

export const IngestContext = z.object({
  /** viewport and screen size */
  vw: z.number().int().min(0).max(20_000),
  vh: z.number().int().min(0).max(20_000),
  sw: z.number().int().min(0).max(20_000).optional(),
  /** navigator.language */
  lang: z.string().max(35).optional(),
  /** NetworkInformation.effectiveType */
  net: z.enum(['slow-2g', '2g', '3g', '4g']).optional(),
  /** where the page runs */
  plat: z.enum(['web', 'telegram_mini_app']).default('web'),
  /** Telegram client platform when inside a Mini App (ios, android, tdesktop, …) */
  tgp: z.string().max(20).optional(),
  tz: z.string().max(64).optional(),
});
export type IngestContext = z.infer<typeof IngestContext>;

export const VISIT_ID_RE = /^[A-Za-z0-9_-]{8,40}$/;

export const IngestBatch = z.object({
  v: z.literal(3),
  /** site public key */
  k: z.string().min(3).max(64),
  /** visit id (random per tab, rolls after 30 min idle) */
  vid: z.string().regex(VISIT_ID_RE),
  /** batch sequence within the visit — used to drop duplicate deliveries */
  seq: z.number().int().min(0).max(1_000_000).optional(),
  /** SDK build */
  sv: z.string().max(20).optional(),
  ctx: IngestContext,
  ev: z.array(IngestEvent).min(1).max(100),
});
export type IngestBatch = z.infer<typeof IngestBatch>;

/** What the collector enqueues for the worker (server-side facts added, IP never stored). */
export interface IngestJob {
  siteId: string;
  orgId: string;
  receivedAt: string;
  userAgent: string;
  country?: string;
  batch: IngestBatch;
}

export const INGEST_MAX_BYTES = 64 * 1024;
