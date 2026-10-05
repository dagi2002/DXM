import { loadServerEnv } from '@pulse/config';
import { createDatabase, type Database } from '@pulse/db';
import pino from 'pino';
import pg from 'pg';
import { createApp, type App } from '../src/app';
import { createAuth } from '../src/auth';
import { MemoryMailer } from '../src/mailer';

const user = process.env.USER ?? 'postgres';
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://pulse_app:pulse_app_dev@localhost:5432/pulse_test';
export const TEST_DATABASE_ADMIN_URL =
  process.env.TEST_DATABASE_ADMIN_URL ?? `postgres://${user}@localhost:5432/pulse_test`;
export const APP_URL = 'http://localhost:5174';

const TABLES = [
  'audit_log',
  'sites',
  'org_plans',
  'invitation',
  'member',
  'organization',
  'verification',
  'account',
  'session',
  'user',
];

export async function resetDatabase() {
  const client = new pg.Client({ connectionString: TEST_DATABASE_ADMIN_URL });
  await client.connect();
  try {
    await client.query(`truncate ${TABLES.map((t) => `"${t}"`).join(', ')} cascade`);
  } finally {
    await client.end();
  }
}

/** Runs SQL as the owner role (bypasses RLS) — for arranging fixtures only. */
export async function adminQuery<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  values: unknown[] = [],
) {
  const client = new pg.Client({ connectionString: TEST_DATABASE_ADMIN_URL });
  await client.connect();
  try {
    return await client.query<T>(text, values);
  } finally {
    await client.end();
  }
}

export interface TestContext {
  app: App;
  database: Database;
  mailer: MemoryMailer;
}

export function createTestContext(overrides: Record<string, string> = {}): TestContext {
  const env = loadServerEnv({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DATABASE_URL,
    APP_URL,
    API_URL: 'http://localhost:4100',
    BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-0123456789',
    TRUST_PROXY_HOPS: '1',
    ...overrides,
  });
  const database = createDatabase(env.DATABASE_URL, { max: 4 });
  const mailer = new MemoryMailer();
  const auth = createAuth({ db: database.db, env, mailer });
  const app = createApp({
    env,
    db: database.db,
    auth,
    mailer,
    log: pino({ level: 'silent' }),
    peerAddress: () => '127.0.0.1',
  });
  return { app, database, mailer };
}

/** Minimal cookie-carrying client for app.request(). */
export class Client {
  private cookies = new Map<string, string>();
  constructor(
    private readonly app: App,
    private readonly origin = APP_URL,
  ) {}

  async request(
    path: string,
    init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
  ) {
    const headers: Record<string, string> = { origin: this.origin, ...init.headers };
    if (this.cookies.size) headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    if (init.body !== undefined) headers['content-type'] = 'application/json';
    const res = await this.app.request(path, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    for (const raw of res.headers.getSetCookie()) {
      const [pair] = raw.split(';');
      const idx = pair!.indexOf('=');
      const name = pair!.slice(0, idx);
      const value = pair!.slice(idx + 1);
      if (value === '' || /max-age=0/i.test(raw)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { status: res.status, headers: res.headers, body: json as any };
  }

  get = (path: string) => this.request(path);
  post = (path: string, body: unknown = {}) => this.request(path, { method: 'POST', body });
  patch = (path: string, body: unknown) => this.request(path, { method: 'PATCH', body });
  delete = (path: string, body?: unknown) => this.request(path, { method: 'DELETE', body });
}

export async function signUp(
  app: App,
  email: string,
  opts: { name?: string; password?: string; locale?: string } = {},
) {
  const client = new Client(app);
  const res = await client.post('/api/auth/sign-up/email', {
    email,
    password: opts.password ?? 'correct horse battery',
    name: opts.name ?? email.split('@')[0],
    ...(opts.locale ? { locale: opts.locale } : {}),
  });
  if (res.status !== 200) throw new Error(`sign-up failed ${res.status}: ${JSON.stringify(res.body)}`);
  return client;
}

/** Signs up and creates an organization (which becomes the session's active org). */
export async function signUpWithOrg(app: App, email: string, orgName = `Org ${email}`) {
  const client = await signUp(app, email);
  const slug = `${orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Math.random().toString(36).slice(2, 7)}`;
  const res = await client.post('/api/auth/organization/create', { name: orgName, slug });
  if (res.status !== 200) throw new Error(`org create failed ${res.status}: ${JSON.stringify(res.body)}`);
  return { client, orgId: res.body.id as string };
}
