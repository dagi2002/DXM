/**
 * DXM Pulse SDK v2 — Page & navigation events
 * Emits pageview (once) + navigation (for SPA route changes via history API).
 */
import type { SdkConfig } from '../types.js';
import { push } from '../transport.js';
import { scrubUrl } from '../privacy.js';

export const installPageEvents = (cfg: SdkConfig): void => {
  // Initial pageview
  push(cfg, { type: 'pageview', url: scrubUrl(location.href), ts: Date.now() });

  const onNavigation = (): void => {
    push(cfg, { type: 'navigation', url: scrubUrl(location.href), ts: Date.now() });
  };

  const origPush = history.pushState;
  const origReplace = history.replaceState;
  history.pushState = function patched(...args: Parameters<typeof history.pushState>) {
    const result = origPush.apply(history, args);
    onNavigation();
    return result;
  };
  history.replaceState = function patched(...args: Parameters<typeof history.replaceState>) {
    const result = origReplace.apply(history, args);
    onNavigation();
    return result;
  };
  window.addEventListener('popstate', onNavigation);
};
