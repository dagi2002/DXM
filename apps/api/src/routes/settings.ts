import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { listWorkspaceSites } from '../services/siteAnalytics.js';
import { sendTelegramTest } from '../services/telegram.js';
import {
  managedSitesBandValues,
  reportingWorkflowValues,
  agencyTypeValues,
} from '../schemas/authSchemas.js';
import {
  BILLING_FEATURES,
  getWorkspacePlanState,
  planSupportsFeature,
  requirePlanFeature,
  sendFeatureNotInPlan,
} from '../lib/billing.js';
import {
  getWorkspaceFitProfile,
  getWorkspaceJourneyMilestones,
  recordJourneyMilestone,
  upsertWorkspaceFitProfile,
} from '../lib/workspaceSignals.js';

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
    agencyType: z.enum(agencyTypeValues).nullable().optional(),
    managedSitesBand: z.enum(managedSitesBandValues).nullable().optional(),
    reportingWorkflow: z.enum(reportingWorkflowValues).nullable().optional(),
    evaluationReason: z.string().trim().max(240).nullable().optional(),
    emailNotificationsEnabled: z.boolean().optional(),
  })
  .refine(
    (value) =>
      typeof value.name !== 'undefined' ||
      typeof value.digestEnabled !== 'undefined' ||
      typeof value.digestLanguage !== 'undefined' ||
      typeof value.agencyType !== 'undefined' ||
      typeof value.managedSitesBand !== 'undefined' ||
      typeof value.reportingWorkflow !== 'undefined' ||
      typeof value.evaluationReason !== 'undefined' ||
      typeof value.emailNotificationsEnabled !== 'undefined',
    {
      message: 'At least one setting is required',
    }
  );

// GET /settings
router.get('/', (req, res) => {
  const workspace = db.prepare(`
    SELECT id, name, plan, billing_status, telegram_chat_id, digest_enabled, digest_language,
           email_notifications_enabled, created_at,
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
      emailNotificationsEnabled: Boolean(workspace.email_notifications_enabled),
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
    fitProfile: getWorkspaceFitProfile(req.user!.workspaceId),
    journey: getWorkspaceJourneyMilestones(req.user!.workspaceId),
  });
});

// PATCH /settings — update workspace name
router.patch('/', validate(workspaceSettingsSchema), (req, res) => {
  const {
    name,
    digestEnabled,
    digestLanguage,
    agencyType,
    managedSitesBand,
    reportingWorkflow,
    evaluationReason,
    emailNotificationsEnabled,
  } = req.body;
  const planState = getWorkspacePlanState(req.user!.workspaceId);
  const touchesPaidDigestSetting =
    digestEnabled === true || typeof digestLanguage === 'string';
  const touchesFitProfile =
    typeof agencyType !== 'undefined' ||
    typeof managedSitesBand !== 'undefined' ||
    typeof reportingWorkflow !== 'undefined' ||
    typeof evaluationReason !== 'undefined';

  if (touchesPaidDigestSetting && !planSupportsFeature(planState.plan, BILLING_FEATURES.digest)) {
    return sendFeatureNotInPlan(res, planState.plan, BILLING_FEATURES.digest);
  }

  db.prepare(`
    UPDATE workspaces
    SET
      name = COALESCE(?, name),
      digest_enabled = COALESCE(?, digest_enabled),
      digest_language = COALESCE(?, digest_language),
      email_notifications_enabled = COALESCE(?, email_notifications_enabled)
    WHERE id = ?
  `).run(
    typeof name === 'string' ? name.slice(0, 80) : null,
    typeof digestEnabled === 'boolean' ? Number(digestEnabled) : null,
    typeof digestLanguage === 'string' ? digestLanguage : null,
    typeof emailNotificationsEnabled === 'boolean' ? Number(emailNotificationsEnabled) : null,
    req.user!.workspaceId
  );

  if (touchesFitProfile) {
    upsertWorkspaceFitProfile(req.user!.workspaceId, {
      agencyType: typeof agencyType !== 'undefined' ? agencyType : undefined,
      managedSitesBand:
        typeof managedSitesBand !== 'undefined' ? managedSitesBand : undefined,
      reportingWorkflow:
        typeof reportingWorkflow !== 'undefined' ? reportingWorkflow : undefined,
      evaluationReason:
        typeof evaluationReason !== 'undefined'
          ? typeof evaluationReason === 'string' && evaluationReason.trim().length > 0
            ? evaluationReason.trim()
            : null
          : undefined,
    });
  }

  return res.json({ ok: true });
});

router.post('/milestones/:milestoneKey', (req, res) => {
  const milestoneKey = req.params.milestoneKey;

  if (
    milestoneKey !== 'replay_viewed' &&
    milestoneKey !== 'alert_reviewed' &&
    milestoneKey !== 'report_exported'
  ) {
    return res.status(400).json({ error: 'Unknown milestone' });
  }

  const mappedKey =
    milestoneKey === 'replay_viewed'
      ? 'replay_viewed'
      : milestoneKey === 'alert_reviewed'
      ? 'alert_reviewed'
      : 'report_exported';

  const journey = recordJourneyMilestone(req.user!.workspaceId, mappedKey);
  return res.status(201).json(journey);
});

// PUT /settings/telegram — save Telegram credentials
router.put('/telegram', requirePlanFeature(BILLING_FEATURES.telegram), validate(telegramSchema), (req, res) => {
  const { botToken, chatId } = req.body;
  db.prepare('UPDATE workspaces SET telegram_bot_token = ?, telegram_chat_id = ? WHERE id = ?')
    .run(botToken, chatId, req.user!.workspaceId);
  return res.json({ ok: true });
});

// POST /settings/telegram/test — send a test message
router.post('/telegram/test', requirePlanFeature(BILLING_FEATURES.telegram), async (req, res) => {
  const ws = db.prepare('SELECT telegram_bot_token, telegram_chat_id FROM workspaces WHERE id = ?')
    .get(req.user!.workspaceId) as any;
  if (!ws?.telegram_bot_token || !ws?.telegram_chat_id) {
    return res.status(400).json({ error: 'Telegram not configured — save credentials first.' });
  }
  const ok = await sendTelegramTest(ws.telegram_bot_token, ws.telegram_chat_id);
  return ok ? res.json({ ok: true }) : res.status(502).json({ error: 'Telegram delivery failed — check your bot token and chat ID.' });
});

export default router;
