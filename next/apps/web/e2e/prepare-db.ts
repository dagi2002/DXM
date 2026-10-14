import { createHash } from 'node:crypto';
import { migrateAll } from '@pulse/jobs/migrate-all';
import pg from 'pg';
const user = process.env.USER ?? 'postgres';
const E2E_ADMIN_DB = process.env.E2E_DATABASE_ADMIN_URL ?? `postgres://${user}@localhost:5432/pulse_e2e`;

/**
 * Creates (if needed), migrates and empties the e2e database. Runs as part of the API server
 * command, because Playwright starts webServers before globalSetup.
 */
async function prepare() {
  const serverUrl = new URL(E2E_ADMIN_DB);
  const dbName = serverUrl.pathname.slice(1);
  serverUrl.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: serverUrl.toString() });
  await admin.connect();
  const exists = await admin.query('select 1 from pg_database where datname = $1', [dbName]);
  if (exists.rowCount === 0) await admin.query(`create database "${dbName}"`);
  await admin.end();

  await migrateAll(E2E_ADMIN_DB);

  const db = new pg.Client({ connectionString: E2E_ADMIN_DB });
  await db.connect();
  await db.query(
    'truncate "events", "ingest_dedupe", "visits", "audit_log", "two_factor", "sites", "org_plans", "invitation", "member", "organization", "verification", "account", "session", "user" cascade',
  );
  await seedReports(db);
  await db.end();
}

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

/**
 * A shared client report the public-link tests pin (`/r/demo-september`), plus links that are
 * expired and turned off. Tokens are stored hashed, exactly as the API stores them.
 */
async function seedReports(db: pg.Client) {
  await db.query(
    `insert into organization (id, name, slug, created_at) values ('org_e2e_demo', 'Demo Agency', 'demo-agency-e2e', now())`,
  );
  await db.query(
    `insert into sites (id, org_id, name, domain, public_key, allowed_origins, status)
     values ('site_e2e_demo', 'org_e2e_demo', 'Demo shop', 'demostore.et', 'pk_e2e_demo_reports', '{}', 'live')`,
  );
  const fix = (
    number: number,
    kind: 'rage_click' | 'dead_click',
    path: string,
    selector: string,
    fixedAt: string,
    before: number,
    after: number,
  ) => ({
    number,
    kind,
    path,
    selector,
    status: 'verified',
    fixedAt,
    verifiedAt: new Date(Date.parse(fixedAt) + 7 * 86_400_000).toISOString(),
    before: { perDay: before, days: 7 },
    after: { perDay: after, days: 7 },
  });
  const snapshot = {
    version: 1,
    generatedAt: '2026-10-01T04:23:00.000Z',
    period: '2026-09',
    periodStart: '2026-09-01T00:00:00.000Z',
    periodEnd: '2026-10-01T00:00:00.000Z',
    partial: false,
    site: { name: 'Demo shop', domain: 'demostore.et' },
    agency: 'Demo Agency',
    enoughData: true,
    kpis: {
      visits: { value: 34180, previous: 34010 },
      pageviews: { value: 81240, previous: 77920 },
      bounceRate: { value: 0.31, previous: 0.38 },
      lcp: { value: 3100, previous: 4500 },
    },
    trend: [
      { start: '2026-09-01', visits: 7710, fixesShipped: 0 },
      { start: '2026-09-08', visits: 7890, fixesShipped: 1 },
      { start: '2026-09-15', visits: 8020, fixesShipped: 2 },
      { start: '2026-09-22', visits: 8310, fixesShipped: 1 },
      { start: '2026-09-29', visits: 2250, fixesShipped: 0 },
    ],
    fixed: [
      fix(3, 'rage_click', '/products/*', 'button.size-picker', '2026-09-09T08:00:00.000Z', 46, 2),
      fix(5, 'dead_click', '/products/*', 'img.gallery', '2026-09-15T08:00:00.000Z', 31, 4),
      fix(6, 'rage_click', '/checkout/address', 'button.save-address', '2026-09-18T08:00:00.000Z', 22, 3),
      fix(8, 'dead_click', '/promo', 'a.channel-link', '2026-09-23T08:00:00.000Z', 15, 0),
    ],
    open: [
      {
        number: 11,
        kind: 'rage_click',
        path: '/signup',
        selector: 'input.phone',
        severity: 'critical',
        visits: 41,
      },
    ],
  };
  await db.query(
    `insert into reports (id, org_id, site_id, period, source, snapshot)
     values ('rpt_e2e_september', 'org_e2e_demo', 'site_e2e_demo', '2026-09', 'auto', $1)`,
    [JSON.stringify(snapshot)],
  );
  const shares: [string, string, string | null][] = [
    ['demo-september', "now() + interval '365 days'", null],
    ['demo-expired', "now() - interval '1 day'", null],
    ['demo-revoked', "now() + interval '30 days'", 'now()'],
  ];
  for (const [token, expires, revoked] of shares) {
    await db.query(
      `insert into report_shares (id, org_id, report_id, token_hash, expires_at, revoked_at)
       values ($1, 'org_e2e_demo', 'rpt_e2e_september', $2, ${expires}, ${revoked ?? 'null'})`,
      [`rsh_e2e_${token.replace(/-/g, '_')}`, sha256(token)],
    );
  }
}

await prepare();
