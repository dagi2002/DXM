/**
 * Session replay recorder (r.js) — a separate, lazy file. p.js loads it only after the visitor has
 * consented and the collector said this visit is sampled in (GET /r/cfg), so the ≤5 KB core never
 * carries rrweb.
 *
 * Privacy defaults: every text node and every input value is masked; owners opt specific
 * elements back in with `data-dxm-unmask` (password fields stay masked regardless), and can
 * drop an element entirely with `data-dxm-block`. URLs in the recording go through the same
 * scrubbing as events.
 */
import type { record as rrwebRecord } from '@rrweb/record';
import { scrubUrl } from './privacy';

type RecordFn = typeof rrwebRecord;
type RecordOptions = NonNullable<Parameters<RecordFn>[0]>;
export type RrEvent = { type: number; timestamp: number; data?: unknown };
type Consent = 'granted' | 'pending' | 'denied';

/** Flush cadence and chunk limits (the collector refuses chunks over 512 KB compressed). */
export const FLUSH_MS = 10_000;
export const MAX_RAW_BYTES = 1_500_000;
export const MAX_CHUNK_BYTES = 500 * 1024;
export const CHECKOUT_MS = 5 * 60 * 1000;

const unmasked = (el: Element | null | undefined) => !!el?.closest?.('[data-dxm-unmask]');
const stars = (s: string) => s.replace(/\S/g, '*');

/** rrweb options for masking — exported so tests check exactly what ships. */
export const maskOptions: RecordOptions = {
  maskAllInputs: true,
  maskTextSelector: '*',
  maskTextFn: (text, el) => (unmasked(el) ? text : stars(text)),
  maskInputFn: (text, el) =>
    unmasked(el) && (el as HTMLInputElement).type !== 'password' ? text : '*'.repeat(text.length),
  blockSelector: '[data-dxm-block]',
  inlineImages: false,
  collectFonts: false,
  recordCanvas: false,
  recordCrossOriginIframes: false,
  slimDOMOptions: 'all',
  sampling: { mousemove: 100, scroll: 150, media: 800, input: 'last' },
};

/** rrweb Meta events carry the page URL; keep only the scrubbed path (+ campaign tags). */
export function scrubEvent(e: RrEvent): RrEvent {
  if (e.type === 4 && e.data && typeof (e.data as { href?: unknown }).href === 'string') {
    const href = (e.data as { href: string }).href;
    const { p, q } = scrubUrl(href);
    let origin = '';
    try {
      origin = new URL(href).origin;
    } catch {
      /* keep path only */
    }
    return { ...e, data: { ...(e.data as object), href: `${origin}${p}${q ? `?${q}` : ''}` } };
  }
  return e;
}

export interface RecorderEnv {
  record: RecordFn;
  fetch: typeof fetch;
  now: () => number;
  /** gzip; null when CompressionStream is unavailable (the collector gzips plain JSON itself). */
  gzip: ((s: string) => Promise<Uint8Array>) | null;
  store: Pick<Storage, 'getItem' | 'setItem'> | null;
  setInterval: (fn: () => void, ms: number) => unknown;
  onHide: (fn: () => void) => void;
}

export interface RecorderOptions {
  endpoint: string; // collector base, e.g. https://app.dxmpulse.et
  key: string;
  vid: () => string;
  consent: () => Consent;
}

const SEQ_KEY = '_pulse_rs';

export function createRecorder(opts: RecorderOptions, env: RecorderEnv) {
  let buf: RrEvent[] = [];
  let rawBytes = 0;
  let vid = opts.vid();
  let stopped = false;
  let stopRecording: (() => void) | undefined;
  let sending: Promise<void> = Promise.resolve();

  // Sequence numbers are per visit and survive page loads within the tab.
  let seq = 0;
  try {
    const saved = JSON.parse(env.store?.getItem(SEQ_KEY) ?? 'null') as { v: string; s: number } | null;
    if (saved && saved.v === vid) seq = saved.s;
  } catch {
    /* storage blocked */
  }
  const nextSeq = () => {
    const s = seq++;
    try {
      env.store?.setItem(SEQ_KEY, JSON.stringify({ v: vid, s: seq }));
    } catch {
      /* storage blocked */
    }
    return s;
  };

  const stop = () => {
    stopped = true;
    buf = [];
    stopRecording?.();
  };

  const post = async (events: RrEvent[], s: number, keepalive: boolean): Promise<void> => {
    const json = JSON.stringify(events);
    const body = env.gzip ? await env.gzip(json) : json;
    const size = typeof body === 'string' ? body.length : body.byteLength;
    if (size > MAX_CHUNK_BYTES && events.length > 1) {
      // Too big once compressed: split in two (the second half takes a fresh sequence number).
      const half = Math.ceil(events.length / 2);
      await post(events.slice(0, half), s, keepalive);
      return post(events.slice(half), nextSeq(), keepalive);
    }
    if (size > MAX_CHUNK_BYTES) return; // one enormous event (e.g. a giant DOM): skip it
    const url = `${opts.endpoint}/r?k=${encodeURIComponent(opts.key)}&vid=${encodeURIComponent(vid)}&seq=${s}`;
    try {
      const res = await env.fetch(url, {
        method: 'POST',
        body: body as BodyInit,
        credentials: 'omit',
        keepalive: keepalive && size < 60_000,
        headers: { 'content-type': 'text/plain' },
      });
      // Unknown site, origin not allowed, not sampled, or replay switched off: stop for good.
      if ([400, 403, 404, 503].includes(res.status)) stop();
    } catch {
      /* network: this chunk is lost, the next full snapshot recovers playback */
    }
  };

  const flush = (keepalive = false) => {
    if (stopped) return sending;
    if (opts.consent() !== 'granted') {
      if (opts.consent() === 'denied') stop();
      return sending;
    }
    if (!buf.length) return sending;
    const events = buf;
    buf = [];
    rawBytes = 0;
    const s = nextSeq();
    sending = sending.then(() => post(events, s, keepalive));
    return sending;
  };

  const emit = (e: RrEvent, isCheckout?: boolean) => {
    if (stopped) return;
    // A new visit started (30 min idle): close the old one and start the new one with a snapshot.
    const current = opts.vid();
    if (current !== vid) {
      void flush();
      vid = current;
      seq = 0;
      if (e.type !== 4 && e.type !== 2) {
        buf.push(scrubEvent(e));
        env.record.takeFullSnapshot?.(true);
        return;
      }
    } else if (isCheckout && buf.length) {
      void flush(); // periodic full snapshot starts a fresh chunk
    }
    buf.push(scrubEvent(e));
    rawBytes += 200; // cheap estimate; refined below for big events
    if (e.type === 2 || e.type === 3) rawBytes += JSON.stringify(e.data ?? '').length;
    if (rawBytes >= MAX_RAW_BYTES) void flush();
  };

  return {
    start() {
      if (opts.consent() !== 'granted') return false;
      stopRecording = env.record({ ...maskOptions, emit, checkoutEveryNms: CHECKOUT_MS }) ?? undefined;
      env.setInterval(() => void flush(), FLUSH_MS);
      env.onHide(() => void flush(true));
      return true;
    },
    flush,
    stop,
    /** test helpers */
    _state: () => ({ buf, seq, vid, stopped }),
  };
}

/** gzip via CompressionStream (Chrome 80+, Safari 16.4+, Firefox 113+). */
export function browserGzip(): RecorderEnv['gzip'] {
  if (typeof CompressionStream === 'undefined') return null;
  return async (s: string) => {
    const stream = new Blob([s]).stream().pipeThrough(new CompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  };
}
