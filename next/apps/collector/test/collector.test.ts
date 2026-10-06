import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IngestJob } from '@pulse/contracts/ingest';
import pino from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';
import { createCollector } from '../src/app';
import { mapLegacyPayload } from '../src/legacy';

const ORIGIN = 'https://shop.et';
const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36';

let jobs: IngestJob[];
let lookups: number;
let t: number;
const sdkDir = mkdtempSync(join(tmpdir(), 'sdk-'));
writeFileSync(join(sdkDir, 'p.js'), 'console.log("p")');
writeFileSync(join(sdkDir, 'v.js'), 'console.log("v")');

const app = () =>
  createCollector({
    log: pino({ level: 'silent' }),
    now: () => t,
    sdkDir,
    lookupSite: async (key) => {
      lookups++;
      return key === 'pk_good'
        ? { id: 'site_1', orgId: 'org_1', allowedOrigins: [ORIGIN, 'https://www.shop.et'] }
        : null;
    },
    enqueue: async (job) => void jobs.push(job),
  });

const batch = (over: Record<string, unknown> = {}) => ({
  v: 3,
  k: 'pk_good',
  vid: 'visit_abcdefgh',
  seq: 0,
  ctx: { vw: 390, vh: 844, plat: 'web' },
  ev: [{ t: 'pv', ts: 1_700_000_000_000, p: '/' }],
  ...over,
});

const post = (a: ReturnType<typeof app>, body: unknown, headers: Record<string, string> = {}, path = '/i') =>
  a.request(path, {
    method: 'POST',
    headers: { origin: ORIGIN, 'user-agent': UA, 'content-type': 'text/plain', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

beforeEach(() => {
  jobs = [];
  lookups = 0;
  t = 1_700_000_000_000;
});

describe('POST /i', () => {
  it('accepts a valid text/plain batch, echoes the origin, and enqueues server facts', async () => {
    const res = await post(app(), batch());
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(res.headers.get('access-control-allow-credentials')).toBeNull();
    expect(jobs).toEqual([
      expect.objectContaining({
        siteId: 'site_1',
        orgId: 'org_1',
        userAgent: UA,
        receivedAt: new Date(t).toISOString(),
        batch: expect.objectContaining({ vid: 'visit_abcdefgh' }),
      }),
    ]);
  });

  it('rejects origins that are not allowed for the site, and unknown keys', async () => {
    const a = app();
    const wrong = await post(a, batch(), { origin: 'https://evil.example' });
    expect(wrong.status).toBe(403);
    expect(wrong.headers.get('access-control-allow-origin')).toBe('https://evil.example'); // so the SDK can read the status and stop
    expect((await post(a, batch(), { origin: '' })).status).toBe(403);
    expect((await post(a, batch({ k: 'pk_nope' }))).status).toBe(404);
    expect(jobs).toEqual([]);
  });

  it('validates the payload and its size', async () => {
    const a = app();
    expect((await post(a, '{nope')).status).toBe(400);
    expect((await post(a, batch({ ev: [] }))).status).toBe(400);
    expect((await post(a, batch({ vid: 'x' }))).status).toBe(400);
    expect((await post(a, batch({ ev: [{ t: 'cl', ts: 1, p: '/', s: 'a', x: 5, y: 1 }] }))).status).toBe(400); // x must be a 0–1 ratio
    expect((await post(a, 'x'.repeat(70_000))).status).toBe(413);
  });

  it('quietly drops bots and headless browsers', async () => {
    const a = app();
    for (const ua of ['Googlebot/2.1', 'Mozilla/5.0 HeadlessChrome/128', 'curl/8.4', '']) {
      expect((await post(a, batch(), { 'user-agent': ua })).status).toBe(204);
    }
    expect(jobs).toEqual([]);
  });

  it('rate-limits a single visit', async () => {
    const a = app();
    let last = 0;
    for (let i = 0; i < 45; i++) last = (await post(a, batch({ seq: i }))).status;
    expect(last).toBe(429);
    expect(jobs).toHaveLength(40);
    t += 61_000;
    expect((await post(a, batch({ seq: 99 }))).status).toBe(204);
  });

  it('caches site lookups', async () => {
    const a = app();
    await post(a, batch());
    await post(a, batch({ seq: 1 }));
    expect(lookups).toBe(1);
  });
});

describe('CORS preflight', () => {
  it('allows the legacy x-dxm-sdk header so old v2 installs stop failing', async () => {
    const res = await app().request('/collect', {
      method: 'OPTIONS',
      headers: {
        origin: ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type,x-dxm-sdk',
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(res.headers.get('access-control-allow-headers')).toContain('x-dxm-sdk');
  });
});

describe('legacy /collect', () => {
  it('maps v1/v2 payloads onto v3 and enqueues them', async () => {
    const legacy = {
      sessionId: 'sess-123',
      siteId: 'pk_good',
      metadata: { url: 'https://shop.et/checkout?email=a@b.et', viewport: { width: 400, height: 800 } },
      events: [
        { type: 'pageview', ts: t, url: 'https://shop.et/checkout?email=a@b.et' },
        { type: 'click', ts: t, x: 200, y: 900, target: 'button.pay' },
        { type: 'vital', ts: t, value: 'LCP:2300' },
        { type: 'mystery', ts: t },
      ],
    };
    const res = await post(app(), legacy, { 'content-type': 'application/json' }, '/collect');
    expect(res.status).toBe(204);
    const b = jobs[0]!.batch;
    expect(b.sv).toBe('legacy');
    expect(b.vid).toBe('sess-123');
    expect(b.ev).toEqual([
      { t: 'pv', ts: t, p: '/checkout' },
      { t: 'cl', ts: t, p: '/checkout', s: 'button.pay', x: 0.5, y: 900 },
      { t: 'vt', ts: t, p: '/checkout', n: 'LCP', v: 2300 },
    ]);
  });

  it('hashes session ids that are not valid visit ids', () => {
    const b = mapLegacyPayload(
      { sessionId: 'has spaces and !!', siteId: 'pk', events: [{ type: 'pageview', url: '/' }] },
      t,
    );
    expect(b?.vid).toMatch(/^lg_[A-Za-z0-9_-]{24}$/);
    expect(mapLegacyPayload({ siteId: 'pk', events: [] }, t)).toBeNull();
  });

  it('accepts and drops legacy replay chunks', async () => {
    expect((await post(app(), { chunk: [] }, {}, '/collect-replay/replay')).status).toBe(204);
  });
});

describe('SDK files', () => {
  it('serves versioned files immutably and aliases with a short cache, cross-origin readable', async () => {
    const a = app();
    const v = await a.request('/sdk/3/p.js');
    expect(v.status).toBe(200);
    expect(v.headers.get('content-type')).toContain('javascript');
    expect(v.headers.get('cache-control')).toContain('immutable');
    expect(v.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
    expect(await v.text()).toBe('console.log("p")');
    for (const path of ['/sdk/p.js', '/dxm.js', '/dxm.v2.js']) {
      const r = await a.request(path);
      expect(r.status).toBe(200);
      expect(r.headers.get('cache-control')).toBe('public, max-age=300');
    }
    expect((await a.request('/v.js')).status).toBe(200);
  });
});
