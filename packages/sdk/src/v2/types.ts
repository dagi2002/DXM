/**
 * DXM Pulse SDK v2 — Shared type definitions
 *
 * DxmEvent is the canonical event union emitted by the SDK.
 * Any new event type must be added here AND to apps/api/src/schemas/collectSchema.ts
 * (the zod schema on the ingest side).
 */

export type DxmEvent =
  | { type: 'pageview';     url: string;  ts: number }
  | { type: 'navigation';   url: string;  ts: number }
  | { type: 'click';        x: number;    y: number;  target: string; ts: number }
  | { type: 'scroll';       depth: number; pct: number; ts: number }
  | { type: 'dead_click';   x: number;    y: number;  target: string; ts: number }
  | { type: 'form_start';   formId: string; url: string; ts: number }
  | { type: 'form_submit';  formId: string; url: string; ts: number }
  | { type: 'form_error';   formId: string; fieldName?: string; message?: string; url: string; ts: number }
  | { type: 'vital';        name: 'LCP' | 'CLS' | 'FCP' | 'INP' | 'TTFB'; value: number; ts: number }
  | { type: 'custom';       event: string; ts: number; [k: string]: unknown }
  | { type: 'identify';     userId: string; ts: number };

export interface PrivacyConfig {
  /** Path prefixes that are replaced with `<prefix>/:masked` in emitted events. */
  urlMasks: string[];
  /** Form field name/id patterns (case-insensitive) to scrub from form_* events. */
  fieldScrubs: string[];
  /** Kills form_start/form_submit/form_error entirely. */
  disableInputCapture: boolean;
  /**
   * Query-param keys (case-insensitive regex sources) whose values are always stripped
   * from emitted URLs. These run BEFORE urlMasks.
   */
  queryParamDenylist: RegExp[];
}

export interface SdkConfig {
  siteId: string;
  apiUrl: string;
  sessionId: string;
  sessionKey: string;
  queueKey: string;
  maxQueue: number;
  flushIntervalMs: number;
  version: 'v2';
}
