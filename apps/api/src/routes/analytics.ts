import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { getHeatmapReadModel } from '../services/sessionReadModels.js';

const router = Router();
router.use(requireAuth);

// GET /analytics/vitals?period=7d
router.get('/vitals', (req, res) => {
  const workspaceId = req.user!.workspaceId;

  const rows = db.prepare(`
    SELECT value_text
    FROM events e
    JOIN sessions s ON s.id = e.session_id
    WHERE e.type = 'vital'
      AND s.workspace_id = ?
      AND e.created_at >= datetime('now', '-7 days')
  `).all(workspaceId) as { value_text: string }[];

  const grouped: Record<string, number[]> = {};
  for (const row of rows) {
    if (!row.value_text) continue;
    const [name, value] = row.value_text.split(':');
    if (!name || !value) continue;
    if (!grouped[name]) grouped[name] = [];
    grouped[name].push(parseFloat(value));
  }

  const result: Record<string, { value: number; p50: number; p75: number; p95: number }> = {};
  for (const [name, values] of Object.entries(grouped)) {
    values.sort((a, b) => a - b);
    const p = (pct: number) => values[Math.floor(values.length * pct)] ?? 0;
    result[name.toLowerCase()] = {
      value: parseFloat((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)),
      p50: p(0.5),
      p75: p(0.75),
      p95: p(0.95),
    };
  }

  return res.json(result);
});

// GET /analytics/userflow
router.get('/userflow', (req, res) => {
  const workspaceId = req.user!.workspaceId;

  const navEvents = db.prepare(`
    SELECT e.session_id, e.url, e.ts
    FROM events e
    JOIN sessions s ON s.id = e.session_id
    WHERE e.type = 'navigation'
      AND s.workspace_id = ?
      AND e.created_at >= datetime('now', '-7 days')
    ORDER BY e.session_id, e.ts ASC
  `).all(workspaceId) as { session_id: string; url: string; ts: number }[];

  // Build page → transitions map
  const transitions: Record<string, Record<string, number>> = {};
  const sessionPages: Record<string, string[]> = {};

  for (const evt of navEvents) {
    if (!sessionPages[evt.session_id]) sessionPages[evt.session_id] = [];
    sessionPages[evt.session_id].push(normalizePath(evt.url));
  }

  for (const pages of Object.values(sessionPages)) {
    for (let i = 0; i < pages.length - 1; i++) {
      const from = pages[i];
      const to = pages[i + 1];
      if (!transitions[from]) transitions[from] = {};
      transitions[from][to] = (transitions[from][to] || 0) + 1;
    }
    // Count exits
    const last = pages[pages.length - 1];
    if (!transitions[last]) transitions[last] = {};
    transitions[last]['exit'] = (transitions[last]['exit'] || 0) + 1;
  }

  const result = Object.entries(transitions).map(([page, nexts]) => {
    const total = Object.values(nexts).reduce((a, b) => a + b, 0);
    return {
      page,
      users: total,
      next: Object.entries(nexts)
        .map(([target, count]) => ({ target, percent: Math.round((count / total) * 100) }))
        .sort((a, b) => b.percent - a.percent)
        .slice(0, 5),
    };
  }).sort((a, b) => b.users - a.users).slice(0, 10);

  return res.json(result);
});

// GET /analytics/heatmap
router.get('/heatmap', (req, res) => {
  return res.json(getHeatmapReadModel(req.user!.workspaceId));
});

// GET /analytics/metrics
router.get('/metrics', (req, res) => {
  const workspaceId = req.user!.workspaceId;
  const since = "datetime('now', '-7 days')";

  const totalSessions = (db.prepare(`SELECT COUNT(*) as c FROM sessions WHERE workspace_id = ? AND created_at >= ${since}`).get(workspaceId) as any)?.c || 0;
  const activeSessions = (db.prepare(`SELECT COUNT(*) as c FROM sessions WHERE workspace_id = ? AND completed = 0 AND created_at >= ${since}`).get(workspaceId) as any)?.c || 0;
  const bouncedSessions = (db.prepare(`SELECT COUNT(*) as c FROM sessions WHERE workspace_id = ? AND bounced = 1 AND created_at >= ${since}`).get(workspaceId) as any)?.c || 0;
  const convertedSessions = (db.prepare(`SELECT COUNT(*) as c FROM sessions WHERE workspace_id = ? AND converted = 1 AND created_at >= ${since}`).get(workspaceId) as any)?.c || 0;
  const avgDuration = (db.prepare(`SELECT AVG(duration) as a FROM sessions WHERE workspace_id = ? AND duration > 0 AND created_at >= ${since}`).get(workspaceId) as any)?.a || 0;

  const bounceRate = totalSessions > 0 ? ((bouncedSessions / totalSessions) * 100).toFixed(1) : '0';
  const convRate = totalSessions > 0 ? ((convertedSessions / totalSessions) * 100).toFixed(1) : '0';
  const avgSecs = Math.round(avgDuration);
  const avgDisplay = avgSecs > 60 ? `${Math.floor(avgSecs / 60)}m ${avgSecs % 60}s` : `${avgSecs}s`;

  return res.json([
    { name: 'Active Sessions',      value: activeSessions,     change: 0, trend: 'stable' },
    { name: 'Avg Session Duration', value: avgDisplay,         change: 0, trend: 'stable' },
    { name: 'Bounce Rate',          value: `${bounceRate}%`,   change: 0, trend: 'stable' },
    { name: 'Conversion Rate',      value: `${convRate}%`,     change: 0, trend: 'stable' },
  ]);
});

function normalizePath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname || '/';
  } catch {
    return url.startsWith('/') ? url : '/' + url;
  }
}

export default router;
