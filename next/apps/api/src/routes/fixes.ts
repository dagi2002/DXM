import { aiConfigured } from '@pulse/config';
import {
  FixEvidence,
  FixImpact,
  FixSuggestion,
  FixVerification,
  FixListQuery,
  FixStatusUpdate,
  canTransitionFix,
  canWorkOnFixes,
  type Fix,
  type FixDetail,
  type FixList,
} from '@pulse/contracts';
import {
  aiArtifacts,
  and,
  asc,
  desc,
  inArray,
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
import { z } from 'zod';
import type { AppDeps } from '../app';
import { requireOrg, requireSession } from '../guards';
import { ApiError, forbidden, notFound, type AppEnv } from '../http';
import { replayIdsFor } from './replays';

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function toFixDto(
  row: IssueRow,
  site: { name: string; domain: string },
  suggestion: FixSuggestion | null = null,
  withReplay: Set<string> = new Set(),
): Fix {
  const evidence = FixEvidence.parse(row.evidence);
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
    evidence,
    impact: row.impact ? FixImpact.parse(row.impact) : null,
    verification: row.verification ? FixVerification.parse(row.verification) : null,
    suggestion,
    firstSeen: row.firstSeen.toISOString(),
    lastSeen: row.lastSeen.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    fixedAt: iso(row.fixedAt),
    verifiedAt: iso(row.verifiedAt),
    replayIds: ('sampleVisitIds' in evidence ? evidence.sampleVisitIds : []).filter((v) =>
      withReplay.has(`${row.siteId} ${v}`),
    ),
  };
}

/** Which of these issues' evidence visits have a playable replay (slice 4). */
const replaysOf = (tx: Tx, rows: IssueRow[]) =>
  replayIdsFor(
    tx,
    rows.map((r) => ({
      siteId: r.siteId,
      visitIds:
        z
          .array(z.string())
          .safeParse((r.evidence as { sampleVisitIds?: unknown } | null)?.sampleVisitIds).data ?? [],
    })),
  );

/** Active work first, then critical before watch, then most recently seen. */
const STATUS_ORDER = sql`case ${issues.status} when 'open' then 0 when 'fixing' then 1 when 'fixed' then 2 when 'verified' then 3 else 4 end`;
const SEVERITY_ORDER = sql`case ${issues.severity} when 'critical' then 0 else 1 end`;

/**
 * Latest AI suggestion per issue. Only read while AI is configured: with AI off, nothing AI-made
 * reaches the UI, even if older suggestions are stored.
 */
async function loadSuggestions(tx: Tx, ids: string[], enabled: boolean) {
  const out = new Map<string, FixSuggestion>();
  if (!enabled || !ids.length) return out;
  const rows = await tx
    .selectDistinctOn([aiArtifacts.issueId], {
      issueId: aiArtifacts.issueId,
      content: aiArtifacts.content,
      model: aiArtifacts.model,
      createdAt: aiArtifacts.createdAt,
    })
    .from(aiArtifacts)
    .where(and(inArray(aiArtifacts.issueId, ids), eq(aiArtifacts.kind, 'fix_suggestion')))
    .orderBy(aiArtifacts.issueId, desc(aiArtifacts.createdAt));
  for (const r of rows) {
    const parsed = FixSuggestion.safeParse({
      text: r.content.text,
      code: r.content.code ?? null,
      model: r.model,
      createdAt: r.createdAt.toISOString(),
    });
    if (parsed.success) out.set(r.issueId, parsed.data);
  }
  return out;
}

async function loadFix(tx: Tx, id: string, ai: boolean): Promise<Fix> {
  const [row] = await tx
    .select({ issue: issues, siteName: sites.name, siteDomain: sites.domain })
    .from(issues)
    .innerJoin(sites, eq(sites.id, issues.siteId))
    .where(and(eq(issues.id, id), isNull(sites.deletedAt)))
    .limit(1);
  if (!row) throw notFound('Fix');
  const suggestions = await loadSuggestions(tx, [row.issue.id], ai);
  return toFixDto(
    row.issue,
    { name: row.siteName, domain: row.siteDomain },
    suggestions.get(row.issue.id),
    await replaysOf(tx, [row.issue]),
  );
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
  const ai = aiConfigured(deps.env);
  r.use('*', requireSession(deps), requireOrg(deps), requireTeam);

  r.get('/', async (c) => {
    const q = FixListQuery.parse(c.req.query());
    const { rows, suggestions, withReplay } = await withOrg(deps.db, c.get('orgId')!, async (tx) => {
      const rows = await tx
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
        .limit(q.limit);
      const suggestions = await loadSuggestions(
        tx,
        rows.map((r) => r.issue.id),
        ai,
      );
      const withReplay = await replaysOf(
        tx,
        rows.map((r) => r.issue),
      );
      return { rows, suggestions, withReplay };
    });
    // One malformed row must not take down the whole feed: skip it and say so in the logs.
    const fixes = rows.flatMap((r) => {
      try {
        return [
          toFixDto(
            r.issue,
            { name: r.siteName, domain: r.siteDomain },
            suggestions.get(r.issue.id),
            withReplay,
          ),
        ];
      } catch (err) {
        c.get('log').error({ err, issueId: r.issue.id }, 'malformed issue row skipped');
        return [];
      }
    });
    const body: FixList = { fixes };
    return c.json(body);
  });

  r.get('/:id', async (c) => {
    const body = await withOrg(deps.db, c.get('orgId')!, async (tx): Promise<FixDetail> => {
      const fix = await loadFix(tx, c.req.param('id'), ai);
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
      const current = await loadFix(tx, c.req.param('id'), ai);
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
          ...(status === 'fixed' ? { fixedAt: now, verifiedAt: null, verification: null } : {}),
          ...(status === 'verified' ? { verifiedAt: now } : {}),
          ...(status === 'open' || status === 'fixing'
            ? { fixedAt: null, verifiedAt: null, verification: null }
            : {}),
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
      return { fix: await loadFix(tx, current.id, ai) };
    });
    return c.json(body);
  });

  return r;
}
