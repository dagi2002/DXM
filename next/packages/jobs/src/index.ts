import type { IngestJob } from '@pulse/contracts/ingest';
import { PgBoss, type ConstructorOptions } from 'pg-boss';
import pg from 'pg';

export const BOSS_SCHEMA = 'pgboss';

/** Every queue in the system, with its retry policy. Created once by the owner role (setupQueues). */
export const QUEUES = {
  ingestDead: { name: 'ingest.dead', options: { retryLimit: 0 } },
  ingest: {
    name: 'ingest.apply',
    options: { retryLimit: 5, retryBackoff: true, retryDelay: 2, deadLetter: 'ingest.dead' },
  },
  siteLive: { name: 'site.live', options: { retryLimit: 5, retryBackoff: true } },
  partitions: { name: 'maintenance.partitions', options: { retryLimit: 2 } },
  closeVisits: { name: 'maintenance.close-visits', options: { retryLimit: 1 } },
  purgeDedupe: { name: 'maintenance.purge-dedupe', options: { retryLimit: 2 } },
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES]['name'];

export interface JobPayloads {
  'ingest.apply': IngestJob;
  'site.live': { siteId: string; orgId: string };
  'maintenance.partitions': Record<string, never>;
  'maintenance.close-visits': Record<string, never>;
  'maintenance.purge-dedupe': Record<string, never>;
}

/** A pg-boss client for application roles: never migrates or creates schema objects itself. */
export function createBoss(connectionString: string, opts: Partial<ConstructorOptions> = {}) {
  return new PgBoss({
    connectionString,
    schema: BOSS_SCHEMA,
    migrate: false,
    createSchema: false,
    ...opts,
  });
}

export type Boss = ReturnType<typeof createBoss>;

/** Typed send. */
export function sendJob<Q extends keyof JobPayloads>(
  boss: Boss,
  queue: Q,
  data: JobPayloads[Q],
  options?: Parameters<Boss['send']>[2],
) {
  return boss.send(queue, data as object, options);
}

/**
 * Installs/upgrades pg-boss's schema and creates queues as the owner role, then grants the app
 * role the DML it needs. Safe to re-run.
 */
export async function setupQueues(adminUrl: string, appRole = 'pulse_app'): Promise<void> {
  if (!/^[a-z_][a-z0-9_]*$/.test(appRole)) throw new Error(`unsafe role name: ${appRole}`);
  const boss = new PgBoss({
    connectionString: adminUrl,
    schema: BOSS_SCHEMA,
    supervise: false,
    schedule: false,
  });
  boss.on('error', () => {});
  await boss.start();
  try {
    for (const q of Object.values(QUEUES)) {
      if (!(await boss.getQueue(q.name))) await boss.createQueue(q.name, q.options);
    }
  } finally {
    await boss.stop({ graceful: false });
  }
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(`
      grant usage on schema ${BOSS_SCHEMA} to ${appRole};
      grant select, insert, update, delete on all tables in schema ${BOSS_SCHEMA} to ${appRole};
      grant usage, select on all sequences in schema ${BOSS_SCHEMA} to ${appRole};
      grant execute on all functions in schema ${BOSS_SCHEMA} to ${appRole};
      alter default privileges in schema ${BOSS_SCHEMA} grant select, insert, update, delete on tables to ${appRole};
      alter default privileges in schema ${BOSS_SCHEMA} grant usage, select on sequences to ${appRole};
    `);
  } finally {
    await client.end();
  }
}
