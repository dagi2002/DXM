import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { REPLAY_CHUNK_MAX_BYTES, replaySampled, type ReplayChunkJob } from '@pulse/contracts/replays';
import { LocalDiskBlobStore } from '@pulse/storage';
import pino from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';
import { createCollector, type SiteInfo } from '../src/app';

const ORIGIN = 'https://shop.et';
const OTHER_ORIGIN = 'https://other.et';
const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36';
const VID = 'visit_abcdefgh';

const SITES: Record<string, SiteInfo> = {
  pk_a: { id: 'site_a', orgId: 'org_a', allowedOrigins: [ORIGIN] },
  pk_b: { id: 'site_b', orgId: 'org_b', allowedOrigins: [OTHER_ORIGIN] },
  pk_half: { id: 'site_h', orgId: 'org_a', allowedOrigins: [ORIGIN], replaySampleRate: 0.5 },
  pk_off: { id: 'site_o', orgId: 'org_a', allowedOrigins: [ORIGIN], replaySampleRate: 0 },
};

let jobs: ReplayChunkJob[];
let store: LocalDiskBlobStore;
let t: number;
let failEnqueue = false;

const app = (withReplays = true) =>
  createCollector({
    log: pino({ level: 'silent' }),
    now: () => t,
    lookupSite: async (key) => SITES[key] ?? null,
    enqueue: async () => {},
    replays: withReplays
      ? {
          store,
          enqueue: async (job) => {
            if (failEnqueue) throw new Error('queue down');
            jobs.push(job);
          },
        }
      : undefined,
  });

const rr = (n = 3, start = 1_700_000_000_000) => [
  { type: 4, timestamp: start, data: { href: 'https://shop.et/', width: 390, height: 844 } },
  { type: 2, timestamp: start + 5, data: { node: { type: 0, childNodes: [] } } },
  ...Array.from({ length: n }, (_, i) => ({
    type: 3,
    timestamp: start + 100 * (i + 1),
    data: { source: 1 },
  })),
];
const gz = (v: unknown) => new Uint8Array(gzipSync(JSON.stringify(v)));

const send = (
  a: ReturnType<typeof app>,
  body: string | Uint8Array,
  q: Record<string, string | number> = {},
  headers: Record<string, string> = {},
) =>
  a.request(
    `/r?${new URLSearchParams({ k: 'pk_a', vid: VID, seq: '0', ...(q as Record<string, string>) })}`,
    {
      method: 'POST',
      headers: { origin: ORIGIN, 'user-agent': UA, 'content-type': 'text/plain', ...headers },
      body,
    },
  );

beforeEach(() => {
  jobs = [];
  failEnqueue = false;
  t = 1_700_000_100_000;
  store = new LocalDiskBlobStore(mkdtempSync(join(tmpdir(), 'replays-')));
});

describe('POST /r', () => {
  it('stores a gzip chunk at the documented path and enqueues metadata only', async () => {
    const body = gz(rr());
    const res = await send(app(), body, { seq: 3 });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    const key = `orgs/org_a/sites/site_a/visits/${VID}/3.json.gz`;
    expect(jobs).toEqual([
      {
        orgId: 'org_a',
        siteId: 'site_a',
        visitId: VID,
        seq: 3,
        bytes: body.length,
        objectKey: key,
        events: 5,
        firstTs: new Date(1_700_000_000_000).toISOString(),
        lastTs: new Date(1_700_000_000_300).toISOString(),
        hasSnapshot: true,
        receivedAt: new Date(t).toISOString(),
      },
    ]);
    expect(JSON.stringify(jobs[0])).not.toContain('timestamp'); // no event payload in the queue
    expect(Buffer.from((await store.get(key))!)).toEqual(Buffer.from(body));
  });

  it('gzips plain JSON from browsers without CompressionStream', async () => {
    expect((await send(app(), JSON.stringify(rr(1)))).status).toBe(204);
    const blob = await store.get(jobs[0]!.objectKey);
    expect(JSON.parse(gunzipSync(blob!).toString())).toHaveLength(3);
    expect(jobs[0]!.bytes).toBe(blob!.length);
  });

  it('caps the body at 512 KB, also while streaming without a Content-Length', async () => {
    const a = app();
    expect((await send(a, new Uint8Array(REPLAY_CHUNK_MAX_BYTES + 1))).status).toBe(413);
    const piece = new Uint8Array(64 * 1024);
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(ctrl) {
        if (sent++ < 32) ctrl.enqueue(piece);
        else ctrl.close();
      },
    });
    const res = await a.request(`/r?k=pk_a&vid=${VID}&seq=0`, {
      method: 'POST',
      headers: { origin: ORIGIN, 'user-agent': UA },
      body: stream,
      duplex: 'half',
    } as RequestInit);
    expect(res.status).toBe(413);
    expect(sent).toBeLessThan(32);
    expect(jobs).toEqual([]);
  });

  it('refuses gzip bombs (inflated size is capped)', async () => {
    const bomb = new Uint8Array(gzipSync(Buffer.alloc(20 * 1024 * 1024, 0x20)));
    expect(bomb.length).toBeLessThan(REPLAY_CHUNK_MAX_BYTES);
    expect((await send(app(), bomb)).status).toBe(413);
  });

  it('validates the query and the events', async () => {
    const a = app();
    expect((await send(a, gz(rr()), { vid: 'x' })).status).toBe(400);
    expect((await send(a, gz(rr()), { seq: -1 })).status).toBe(400);
    expect((await send(a, gz(rr()), { seq: 100_001 })).status).toBe(400);
    expect((await send(a, 'not json')).status).toBe(400);
    expect((await send(a, gz([]))).status).toBe(400);
    expect((await send(a, gz({ type: 2 }))).status).toBe(400);
    expect((await send(a, gz([{ type: 2 }]))).status).toBe(400);
    expect((await send(a, gz([{ type: 99, timestamp: 1 }]))).status).toBe(400);
    expect(jobs).toEqual([]);
  });

  it('checks the public key and the Origin like events do', async () => {
    const a = app();
    expect((await send(a, gz(rr()), { k: 'pk_nope' })).status).toBe(404);
    expect((await send(a, gz(rr()), {}, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await send(a, gz(rr()), {}, { origin: '' })).status).toBe(403);
    expect(jobs).toEqual([]);
  });

  it('keeps tenants apart: the path comes from the key, never from the request', async () => {
    const a = app();
    // Site B's key from site A's origin is refused...
    expect((await send(a, gz(rr()), { k: 'pk_b' })).status).toBe(403);
    // ...and the same visit id under each site's own key lands in each org's own folder.
    expect((await send(a, gz(rr()))).status).toBe(204);
    expect((await send(a, gz(rr()), { k: 'pk_b' }, { origin: OTHER_ORIGIN })).status).toBe(204);
    expect(jobs.map((j) => [j.orgId, j.siteId, j.objectKey])).toEqual([
      ['org_a', 'site_a', `orgs/org_a/sites/site_a/visits/${VID}/0.json.gz`],
      ['org_b', 'site_b', `orgs/org_b/sites/site_b/visits/${VID}/0.json.gz`],
    ]);
  });

  it('honours the site sampling rate', async () => {
    const a = app();
    expect((await send(a, gz(rr()), { k: 'pk_off' })).status).toBe(403);
    const sampledIn = Array.from({ length: 40 }, (_, i) => `visit_${i}_sampling`).find((v) =>
      replaySampled(v, 0.5),
    )!;
    const sampledOut = Array.from({ length: 40 }, (_, i) => `visit_${i}_sampling`).find(
      (v) => !replaySampled(v, 0.5),
    )!;
    expect((await send(a, gz(rr()), { k: 'pk_half', vid: sampledIn })).status).toBe(204);
    expect((await send(a, gz(rr()), { k: 'pk_half', vid: sampledOut })).status).toBe(403);
  });

  it('rate-limits one visit', async () => {
    const a = app();
    let last = 0;
    for (let seq = 0; seq < 35; seq++) last = (await send(a, gz(rr(1)), { seq })).status;
    expect(last).toBe(429);
    expect(jobs).toHaveLength(30);
    t += 61_000;
    expect((await send(a, gz(rr(1)), { seq: 40 })).status).toBe(204);
  });

  it('drops bots quietly and answers 503 when replay storage is not configured', async () => {
    expect((await send(app(), gz(rr()), {}, { 'user-agent': 'Googlebot/2.1' })).status).toBe(204);
    expect(jobs).toEqual([]);
    expect((await send(app(false), gz(rr()))).status).toBe(503);
  });

  it('removes the blob again when the metadata cannot be queued', async () => {
    failEnqueue = true;
    expect((await send(app(), gz(rr()))).status).toBe(500);
    expect(await store.get(`orgs/org_a/sites/site_a/visits/${VID}/0.json.gz`)).toBeNull();
  });
});

describe('GET /r/cfg', () => {
  const cfg = (a: ReturnType<typeof app>, k: string, vid = VID, origin = ORIGIN) =>
    a.request(`/r/cfg?k=${k}&vid=${vid}`, { headers: { origin, 'user-agent': UA } });

  it('says whether to record this visit', async () => {
    const a = app();
    const on = await cfg(a, 'pk_a');
    expect(await on.json()).toEqual({ on: true });
    expect(on.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(on.headers.get('cache-control')).toBe('no-store');
    expect(await (await cfg(a, 'pk_off')).json()).toEqual({ on: false });
    expect(await (await cfg(a, 'pk_nope')).json()).toEqual({ on: false });
    expect(await (await cfg(a, 'pk_a', VID, 'https://evil.example')).json()).toEqual({ on: false });
    expect(await (await cfg(a, 'pk_a', 'bad id')).json()).toEqual({ on: false });
    expect(await (await cfg(app(false), 'pk_a')).json()).toEqual({ on: false });
  });
});
