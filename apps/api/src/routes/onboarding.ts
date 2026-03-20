import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  createSiteHandler,
  createSiteSchema,
  listSitesHandler,
  verifySiteHandler,
} from './sites.js';

const router = Router();
router.use(requireAuth);

// Compatibility-only alias for older onboarding install flows.
// New product code should continue to use /sites as the primary contract.
router.get('/sites', listSitesHandler);
router.post('/sites', validate(createSiteSchema), createSiteHandler);
router.get('/sites/:id/verify', verifySiteHandler);

export default router;
