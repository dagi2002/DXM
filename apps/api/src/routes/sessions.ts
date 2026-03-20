import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  getSessionDetail,
  getSessionReplay,
  listSessionSummaries,
} from '../services/sessionReadModels.js';
import { BILLING_FEATURES, requirePlanFeature } from '../lib/billing.js';

const router = Router();
router.use(requireAuth);

// GET /sessions — list workspace sessions (summary read model)
router.get('/', (req, res) => {
  return res.json(listSessionSummaries(req.user!.workspaceId));
});

// GET /sessions/:id — session detail read model
router.get('/:id', (req, res) => {
  const session = getSessionDetail(req.user!.workspaceId, req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  return res.json(session);
});

// GET /sessions/:id/replay — rrweb replay data
router.get('/:id/replay', requirePlanFeature(BILLING_FEATURES.replay), (req, res) => {
  const replay = getSessionReplay(req.user!.workspaceId, req.params.id);
  if (!replay) return res.status(404).json({ error: 'No replay data for this session' });
  return res.json(replay);
});

export default router;
