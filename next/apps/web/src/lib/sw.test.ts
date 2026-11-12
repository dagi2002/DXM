// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

/** Loads public/sw.js in a fake service-worker global and returns its handlers. */
function loadWorker() {
  const handlers: Record<string, (e: unknown) => void> = {};
  const self = {
    location: new URL('https://app.dxmpulse.et/'),
    addEventListener: (type: string, fn: (e: unknown) => void) => (handlers[type] = fn),
    registration: { showNotification: vi.fn(() => Promise.resolve()) },
    clients: { matchAll: vi.fn(async () => []), openWindow: vi.fn(async () => null), claim: vi.fn() },
    skipWaiting: vi.fn(),
  } as Record<string, unknown>;
  const src = readFileSync(fileURLToPath(new URL('../../public/sw.js', import.meta.url)), 'utf8');
  const caches = {
    match: vi.fn(async () => undefined),
    open: vi.fn(async () => ({ put: vi.fn(), addAll: vi.fn() })),
    keys: vi.fn(async () => []),
  };
  runInNewContext(src, { self, URL, caches, fetch: vi.fn(async () => new Response('')), Promise });
  return { self, handlers };
}

const fetchEvent = (url: string, init: { method?: string; mode?: string } = {}) => {
  const respondWith = vi.fn();
  return {
    event: { request: { url, method: init.method ?? 'GET', mode: init.mode ?? 'cors' }, respondWith },
    respondWith,
  };
};

describe('service worker', () => {
  it('handles only the app shell and leaves API and other traffic to the network', () => {
    const { handlers } = loadWorker();
    const handled = (url: string, init?: { method?: string; mode?: string }) => {
      const f = fetchEvent(url, init);
      handlers.fetch!(f.event);
      return f.respondWith.mock.calls.length > 0;
    };
    // Shell
    expect(handled('https://app.dxmpulse.et/today', { mode: 'navigate' })).toBe(true);
    expect(handled('https://app.dxmpulse.et/assets/index-abc123.js')).toBe(true);
    expect(handled('https://app.dxmpulse.et/boot.js')).toBe(true);
    expect(handled('https://app.dxmpulse.et/icon-192.png')).toBe(true);
    // Never
    expect(handled('https://app.dxmpulse.et/api/v1/fixes')).toBe(false);
    expect(handled('https://app.dxmpulse.et/api/v1/me', { mode: 'navigate' })).toBe(false);
    expect(handled('https://app.dxmpulse.et/api/auth/get-session')).toBe(false);
    expect(handled('https://app.dxmpulse.et/i/replay?k=x')).toBe(false);
    expect(handled('https://app.dxmpulse.et/sdk/p.js')).toBe(false);
    expect(handled('https://app.dxmpulse.et/assets/x.js', { method: 'POST' })).toBe(false);
    expect(handled('https://cdn.example.com/assets/x.js')).toBe(false);
    expect(handled('https://app.dxmpulse.et/some-data.json')).toBe(false);
  });

  it('shows a push notification and only ever opens our own pages', async () => {
    const { self, handlers } = loadWorker();
    let wait: Promise<unknown> = Promise.resolve();
    handlers.push!({
      data: {
        json: () => ({ title: 'Shop: 1 fix needs you', body: 'New · …', url: '/fixes/iss_1', tag: 's' }),
      },
      waitUntil: (p: Promise<unknown>) => (wait = p),
    });
    await wait;
    expect(
      (self.registration as { showNotification: ReturnType<typeof vi.fn> }).showNotification,
    ).toHaveBeenCalledWith(
      'Shop: 1 fix needs you',
      expect.objectContaining({ body: 'New · …', tag: 's', data: { url: '/fixes/iss_1' } }),
    );

    const open = (self.clients as { openWindow: ReturnType<typeof vi.fn> }).openWindow;
    handlers.notificationclick!({
      notification: { close: vi.fn(), data: { url: 'https://evil.example/phish' } },
      waitUntil: (p: Promise<unknown>) => (wait = p),
    });
    await wait;
    expect(open).toHaveBeenCalledWith('https://app.dxmpulse.et/today');
  });
});
