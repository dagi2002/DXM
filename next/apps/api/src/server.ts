import { serve } from '@hono/node-server';
import { getConnInfo } from '@hono/node-server/conninfo';
import { loadServerEnv, pushConfigured } from '@pulse/config';
import { createDatabase } from '@pulse/db';
import * as Sentry from '@sentry/node';
import pino from 'pino';
import { createApp } from './app';
import { createAuth } from './auth';
import { ConsoleMailer, ResendMailer } from '@pulse/mail';
import { HttpTelegramClient } from '@pulse/mail/telegram';
import { HttpPushClient } from '@pulse/mail/push';
import { registerTelegramWebhook } from './telegram-webhook';

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
  telegram: env.TELEGRAM_BOT_TOKEN ? new HttpTelegramClient(env.TELEGRAM_BOT_TOKEN) : undefined,
  push: pushConfigured(env)
    ? new HttpPushClient({
        publicKey: env.VAPID_PUBLIC_KEY!,
        privateKey: env.VAPID_PRIVATE_KEY!,
        subject: env.VAPID_SUBJECT,
      })
    : undefined,
  peerAddress: (_raw, c) => getConnInfo(c as Parameters<typeof getConnInfo>[0]).remote.address,
});

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  log.info({ port: info.port, env: env.NODE_ENV }, 'api listening');
});

// Point Telegram at our webhook (idempotent; skipped without a token or secret). Never blocks
// startup, and the result never contains the token or the secret.
void registerTelegramWebhook({
  token: env.TELEGRAM_BOT_TOKEN,
  secret: env.TELEGRAM_WEBHOOK_SECRET,
  publicUrl: env.API_URL,
}).then((result) =>
  result.status === 'failed'
    ? log.warn({ telegramWebhook: result.status, error: result.error }, 'telegram webhook not registered')
    : log.info({ telegramWebhook: result.status }, 'telegram webhook'),
);

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
