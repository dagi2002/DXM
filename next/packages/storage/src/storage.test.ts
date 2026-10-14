import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  LocalDiskBlobStore,
  S3BlobStore,
  assertKey,
  createBlobStore,
  replayObjectKey,
  replayVisitPrefix,
} from './index';

const ids = { orgId: 'org_A1', siteId: 'site_B2', visitId: 'v-123_abcdEF', seq: 7 };

describe('keys', () => {
  it('builds the documented replay path', () => {
    expect(replayObjectKey(ids)).toBe('orgs/org_A1/sites/site_B2/visits/v-123_abcdEF/7.json.gz');
  });

  it.each(['../etc/passwd', 'orgs/../x.json', 'orgs//x', '/abs/x', 'orgs/a b/x', 'orgs/a/.hidden', ''])(
    'refuses %j',
    (key) => {
      expect(() => assertKey(key)).toThrow(/unsafe/);
    },
  );

  it('refuses a visit id that would escape its folder', () => {
    expect(() => replayObjectKey({ ...ids, visitId: '..' })).toThrow(/unsafe/);
  });

  it('requires prefixes to end with a slash', () => {
    expect(() => assertKey('orgs/a', { prefix: true })).toThrow();
    expect(() => assertKey('/', { prefix: true })).toThrow();
    expect(() => assertKey('orgs/a/', { prefix: true })).not.toThrow();
  });
});

describe('LocalDiskBlobStore', () => {
  let root: string;
  let store: LocalDiskBlobStore;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'pulse-blobs-'));
    store = new LocalDiskBlobStore(root);
  });
  afterEach(() => rm(root, { recursive: true, force: true }));

  it('round-trips, overwrites atomically and reports missing objects as null', async () => {
    const key = replayObjectKey(ids);
    expect(await store.get(key)).toBeNull();
    await store.put(key, new Uint8Array([1, 2, 3]));
    await store.put(key, new Uint8Array([4, 5]));
    expect([...(await store.get(key))!]).toEqual([4, 5]);
    const dir = join(root, 'orgs', 'org_A1', 'sites', 'site_B2', 'visits', 'v-123_abcdEF');
    expect(await readdir(dir)).toEqual(['7.json.gz']); // no temp files left behind
  });

  it('deletes a visit and prunes the empty folders above it', async () => {
    await store.put(replayObjectKey(ids), new Uint8Array([1]));
    await store.put(replayObjectKey({ ...ids, seq: 8 }), new Uint8Array([1]));
    await store.put(replayObjectKey({ ...ids, visitId: 'other-visit' }), new Uint8Array([1]));
    expect(await store.deletePrefix(replayVisitPrefix(ids))).toBe(2);
    expect(await readdir(join(root, 'orgs', 'org_A1', 'sites', 'site_B2', 'visits'))).toEqual([
      'other-visit',
    ]);
    await store.delete(replayObjectKey({ ...ids, visitId: 'other-visit' }));
    expect(await readdir(root)).toEqual([]);
  });

  it('streams through the API (no signed URLs)', async () => {
    expect(await store.signedUrl()).toBeNull();
  });
});

describe('S3BlobStore', () => {
  const objects = new Map<string, Uint8Array>();
  const seen: Request[] = [];
  const fakeS3 = (async (input: string | URL | Request, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init);
    seen.push(req);
    const url = new URL(req.url);
    if (!req.headers.get('authorization')?.startsWith('AWS4-HMAC-SHA256'))
      return new Response(null, { status: 403 });
    const path = decodeURIComponent(url.pathname.replace(/^\/bucket\/?/, ''));
    if (req.method === 'PUT') {
      objects.set(path, new Uint8Array(await req.arrayBuffer()));
      return new Response(null, { status: 200 });
    }
    if (req.method === 'DELETE') {
      objects.delete(path);
      return new Response(null, { status: 204 });
    }
    if (url.searchParams.get('list-type') === '2') {
      const prefix = url.searchParams.get('prefix') ?? '';
      const keys = [...objects.keys()].filter((k) => k.startsWith(prefix));
      return new Response(
        `<ListBucketResult>${keys.map((k) => `<Contents><Key>${k}</Key></Contents>`).join('')}<IsTruncated>false</IsTruncated></ListBucketResult>`,
      );
    }
    const obj = objects.get(path);
    return obj ? new Response(obj) : new Response(null, { status: 404 });
  }) as typeof fetch;

  const store = new S3BlobStore(
    {
      endpoint: 'https://s3.test',
      bucket: 'bucket',
      region: 'auto',
      accessKeyId: 'AKIDEXAMPLE',
      secretAccessKey: 'test-secret-key',
    },
    fakeS3,
  );

  it('signs requests and round-trips objects', async () => {
    const key = replayObjectKey(ids);
    await store.put(key, new Uint8Array([9, 8]));
    expect([...(await store.get(key))!]).toEqual([9, 8]);
    expect(await store.get(replayObjectKey({ ...ids, seq: 99 }))).toBeNull();
    expect(seen[0]!.url).toBe(`https://s3.test/bucket/${key}`);
  });

  it('deletes by prefix', async () => {
    await store.put(replayObjectKey({ ...ids, seq: 1 }), new Uint8Array([1]));
    expect(await store.deletePrefix(replayVisitPrefix(ids))).toBe(2);
    expect(objects.size).toBe(0);
  });

  it('presigns GET URLs with a bounded expiry', async () => {
    const url = new URL((await store.signedUrl(replayObjectKey(ids), 99_999))!);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('3600');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('createBlobStore', () => {
  it('defaults to local disk', () => {
    expect(createBlobStore({ BLOB_STORE: 'local', REPLAY_DIR: '/tmp/x' }).kind).toBe('local');
  });
  it('switches to S3 by config, and insists on credentials', () => {
    expect(() => createBlobStore({ BLOB_STORE: 's3' })).toThrow(/S3_ENDPOINT/);
    const s3 = createBlobStore({
      BLOB_STORE: 's3',
      S3_ENDPOINT: 'https://acc.r2.cloudflarestorage.com',
      S3_BUCKET: 'replays',
      S3_ACCESS_KEY_ID: 'id',
      S3_SECRET_ACCESS_KEY: 'secret',
    });
    expect(s3.kind).toBe('s3');
  });
});
