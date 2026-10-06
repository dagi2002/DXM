import { referrerHost, scrubUrl, selectorFor } from './privacy';

export const SDK_VERSION = '3.0.0';
const VISIT_IDLE_MS = 30 * 60 * 1000;
const FLUSH_MS = 5000;
const MAX_QUEUE = 300;
const MAX_BATCH = 100;

type Ev = Record<string, unknown> & { t: string; ts: number; p: string };
export type Consent = 'granted' | 'pending' | 'denied';

export interface Env {
  win: Window & typeof globalThis;
  doc: Document;
  /** sessionStorage-like; may be unavailable (private mode) */
  store: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  fetch: typeof fetch;
  beacon: ((url: string, data: Blob) => boolean) | null;
  now: () => number;
  random: () => string;
}

export interface Options {
  key: string;
  endpoint: string;
  consent: Consent;
}

const safe = <T>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

export function createTracker(opts: Options, env: Env) {
  const { win, doc, store } = env;
  let consent: Consent = opts.consent;
  let queue: Ev[] = [];
  let inFlight = false;
  let backoffUntil = 0;
  let failures = 0;
  let stopped = false;

  /* ── visit identity (per tab, rolls after 30 min idle) ── */
  const read = (k: string) => safe(() => store?.getItem(k) ?? null, null);
  const write = (k: string, v: string) => safe(() => store?.setItem(k, v), undefined);

  let visit: { id: string; last: number; seq: number } = safe(
    () => JSON.parse(read('_pulse_v') ?? 'null'),
    null,
  ) ?? {
    id: '',
    last: 0,
    seq: 0,
  };
  const touchVisit = () => {
    const now = env.now();
    if (!visit.id || now - visit.last > VISIT_IDLE_MS) visit = { id: env.random(), last: now, seq: 0 };
    visit.last = now;
    // Nothing touches storage until the visitor has consented.
    if (consent === 'granted') write('_pulse_v', JSON.stringify(visit));
  };

  // Unsent events survive reloads within the tab (never shared across tabs).
  queue = safe(() => JSON.parse(read('_pulse_q') ?? '[]'), []);
  const persist = () => write('_pulse_q', JSON.stringify(queue.slice(-MAX_QUEUE)));

  const context = () => {
    const conn = (win.navigator as Navigator & { connection?: { effectiveType?: string } }).connection;
    const tg = (win as unknown as { Telegram?: { WebApp?: { initData?: string; platform?: string } } })
      .Telegram?.WebApp;
    const inMiniApp = !!tg && typeof tg.initData === 'string' && tg.initData.length > 0;
    return {
      vw: win.innerWidth,
      vh: win.innerHeight,
      sw: win.screen?.width,
      lang: win.navigator.language?.slice(0, 35),
      net: conn?.effectiveType,
      plat: inMiniApp ? 'telegram_mini_app' : 'web',
      tgp: inMiniApp ? tg?.platform?.slice(0, 20) : undefined,
      tz: safe(() => Intl.DateTimeFormat().resolvedOptions().timeZone, undefined),
    };
  };

  const push = (ev: Omit<Ev, 'ts' | 'p'> & { p?: string }) => {
    if (stopped || consent === 'denied') return;
    touchVisit();
    queue.push({ ts: env.now(), p: currentPath(), ...ev } as Ev);
    if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
    if (consent === 'granted') {
      persist();
      if (queue.length >= 30) void flush();
    }
  };

  const currentPath = () => scrubUrl(win.location.href).p;

  /**
   * A batch keeps one sequence number for its whole life — across retries, and when the exit
   * beacon takes over an in-flight request — so the server's de-duplication drops any second copy.
   */
  type Batch = { seq: number; events: Ev[] };
  let pending: Batch | null = null;
  const takeBatch = (): Batch => {
    if (!pending) {
      pending = { seq: visit.seq++, events: queue.slice(0, MAX_BATCH) };
      write('_pulse_v', JSON.stringify(visit));
    }
    return pending;
  };
  /** Removes a delivered batch from the queue — only once, even if fetch and beacon both succeed. */
  const settle = (batch: Batch) => {
    if (pending !== batch) return;
    queue = queue.slice(batch.events.length);
    pending = null;
  };
  const body = (b: Batch) =>
    JSON.stringify({
      v: 3,
      k: opts.key,
      vid: visit.id,
      seq: b.seq,
      sv: SDK_VERSION,
      ctx: context(),
      ev: b.events,
    });

  /** Regular delivery: text/plain + no credentials → a "simple" CORS request, never preflighted. */
  async function flush(): Promise<void> {
    if (inFlight || consent !== 'granted' || !queue.length || env.now() < backoffUntil) return;
    inFlight = true;
    const batch = takeBatch();
    const payload = body(batch);
    try {
      const res = await env.fetch(opts.endpoint, {
        method: 'POST',
        body: payload,
        keepalive: payload.length < 60_000,
        credentials: 'omit',
        headers: { 'content-type': 'text/plain' },
      });
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) {
        // Delivered, or permanently rejected (bad key/origin) — either way don't resend.
        settle(batch);
        failures = 0;
        if (res.status === 403 || res.status === 404) stopped = true;
      } else throw new Error(String(res.status));
    } catch {
      failures++;
      backoffUntil = env.now() + Math.min(300_000, 2000 * 2 ** failures);
    } finally {
      inFlight = false;
      persist();
    }
  }

  /** Page is going away: hand whatever is left to the browser's beacon queue. */
  const flushOnExit = () => {
    if (consent !== 'granted' || !queue.length) return;
    const batch = takeBatch();
    const blob = new Blob([body(batch)], { type: 'text/plain' });
    if (env.beacon?.(opts.endpoint, blob)) settle(batch);
    persist();
  };

  /* ── pageviews (with SPA navigation) ── */
  let lastPath = '';
  let maxScroll = 0;
  let pvTimer: ReturnType<typeof setTimeout> | undefined;
  const pageview = (first = false) => {
    const { p, q } = scrubUrl(win.location.href);
    if (p === lastPath && !first) return;
    endPage();
    lastPath = p;
    const ev: Record<string, unknown> = { t: 'pv', p };
    if (q) ev.q = q;
    if (first) {
      const r = referrerHost(doc.referrer, win.location.hostname);
      if (r) ev.r = r;
    }
    push(ev as Ev);
  };
  const endPage = () => {
    if (lastPath && maxScroll > 0) push({ t: 'sc', p: lastPath, d: maxScroll });
    maxScroll = 0;
  };
  const schedulePageview = () => {
    clearTimeout(pvTimer);
    pvTimer = setTimeout(() => pageview(), 300); // debounce router replaceState storms
  };

  /* ── clicks: heatmap points, rage clicks, dead clicks ── */
  let recent: { s: string; ts: number; x: number; y: number }[] = [];
  let rageReported = '';
  const onClick = (e: MouseEvent) => {
    const el = e.target instanceof Element ? e.target : null;
    if (!el) return;
    const s = selectorFor(el);
    const now = env.now();
    push({
      t: 'cl',
      s,
      x: Math.round((e.clientX / Math.max(1, win.innerWidth)) * 1000) / 1000,
      y: Math.round(e.pageY),
    });

    recent = recent.filter((c) => now - c.ts < 1000);
    recent.push({ s, ts: now, x: e.clientX, y: e.clientY });
    const burst = recent.filter(
      (c) => c.s === s && Math.abs(c.x - e.clientX) < 30 && Math.abs(c.y - e.clientY) < 30,
    );
    if (burst.length >= 3 && rageReported !== `${s}@${burst[0]!.ts}`) {
      rageReported = `${s}@${burst[0]!.ts}`;
      push({ t: 'rc', s, n: burst.length });
    }
    watchDeadClick(el, s);
  };

  const looksClickable = (el: Element) =>
    !!el.closest('button,[role=button],a:not([href]),[onclick]') &&
    !el.closest('input,select,textarea,label,summary,[contenteditable]');

  const lastDead = new Map<string, number>();
  const watchDeadClick = (el: Element, s: string) => {
    if (!looksClickable(el) || typeof MutationObserver === 'undefined') return;
    const startHref = win.location.href;
    const startFocus = doc.activeElement;
    let changed = false;
    const mo = new MutationObserver(() => (changed = true));
    mo.observe(doc.body, { subtree: true, childList: true, attributes: true, characterData: true });
    setTimeout(() => {
      mo.disconnect();
      if (changed || win.location.href !== startHref || doc.activeElement !== startFocus) return;
      const now = env.now();
      if (now - (lastDead.get(s) ?? 0) < 3000) return; // one report per target per burst
      lastDead.set(s, now);
      push({ t: 'dc', s });
    }, 1000);
  };

  /* ── scroll depth ── */
  let scrollQueued = false;
  const onScroll = () => {
    if (scrollQueued) return;
    scrollQueued = true;
    win.requestAnimationFrame(() => {
      scrollQueued = false;
      const h = doc.documentElement.scrollHeight;
      const pct = h > 0 ? Math.min(100, Math.round(((win.scrollY + win.innerHeight) / h) * 100)) : 100;
      if (pct > maxScroll) maxScroll = pct;
    });
  };

  /* ── forms: names only, never values ── */
  const started = new WeakSet<Element>();
  const formName = (f: HTMLFormElement) => (f.getAttribute('name') || f.id || selectorFor(f)).slice(0, 80);
  const onFocusIn = (e: FocusEvent) => {
    const f = (e.target as Element | null)?.closest?.('form');
    if (f && !started.has(f)) {
      started.add(f);
      push({ t: 'fs', f: formName(f) });
    }
  };
  const onSubmit = (e: Event) => {
    if (e.target instanceof HTMLFormElement) push({ t: 'fx', f: formName(e.target) });
  };
  const onInvalid = (e: Event) => {
    const field = e.target as HTMLInputElement;
    const f = field.form;
    if (f)
      push({
        t: 'fe',
        f: formName(f),
        n: (field.name || field.id || field.type || 'field').slice(0, 80),
        m: field.validationMessage?.slice(0, 120),
      });
  };

  /* ── JavaScript errors (max 10 per page) ── */
  let errorCount = 0;
  const onError = (message: string, src?: string, line?: number) => {
    if (++errorCount > 10) return;
    const ev: Record<string, unknown> = { t: 'er', m: message.slice(0, 300) };
    if (src) {
      const clean = safe(() => {
        const u = new URL(src);
        return u.origin + u.pathname;
      }, '');
      if (clean) ev.src = clean.slice(0, 200);
    }
    if (line) ev.l = line;
    push(ev as Ev);
  };

  /* ── wiring ── */
  function start() {
    touchVisit();
    pageview(true);
    const h = win.history;
    for (const m of ['pushState', 'replaceState'] as const) {
      const orig = h[m];
      h[m] = function (this: History, ...args: Parameters<History['pushState']>) {
        const r = orig.apply(this, args);
        schedulePageview();
        return r;
      } as History['pushState'];
    }
    const opt = { capture: true, passive: true };
    win.addEventListener('popstate', schedulePageview);
    doc.addEventListener('click', onClick, opt);
    win.addEventListener('scroll', onScroll, { passive: true });
    doc.addEventListener('focusin', onFocusIn, opt);
    doc.addEventListener('submit', onSubmit, opt);
    doc.addEventListener('invalid', onInvalid, opt);
    win.addEventListener('error', (e) => onError(e.message || 'Error', e.filename, e.lineno));
    win.addEventListener('unhandledrejection', (e) =>
      onError(`Unhandled rejection: ${String((e.reason as Error)?.message ?? e.reason)}`),
    );
    doc.addEventListener('visibilitychange', () => {
      if (doc.visibilityState === 'hidden') {
        endPage();
        flushOnExit();
      }
    });
    win.addEventListener('pagehide', () => {
      endPage();
      flushOnExit();
    });
    win.addEventListener('online', () => {
      backoffUntil = 0;
      void flush();
    });
    setInterval(() => void flush(), FLUSH_MS);
  }

  return {
    start,
    flush,
    flushOnExit,
    push,
    vital: (n: string, v: number) => push({ t: 'vt', n, v: Math.round(v * 1000) / 1000 }),
    track: (name: string, props?: Record<string, unknown>) => {
      const ev: Record<string, unknown> = { t: 'ce', n: String(name).slice(0, 64) };
      if (props && typeof props === 'object') {
        const pr: Record<string, string | number | boolean> = {};
        for (const [k, v] of Object.entries(props).slice(0, 10)) {
          if (typeof v === 'number' || typeof v === 'boolean') pr[k.slice(0, 40)] = v;
          else if (typeof v === 'string') pr[k.slice(0, 40)] = v.slice(0, 200);
        }
        ev.pr = pr;
      }
      push(ev as Ev);
    },
    setConsent: (c: Consent) => {
      consent = c;
      if (c === 'denied') {
        queue = [];
        safe(() => store?.removeItem('_pulse_q'), undefined);
      } else if (c === 'granted') {
        persist();
        void flush();
      }
    },
    /** test helpers */
    _state: () => ({ queue, visit, consent, stopped, backoffUntil, pending }),
  };
}

export type Tracker = ReturnType<typeof createTracker>;
