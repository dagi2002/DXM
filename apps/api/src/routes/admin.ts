/**
 * Admin routes — server-side only, no CORS, protected by x-admin-key header.
 * Mounted at /admin/workspaces in app.ts (before dashboardCors).
 *
 * PATCH /admin/workspaces/:id/plan — activate a workspace plan
 *   Used by operator for manual activation (Telegram / offline payments).
 *   curl -X PATCH /admin/workspaces/<id>/plan \
 *     -H "x-admin-key: $ADMIN_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"plan":"starter"}'
 */
import { Router }                   from 'express';
import type { Request, Response }   from 'express';
import { timingSafeEqual }          from 'node:crypto';
import { z }                        from 'zod';
import { db }                       from '../db/index.js';
import { validate }                 from '../middleware/validate.js';
import { activateWorkspacePlan }    from '../lib/billing.js';
import { reconcileUpgradeRequests } from '../lib/workspaceSignals.js';

const router = Router();

const activatePlanSchema = z.object({
  plan: z.enum(['starter', 'pro']),
});

function checkAdminKey(req: Request, res: Response): boolean {
  const secret = process.env.ADMIN_SECRET?.trim();
  if (!secret) {
    res.status(503).json({ error: 'Admin key not configured on this server' });
    return false;
  }
  const provided = req.headers['x-admin-key'];
  if (typeof provided !== 'string') {
    res.status(401).json({ error: 'Missing x-admin-key header' });
    return false;
  }
  const a = Buffer.from(secret);
  const b = Buffer.from(provided);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    res.status(401).json({ error: 'Invalid admin key' });
    return false;
  }
  return true;
}

router.patch('/:id/plan', validate(activatePlanSchema), (req, res) => {
  if (!checkAdminKey(req, res)) return;

  const workspaceId = req.params.id;
  const { plan }    = req.body as { plan: 'starter' | 'pro' };

  const workspace = db
    .prepare<[string], { id: string }>('SELECT id FROM workspaces WHERE id = ?')
    .get(workspaceId);
  if (!workspace) {
    return res.status(404).json({ error: 'Workspace not found' });
  }

  activateWorkspacePlan(workspaceId, plan);
  reconcileUpgradeRequests(workspaceId);

  console.info(`[admin] Plan activated: workspace=${workspaceId} plan=${plan}`);
  return res.json({ ok: true, workspaceId, plan });
});

export default router;
