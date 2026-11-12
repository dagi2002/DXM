import { PLAN_IDS, entitlementsFor, type PlanId, type SubscriptionStatus } from '@pulse/contracts/constants';
import { sql, type Db, type Tx } from '@pulse/db';

/**
 * The ingest path's view of billing: kept in its own small module so the collector imports
 * nothing else from this package.
 */
export interface IngestState {
  plan: PlanId;
  status: SubscriptionStatus | null;
  periodStart: Date;
  sessions: number;
  /** New sessions the org may store in this usage period (0 when restricted). */
  sessionLimit: number;
  replay: boolean;
  /** No new sessions are stored: quota used up, or restricted. Existing sessions carry on. */
  blocked: boolean;
}

/** Reads the org's plan, status and usage for the period containing `at`. Works with or without an org scope. */
export async function ingestState(db: Db | Tx, orgId: string, at = new Date()): Promise<IngestState> {
  const res = await db.execute<{
    plan: string;
    status: string | null;
    period_start: Date | string;
    sessions: number;
  }>(
    sql`select plan, status, period_start, sessions from pulse_org_ingest_state(${orgId}, ${at.toISOString()}::timestamptz)`,
  );
  const row = res.rows[0]!;
  const plan = (PLAN_IDS as readonly string[]).includes(row.plan) ? (row.plan as PlanId) : 'free';
  const status = row.status as SubscriptionStatus | null;
  const ent = entitlementsFor(plan, status);
  const sessions = Number(row.sessions);
  return {
    plan,
    status,
    periodStart: new Date(row.period_start),
    sessions,
    sessionLimit: ent.sessions,
    replay: ent.replay,
    blocked: sessions >= ent.sessions,
  };
}
