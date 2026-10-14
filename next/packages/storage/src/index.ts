/**
 * Blob storage for replay chunks (and, later, report PDFs and page snapshots).
 *
 * Everything goes through the `BlobStore` interface. Today the founder runs `LocalDiskBlobStore`
 * (one VM, files under REPLAY_DIR); `S3BlobStore` speaks the S3 API (AWS S3, Cloudflare R2,
 * MinIO), so moving is a config change: BLOB_STORE=s3 plus the S3_* variables.
 */
import { mkdir, readFile, readdir, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { AwsClient } from 'aws4fetch';

export interface BlobStore {
  readonly kind: 'local' | 's3';
  put(key: string, data: Uint8Array): Promise<void>;
  /** null when the object doesn't exist. */
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
  /** Deletes every object under `prefix` (which must end in "/"). Returns how many were deleted. */
  deletePrefix(prefix: string): Promise<number>;
  /** A short-lived URL the browser can fetch directly, or null to stream through the API. */
  signedUrl(key: string, ttlSeconds: number): Promise<string | null>;
}

const SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;

const FILE = /^[A-Za-z0-9_-]{1,64}(\.[a-z0-9]{1,8}){0,2}$/;

/** Object keys are built from ids only; anything else (dots, slashes) is refused, so no traversal. */
export function assertKey(key: string, { prefix = false } = {}): void {
  const parts = key.split('/');
  const last = parts.pop()!;
  const ok = prefix ? last === '' && parts.length > 0 : FILE.test(last);
  if (!ok || !parts.every((p) => SEGMENT.test(p))) throw new Error(`unsafe blob key: ${key}`);
}

/** `orgs/{org}/sites/{site}/visits/{visit}/{seq}.json.gz` (docs/rebuild/03 §4). */
export function replayObjectKey(p: { orgId: string; siteId: string; visitId: string; seq: number }): string {
  const key = `${replayVisitPrefix(p)}${p.seq}.json.gz`;
  assertKey(key);
  return key;
}
export const replayVisitPrefix = (p: { orgId: string; siteId: string; visitId: string }) =>
  `orgs/${p.orgId}/sites/${p.siteId}/visits/${p.visitId}/`;
export const replaySitePrefix = (p: { orgId: string; siteId: string }) =>
  `orgs/${p.orgId}/sites/${p.siteId}/`;

/** Files under one root directory. Writes are atomic (temp file + rename). */
export class LocalDiskBlobStore implements BlobStore {
  readonly kind = 'local' as const;
  readonly root: string;
  constructor(root: string) {
    this.root = resolve(root);
  }
  private path(key: string) {
    const p = resolve(this.root, ...key.split('/'));
    if (!p.startsWith(this.root + sep)) throw new Error(`unsafe blob key: ${key}`);
    return p;
  }
  async put(key: string, data: Uint8Array) {
    assertKey(key);
    const file = this.path(key);
    await mkdir(dirname(file), { recursive: true });
    const tmp = `${file}.${randomBytes(6).toString('hex')}.tmp`;
    await writeFile(tmp, data);
    await rename(tmp, file);
  }
  async get(key: string) {
    assertKey(key);
    try {
      return new Uint8Array(await readFile(this.path(key)));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }
  async delete(key: string) {
    assertKey(key);
    await rm(this.path(key), { force: true });
    await this.pruneEmptyDirs(dirname(this.path(key)));
  }
  async deletePrefix(prefix: string) {
    assertKey(prefix, { prefix: true });
    const dir = this.path(prefix.slice(0, -1));
    const n = await countFiles(dir);
    await rm(dir, { recursive: true, force: true });
    await this.pruneEmptyDirs(dirname(dir));
    return n;
  }
  async signedUrl() {
    return null; // streamed through the API
  }
  /** Removes now-empty parent folders (visit → site → org) so retention leaves no litter. */
  private async pruneEmptyDirs(dir: string) {
    let cur = dir;
    while (cur.startsWith(this.root + sep)) {
      try {
        if ((await readdir(cur)).length > 0) return;
        await rmdir(cur);
      } catch {
        return;
      }
      cur = dirname(cur);
    }
  }
}

async function countFiles(dir: string): Promise<number> {
  try {
    let n = 0;
    for (const e of await readdir(dir, { withFileTypes: true })) {
      n += e.isDirectory() ? await countFiles(join(dir, e.name)) : 1;
    }
    return n;
  } catch {
    return 0;
  }
}

export interface S3Config {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * S3-compatible store (path-style URLs, so R2 and MinIO work too). Requests are SigV4-signed
 * with aws4fetch. Not yet exercised against a real bucket — see docs/rebuild/progress.md.
 */
export class S3BlobStore implements BlobStore {
  readonly kind = 's3' as const;
  private readonly client: AwsClient;
  private readonly base: string;
  constructor(
    private readonly cfg: S3Config,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.client = new AwsClient({
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      region: cfg.region,
      service: 's3',
    });
    this.base = `${cfg.endpoint.replace(/\/$/, '')}/${encodeURIComponent(cfg.bucket)}`;
  }
  private url(key: string) {
    return `${this.base}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }
  private async send(url: string, init: RequestInit = {}) {
    const req = await this.client.sign(url, init);
    return this.fetchImpl(req);
  }
  async put(key: string, data: Uint8Array) {
    assertKey(key);
    const res = await this.send(this.url(key), {
      method: 'PUT',
      body: data,
      headers: { 'content-type': 'application/gzip' },
    });
    if (!res.ok) throw new Error(`s3 put failed: ${res.status}`);
  }
  async get(key: string) {
    assertKey(key);
    const res = await this.send(this.url(key));
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`s3 get failed: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
  async delete(key: string) {
    assertKey(key);
    const res = await this.send(this.url(key), { method: 'DELETE' });
    if (!res.ok && res.status !== 404) throw new Error(`s3 delete failed: ${res.status}`);
  }
  async deletePrefix(prefix: string) {
    assertKey(prefix, { prefix: true });
    let n = 0;
    let token: string | undefined;
    do {
      const q = new URLSearchParams({ 'list-type': '2', prefix });
      if (token) q.set('continuation-token', token);
      const res = await this.send(`${this.base}?${q}`);
      if (!res.ok) throw new Error(`s3 list failed: ${res.status}`);
      const xml = await res.text();
      const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => decodeXml(m[1]!));
      for (const key of keys) {
        if (!key.startsWith(prefix)) continue;
        await this.delete(key);
        n++;
      }
      token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
        ? decodeXml(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml)?.[1] ?? '')
        : undefined;
    } while (token);
    return n;
  }
  async signedUrl(key: string, ttlSeconds: number) {
    assertKey(key);
    const u = new URL(this.url(key));
    u.searchParams.set('X-Amz-Expires', String(Math.max(1, Math.min(3600, Math.round(ttlSeconds)))));
    const req = await this.client.sign(u.toString(), { method: 'GET', aws: { signQuery: true } });
    return req.url;
  }
}

const decodeXml = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

export interface BlobStoreEnv {
  BLOB_STORE: 'local' | 's3';
  REPLAY_DIR?: string | undefined;
  S3_ENDPOINT?: string | undefined;
  S3_BUCKET?: string | undefined;
  S3_REGION?: string | undefined;
  S3_ACCESS_KEY_ID?: string | undefined;
  S3_SECRET_ACCESS_KEY?: string | undefined;
}

/** Picks the implementation from env (validated by @pulse/config). */
export function createBlobStore(env: BlobStoreEnv): BlobStore {
  if (env.BLOB_STORE === 's3') {
    const { S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = env;
    if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
      throw new Error(
        'BLOB_STORE=s3 needs S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY',
      );
    }
    return new S3BlobStore({
      endpoint: S3_ENDPOINT,
      bucket: S3_BUCKET,
      region: env.S3_REGION ?? 'auto',
      accessKeyId: S3_ACCESS_KEY_ID,
      secretAccessKey: S3_SECRET_ACCESS_KEY,
    });
  }
  return new LocalDiskBlobStore(env.REPLAY_DIR ?? DEFAULT_REPLAY_DIR);
}

/** Development default: next/.data/replays. Production must set REPLAY_DIR (enforced in @pulse/config). */
export const DEFAULT_REPLAY_DIR = resolve(
  dirname(new URL(import.meta.url).pathname),
  '..',
  '..',
  '..',
  '.data',
  'replays',
);
