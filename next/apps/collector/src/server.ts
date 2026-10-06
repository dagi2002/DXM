import { serve } from '@hono/node-server';
import { getConnInfo } from '@hono/node-server/conninfo';
import { fileURLToPath } from 'node:url';
import { loadCollectorEnv } from '@pulse/config';
import { createDatabase, sql } from '@pulse/db';
import { createBoss, sendJob } from '@pulse/jobs';
import pino from 'pino';
import { createCollector } from './app';

const env = loadCollectorEnv();
const log = pino({ level: env.LOG_LEVEL });
const database = createDatabase(env.DATABASE_URL, { max: 5 });
const boss = createBoss(env.DATABASE_URL, { supervise: false, schedule: false, max: 5 });
boss.on('error', (err) => log.error({ err }, 'pg-boss error'));
await boss.start();

const app = createCollector({
  log,
  allowHeadless: env.COLLECTOR_ALLOW_HEADLESS,
  trustedProxyHops: env.TRUST_PROXY_HOPS,
  sdkDir: process.env.SDK_DIST_DIR ?? fileURLToPath(new URL('../../../packages/sdk/dist', import.meta.url)),
  peerAddress: (c) => getConnInfo(c).remote.address,
  lookupSite: async (key) => {
    const res = await database.db.execute<{ id: string; org_id: string; allowed_origins: string[] }>(
      sql`select id, org_id, allowed_origins from pulse_site_by_public_key(${key})`,
    );
    const row = res.rows[0];
    return row ? { id: row.id, orgId: row.org_id, allowedOrigins: row.allowed_origins } : null;
  },
  enqueue: async (job) => {
    await sendJob(boss, 'ingest.apply', job);
  },
});

const server = serve({ fetch: app.fetch, port: env.COLLECTOR_PORT }, (info) =>
  log.info({ port: info.port }, 'collector listening'),
);

const shutdown = () => {
  server.close(async () => {
    await boss.stop({ graceful: true, timeout: 5000 });
    await database.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
