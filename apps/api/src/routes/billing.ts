/**
 * DXM Pulse — Billing Routes
 * UI stubs and Chapa/Telebirr webhook receiver.
 * TODO: Wire CHAPA_SECRET_KEY and CHAPA_WEBHOOK_SECRET when keys are obtained.
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { DXM_PLAN_CATALOG } from '../../../../packages/contracts/index.js';
import { getWorkspaceBillingSnapshot } from '../lib/billing.js';
import { createUpgradeRequest, listUpgradeRequests } from '../lib/workspaceSignals.js';

const router = Router();
const upgradeRequestSchema = z.object({
  requestedPlan: z.enum(['starter', 'pro']),
  source: z.enum([
    'site_limit',
    'replay',
    'funnels',
    'user_flow',
    'alerts',
    'reports',
    'telegram',
    'digest',
    'direct_billing',
  ]),
  notes: z.string().trim().max(280).optional(),
});

const planRank = (plan: string) => {
  if (plan === 'pro') return 3;
  if (plan === 'starter') return 2;
  return 1;
};

// GET /billing/plans — public plan listing
router.get('/plans', (_req, res) => {
  res.json(
    DXM_PLAN_CATALOG.map((plan) => ({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      priceEtb: plan.priceEtb,
      sessions: plan.sessions,
      sessionsLabel: plan.sessionsLabel,
      sites: plan.siteLimit,
      siteLimitLabel: plan.siteLimitLabel,
      features: plan.features,
      highlight: plan.highlight,
    })),
  );
});

// GET /billing/current — current workspace plan
router.get('/current', requireAuth, (req, res) => {
  const snapshot = getWorkspaceBillingSnapshot(req.user!.workspaceId);
  return res.json({
    plan: snapshot.plan,
    billing_status: snapshot.billingStatus,
    siteCount: snapshot.siteCount,
    siteLimit: snapshot.siteLimit,
  });
});

router.get('/upgrade-requests', requireAuth, (req, res) => {
  return res.json(listUpgradeRequests(req.user!.workspaceId));
});

router.post('/upgrade-requests', requireAuth, validate(upgradeRequestSchema), (req, res) => {
  const snapshot = getWorkspaceBillingSnapshot(req.user!.workspaceId);
  const { requestedPlan, source, notes } = req.body;

  if (planRank(requestedPlan) <= planRank(snapshot.plan)) {
    return res.status(400).json({
      error: 'This workspace is already on that plan or higher.',
      code: 'plan_already_active',
    });
  }

  const requestRecord = createUpgradeRequest({
    workspaceId: req.user!.workspaceId,
    requestedByUserId: req.user!.id,
    requestedPlan,
    source,
    notes:
      typeof notes === 'string' && notes.trim().length > 0 ? notes.trim() : null,
  });

  return res.status(201).json(requestRecord);
});

/**
 * POST /billing/chapa/webhook
 * Receives Chapa payment notifications.
 * STUB: verify HMAC signature and update workspace plan when keys are available.
 */
router.post('/chapa/webhook', (req, res) => {
  // TODO: Verify HMAC — const hash = createHmac('sha256', process.env.CHAPA_WEBHOOK_SECRET!).update(raw).digest('hex');
  // TODO: Parse tx_ref to extract workspaceId + plan
  // TODO: db.prepare('UPDATE workspaces SET plan=?, billing_status=? WHERE id=?').run(plan, 'active', workspaceId);
  console.log('[billing] Chapa webhook received:', JSON.stringify(req.body));
  // Always return 200 to prevent Chapa from retrying
  return res.sendStatus(200);
});

export default router;
