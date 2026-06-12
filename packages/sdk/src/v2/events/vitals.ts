/**
 * DXM Pulse SDK v2 — Core Web Vitals
 * Captures LCP / CLS / FCP / INP via PerformanceObserver + TTFB from Navigation Timing.
 * Identical to v1 behavior — ported to TypeScript.
 */
import type { SdkConfig } from '../types.js';
import { push } from '../transport.js';

type VitalName = 'LCP' | 'CLS' | 'FCP' | 'INP' | 'TTFB';

const emit = (cfg: SdkConfig, name: VitalName, value: number): void => {
  push(cfg, { type: 'vital', name, value, ts: Date.now() });
};

export const installVitalsEvents = (cfg: SdkConfig): void => {
  if ('PerformanceObserver' in window) {
    // LCP
    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries.length) {
          const lcp = entries[entries.length - 1] as PerformanceEntry;
          emit(cfg, 'LCP', Math.round(lcp.startTime));
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {
      /* ignore */
    }

    // CLS
    try {
      new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          const ls = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
          if (!ls.hadRecentInput && typeof ls.value === 'number') {
            emit(cfg, 'CLS', Math.round(ls.value * 1000) / 1000);
          }
        });
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {
      /* ignore */
    }

    // FCP
    try {
      new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.name === 'first-contentful-paint') {
            emit(cfg, 'FCP', Math.round(entry.startTime));
          }
        });
      }).observe({ type: 'paint', buffered: true });
    } catch {
      /* ignore */
    }

    // INP (Interaction to Next Paint)
    try {
      new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          const eventTiming = entry as PerformanceEntry & { processingEnd?: number };
          if (typeof eventTiming.processingEnd === 'number') {
            emit(cfg, 'INP', Math.round(eventTiming.processingEnd - entry.startTime));
          }
        });
      }).observe({ type: 'event', buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
    } catch {
      /* ignore */
    }
  }

  // TTFB — one-shot after load
  window.addEventListener('load', () => {
    try {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      if (nav) emit(cfg, 'TTFB', Math.round(nav.responseStart));
    } catch {
      /* ignore */
    }
  });
};
