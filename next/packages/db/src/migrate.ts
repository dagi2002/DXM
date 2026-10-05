import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../drizzle', import.meta.url));

/** Applies all pending migrations, then (re)grants the app role DML on every table. */
export async function migrateDatabase(
  adminUrl: string,
  opts: { appRole?: string; migrationsFolder?: string } = {},
): Promise<void> {
  const appRole = opts.appRole ?? 'pulse_app';
  if (!/^[a-z_][a-z0-9_]*$/.test(appRole)) throw new Error(`unsafe role name: ${appRole}`);
  const pool = new pg.Pool({ connectionString: adminUrl, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: opts.migrationsFolder ?? MIGRATIONS_FOLDER });
    await pool.query(`
      grant usage on schema public to ${appRole};
      grant select, insert, update, delete on all tables in schema public to ${appRole};
      grant usage, select on all sequences in schema public to ${appRole};
      alter default privileges in schema public grant select, insert, update, delete on tables to ${appRole};
      alter default privileges in schema public grant usage, select on sequences to ${appRole};
    `);
  } finally {
    await pool.end();
  }
}
