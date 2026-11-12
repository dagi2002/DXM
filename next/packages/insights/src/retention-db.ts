/**
 * The retention job (task 14): per org, inside that org's RLS scope, deletes raw events and visits
 * older than `retentionDaysFor(org)` and daily rollups older than `rollupRetentionDays`; then drops
 * daily event partitions that are past every org's retention and empty. Whole UTC days only.
 */
import { sql, withOrg, type Db } from '@pulse/db';
import {
  retentionCutoffDay,
  retentionDaysFor,
  rollupRetentionDays,
  type RetentionDefaults,
  type RetentionOrg,
} from './retention';

const ROLLUP_TABLES = [
  'rollup_site_day',
  'rollup_page_day',
  'rollup_vitals_day',
  'rollup_funnel_day',
] as const;

export interface OrgPurgeResult {
  orgId: string;
  days: number;
  events: number;
  visits: number;
  rollups: number;
}

/** Cross-org: every org with its plan (narrow SECURITY DEFINER function, ids and plan only). */
export async function orgsForRetention(db: Db): Promise<RetentionOrg[]> {
  const res = await db.execute<{ org_id: string; plan: string | null }>(
    sql`select org_id, plan from pulse_orgs_for_retention()`,
  );
  return res.rows.map((r) => ({ id: r.org_id, plan: r.plan }));
}

/**
 * Deletes one org's data past its retention. Every statement runs with `app.org_id` set to this
 * org under forced RLS, so it can only ever see — and delete — this org's rows.
 */
export async function purgeOrgData(db: Db, org: RetentionOrg, days: number, now: Date = new Date()) {
  const cutoff = retentionCutoffDay(now, days);
  const rollupCutoff = retentionCutoffDay(now, rollupRetentionDays(days));
  const at = sql`${`${cutoff}T00:00:00.000Z`}::timestamptz`;
  return withOrg(db, org.id, async (tx) => {
    const ev = await tx.execute(sql`delete from events where org_id = ${org.id} and ts_server < ${at}`);
    const vi = await tx.execute(sql`delete from visits where org_id = ${org.id} and started_at < ${at}`);
    let rollups = 0;
    for (const table of ROLLUP_TABLES) {
      const res = await tx.execute(
        sql`delete from ${sql.identifier(table)} where org_id = ${org.id} and day < ${rollupCutoff}::date`,
      );
      rollups += res.rowCount ?? 0;
    }
    return {
      orgId: org.id,
      days,
      events: ev.rowCount ?? 0,
      visits: vi.rowCount ?? 0,
      rollups,
    } satisfies OrgPurgeResult;
  });
}

/** Drops empty daily event partitions older than `keepDays` (never one that holds any rows). */
export async function dropEmptyEventPartitions(db: Db, keepDays: number) {
  const res = await db.execute<{ n: number }>(
    sql`select pulse_drop_empty_event_partitions(${keepDays}) as n`,
  );
  return Number(res.rows[0]?.n ?? 0);
}

/**
 * The `maintenance.retention` job. `daysFor` defaults to `retentionDaysFor`, which billing
 * (task 11) replaces with retention by plan.
 */
export async function runRetention(
  db: Db,
  opts: RetentionDefaults & { daysFor?: (org: RetentionOrg) => number } = {},
  now: Date = new Date(),
) {
  const daysFor = opts.daysFor ?? ((org: RetentionOrg) => retentionDaysFor(org, opts));
  const orgs = await orgsForRetention(db);
  const results: OrgPurgeResult[] = [];
  let shortest = Infinity;
  for (const org of orgs) {
    const days = daysFor(org);
    shortest = Math.min(shortest, days);
    results.push(await purgeOrgData(db, org, days, now));
  }
  // Any partition past the shortest retention may now be empty; the function checks each one.
  const partitions = Number.isFinite(shortest) ? await dropEmptyEventPartitions(db, shortest) : 0;
  return {
    orgs: results.length,
    events: results.reduce((a, r) => a + r.events, 0),
    visits: results.reduce((a, r) => a + r.visits, 0),
    rollups: results.reduce((a, r) => a + r.rollups, 0),
    partitions,
  };
}
