/**
 * Applies migrations as the owner role, then grants the application role DML only.
 * Fails loudly — never boots an app on a half-migrated schema.
 *
 *   DATABASE_ADMIN_URL=postgres://you@localhost:5432/pulse_dev pnpm db:migrate
 */
import { fileURLToPath } from 'node:url';
import { migrateDatabase } from '../src/migrate';

const url = process.env.DATABASE_ADMIN_URL;
if (!url) throw new Error('DATABASE_ADMIN_URL is required');

await migrateDatabase(url, {
  appRole: process.env.APP_DB_ROLE ?? 'pulse_app',
  migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
});
console.log('migrations applied');
