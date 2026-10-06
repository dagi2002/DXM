import { migrateAll } from '@pulse/jobs/migrate-all';
import { TEST_DATABASE_ADMIN_URL } from './helpers';

/** Brings the test database to the latest schema once per run. */
export default async function setup() {
  await migrateAll(TEST_DATABASE_ADMIN_URL);
}
