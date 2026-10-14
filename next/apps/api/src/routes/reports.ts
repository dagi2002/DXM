import {
  ReportCreate,
  ReportListQuery,
  ReportShareCreate,
  ReportSnapshot,
  canWorkOnReports,
  type ReportDetail,
  type ReportList,
  type ReportShare,
  type ReportShareCreated,
  type ReportSummary,
} from '@pulse/contracts';
import {
  and,
  asc,
  auditLog,
  desc,
  eq,
  isNull,
  newId,
  reportShares,
  reports,
  sites,
  sql,
  user,
  withOrg,
  type ReportShareRow,
  type Tx,
} from '@pulse/db';
import {
  ReportSiteGoneError,
  buildReportSnapshot,
  hashShareToken,
  isFuturePeriod,
  newShareToken,
} from '@pulse/reports';
import { Hono, type Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { AppDeps } from '../app';
import { requireOrg, requireSession } from '../guards';
import { ApiError, forbidden, notFound, type AppEnv } from '../http';

const DAY_MS = 86_400_000;

export function toShareDto(row: ReportShareRow, now = new Date()): ReportShare {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
    active: !row.revokedAt && row.expiresAt > now,
  };
}

const activeShares = sql<number>`(
  select count(*)::int from ${reportShares}
   where ${reportShares.reportId} = ${reports.id}
     and ${reportShares.revokedAt} is null and ${reportShares.expiresAt} > now()
)`;

const summaryColumns = {
  id: reports.id,
  siteId: reports.siteId,
  siteName: sites.name,
  siteDomain: sites.domain,
  period: reports.period,
  source: reports.source,
  snapshot: reports.snapshot,
  createdAt: reports.createdAt,
  createdByName: user.name,
  activeShares,
};

type SummaryRow = {
  id: string;
  siteId: string;
  siteName: string;
  siteDomain: string;
  period: string;
  source: 'auto' | 'manual';
  snapshot: Record<string, unknown>;
  createdAt: Date;
  createdByName: string | null;
  activeShares: number;
};

const toSummary = (r: SummaryRow): ReportSummary => ({
  id: r.id,
  siteId: r.siteId,
  siteName: r.siteName,
  siteDomain: r.siteDomain,
  period: r.period,
  source: r.source,
  partial: r.snapshot.partial === true,
  createdAt: r.createdAt.toISOString(),
  createdByName: r.createdByName ?? null,
  activeShares: Number(r.activeShares),
});

function summaries(tx: Tx) {
  return tx
    .select(summaryColumns)
    .from(reports)
    .innerJoin(sites, eq(sites.id, reports.siteId))
    .leftJoin(user, eq(user.id, reports.createdBy))
    .$dynamic();
}

async function loadDetail(tx: Tx, id: string): Promise<ReportDetail> {
  const [row] = await summaries(tx)
    .where(and(eq(reports.id, id), isNull(sites.deletedAt)))
    .limit(1);
  if (!row) throw notFound('Report');
  const shares = await tx
    .select()
    .from(reportShares)
    .where(eq(reportShares.reportId, id))
    .orderBy(desc(reportShares.createdAt), asc(reportShares.id));
  const now = new Date();
  return {
    report: { ...toSummary(row), snapshot: ReportSnapshot.parse(row.snapshot) },
    shares: shares.map((s) => toShareDto(s, now)),
  };
}

/** Client viewers see reports through share links only; the reports workspace is the team's. */
const requireTeam = createMiddleware<AppEnv>(async (c, next) => {
  if (!canWorkOnReports(c.get('role'))) throw forbidden();
  await next();
});

const audit = (tx: Tx, c: Context<AppEnv>, action: string, targetId: string, metadata = {}) =>
  tx.insert(auditLog).values({
    id: newId('aud'),
    orgId: c.get('orgId')!,
    actorUserId: c.get('user')?.id ?? null,
    action,
    targetType: 'report',
    targetId,
    metadata,
    ip: c.get('clientIp'),
  });

/**
 * Client reports. Everything runs in the caller's org scope (RLS), so another org's report or
 * share ids don't exist here: 404, never 403.
 */
export function reportRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();
  r.use('*', requireSession(deps), requireOrg(deps), requireTeam);

  r.get('/', async (c) => {
    const q = ReportListQuery.parse(c.req.query());
    const rows = await withOrg(deps.db, c.get('orgId')!, (tx) =>
      summaries(tx)
        .where(and(isNull(sites.deletedAt), q.siteId ? eq(reports.siteId, q.siteId) : undefined))
        .orderBy(desc(reports.period), desc(reports.createdAt), asc(reports.id))
        .limit(200),
    );
    const body: ReportList = { reports: rows.map(toSummary) };
    return c.json(body);
  });

  /** "Create report": snapshot a site's month now. The current month makes a partial report. */
  r.post('/', async (c) => {
    const input = ReportCreate.parse(await c.req.json());
    const now = new Date();
    if (isFuturePeriod(input.period, now)) {
      throw new ApiError(400, 'validation_failed', 'That month has not started yet', [
        { path: 'period', message: 'future_period' },
      ]);
    }
    const orgId = c.get('orgId')!;
    const body = await withOrg(deps.db, orgId, async (tx) => {
      let snapshot;
      try {
        snapshot = await buildReportSnapshot(tx, { siteId: input.siteId, period: input.period, now });
      } catch (err) {
        if (err instanceof ReportSiteGoneError) throw notFound('Site');
        throw err;
      }
      const id = newId('rpt');
      await tx.insert(reports).values({
        id,
        orgId,
        siteId: input.siteId,
        period: input.period,
        source: 'manual',
        snapshot,
        createdBy: c.get('user')!.id,
      });
      await audit(tx, c, 'report.created', id, { siteId: input.siteId, period: input.period });
      return loadDetail(tx, id);
    });
    return c.json(body, 201);
  });

  r.get('/:id', async (c) => {
    const body = await withOrg(deps.db, c.get('orgId')!, (tx) => loadDetail(tx, c.req.param('id')));
    return c.json(body);
  });

  /** Makes a share link. The token is in this response only; the database keeps its hash. */
  r.post('/:id/shares', async (c) => {
    const { expiresInDays } = ReportShareCreate.parse(await c.req.json().catch(() => ({})));
    const orgId = c.get('orgId')!;
    const body = await withOrg(deps.db, orgId, async (tx): Promise<ReportShareCreated> => {
      const { report } = await loadDetail(tx, c.req.param('id'));
      const token = newShareToken();
      const [row] = await tx
        .insert(reportShares)
        .values({
          id: newId('rsh'),
          orgId,
          reportId: report.id,
          tokenHash: hashShareToken(token),
          expiresAt: new Date(Date.now() + expiresInDays * DAY_MS),
          createdBy: c.get('user')!.id,
        })
        .returning();
      await audit(tx, c, 'report.shared', report.id, { shareId: row!.id, expiresInDays });
      return { share: toShareDto(row!), token };
    });
    return c.json(body, 201);
  });

  /** Turns a link off for good. Revoking twice is fine. */
  r.delete('/:id/shares/:shareId', async (c) => {
    await withOrg(deps.db, c.get('orgId')!, async (tx) => {
      const { report } = await loadDetail(tx, c.req.param('id'));
      const [share] = await tx
        .select()
        .from(reportShares)
        .where(and(eq(reportShares.id, c.req.param('shareId')), eq(reportShares.reportId, report.id)))
        .limit(1);
      if (!share) throw notFound('Share link');
      if (share.revokedAt) return;
      await tx.update(reportShares).set({ revokedAt: new Date() }).where(eq(reportShares.id, share.id));
      await audit(tx, c, 'report.share_revoked', report.id, { shareId: share.id });
    });
    return c.body(null, 204);
  });

  return r;
}
