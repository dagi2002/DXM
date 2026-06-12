import type { OverviewAiBrief, SiteAiBrief } from '../../../../packages/contracts/index.js';
import { db } from '../db/index.js';

const DEFAULT_SDK_CDN_URL = 'https://cdn.dxmpulse.com/dxm.js';

interface SiteRow {
  id: string;
  name: string;
  domain: string;
  site_key: string;
  created_at: string;
}

interface SessionStatsRow {
  total_sessions: number;
  sessions_7d: number;
  last_activity_at: string | null;
  avg_duration_seconds: number | null;
  bounced_sessions: number;
  converted_sessions: number;
}

interface AlertStatsRow {
  open_alerts: number;
  critical_alerts: number;
}

interface SessionStatsBySiteRow extends SessionStatsRow {
  site_id: string;
}

interface AlertStatsBySiteRow extends AlertStatsRow {
  site_id: string;
}

interface RecentSessionRow {
  id: string;
  started_at: string | null;
  duration: number | null;
  device: string | null;
  browser: string | null;
  entry_url: string | null;
  created_at: string;
}

interface AlertRow {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string | null;
  resolved: number;
  affected_sessions: number;
  created_at: string;
}

interface FunnelRow {
  id: string;
  name: string;
  steps_json: string;
  created_at: string;
}

export interface ClientSiteSummary {
  id: string;
  name: string;
  domain: string;
  siteKey: string;
  createdAt: string;
  verified: boolean;
  trackingStatus: 'live' | 'attention' | 'install';
  lastActivityAt: string | null;
  sessionCount7d: number;
  openAlerts: number;
  criticalAlerts: number;
  avgDurationSeconds: number;
  bounceRate: number;
  conversionRate: number;
  healthScore: number;
}

export interface ClientSiteDetail extends ClientSiteSummary {
  snippet: string;
  recentSessions: Array<{
    id: string;
    startedAt: string | null;
    duration: number;
    device: string;
    browser: string;
    entryUrl: string;
    createdAt: string;
  }>;
  openAlertsList: Array<{
    id: string;
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    description: string | null;
    affectedSessions: number;
    createdAt: string;
  }>;
  vitals: Record<string, { value: number; p50: number; p75: number; p95: number }>;
  funnels: Array<{
    id: string;
    name: string;
    stepCount: number;
    createdAt: string;
  }>;
  ai?: SiteAiBrief;
}

export interface PortfolioOverview {
  summary: {
    totalClients: number;
    liveClients: number;
    atRiskClients: number;
    unresolvedAlerts: number;
    sessions7d: number;
    averageHealthScore: number;
  };
  siteRollups: ClientSiteSummary[];
  alertHotspots: Array<{
    id: string;
    siteId: string | null;
    siteName: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    description: string | null;
    createdAt: string;
  }>;
  recentActivity: Array<{
    id: string;
    siteId: string | null;
    siteName: string;
    startedAt: string | null;
    duration: number;
    device: string;
    entryUrl: string;
  }>;
  recommendedActions: Array<{
    id: string;
    title: string;
    detail: string;
    href: string;
    priority: 'high' | 'medium' | 'low';
  }>;
  reports: Array<{
    id: string;
    title: string;
    period: string;
    summary: string;
    audience: string;
    highlights: string[];
    kind: 'portfolio' | 'client';
    siteId: string | null;
    siteName: string | null;
    headline: string;
    signalStatus: 'ready' | 'warming_up';
    metrics: Array<{
      label: string;
      value: string;
      tone: 'positive' | 'neutral' | 'warning';
    }>;
    recommendedNextSteps: string[];
  }>;
  ai?: OverviewAiBrief;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const round = (value: number, precision = 1) => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

const escapeHtmlAttribute = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const normalizePublicApiUrl = (raw?: string) => {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, '');
};

const getSnippet = (siteKey: string) => {
  const sdkCdnUrl = process.env.SDK_CDN_URL?.trim() || DEFAULT_SDK_CDN_URL;
  const publicApiUrl = normalizePublicApiUrl(process.env.API_PUBLIC_URL);
  const attributes = [
    ['src', sdkCdnUrl],
    ['data-site-id', siteKey],
    ...(publicApiUrl ? [['data-api-url', publicApiUrl] as const] : []),
    ['async', null],
  ];

  const renderedAttributes = attributes
    .map(([name, value]) =>
      value === null ? name : `${name}="${escapeHtmlAttribute(value)}"`,
    )
    .join(' ');

  return `<script ${renderedAttributes}></script>`;
};

const getSiteRow = (workspaceId: string, siteId: string) =>
  db
    .prepare<[string, string], SiteRow>(
      'SELECT id, name, domain, site_key, created_at FROM sites WHERE workspace_id = ? AND id = ?'
    )
    .get(workspaceId, siteId);

const EMPTY_SESSION_STATS: SessionStatsRow = {
  total_sessions: 0,
  sessions_7d: 0,
  last_activity_at: null,
  avg_duration_seconds: 0,
  bounced_sessions: 0,
  converted_sessions: 0,
};

const EMPTY_ALERT_STATS: AlertStatsRow = {
  open_alerts: 0,
  critical_alerts: 0,
};

const getSessionStats = (siteId: string) =>
  (db
    .prepare<[string], SessionStatsRow>(
      `
        SELECT
          COUNT(*) as total_sessions,
          SUM(CASE WHEN created_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) as sessions_7d,
          MAX(created_at) as last_activity_at,
          AVG(CASE WHEN duration > 0 THEN duration END) as avg_duration_seconds,
          SUM(CASE WHEN bounced = 1 THEN 1 ELSE 0 END) as bounced_sessions,
          SUM(CASE WHEN converted = 1 THEN 1 ELSE 0 END) as converted_sessions
        FROM sessions
        WHERE site_id = ?
      `
    )
    .get(siteId) ?? EMPTY_SESSION_STATS);

const getAlertStats = (workspaceId: string, siteId: string) =>
  (db
    .prepare<[string, string], AlertStatsRow>(
      `
        SELECT
          SUM(CASE WHEN resolved = 0 THEN 1 ELSE 0 END) as open_alerts,
          SUM(CASE WHEN resolved = 0 AND severity = 'critical' THEN 1 ELSE 0 END) as critical_alerts
        FROM alerts
        WHERE workspace_id = ? AND site_id = ?
      `
    )
    .get(workspaceId, siteId) ?? EMPTY_ALERT_STATS);

const getWorkspaceSessionStats = (workspaceId: string) => {
  const rows = db
    .prepare<[string], SessionStatsBySiteRow>(
      `
        SELECT
          site_id,
          COUNT(*) as total_sessions,
          SUM(CASE WHEN created_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) as sessions_7d,
          MAX(created_at) as last_activity_at,
          AVG(CASE WHEN duration > 0 THEN duration END) as avg_duration_seconds,
          SUM(CASE WHEN bounced = 1 THEN 1 ELSE 0 END) as bounced_sessions,
          SUM(CASE WHEN converted = 1 THEN 1 ELSE 0 END) as converted_sessions
        FROM sessions
        WHERE workspace_id = ?
        GROUP BY site_id
      `
    )
    .all(workspaceId);

  return new Map(rows.map((row) => [row.site_id, row]));
};

const getWorkspaceAlertStats = (workspaceId: string) => {
  const rows = db
    .prepare<[string], AlertStatsBySiteRow>(
      `
        SELECT
          site_id,
          SUM(CASE WHEN resolved = 0 THEN 1 ELSE 0 END) as open_alerts,
          SUM(CASE WHEN resolved = 0 AND severity = 'critical' THEN 1 ELSE 0 END) as critical_alerts
        FROM alerts
        WHERE workspace_id = ? AND site_id IS NOT NULL
        GROUP BY site_id
      `
    )
    .all(workspaceId);

  return new Map(rows.map((row) => [row.site_id, row]));
};

export const computeHealthScore = (input: {
  verified: boolean;
  bounceRate: number;
  conversionRate: number;
  avgDurationSeconds: number;
  openAlerts: number;
  criticalAlerts: number;
}) => {
  let score = 78;

  if (!input.verified) score -= 22;
  if (input.bounceRate >= 70) score -= 18;
  else if (input.bounceRate >= 55) score -= 10;
  else if (input.bounceRate <= 35) score += 4;

  if (input.conversionRate >= 4) score += 8;
  else if (input.conversionRate <= 1) score -= 10;

  if (input.avgDurationSeconds >= 120) score += 6;
  else if (input.avgDurationSeconds <= 45) score -= 9;

  score -= input.openAlerts * 6;
  score -= input.criticalAlerts * 8;

  return clamp(Math.round(score), 0, 100);
};

const getTrackingStatus = (verified: boolean, openAlerts: number, lastActivityAt: string | null) => {
  if (!verified) return 'install' as const;
  if (openAlerts > 0) return 'attention' as const;
  if (!lastActivityAt) return 'attention' as const;
  return 'live' as const;
};

const buildSiteSummary = (
  site: SiteRow,
  sessionStats: SessionStatsRow = EMPTY_SESSION_STATS,
  alertStats: AlertStatsRow = EMPTY_ALERT_STATS,
): ClientSiteSummary => {
  const totalSessions = sessionStats.total_sessions || 0;
  const avgDurationSeconds = Math.round(sessionStats.avg_duration_seconds || 0);
  const bounceRate = totalSessions > 0 ? round((sessionStats.bounced_sessions / totalSessions) * 100) : 0;
  const conversionRate =
    totalSessions > 0 ? round((sessionStats.converted_sessions / totalSessions) * 100) : 0;
  const verified = totalSessions > 0;
  const healthScore = computeHealthScore({
    verified,
    bounceRate,
    conversionRate,
    avgDurationSeconds,
    openAlerts: alertStats.open_alerts || 0,
    criticalAlerts: alertStats.critical_alerts || 0,
  });

  return {
    id: site.id,
    name: site.name,
    domain: site.domain,
    siteKey: site.site_key,
    createdAt: site.created_at,
    verified,
    trackingStatus: getTrackingStatus(verified, alertStats.open_alerts || 0, sessionStats.last_activity_at),
    lastActivityAt: sessionStats.last_activity_at,
    sessionCount7d: sessionStats.sessions_7d || 0,
    openAlerts: alertStats.open_alerts || 0,
    criticalAlerts: alertStats.critical_alerts || 0,
    avgDurationSeconds,
    bounceRate,
    conversionRate,
    healthScore,
  };
};

export const listWorkspaceSites = (workspaceId: string): ClientSiteSummary[] => {
  const sites = db
    .prepare<[string], SiteRow>(
      'SELECT id, name, domain, site_key, created_at FROM sites WHERE workspace_id = ? ORDER BY created_at DESC'
    )
    .all(workspaceId);

  const sessionStatsBySite = getWorkspaceSessionStats(workspaceId);
  const alertStatsBySite = getWorkspaceAlertStats(workspaceId);

  return sites.map((site) =>
    buildSiteSummary(
      site,
      sessionStatsBySite.get(site.id) ?? EMPTY_SESSION_STATS,
      alertStatsBySite.get(site.id) ?? EMPTY_ALERT_STATS,
    )
  );
};

export const getSiteVerification = (workspaceId: string, siteId: string) => {
  const site = getSiteRow(workspaceId, siteId);
  if (!site) return null;

  const stats = getSessionStats(site.id);
  return {
    verified: (stats.total_sessions || 0) > 0,
    sessionCount: stats.total_sessions || 0,
    lastActivityAt: stats.last_activity_at,
  };
};

const buildVitals = (workspaceId: string, siteId: string) => {
  const rows = db
    .prepare<[string, string], { value_text: string | null }>(
      `
        SELECT e.value_text
        FROM events e
        JOIN sessions s ON s.id = e.session_id
        WHERE s.workspace_id = ?
          AND s.site_id = ?
          AND e.type = 'vital'
          AND e.created_at >= datetime('now', '-7 days')
      `
    )
    .all(workspaceId, siteId);

  const grouped: Record<string, number[]> = {};
  rows.forEach((row) => {
    if (!row.value_text) return;
    const [name, value] = row.value_text.split(':');
    const numericValue = Number(value);
    if (!name || Number.isNaN(numericValue)) return;
    const key = name.toLowerCase();
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(numericValue);
  });

  return Object.fromEntries(
    Object.entries(grouped).map(([key, values]) => {
      values.sort((a, b) => a - b);
      const p = (percentile: number) => values[Math.floor((values.length - 1) * percentile)] ?? 0;
      const average = values.reduce((sum, value) => sum + value, 0) / values.length;
      return [
        key,
        {
          value: round(average, 2),
          p50: round(p(0.5), 2),
          p75: round(p(0.75), 2),
          p95: round(p(0.95), 2),
        },
      ];
    })
  );
};

// ─── Core Web Vitals percentiles (portfolio OR site-scoped, device-filterable) ───

export type WebVitalsRange = '24h' | '7d' | '30d';
export type WebVitalsDevice = 'all' | 'desktop' | 'mobile' | 'tablet';

export type WebVitalName = 'LCP' | 'INP' | 'CLS' | 'FCP' | 'TTFB';

export interface WebVitalMetric {
  name: WebVitalName;
  sampleSize: number;
  p50: number | null;
  p75: number | null;
  p95: number | null;
  status: 'good' | 'needs-improvement' | 'poor' | 'insufficient-data';
}

export interface WebVitalsResponse {
  range: WebVitalsRange;
  device: WebVitalsDevice;
  siteId: string | null;
  totalSessions: number;
  metrics: WebVitalMetric[];
}

const RANGE_TO_SQLITE: Record<WebVitalsRange, string> = {
  '24h': "-1 day",
  '7d':  "-7 days",
  '30d': "-30 days",
};

// Google CWV thresholds (https://web.dev/vitals/). Uses p75 as the field standard.
const classifyVital = (name: WebVitalName, p75: number | null): WebVitalMetric['status'] => {
  if (p75 === null) return 'insufficient-data';
  switch (name) {
    case 'LCP':
      return p75 <= 2500 ? 'good' : p75 <= 4000 ? 'needs-improvement' : 'poor';
    case 'INP':
      return p75 <= 200 ? 'good' : p75 <= 500 ? 'needs-improvement' : 'poor';
    case 'CLS':
      return p75 <= 0.1 ? 'good' : p75 <= 0.25 ? 'needs-improvement' : 'poor';
    case 'FCP':
      return p75 <= 1800 ? 'good' : p75 <= 3000 ? 'needs-improvement' : 'poor';
    case 'TTFB':
      return p75 <= 800 ? 'good' : p75 <= 1800 ? 'needs-improvement' : 'poor';
  }
};

const pickPercentile = (sorted: number[], pct: number): number | null => {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * pct));
  return sorted[idx] ?? null;
};

/**
 * Returns p50/p75/p95 for LCP/INP/CLS/FCP/TTFB, optionally filtered by site + device.
 * Percentile computed in-memory because SQLite lacks native PERCENTILE_CONT.
 */
export const getWebVitalsPercentiles = (
  workspaceId: string,
  siteId: string | null,
  range: WebVitalsRange = '7d',
  device: WebVitalsDevice = 'all',
): WebVitalsResponse => {
  const params: (string | null)[] = [workspaceId];
  let where = `s.workspace_id = ? AND e.type = 'vital' AND e.created_at >= datetime('now', '${RANGE_TO_SQLITE[range]}')`;
  if (siteId) {
    where += ' AND s.site_id = ?';
    params.push(siteId);
  }
  if (device !== 'all') {
    where += ' AND s.device = ?';
    params.push(device);
  }

  const rows = db
    .prepare(`
      SELECT e.value_text AS value_text
      FROM events e
      JOIN sessions s ON s.id = e.session_id
      WHERE ${where}
    `)
    .all(...params) as Array<{ value_text: string | null }>;

  const totalSessionsRow = db
    .prepare(`
      SELECT COUNT(*) AS c
      FROM sessions s
      WHERE s.workspace_id = ?
        AND s.created_at >= datetime('now', '${RANGE_TO_SQLITE[range]}')
        ${siteId ? 'AND s.site_id = ?' : ''}
        ${device !== 'all' ? 'AND s.device = ?' : ''}
    `)
    .get(...params.slice()) as { c: number } | undefined;

  const buckets: Record<WebVitalName, number[]> = {
    LCP: [], INP: [], CLS: [], FCP: [], TTFB: [],
  };

  for (const row of rows) {
    if (!row.value_text) continue;
    const sepIdx = row.value_text.indexOf(':');
    if (sepIdx < 0) continue;
    const name = row.value_text.slice(0, sepIdx).toUpperCase();
    const numeric = Number(row.value_text.slice(sepIdx + 1));
    if (!Number.isFinite(numeric)) continue;
    if (name in buckets) {
      buckets[name as WebVitalName].push(numeric);
    }
  }

  const metrics: WebVitalMetric[] = (Object.keys(buckets) as WebVitalName[]).map((name) => {
    const values = buckets[name];
    values.sort((a, b) => a - b);
    const p50 = pickPercentile(values, 0.5);
    const p75 = pickPercentile(values, 0.75);
    const p95 = pickPercentile(values, 0.95);
    return {
      name,
      sampleSize: values.length,
      p50: p50 !== null ? round(p50, name === 'CLS' ? 3 : 0) : null,
      p75: p75 !== null ? round(p75, name === 'CLS' ? 3 : 0) : null,
      p95: p95 !== null ? round(p95, name === 'CLS' ? 3 : 0) : null,
      status: classifyVital(name, p75),
    };
  });

  return {
    range,
    device,
    siteId,
    totalSessions: totalSessionsRow?.c ?? 0,
    metrics,
  };
};

// ─── Auto journey map (top N paths through the site) ────────────────────────

export type JourneyRange = '24h' | '7d' | '30d';

export interface JourneyStep {
  /** Normalized URL path (query stripped, hash stripped). */
  url: string;
}

export interface JourneyPath {
  /** Deterministic id from the URL sequence (for UI keying). */
  id: string;
  steps: JourneyStep[];
  sessionCount: number;
}

export interface SiteJourneyResponse {
  siteId: string;
  range: JourneyRange;
  totalSessions: number;
  paths: JourneyPath[];
}

const JOURNEY_RANGE_TO_SQLITE: Record<JourneyRange, string> = {
  '24h': '-1 day',
  '7d':  '-7 days',
  '30d': '-30 days',
};

const MAX_JOURNEY_STEPS = 8;
const MAX_JOURNEY_PATHS = 10;

const normalizeJourneyUrl = (raw: string | null): string | null => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    // Accept both absolute and root-relative. Build off a dummy origin so
    // `new URL` handles path-only values consistently.
    const origin = /^https?:\/\//i.test(trimmed) ? undefined : 'http://__dxm__';
    const parsed = new URL(trimmed, origin);
    const path = parsed.pathname.replace(/\/+$/, '') || '/';
    return path;
  } catch {
    // Fallback: strip query+hash manually.
    return trimmed.split('?')[0].split('#')[0] || '/';
  }
};

/**
 * Builds the top-N journey paths across recent sessions. For each session we
 * collect `pageview` + `navigation` URLs in chronological order, normalize
 * them, cap at 8 steps, and tally identical sequences. Returns the top 10.
 */
export const getSiteJourney = (
  workspaceId: string,
  siteId: string,
  range: JourneyRange = '7d',
): SiteJourneyResponse => {
  const rows = db
    .prepare(`
      SELECT e.session_id AS session_id, e.url AS url, e.ts AS ts
      FROM events e
      JOIN sessions s ON s.id = e.session_id
      WHERE e.type IN ('pageview', 'navigation')
        AND s.workspace_id = ?
        AND s.site_id      = ?
        AND e.created_at  >= datetime('now', '${JOURNEY_RANGE_TO_SQLITE[range]}')
        AND e.url IS NOT NULL
      ORDER BY e.session_id, e.ts ASC
    `)
    .all(workspaceId, siteId) as { session_id: string; url: string; ts: number }[];

  const bySession = new Map<string, string[]>();
  for (const row of rows) {
    const norm = normalizeJourneyUrl(row.url);
    if (!norm) continue;
    const list = bySession.get(row.session_id) ?? [];
    // Deduplicate consecutive identical URLs (reload/back navigation noise).
    if (list[list.length - 1] !== norm) list.push(norm);
    if (list.length <= MAX_JOURNEY_STEPS) bySession.set(row.session_id, list);
  }

  const pathCounts = new Map<string, number>();
  for (const steps of bySession.values()) {
    if (steps.length === 0) continue;
    const key = steps.join(' → ');
    pathCounts.set(key, (pathCounts.get(key) ?? 0) + 1);
  }

  const ranked = [...pathCounts.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, MAX_JOURNEY_PATHS)
    .map<JourneyPath>(([key, sessionCount], idx) => ({
      id: `path-${idx + 1}`,
      steps: key.split(' → ').map((url) => ({ url })),
      sessionCount,
    }));

  return {
    siteId,
    range,
    totalSessions: bySession.size,
    paths: ranked,
  };
};

export const getSiteDetail = (workspaceId: string, siteId: string): ClientSiteDetail | null => {
  const site = getSiteRow(workspaceId, siteId);
  if (!site) return null;

  const summary = buildSiteSummary(site, getSessionStats(site.id), getAlertStats(workspaceId, site.id));

  const recentSessions = db
    .prepare<[string, string], RecentSessionRow>(
      `
        SELECT id, started_at, duration, device, browser, entry_url, created_at
        FROM sessions
        WHERE workspace_id = ? AND site_id = ?
        ORDER BY created_at DESC
        LIMIT 8
      `
    )
    .all(workspaceId, siteId)
    .map((session) => ({
      id: session.id,
      startedAt: session.started_at,
      duration: session.duration || 0,
      device: session.device || 'unknown',
      browser: session.browser || 'unknown',
      entryUrl: session.entry_url || '/',
      createdAt: session.created_at,
    }));

  const openAlertsList = db
    .prepare<[string, string], AlertRow>(
      `
        SELECT id, type, severity, title, description, resolved, affected_sessions, created_at
        FROM alerts
        WHERE workspace_id = ? AND site_id = ? AND resolved = 0
        ORDER BY created_at DESC
        LIMIT 8
      `
    )
    .all(workspaceId, siteId)
    .map((alert) => ({
      id: alert.id,
      type: alert.type,
      severity: alert.severity,
      title: alert.title,
      description: alert.description,
      affectedSessions: alert.affected_sessions,
      createdAt: alert.created_at,
    }));

  const funnels = db
    .prepare<[string, string], FunnelRow>(
      `
        SELECT id, name, steps_json, created_at
        FROM funnels
        WHERE workspace_id = ? AND (site_id = ? OR site_id IS NULL)
        ORDER BY created_at DESC
        LIMIT 6
      `
    )
    .all(workspaceId, siteId)
    .map((funnel) => {
      let stepCount = 0;
      try {
        const parsed = JSON.parse(funnel.steps_json) as unknown[];
        stepCount = Array.isArray(parsed) ? parsed.length : 0;
      } catch {
        stepCount = 0;
      }
      return {
        id: funnel.id,
        name: funnel.name,
        stepCount,
        createdAt: funnel.created_at,
      };
    });

  return {
    ...summary,
    snippet: getSnippet(site.site_key),
    recentSessions,
    openAlertsList,
    vitals: buildVitals(workspaceId, siteId),
    funnels,
  };
};

export const buildWorkspaceOverview = (workspaceId: string): PortfolioOverview => {
  const siteRollups = listWorkspaceSites(workspaceId);
  const liveClients = siteRollups.filter((site) => site.trackingStatus === 'live').length;
  const atRiskClients = siteRollups.filter((site) => site.healthScore < 55 || site.openAlerts > 0).length;
  const unresolvedAlerts = siteRollups.reduce((total, site) => total + site.openAlerts, 0);
  const sessions7d = siteRollups.reduce((total, site) => total + site.sessionCount7d, 0);
  const averageHealthScore =
    siteRollups.length > 0
      ? Math.round(siteRollups.reduce((total, site) => total + site.healthScore, 0) / siteRollups.length)
      : 0;

  const alertHotspots = db
    .prepare<
      [string],
      {
        id: string;
        site_id: string | null;
        site_name: string | null;
        severity: 'low' | 'medium' | 'high' | 'critical';
        title: string;
        description: string | null;
        created_at: string;
      }
    >(
      `
        SELECT a.id, a.site_id, s.name as site_name, a.severity, a.title, a.description, a.created_at
        FROM alerts a
        LEFT JOIN sites s ON s.id = a.site_id
        WHERE a.workspace_id = ? AND a.resolved = 0
        ORDER BY
          CASE a.severity
            WHEN 'critical' THEN 4
            WHEN 'high' THEN 3
            WHEN 'medium' THEN 2
            ELSE 1
          END DESC,
          a.created_at DESC
        LIMIT 6
      `
    )
    .all(workspaceId)
    .map((alert) => ({
      id: alert.id,
      siteId: alert.site_id,
      siteName: alert.site_name || 'Workspace-wide',
      severity: alert.severity,
      title: alert.title,
      description: alert.description,
      createdAt: alert.created_at,
    }));

  const recentActivity = db
    .prepare<
      [string],
      {
        id: string;
        site_id: string | null;
        site_name: string | null;
        started_at: string | null;
        duration: number | null;
        device: string | null;
        entry_url: string | null;
      }
    >(
      `
        SELECT sess.id, sess.site_id, s.name as site_name, sess.started_at, sess.duration, sess.device, sess.entry_url
        FROM sessions sess
        LEFT JOIN sites s ON s.id = sess.site_id
        WHERE sess.workspace_id = ?
        ORDER BY sess.created_at DESC
        LIMIT 8
      `
    )
    .all(workspaceId)
    .map((session) => ({
      id: session.id,
      siteId: session.site_id,
      siteName: session.site_name || 'Unknown client',
      startedAt: session.started_at,
      duration: session.duration || 0,
      device: session.device || 'unknown',
      entryUrl: session.entry_url || '/',
    }));

  const recommendedActions: PortfolioOverview['recommendedActions'] = [];

  const unverifiedSites = siteRollups.filter((site) => !site.verified);
  if (unverifiedSites.length > 0) {
    recommendedActions.push({
      id: 'verify-sites',
      title: 'Finish installing tracking on every new client site',
      detail: `${unverifiedSites.length} client site${unverifiedSites.length === 1 ? '' : 's'} still have no live traffic. Copy the snippet and verify the install before you promise reporting.`,
      href: '/clients',
      priority: 'high',
    });
  }

  if (alertHotspots.length > 0) {
    recommendedActions.push({
      id: 'resolve-alerts',
      title: 'Triage unresolved alert hotspots',
      detail: `${alertHotspots[0].siteName} is leading the alert feed. Review the active issues before your client sees them first.`,
      href: '/alerts',
      priority: alertHotspots.some((alert) => alert.severity === 'critical') ? 'high' : 'medium',
    });
  }

  const weakestSite = [...siteRollups].sort((a, b) => a.healthScore - b.healthScore)[0];
  if (weakestSite) {
    recommendedActions.push({
      id: 'health-review',
      title: `Review ${weakestSite.name} with a client-ready action plan`,
      detail: `${weakestSite.name} is at ${weakestSite.healthScore}/100 with ${weakestSite.openAlerts} open alert${weakestSite.openAlerts === 1 ? '' : 's'}. Turn that into a proactive check-in.`,
      href: `/clients/${weakestSite.id}`,
      priority: weakestSite.healthScore < 50 ? 'high' : 'medium',
    });
  }

  if (siteRollups.length === 0) {
    recommendedActions.push({
      id: 'add-first-client',
      title: 'Add your first client site',
      detail: 'Create a client site, copy the snippet, and verify installation so the portfolio overview has real data to work with.',
      href: '/onboarding',
      priority: 'high',
    });
  }

  const strongestSite = [...siteRollups].sort((a, b) => b.healthScore - a.healthScore)[0];
  const reports: PortfolioOverview['reports'] = [
    {
      id: 'weekly-pulse',
      title: 'Weekly portfolio pulse',
      period: 'Last 7 days',
      audience: 'Internal agency ops',
      kind: 'portfolio',
      siteId: null,
      siteName: null,
      headline:
        siteRollups.length === 0
          ? 'Connect one live client site before promising portfolio reporting.'
          : unresolvedAlerts > 0
          ? `${unresolvedAlerts} unresolved alert${unresolvedAlerts === 1 ? '' : 's'} need a client-facing response this week.`
          : 'Portfolio health is stable enough to package into a proactive update.',
      signalStatus: siteRollups.length === 0 || sessions7d < 5 ? 'warming_up' : 'ready',
      summary:
        siteRollups.length === 0
          ? 'No client sites are connected yet. The fastest path to value is installing tracking on one live client site.'
          : `${liveClients} of ${siteRollups.length} client sites are live. ${unresolvedAlerts} unresolved alerts need follow-up before the next client check-in.`,
      highlights: [
        `${sessions7d} sessions tracked across the portfolio this week`,
        strongestSite ? `${strongestSite.name} is the strongest client site at ${strongestSite.healthScore}/100` : 'No top performer yet',
        weakestSite ? `${weakestSite.name} needs attention at ${weakestSite.healthScore}/100` : 'No at-risk client yet',
      ],
      metrics: [
        { label: 'Tracked clients', value: `${siteRollups.length}`, tone: 'neutral' },
        { label: 'Live clients', value: `${liveClients}`, tone: liveClients > 0 ? 'positive' : 'warning' },
        { label: 'Sessions (7d)', value: `${sessions7d}`, tone: sessions7d > 0 ? 'positive' : 'warning' },
        { label: 'Unresolved alerts', value: `${unresolvedAlerts}`, tone: unresolvedAlerts > 0 ? 'warning' : 'positive' },
      ],
      recommendedNextSteps: recommendedActions.slice(0, 3).map((action) => action.title),
    },
  ];

  if (strongestSite) {
    reports.push({
      id: `client-win-${strongestSite.id}`,
      title: `${strongestSite.name} client win summary`,
      period: 'Last 7 days',
      audience: 'Client-facing update',
      kind: 'client',
      siteId: strongestSite.id,
      siteName: strongestSite.name,
      headline:
        strongestSite.sessionCount7d >= 3
          ? `${strongestSite.name} has enough live signal to support a confident client update.`
          : `${strongestSite.name} is moving in the right direction, but the signal is still warming up.`,
      signalStatus: strongestSite.sessionCount7d >= 3 ? 'ready' : 'warming_up',
      summary: `${strongestSite.name} stayed healthy with ${strongestSite.sessionCount7d} tracked sessions, ${strongestSite.conversionRate}% conversion, and ${strongestSite.openAlerts} open alerts.`,
      highlights: [
        `${strongestSite.healthScore}/100 health score`,
        `${strongestSite.bounceRate}% bounce rate`,
        strongestSite.lastActivityAt ? `Last tracked activity: ${strongestSite.lastActivityAt}` : 'Traffic is still warming up',
      ],
      metrics: [
        { label: 'Health score', value: `${strongestSite.healthScore}/100`, tone: strongestSite.healthScore >= 70 ? 'positive' : 'warning' },
        { label: 'Sessions (7d)', value: `${strongestSite.sessionCount7d}`, tone: strongestSite.sessionCount7d > 0 ? 'positive' : 'warning' },
        { label: 'Bounce rate', value: `${strongestSite.bounceRate}%`, tone: strongestSite.bounceRate <= 45 ? 'positive' : 'warning' },
        { label: 'Conversion rate', value: `${strongestSite.conversionRate}%`, tone: strongestSite.conversionRate >= 2 ? 'positive' : 'neutral' },
      ],
      recommendedNextSteps: [
        `Use ${strongestSite.name} as a proof point in the next client status update.`,
        'Call out the strongest behavior trends and keep monitoring for new alerts.',
        'Pair the metrics with one replay or journey example if the client asks for proof.',
      ],
    });
  }

  if (weakestSite && weakestSite.id !== strongestSite?.id) {
    reports.push({
      id: `client-risk-${weakestSite.id}`,
      title: `${weakestSite.name} risk brief`,
      period: 'Last 7 days',
      audience: 'Client escalation',
      kind: 'client',
      siteId: weakestSite.id,
      siteName: weakestSite.name,
      headline:
        weakestSite.sessionCount7d >= 3
          ? `${weakestSite.name} needs intervention before the next client check-in.`
          : `${weakestSite.name} shows early risk, but more traffic is still needed before overreacting.`,
      signalStatus: weakestSite.sessionCount7d >= 3 ? 'ready' : 'warming_up',
      summary: `${weakestSite.name} is underperforming relative to the rest of the portfolio and should be reviewed before the next status update.`,
      highlights: [
        `${weakestSite.healthScore}/100 health score`,
        `${weakestSite.openAlerts} unresolved alerts`,
        `${weakestSite.bounceRate}% bounce rate and ${weakestSite.conversionRate}% conversion`,
      ],
      metrics: [
        { label: 'Health score', value: `${weakestSite.healthScore}/100`, tone: weakestSite.healthScore < 55 ? 'warning' : 'neutral' },
        { label: 'Open alerts', value: `${weakestSite.openAlerts}`, tone: weakestSite.openAlerts > 0 ? 'warning' : 'positive' },
        { label: 'Bounce rate', value: `${weakestSite.bounceRate}%`, tone: weakestSite.bounceRate >= 55 ? 'warning' : 'neutral' },
        { label: 'Sessions (7d)', value: `${weakestSite.sessionCount7d}`, tone: weakestSite.sessionCount7d > 0 ? 'neutral' : 'warning' },
      ],
      recommendedNextSteps: [
        `Review ${weakestSite.name} before the next client-facing update.`,
        'Use alerts and recent session evidence to explain what needs attention.',
        'Turn the findings into one concrete next action the client can approve quickly.',
      ],
    });
  }

  return {
    summary: {
      totalClients: siteRollups.length,
      liveClients,
      atRiskClients,
      unresolvedAlerts,
      sessions7d,
      averageHealthScore,
    },
    siteRollups,
    alertHotspots,
    recentActivity,
    recommendedActions,
    reports,
  };
};
