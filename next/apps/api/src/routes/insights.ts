import {
  FunnelConfig,
  InsightsQuery,
  canManage,
  canWorkOnFixes,
  type SiteFunnel,
  type SiteInsights,
  type WeekSummary,
} from '@pulse/contracts';
import { and, auditLog, eq, isNull, newId, siteFunnels, sites, withOrg, type Tx } from '@pulse/db';
import { loadFunnel, loadSiteInsights, loadWeekSummary, saveFunnel } from '@pulse/insights/db';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { AppDeps } from '../app';
import { requireOrg, requireSession } from '../guards';
import { forbidden, notFound, type AppEnv } from '../http';

/** Client viewers see no sites until site sharing ships, so a site's insights don't exist for them. */
const requireSiteViewer = createMiddleware<AppEnv>(async (c, next) => {
  if (!canWorkOnFixes(c.get('role'))) throw notFound('Site');
  await next();
});

const requireFunnelEditor = createMiddleware<AppEnv>(async (c, next) => {
  if (!canManage(c.get('role'))) throw forbidden();
  await next();
});

async function assertSite(tx: Tx, id: string) {
  const [row] = await tx
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, id), isNull(sites.deletedAt)))
    .limit(1);
  if (!row) throw notFound('Site');
}

const audit = (
  tx: Tx,
  c: Context<AppEnv>,
  action: string,
  siteId: string,
  metadata: Record<string, unknown>,
) =>
  tx.insert(auditLog).values({
    id: newId('aud'),
    orgId: c.get('orgId')!,
    actorUserId: c.get('user')?.id ?? null,
    action,
    targetType: 'site',
    targetId: siteId,
    metadata,
    ip: c.get('clientIp'),
  });

/**
 * Site insights and funnel config, mounted under `/api/v1/sites` (the parent router has already
 * loaded the session and the org). Everything reads daily rollups — never raw events — inside
 * the caller's org scope, so another org's site ids are a plain 404.
 */
export function siteInsightRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();

  r.get('/:id/insights', requireSiteViewer, async (c) => {
    const { range } = InsightsQuery.parse(c.req.query());
    const body = await withOrg(deps.db, c.get('orgId')!, async (tx) => {
      await assertSite(tx, c.req.param('id'));
      return loadSiteInsights(tx, c.req.param('id'), range);
    });
    return c.json(body satisfies SiteInsights);
  });

  r.get('/:id/funnel', requireSiteViewer, async (c) => {
    const body = await withOrg(deps.db, c.get('orgId')!, async (tx): Promise<SiteFunnel> => {
      await assertSite(tx, c.req.param('id'));
      const f = await loadFunnel(tx, c.req.param('id'));
      return { funnel: f?.config ?? null, updatedAt: f ? f.updatedAt.toISOString() : null };
    });
    return c.json(body);
  });

  /** Owners and admins set the funnel; its rollups are recomputed by the next insights sweep. */
  r.put('/:id/funnel', requireSiteViewer, requireFunnelEditor, async (c) => {
    const config = FunnelConfig.parse(await c.req.json());
    const id = c.req.param('id');
    const body = await withOrg(deps.db, c.get('orgId')!, async (tx): Promise<SiteFunnel> => {
      await assertSite(tx, id);
      const saved = await saveFunnel(tx, c.get('orgId')!, id, config, c.get('user')?.id ?? null);
      await audit(tx, c, 'funnel.updated', id, { template: config.template, steps: config.steps.length });
      return { funnel: config, updatedAt: saved.updatedAt.toISOString() };
    });
    return c.json(body);
  });

  r.delete('/:id/funnel', requireSiteViewer, requireFunnelEditor, async (c) => {
    const id = c.req.param('id');
    await withOrg(deps.db, c.get('orgId')!, async (tx) => {
      await assertSite(tx, id);
      const gone = await tx
        .delete(siteFunnels)
        .where(eq(siteFunnels.siteId, id))
        .returning({ id: siteFunnels.siteId });
      if (gone.length) await audit(tx, c, 'funnel.deleted', id, {});
    });
    return c.body(null, 204);
  });

  return r;
}

/** Org-wide insights: Today's "this week" panel. */
export function insightRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();
  r.use('*', requireSession(deps), requireOrg(deps));
  r.get('/week', async (c) => {
    if (!canWorkOnFixes(c.get('role'))) throw forbidden();
    const body = await withOrg(deps.db, c.get('orgId')!, (tx) => loadWeekSummary(tx));
    return c.json(body satisfies WeekSummary);
  });
  return r;
}
