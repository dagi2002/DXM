import { createServer } from 'node:http';
import { aiConfigured, loadWorkerEnv } from '@pulse/config';
import type { IngestJob } from '@pulse/contracts/ingest';
import type { ReplayChunkJob } from '@pulse/contracts/replays';
import { createDatabase, sql } from '@pulse/db';
import { createBoss, sendJob } from '@pulse/jobs';
import { ConsoleMailer, ResendMailer } from '@pulse/mail';
import { createBlobStore } from '@pulse/storage';
import { HttpTelegramClient } from '@pulse/mail/telegram';
import type { TelegramAlertJob } from '@pulse/jobs';
import pino from 'pino';
import { AnthropicClient, recommendFix } from './ai';
import { alertJobFor, sendTelegramAlert } from './alerts';
import { detectSite, sweepDetection } from './detect';
import { rollupSite } from '@pulse/insights/db';
import { sweepInsights } from './insights';
import { sweepTracking } from './tracking';
import { sweepVerification, verifyIssue } from './verify';
import { applyIngest } from './ingest';
import { notifySiteLive } from './notify';
import { applyReplayChunk, purgeReplays } from './replays';

const env = loadWorkerEnv();
const log = pino({ level: env.LOG_LEVEL });
const database = createDatabase(env.DATABASE_URL, { max: 8 });
const db = database.db;
const mailer = env.RESEND_API_KEY
  ? new ResendMailer(env.RESEND_API_KEY, env.EMAIL_FROM)
  : new ConsoleMailer(log);
const blobs = createBlobStore(env);
const telegram = env.TELEGRAM_BOT_TOKEN ? new HttpTelegramClient(env.TELEGRAM_BOT_TOKEN) : null;
const aiEnabled = aiConfigured(env);
const ai = aiEnabled ? new AnthropicClient(env.ANTHROPIC_API_KEY!, env.AI_MODEL) : null;
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

// Session replay (slice 4): the collector wrote the blob; record its metadata.
await boss.work<ReplayChunkJob>(
  'replay.chunk',
  { batchSize: 20, pollingIntervalSeconds: 0.5 },
  async (jobs) => {
    for (const job of jobs) {
      const status = await applyReplayChunk(db, blobs, job.data);
      log.debug({ siteId: job.data.siteId, seq: job.data.seq, status }, 'replay chunk applied');
    }
  },
);
await boss.work('maintenance.replay-retention', async () => {
  const res = await purgeReplays(db, blobs, env.REPLAY_RETENTION_DAYS);
  if (res.rows) log.info(res, 'old replays deleted');
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

// Fix detection (slice 3): a sweep fans out one staggered run per recently active site.
await boss.work('detect.sweep', async () => {
  const queued = await sweepDetection(db, boss);
  if (queued) log.debug({ sites: queued }, 'detection queued');
});
/** Follow-ups for issues that are news: a Telegram alert, and AI suggestions for new/reopened ones. */
async function afterDetection(
  site: { siteId: string; orgId: string },
  result: { created: string[]; escalated: string[]; reopened: string[] },
) {
  const alert = alertJobFor(site, result);
  if (!alert) return;
  log.info({ siteId: site.siteId, ...result }, 'fixes detected');
  if (telegram) await sendJob(boss, 'alert.telegram', alert);
  if (aiEnabled) {
    for (const issueId of [...result.created, ...result.reopened]) {
      await sendJob(boss, 'ai.recommend', { issueId, orgId: site.orgId }, { singletonKey: issueId });
    }
  }
}

await boss.work<{ siteId: string; orgId: string }>('detect.site', async (jobs) => {
  for (const job of jobs) await afterDetection(job.data, await detectSite(db, job.data));
});

// Tracking-broken runs on a schedule: a broken site produces no activity to trigger on.
await boss.work('detect.tracking', async () => {
  for (const r of await sweepTracking(db)) {
    await afterDetection(r, r);
    if (r.resumed.length) log.info({ siteId: r.siteId, resumed: r.resumed }, 'tracking resumed');
  }
});

// Fix verification: before/after once the after-window is complete.
await boss.work('issue.verify-sweep', async () => {
  const queued = await sweepVerification(db, boss);
  if (queued) log.debug({ issues: queued }, 'verification queued');
});
await boss.work<{ issueId: string; orgId: string }>('issue.verify', async (jobs) => {
  for (const job of jobs) {
    const result = await verifyIssue(db, job.data);
    log.info({ issueId: job.data.issueId, status: result.status }, 'fix verification');
    if (result.status === 'reopened' && result.siteId) {
      const site = { siteId: result.siteId, orgId: job.data.orgId };
      await afterDetection(site, { created: [], escalated: [], reopened: [job.data.issueId] });
    }
  }
});

await boss.work<TelegramAlertJob>('alert.telegram', async (jobs) => {
  for (const job of jobs) {
    if (!telegram) continue;
    const result = await sendTelegramAlert(db, telegram, env.APP_URL, job.data);
    // Quiet hours: send the same job again when they end.
    if (result.status === 'deferred')
      await sendJob(boss, 'alert.telegram', job.data, { startAfter: result.until });
    log.info({ orgId: job.data.orgId, status: result.status }, 'telegram alert');
  }
});

await boss.work<{ issueId: string; orgId: string }>('ai.recommend', async (jobs) => {
  for (const job of jobs) {
    const result = await recommendFix(
      db,
      ai,
      { enabled: aiEnabled, monthlyBudget: env.AI_MONTHLY_BUDGET },
      job.data,
    );
    log.info({ issueId: job.data.issueId, status: result.status }, 'ai recommendation');
  }
});

// Site insights (slice 5): daily rollups, so dashboards never scan raw events per request.
await boss.work('insights.sweep', async () => {
  const queued = await sweepInsights(db, boss);
  if (queued) log.debug({ sites: queued }, 'insight rollups queued');
});
await boss.work<{ siteId: string; orgId: string }>('insights.site', async (jobs) => {
  for (const job of jobs) {
    const result = await rollupSite(db, job.data);
    log.debug({ siteId: job.data.siteId, ...result }, 'insight rollups refreshed');
  }
});

// Schedules are idempotent (keyed by queue name).
await boss.schedule('maintenance.partitions', '7 * * * *');
await boss.schedule('maintenance.close-visits', '* * * * *');
await boss.schedule('maintenance.purge-dedupe', '17 3 * * *');
await boss.schedule('maintenance.replay-retention', '37 3 * * *');
await boss.schedule('detect.sweep', '*/2 * * * *');
await boss.schedule('insights.sweep', '*/10 * * * *');
await boss.schedule('detect.tracking', '23 * * * *');
await boss.schedule('issue.verify-sweep', '41 * * * *');
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
