// @vitest-environment happy-dom
import { gunzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_CHUNK_BYTES,
  createRecorder,
  maskOptions,
  scrubEvent,
  type RecorderEnv,
  type RrEvent,
} from './replay';

// rrweb itself can't run in happy-dom; the full recording path (real rrweb, real Chromium) is
// checked for leaks by apps/web/e2e/replays.spec.ts. Here we pin the options and mask functions.
describe('masking (on by default)', () => {
  const textFn = maskOptions.maskTextFn!;
  const inputFn = maskOptions.maskInputFn!;
  const el = (html: string, sel: string) => {
    document.body.innerHTML = html;
    return document.querySelector(sel) as HTMLElement;
  };

  it('masks every text node and every input by default', () => {
    expect(maskOptions).toMatchObject({
      maskAllInputs: true,
      maskTextSelector: '*',
      blockSelector: '[data-dxm-block]',
      inlineImages: false,
      recordCanvas: false,
      collectFonts: false,
    });
    expect(textFn('Abebe Kebede 0911223344', el('<p>x</p>', 'p'))).toBe('***** ****** **********');
    expect(textFn('ሰላም ዓለም', null)).toBe('*** ***');
    expect(inputFn('0911223344', el('<input name="phone">', 'input'))).toBe('**********');
  });

  it('lets owners unmask with data-dxm-unmask — but never passwords', () => {
    const html = `<nav data-dxm-unmask><button>Pay with telebirr</button><input name="q"><input type="password"></nav>`;
    expect(textFn('Pay with telebirr', el(html, 'button'))).toBe('Pay with telebirr');
    expect(inputFn('sofa', el(html, 'input[name=q]'))).toBe('sofa');
    expect(inputFn('hunter22', el(html, 'input[type=password]'))).toBe('********');
  });

  it('scrubs the page URL in meta events', () => {
    const e = scrubEvent({
      type: 4,
      timestamp: 1,
      data: { href: 'https://shop.et/reset/eyJhbGciOiJIUzI1NiJ9abcdefghijkl?email=a@b.et&utm_source=tg#t=x' },
    });
    expect((e.data as { href: string }).href).toBe('https://shop.et/reset/:token?utm_source=tg');
    expect(scrubEvent({ type: 3, timestamp: 1, data: { x: 1 } })).toEqual({
      type: 3,
      timestamp: 1,
      data: { x: 1 },
    });
  });
});

describe('recorder', () => {
  let emit: (e: RrEvent, checkout?: boolean) => void;
  let fetchMock: ReturnType<typeof vi.fn>;
  let store: Map<string, string>;
  let consent: 'granted' | 'pending' | 'denied';
  let vid: string;
  let tick: () => void;
  let hide: () => void;
  const fakeRecord = Object.assign(
    vi.fn((o: { emit: typeof emit }) => {
      emit = o.emit;
      return () => {};
    }),
    { takeFullSnapshot: vi.fn() },
  ) as unknown as RecorderEnv['record'];

  const gzip = async (s: string) => new Uint8Array(new Blob([s]).size ? Buffer.from(s) : []);
  const make = (overrides: Partial<RecorderEnv> = {}) =>
    createRecorder(
      { endpoint: 'https://c.et/i', key: 'pk_a', vid: () => vid, consent: () => consent },
      {
        record: fakeRecord,
        fetch: fetchMock as unknown as typeof fetch,
        now: () => 0,
        gzip: null,
        store: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) },
        setInterval: (fn) => (tick = fn),
        onHide: (fn) => (hide = fn),
        ...overrides,
      },
    );
  const sent = () =>
    fetchMock.mock.calls.map(([url, init]) => ({
      url: String(url),
      events: JSON.parse(String(init.body)) as RrEvent[],
      init,
    }));

  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    store = new Map();
    consent = 'granted';
    vid = 'visit_aaaaaaaa';
  });
  afterEach(() => vi.clearAllMocks());

  it('records with masking on and posts chunks with a monotonic seq', async () => {
    const r = make();
    expect(r.start()).toBe(true);
    expect(fakeRecord).toHaveBeenCalledWith(
      expect.objectContaining({ maskAllInputs: true, maskTextSelector: '*' }),
    );
    emit({ type: 4, timestamp: 1, data: { href: 'https://shop.et/a?token=x' } });
    emit({ type: 2, timestamp: 2, data: {} });
    tick();
    await r.flush();
    emit({ type: 3, timestamp: 3, data: {} });
    hide();
    await r.flush();
    const calls = sent();
    expect(calls.map((c) => c.url)).toEqual([
      'https://c.et/i/replay?k=pk_a&vid=visit_aaaaaaaa&seq=0',
      'https://c.et/i/replay?k=pk_a&vid=visit_aaaaaaaa&seq=1',
    ]);
    expect(calls[0]!.events[0]!.data).toEqual({ href: 'https://shop.et/a' });
    expect(calls[0]!.init).toMatchObject({ method: 'POST', credentials: 'omit' });
    expect(calls[1]!.init.keepalive).toBe(true); // page hide uses keepalive
  });

  it('continues the sequence on the next page of the same visit, and restarts it for a new visit', async () => {
    const first = make();
    first.start();
    emit({ type: 2, timestamp: 1 });
    await first.flush();
    const second = make(); // next page load in the same tab
    second.start();
    emit({ type: 2, timestamp: 2 });
    await second.flush();
    expect(sent().map((c) => c.url.split('seq=')[1])).toEqual(['0', '1']);

    vid = 'visit_bbbbbbbb'; // 30 min idle → new visit
    emit({ type: 3, timestamp: 3 });
    await second.flush();
    expect(sent().at(-1)!.url).toBe('https://c.et/i/replay?k=pk_a&vid=visit_bbbbbbbb&seq=0');
    expect(fakeRecord.takeFullSnapshot).toHaveBeenCalled();
  });

  it('never starts without consent, and stops and drops the buffer when consent is withdrawn', async () => {
    consent = 'pending';
    expect(make().start()).toBe(false);
    consent = 'granted';
    const r = make();
    r.start();
    emit({ type: 2, timestamp: 1 });
    consent = 'denied';
    await r.flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r._state()).toMatchObject({ stopped: true, buf: [] });
  });

  it('stops for good when the collector refuses (not sampled, unknown site, switched off)', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 403 }));
    const r = make();
    r.start();
    emit({ type: 2, timestamp: 1 });
    await r.flush();
    emit({ type: 3, timestamp: 2 });
    await r.flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('splits a chunk that is too big once compressed', async () => {
    const r = make({ gzip });
    r.start();
    const big = 'x'.repeat(Math.ceil(MAX_CHUNK_BYTES / 3));
    for (let i = 0; i < 4; i++) emit({ type: 3, timestamp: i, data: { big } });
    await r.flush();
    const urls = fetchMock.mock.calls.map(([url]) => String(url).split('seq=')[1]);
    expect(urls.length).toBeGreaterThanOrEqual(2);
    for (const c of fetchMock.mock.calls)
      expect((c[1].body as Uint8Array).byteLength).toBeLessThanOrEqual(MAX_CHUNK_BYTES);
    expect(new Set(urls).size).toBe(urls.length); // every piece has its own seq
  });

  it('gzips with CompressionStream when available', async () => {
    const { browserGzip } = await import('./replay');
    const gz = browserGzip();
    if (!gz) return; // environment without CompressionStream: the collector gzips instead
    const out = await gz('[{"type":2}]');
    expect(gunzipSync(out).toString()).toBe('[{"type":2}]');
  });
});
