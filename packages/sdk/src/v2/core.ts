/**
 * DXM Pulse SDK v2 — Core bootstrap
 *
 * Reads the <script data-site-id="..."> tag, generates / restores session id,
 * builds the SdkConfig object used by every other module.
 */
import type { SdkConfig } from './types.js';

const genId = (): string => {
  try {
    // 10000000-1000-4000-8000-100000000000 template (v1 parity)
    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c: string) => {
      const numericChar = Number(c);
      return (
        numericChar ^
        ((crypto.getRandomValues(new Uint8Array(1))[0] & 15) >> (numericChar / 4))
      ).toString(16);
    });
  } catch {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c: string) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
};

export const readConfig = (): SdkConfig | null => {
  const script =
    document.currentScript ??
    document.querySelector('script[data-site-id]');
  if (!script) return null;

  const siteId = (script as HTMLScriptElement).getAttribute('data-site-id');
  if (!siteId) return null;

  const rawApiUrl =
    (script as HTMLScriptElement).getAttribute('data-api-url') ||
    'https://api.dxmpulse.com';
  const apiUrl = rawApiUrl.replace(/\/$/, '');

  const sessionKey = `dxm_sid_${siteId}`;
  const queueKey = `dxm_q_${siteId}`;

  let sessionId: string;
  try {
    const stored = sessionStorage.getItem(sessionKey);
    if (stored) {
      sessionId = stored;
    } else {
      sessionId = genId();
      sessionStorage.setItem(sessionKey, sessionId);
    }
  } catch {
    sessionId = genId();
  }

  return {
    siteId,
    apiUrl,
    sessionId,
    sessionKey,
    queueKey,
    maxQueue: 200,
    flushIntervalMs: 10000,
    version: 'v2',
  };
};
