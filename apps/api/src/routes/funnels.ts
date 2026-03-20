/**
 * Funnel API routes
 *
 * GET  /funnels                    List workspace funnels
 * POST /funnels                    Create a new funnel
 * DELETE /funnels/:id              Delete a funnel
 * GET  /funnels/:id/analysis       Run analysis for a funnel
 */
import { Router } from 'express';
import type {
  FunnelAnalysisDetail,
  FunnelAnalysisPeriod,
  FunnelAnalysisStep,
} from '../../../../packages/contracts/index.js';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { getFunnelAiBriefOrNull } from '../services/ai/index.js';
import { nanoid } from 'nanoid';
import { BILLING_FEATURES, requirePlanFeature } from '../lib/billing.js';

const router = Router();
router.use(requireAuth);
router.use(requirePlanFeature(BILLING_FEATURES.funnels));

interface StoredFunnel {
  id: string;
  name: string;
  steps_json: string;
  site_id: string | null;
}

const PERIOD_MAP: Record<FunnelAnalysisPeriod, string> = {
  '1d': '-1 day',
  '7d': '-7 days',
  '30d': '-30 days',
  '90d': '-90 days',
};

const normalizePeriod = (value: string | undefined): FunnelAnalysisPeriod => {
  if (value === '1d' || value === '30d' || value === '90d') return value;
  return '7d';
};

const getStoredFunnel = (workspaceId: string, funnelId: string) =>
  db.prepare<[string, string], StoredFunnel>(
    'SELECT id, name, steps_json, site_id FROM funnels WHERE id = ? AND workspace_id = ?',
  ).get(funnelId, workspaceId);

const buildFunnelAnalysisDetail = (
  workspaceId: string,
  funnel: StoredFunnel,
  period: FunnelAnalysisPeriod,
): FunnelAnalysisDetail => {
  const since = PERIOD_MAP[period];
  const steps: { name: string; urlPattern: string }[] = JSON.parse(funnel.steps_json);

  const siteFilter = funnel.site_id ? 'AND s.site_id = ?' : '';
  const siteArgs = funnel.site_id ? [workspaceId, funnel.site_id] : [workspaceId];

  const navEvents = db.prepare(`
    SELECT e.session_id, e.url, e.ts
    FROM events e
    JOIN sessions s ON s.id = e.session_id
    WHERE e.type IN ('pageview', 'navigation')
      AND s.workspace_id = ?
      ${siteFilter}
      AND e.created_at >= datetime('now', '${since}')
    ORDER BY e.session_id, e.ts ASC
  `).all(...siteArgs) as { session_id: string; url: string; ts: number }[];

  const bySession: Record<string, string[]> = {};
  for (const ev of navEvents) {
    if (!bySession[ev.session_id]) bySession[ev.session_id] = [];
    bySession[ev.session_id].push(ev.url);
  }

  const stepCounts = new Array(steps.length).fill(0);
  const stepTimes: number[][] = steps.map(() => []);
  const totalSessions = Object.keys(bySession).length;

  for (const urls of Object.values(bySession)) {
    let lastStepIdx = -1;
    let lastStepTs = 0;

    for (const [i, step] of steps.entries()) {
      const matchIdx = urls.findIndex((url, idx) => {
        if (idx < Math.max(0, lastStepIdx)) return false;
        try {
          return new RegExp(step.urlPattern, 'i').test(url);
        } catch {
          return url.toLowerCase().includes(step.urlPattern.toLowerCase());
        }
      });

      if (matchIdx === -1) break;

      stepCounts[i]++;
      if (lastStepTs > 0 && i > 0) {
        // Current backend timings are still simplified, so AI must treat them as weak signal only.
        stepTimes[i].push(30);
      }
      lastStepIdx = matchIdx;
      lastStepTs = Date.now();
    }
  }

  const firstCount = stepCounts[0] || totalSessions;
  const result: FunnelAnalysisStep[] = steps.map((step, i) => {
    const users = stepCounts[i];
    const conversionRate = firstCount > 0 ? Math.round((users / firstCount) * 100 * 10) / 10 : 0;
    const prevUsers = i > 0 ? stepCounts[i - 1] : firstCount;
    const dropoffRate = prevUsers > 0 ? Math.round(((prevUsers - users) / prevUsers) * 100 * 10) / 10 : 0;
    const avgTime = stepTimes[i].length > 0
      ? Math.round(stepTimes[i].reduce((a, b) => a + b, 0) / stepTimes[i].length)
      : null;

    return {
      name: step.name,
      urlPattern: step.urlPattern,
      users,
      conversionRate,
      dropoffRate,
      avgTimeToNext: avgTime,
    };
  });

  return {
    funnelId: funnel.id,
    funnelName: funnel.name,
    period,
    totalSessions,
    steps: result,
  };
};

// GET /funnels — list all funnels for the workspace
router.get('/', (req, res) => {
  const workspaceId = req.user!.workspaceId;
  const funnels = db.prepare(`
    SELECT id, name, steps_json, created_at
    FROM funnels
    WHERE workspace_id = ?
    ORDER BY created_at DESC
  `).all(workspaceId) as { id: string; name: string; steps_json: string; created_at: string }[];

  return res.json(funnels.map(f => ({
    ...f,
    steps: JSON.parse(f.steps_json),
  })));
});

// POST /funnels — create a funnel
router.post('/', (req, res) => {
  const workspaceId = req.user!.workspaceId;
  const { name, steps, siteId } = req.body as {
    name: string;
    steps: { name: string; urlPattern: string }[];
    siteId?: string;
  };

  if (!name || !steps || !Array.isArray(steps) || steps.length < 2) {
    return res.status(400).json({ error: 'name and at least 2 steps are required' });
  }

  const id = nanoid(12);
  db.prepare(`
    INSERT INTO funnels (id, workspace_id, site_id, name, steps_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, workspaceId, siteId ?? null, name, JSON.stringify(steps));

  return res.status(201).json({ id, name, steps });
});

// DELETE /funnels/:id
router.delete('/:id', (req, res) => {
  const workspaceId = req.user!.workspaceId;
  db.prepare('DELETE FROM funnels WHERE id = ? AND workspace_id = ?')
    .run(req.params.id, workspaceId);
  return res.json({ ok: true });
});

// GET /funnels/:id/analysis — run funnel analysis against real session events
router.get('/:id/analysis', (req, res) => {
  const workspaceId = req.user!.workspaceId;
  const funnel = getStoredFunnel(workspaceId, req.params.id);

  if (!funnel) return res.status(404).json({ error: 'Funnel not found' });

  const period = normalizePeriod(req.query.period as string | undefined);
  const analysis = buildFunnelAnalysisDetail(workspaceId, funnel, period);
  const ai = getFunnelAiBriefOrNull(workspaceId, analysis, funnel.site_id);

  return res.json(ai ? { ...analysis, ai } : analysis);
});

export default router;
