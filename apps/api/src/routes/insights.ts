/**
 * DXM Pulse — Insights Route
 * GET /insights — returns active insights for the authenticated workspace.
 * Supports optional ?siteId= filter for site-scoped insights.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { db } from '../db/index.js';

const router = Router();

router.use(requireAuth);

interface InsightRow {
  id: string;
  workspace_id: string;
  site_id: string | null;
  type: string;
  severity: string;
  title: string;
  description: string;
  recommendation: string | null;
  data: string | null;
  active: number;
  created_at: string;
  resolved_at: string | null;
}

/**
 * GET /insights
 * Query params:
 *   - siteId (optional): filter insights to a specific site
 *   - includeResolved (optional): include recently resolved insights (last 24h)
 */
router.get('/', (req, res) => {
  const workspaceId = req.user!.workspaceId;
  const siteId = typeof req.query.siteId === 'string' ? req.query.siteId : null;
  const includeResolved = req.query.includeResolved === 'true';

  let query: string;
  const params: string[] = [workspaceId];

  if (siteId) {
    if (includeResolved) {
      query = `
        SELECT * FROM insights
        WHERE workspace_id = ? AND site_id = ?
          AND (active = 1 OR resolved_at >= datetime('now', '-24 hours'))
        ORDER BY active DESC, created_at DESC
        LIMIT 50
      `;
    } else {
      query = `
        SELECT * FROM insights
        WHERE workspace_id = ? AND site_id = ? AND active = 1
        ORDER BY created_at DESC
        LIMIT 20
      `;
    }
    params.push(siteId);
  } else {
    if (includeResolved) {
      query = `
        SELECT * FROM insights
        WHERE workspace_id = ?
          AND (active = 1 OR resolved_at >= datetime('now', '-24 hours'))
        ORDER BY active DESC, created_at DESC
        LIMIT 50
      `;
    } else {
      query = `
        SELECT * FROM insights
        WHERE workspace_id = ? AND active = 1
        ORDER BY created_at DESC
        LIMIT 20
      `;
    }
  }

  const rows = db.prepare(query).all(...params) as InsightRow[];

  const insights = rows.map((row) => ({
    id: row.id,
    siteId: row.site_id,
    type: row.type,
    severity: row.severity,
    title: row.title,
    description: row.description,
    recommendation: row.recommendation,
    data: row.data ? JSON.parse(row.data) : null,
    active: Boolean(row.active),
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  }));

  return res.json(insights);
});

export default router;
