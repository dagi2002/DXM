import { migrateAll } from '@pulse/jobs/migrate-all';

const user = process.env.USER ?? 'postgres';
export default async function setup() {
  await migrateAll(process.env.TEST_DATABASE_ADMIN_URL ?? `postgres://${user}@localhost:5432/pulse_test`);
}
