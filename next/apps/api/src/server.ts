import { serve } from '@hono/node-server';
import { getConnInfo } from '@hono/node-server/conninfo';
import { loadServerEnv } from '@pulse/config';
import { createDatabase } from '@pulse/db';
import * as Sentry from '@sentry/node';
import pino from 'pino';
import { createApp } from './app';
import { createAuth } from './auth';
import { ConsoleMailer, ResendMailer } from './mailer';

const env = loadServerEnv();
const log = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: ['req.headers.cookie', 'req.headers.authorization', '*.password', '*.token'],
    censor: '[redacted]',
  },
});

if (env.SENTRY_DSN) Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV, tracesSampleRate: 0.1 });

const database = createDatabase(env.DATABASE_URL);
const mailer = env.RESEND_API_KEY
  ? new ResendMailer(env.RESEND_API_KEY, env.EMAIL_FROM)
  : new ConsoleMailer(log);
const auth = createAuth({ db: database.db, env, mailer });
const app = createApp({
  env,
  db: database.db,
  auth,
  mailer,
  log,
  peerAddress: (_raw, c) => getConnInfo(c as Parameters<typeof getConnInfo>[0]).remote.address,
});

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  log.info({ port: info.port, env: env.NODE_ENV }, 'api listening');
});

const shutdown = (signal: string) => {
  log.info({ signal }, 'shutting down');
  server.close(async () => {
    await database.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
