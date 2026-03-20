import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { listWorkspaceSites } from '../services/siteAnalytics.js';
import { sendTelegramTest } from '../services/telegram.js';

const router = Router();
router.use(requireAuth);

const telegramSchema = z.object({
  botToken: z.string().min(10, 'Invalid bot token'),
  chatId: z.string().min(1, 'Chat ID is required'),
});

const workspaceSettingsSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    digestEnabled: z.boolean().optional(),
    digestLanguage: z.enum(['en', 'am']).optional(),
  })
  .refine(
    (value) =>
      typeof value.name !== 'undefined' ||
      typeof value.digestEnabled !== 'undefined' ||
      typeof value.digestLanguage !== 'undefined',
    {
      message: 'At least one setting is required',
    }
  );

// GET /settings
router.get('/', (req, res) => {
  const workspace = db.prepare(`
    SELECT id, name, plan, billing_status, telegram_chat_id, digest_enabled, digest_language, created_at,
           CASE WHEN telegram_bot_token IS NOT NULL THEN true ELSE false END as telegram_configured
    FROM workspaces WHERE id = ?
  `).get(req.user!.workspaceId) as any;

  if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

  const profile = db.prepare(`
    SELECT id, name, email, role, avatar, last_login
    FROM users
    WHERE id = ?
  `).get(req.user!.id) as any;

  const team = db.prepare(`
    SELECT id, name, email, role, avatar, last_login
    FROM users
    WHERE workspace_id = ?
    ORDER BY
      CASE role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END,
      name ASC
  `).all(req.user!.workspaceId) as any[];

  return res.json({
    profile,
    workspace: {
      id: workspace.id,
      name: workspace.name,
      plan: workspace.plan,
      billingStatus: workspace.billing_status,
      telegramChatId: workspace.telegram_chat_id,
      telegramConfigured: Boolean(workspace.telegram_configured),
      digestEnabled: Boolean(workspace.digest_enabled),
      digestLanguage: workspace.digest_language,
      createdAt: workspace.created_at,
    },
    team: team.map((member) => ({
      id: member.id,
      name: member.name,
      email: member.email,
      role: member.role,
      avatar: member.avatar,
      lastLogin: member.last_login,
    })),
    sites: listWorkspaceSites(req.user!.workspaceId),
  });
});

// PATCH /settings — update workspace name
router.patch('/', validate(workspaceSettingsSchema), (req, res) => {
  const { name, digestEnabled, digestLanguage } = req.body;

  db.prepare(`
    UPDATE workspaces
    SET
      name = COALESCE(?, name),
      digest_enabled = COALESCE(?, digest_enabled),
      digest_language = COALESCE(?, digest_language)
    WHERE id = ?
  `).run(
    typeof name === 'string' ? name.slice(0, 80) : null,
    typeof digestEnabled === 'boolean' ? Number(digestEnabled) : null,
    typeof digestLanguage === 'string' ? digestLanguage : null,
    req.user!.workspaceId
  );

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
