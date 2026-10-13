import {
  ClickEvidence,
  FixImpact,
  FixListQuery,
  FixStatusUpdate,
  canTransitionFix,
  canWorkOnFixes,
  type Fix,
  type FixDetail,
  type FixList,
} from '@pulse/contracts';
import {
  and,
  asc,
  desc,
  eq,
  isNull,
  issueEvents,
  issues,
  newId,
  sites,
  sql,
  user,
  withOrg,
  type IssueRow,
  type Tx,
} from '@pulse/db';
import { createMiddleware } from 'hono/factory';
import { Hono } from 'hono';
import type { AppDeps } from '../app';
import { requireOrg, requireSession } from '../guards';
import { ApiError, forbidden, notFound, type AppEnv } from '../http';

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function toFixDto(row: IssueRow, site: { name: string; domain: string }): Fix {
  return {
    id: row.id,
    number: row.number,
    siteId: row.siteId,
    siteName: site.name,
    siteDomain: site.domain,
    kind: row.kind,
    severity: row.severity,
    status: row.status,
    // Parsed so a malformed row fails loudly here instead of breaking the UI.
    evidence: ClickEvidence.parse(row.evidence),
    impact: row.impact ? FixImpact.parse(row.impact) : null,
    firstSeen: row.firstSeen.toISOString(),
    lastSeen: row.lastSeen.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    fixedAt: iso(row.fixedAt),
    verifiedAt: iso(row.verifiedAt),
  };
}

/** Active work first, then critical before watch, then most recently seen. */
const STATUS_ORDER = sql`case ${issues.status} when 'open' then 0 when 'fixing' then 1 when 'fixed' then 2 when 'verified' then 3 else 4 end`;
const SEVERITY_ORDER = sql`case ${issues.severity} when 'critical' then 0 else 1 end`;

async function loadFix(tx: Tx, id: string): Promise<Fix> {
  const [row] = await tx
    .select({ issue: issues, siteName: sites.name, siteDomain: sites.domain })
    .from(issues)
    .innerJoin(sites, eq(sites.id, issues.siteId))
    .where(and(eq(issues.id, id), isNull(sites.deletedAt)))
    .limit(1);
  if (!row) throw notFound('Fix');
  return toFixDto(row.issue, { name: row.siteName, domain: row.siteDomain });
}

/** Client viewers only see shared reports; fixes are the team's working surface. */
const requireTeam = createMiddleware<AppEnv>(async (c, next) => {
  if (!canWorkOnFixes(c.get('role'))) throw forbidden();
  await next();
});

/**
 * The "what to fix" feed. Every query runs inside the caller's org scope (RLS), so another
 * org's fix ids simply don't exist here (404, never 403).
 */
export function fixRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();
  r.use('*', requireSession(deps), requireOrg(deps), requireTeam);

  r.get('/', async (c) => {
    const q = FixListQuery.parse(c.req.query());
    const rows = await withOrg(deps.db, c.get('orgId')!, (tx) =>
      tx
        .select({ issue: issues, siteName: sites.name, siteDomain: sites.domain })
        .from(issues)
        .innerJoin(sites, eq(sites.id, issues.siteId))
        .where(
          and(
            isNull(sites.deletedAt),
            q.status ? eq(issues.status, q.status) : undefined,
            q.siteId ? eq(issues.siteId, q.siteId) : undefined,
          ),
        )
        .orderBy(STATUS_ORDER, SEVERITY_ORDER, desc(issues.lastSeen), asc(issues.number))
        .limit(q.limit),
    );
    const body: FixList = {
      fixes: rows.map((r) => toFixDto(r.issue, { name: r.siteName, domain: r.siteDomain })),
    };
    return c.json(body);
  });

  r.get('/:id', async (c) => {
    const body = await withOrg(deps.db, c.get('orgId')!, async (tx): Promise<FixDetail> => {
      const fix = await loadFix(tx, c.req.param('id'));
      const history = await tx
        .select({
          fromStatus: issueEvents.fromStatus,
          toStatus: issueEvents.toStatus,
          actorUserId: issueEvents.actorUserId,
          actorName: user.name,
          at: issueEvents.createdAt,
        })
        .from(issueEvents)
        .leftJoin(user, eq(user.id, issueEvents.actorUserId))
        .where(eq(issueEvents.issueId, fix.id))
        .orderBy(asc(issueEvents.createdAt), asc(issueEvents.id));
      return {
        fix,
        history: history.map((h) => ({ ...h, actorName: h.actorName ?? null, at: h.at.toISOString() })),
      };
    });
    return c.json(body);
  });

  r.patch('/:id', async (c) => {
    const { status } = FixStatusUpdate.parse(await c.req.json());
    const actor = c.get('user')!;
    const body = await withOrg(deps.db, c.get('orgId')!, async (tx) => {
      const current = await loadFix(tx, c.req.param('id'));
      if (current.status === status) return { fix: current };
      if (!canTransitionFix(current.status, status)) {
        throw new ApiError(409, 'conflict', `A fix that is ${current.status} can't be marked ${status}`, {
          from: current.status,
          to: status,
        });
      }
      const now = new Date();
      // Conditional on the status we read, so two people clicking at once can't both win.
      const updated = await tx
        .update(issues)
        .set({
          status,
          ...(status === 'fixed' ? { fixedAt: now, verifiedAt: null } : {}),
          ...(status === 'verified' ? { verifiedAt: now } : {}),
          ...(status === 'open' || status === 'fixing' ? { fixedAt: null, verifiedAt: null } : {}),
        })
        .where(and(eq(issues.id, current.id), eq(issues.status, current.status)))
        .returning({ id: issues.id });
      if (!updated.length) {
        throw new ApiError(
          409,
          'conflict',
          'This fix was just changed by someone else. Reload and try again.',
        );
      }
      await tx.insert(issueEvents).values({
        id: newId('ise'),
        orgId: c.get('orgId')!,
        issueId: current.id,
        actorUserId: actor.id,
        fromStatus: current.status,
        toStatus: status,
      });
      return { fix: await loadFix(tx, current.id) };
    });
    return c.json(body);
  });

  return r;
}
