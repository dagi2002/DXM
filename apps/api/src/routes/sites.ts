import { Router, type RequestHandler } from 'express';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { getSiteAiBriefOrNull } from '../services/ai/index.js';
import {
  getSiteDetail,
  getSiteJourney,
  getSiteVerification,
  getWebVitalsPercentiles,
  listWorkspaceSites,
} from '../services/siteAnalytics.js';
import { getWorkspaceBillingSnapshot, sendPlanLimitReached } from '../lib/billing.js';

const router = Router();
router.use(requireAuth);

export const createSiteSchema = z.object({
  name: z.string().trim().min(1).max(80),
  domain: z.string().trim().min(3).max(255),
});

const updateSiteSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    domain: z.string().trim().min(3).max(255).optional(),
  })
  .refine((value) => typeof value.name !== 'undefined' || typeof value.domain !== 'undefined', {
    message: 'At least one field is required',
  });

const normalizeDomain = (domain: string) => domain.replace(/^https?:\/\//i, '').replace(/\/$/, '');

export const listSitesHandler: RequestHandler = (req, res) => {
  return res.json(listWorkspaceSites(req.user!.workspaceId));
};

export const createSiteHandler: RequestHandler = (req, res) => {
  const workspaceId = req.user!.workspaceId;
  const snapshot = getWorkspaceBillingSnapshot(workspaceId);

  if (snapshot.siteCount >= snapshot.siteLimit) {
    return sendPlanLimitReached(res, snapshot);
  }

  const siteId = 'site_' + nanoid(16);
  const siteKey = nanoid(12);
  const name = req.body.name.trim();
  const domain = normalizeDomain(req.body.domain);

  db.prepare(
    `
      INSERT INTO sites (id, workspace_id, name, domain, site_key)
      VALUES (?, ?, ?, ?, ?)
    `
  ).run(siteId, workspaceId, name, domain, siteKey);

  const detail = getSiteDetail(workspaceId, siteId);
  return res.status(201).json(detail);
};

router.patch('/:id', validate(updateSiteSchema), (req, res) => {
  const workspaceId = req.user!.workspaceId;
  const current = db
    .prepare('SELECT id, name, domain FROM sites WHERE workspace_id = ? AND id = ?')
    .get(workspaceId, req.params.id) as { id: string; name: string; domain: string } | undefined;

  if (!current) return res.status(404).json({ error: 'Client site not found' });

  const nextName = typeof req.body.name === 'string' ? req.body.name.trim() : current.name;
  const nextDomain =
    typeof req.body.domain === 'string' ? normalizeDomain(req.body.domain) : current.domain;

  db.prepare('UPDATE sites SET name = ?, domain = ? WHERE id = ? AND workspace_id = ?').run(
    nextName,
    nextDomain,
    req.params.id,
    workspaceId
  );

  return res.json(getSiteDetail(workspaceId, req.params.id));
});

router.delete('/:id', (req, res) => {
  const workspaceId = req.user!.workspaceId;
  const siteId = req.params.id;
  const current = db
    .prepare('SELECT id FROM sites WHERE workspace_id = ? AND id = ?')
    .get(workspaceId, siteId) as { id: string } | undefined;

  if (!current) return res.status(404).json({ error: 'Client site not found' });

  const blockers = {
    sessions:
      (
        db
          .prepare<[string, string], { count: number }>(
            'SELECT COUNT(*) as count FROM sessions WHERE workspace_id = ? AND site_id = ?',
          )
          .get(workspaceId, siteId)?.count ?? 0
      ),
    replays:
      (
        db
          .prepare<[string, string], { count: number }>(
            `
              SELECT COUNT(*) as count
              FROM session_replays sr
              JOIN sessions s ON s.id = sr.session_id
              WHERE s.workspace_id = ? AND s.site_id = ?
            `,
          )
          .get(workspaceId, siteId)?.count ?? 0
      ),
    alerts:
      (
        db
          .prepare<[string, string], { count: number }>(
            'SELECT COUNT(*) as count FROM alerts WHERE workspace_id = ? AND site_id = ?',
          )
          .get(workspaceId, siteId)?.count ?? 0
      ),
    funnels:
      (
        db
          .prepare<[string, string], { count: number }>(
            'SELECT COUNT(*) as count FROM funnels WHERE workspace_id = ? AND site_id = ?',
          )
          .get(workspaceId, siteId)?.count ?? 0
      ),
  };

  if (Object.values(blockers).some((count) => count > 0)) {
    return res.status(409).json({
      error: 'Client site cannot be deleted because dependent data exists.',
      blockers,
    });
  }

  db.prepare('DELETE FROM sites WHERE workspace_id = ? AND id = ?').run(workspaceId, siteId);
  return res.status(204).send();
});

export const verifySiteHandler: RequestHandler = (req, res) => {
  const verification = getSiteVerification(req.user!.workspaceId, req.params.id);
  if (!verification) return res.status(404).json({ error: 'Client site not found' });
  return res.json(verification);
};

router.get('/', listSitesHandler);
router.post('/', validate(createSiteSchema), createSiteHandler);
router.get('/:id/verify', verifySiteHandler);

// Core Web Vitals — portfolio-level (all sites) and site-scoped.
// Query params: range=24h|7d|30d, device=all|desktop|mobile|tablet.
const vitalsQuerySchema = z.object({
  range: z.enum(['24h', '7d', '30d']).optional(),
  device: z.enum(['all', 'desktop', 'mobile', 'tablet']).optional(),
});

router.get('/vitals', (req, res) => {
  const parse = vitalsQuerySchema.safeParse(req.query);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid query', details: parse.error.flatten() });
  }
  const data = getWebVitalsPercentiles(
    req.user!.workspaceId,
    null,
    parse.data.range ?? '7d',
    parse.data.device ?? 'all',
  );
  return res.json(data);
});

router.get('/:id/vitals', (req, res) => {
  const parse = vitalsQuerySchema.safeParse(req.query);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid query', details: parse.error.flatten() });
  }
  // Validate the site belongs to the workspace before exposing any data.
  const site = db
    .prepare('SELECT id FROM sites WHERE workspace_id = ? AND id = ?')
    .get(req.user!.workspaceId, req.params.id) as { id: string } | undefined;
  if (!site) return res.status(404).json({ error: 'Client site not found' });

  const data = getWebVitalsPercentiles(
    req.user!.workspaceId,
    req.params.id,
    parse.data.range ?? '7d',
    parse.data.device ?? 'all',
  );
  return res.json(data);
});

// Auto journey map — top paths through a site (range=24h|7d|30d).
const journeyQuerySchema = z.object({
  range: z.enum(['24h', '7d', '30d']).optional(),
});

router.get('/:id/journey', (req, res) => {
  const parse = journeyQuerySchema.safeParse(req.query);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid query', details: parse.error.flatten() });
  }
  const site = db
    .prepare('SELECT id FROM sites WHERE workspace_id = ? AND id = ?')
    .get(req.user!.workspaceId, req.params.id) as { id: string } | undefined;
  if (!site) return res.status(404).json({ error: 'Client site not found' });

  const data = getSiteJourney(req.user!.workspaceId, req.params.id, parse.data.range ?? '7d');
  return res.json(data);
});

router.get('/:id/overview', (req, res) => {
  const detail = getSiteDetail(req.user!.workspaceId, req.params.id);
  if (!detail) return res.status(404).json({ error: 'Client site not found' });
  return res.json(detail);
});

router.get('/:id', async (req, res) => {
  const detail = getSiteDetail(req.user!.workspaceId, req.params.id);
  if (!detail) return res.status(404).json({ error: 'Client site not found' });
  const ai = await getSiteAiBriefOrNull(req.user!.workspaceId, detail);
  return res.json(ai ? { ...detail, ai } : detail);
});

export default router;
