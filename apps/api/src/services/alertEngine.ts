/**
 * DXM Pulse — Alert Engine
 * Runs after each /collect batch to detect anomalies and fire alerts.
 * Called fire-and-forget (no await) — failures are logged, not thrown.
 *
 * Detects:
 *  1. Rage clicks — 3+ clicks on the same target within 2 seconds
 *  2. Slow page load — LCP vital > 4000ms
 *  3. High bounce rate — >70% bounce in the last hour
 */

import { db } from '../db/index.js';
import { sendTelegramAlert } from './telegram.js';
import { nanoid } from 'nanoid';
import { BILLING_FEATURES, planSupportsFeature } from '../lib/billing.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type AlertType = 'frustration' | 'performance' | 'conversion';
type Severity   = 'critical' | 'high' | 'medium' | 'low';

interface DetectedAlert {
  type:         AlertType;
  severity:     Severity;
  title:        string;
  description:  string;
  siteId:       string;
  workspaceId:  string;
}

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * Main entry: run all checks for a given workspace + site combination.
 * Called after a /collect batch is committed to the DB.
 * Fire-and-forget — callers do NOT await this.
 */
export async function runAlertChecks(workspaceId: string, siteId: string): Promise<void> {
  try {
    const detected: DetectedAlert[] = [
      ...detectRageClicks(workspaceId, siteId),
      ...detectSlowPageLoads(workspaceId, siteId),
      ...detectHighBounceRate(workspaceId, siteId),
    ];

    if (detected.length === 0) return;

    const workspace = db.prepare(
      'SELECT id, plan, telegram_bot_token, telegram_chat_id FROM workspaces WHERE id = ?'
    ).get(workspaceId) as {
      id: string;
      plan: string;
      telegram_bot_token: string | null;
      telegram_chat_id: string | null;
    } | undefined;

    if (!workspace) return;
    if (!planSupportsFeature(workspace.plan, BILLING_FEATURES.alerts)) return;

    for (const alert of detected) {
      await createAlertIfNew(alert, workspace);
    }
  } catch (err) {
    console.error('[alertEngine] Uncaught error:', err);
  }
}

// ─── Detectors ───────────────────────────────────────────────────────────────

/**
 * Rage clicks: 3+ click events on the same `target` within 2 000 ms in one session.
 * Look only at events from the last 5 minutes so we don't re-scan old data.
 */
function detectRageClicks(workspaceId: string, siteId: string): DetectedAlert[] {
  const rows = db.prepare(`
    SELECT e.session_id, e.target, e.ts
    FROM events e
    JOIN sessions s ON s.id = e.session_id
    WHERE e.type = 'click'
      AND s.workspace_id = ?
      AND s.site_id      = ?
      AND e.created_at  >= datetime('now', '-5 minutes')
      AND e.target IS NOT NULL
    ORDER BY e.session_id, e.target, e.ts
  `).all(workspaceId, siteId) as { session_id: string; target: string; ts: number }[];

  const found: DetectedAlert[] = [];

  // Group by session + target
  const groups: Record<string, number[]> = {};
  for (const r of rows) {
    const key = `${r.session_id}::${r.target}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(r.ts);
  }

  for (const [key, timestamps] of Object.entries(groups)) {
    if (timestamps.length < 3) continue;

    // Sliding window: any 3 clicks within 2 000 ms
    for (let i = 0; i <= timestamps.length - 3; i++) {
      if (timestamps[i + 2] - timestamps[i] <= 2000) {
        const target = key.split('::')[1];
        found.push({
          type:        'frustration',
          severity:    'medium',
          title:       'Rage click detected',
          description: `A visitor clicked "${target}" 3+ times in 2 seconds — likely a broken interaction.`,
          siteId,
          workspaceId,
        });
        break; // one alert per group
      }
    }
  }

  return found;
}

/**
 * Slow page load: any LCP vital > 4 000 ms reported in the last hour.
 */
function detectSlowPageLoads(workspaceId: string, siteId: string): DetectedAlert[] {
  const row = db.prepare(`
    SELECT COUNT(*) as cnt
    FROM events e
    JOIN sessions s ON s.id = e.session_id
    WHERE e.type      = 'vital'
      AND s.workspace_id = ?
      AND s.site_id      = ?
      AND e.value_text LIKE 'LCP:%'
      AND CAST(SUBSTR(e.value_text, 5) AS REAL) > 4000
      AND e.created_at >= datetime('now', '-1 hour')
  `).get(workspaceId, siteId) as { cnt: number };

  if (row.cnt === 0) return [];

  return [{
    type:        'performance',
    severity:    'high',
    title:       'Slow page load detected',
    description: `${row.cnt} session(s) recorded an LCP above 4 000 ms in the last hour. Users on slow connections may be bouncing.`,
    siteId,
    workspaceId,
  }];
}

/**
 * High bounce rate: more than 70% of sessions in the last hour have bounced=1.
 * Only fires if there are at least 10 sessions (avoid noise on low-traffic sites).
 */
function detectHighBounceRate(workspaceId: string, siteId: string): DetectedAlert[] {
  const row = db.prepare(`
    SELECT
      COUNT(*)                                  AS total,
      SUM(CASE WHEN bounced = 1 THEN 1 ELSE 0 END) AS bounced
    FROM sessions
    WHERE workspace_id = ?
      AND site_id      = ?
      AND created_at  >= datetime('now', '-1 hour')
  `).get(workspaceId, siteId) as { total: number; bounced: number };

  if (row.total < 10) return [];

  const rate = (row.bounced / row.total) * 100;
  if (rate < 70) return [];

  return [{
    type:        'conversion',
    severity:    'medium',
    title:       'High bounce rate',
    description: `${Math.round(rate)}% of sessions in the last hour bounced (${row.bounced}/${row.total}). Landing page or load time may need attention.`,
    siteId,
    workspaceId,
  }];
}

// ─── Persistence + Notification ───────────────────────────────────────────────

interface Workspace {
  id: string;
  plan?: string;
  telegram_bot_token: string | null;
  telegram_chat_id:   string | null;
}

async function createAlertIfNew(alert: DetectedAlert, workspace: Workspace): Promise<void> {
  // Deduplicate: skip if an unresolved alert of the same type for the same site exists
  const existing = db.prepare(`
    SELECT id FROM alerts
    WHERE workspace_id = ?
      AND site_id      = ?
      AND type         = ?
      AND resolved     = 0
    LIMIT 1
  `).get(alert.workspaceId, alert.siteId, alert.type);

  if (existing) return; // already open — don't flood

  const alertId = nanoid(12);

  db.prepare(`
    INSERT INTO alerts (id, workspace_id, site_id, type, severity, title, description)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(alertId, alert.workspaceId, alert.siteId, alert.type, alert.severity, alert.title, alert.description);

  // Fire Telegram if credentials are configured
  if (workspace.telegram_bot_token && workspace.telegram_chat_id) {
    const sent = await sendTelegramAlert(
      workspace.telegram_bot_token,
      workspace.telegram_chat_id,
      {
        alertId,
        title:       alert.title,
        description: alert.description,
        severity:    alert.severity,
        type:        alert.type,
        workspaceId: alert.workspaceId,
      },
    );

    if (sent) {
      db.prepare('UPDATE alerts SET telegram_sent = 1 WHERE id = ?').run(alertId);
    }
  }
}
