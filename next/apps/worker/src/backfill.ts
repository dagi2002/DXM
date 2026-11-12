/**
 * On-demand rollup backfill: `pnpm --filter @pulse/worker backfill` (or `node dist/backfill.js`
 * in a deploy). Same job the worker runs on start; safe to run any number of times.
 */
import { loadWorkerEnv } from '@pulse/config';
import { createDatabase } from '@pulse/db';
import { backfillRollups } from '@pulse/insights/db';

const env = loadWorkerEnv();
const database = createDatabase(env.DATABASE_URL, { max: 2 });
try {
  const result = await backfillRollups(database.db);
  console.log(
    `rollup backfill: ${result.days} site-days rebuilt across ${result.sites} sites` +
      (result.stuck ? `, ${result.stuck} not completed (check the database clock)` : ''),
  );
} finally {
  await database.close();
}
