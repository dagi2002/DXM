import type { ReplayChunkJob } from '@pulse/contracts/replays';
import { replayChunks, sql, withOrg, type Db } from '@pulse/db';
import type { BlobStore } from '@pulse/storage';

/**
 * Records a replay chunk's metadata (the collector already wrote the blob). Idempotent: a chunk
 * delivered twice (retry, or beacon + fetch) keeps its first row; the blob was simply overwritten.
 */
export async function applyReplayChunk(
  db: Db,
  store: BlobStore,
  job: ReplayChunkJob,
): Promise<'applied' | 'duplicate' | 'site_gone'> {
  try {
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

/**
 * Retention: deletes replay rows older than `keepDays` (across orgs, via a narrow SECURITY DEFINER
 * function) and then their blobs, in batches until nothing is left to delete.
 */
export async function purgeReplays(
  db: Db,
  store: BlobStore,
  keepDays: number,
  batch = 2000,
): Promise<{ rows: number; blobs: number; failed: number }> {
  const out = { rows: 0, blobs: 0, failed: 0 };
  for (;;) {
    const res = await db.execute<{ object_key: string }>(
      sql`select object_key from pulse_purge_replay_chunks(${keepDays}, ${batch})`,
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
