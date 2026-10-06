/**
 * DXM Pulse browser SDK v3 — the script customers paste into their site.
 *
 *   <script async src="https://app.dxmpulse.et/sdk/p.js" data-site="pk_…"></script>
 *
 * Optional attributes: data-consent="required" (wait for dxm('consent','granted')),
 * data-respect-gpc="false" (ignore Global Privacy Control), data-api="https://…" (custom collector).
 * Legacy v1/v2 attributes (data-site-id, data-api-url) and globals still work (docs/rebuild/04 §1).
 */
import { createTracker, type Consent } from './core';

type Cmd = [string, ...unknown[]];
type Dxm = ((...cmd: Cmd) => void) & { q?: Cmd[]; loaded?: boolean; [k: string]: unknown };

function boot() {
  const w = window as Window & typeof globalThis & { dxm?: Dxm; dxm_optout?: boolean };
  if (w.dxm?.loaded) return;

  const script = (document.currentScript ??
    document.querySelector('script[data-site],script[data-site-id]')) as HTMLScriptElement | null;
  const key = script?.getAttribute('data-site') ?? script?.getAttribute('data-site-id');
  if (!script || !key) return;

  let optedOut = false;
  try {
    optedOut = localStorage.getItem('pulse_optout') === '1'; // site owners can exclude their own visits
  } catch {
    /* storage blocked */
  }
  if (optedOut) return;

  const api = script.getAttribute('data-api') ?? script.getAttribute('data-api-url');
  const endpoint = `${(api ?? new URL(script.src).origin).replace(/\/$/, '')}/i`;
  const gpc = (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
  const needsConsent =
    script.getAttribute('data-consent') === 'required' ||
    (gpc && script.getAttribute('data-respect-gpc') !== 'false');

  let store: Storage | null = null;
  try {
    store = window.sessionStorage;
  } catch {
    /* blocked */
  }

  const tracker = createTracker(
    { key, endpoint, consent: needsConsent ? 'pending' : 'granted' },
    {
      win: w,
      doc: document,
      store,
      fetch: (...a) => fetch(...a),
      beacon: navigator.sendBeacon ? (u, d) => navigator.sendBeacon(u, d) : null,
      now: () => Date.now(),
      random: () => {
        const b = new Uint8Array(15);
        crypto.getRandomValues(b);
        return btoa(String.fromCharCode(...b))
          .replace(/\+/g, '-')
          .replace(/\//g, '_');
      },
    },
  );

  const queued = w.dxm?.q ?? [];
  const run = (cmd: string, ...args: unknown[]) => {
    if (cmd === 'track') tracker.track(String(args[0]), args[1] as Record<string, unknown>);
    else if (cmd === 'consent') tracker.setConsent(args[0] as Consent);
  };
  const dxm = ((cmd: string, ...args: unknown[]) => run(cmd, ...args)) as Dxm;
  dxm.loaded = true;
  dxm.version = '3';
  dxm.track = (name: string, props?: Record<string, unknown>) => tracker.track(name, props);
  dxm.consent = (c: Consent) => tracker.setConsent(c);
  // Legacy v1/v2 API: identify() is ignored on purpose (no personal identifiers); privacy.* are now defaults.
  dxm.identify = () => {};
  dxm.privacy = { maskUrls() {}, scrubFields() {}, disableInputCapture() {} };
  w.dxm = dxm;

  tracker.start();
  for (const c of queued) run(...c);

  // Web Vitals live in a separate file (v.js) fetched once the page is idle.
  dxm._vital = (name: string, value: number) => tracker.vital(name, value);
  const loadVitals = () => {
    const s = document.createElement('script');
    s.async = true;
    s.src = script.src.replace(/[^/?#]*([?#].*)?$/, 'v.js');
    document.head.appendChild(s);
  };
  const idle = () =>
    'requestIdleCallback' in w
      ? w.requestIdleCallback(loadVitals, { timeout: 4000 })
      : setTimeout(loadVitals, 1500);
  if (document.readyState === 'complete') idle();
  else w.addEventListener('load', idle, { once: true });
}

try {
  boot();
} catch {
  /* never break the host page */
}
