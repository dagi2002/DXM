/**
 * Public shared-report endpoint.
 *
 * GET /public/reports/:token — no auth. The token (created via
 * POST /sites/:id/report-share) is hashed and looked up; revoked, expired,
 * and unknown tokens all return a uniform 404 so probing reveals nothing.
 *
 * SECURITY: the payload is built by whitelisting fields. `siteKey`, the
 * install `snippet`, and workspace/user ids must never appear here — this is
 * the only route that serves workspace analytics without authentication.
 */
import { Router } from 'express';
import { createHash } from 'node:crypto';
import cors from 'cors';
import { db } from '../db/index.js';
import { getSiteDetail } from '../services/siteAnalytics.js';

const router = Router();

// Read-only public data: any origin, no credentials, GET only.
const publicReportCors = cors({
  origin: '*',
  credentials: false,
  methods: ['GET', 'OPTIONS'],
});

interface ShareLookupRow {
  id: string;
  workspace_id: string;
  site_id: string;
  expires_at: string;
}

router.get('/:token', publicReportCors, (req, res) => {
  const token = req.params.token;
  if (!token || token.length < 16 || token.length > 100) {
    return res.status(404).json({ error: 'Report not found' });
  }

  const tokenHash = createHash('sha256').update(token).digest('hex');
  const share = db.prepare(`
    SELECT id, workspace_id, site_id, expires_at
    FROM report_shares
    WHERE token_hash = ?
      AND revoked_at IS NULL
      AND expires_at > datetime('now')
    LIMIT 1
  `).get(tokenHash) as ShareLookupRow | undefined;

  if (!share) return res.status(404).json({ error: 'Report not found' });

  const detail = getSiteDetail(share.workspace_id, share.site_id);
  if (!detail) return res.status(404).json({ error: 'Report not found' });

  const workspace = db.prepare('SELECT name FROM workspaces WHERE id = ?')
    .get(share.workspace_id) as { name: string } | undefined;

  const insights = db.prepare(`
    SELECT id, type, severity, title, description, recommendation, created_at
    FROM insights
    WHERE workspace_id = ? AND site_id = ? AND active = 1
    ORDER BY created_at DESC
    LIMIT 20
  `).all(share.workspace_id, share.site_id) as Array<{
    id: string;
    type: string;
    severity: string;
    title: string;
    description: string;
    recommendation: string | null;
    created_at: string;
  }>;

  // Field whitelist — everything the client report renders, nothing more.
  return res.json({
    site: {
      id: detail.id,
      name: detail.name,
      domain: detail.domain,
      createdAt: detail.createdAt,
      verified: detail.verified,
      trackingStatus: detail.trackingStatus,
      lastActivityAt: detail.lastActivityAt,
      sessionCount7d: detail.sessionCount7d,
      openAlerts: detail.openAlerts,
      criticalAlerts: detail.criticalAlerts,
      avgDurationSeconds: detail.avgDurationSeconds,
      bounceRate: detail.bounceRate,
      conversionRate: detail.conversionRate,
      healthScore: detail.healthScore,
      vitals: detail.vitals,
      recentSessions: detail.recentSessions.map((session) => ({
        id: session.id,
        startedAt: session.startedAt,
        duration: session.duration,
        device: session.device,
        browser: session.browser,
        entryUrl: session.entryUrl,
        createdAt: session.createdAt,
      })),
      openAlertsList: detail.openAlertsList.map((alert) => ({
        id: alert.id,
        type: alert.type,
        severity: alert.severity,
        title: alert.title,
        description: alert.description,
        affectedSessions: alert.affectedSessions,
        createdAt: alert.createdAt,
      })),
      ai: detail.ai ? { summary: detail.ai.summary } : undefined,
    },
    insights: insights.map((row) => ({
      id: row.id,
      type: row.type,
      severity: row.severity,
      title: row.title,
      description: row.description,
      recommendation: row.recommendation,
      createdAt: row.created_at,
    })),
    workspaceName: workspace?.name ?? 'DXM Pulse workspace',
    generatedAt: new Date().toISOString(),
    expiresAt: share.expires_at,
  });
});

export default router;
