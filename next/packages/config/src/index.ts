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
    /** Number of reverse proxies in front of the API (Caddy = 1). Drives client-IP detection. */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
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
