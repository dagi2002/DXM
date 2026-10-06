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
    'truncate "events", "ingest_dedupe", "visits", "audit_log", "sites", "org_plans", "invitation", "member", "organization", "verification", "account", "session", "user" cascade',
  );
  await db.end();
}

await prepare();
