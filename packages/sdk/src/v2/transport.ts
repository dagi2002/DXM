/**
 * DXM Pulse SDK v2 — Transport layer
 *
 * Owns the localStorage event queue + sendBeacon/XHR flush loop.
 * Identical offline-resilience characteristics to v1 so Ethiopian mobile users
 * never lose events during bad-network windows.
 *
 * Adds an `x-dxm-sdk: v2` header (via a URL query param fallback for
 * sendBeacon, which can't set headers) so the ingest API can tag sessions.
 */
import type { DxmEvent, SdkConfig } from './types.js';
import { API_ENDPOINTS } from '../../../contracts/index.js';

let lastFlush = 0;
let flushTimer: ReturnType<typeof setInterval> | null = null;

const loadQueue = (cfg: SdkConfig): DxmEvent[] => {
  try {
    const raw = localStorage.getItem(cfg.queueKey);
    return raw ? (JSON.parse(raw) as DxmEvent[]) : [];
  } catch {
    return [];
  }
};

const saveQueue = (cfg: SdkConfig, queue: DxmEvent[]): void => {
  try {
    localStorage.setItem(cfg.queueKey, JSON.stringify(queue));
  } catch {
    /* quota exceeded or storage disabled — drop silently */
  }
};

export const push = (cfg: SdkConfig, event: DxmEvent): void => {
  const queue = loadQueue(cfg);
  queue.push(event);
  if (queue.length > cfg.maxQueue) queue.splice(0, queue.length - cfg.maxQueue);
  saveQueue(cfg, queue);
  // Burst flush: error storms etc.
  if (queue.length > 50) flush(cfg, 'interval');
};

type FlushReason = 'interval' | 'online' | 'pagehide' | 'hidden';

export const flush = (cfg: SdkConfig, reason: FlushReason): void => {
  const now = Date.now();
  const force = reason === 'online' || reason === 'pagehide' || reason === 'hidden';
  const completed = reason === 'pagehide' || reason === 'hidden';
  if (!force && now - lastFlush < cfg.flushIntervalMs) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  const queue = loadQueue(cfg);
  if (!queue.length && !completed) return;

  const payload = JSON.stringify({
    sessionId: cfg.sessionId,
    siteId: cfg.siteId,
    events: queue,
    completed,
    metadata: {
      url: location.href,
      userAgent: navigator.userAgent,
      language: navigator.language || (navigator as { userLanguage?: string }).userLanguage || 'en',
      screen: { width: screen.width, height: screen.height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
    },
  });

  // sendBeacon can't set arbitrary headers, so we signal SDK version via a query param.
  const versionMarker = `?sdk=${cfg.version}`;
  const endpoint = cfg.apiUrl + API_ENDPOINTS.collect + versionMarker;

  let sent = false;
  if (navigator.sendBeacon) {
    try {
      sent = navigator.sendBeacon(endpoint, new Blob([payload], { type: 'application/json' }));
    } catch {
      sent = false;
    }
  }

  if (sent) {
    saveQueue(cfg, []);
    lastFlush = now;
    return;
  }

  // XHR fallback — old Android browsers, Telebirr WebView
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('x-dxm-sdk', cfg.version);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 400) {
        saveQueue(cfg, []);
        lastFlush = Date.now();
      }
    };
    xhr.send(payload);
  } catch {
    /* give up this round; we'll retry on next interval */
  }
};

export const startFlushLoop = (cfg: SdkConfig): void => {
  flushTimer = setInterval(() => flush(cfg, 'interval'), cfg.flushIntervalMs);
  window.addEventListener('online', () => flush(cfg, 'online'));
  window.addEventListener('offline', () => {
    if (flushTimer) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
  });
  window.addEventListener('pagehide', () => flush(cfg, 'pagehide'));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(cfg, 'hidden');
  });
};
