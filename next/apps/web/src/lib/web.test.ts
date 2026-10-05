import { afterEach, describe, expect, it, vi } from 'vitest';
import { safeRedirect } from './redirect';
import { slugify } from '../routes/onboarding';
import { api, ApiError, fieldError, onUnauthenticated } from './api';

describe('safeRedirect (no open redirects)', () => {
  it.each([
    ['/sites', '/sites'],
    ['/sites/site_1?x=1', '/sites/site_1?x=1'],
    ['//evil.example', '/'],
    ['https://evil.example', '/'],
    [undefined, '/'],
    [42, '/'],
  ])('%j → %s', (input, expected) => {
    expect(safeRedirect(input)).toBe(expected);
  });
});

describe('slugify', () => {
  it('builds URL-safe slugs and falls back for Ge’ez-only names', () => {
    expect(slugify('Abebe Furniture & Co.')).toMatch(/^abebe-furniture-co-[a-z0-9]{5}$/);
    expect(slugify('አበበ ፈርኒቸር')).toMatch(/^org-[a-z0-9]{5}$/);
  });
});

describe('api client', () => {
  afterEach(() => vi.restoreAllMocks());

  const respond = (status: number, body?: unknown) =>
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    );

  it('returns JSON and sends credentials', async () => {
    const spy = respond(200, { ok: 1 });
    await expect(api('/sites')).resolves.toEqual({ ok: 1 });
    expect(spy).toHaveBeenCalledWith(
      '/api/v1/sites',
      expect.objectContaining({ credentials: 'include', method: 'GET' }),
    );
  });

  it('turns the error envelope into an ApiError and exposes field errors', async () => {
    respond(400, {
      error: {
        code: 'validation_failed',
        message: 'bad',
        details: [{ path: 'domain', message: 'invalid_domain' }],
        requestId: 'r1',
      },
    });
    const err = await api('/sites', { body: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, code: 'validation_failed', requestId: 'r1' });
    expect(fieldError(err, 'domain')).toBe('invalid_domain');
    expect(fieldError(err, 'name')).toBeUndefined();
  });

  it('notifies listeners on 401 unless the call expects it', async () => {
    const listener = vi.fn();
    const off = onUnauthenticated(listener);
    respond(401, { error: { code: 'unauthenticated', message: 'x' } });
    await api('/sites').catch(() => {});
    expect(listener).toHaveBeenCalledTimes(1);
    respond(401, { error: { code: 'unauthenticated', message: 'x' } });
    await api('/me', { quietUnauthenticated: true }).catch(() => {});
    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });

  it('reports network failures distinctly', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(api('/sites')).rejects.toMatchObject({ code: 'network', status: 0 });
  });

  it('handles 204 No Content', async () => {
    respond(204);
    await expect(api('/sites/x', { method: 'DELETE' })).resolves.toBeUndefined();
  });
});
