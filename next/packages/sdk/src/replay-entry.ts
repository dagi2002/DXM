/**
 * r.js entry: wires the recorder to the page. p.js sets `dxm._r` before injecting this file.
 */
import { record } from '@rrweb/record';
import { browserGzip, createRecorder } from './replay';

type Bridge = {
  e: string;
  k: string;
  vid: () => string;
  consent: () => 'granted' | 'pending' | 'denied';
  started?: boolean;
};

try {
  const w = window as Window & { dxm?: { _r?: Bridge } };
  const bridge = w.dxm?._r;
  if (bridge && !bridge.started) {
    bridge.started = true;
    let store: Storage | null = null;
    try {
      store = window.sessionStorage;
    } catch {
      /* blocked */
    }
    createRecorder(
      { endpoint: bridge.e, key: bridge.k, vid: bridge.vid, consent: bridge.consent },
      {
        record,
        fetch: (...a) => fetch(...a),
        now: () => Date.now(),
        gzip: browserGzip(),
        store,
        setInterval: (fn, ms) => setInterval(fn, ms),
        setTimeout: (fn, ms) => setTimeout(fn, ms),
        onHide: (fn) => {
          document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && fn());
          window.addEventListener('pagehide', fn);
        },
      },
    ).start();
  }
} catch {
  /* never break the host page */
}
