/**
 * POST /collect — SDK data ingestion endpoint
 * Public (no auth token) — authenticated by site_key
 * Receives batched events from dxm.js
 *
 * POST /collect-replay/replay — rrweb replay chunks
 * Public — authenticated by site_key
 */
import { Router } from 'express';
import type {
  CollectReplayRequest,
  CollectRequest,
} from '../../../../packages/contracts/index.js';
import { validate } from '../middleware/validate.js';
import { collectLimiter } from '../middleware/rateLimiter.js';
import { collectSchema, collectReplaySchema } from '../schemas/collectSchema.js';
import { runAlertChecks } from '../services/alertEngine.js';
import {
  findCollectionSite,
  ingestReplayChunk,
  ingestSessionBatch,
} from '../services/sessionTracking.js';
import { db } from '../db/index.js';
import {
  getWorkspacePlanState,
  getWorkspaceSessionLimit,
  countWorkspaceSessionsLast30Days,
} from '../lib/billing.js';

const router = Router();

// POST /collect
router.post('/', collectLimiter, validate(collectSchema), (req, res) => {
  const payload = req.body as CollectRequest;

  const site = findCollectionSite(payload.siteId);
  if (!site) return res.status(404).json({ error: 'Unknown site key' });

  // Enforce session quota only for NEW sessions — continuation batches always pass through.
  // Mirrors ingestSessionBatch's own existence check (SELECT WHERE id = payload.sessionId).
  const isNewSession = !db
    .prepare<[string], { id: string }>('SELECT id FROM sessions WHERE id = ? LIMIT 1')
    .get(payload.sessionId);

  if (isNewSession) {
    const { plan } = getWorkspacePlanState(site.workspaceId);
    const limit    = getWorkspaceSessionLimit(plan);
    const current  = countWorkspaceSessionsLast30Days(site.workspaceId);
    if (current >= limit) {
      return res.status(403).json({
        error: 'Monthly session quota reached. Upgrade your plan to continue tracking.',
        code:  'session_quota_exceeded',
        plan,
        limit,
        current,
      });
    }
  }

  ingestSessionBatch(site, payload);

  // Fire alert checks asynchronously — do not await
  void runAlertChecks(site.workspaceId, site.id);

  return res.json({ ok: true });
});

// POST /collect-replay/replay — rrweb chunk ingestion
router.post('/replay', collectLimiter, validate(collectReplaySchema), (req, res) => {
  const payload = req.body as CollectReplayRequest;

  const site = findCollectionSite(payload.siteId);
  if (!site) return res.status(404).json({ error: 'Unknown site key' });

  const stored = ingestReplayChunk(site, payload);
  if (!stored) return res.status(404).json({ error: 'Session not found for this site' });

  return res.json({ ok: true, chunk: payload.chunkIndex });
});

export default router;
