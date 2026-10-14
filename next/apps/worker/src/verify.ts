import { FixEvidence, type FixVerification } from '@pulse/contracts';
import {
  MEASURE_OF,
  VERIFY_AFTER_END_DAYS,
  VERIFY_GIVE_UP_DAYS,
  VERIFY_TRACKING_HOURS,
  judgeVerification,
  measureIssue,
  verificationWindows,
  verifyEventTypes,
  type DetectorEvent,
  type TimeRange,
  type VisitFacts,
} from '@pulse/detectors';
import { and, eq, events, gt, inArray, issues, lt, sql, visits, withOrg, type Db, type Tx } from '@pulse/db';
import { sendJob, type Boss } from '@pulse/jobs';
import { recordStatus } from './detect';

export interface VerifyResult {
  status: 'verified' | 'reopened' | 'waiting' | 'not_due' | 'skipped';
  siteId?: string;
  verification?: FixVerification;
}

async function loadWindow(tx: Tx, siteId: string, types: string[], range: TimeRange) {
  const rows: DetectorEvent[] = await tx
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
        inArray(events.type, types),
        gt(events.tsServer, range.start),
        lt(events.tsServer, range.end),
      ),
    );
  const ids = [...new Set(rows.map((r) => r.visitId))];
  const facts = ids.length
    ? await tx
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
        .where(and(eq(visits.siteId, siteId), inArray(visits.id, ids)))
    : [];
  const hours = Math.round((range.end.getTime() - range.start.getTime()) / 3600_000);
  return {
    events: rows,
    visits: new Map<string, VisitFacts>(facts.map((v) => [v.id, v])),
    windowHours: hours,
    now: range.end,
  };
}

/**
 * Before/after check for one fixed issue, inside its org's scope: measures the 7 days before
 * `fixed_at` against days 3–7 after it, then marks the issue verified, reopens it, or records that
 * it's still waiting for enough traffic. Conditional on the issue still being fixed at the same
 * `fixed_at`, so a person changing it meanwhile wins.
 */
export async function verifyIssue(
  db: Db,
  job: { issueId: string; orgId: string },
  now: Date = new Date(),
): Promise<VerifyResult> {
  return withOrg(db, job.orgId, async (tx) => {
    const [issue] = await tx.select().from(issues).where(eq(issues.id, job.issueId)).limit(1);
    if (!issue || issue.status !== 'fixed' || !issue.fixedAt) return { status: 'skipped' };
    const windows = verificationWindows(issue.kind, issue.fixedAt);
    if (now < windows.dueAt) return { status: 'not_due' };
    const evidence = FixEvidence.parse(issue.evidence);
    const types = verifyEventTypes(issue.kind);
    const before = measureIssue(
      issue.kind,
      evidence,
      await loadWindow(tx, issue.siteId, types, windows.before),
    );
    const after = measureIssue(
      issue.kind,
      evidence,
      await loadWindow(tx, issue.siteId, types, windows.after),
    );
    const outcome = judgeVerification(evidence, before, after);
    const verification: FixVerification = {
      outcome,
      measure: MEASURE_OF[issue.kind],
      before,
      after,
      checkedAt: now.toISOString(),
    };
    const same = and(eq(issues.id, issue.id), eq(issues.status, 'fixed'), eq(issues.fixedAt, issue.fixedAt));
    if (outcome === 'waiting') {
      await tx.update(issues).set({ verification }).where(same);
      return { status: 'waiting', verification };
    }
    const updated = await tx
      .update(issues)
      .set(
        outcome === 'verified'
          ? { status: 'verified', verifiedAt: now, verification }
          : { status: 'open', fixedAt: null, verifiedAt: null, verification },
      )
      .where(same)
      .returning({ id: issues.id });
    if (!updated.length) return { status: 'skipped' };
    await recordStatus(
      tx,
      job.orgId,
      issue.id,
      'fixed',
      outcome === 'verified' ? 'verified' : 'open',
      outcome === 'verified' ? 'verified' : 'not_verified',
    );
    return { status: outcome, siteId: issue.siteId, verification };
  });
}

/** Cross-org: fixed issues whose after-window is complete (narrow SECURITY DEFINER function). */
export async function issuesDueForVerification(db: Db) {
  const res = await db.execute<{ issue_id: string; org_id: string }>(
    sql`select issue_id, org_id from pulse_issues_due_for_verification(${VERIFY_AFTER_END_DAYS * 24}, ${VERIFY_TRACKING_HOURS}, ${VERIFY_GIVE_UP_DAYS})`,
  );
  return res.rows.map((r) => ({ issueId: r.issue_id, orgId: r.org_id }));
}

/** Queues one `issue.verify` per due issue (deduplicated per issue by the queue policy). */
export async function sweepVerification(db: Db, boss: Boss) {
  const due = await issuesDueForVerification(db);
  for (const job of due) await sendJob(boss, 'issue.verify', job, { singletonKey: job.issueId });
  return due.length;
}
