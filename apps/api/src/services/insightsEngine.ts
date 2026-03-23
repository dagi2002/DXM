/**
 * DXM Pulse — Insights Engine
 * Computes actionable insights at ingestion time (after /collect batches).
 * Fire-and-forget — failures are logged, not thrown.
 *
 * Detects 5 insight types:
 *  1. High bounce rate   — >70% bounce in last 2 hours (min 10 sessions)
 *  2. Low session duration — avg duration <30s in last 2 hours (min 10 sessions)
 *  3. No activity        — 0 sessions in last 24 hours
 *  4. Traffic drop       — >30% drop vs previous 24h window
 *  5. Traffic growth     — >30% increase vs previous 24h window
 *
 * Lifecycle:
 *  - Active insights are deduplicated by (workspace_id, site_id, type)
 *  - Resolved insights have a 6-hour cooldown before re-triggering
 *  - Insights auto-resolve when conditions clear
 */

import { db } from '../db/index.js';
import { nanoid } from 'nanoid';
import { logger } from '../lib/logger.js';

// ─── Types ───────────────────────────────────────────────────────────────────

type InsightType = 'bounce_rate' | 'low_duration' | 'no_activity' | 'traffic_drop' | 'traffic_growth';
type InsightSeverity = 'info' | 'warning' | 'critical';

interface DetectedInsight {
  type: InsightType;
  severity: InsightSeverity;
  title: string;
  description: string;
  recommendation: string;
  data: Record<string, unknown>;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const COOLDOWN_HOURS = 6;

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * Run all insight checks for a workspace + site after a /collect batch.
 * Called fire-and-forget — callers do NOT await this.
 */
export async function runInsightChecks(workspaceId: string, siteId: string): Promise<void> {
  try {
    const detectors: Array<(ws: string, s: string) => DetectedInsight | null> = [
      detectHighBounceRate,
      detectLowDuration,
      detectNoActivity,
      detectTrafficDrop,
      detectTrafficGrowth,
    ];

    for (const detect of detectors) {
      const insight = detect(workspaceId, siteId);

      if (insight) {
        upsertInsight(workspaceId, siteId, insight);
      } else {
        // Condition cleared — auto-resolve if active
        autoResolve(workspaceId, siteId, detect.name.replace('detect', '').replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '') as InsightType);
      }
    }
  } catch (err) {
    logger.error('Insights engine uncaught error', { service: 'insightsEngine', error: err instanceof Error ? err.message : String(err) });
  }
}

// ─── Detectors ───────────────────────────────────────────────────────────────

function detectHighBounceRate(workspaceId: string, siteId: string): DetectedInsight | null {
  const row = db.prepare(`
    SELECT
      COUNT(*)                                       AS total,
      SUM(CASE WHEN bounced = 1 THEN 1 ELSE 0 END)  AS bounced
    FROM sessions
    WHERE workspace_id = ?
      AND site_id      = ?
      AND created_at  >= datetime('now', '-2 hours')
  `).get(workspaceId, siteId) as { total: number; bounced: number };

  if (row.total < 10) return null;

  const rate = Math.round((row.bounced / row.total) * 100);
  if (rate < 70) return null;

  return {
    type: 'bounce_rate',
    severity: rate >= 85 ? 'critical' : 'warning',
    title: 'High bounce rate',
    description: `${rate}% of visitors left without engaging (${row.bounced}/${row.total} sessions in the last 2 hours).`,
    recommendation: 'Check your landing page load speed and ensure key content is visible above the fold. Test on mobile devices.',
    data: { currentValue: rate, threshold: 70, total: row.total, bounced: row.bounced },
  };
}

function detectLowDuration(workspaceId: string, siteId: string): DetectedInsight | null {
  const row = db.prepare(`
    SELECT
      COUNT(*)          AS total,
      AVG(duration)     AS avg_duration
    FROM sessions
    WHERE workspace_id = ?
      AND site_id      = ?
      AND created_at  >= datetime('now', '-2 hours')
      AND completed    = 1
  `).get(workspaceId, siteId) as { total: number; avg_duration: number | null };

  if (row.total < 10 || row.avg_duration == null) return null;

  const avgSecs = Math.round(row.avg_duration);
  if (avgSecs >= 30) return null;

  return {
    type: 'low_duration',
    severity: avgSecs < 15 ? 'critical' : 'warning',
    title: 'Low session duration',
    description: `Average session lasts only ${avgSecs}s (last 2 hours, ${row.total} completed sessions). Users are not engaging.`,
    recommendation: 'Review your content relevance and page layout. Ensure calls-to-action are clear and the page loads quickly.',
    data: { currentValue: avgSecs, threshold: 30, total: row.total },
  };
}

function detectNoActivity(workspaceId: string, siteId: string): DetectedInsight | null {
  const row = db.prepare(`
    SELECT COUNT(*) AS total
    FROM sessions
    WHERE workspace_id = ?
      AND site_id      = ?
      AND created_at  >= datetime('now', '-24 hours')
  `).get(workspaceId, siteId) as { total: number };

  // This detector fires when called explicitly (e.g. from a scheduled check).
  // During /collect ingestion, we just received a session, so this won't fire.
  // It's included for completeness and future scheduled-check support.
  if (row.total > 0) return null;

  return {
    type: 'no_activity',
    severity: 'warning',
    title: 'No traffic detected',
    description: 'This site has received zero sessions in the last 24 hours.',
    recommendation: 'Verify the tracking snippet is still installed. Check if the site is accessible and not blocking the SDK.',
    data: { currentValue: 0, threshold: 1, windowHours: 24 },
  };
}

function detectTrafficDrop(workspaceId: string, siteId: string): DetectedInsight | null {
  const row = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM sessions
       WHERE workspace_id = ? AND site_id = ?
         AND created_at >= datetime('now', '-24 hours')) AS current_count,
      (SELECT COUNT(*) FROM sessions
       WHERE workspace_id = ? AND site_id = ?
         AND created_at >= datetime('now', '-48 hours')
         AND created_at <  datetime('now', '-24 hours')) AS baseline_count
  `).get(workspaceId, siteId, workspaceId, siteId) as { current_count: number; baseline_count: number };

  // Need meaningful baseline
  if (row.baseline_count < 10) return null;

  const dropPct = Math.round(((row.baseline_count - row.current_count) / row.baseline_count) * 100);
  if (dropPct < 30) return null;

  return {
    type: 'traffic_drop',
    severity: dropPct >= 50 ? 'critical' : 'warning',
    title: 'Traffic dropped',
    description: `Sessions dropped ${dropPct}% compared to the previous 24 hours (${row.current_count} vs ${row.baseline_count}).`,
    recommendation: 'Check for site outages, DNS issues, or recent changes that may have broken tracking. Review marketing campaigns.',
    data: { currentValue: row.current_count, baseline: row.baseline_count, dropPercent: dropPct, threshold: 30 },
  };
}

function detectTrafficGrowth(workspaceId: string, siteId: string): DetectedInsight | null {
  const row = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM sessions
       WHERE workspace_id = ? AND site_id = ?
         AND created_at >= datetime('now', '-24 hours')) AS current_count,
      (SELECT COUNT(*) FROM sessions
       WHERE workspace_id = ? AND site_id = ?
         AND created_at >= datetime('now', '-48 hours')
         AND created_at <  datetime('now', '-24 hours')) AS baseline_count
  `).get(workspaceId, siteId, workspaceId, siteId) as { current_count: number; baseline_count: number };

  // Need meaningful baseline
  if (row.baseline_count < 10) return null;

  const growthPct = Math.round(((row.current_count - row.baseline_count) / row.baseline_count) * 100);
  if (growthPct < 30) return null;

  return {
    type: 'traffic_growth',
    severity: 'info',
    title: 'Traffic is growing',
    description: `Sessions increased ${growthPct}% compared to the previous 24 hours (${row.current_count} vs ${row.baseline_count}).`,
    recommendation: 'Great momentum. Consider reviewing which pages or campaigns are driving growth and double down.',
    data: { currentValue: row.current_count, baseline: row.baseline_count, growthPercent: growthPct, threshold: 30 },
  };
}

// ─── Persistence ─────────────────────────────────────────────────────────────

function upsertInsight(workspaceId: string, siteId: string, insight: DetectedInsight): void {
  // Check for active insight of same type
  const existing = db.prepare(`
    SELECT id FROM insights
    WHERE workspace_id = ?
      AND site_id      = ?
      AND type         = ?
      AND active       = 1
    LIMIT 1
  `).get(workspaceId, siteId, insight.type) as { id: string } | undefined;

  if (existing) return; // Already active — don't duplicate

  // Check cooldown: was there a recently resolved insight of this type?
  const recentlyResolved = db.prepare(`
    SELECT id FROM insights
    WHERE workspace_id = ?
      AND site_id      = ?
      AND type         = ?
      AND active       = 0
      AND resolved_at >= datetime('now', '-${COOLDOWN_HOURS} hours')
    LIMIT 1
  `).get(workspaceId, siteId, insight.type) as { id: string } | undefined;

  if (recentlyResolved) return; // Cooldown period — don't re-trigger

  const id = `ins_${nanoid(12)}`;
  db.prepare(`
    INSERT INTO insights (id, workspace_id, site_id, type, severity, title, description, recommendation, data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    workspaceId,
    siteId,
    insight.type,
    insight.severity,
    insight.title,
    insight.description,
    insight.recommendation,
    JSON.stringify(insight.data),
  );
}

/**
 * Auto-resolve an insight when conditions clear.
 * Maps detector function names to insight types.
 */
function autoResolve(workspaceId: string, siteId: string, typeHint: string): void {
  // Map camelCase detector names to insight types
  const typeMap: Record<string, InsightType> = {
    high_bounce_rate: 'bounce_rate',
    low_duration: 'low_duration',
    no_activity: 'no_activity',
    traffic_drop: 'traffic_drop',
    traffic_growth: 'traffic_growth',
  };

  const insightType = typeMap[typeHint];
  if (!insightType) return;

  db.prepare(`
    UPDATE insights
    SET active = 0, resolved_at = CURRENT_TIMESTAMP
    WHERE workspace_id = ?
      AND site_id      = ?
      AND type         = ?
      AND active       = 1
  `).run(workspaceId, siteId, insightType);
}
