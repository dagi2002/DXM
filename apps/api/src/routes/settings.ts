import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { sendTelegramTest } from '../services/telegram.js';

const router = Router();
router.use(requireAuth);

const telegramSchema = z.object({
  botToken: z.string().min(10, 'Invalid bot token'),
  chatId: z.string().min(1, 'Chat ID is required'),
});

// GET /settings
router.get('/', (req, res) => {
  const ws = db.prepare(`
    SELECT id, name, plan, billing_status, telegram_chat_id,
           CASE WHEN telegram_bot_token IS NOT NULL THEN true ELSE false END as telegram_configured
    FROM workspaces WHERE id = ?
  `).get(req.user!.workspaceId) as any;
  if (!ws) return res.status(404).json({ error: 'Workspace not found' });
  return res.json(ws);
});

// PATCH /settings — update workspace name
router.patch('/', (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name is required' });
  db.prepare('UPDATE workspaces SET name = ? WHERE id = ?').run(name.slice(0, 80), req.user!.workspaceId);
  return res.json({ ok: true });
});

// PUT /settings/telegram — save Telegram credentials
router.put('/telegram', validate(telegramSchema), (req, res) => {
  const { botToken, chatId } = req.body;
  db.prepare('UPDATE workspaces SET telegram_bot_token = ?, telegram_chat_id = ? WHERE id = ?')
    .run(botToken, chatId, req.user!.workspaceId);
  return res.json({ ok: true });
});

// POST /settings/telegram/test — send a test message
router.post('/telegram/test', async (req, res) => {
  const ws = db.prepare('SELECT telegram_bot_token, telegram_chat_id FROM workspaces WHERE id = ?')
    .get(req.user!.workspaceId) as any;
  if (!ws?.telegram_bot_token || !ws?.telegram_chat_id) {
    return res.status(400).json({ error: 'Telegram not configured — save credentials first.' });
  }
  const ok = await sendTelegramTest(ws.telegram_bot_token, ws.telegram_chat_id);
  return ok ? res.json({ ok: true }) : res.status(502).json({ error: 'Telegram delivery failed — check your bot token and chat ID.' });
});

export default router;
