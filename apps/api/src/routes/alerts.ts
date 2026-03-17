import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { sendTelegramAlert } from '../services/telegram.js';

const router = Router();
router.use(requireAuth);

// GET /alerts
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM alerts WHERE workspace_id = ?
    ORDER BY created_at DESC LIMIT 100
  `).all(req.user!.workspaceId);
  return res.json(rows);
});

// POST /alerts — create a new alert (also fires Telegram if configured)
router.post('/', async (req, res) => {
  const { type, severity, title, description, siteId, affectedSessions } = req.body;
  const workspaceId = req.user!.workspaceId;
  const { nanoid } = await import('nanoid');
  const alertId = 'alert_' + nanoid(12);

  db.prepare(`
    INSERT INTO alerts (id, workspace_id, site_id, type, severity, title, description, affected_sessions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(alertId, workspaceId, siteId || null, type, severity, title, description || '', affectedSessions || 0);

  // Fire Telegram if workspace has credentials configured
  const workspace = db.prepare('SELECT telegram_bot_token, telegram_chat_id FROM workspaces WHERE id = ?')
    .get(workspaceId) as any;

  if (workspace?.telegram_bot_token && workspace?.telegram_chat_id) {
    sendTelegramAlert(workspace.telegram_bot_token, workspace.telegram_chat_id, {
      title, description, severity, type, workspaceId, alertId,
    }).then(sent => {
      if (sent) {
        db.prepare('UPDATE alerts SET telegram_sent = 1 WHERE id = ?').run(alertId);
      }
    }).catch(console.error);
  }

  return res.status(201).json({ id: alertId });
});

// PATCH /alerts/:id/resolve
router.patch('/:id/resolve', (req, res) => {
  const result = db.prepare(`
    UPDATE alerts SET resolved = 1, resolved_at = CURRENT_TIMESTAMP
    WHERE id = ? AND workspace_id = ?
  `).run(req.params.id, req.user!.workspaceId);

  if (!result.changes) return res.status(404).json({ error: 'Alert not found' });
  return res.json({ ok: true });
});

export default router;
