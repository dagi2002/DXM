import type { ReplayChunkJob } from '@pulse/contracts/replays';
import { ingestState } from '@pulse/billing/ingest';
import { PLANS, PLAN_IDS, entitlementsFor } from '@pulse/contracts/constants';
import { and, eq, replayChunks, sql, visits, withOrg, type Db } from '@pulse/db';
import type { BlobStore } from '@pulse/storage';

/**
 * Records a replay chunk's metadata (the collector already wrote the blob). Idempotent: a chunk
 * delivered twice (retry, or beacon + fetch) keeps its first row; the blob was simply overwritten.
 */
export async function applyReplayChunk(
  db: Db,
  store: BlobStore,
  job: ReplayChunkJob,
): Promise<'applied' | 'duplicate' | 'site_gone' | 'over_quota'> {
  try {
    // Replay counts toward the session quota: when the org stores no new sessions, a chunk for a
    // visit that was never stored is dropped too (blob included).
    const blocked = await withOrg(db, job.orgId, async (tx) => {
      const state = await ingestState(tx, job.orgId, new Date(job.receivedAt));
      if (!state.blocked) return false;
      const [visit] = await tx
        .select({ id: visits.id })
        .from(visits)
        .where(and(eq(visits.siteId, job.siteId), eq(visits.id, job.visitId)))
        .limit(1);
      return !visit;
    });
    if (blocked) {
      await store.delete(job.objectKey);
      return 'over_quota';
    }
    const inserted = await withOrg(db, job.orgId, (tx) =>
      tx
        .insert(replayChunks)
        .values({
          orgId: job.orgId,
          siteId: job.siteId,
          visitId: job.visitId,
          seq: job.seq,
          bytes: job.bytes,
          objectKey: job.objectKey,
          events: job.events,
          firstTs: new Date(job.firstTs),
          lastTs: new Date(job.lastTs),
          hasSnapshot: job.hasSnapshot,
          receivedAt: new Date(job.receivedAt),
        })
        .onConflictDoNothing()
        .returning({ seq: replayChunks.seq }),
    );
    return inserted.length ? 'applied' : 'duplicate';
  } catch (err) {
    // The site (or org) was deleted while the chunk was queued: drop the orphaned blob.
    if (
      (err as { code?: string }).code === '23503' ||
      (err as { cause?: { code?: string } }).cause?.code === '23503'
    ) {
      await store.delete(job.objectKey);
      return 'site_gone';
    }
    throw err;
  }
}

/** Days of replays each plan keeps, plus what a restricted org keeps (the free plan's). */
export const REPLAY_DAYS_BY_PLAN: Record<string, number> = {
  ...Object.fromEntries(PLAN_IDS.map((p) => [p, PLANS[p].retentionDays])),
  restricted: entitlementsFor('free', 'restricted').retentionDays,
};

/**
 * Retention: deletes replay rows older than the org's plan keeps (never more than `maxDays`, the
 * server-wide cap) across orgs, via a narrow SECURITY DEFINER function, and then their blobs, in
 * batches until nothing is left to delete.
 */
export async function purgeReplays(
  db: Db,
  store: BlobStore,
  maxDays: number,
  batch = 2000,
  daysByPlan: Record<string, number> = REPLAY_DAYS_BY_PLAN,
): Promise<{ rows: number; blobs: number; failed: number }> {
  const out = { rows: 0, blobs: 0, failed: 0 };
  for (;;) {
    const res = await db.execute<{ object_key: string }>(
      sql`select object_key from pulse_purge_replay_chunks_by_plan(${JSON.stringify(daysByPlan)}::jsonb, ${maxDays}, ${batch})`,
    );
    out.rows += res.rows.length;
    for (const { object_key } of res.rows) {
      try {
        await store.delete(object_key);
        out.blobs++;
      } catch {
        out.failed++;
      }
    }
    if (res.rows.length < batch) return out;
  }
}
