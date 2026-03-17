import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// GET /sessions — list workspace sessions (summarised)
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT s.id, s.started_at, s.ended_at, s.duration,
           s.device, s.browser, s.language, s.screen_width, s.screen_height,
           s.entry_url, s.clicks, s.scroll_depth, s.total_events,
           s.bounced, s.converted, s.completed, s.created_at, s.updated_at,
           si.domain as site_domain
    FROM sessions s
    LEFT JOIN sites si ON si.id = s.site_id
    WHERE s.workspace_id = ?
    ORDER BY s.created_at DESC
    LIMIT 200
  `).all(req.user!.workspaceId);

  return res.json(rows.map(r => ({ ...r, events: [] })));
});

// GET /sessions/:id — full session with events
router.get('/:id', (req, res) => {
  const session = db.prepare(`
    SELECT * FROM sessions WHERE id = ? AND workspace_id = ?
  `).get(req.params.id, req.user!.workspaceId) as any;

  if (!session) return res.status(404).json({ error: 'Session not found' });

  const events = db.prepare(`
    SELECT type, ts, x, y, scroll_depth, target, url, value_text
    FROM events WHERE session_id = ? ORDER BY ts ASC
  `).all(req.params.id);

  return res.json({ ...session, events });
});

// GET /sessions/:id/replay — rrweb replay data
router.get('/:id/replay', (req, res) => {
  // Verify ownership
  const session = db.prepare('SELECT id, started_at FROM sessions WHERE id = ? AND workspace_id = ?')
    .get(req.params.id, req.user!.workspaceId) as any;
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const replay = db.prepare('SELECT events_json, size_bytes FROM session_replays WHERE session_id = ?')
    .get(req.params.id) as any;
  if (!replay) return res.status(404).json({ error: 'No replay data for this session' });

  let events: any[] = [];
  try { events = JSON.parse(replay.events_json); } catch {}

  return res.json({
    sessionId: req.params.id,
    startedAt: session.started_at,
    events,
    sizeBytes: replay.size_bytes,
  });
});

export default router;
