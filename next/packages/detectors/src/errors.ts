import type { JsErrorEvidence } from '@pulse/contracts';
import { fingerprintOf, normalizePath } from './paths';
import { describeVisits, perDay, sampleVisits, upsert, visitSeverity } from './shared';
import { IGNORED_ERROR_MESSAGES, JS_ERROR_CRITICAL_VISITS, JS_ERROR_MIN_VISITS } from './thresholds';
import type { DetectorEvent, DetectorInput, Finding } from './types';

const rule = { minVisits: JS_ERROR_MIN_VISITS, criticalVisits: JS_ERROR_CRITICAL_VISITS };

/**
 * Collapses the parts of an error message that change between occurrences (urls, ids, numbers)
 * so one bug groups together: "Cannot read 'x' of undefined at item 8812" → "… at item *".
 */
export function normalizeErrorMessage(message: string): string {
  return message
    .replace(/\s+/g, ' ')
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '*')
    .replace(/\b(?=[0-9a-f]*\d)[0-9a-f]{12,}\b/gi, '*')
    .replace(/\b\d{3,}\b/g, '*')
    .trim()
    .slice(0, 200);
}

/** Script source without query string or hash (cache busters change per deploy). */
export function normalizeErrorSource(source: unknown): string | null {
  if (typeof source !== 'string' || !source.trim()) return null;
  return source.trim().split(/[?#]/)[0]!.slice(0, 200) || null;
}

/** (message, source) of an error event, or null when it's malformed or ignored noise. */
export function errorKey(e: DetectorEvent): { message: string; source: string | null } | null {
  if (typeof e.props.m !== 'string') return null;
  const message = normalizeErrorMessage(e.props.m);
  if (!message || IGNORED_ERROR_MESSAGES.some((re) => re.test(message))) return null;
  return { message, source: normalizeErrorSource(e.props.src) };
}

export interface ErrorGroup {
  message: string;
  source: string | null;
  line: number | null;
  fingerprint: string;
  occurrences: number;
  first: Date;
  last: Date;
  visits: Map<string, Date>;
  /** page template → visits */
  pages: Map<string, Set<string>>;
}

export function errorGroups(input: DetectorInput): Map<string, ErrorGroup> {
  const groups = new Map<string, ErrorGroup>();
  for (const e of input.events) {
    if (e.type !== 'er') continue;
    const key = errorKey(e);
    if (!key) continue;
    const fingerprint = fingerprintOf('js_error', key.message, key.source ?? '');
    const cutoff = input.ignoreBefore?.get(fingerprint);
    if (cutoff && e.at < cutoff) continue;
    const g = upsert(groups, fingerprint, () => ({
      ...key,
      line: null,
      fingerprint,
      occurrences: 0,
      first: e.at,
      last: e.at,
      visits: new Map<string, Date>(),
      pages: new Map<string, Set<string>>(),
    }));
    g.occurrences += 1;
    if (e.at < g.first) g.first = e.at;
    if (e.at >= g.last) {
      g.last = e.at;
      if (typeof e.props.l === 'number') g.line = Math.floor(e.props.l);
    }
    const prev = g.visits.get(e.visitId);
    if (!prev || e.at > prev) g.visits.set(e.visitId, e.at);
    const path = normalizePath(e.path);
    if (path) upsert(g.pages, path, () => new Set()).add(e.visitId);
  }
  return groups;
}

/**
 * JavaScript errors (same message + script) that enough distinct visits hit. One error across
 * many pages is one bug, so pages are evidence, not part of the fingerprint.
 */
export function detectJsErrors(input: DetectorInput): Finding<JsErrorEvidence>[] {
  const findings: Finding<JsErrorEvidence>[] = [];
  for (const g of errorGroups(input).values()) {
    if (g.visits.size < JS_ERROR_MIN_VISITS) continue;
    const pages = [...g.pages.entries()]
      .map(([path, ids]) => ({ path, visits: ids.size }))
      .sort((a, b) => b.visits - a.visits || a.path.localeCompare(b.path))
      .slice(0, 5);
    const path = pages[0]?.path ?? '/';
    const facts = describeVisits(g.visits.keys(), path, input);
    // Judged on its worst page: critical sooner when a money page is among them.
    const severity = pages.some((p) => visitSeverity(p.path, g.visits.size, rule) === 'critical')
      ? 'critical'
      : visitSeverity('/', g.visits.size, rule);
    findings.push({
      kind: 'js_error',
      fingerprint: g.fingerprint,
      severity,
      firstSeen: g.first,
      lastSeen: g.last,
      evidence: {
        type: 'js_error',
        path,
        message: g.message,
        source: g.source,
        line: g.line,
        windowHours: input.windowHours,
        visits: g.visits.size,
        occurrences: g.occurrences,
        pages,
        ...facts,
        sampleVisitIds: sampleVisits(g.visits),
      },
      impact: {
        visitsPerDay: perDay(g.visits.size, input.windowHours),
        leftPerDay: perDay(facts.leftOnPage, input.windowHours),
      },
    });
  }
  return findings;
}
