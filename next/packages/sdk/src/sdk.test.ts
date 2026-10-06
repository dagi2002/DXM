// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTracker, type Env } from './core';
import { referrerHost, scrubPath, scrubUrl, selectorFor } from './privacy';

describe('privacy', () => {
  it('drops all query params except campaign tags, and always drops the fragment', () => {
    expect(
      scrubUrl(
        'https://shop.et/checkout?email=a@b.et&phone=0911223344&utm_source=tg&token=abc#access_token=x',
      ),
    ).toEqual({
      p: '/checkout',
      q: 'utm_source=tg',
    });
    expect(scrubUrl('https://shop.et/')).toEqual({ p: '/' });
    expect(scrubUrl('not a url')).toEqual({ p: '/' });
  });

  it('masks identifiers that leak into paths', () => {
    expect(scrubPath('/users/abebe@gmail.com/orders')).toBe('/users/:email/orders');
    expect(scrubPath('/order/1234567890')).toBe('/order/:num');
    expect(scrubPath('/reset/eyJhbGciOiJIUzI1NiJ9abcdefghijkl')).toBe('/reset/:token');
    expect(scrubPath('/i/3f2a1b4c-1d2e-4f5a-9b8c-7d6e5f4a3b2c')).toBe('/i/:id');
    expect(scrubPath('/products/42/sofa')).toBe('/products/42/sofa');
  });

  it('keeps only foreign referrer hosts', () => {
    expect(referrerHost('https://t.me/somechannel', 'shop.et')).toBe('t.me');
    expect(referrerHost('https://shop.et/a', 'shop.et')).toBeUndefined();
    expect(referrerHost('', 'shop.et')).toBeUndefined();
  });

  it('builds short selectors without text content, skipping generated classes', () => {
    document.body.innerHTML = `<main><div class="card css-1x2y3z"><button class="btn primary sc-a1b2c3">Pay 1,200 ብር</button></div></main><nav><a id="cart">c</a></nav><b data-pulse-name="hero-cta"><i id="x">!</i></b>`;
    expect(selectorFor(document.querySelector('button'))).toBe('main>div.card>button.btn.primary');
    expect(selectorFor(document.querySelector('#cart'))).toBe('a#cart');
    expect(selectorFor(document.querySelector('#x'))).toBe('[hero-cta]');
  });
});

describe('tracker', () => {
  let store: Map<string, string>;
  let fetchMock: ReturnType<typeof vi.fn>;
  let beacon: ReturnType<typeof vi.fn>;
  let now: number;

  const env = (): Env => ({
    win: window as Window & typeof globalThis,
    doc: document,
    store: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, v),
      removeItem: (k) => void store.delete(k),
    },
    fetch: fetchMock as unknown as typeof fetch,
    beacon: beacon as unknown as Env['beacon'],
    now: () => now,
    random: () => `visit${Math.random().toString(36).slice(2, 10)}`,
  });

  beforeEach(() => {
    store = new Map();
    now = 1_700_000_000_000;
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    beacon = vi.fn().mockReturnValue(true);
    window.history.replaceState({}, '', '/products?utm_source=telegram&secret=1');
  });
  afterEach(() => vi.useRealTimers());

  const sentBodies = () => fetchMock.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string));

  it('sends a simple (never preflighted) text/plain request without credentials', async () => {
    const t = createTracker({ key: 'pk_test', endpoint: 'https://c.example/i', consent: 'granted' }, env());
    t.push({ t: 'ce', n: 'x' });
    await t.flush();
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('https://c.example/i');
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'omit',
      keepalive: true,
      headers: { 'content-type': 'text/plain' },
    });
    const body = sentBodies()[0];
    expect(body).toMatchObject({ v: 3, k: 'pk_test', seq: 0, ev: [{ t: 'ce', n: 'x', p: '/products' }] });
    expect(body.vid).toMatch(/^visit/);
    expect(t._state().queue).toEqual([]);
  });

  it('keeps events and backs off on server errors, then delivers', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    const t = createTracker({ key: 'pk', endpoint: 'https://c/i', consent: 'granted' }, env());
    t.push({ t: 'ce', n: 'a' });
    await t.flush();
    expect(t._state().queue).toHaveLength(1);
    await t.flush(); // still backing off
    expect(fetchMock).toHaveBeenCalledTimes(1);
    now += 10_000;
    await t.flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(t._state().queue).toHaveLength(0);
    // The retry carries the SAME sequence number, so the server can drop a duplicate delivery.
    expect(sentBodies().map((b) => b.seq)).toEqual([0, 0]);
  });

  it('survives network failures (offline) and stops for good on an unknown site key', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    const t = createTracker({ key: 'pk', endpoint: 'https://c/i', consent: 'granted' }, env());
    t.push({ t: 'ce', n: 'a' });
    await t.flush();
    expect(t._state().queue).toHaveLength(1);
    now += 10_000;
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await t.flush();
    expect(t._state().stopped).toBe(true);
    t.push({ t: 'ce', n: 'b' });
    expect(t._state().queue).toHaveLength(0);
  });

  it('never runs two deliveries at once', async () => {
    let release!: () => void;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((r) => (release = () => r(new Response(null, { status: 204 })))),
    );
    const t = createTracker({ key: 'pk', endpoint: 'https://c/i', consent: 'granted' }, env());
    t.push({ t: 'ce', n: 'a' });
    const first = t.flush();
    await t.flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    release();
    await first;
  });

  it('reuses the in-flight sequence number when the page exits mid-request, and settles only once', async () => {
    let release!: () => void;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((r) => (release = () => r(new Response(null, { status: 204 })))),
    );
    const t = createTracker({ key: 'pk', endpoint: 'https://c/i', consent: 'granted' }, env());
    t.push({ t: 'ce', n: 'a' });
    const inflight = t.flush();
    t.push({ t: 'ce', n: 'b' }); // arrives while the first batch is in flight
    t.flushOnExit();
    const beaconBody = JSON.parse(await (beacon.mock.calls[0]![1] as Blob).text());
    expect(beaconBody.seq).toBe(sentBodies()[0].seq);
    expect(beaconBody.ev.map((e: { n: string }) => e.n)).toEqual(['a']);
    release();
    await inflight;
    // 'a' removed exactly once; 'b' is still waiting for the next batch.
    expect(t._state().queue.map((e) => e.n)).toEqual(['b']);
  });

  it('hands leftovers to sendBeacon as text/plain when the page is hidden', () => {
    const t = createTracker({ key: 'pk', endpoint: 'https://c/i', consent: 'granted' }, env());
    t.push({ t: 'ce', n: 'a' });
    t.flushOnExit();
    const [url, blob] = beacon.mock.calls[0]! as [string, Blob];
    expect(url).toBe('https://c/i');
    expect(blob.type).toBe('text/plain');
    expect(t._state().queue).toEqual([]);
  });

  it('starts a new visit after 30 minutes of inactivity', () => {
    const t = createTracker({ key: 'pk', endpoint: 'https://c/i', consent: 'granted' }, env());
    t.push({ t: 'ce', n: 'a' });
    const first = t._state().visit.id;
    now += 29 * 60_000;
    t.push({ t: 'ce', n: 'b' });
    expect(t._state().visit.id).toBe(first);
    now += 31 * 60_000;
    t.push({ t: 'ce', n: 'c' });
    expect(t._state().visit.id).not.toBe(first);
  });

  it('with consent pending: buffers in memory, touches no storage, sends nothing', async () => {
    const t = createTracker({ key: 'pk', endpoint: 'https://c/i', consent: 'pending' }, env());
    t.push({ t: 'ce', n: 'a' });
    await t.flush();
    t.flushOnExit();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled();
    expect(store.size).toBe(0);
    t.setConsent('granted');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it('denied consent clears everything', () => {
    const t = createTracker({ key: 'pk', endpoint: 'https://c/i', consent: 'granted' }, env());
    t.push({ t: 'ce', n: 'a' });
    t.setConsent('denied');
    t.push({ t: 'ce', n: 'b' });
    expect(t._state().queue).toEqual([]);
    expect(store.has('_pulse_q')).toBe(false);
  });

  it('records a scrubbed pageview, rage clicks and custom events with clean props', () => {
    const t = createTracker({ key: 'pk', endpoint: 'https://c/i', consent: 'granted' }, env());
    t.start();
    document.body.innerHTML = '<button id="pay">Pay</button>';
    const btn = document.getElementById('pay')!;
    for (let i = 0; i < 4; i++) {
      now += 100;
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 50, clientY: 50 }));
    }
    t.track('purchase', { total: 1200, currency: 'ETB', nested: { no: 1 } as unknown as string });
    const q = t._state().queue;
    expect(q[0]).toMatchObject({ t: 'pv', p: '/products', q: 'utm_source=telegram' });
    expect(q.filter((e) => e.t === 'cl')).toHaveLength(4);
    expect(q.filter((e) => e.t === 'rc')).toEqual([expect.objectContaining({ s: 'button#pay', n: 3 })]);
    expect(q.at(-1)).toMatchObject({ t: 'ce', n: 'purchase', pr: { total: 1200, currency: 'ETB' } });
  });
});
