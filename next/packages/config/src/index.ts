import { z } from 'zod';

/**
 * Environment schema for server processes (api, collector, worker).
 * Fails fast at boot with one readable message listing every problem.
 */

const PLACEHOLDER = /change[_-]?me|change[_-]?this|placeholder|secret123|example/i;

/** Rough Shannon entropy in bits for a secret string. */
export function entropyBits(value: string): number {
  if (!value) return 0;
  const counts = new Map<string, number>();
  for (const ch of value) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let perChar = 0;
  for (const n of counts.values()) {
    const p = n / value.length;
    perChar -= p * Math.log2(p);
  }
  return perChar * value.length;
}

const csv = z
  .string()
  .default('')
  .transform((s) =>
    s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
  );

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined));

/**
 * Blob storage for replay chunks (shared by api, collector and worker). Local disk today;
 * BLOB_STORE=s3 + S3_* moves to S3 / R2 / MinIO with no code change.
 */
const blobStoreShape = {
  BLOB_STORE: z.enum(['local', 's3']).default('local'),
  /** Root folder for LocalDiskBlobStore. Required in production when BLOB_STORE=local. */
  REPLAY_DIR: optionalString,
  S3_ENDPOINT: z.string().url().optional(),
  S3_BUCKET: optionalString,
  S3_REGION: optionalString,
  S3_ACCESS_KEY_ID: optionalString,
  S3_SECRET_ACCESS_KEY: optionalString,
  /**
   * Server-wide cap on days replay chunks are kept. Each org keeps what its plan allows (7 / 30 /
   * 90 days), never more than this.
   */
  REPLAY_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(90),
};

function checkBlobStore(
  env: { NODE_ENV: string; BLOB_STORE: 'local' | 's3'; REPLAY_DIR?: string | undefined } & Record<
    string,
    unknown
  >,
  ctx: z.RefinementCtx,
) {
  if (env.BLOB_STORE === 'local' && env.NODE_ENV === 'production' && !env.REPLAY_DIR) {
    ctx.addIssue({
      code: 'custom',
      path: ['REPLAY_DIR'],
      message: 'is required in production with BLOB_STORE=local',
    });
  }
  if (env.BLOB_STORE === 's3') {
    for (const k of ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']) {
      if (!env[k]) ctx.addIssue({ code: 'custom', path: [k], message: 'is required with BLOB_STORE=s3' });
    }
  }
}
const flag = z
  .enum(['0', '1', 'true', 'false'])
  .default('0')
  .transform((v) => v === '1' || v === 'true');

/** Telegram alerts. No token = alerts are off and Settings says so. */
const telegramEnv = {
  /** Bot token from @BotFather. Secret: never logged. */
  TELEGRAM_BOT_TOKEN: optionalString,
  /** The bot's @username (without @), for the "open in Telegram" link. */
  TELEGRAM_BOT_USERNAME: optionalString,
  /** Shared secret Telegram sends with webhook calls (setWebhook secret_token). */
  TELEGRAM_WEBHOOK_SECRET: optionalString,
};

/**
 * Web push (task 15). VAPID keys in the standard base64url form (`pnpm --filter @pulse/api
 * vapid:keys` makes a pair). No keys = push is off and Settings says "not configured".
 */
const pushEnv = {
  VAPID_PUBLIC_KEY: optionalString,
  /** Secret: never logged. */
  VAPID_PRIVATE_KEY: optionalString,
  /** Contact the push services can reach (mailto: or https:). */
  VAPID_SUBJECT: z
    .string()
    .regex(/^(mailto:|https:\/\/)/, 'must start with mailto: or https://')
    .default('mailto:hello@dxmpulse.et'),
};

const b64uLength = (v: string) => (/^[A-Za-z0-9_-]+$/.test(v) ? Buffer.from(v, 'base64url').length : -1);

/** Both VAPID keys or neither, each the right size. Values are never echoed. */
function checkVapid(
  env: { VAPID_PUBLIC_KEY?: string | undefined; VAPID_PRIVATE_KEY?: string | undefined },
  ctx: z.RefinementCtx,
) {
  const pub = env.VAPID_PUBLIC_KEY;
  const priv = env.VAPID_PRIVATE_KEY;
  if (Boolean(pub) !== Boolean(priv)) {
    ctx.addIssue({
      code: 'custom',
      path: ['VAPID_PUBLIC_KEY'],
      message: 'set both VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY, or neither',
    });
    return;
  }
  if (pub && b64uLength(pub) !== 65)
    ctx.addIssue({
      code: 'custom',
      path: ['VAPID_PUBLIC_KEY'],
      message: 'is not a base64url P-256 public key',
    });
  if (priv && b64uLength(priv) !== 32)
    ctx.addIssue({
      code: 'custom',
      path: ['VAPID_PRIVATE_KEY'],
      message: 'is not a base64url P-256 private key',
    });
}

/** Push is on only when both keys are set (and valid — the env schema checks that). */
export const pushConfigured = (env: { VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_KEY?: string }) =>
  Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

 * Billing through Chapa. No secret key = billing is "not configured": plans and usage still show,
 * but no pay links are made. CHAPA_MODE says which kind of payment this server accepts; it stays
 * `test` (no real money) until the founder switches it to `live` together with a live key.
 */
const billingEnv = {
  /** Chapa secret key (Bearer). Secret: never logged. */
  CHAPA_SECRET_KEY: optionalString,
  /** The "secret hash" set in Chapa's dashboard for webhooks; signs every webhook call. */
  CHAPA_WEBHOOK_SECRET: optionalString,
  CHAPA_MODE: z.enum(['test', 'live']).default('test'),
  /** Bearer token for the staff billing override endpoint. Unset = the endpoint answers 503. */
  BILLING_ADMIN_TOKEN: optionalString,
};
/** Pay links can be made and confirmed only with both the key and the webhook secret. */
export const billingConfigured = (env: { CHAPA_SECRET_KEY?: string; CHAPA_WEBHOOK_SECRET?: string }) =>
  Boolean(env.CHAPA_SECRET_KEY && env.CHAPA_WEBHOOK_SECRET);

function checkBilling(
  env: {
    NODE_ENV: string;
    CHAPA_SECRET_KEY?: string | undefined;
    CHAPA_WEBHOOK_SECRET?: string | undefined;
    CHAPA_MODE: 'test' | 'live';
    BILLING_ADMIN_TOKEN?: string | undefined;
  },
  ctx: z.RefinementCtx,
) {
  if (env.CHAPA_SECRET_KEY && !env.CHAPA_WEBHOOK_SECRET) {
    ctx.addIssue({
      code: 'custom',
      path: ['CHAPA_WEBHOOK_SECRET'],
      message: 'is required when CHAPA_SECRET_KEY is set (payments are confirmed by webhook)',
    });
  }
  // Chapa test keys carry TEST in the prefix; a live server must not run on one, or the reverse.
  if (env.CHAPA_SECRET_KEY && /TEST/i.test(env.CHAPA_SECRET_KEY) !== (env.CHAPA_MODE === 'test')) {
    ctx.addIssue({
      code: 'custom',
      path: ['CHAPA_MODE'],
      message:
        'does not match CHAPA_SECRET_KEY (a test key needs CHAPA_MODE=test, a live key CHAPA_MODE=live)',
    });
  }
  if (env.NODE_ENV !== 'production') return;
  for (const key of ['CHAPA_WEBHOOK_SECRET', 'BILLING_ADMIN_TOKEN'] as const) {
    const value = env[key];
    if (value && (PLACEHOLDER.test(value) || entropyBits(value) < 96)) {
      ctx.addIssue({
        code: 'custom',
        path: [key],
        message: 'looks weak or like a placeholder; generate one with `openssl rand -hex 32`',
      });
    }
  }
}

/** AI suggestions. Off by default; on only with AI_ENABLED=1 and a key. */
const aiEnv = {
  AI_ENABLED: flag,
  ANTHROPIC_API_KEY: optionalString,
  AI_MODEL: z.string().default('claude-sonnet-4-5'),
  /** AI calls per organization per calendar month (UTC). */
  AI_MONTHLY_BUDGET: z.coerce.number().int().min(0).default(100),
};

/** AI is usable only when switched on *and* configured. */
export const aiConfigured = (env: { AI_ENABLED: boolean; ANTHROPIC_API_KEY?: string }) =>
  env.AI_ENABLED && Boolean(env.ANTHROPIC_API_KEY);

export const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4100),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

    DATABASE_URL: z.string().url(),

    /** Public origin of the web app, e.g. https://app.dxmpulse.et */
    APP_URL: z.string().url().default('http://localhost:5174'),
    /** Public origin of the API, e.g. https://app.dxmpulse.et (when served under /api) */
    API_URL: z.string().url().default('http://localhost:4100'),
    /** Extra origins allowed to call the dashboard API with credentials. */
    TRUSTED_ORIGINS: csv,

    BETTER_AUTH_SECRET: z.string().min(32, 'must be at least 32 characters'),

    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,

    EMAIL_FROM: z.string().default('DXM Pulse <hello@dxmpulse.et>'),
    RESEND_API_KEY: optionalString,

    SENTRY_DSN: optionalString,
    /** Public base URL serving /sdk/p.js and /i (the collector), e.g. https://app.dxmpulse.et */
    COLLECTOR_PUBLIC_URL: z.string().url().default('http://localhost:4200'),
    /** Number of reverse proxies in front of the API (Caddy = 1). Drives client-IP detection. */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
    ...blobStoreShape,
    ...telegramEnv,
    ...pushEnv,
    ...aiEnv,
    ...billingEnv,
  })
  .superRefine((env, ctx) => {
    checkBlobStore(env, ctx);
    checkVapid(env, ctx);
    checkBilling(env, ctx);
    if (env.TELEGRAM_BOT_TOKEN && !env.TELEGRAM_BOT_USERNAME) {
      ctx.addIssue({
        code: 'custom',
        path: ['TELEGRAM_BOT_USERNAME'],
        message: 'is required when TELEGRAM_BOT_TOKEN is set',
      });
    }
    if (env.NODE_ENV !== 'production') return;
    if (env.TELEGRAM_BOT_TOKEN && !env.TELEGRAM_WEBHOOK_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['TELEGRAM_WEBHOOK_SECRET'],
        message: 'is required in production when TELEGRAM_BOT_TOKEN is set',
      });
    }
    const secret = env.BETTER_AUTH_SECRET;
    if (PLACEHOLDER.test(secret) || entropyBits(secret) < 128) {
      ctx.addIssue({
        code: 'custom',
        path: ['BETTER_AUTH_SECRET'],
        message: 'looks weak or like a placeholder; generate one with `openssl rand -base64 48`',
      });
    }
    if (!env.APP_URL.startsWith('https://')) {
      ctx.addIssue({ code: 'custom', path: ['APP_URL'], message: 'must be https in production' });
    }
    if (!env.RESEND_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['RESEND_API_KEY'],
        message: 'is required in production (email delivery)',
      });
    }
    if (Boolean(env.GOOGLE_CLIENT_ID) !== Boolean(env.GOOGLE_CLIENT_SECRET)) {
      ctx.addIssue({
        code: 'custom',
        path: ['GOOGLE_CLIENT_ID'],
        message: 'set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither',
      });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export class EnvError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment:\n${issues.map((i) => `  • ${i}`).join('\n')}`);
    this.name = 'EnvError';
  }
}

export function loadServerEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    throw new EnvError(result.error.issues.map((i) => `${i.path.join('.') || '(root)'} ${i.message}`));
  }
  return result.data;
}

/** Environment for the ingest collector (public, unauthenticated, hot path). */
export const collectorEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    COLLECTOR_PORT: z.coerce.number().int().positive().default(4200),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    DATABASE_URL: z.string().url(),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
    /** Lets headless browsers through the bot filter — tests only. */
    COLLECTOR_ALLOW_HEADLESS: z
      .enum(['0', '1', 'true', 'false'])
      .default('0')
      .transform((v) => v === '1' || v === 'true'),
    ...blobStoreShape,
  })
  .superRefine((env, ctx) => {
    checkBlobStore(env, ctx);
    if (env.NODE_ENV === 'production' && env.COLLECTOR_ALLOW_HEADLESS) {
      ctx.addIssue({
        code: 'custom',
        path: ['COLLECTOR_ALLOW_HEADLESS'],
        message: 'must be off in production',
      });
    }
  });
export type CollectorEnv = z.infer<typeof collectorEnvSchema>;

export function loadCollectorEnv(source: Record<string, string | undefined> = process.env): CollectorEnv {
  const result = collectorEnvSchema.safeParse(source);
  if (!result.success)
    throw new EnvError(result.error.issues.map((i) => `${i.path.join('.') || '(root)'} ${i.message}`));
  return result.data;
}

/** Environment for the background worker. */
export const workerEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    DATABASE_URL: z.string().url(),
    APP_URL: z.string().url().default('http://localhost:5174'),
    EMAIL_FROM: z.string().default('DXM Pulse <hello@dxmpulse.et>'),
    RESEND_API_KEY: optionalString,
    SENTRY_DSN: optionalString,
    WORKER_HEALTH_PORT: z.coerce.number().int().positive().default(4250),
    /**
     * Server-wide cap on raw visitor data (events, visits). Each org keeps what its plan allows,
     * never more than this (`retentionDaysFor` in @pulse/insights). Daily rollups are kept at
     * least 400 days.
     */
    DATA_RETENTION_DAYS: z.coerce.number().int().min(7).max(3650).default(90),
    ...blobStoreShape,
    ...telegramEnv,
    ...pushEnv,
    ...aiEnv,
  })
  .superRefine((env, ctx) => {
    checkBlobStore(env, ctx);
    checkVapid(env, ctx);
  });
export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export function loadWorkerEnv(source: Record<string, string | undefined> = process.env): WorkerEnv {
  const result = workerEnvSchema.safeParse(source);
  if (!result.success)
    throw new EnvError(result.error.issues.map((i) => `${i.path.join('.') || '(root)'} ${i.message}`));
  return result.data;
}
