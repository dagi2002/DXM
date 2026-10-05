/**
 * One-time local setup: creates the non-superuser application role (RLS is only enforced for
 * non-superusers) and the dev + test databases. Safe to re-run.
 *
 *   DATABASE_ADMIN_URL=postgres://you@localhost:5432/postgres pnpm db:setup
 */
import pg from 'pg';

const adminUrl = new URL(process.env.DATABASE_ADMIN_URL ?? 'postgres://localhost:5432/postgres');
const appRole = process.env.APP_DB_ROLE ?? 'pulse_app';
const appPassword = process.env.APP_DB_PASSWORD ?? 'pulse_app_dev';
const databases = (process.env.PULSE_DATABASES ?? 'pulse_dev,pulse_test').split(',').map((s) => s.trim());

if (process.env.NODE_ENV === 'production' && appPassword === 'pulse_app_dev') {
  throw new Error('Set APP_DB_PASSWORD to a strong value in production.');
}

const ident = (s: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`unsafe identifier: ${s}`);
  return `"${s}"`;
};

adminUrl.pathname = '/postgres';
const client = new pg.Client({ connectionString: adminUrl.toString() });
await client.connect();
try {
  const role = await client.query('select 1 from pg_roles where rolname = $1', [appRole]);
  const literal = client.escapeLiteral(appPassword);
  if (role.rowCount === 0) {
    await client.query(
      `create role ${ident(appRole)} login nosuperuser nobypassrls nocreatedb nocreaterole password ${literal}`,
    );
    console.log(`created role ${appRole}`);
  } else {
    await client.query(`alter role ${ident(appRole)} login nosuperuser nobypassrls password ${literal}`);
    console.log(`role ${appRole} exists (password refreshed)`);
  }
  for (const name of databases) {
    const exists = await client.query('select 1 from pg_database where datname = $1', [name]);
    if (exists.rowCount === 0) {
      await client.query(`create database ${ident(name)}`);
      console.log(`created database ${name}`);
    } else {
      console.log(`database ${name} exists`);
    }
  }
} finally {
  await client.end();
}
