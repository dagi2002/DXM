import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getOverviewAiBriefOrNull } from '../services/ai/index.js';
import { buildWorkspaceOverview } from '../services/siteAnalytics.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const overview = buildWorkspaceOverview(req.user!.workspaceId);
  const ai = await getOverviewAiBriefOrNull(req.user!.workspaceId, overview);

  return res.json(ai ? { ...overview, ai } : overview);
});

export default router;
