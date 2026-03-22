/**
 * DXM Pulse — Billing Routes
 * Plan listing, upgrade requests, Chapa payment initiation and webhook.
 */
import { Router }                from 'express';
import { z }                     from 'zod';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { nanoid }                from 'nanoid';
import { requireAuth }           from '../middleware/auth.js';
import { validate }              from '../middleware/validate.js';
import { DXM_PLAN_CATALOG }      from '../../../../packages/contracts/index.js';
import {
  getWorkspaceBillingSnapshot,
  getWorkspacePlanState,
  activateWorkspacePlan,
  planRank,
}                                from '../lib/billing.js';
import {
  createUpgradeRequest,
  listUpgradeRequests,
  reconcileUpgradeRequests,
}                                from '../lib/workspaceSignals.js';
import { db }                    from '../db/index.js';

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

// ── Chapa payment flow ────────────────────────────────────────────────────────

const chapaInitiateSchema = z.object({
  requestedPlan: z.enum(['starter', 'pro']),
});

/**
 * POST /billing/chapa/initiate
 * Creates a Chapa transaction and returns a checkout URL.
 * Also records an upgrade_request row tagged with the tx_ref so the webhook can
 * look it up without decoding the tx_ref string.
 */
router.post('/chapa/initiate', requireAuth, validate(chapaInitiateSchema), async (req, res) => {
  const CHAPA_SECRET_KEY = process.env.CHAPA_SECRET_KEY?.trim();
  if (!CHAPA_SECRET_KEY) {
    return res.status(503).json({ error: 'Payment provider not configured on this server' });
  }

  const { requestedPlan } = req.body as { requestedPlan: 'starter' | 'pro' };
  const { workspaceId, id: userId } = req.user!;

  const txRef = `dxm${nanoid(16)}`; // alphanumeric-safe for Chapa tx_ref field

  const upgradeReq = createUpgradeRequest({
    workspaceId,
    requestedByUserId: userId,
    requestedPlan,
    source: 'direct_billing',
  });
  db.prepare('UPDATE upgrade_requests SET chapa_tx_ref = ? WHERE id = ?').run(txRef, upgradeReq.id);

  const plan         = DXM_PLAN_CATALOG.find(p => p.id === requestedPlan)!;
  const webOrigin    = process.env.WEB_ORIGIN    || 'http://localhost:5173';
  const apiPublicUrl = process.env.API_PUBLIC_URL || 'http://localhost:4000';

  let chapaResp: globalThis.Response;
  try {
    chapaResp = await fetch('https://api.chapa.co/v1/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${CHAPA_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount:       plan.priceEtb.toString(),
        currency:     'ETB',
        tx_ref:       txRef,
        return_url:   `${webOrigin}/billing?status=success`,
        callback_url: `${apiPublicUrl}/billing/chapa/webhook`,
        title:        `DXM Pulse ${plan.name}`,
        description:  plan.description,
      }),
    });
  } catch (err) {
    console.error('[billing] Chapa API unreachable:', err);
    return res.status(502).json({ error: 'Payment provider unreachable' });
  }

  if (!chapaResp.ok) {
    const body = await chapaResp.text();
    console.error('[billing] Chapa init error:', chapaResp.status, body);
    return res.status(502).json({ error: 'Payment provider returned an error' });
  }

  const data        = (await chapaResp.json()) as { data?: { checkout_url?: string } };
  const checkoutUrl = data?.data?.checkout_url;
  if (!checkoutUrl) {
    return res.status(502).json({ error: 'No checkout URL in provider response' });
  }

  return res.json({ checkoutUrl, txRef });
});

/**
 * POST /billing/chapa/webhook
 * Receives Chapa payment notifications.
 * Raw body is captured by express.raw() mounted in app.ts before express.json().
 * Verifies HMAC, looks up the upgrade_request by tx_ref, and activates the plan.
 */
router.post('/chapa/webhook', (req, res) => {
  const CHAPA_WEBHOOK_SECRET = process.env.CHAPA_WEBHOOK_SECRET?.trim();
  if (!CHAPA_WEBHOOK_SECRET) {
    console.error('[billing] CHAPA_WEBHOOK_SECRET not configured');
    return res.sendStatus(500);
  }

  // express.raw() is mounted first in app.ts for this exact path — req.body is a Buffer here
  if (!Buffer.isBuffer(req.body)) {
    console.error('[billing] Webhook body is not a Buffer — check app.ts middleware order');
    return res.sendStatus(400);
  }

  // Normalise header values to string | null (Express types: string | string[] | undefined)
  const asString = (v: string | string[] | undefined): string | null =>
    typeof v === 'string' ? v : null;

  const rawChapa  = asString(req.headers['chapa-signature']);
  const rawXChapa = asString(req.headers['x-chapa-signature']);

  // Both headers present but different → possible injection/tampering, reject
  if (rawChapa && rawXChapa && rawChapa !== rawXChapa) {
    console.warn('[billing] Webhook: conflicting chapa-signature and x-chapa-signature headers');
    return res.sendStatus(401);
  }

  const rawSig = rawChapa ?? rawXChapa;
  if (!rawSig) return res.sendStatus(401);

  const expected    = createHmac('sha256', CHAPA_WEBHOOK_SECRET).update(req.body).digest('hex');
  const expectedBuf = Buffer.from(expected, 'utf8');
  const providedBuf = Buffer.from(rawSig,   'utf8');
  if (expectedBuf.length !== providedBuf.length || !timingSafeEqual(expectedBuf, providedBuf)) {
    console.warn('[billing] Webhook HMAC mismatch — possible spoofed request');
    return res.sendStatus(401);
  }

  let event: { tx_ref?: unknown; status?: unknown };
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.sendStatus(400);
  }

  const { tx_ref, status } = event;

  if (status !== 'success') {
    return res.sendStatus(200); // pending/failed — acknowledge, do not activate
  }

  if (typeof tx_ref !== 'string' || !tx_ref) {
    console.warn('[billing] Webhook: missing or invalid tx_ref');
    return res.sendStatus(400);
  }

  const upgradeRow = db
    .prepare<[string], { workspace_id: string; requested_plan: string }>(
      'SELECT workspace_id, requested_plan FROM upgrade_requests WHERE chapa_tx_ref = ? LIMIT 1'
    )
    .get(tx_ref);

  if (!upgradeRow) {
    console.warn('[billing] Webhook: tx_ref not found in upgrade_requests:', tx_ref);
    return res.sendStatus(200); // unknown ref — return 200 to stop Chapa retries
  }

  const targetPlan  = upgradeRow.requested_plan === 'pro' ? 'pro' : ('starter' as const);
  const currentPlan = getWorkspacePlanState(upgradeRow.workspace_id).plan;

  // Idempotent: only activate if the workspace is below the target plan in the hierarchy
  if (planRank(currentPlan) < planRank(targetPlan)) {
    activateWorkspacePlan(upgradeRow.workspace_id, targetPlan);
    reconcileUpgradeRequests(upgradeRow.workspace_id);
    console.info(`[billing] Chapa webhook activated workspace=${upgradeRow.workspace_id} plan=${targetPlan}`);
  } else {
    console.info(`[billing] Chapa webhook: workspace=${upgradeRow.workspace_id} already on ${currentPlan} — no-op`);
  }

  return res.sendStatus(200);
});

export default router;
