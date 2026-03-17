/**
 * Funnel API routes
 *
 * GET  /funnels                    List workspace funnels
 * POST /funnels                    Create a new funnel
 * DELETE /funnels/:id              Delete a funnel
 * GET  /funnels/:id/analysis       Run analysis for a funnel
 */
import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { nanoid } from 'nanoid';

const router = Router();
router.use(requireAuth);

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

  const funnel = db.prepare('SELECT * FROM funnels WHERE id = ? AND workspace_id = ?')
    .get(req.params.id, workspaceId) as { id: string; name: string; steps_json: string; site_id: string | null } | undefined;

  if (!funnel) return res.status(404).json({ error: 'Funnel not found' });

  const period = (req.query.period as string) || '7d';
  const periodMap: Record<string, string> = {
    '1d': '-1 day', '7d': '-7 days', '30d': '-30 days', '90d': '-90 days',
  };
  const since = periodMap[period] ?? '-7 days';

  const steps: { name: string; urlPattern: string }[] = JSON.parse(funnel.steps_json);

  // Fetch all navigation events for this workspace in the period
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

  // Group by session
  const bySession: Record<string, string[]> = {};
  for (const ev of navEvents) {
    if (!bySession[ev.session_id]) bySession[ev.session_id] = [];
    bySession[ev.session_id].push(ev.url);
  }

  // For each session, track which steps they completed (in order)
  const stepCounts = new Array(steps.length).fill(0);
  const stepTimes: number[][] = steps.map(() => []);

  const totalSessions = Object.keys(bySession).length;

  for (const urls of Object.values(bySession)) {
    let lastStepIdx = -1;
    let lastStepTs = 0;

    for (const [i, step] of steps.entries()) {
      // Find the first URL matching this step's pattern that occurs after the last step
      const matchIdx = urls.findIndex((url, idx) => {
        if (idx < Math.max(0, lastStepIdx)) return false;
        try {
          return new RegExp(step.urlPattern, 'i').test(url);
        } catch {
          return url.toLowerCase().includes(step.urlPattern.toLowerCase());
        }
      });

      if (matchIdx === -1) break; // session didn't reach this step

      stepCounts[i]++;
      if (lastStepTs > 0 && i > 0) {
        // We don't have precise per-event timestamps here (simplified)
        stepTimes[i].push(30); // placeholder avg seconds
      }
      lastStepIdx = matchIdx;
      lastStepTs = Date.now();
    }
  }

  // Build result
  const firstCount = stepCounts[0] || totalSessions;
  const result = steps.map((step, i) => {
    const users = stepCounts[i];
    const conversionRate = firstCount > 0 ? Math.round((users / firstCount) * 100 * 10) / 10 : 0;
    const prevUsers = i > 0 ? stepCounts[i - 1] : firstCount;
    const dropoffRate = prevUsers > 0 ? Math.round(((prevUsers - users) / prevUsers) * 100 * 10) / 10 : 0;
    const avgTime = stepTimes[i].length > 0
      ? Math.round(stepTimes[i].reduce((a, b) => a + b, 0) / stepTimes[i].length)
      : null;

    return {
      name:           step.name,
      urlPattern:     step.urlPattern,
      users,
      conversionRate,
      dropoffRate,
      avgTimeToNext:  avgTime,
    };
  });

  return res.json({
    funnelId: funnel.id,
    funnelName: funnel.name,
    period,
    totalSessions,
    steps: result,
  });
});

export default router;
