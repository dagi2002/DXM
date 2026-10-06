import { migrateDatabase } from '@pulse/db/migrate';
import { setupQueues } from './index';

/** Schema migrations + job queues + grants, in the order a fresh database needs them. */
export async function migrateAll(adminUrl: string, appRole = process.env.APP_DB_ROLE ?? 'pulse_app') {
  await migrateDatabase(adminUrl, { appRole });
  await setupQueues(adminUrl, appRole);
}
