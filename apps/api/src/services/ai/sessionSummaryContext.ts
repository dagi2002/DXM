/**
 * Build the compact, LLM-ready context for a single session's AI summary.
 *
 * Strategy:
 *  - Fetch session row + ordered events + CWV values + open alerts tied to this session's site
 *  - Compress events to ~40 entries: drop scroll noise, collapse consecutive navs to the same URL
 *  - Pre-compute friction signals (rage clicks, dead clicks, form errors, slow LCP, U-turns)
 *    so the LLM doesn't have to, AND so the deterministic fallback has the same shape to work from.
 */
import { db } from '../../db/index.js';
import type { SessionFrictionMoment } from '../../../../../packages/contracts/index.js';

export interface SessionAiEventEntry {
  type: string;
  ts: number;
  url: string | null;
  target: string | null;
  /** value_text — CWV values, custom-event names, form identity, identify userId. */
  value: string | null;
}

export interface SessionAiContext {
  sessionId: string;
  siteDomain: string | null;
  device: string | null;
  browser: string | null;
  language: string | null;
  startedAt: string | null;
  durationSeconds: number;
  sdkVersion: string | null;
  pageCount: number;
  clicks: number;
  scrollDepth: number;
  bounced: boolean;
  converted: boolean;
  /** Vital summary: {LCP: ms, CLS: 0.xx, ...} — empty if none captured. */
  vitals: Record<string, number>;
  /** Compressed event timeline, capped at 40 entries. */
  events: SessionAiEventEntry[];
  /** Pre-computed friction signals. Ordered by ts ascending. */
  frictionMoments: SessionFrictionMoment[];
  /** Text hints the generators can use for narrative. */
  signals: {
    rageClickBursts: number;       // count of click bursts (≥3 clicks on same target in 2s)
    deadClicks: number;
    formStarts: number;
    formSubmits: number;
    formErrors: number;
    uTurns: number;                // A → B → A within 30s
    slowLcp: boolean;              // LCP > 4000ms
  };
}

interface SessionRow {
  id: string;
  started_at: string | null;
  duration: number | null;
  device: string | null;
  browser: string | null;
  language: string | null;
  page_count: number;
  clicks: number;
  scroll_depth: number;
  bounced: number;
  converted: number;
  sdk_version: string | null;
  site_domain: string | null;
  workspace_id: string;
}

interface EventRow {
  type: string;
  ts: number;
  target: string | null;
  url: string | null;
  value_text: string | null;
}

const MAX_EVENTS = 40;
const UTURN_WINDOW_MS = 30_000;
const RAGE_WINDOW_MS = 2000;
const RAGE_THRESHOLD = 3;

const parseVitalPair = (valueText: string | null): { name: string; value: number } | null => {
  if (!valueText) return null;
  const [name, rawValue] = valueText.split(':');
  if (!name || rawValue === undefined) return null;
  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric)) return null;
  return { name: name.trim().toUpperCase(), value: numeric };
};

export const buildSessionAiContext = (
  workspaceId: string,
  sessionId: string,
): SessionAiContext | null => {
  const sessionRow = db
    .prepare<[string, string], SessionRow>(`
      SELECT
        s.id,
        s.started_at,
        s.duration,
        s.device,
        s.browser,
        s.language,
        s.page_count,
        s.clicks,
        s.scroll_depth,
        s.bounced,
        s.converted,
        s.sdk_version,
        s.workspace_id,
        sites.domain AS site_domain
      FROM sessions s
      LEFT JOIN sites ON sites.id = s.site_id
      WHERE s.workspace_id = ? AND s.id = ?
    `)
    .get(workspaceId, sessionId);

  if (!sessionRow) return null;

  const rawEvents = db
    .prepare<[string], EventRow>(`
      SELECT type, ts, target, url, value_text
      FROM events
      WHERE session_id = ?
      ORDER BY ts ASC
    `)
    .all(sessionId);

  // Collect vitals
  const vitals: Record<string, number> = {};
  for (const row of rawEvents) {
    if (row.type === 'vital') {
      const pair = parseVitalPair(row.value_text);
      if (pair) {
        // Keep best (LCP=latest, CLS=highest). Simplify: use latest value — matches current SDK behaviour.
        vitals[pair.name] = pair.value;
      }
    }
  }

  // ── Friction detection (pre-computed for determinism) ─────────────────────
  const frictionMoments: SessionFrictionMoment[] = [];
  const signals = {
    rageClickBursts: 0,
    deadClicks: 0,
    formStarts: 0,
    formSubmits: 0,
    formErrors: 0,
    uTurns: 0,
    slowLcp: false,
  };

  // Rage clicks: ≥3 clicks on same target within 2s window
  const clicksByTarget: Record<string, number[]> = {};
  for (const row of rawEvents) {
    if (row.type !== 'click') continue;
    const key = row.target || '';
    (clicksByTarget[key] ||= []).push(row.ts);
  }
  for (const [target, timestamps] of Object.entries(clicksByTarget)) {
    timestamps.sort((a, b) => a - b);
    let i = 0;
    while (i <= timestamps.length - RAGE_THRESHOLD) {
      if (timestamps[i + RAGE_THRESHOLD - 1] - timestamps[i] <= RAGE_WINDOW_MS) {
        signals.rageClickBursts++;
        frictionMoments.push({
          ts: timestamps[i],
          kind: 'rage_click',
          detail: `Rage click burst on ${target || 'unknown target'}`,
        });
        i += RAGE_THRESHOLD;
      } else {
        i++;
      }
    }
  }

  for (const row of rawEvents) {
    if (row.type === 'dead_click') {
      signals.deadClicks++;
      frictionMoments.push({
        ts: row.ts,
        kind: 'dead_click',
        detail: `Dead click on ${row.target || 'unknown target'}`,
      });
    } else if (row.type === 'form_start') {
      signals.formStarts++;
    } else if (row.type === 'form_submit') {
      signals.formSubmits++;
    } else if (row.type === 'form_error') {
      signals.formErrors++;
      frictionMoments.push({
        ts: row.ts,
        kind: 'form_error',
        detail: `Form validation error${row.value_text ? ` (${row.value_text.split('|').filter(Boolean).join(' · ')})` : ''}`,
      });
    }
  }

  // Slow LCP
  if ((vitals.LCP ?? 0) > 4000) {
    signals.slowLcp = true;
    frictionMoments.push({
      ts: sessionRow.started_at ? new Date(sessionRow.started_at.replace(' ', 'T') + 'Z').getTime() : 0,
      kind: 'slow_lcp',
      detail: `Largest Contentful Paint at ${Math.round(vitals.LCP)}ms (target ≤ 2500ms)`,
    });
  }

  // U-turns: pageview A → pageview B → pageview A within UTURN_WINDOW_MS
  const pageEvents = rawEvents.filter((row) => row.type === 'pageview' || row.type === 'navigation');
  for (let i = 0; i < pageEvents.length - 2; i++) {
    const a = pageEvents[i];
    const b = pageEvents[i + 1];
    const c = pageEvents[i + 2];
    if (!a.url || !b.url || !c.url) continue;
    if (a.url === c.url && a.url !== b.url && c.ts - a.ts <= UTURN_WINDOW_MS) {
      signals.uTurns++;
      frictionMoments.push({
        ts: c.ts,
        kind: 'u_turn',
        detail: `Bounced from ${b.url} back to ${a.url} within ${Math.round((c.ts - a.ts) / 1000)}s`,
      });
    }
  }

  frictionMoments.sort((a, b) => a.ts - b.ts);

  // ── Compress events timeline to ≤40 entries ───────────────────────────────
  // Drop scroll events; collapse consecutive pageview/navigation to same URL; keep clicks & friction.
  const compressed: SessionAiEventEntry[] = [];
  for (const row of rawEvents) {
    if (row.type === 'scroll') continue;
    const entry: SessionAiEventEntry = {
      type: row.type,
      ts: row.ts,
      url: row.url,
      target: row.target,
      value: row.value_text,
    };
    const last = compressed[compressed.length - 1];
    if (
      last &&
      (last.type === 'pageview' || last.type === 'navigation') &&
      (entry.type === 'pageview' || entry.type === 'navigation') &&
      last.url === entry.url
    ) {
      continue; // dedup consecutive nav to same URL
    }
    compressed.push(entry);
  }

  // Cap: keep first 15 + last 25 so the LLM sees session start + most recent activity
  let eventsOut = compressed;
  if (compressed.length > MAX_EVENTS) {
    eventsOut = [...compressed.slice(0, 15), ...compressed.slice(compressed.length - 25)];
  }

  return {
    sessionId,
    siteDomain: sessionRow.site_domain,
    device: sessionRow.device,
    browser: sessionRow.browser,
    language: sessionRow.language,
    startedAt: sessionRow.started_at,
    durationSeconds: sessionRow.duration ?? 0,
    sdkVersion: sessionRow.sdk_version,
    pageCount: sessionRow.page_count,
    clicks: sessionRow.clicks,
    scrollDepth: sessionRow.scroll_depth,
    bounced: sessionRow.bounced === 1,
    converted: sessionRow.converted === 1,
    vitals,
    events: eventsOut,
    frictionMoments,
    signals,
  };
};
