import { migrateDatabase } from '@pulse/db/migrate';
import { TEST_DATABASE_ADMIN_URL } from './helpers';

/** Brings the test database to the latest schema once per run. */
export default async function setup() {
  await migrateDatabase(TEST_DATABASE_ADMIN_URL, { appRole: process.env.APP_DB_ROLE ?? 'pulse_app' });
}
