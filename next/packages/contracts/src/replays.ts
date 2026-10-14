import { z } from 'zod';
import { VISIT_ID_RE } from './ingest';

/**
 * Session replay (slice 4). The SDK's lazy `r.js` records rrweb events, gzips them and posts
 * them in chunks; the collector stores each chunk as a blob and the API serves them back.
 */

/** Hard cap on one chunk as received (compressed), enforced while streaming the body. */
export const REPLAY_CHUNK_MAX_BYTES = 512 * 1024;
/** Cap on one chunk once decompressed — guards against gzip bombs. */
export const REPLAY_CHUNK_MAX_INFLATED_BYTES = 8 * 1024 * 1024;
/** Highest chunk sequence number accepted for one visit. */
export const REPLAY_MAX_SEQ = 100_000;
/** Default replay retention in days (REPLAY_RETENTION_DAYS overrides it). */
export const REPLAY_RETENTION_DAYS = 30;

/** Query string of `POST /i/replay` (the body is the gzip'd JSON array of rrweb events). */
export const ReplayChunkParams = z.object({
  /** site public key */
  k: z.string().min(3).max(64),
  /** visit id — the same one the core SDK sends events under */
  vid: z.string().regex(VISIT_ID_RE),
  seq: z.coerce.number().int().min(0).max(REPLAY_MAX_SEQ),
});
export type ReplayChunkParams = z.infer<typeof ReplayChunkParams>;

/** Query string of `GET /i/replay/cfg`: should this visit be recorded? */
export const ReplayConfigParams = ReplayChunkParams.pick({ k: true, vid: true });
export const ReplayConfig = z.object({ on: z.boolean() });
export type ReplayConfig = z.infer<typeof ReplayConfig>;

/** The minimum an rrweb event must look like for the collector to accept it. */
export const RrwebEvent = z.looseObject({
  type: z.number().int().min(0).max(10),
  timestamp: z.number().finite().positive().max(1e13),
});

/**
 * Deterministic sampling: a visit is recorded when hash(visitId) falls under the site's rate, so
 * every page of a sampled visit is recorded and the decision never flips mid-visit.
 */
export function replaySampled(visitId: string, rate: number): boolean {
  if (rate >= 1) return true;
  if (rate <= 0) return false;
  let h = 0x811c9dc5; // FNV-1a
  for (let i = 0; i < visitId.length; i++) {
    h ^= visitId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h / 0x100000000 < rate;
}

/** What the collector enqueues once a chunk's blob is written (metadata only). */
export interface ReplayChunkJob {
  orgId: string;
  siteId: string;
  visitId: string;
  seq: number;
  bytes: number;
  objectKey: string;
  events: number;
  firstTs: string;
  lastTs: string;
  hasSnapshot: boolean;
  receivedAt: string;
}

/* ── API ─────────────────────────────────────────────────────────────────── */

export const ReplayListQuery = z.object({
  siteId: z.string().min(1).max(64).optional(),
  /** Only visits with friction (rage/dead clicks, errors, form errors). */
  friction: z.enum(['1', 'true']).optional(),
  /** Only visits a fix cites as evidence. */
  fixId: z.string().min(1).max(64).optional(),
  /** Only visits that viewed this path. */
  page: z.string().min(1).max(300).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ReplayListQuery = z.input<typeof ReplayListQuery>;

const count = z.number().int().min(0);

export const ReplaySummary = z.object({
  /** The replay id is the visit id. */
  id: z.string(),
  siteId: z.string(),
  siteName: z.string(),
  siteDomain: z.string(),
  startedAt: z.string(),
  durationMs: count,
  pageviews: count,
  entryPath: z.string().nullable(),
  device: z.enum(['desktop', 'mobile', 'tablet']).nullable(),
  browser: z.string().nullable(),
  os: z.string().nullable(),
  network: z.string().nullable(),
  /** Rage clicks, dead clicks, JS errors and form errors during the visit. */
  frictionCount: count,
  /** Fixes that cite this visit as evidence. */
  fixIds: z.array(z.string()),
});
export type ReplaySummary = z.infer<typeof ReplaySummary>;

export const ReplayList = z.object({ replays: z.array(ReplaySummary) });
export type ReplayList = z.infer<typeof ReplayList>;

export const REPLAY_MARK_TYPES = ['pv', 'rc', 'dc', 'er', 'fe', 'fs', 'fx', 'ce'] as const;
export const ReplayMark = z.object({
  /** Milliseconds from the start of the recording. */
  at: count,
  type: z.enum(REPLAY_MARK_TYPES),
  path: z.string().nullable(),
  /** Selector, form/field name, error message or custom event name. */
  detail: z.string().nullable(),
  friction: z.boolean(),
});
export type ReplayMark = z.infer<typeof ReplayMark>;

export const ReplayChunkRef = z.object({
  seq: count,
  bytes: count,
  /** Same-origin streaming route, or a short-lived signed URL when the blob store supports one. */
  url: z.string(),
});

export const ReplayDetail = z.object({
  replay: ReplaySummary,
  /** Epoch ms of the first recorded event; marks are offsets from it. */
  startTs: z.number(),
  endTs: z.number(),
  marks: z.array(ReplayMark),
  chunks: z.array(ReplayChunkRef),
});
export type ReplayDetail = z.infer<typeof ReplayDetail>;
