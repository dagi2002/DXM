/**
 * DXM Pulse — Base Tracking SDK (v2)
 *
 * Modular TypeScript rewrite of the v1 vanilla-JS SDK.
 * Target bundle: <15 KB gzipped (enforced by build.js gzip gate).
 *
 * New in v2:
 *   - TypeScript source with type safety
 *   - Privacy API (URL masking, field scrubbing, input-capture kill switch)
 *   - Dead-click detection
 *   - Form lifecycle events (form_start, form_submit, form_error)
 *   - `x-dxm-sdk: v2` header / ?sdk=v2 query marker on /collect
 *
 * Install:
 *   <script src="https://cdn.dxmpulse.com/dxm.v2.js" data-site-id="YOUR_SITE_KEY" async></script>
 *
 * Existing v1 installations remain unchanged — v1 continues to be served at /dxm.js.
 */
import type { DxmEvent } from './types.js';
import { readConfig } from './core.js';
import { push, startFlushLoop } from './transport.js';
import { privacyApi } from './privacy.js';
import { installPageEvents } from './events/page.js';
import { installInteractionEvents } from './events/interaction.js';
import { installVitalsEvents } from './events/vitals.js';

declare global {
  interface Window {
    dxm: {
      track(eventName: string, properties?: Record<string, unknown>): void;
      identify(userId: string): void;
      privacy: typeof privacyApi;
      version: 'v2';
    };
  }
}

(() => {
  'use strict';

  const cfg = readConfig();
  if (!cfg) return;

  // Event pipeline
  installPageEvents(cfg);
  installInteractionEvents(cfg);
  installVitalsEvents(cfg);
  startFlushLoop(cfg);

  // Public API
  window.dxm = {
    track(eventName: string, properties?: Record<string, unknown>): void {
      const base: DxmEvent = { type: 'custom', event: String(eventName).slice(0, 80), ts: Date.now() };
      const merged = Object.assign({}, properties || {}, base) as DxmEvent;
      push(cfg, merged);
    },
    identify(userId: string): void {
      push(cfg, { type: 'identify', userId: String(userId).slice(0, 64), ts: Date.now() });
    },
    privacy: privacyApi,
    version: 'v2',
  };
})();
