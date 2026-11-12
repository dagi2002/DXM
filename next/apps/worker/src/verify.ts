import { FixEvidence, type FixVerification } from '@pulse/contracts';
import {
  MEASURE_OF,
  VERIFY_AFTER_END_DAYS,
  VERIFY_GIVE_UP_DAYS,
  VERIFY_TRACKING_HOURS,
  judgeVerification,
  verificationWindows,
} from '@pulse/detectors';
import { and, eq, issues, sql, withOrg, type Db } from '@pulse/db';
import { measureFixWindow, verifyDayWindows } from '@pulse/insights/db';
import { sendJob, type Boss } from '@pulse/jobs';
import { recordStatus } from './detect';

export interface VerifyResult {
  status: 'verified' | 'reopened' | 'waiting' | 'not_due' | 'skipped';
  siteId?: string;
  verification?: FixVerification;
}

/**
 * Before/after check for one fixed issue, inside its org's scope: measures the 7 days before the
 * day `fixed_at` falls on against days 3–6 after it (whole UTC days, from rollups), then marks the issue verified, reopens it, or records that
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
    if (now < verificationWindows(issue.kind, issue.fixedAt).dueAt) return { status: 'not_due' };
    const evidence = FixEvidence.parse(issue.evidence);
    // Whole UTC days, so page-view exposure comes from rollups (raw events for days without one).
    const windows = verifyDayWindows(issue.kind, issue.fixedAt);
    const before = (await measureFixWindow(tx, issue.siteId, issue.kind, evidence, windows.before)).measure;
    const after = (await measureFixWindow(tx, issue.siteId, issue.kind, evidence, windows.after)).measure;
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
