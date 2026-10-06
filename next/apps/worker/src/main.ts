import { createServer } from 'node:http';
import { loadWorkerEnv } from '@pulse/config';
import type { IngestJob } from '@pulse/contracts/ingest';
import { createDatabase, sql } from '@pulse/db';
import { createBoss, sendJob } from '@pulse/jobs';
import { ConsoleMailer, ResendMailer } from '@pulse/mail';
import pino from 'pino';
import { applyIngest } from './ingest';
import { notifySiteLive } from './notify';

const env = loadWorkerEnv();
const log = pino({ level: env.LOG_LEVEL });
const database = createDatabase(env.DATABASE_URL, { max: 8 });
const db = database.db;
const mailer = env.RESEND_API_KEY
  ? new ResendMailer(env.RESEND_API_KEY, env.EMAIL_FROM)
  : new ConsoleMailer(log);
const boss = createBoss(env.DATABASE_URL, { max: 6 });
boss.on('error', (err) => log.error({ err }, 'pg-boss error'));
await boss.start();

let lastIngestAt = 0;

await boss.work<IngestJob>('ingest.apply', { batchSize: 20, pollingIntervalSeconds: 0.5 }, async (jobs) => {
  for (const job of jobs) {
    const result = await applyIngest(db, job.data);
    lastIngestAt = Date.now();
    if (result.becameLive)
      await sendJob(boss, 'site.live', { siteId: job.data.siteId, orgId: job.data.orgId });
    log.debug(
      { siteId: job.data.siteId, events: job.data.batch.ev.length, status: result.status },
      'ingest applied',
    );
  }
});

await boss.work<{ siteId: string; orgId: string }>('site.live', async (jobs) => {
  for (const job of jobs) {
    const sent = await notifySiteLive(db, mailer, env.APP_URL, job.data);
    log.info({ siteId: job.data.siteId, sent }, 'site live notification');
  }
});

await boss.work('maintenance.partitions', async () => {
  const res = await db.execute<{ n: number }>(sql`select pulse_ensure_event_partitions(3) as n`);
  log.info({ created: res.rows[0]?.n }, 'event partitions ensured');
});
await boss.work('maintenance.close-visits', async () => {
  const res = await db.execute<{ n: number }>(sql`select pulse_close_idle_visits(30) as n`);
  if (res.rows[0]?.n) log.info({ closed: res.rows[0].n }, 'idle visits closed');
});
await boss.work('maintenance.purge-dedupe', async () => {
  await db.execute(sql`select pulse_purge_ingest_dedupe(48)`);
});

// Schedules are idempotent (keyed by queue name).
await boss.schedule('maintenance.partitions', '7 * * * *');
await boss.schedule('maintenance.close-visits', '* * * * *');
await boss.schedule('maintenance.purge-dedupe', '17 3 * * *');
await sendJob(boss, 'maintenance.partitions', {}); // on boot too

// Health endpoint for the orchestrator / uptime checks.
const health = createServer(async (req, res) => {
  if (req.url !== '/livez' && req.url !== '/readyz') {
    res.writeHead(404).end();
    return;
  }
  try {
    await db.execute(sql`select 1`);
    res
      .writeHead(200, { 'content-type': 'application/json' })
      .end(JSON.stringify({ status: 'ok', lastIngestAt: lastIngestAt || null }));
  } catch {
    res.writeHead(503).end(JSON.stringify({ status: 'degraded' }));
  }
}).listen(env.WORKER_HEALTH_PORT, () => log.info({ port: env.WORKER_HEALTH_PORT }, 'worker started'));

const shutdown = async () => {
  health.close();
  await boss.stop({ graceful: true, timeout: 10_000 });
  await database.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
