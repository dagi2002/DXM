/**
 * DXM Pulse — Billing Routes
 * UI stubs and Chapa/Telebirr webhook receiver.
 * TODO: Wire CHAPA_SECRET_KEY and CHAPA_WEBHOOK_SECRET when keys are obtained.
 */
import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /billing/plans — public plan listing
router.get('/plans', (_req, res) => {
  res.json([
    {
      id: 'free',
      name: 'Free',
      priceEtb: 0,
      sessions: 0,
      sites: 1,
      retention: 30,
      features: ['Basic heatmaps', 'Session list', '30-day data'],
    },
    {
      id: 'starter',
      name: 'Starter',
      priceEtb: 499,
      sessions: 10000,
      sites: 3,
      retention: 90,
      features: ['Everything in Free', 'Session replay', 'Telegram alerts', 'Funnel analysis'],
    },
    {
      id: 'pro',
      name: 'Pro',
      priceEtb: 1499,
      sessions: 50000,
      sites: 10,
      retention: 365,
      features: ['Everything in Starter', 'Core Web Vitals', 'Custom funnels', 'Priority support'],
    },
  ]);
});

// GET /billing/current — current workspace plan
router.get('/current', requireAuth, (req, res) => {
  const ws = db.prepare('SELECT plan, billing_status FROM workspaces WHERE id = ?')
    .get(req.user!.workspaceId) as any;
  return res.json(ws || { plan: 'free', billing_status: 'active' });
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
