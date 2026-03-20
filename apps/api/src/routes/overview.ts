import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { buildWorkspaceOverview } from '../services/siteAnalytics.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  return res.json(buildWorkspaceOverview(req.user!.workspaceId));
});

export default router;
