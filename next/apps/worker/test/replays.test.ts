import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ReplayChunkJob } from '@pulse/contracts/replays';
import { createDatabase, replayChunks, withOrg } from '@pulse/db';
import { LocalDiskBlobStore, replayObjectKey } from '@pulse/storage';
import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { applyReplayChunk, purgeReplays } from '../src/replays';

const user = process.env.USER ?? 'postgres';
const APP_DB =
  process.env.TEST_DATABASE_URL ?? 'postgres://pulse_app:pulse_app_dev@localhost:5432/pulse_test';
const ADMIN_DB = process.env.TEST_DATABASE_ADMIN_URL ?? `postgres://${user}@localhost:5432/pulse_test`;
const database = createDatabase(APP_DB, { max: 3 });
afterAll(() => database.close());

async function admin(text: string, values: unknown[] = []) {
  const c = new pg.Client({ connectionString: ADMIN_DB });
  await c.connect();
  try {
    return await c.query(text, values);
  } finally {
    await c.end();
  }
}

let store: LocalDiskBlobStore;

beforeEach(async () => {
  store = new LocalDiskBlobStore(mkdtempSync(join(tmpdir(), 'worker-replays-')));
  await admin(
    'truncate replay_chunks, events, ingest_dedupe, visits, audit_log, sites, org_plans, invitation, member, organization, verification, account, session, "user" cascade',
  );
  await admin(
    `insert into organization (id, name, slug) values ('org_a','Org A','org-a'), ('org_b','Org B','org-b')`,
  );
  await admin(`insert into sites (id, org_id, name, domain, public_key, allowed_origins) values
    ('site_a','org_a','Shop A','shop-a.et','pk_a','{https://shop-a.et}'),
    ('site_b','org_b','Shop B','shop-b.et','pk_b','{https://shop-b.et}')`);
});

const job = (over: Partial<ReplayChunkJob> = {}): ReplayChunkJob => {
  const base = { orgId: 'org_a', siteId: 'site_a', visitId: 'visit_aaaaaaaa', seq: 0, ...over };
  return {
    bytes: 120,
    objectKey: replayObjectKey(base),
    events: 12,
    firstTs: new Date(Date.now() - 60_000).toISOString(),
    lastTs: new Date().toISOString(),
    hasSnapshot: base.seq === 0,
    receivedAt: new Date().toISOString(),
    ...base,
  };
};

describe('applyReplayChunk', () => {
  it('records metadata under the org, once per (site, visit, seq)', async () => {
    expect(await applyReplayChunk(database.db, store, job())).toBe('applied');
    expect(await applyReplayChunk(database.db, store, job())).toBe('duplicate');
    expect(await applyReplayChunk(database.db, store, job({ seq: 1 }))).toBe('applied');
    const { rows } = await admin(
      'select org_id, site_id, visit_id, seq, has_snapshot from replay_chunks order by seq',
    );
    expect(rows).toEqual([
      { org_id: 'org_a', site_id: 'site_a', visit_id: 'visit_aaaaaaaa', seq: 0, has_snapshot: true },
      { org_id: 'org_a', site_id: 'site_a', visit_id: 'visit_aaaaaaaa', seq: 1, has_snapshot: false },
    ]);
  });

  it('cannot attach a chunk to another org’s site', async () => {
    await expect(applyReplayChunk(database.db, store, job({ siteId: 'site_b' }))).resolves.toBe('site_gone');
    expect((await admin('select count(*)::int as n from replay_chunks')).rows[0].n).toBe(0);
  });

  it('drops the blob when the site was deleted in the meantime', async () => {
    const j = job();
    await store.put(j.objectKey, new Uint8Array([1]));
    await admin(`delete from sites where id = 'site_a'`);
    expect(await applyReplayChunk(database.db, store, j)).toBe('site_gone');
    expect(await store.get(j.objectKey)).toBeNull();
  });

  it('is invisible to other orgs (RLS)', async () => {
    await applyReplayChunk(database.db, store, job());
    const other = await withOrg(database.db, 'org_b', (tx) => tx.select().from(replayChunks));
    const own = await withOrg(database.db, 'org_a', (tx) => tx.select().from(replayChunks));
    expect(other).toHaveLength(0);
    expect(own).toHaveLength(1);
  });
});

describe('purgeReplays', () => {
  it('deletes rows and blobs past retention, across orgs, and keeps the rest', async () => {
    const old = [job({ seq: 0 }), job({ orgId: 'org_b', siteId: 'site_b', seq: 0 })];
    const fresh = job({ seq: 1 });
    for (const j of [...old, fresh]) {
      await store.put(j.objectKey, new Uint8Array([1, 2]));
      await applyReplayChunk(database.db, store, j);
    }
    await admin(`update replay_chunks set received_at = now() - interval '31 days' where seq = 0`);

    const res = await purgeReplays(database.db, store, 30, 1); // batch of 1 exercises the loop
    expect(res).toEqual({ rows: 2, blobs: 2, failed: 0 });
    for (const j of old) expect(await store.get(j.objectKey)).toBeNull();
    expect(await store.get(fresh.objectKey)).not.toBeNull();
    expect((await admin('select seq from replay_chunks')).rows).toEqual([{ seq: 1 }]);
  });

  it('refuses nonsense retention values', async () => {
    await expect(purgeReplays(database.db, store, 0)).rejects.toThrow();
  });
});
