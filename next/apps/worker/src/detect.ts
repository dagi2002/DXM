import {
  DETECTION_WINDOW_HOURS,
  DETECTOR_EVENT_TYPES,
  cooldownCutoff,
  planUpsert,
  runDetectors,
  type DetectorEvent,
  type ExistingIssue,
  type Finding,
  type VisitFacts,
} from '@pulse/detectors';
import {
  and,
  eq,
  events,
  gt,
  inArray,
  isNull,
  issueEvents,
  issues,
  lt,
  newId,
  sites,
  sql,
  visits,
  withOrg,
  type Db,
  type IssueRow,
  type Tx,
} from '@pulse/db';
import { sendJob, type Boss } from '@pulse/jobs';

/** Sites with activity this recent get a detection run on each sweep. */
export const SWEEP_LOOKBACK_MINUTES = 10;
/** Spreads per-site runs over the sweep interval so they don't all hit Postgres at once. */
export const SWEEP_STAGGER_SECONDS = 60;

export interface DetectResult {
  status: 'ok' | 'site_gone';
  findings: number;
  created: string[];
  reopened: string[];
  escalated: string[];
  refreshed: number;
}

/** Postgres advisory-lock key space for per-org issue numbering. */
const NUMBER_LOCK = 'pulse_issue_number';

async function nextNumber(tx: Tx, orgId: string): Promise<number> {
  // Serializes numbering per org (two sites of one org can detect at the same time).
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${NUMBER_LOCK}:${orgId}`}, 0))`);
  const res = await tx.execute<{ n: number }>(
    sql`select coalesce(max(number), 0)::int + 1 as n from issues where org_id = ${orgId}`,
  );
  return Number(res.rows[0]!.n);
}

/**
 * One detection run for one site, inside its org's RLS scope: load the rolling window of
 * detector events, run the pure detectors, and upsert `issues` by fingerprint.
 * Idempotent — running it twice over the same events changes nothing but `updated_at`.
 */
export async function detectSite(
  db: Db,
  job: { siteId: string; orgId: string },
  now: Date = new Date(),
): Promise<DetectResult> {
  const { siteId, orgId } = job;
  const result: DetectResult = {
    status: 'ok',
    findings: 0,
    created: [],
    reopened: [],
    escalated: [],
    refreshed: 0,
  };

  return withOrg(db, orgId, async (tx) => {
    const [site] = await tx
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.id, siteId), isNull(sites.deletedAt)))
      .limit(1);
    if (!site) return { ...result, status: 'site_gone' };

    const windowStart = new Date(now.getTime() - DETECTION_WINDOW_HOURS * 3600_000);
    const rows = await tx
      .select({
        visitId: events.visitId,
        at: events.tsServer,
        clientAt: events.tsClient,
        type: events.type,
        path: events.path,
        props: events.props,
      })
      .from(events)
      .where(
        and(
          eq(events.siteId, siteId),
          inArray(events.type, [...DETECTOR_EVENT_TYPES]),
          gt(events.tsServer, windowStart),
          lt(events.tsServer, now),
        ),
      );
    if (!rows.length) return result;
    const detectorEvents: DetectorEvent[] = rows;

    const visitIds = [...new Set(rows.map((r) => r.visitId))];
    const facts = await tx
      .select({
        id: visits.id,
        device: visits.device,
        browser: visits.browser,
        os: visits.os,
        exitPath: visits.exitPath,
        network: visits.network,
        endedAt: visits.endedAt,
      })
      .from(visits)
      .where(and(eq(visits.siteId, siteId), inArray(visits.id, visitIds)));
    const visitFacts = new Map<string, VisitFacts>(facts.map((v) => [v.id, v]));

    const existing = await loadExisting(tx, siteId);
    const ignoreBefore = new Map<string, Date>();
    for (const [fp, issue] of existing) {
      const cutoff = cooldownCutoff(issue);
      if (cutoff) ignoreBefore.set(fp, cutoff);
    }

    const findings = runDetectors({
      events: detectorEvents,
      visits: visitFacts,
      windowHours: DETECTION_WINDOW_HOURS,
      now,
      ignoreBefore,
    });
    result.findings = findings.length;
    await applyFindings(tx, orgId, siteId, findings, existing, result);
    return result;
  });
}

export type ExistingById = Map<string, ExistingIssue & { id: string; lastSeen: Date }>;

/** The site's issues by fingerprint. */
export async function loadExisting(tx: Tx, siteId: string, kind?: IssueRow['kind']): Promise<ExistingById> {
  const rows = await tx
    .select({
      id: issues.id,
      fingerprint: issues.fingerprint,
      status: issues.status,
      severity: issues.severity,
      fixedAt: issues.fixedAt,
      verifiedAt: issues.verifiedAt,
      lastSeen: issues.lastSeen,
    })
    .from(issues)
    .where(and(eq(issues.siteId, siteId), kind ? eq(issues.kind, kind) : undefined));
  return new Map(rows.map((r) => [r.fingerprint, r]));
}

/** Upserts findings by fingerprint (create / refresh / reopen), recording what changed in `result`. */
export async function applyFindings(
  tx: Tx,
  orgId: string,
  siteId: string,
  findings: readonly Finding[],
  existing: ExistingById,
  result: Pick<DetectResult, 'created' | 'reopened' | 'escalated' | 'refreshed'>,
) {
  for (const f of findings) {
    const current = existing.get(f.fingerprint);
    const plan = planUpsert(current, f);
    if (plan.action === 'skip') continue;
    if (plan.action === 'create') {
      const id = await createIssue(tx, orgId, siteId, f);
      if (id) result.created.push(id);
      continue;
    }
    const issueId = current!.id;
    const lastSeen = sql`greatest(${issues.lastSeen}, ${f.lastSeen.toISOString()}::timestamptz)`;
    if (plan.action === 'reopen') {
      await tx
        .update(issues)
        .set({
          status: 'open',
          severity: f.severity,
          evidence: f.evidence,
          impact: f.impact,
          lastSeen,
          fixedAt: null,
          verifiedAt: null,
          verification: null,
        })
        .where(eq(issues.id, issueId));
      await recordStatus(tx, orgId, issueId, current!.status, 'open', 'regressed');
      result.reopened.push(issueId);
      continue;
    }
    await tx
      .update(issues)
      .set({ severity: f.severity, evidence: f.evidence, impact: f.impact, lastSeen })
      .where(eq(issues.id, issueId));
    result.refreshed += 1;
    if (plan.escalated) result.escalated.push(issueId);
  }
}

/** Appends a system status change to the issue's history. */
export async function recordStatus(
  tx: Tx,
  orgId: string,
  issueId: string,
  fromStatus: IssueRow['status'] | null,
  toStatus: IssueRow['status'],
  reason: string,
) {
  await tx.insert(issueEvents).values({
    id: newId('ise'),
    orgId,
    issueId,
    actorUserId: null,
    fromStatus,
    toStatus,
    reason,
  });
}

async function createIssue(tx: Tx, orgId: string, siteId: string, f: Finding): Promise<string | null> {
  const id = newId('iss');
  const number = await nextNumber(tx, orgId);
  const inserted = await tx
    .insert(issues)
    .values({
      id,
      orgId,
      siteId,
      number,
      kind: f.kind,
      fingerprint: f.fingerprint,
      severity: f.severity,
      status: 'open',
      evidence: f.evidence,
      impact: f.impact,
      firstSeen: f.firstSeen,
      lastSeen: f.lastSeen,
    })
    // A concurrent run for the same site got there first; it owns this issue.
    .onConflictDoNothing({ target: [issues.siteId, issues.fingerprint] })
    .returning({ id: issues.id });
  if (!inserted.length) return null;
  await recordStatus(tx, orgId, id, null, 'open', 'detected');
  return id;
}

/** Cross-org: which sites had visitors recently. Runs through a narrow SECURITY DEFINER function. */
export async function sitesWithRecentActivity(db: Db, lookbackMinutes = SWEEP_LOOKBACK_MINUTES) {
  const res = await db.execute<{ site_id: string; org_id: string }>(
    sql`select site_id, org_id from pulse_sites_with_recent_activity(${lookbackMinutes})`,
  );
  return res.rows.map((r) => ({ siteId: r.site_id, orgId: r.org_id }));
}

/** Queues one staggered `detect.site` per active site (deduplicated per site by the queue policy). */
export async function sweepDetection(db: Db, boss: Boss, random: () => number = Math.random) {
  const active = await sitesWithRecentActivity(db);
  for (const site of active) {
    await sendJob(boss, 'detect.site', site, {
      singletonKey: site.siteId,
      startAfter: Math.floor(random() * SWEEP_STAGGER_SECONDS),
    });
  }
  return active.length;
}
