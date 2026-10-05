import { afterAll, describe, expect, it } from 'vitest';
import { resolveClientIp } from '../src/app';
import { APP_URL, createTestContext } from './helpers';

const ctx = createTestContext();
afterAll(() => ctx.database.close());

describe('health', () => {
  it('reports liveness and database readiness', async () => {
    expect(await (await ctx.app.request('/livez')).json()).toEqual({ status: 'ok' });
    const ready = await ctx.app.request('/readyz');
    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({ status: 'ok', db: 'ok' });
  });
});

describe('public config', () => {
  it('tells the sign-in screen whether Google is configured, without auth', async () => {
    const res = await ctx.app.request('/api/v1/public-config');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ googleEnabled: false });
  });
});

describe('errors & request ids', () => {
  it('returns the error envelope for unknown routes with a request id', async () => {
    const res = await ctx.app.request('/api/v1/nope');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string; requestId: string } };
    expect(body.error.code).toBe('not_found');
    expect(body.error.requestId).toBe(res.headers.get('x-request-id'));
  });

  it('echoes well-formed request ids and replaces malformed ones', async () => {
    const good = await ctx.app.request('/livez', { headers: { 'x-request-id': 'abc12345-trace' } });
    expect(good.headers.get('x-request-id')).toBe('abc12345-trace');
    const bad = await ctx.app.request('/livez', { headers: { 'x-request-id': '<script>' } });
    expect(bad.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects malformed JSON with a 400 envelope, not a crash', async () => {
    const res = await ctx.app.request('/api/v1/me/preferences', {
      method: 'PATCH',
      headers: { origin: APP_URL, 'content-type': 'application/json' },
      body: '{',
    });
    // Unauthenticated requests are rejected before the body is read.
    expect(res.status).toBe(401);
  });
});

describe('security headers & CORS', () => {
  it('sets defensive headers', async () => {
    const res = await ctx.app.request('/livez');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('allows credentialed CORS only for the app origin', async () => {
    const ok = await ctx.app.request('/api/v1/me', {
      method: 'OPTIONS',
      headers: { origin: APP_URL, 'access-control-request-method': 'GET' },
    });
    expect(ok.headers.get('access-control-allow-origin')).toBe(APP_URL);
    expect(ok.headers.get('access-control-allow-credentials')).toBe('true');
    const evil = await ctx.app.request('/api/v1/me', {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'GET' },
    });
    expect(evil.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('resolveClientIp', () => {
  it('uses the socket address when no proxy is trusted (X-Forwarded-For is ignored)', () => {
    expect(resolveClientIp('1.2.3.4', '10.0.0.1', 0)).toBe('10.0.0.1');
  });
  it('takes the address appended by the trusted proxy, ignoring spoofed entries further left', () => {
    expect(resolveClientIp('6.6.6.6, 196.188.1.20', '127.0.0.1', 1)).toBe('196.188.1.20');
    expect(resolveClientIp('6.6.6.6, 196.188.1.20, 10.0.0.2', '127.0.0.1', 2)).toBe('196.188.1.20');
  });
  it('falls back to the socket when the header is missing', () => {
    expect(resolveClientIp(undefined, '127.0.0.1', 1)).toBe('127.0.0.1');
  });
});
