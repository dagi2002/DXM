/**
 * DXM Pulse — Session Replay Extension (v2)
 *
 * Requires dxm.v2.js to be loaded first (provides the session id in sessionStorage).
 *
 * Uses rrweb to capture DOM snapshots + mutation events, chunked and flushed
 * to /collect-replay/replay. Respects the v2 privacy API — if the customer calls
 * `window.dxm.privacy.disableInputCapture()` we switch to full input masking.
 *
 * Target bundle: ~30 KB gzipped (rrweb is ~25 KB).
 *
 * Install AFTER dxm.v2.js:
 *   <script src="https://cdn.dxmpulse.com/dxm-replay.v2.js" data-site-id="YOUR_SITE_KEY" async></script>
 */
import { record } from 'rrweb';
import { API_ENDPOINTS } from '../../../contracts/index.js';

(() => {
  'use strict';

  const script =
    document.currentScript ??
    document.querySelector('script[data-site-id][src*="dxm-replay"]');
  if (!script) return;

  const siteId = (script as HTMLScriptElement).getAttribute('data-site-id');
  if (!siteId) return;

  const rawApiUrl =
    (script as HTMLScriptElement).getAttribute('data-api-url') ||
    'https://api.dxmpulse.com';
  const apiUrl = rawApiUrl.replace(/\/$/, '');

  const sessionKey = `dxm_sid_${siteId}`;
  const CHUNK_SIZE = 50;
  const MAX_REPLAY_EVENTS = 5000;

  let sessionId: string | null = null;
  try {
    sessionId = sessionStorage.getItem(sessionKey);
  } catch {
    /* ignore */
  }
  if (!sessionId) return; // dxm.v2.js must be loaded first

  let replayBuffer: unknown[] = [];
  let totalEventCount = 0;

  const flushReplayChunk = (events: unknown[]): void => {
    if (!events.length) return;
    const payload = JSON.stringify({
      sessionId,
      siteId,
      replayEvents: events,
      chunkIndex: Math.floor(totalEventCount / CHUNK_SIZE),
    });

    const endpoint = apiUrl + API_ENDPOINTS.collectReplay + '?sdk=v2';

    if (navigator.sendBeacon) {
      try {
        if (navigator.sendBeacon(endpoint, new Blob([payload], { type: 'application/json' }))) return;
      } catch {
        /* fall through */
      }
    }

    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', endpoint, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('x-dxm-sdk', 'v2');
      xhr.send(payload);
    } catch {
      /* drop silently */
    }
  };

  const inputCaptureDisabled =
    typeof window !== 'undefined' &&
    (window as Window & { dxm?: { privacy?: unknown } }).dxm?.privacy
      ? false
      : false;

  try {
    record({
      emit: (event: unknown) => {
        if (totalEventCount >= MAX_REPLAY_EVENTS) return;
        replayBuffer.push(event);
        totalEventCount++;
        if (replayBuffer.length >= CHUNK_SIZE) {
          const chunk = replayBuffer.splice(0, CHUNK_SIZE);
          flushReplayChunk(chunk);
        }
      },
      sampling: {
        mousemove: 50,
        scroll: 150,
        input: 'last',
        media: 800,
      },
      blockClass: 'dxm-block',
      maskAllInputs: true,
      maskInputOptions: {
        password: true,
        email: inputCaptureDisabled,
        tel: inputCaptureDisabled,
        text: inputCaptureDisabled,
      },
      ignoreClass: 'dxm-ignore',
    });
  } catch (err) {
    console.warn('[DXM Replay v2] Failed to start recording:', err instanceof Error ? err.message : String(err));
  }

  window.addEventListener('pagehide', () => {
    if (replayBuffer.length) flushReplayChunk(replayBuffer.splice(0));
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && replayBuffer.length) {
      flushReplayChunk(replayBuffer.splice(0));
    }
  });
})();
