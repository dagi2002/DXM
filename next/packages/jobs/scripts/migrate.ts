/**
 * Applies database migrations and job-queue setup as the owner role. Fails loudly.
 *   DATABASE_ADMIN_URL=postgres://you@localhost:5432/pulse_dev pnpm db:migrate
 */
import { migrateAll } from '../src/migrate-all';

const url = process.env.DATABASE_ADMIN_URL;
if (!url) throw new Error('DATABASE_ADMIN_URL is required');
await migrateAll(url);
console.log('migrations and queues applied');
