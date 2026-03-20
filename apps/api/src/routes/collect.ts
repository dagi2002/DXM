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

const router = Router();

// POST /collect
router.post('/', collectLimiter, validate(collectSchema), (req, res) => {
  const payload = req.body as CollectRequest;

  const site = findCollectionSite(payload.siteId);
  if (!site) return res.status(404).json({ error: 'Unknown site key' });

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
