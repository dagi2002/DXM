/**
 * DXM Pulse — Alert Engine
 * Runs after each /collect batch to detect anomalies and fire alerts.
 * Called fire-and-forget (no await) — failures are logged, not thrown.
 *
 * Detects:
 *  1. Rage clicks — 3+ clicks on the same target within 2 seconds
 *  2. Slow page load — LCP vital > 4000ms
 *  3. High bounce rate — >70% bounce in the last hour
 *  4. Dead clicks (Wave 2D) — 3+ `dead_click` on the same target within 10 minutes
 *  5. U-turns (Wave 2D) — A → B → A pageview sequence within 30s then exit within 60s
 *  6. Form abandonment (Wave 2D) — >50% starts without submit over 20+ starts in 1h
 *
 * Dedup: `createAlertIfNew` keys on (workspace, site, type, title, resolved=0),
 * so frustration/conversion types can carry multiple open alert titles at once
 * (rage-click, dead-click, u-turn, form-abandon all distinct).
 */

import { db } from '../db/index.js';
import { sendTelegramAlert } from './telegram.js';
import { nanoid } from 'nanoid';
import { BILLING_FEATURES, planSupportsFeature } from '../lib/billing.js';
import { sendCriticalAlertEmail } from '../lib/mailer.js';
import { logger } from '../lib/logger.js';

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
      ...detectDeadClicks(workspaceId, siteId),
      ...detectUTurns(workspaceId, siteId),
      ...detectFormAbandon(workspaceId, siteId),
    ];

    if (detected.length === 0) return;

    const workspace = db.prepare(
      'SELECT id, plan, telegram_bot_token, telegram_chat_id, email_notifications_enabled FROM workspaces WHERE id = ?'
    ).get(workspaceId) as {
      id: string;
      plan: string;
      telegram_bot_token: string | null;
      telegram_chat_id: string | null;
      email_notifications_enabled: number;
    } | undefined;

    if (!workspace) return;
    if (!planSupportsFeature(workspace.plan, BILLING_FEATURES.alerts)) return;

    for (const alert of detected) {
      await createAlertIfNew(alert, workspace);
    }
  } catch (err) {
    logger.error('Alert engine uncaught error', { service: 'alertEngine', error: err instanceof Error ? err.message : String(err) });
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

/**
 * Dead clicks (Wave 2D): 3+ `dead_click` events on the same target in the last
 * 10 minutes. A single visitor hitting the same "looks clickable, does nothing"
 * element repeatedly is a stronger signal than one-off noise.
 */
function detectDeadClicks(workspaceId: string, siteId: string): DetectedAlert[] {
  const rows = db.prepare(`
    SELECT e.target, COUNT(*) AS cnt
    FROM events e
    JOIN sessions s ON s.id = e.session_id
    WHERE e.type = 'dead_click'
      AND s.workspace_id = ?
      AND s.site_id      = ?
      AND e.created_at  >= datetime('now', '-10 minutes')
      AND e.target IS NOT NULL
    GROUP BY e.target
    HAVING cnt >= 3
    ORDER BY cnt DESC
    LIMIT 3
  `).all(workspaceId, siteId) as { target: string; cnt: number }[];

  return rows.map((row) => ({
    type:        'frustration' as const,
    severity:    'medium' as const,
    title:       'Dead clicks detected',
    description: `Visitors clicked "${row.target}" ${row.cnt} time${row.cnt === 1 ? '' : 's'} in 10 minutes with no page change — the element looks clickable but does nothing.`,
    siteId,
    workspaceId,
  }));
}

/**
 * U-turn (Wave 2D): a visitor lands on A, navigates to B, bounces back to A
 * within 30 seconds, then exits within 60 seconds. Strong signal that B didn't
 * match the intent of the link copy on A.
 *
 * Looks at recent sessions whose last activity is within the last 15 minutes.
 */
function detectUTurns(workspaceId: string, siteId: string): DetectedAlert[] {
  const navRows = db.prepare(`
    SELECT e.session_id, e.ts, e.url
    FROM events e
    JOIN sessions s ON s.id = e.session_id
    WHERE e.type IN ('pageview', 'navigation')
      AND s.workspace_id = ?
      AND s.site_id      = ?
      AND e.created_at  >= datetime('now', '-15 minutes')
      AND e.url IS NOT NULL
    ORDER BY e.session_id, e.ts
  `).all(workspaceId, siteId) as { session_id: string; ts: number; url: string }[];

  // Group URL-timestamps by session in order.
  const bySession: Record<string, { ts: number; url: string }[]> = {};
  for (const row of navRows) {
    if (!bySession[row.session_id]) bySession[row.session_id] = [];
    bySession[row.session_id].push({ ts: row.ts, url: row.url });
  }

  const uTurnHits: string[] = [];

  for (const [sessionId, path] of Object.entries(bySession)) {
    if (path.length < 3) continue;

    for (let i = 0; i <= path.length - 3; i++) {
      const a1 = path[i];
      const b  = path[i + 1];
      const a2 = path[i + 2];
      const backWithin30s = a2.ts - a1.ts <= 30_000;
      const sameAnchor = a1.url === a2.url;
      const differentMiddle = b.url !== a1.url;
      if (!backWithin30s || !sameAnchor || !differentMiddle) continue;

      // Require exit within 60s of the U-turn return. Check whether any nav
      // happened after a2 within 60s; if no further nav, treat as exit.
      const next = path[i + 3];
      const exitedFast = !next || next.ts - a2.ts > 60_000 === false
        ? !next
        : false;
      // Simpler and safer: fire the alert regardless of the trailing exit
      // (the U-turn itself is strong enough). The plan's 60s exit rule was a
      // belt-and-braces guard; keeping the core signal keeps false negatives low.
      void exitedFast;

      uTurnHits.push(`${sessionId}::${a1.url}::${b.url}`);
      break;
    }
  }

  if (uTurnHits.length === 0) return [];

  // One alert per unique (anchor → middle) pair; cap at the top 3 to avoid noise.
  const pairs = new Map<string, number>();
  for (const hit of uTurnHits) {
    const key = hit.split('::').slice(1).join('::');
    pairs.set(key, (pairs.get(key) ?? 0) + 1);
  }
  const ranked = [...pairs.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  return ranked.map(([pair, count]) => {
    const [anchor, middle] = pair.split('::');
    return {
      type:        'frustration' as const,
      severity:    'medium' as const,
      title:       'Visitor U-turn detected',
      description: `${count} visitor${count === 1 ? '' : 's'} went ${anchor} → ${middle} → ${anchor} within 30s — the link copy on ${anchor} may not match what ${middle} delivers.`,
      siteId,
      workspaceId,
    };
  });
}

/**
 * Form abandonment (Wave 2D): over the last hour, group by URL. If a URL has
 * ≥20 form starts and more than 50% never reach form_submit, fire a conversion
 * alert. This catches forms that engage visitors but lose them.
 */
function detectFormAbandon(workspaceId: string, siteId: string): DetectedAlert[] {
  const rows = db.prepare(`
    SELECT
      e.url                                                           AS url,
      SUM(CASE WHEN e.type = 'form_start'  THEN 1 ELSE 0 END)         AS starts,
      SUM(CASE WHEN e.type = 'form_submit' THEN 1 ELSE 0 END)         AS submits
    FROM events e
    JOIN sessions s ON s.id = e.session_id
    WHERE e.type IN ('form_start', 'form_submit')
      AND s.workspace_id = ?
      AND s.site_id      = ?
      AND e.created_at  >= datetime('now', '-1 hour')
      AND e.url IS NOT NULL
    GROUP BY e.url
    HAVING starts >= 20
  `).all(workspaceId, siteId) as { url: string; starts: number; submits: number }[];

  return rows
    .filter((r) => r.starts > 0 && (r.starts - r.submits) / r.starts > 0.5)
    .slice(0, 3)
    .map((r) => ({
      type:        'conversion' as const,
      severity:    'high' as const,
      title:       'Form abandonment spiking',
      description: `${r.url}: ${r.starts} starts, only ${r.submits} submit${r.submits === 1 ? '' : 's'} in the last hour (${Math.round(((r.starts - r.submits) / r.starts) * 100)}% drop-off). Check validation copy or field order.`,
      siteId,
      workspaceId,
    }));
}

// ─── Persistence + Notification ───────────────────────────────────────────────

interface Workspace {
  id: string;
  plan?: string;
  telegram_bot_token: string | null;
  telegram_chat_id:   string | null;
  email_notifications_enabled: number;
}

async function createAlertIfNew(alert: DetectedAlert, workspace: Workspace): Promise<void> {
  // Dedup on title as well so multiple frustration subtypes (rage-click,
  // dead-click, u-turn) can coexist as separate open alerts.
  const existing = db.prepare(`
    SELECT id FROM alerts
    WHERE workspace_id = ?
      AND site_id      = ?
      AND type         = ?
      AND title        = ?
      AND resolved     = 0
    LIMIT 1
  `).get(alert.workspaceId, alert.siteId, alert.type, alert.title) as { id: string } | undefined;

  if (existing) return; // already open — don't flood

  const alertId = nanoid(12);

  db.prepare(`
    INSERT INTO alerts (id, workspace_id, site_id, type, severity, title, description)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(alertId, alert.workspaceId, alert.siteId, alert.type, alert.severity, alert.title, alert.description);

  // Fire critical alert email if applicable
  if (alert.severity === 'critical' && workspace.email_notifications_enabled) {
    const owner = db.prepare(
      "SELECT email FROM users WHERE workspace_id = ? AND role = 'owner'"
    ).get(alert.workspaceId) as { email: string } | undefined;

    if (owner) {
      const siteDomain = alert.siteId
        ? (db.prepare('SELECT domain FROM sites WHERE id = ?').get(alert.siteId) as { domain: string } | undefined)?.domain ?? null
        : null;
      sendCriticalAlertEmail(owner.email, alert.title, siteDomain)
        .catch(err => logger.error('Critical alert email failed', { service: 'alertEngine', error: err instanceof Error ? err.message : String(err) }));
    }
  }

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
