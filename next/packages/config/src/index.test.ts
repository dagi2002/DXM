import { describe, expect, it } from 'vitest';
import { EnvError, aiConfigured, entropyBits, loadServerEnv, loadWorkerEnv } from './index';

const STRONG = 'k3Jx9vQ2pL7mN4bR8tW1yZ6cF5hG0dS2aE9uI3oP7lK4jH6g';
const base = { DATABASE_URL: 'postgres://u:p@localhost:5432/pulse', BETTER_AUTH_SECRET: STRONG };

describe('loadServerEnv', () => {
  it('applies defaults in development', () => {
    const env = loadServerEnv(base);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(4100);
    expect(env.TRUSTED_ORIGINS).toEqual([]);
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
  });

  it('parses comma-separated origins and treats blank optionals as unset', () => {
    const env = loadServerEnv({ ...base, TRUSTED_ORIGINS: 'https://a.et, https://b.et ,', SENTRY_DSN: '  ' });
    expect(env.TRUSTED_ORIGINS).toEqual(['https://a.et', 'https://b.et']);
    expect(env.SENTRY_DSN).toBeUndefined();
  });

  it('lists every problem in one error', () => {
    try {
      loadServerEnv({ BETTER_AUTH_SECRET: 'short' });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(EnvError);
      const msg = (err as EnvError).message;
      expect(msg).toContain('DATABASE_URL');
      expect(msg).toContain('BETTER_AUTH_SECRET');
    }
  });

  it('refuses weak or placeholder secrets in production', () => {
    const prod = {
      ...base,
      NODE_ENV: 'production',
      APP_URL: 'https://app.dxmpulse.et',
      RESEND_API_KEY: 're_x',
    };
    expect(() =>
      loadServerEnv({ ...prod, BETTER_AUTH_SECRET: 'change_this_in_production_min_32_chars' }),
    ).toThrow(/placeholder/);
    expect(() => loadServerEnv({ ...prod, BETTER_AUTH_SECRET: 'a'.repeat(40) })).toThrow(/weak/);
    expect(loadServerEnv(prod).NODE_ENV).toBe('production');
  });

  it('requires https, email delivery and paired OAuth credentials in production', () => {
    const prod = { ...base, NODE_ENV: 'production' };
    const msg = (() => {
      try {
        loadServerEnv({ ...prod, GOOGLE_CLIENT_ID: 'id' });
        return '';
      } catch (e) {
        return (e as Error).message;
      }
    })();
    expect(msg).toContain('APP_URL must be https');
    expect(msg).toContain('RESEND_API_KEY');
    expect(msg).toContain('GOOGLE_CLIENT_SECRET');
  });
});

describe('entropyBits', () => {
  it('is low for repeated characters and high for random strings', () => {
    expect(entropyBits('aaaaaaaa')).toBe(0);
    expect(entropyBits(STRONG)).toBeGreaterThan(128);
  });
});

describe('Telegram and AI settings', () => {
  it('keeps AI off by default and on only with the switch and a key', () => {
    const env = loadServerEnv(base);
    expect(env.AI_ENABLED).toBe(false);
    expect(aiConfigured(env)).toBe(false);
    expect(aiConfigured(loadServerEnv({ ...base, AI_ENABLED: '1' }))).toBe(false);
    expect(aiConfigured(loadServerEnv({ ...base, AI_ENABLED: 'true', ANTHROPIC_API_KEY: 'sk-x' }))).toBe(
      true,
    );
    const worker = loadWorkerEnv({ DATABASE_URL: base.DATABASE_URL, AI_MONTHLY_BUDGET: '5' });
    expect(worker.AI_MONTHLY_BUDGET).toBe(5);
    expect(worker.TELEGRAM_BOT_TOKEN).toBeUndefined();
  });

  it('needs the bot username with a token, and a webhook secret in production', () => {
    expect(() => loadServerEnv({ ...base, TELEGRAM_BOT_TOKEN: '1:x' })).toThrow(/TELEGRAM_BOT_USERNAME/);
    expect(
      loadServerEnv({ ...base, TELEGRAM_BOT_TOKEN: '1:x', TELEGRAM_BOT_USERNAME: 'Bot' })
        .TELEGRAM_BOT_USERNAME,
    ).toBe('Bot');
    const prod = {
      ...base,
      NODE_ENV: 'production',
      APP_URL: 'https://app.dxmpulse.et',
      RESEND_API_KEY: 're_x',
      TELEGRAM_BOT_TOKEN: '1:x',
      TELEGRAM_BOT_USERNAME: 'Bot',
    };
    expect(() => loadServerEnv(prod)).toThrow(/TELEGRAM_WEBHOOK_SECRET/);
    expect(() => loadServerEnv({ ...prod, TELEGRAM_WEBHOOK_SECRET: 'long-random-secret' })).not.toThrow();
  });
});
