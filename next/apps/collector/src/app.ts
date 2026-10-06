import { readFile } from 'node:fs/promises';
import { IngestBatch, INGEST_MAX_BYTES, type IngestJob } from '@pulse/contracts/ingest';
import { Hono, type Context } from 'hono';
import type { Logger } from 'pino';
import { mapLegacyPayload } from './legacy';

export interface SiteInfo {
  id: string;
  orgId: string;
  allowedOrigins: string[];
}

export interface CollectorDeps {
  lookupSite: (publicKey: string) => Promise<SiteInfo | null>;
  enqueue: (job: IngestJob) => Promise<void>;
  log: Logger;
  now?: () => number;
  allowHeadless?: boolean;
  trustedProxyHops?: number;
  /** Absolute path to the built SDK (packages/sdk/dist). */
  sdkDir?: string;
  peerAddress?: (c: Context) => string | undefined;
}

/** Fixed-window counter per key; enough for one collector process (Redis can replace it later). */
export class RateLimiter {
  private hits = new Map<string, { count: number; reset: number }>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}
  take(key: string, now: number): boolean {
    const cur = this.hits.get(key);
    if (!cur || cur.reset <= now) {
      if (this.hits.size > 50_000) this.hits.clear(); // bound memory under abuse
      this.hits.set(key, { count: 1, reset: now + this.windowMs });
      return true;
    }
    cur.count++;
    return cur.count <= this.limit;
  }
}

const BOT_UA =
  /bot|crawl|spider|slurp|facebookexternalhit|preview|monitor|pingdom|uptime|lighthouse|pagespeed|gtmetrix|curl|wget|python-requests|go-http|java\//i;
const HEADLESS_UA = /headless|phantomjs|puppeteer|playwright/i;

export function createCollector(deps: CollectorDeps) {
  const now = deps.now ?? Date.now;
  const app = new Hono();
  const perVisit = new RateLimiter(40, 60_000); // SDK flushes every 5 s → 12/min normally
  const perIp = new RateLimiter(240, 60_000);
  const perSite = new RateLimiter(20_000, 60_000);
  const cache = new Map<string, { site: SiteInfo | null; until: number }>();

  const site = async (key: string) => {
    const hit = cache.get(key);
    const t = now();
    if (hit && hit.until > t) return hit.site;
    const found = await deps.lookupSite(key);
    if (cache.size > 10_000) cache.clear();
    cache.set(key, { site: found, until: t + (found ? 60_000 : 30_000) });
    return found;
  };

  const clientIp = (c: Context) => {
    const hops = deps.trustedProxyHops ?? 0;
    const xff = c.req.header('x-forwarded-for');
    if (hops > 0 && xff) {
      const chain = xff
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      return chain[chain.length - hops] ?? 'unknown';
    }
    return deps.peerAddress?.(c) ?? 'unknown';
  };

  /** CORS for ingest: any site may send (the key + Origin allow-list decide), never with credentials. */
  const cors = (c: Context) => {
    const origin = c.req.header('origin');
    if (origin) c.header('access-control-allow-origin', origin);
    c.header('vary', 'Origin');
  };
  const reply = (c: Context, status: 204 | 400 | 403 | 404 | 413 | 429, code?: string) => {
    cors(c);
    c.header('cache-control', 'no-store');
    return status === 204 ? c.body(null, 204) : c.json({ error: code }, status);
  };

  app.get('/livez', (c) => c.json({ status: 'ok' }));

  for (const path of ['/i', '/collect', '/collect-replay/replay']) {
    app.options(path, (c) => {
      cors(c);
      c.header('access-control-allow-methods', 'POST, OPTIONS');
      // Legacy v2 sent x-dxm-sdk; allowing it is what rescues those installs (audit finding 1).
      c.header('access-control-allow-headers', 'content-type, x-dxm-sdk');
      c.header('access-control-max-age', '86400');
      return c.body(null, 204);
    });
  }

  async function ingest(c: Context, parse: (raw: unknown) => IngestBatch | null) {
    const t = now();
    const declared = Number(c.req.header('content-length') ?? 0);
    if (declared > INGEST_MAX_BYTES) return reply(c, 413, 'payload_too_large');
    const text = await c.req.text();
    if (text.length > INGEST_MAX_BYTES) return reply(c, 413, 'payload_too_large');

    const ua = c.req.header('user-agent') ?? '';
    if (!ua || BOT_UA.test(ua) || (!deps.allowHeadless && HEADLESS_UA.test(ua))) return reply(c, 204); // silently ignore bots

    if (!perIp.take(clientIp(c), t)) return reply(c, 429, 'rate_limited');

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return reply(c, 400, 'invalid_json');
    }
    const batch = parse(raw);
    if (!batch) return reply(c, 400, 'invalid_payload');

    const found = await site(batch.k);
    if (!found) return reply(c, 404, 'unknown_site');
    const origin = c.req.header('origin');
    if (!origin || !found.allowedOrigins.includes(origin)) return reply(c, 403, 'origin_not_allowed');
    if (!perVisit.take(`${found.id}:${batch.vid}`, t) || !perSite.take(found.id, t)) {
      c.header('retry-after', '30');
      return reply(c, 429, 'rate_limited');
    }

    await deps.enqueue({
      siteId: found.id,
      orgId: found.orgId,
      receivedAt: new Date(t).toISOString(),
      userAgent: ua.slice(0, 400),
      batch,
    });
    return reply(c, 204);
  }

  app.post('/i', (c) =>
    ingest(c, (raw) => {
      const r = IngestBatch.safeParse(raw);
      return r.success ? r.data : null;
    }),
  );
  app.post('/collect', (c) => ingest(c, (raw) => mapLegacyPayload(raw, now())));
  // Legacy replay chunks: replay is rebuilt in slice 4; accept and drop so old installs don't retry forever.
  app.post('/collect-replay/replay', (c) => reply(c, 204));

  /* ── SDK files ── */
  const files = new Map<string, Promise<Buffer | null>>();
  const sdkFile = (name: 'p.js' | 'v.js') => {
    if (!deps.sdkDir) return Promise.resolve(null);
    if (!files.has(name))
      files.set(
        name,
        readFile(`${deps.sdkDir}/${name}`).catch(() => null),
      );
    return files.get(name)!;
  };
  const serve = (name: 'p.js' | 'v.js', immutable: boolean) => async (c: Context) => {
    const buf = await sdkFile(name);
    if (!buf) return c.text('not found', 404);
    c.header('content-type', 'application/javascript; charset=utf-8');
    c.header('cache-control', immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=300');
    c.header('cross-origin-resource-policy', 'cross-origin');
    c.header('x-content-type-options', 'nosniff');
    return c.body(new Uint8Array(buf));
  };
  app.get('/sdk/3/p.js', serve('p.js', true));
  app.get('/sdk/3/v.js', serve('v.js', true));
  app.get('/sdk/p.js', serve('p.js', false));
  app.get('/sdk/v.js', serve('v.js', false));
  // Legacy script URLs now serve v3 (which reads data-site-id / data-api-url).
  app.get('/dxm.js', serve('p.js', false));
  app.get('/dxm.v2.js', serve('p.js', false));
  app.get('/v.js', serve('v.js', false));

  app.notFound((c) => c.json({ error: 'not_found' }, 404));
  app.onError((err, c) => {
    deps.log.error({ err }, 'collector error');
    cors(c);
    return c.json({ error: 'internal' }, 500);
  });
  return app;
}
