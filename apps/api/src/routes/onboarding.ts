import { Router } from 'express';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();
router.use(requireAuth);

const createSiteSchema = z.object({
  name: z.string().min(1).max(80),
  domain: z.string().min(3).max(255),
});

// POST /onboarding/sites — add a site and get the install snippet
router.post('/sites', validate(createSiteSchema), (req, res) => {
  const { name, domain } = req.body;
  const workspaceId = req.user!.workspaceId;
  const siteId = 'site_' + nanoid(16);
  const siteKey = nanoid(12);   // short, URL-safe key used as data-site-id

  db.prepare(`
    INSERT INTO sites (id, workspace_id, name, domain, site_key)
    VALUES (?, ?, ?, ?, ?)
  `).run(siteId, workspaceId, name, domain, siteKey);

  const sdkCdnUrl = process.env.SDK_CDN_URL || 'https://cdn.dxmpulse.com/dxm.js';
  const snippet = `<script src="${sdkCdnUrl}" data-site-id="${siteKey}" async></script>`;

  return res.status(201).json({ siteId, siteKey, snippet });
});

// GET /onboarding/sites/:id/verify — check for first event
router.get('/sites/:id/verify', (req, res) => {
  const site = db.prepare('SELECT id FROM sites WHERE id = ? AND workspace_id = ?')
    .get(req.params.id, req.user!.workspaceId) as any;
  if (!site) return res.status(404).json({ error: 'Site not found' });

  const recent = db.prepare(`
    SELECT COUNT(*) as c FROM sessions
    WHERE site_id = ? AND created_at >= datetime('now', '-10 minutes')
  `).get(req.params.id) as any;

  return res.json({
    verified: (recent?.c || 0) > 0,
    sessionCount: recent?.c || 0,
  });
});

// GET /onboarding/sites — list workspace sites
router.get('/sites', (req, res) => {
  const sites = db.prepare('SELECT id, name, domain, site_key, created_at FROM sites WHERE workspace_id = ?')
    .all(req.user!.workspaceId);
  return res.json(sites);
});

export default router;
