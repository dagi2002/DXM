/**
 * DXM Pulse SDK v2 — Privacy / PII scrubbing
 *
 * Design goals:
 *  - Safe defaults. Query-string keys matching /email=|token=|ssn=|auth=|password=/
 *    are ALWAYS scrubbed, even if the customer never touches the privacy API.
 *  - Zero egress of form field values. Only field *names* reach the backend,
 *    and only after the scrubFields denylist filters them.
 *  - Runtime configurable. Customers call `window.dxm.privacy.maskUrls([...])` etc.
 *
 * Nothing in this module talks to the network — it only transforms values.
 */
import type { PrivacyConfig } from './types.js';

const DEFAULT_QUERY_DENYLIST = [
  /(^|[?&])(email|token|ssn|auth|password|api_?key)=([^&#]*)/gi,
];

const state: PrivacyConfig = {
  urlMasks: [],
  fieldScrubs: ['password', 'ssn', 'cvv', 'cc', 'card'],
  disableInputCapture: false,
  queryParamDenylist: DEFAULT_QUERY_DENYLIST.slice(),
};

const matchesPrefix = (pathname: string, prefix: string): boolean => {
  const normalizedPrefix = prefix.startsWith('/') ? prefix : `/${prefix}`;
  if (pathname === normalizedPrefix) return true;
  return pathname.startsWith(normalizedPrefix + '/') || pathname.startsWith(normalizedPrefix + '?');
};

/**
 * Scrub a URL before emitting. Order:
 *   1. Strip denied query parameters (always on).
 *   2. Apply URL path masks from maskUrls() config.
 * Never throws — falls back to the raw href on any parse error.
 */
export const scrubUrl = (href: string): string => {
  if (!href) return href;
  try {
    const url = new URL(href, 'http://localhost');
    // Rebuild search string with denied params redacted.
    const searchParams = url.searchParams;
    const scrubbedParams = new URLSearchParams();
    searchParams.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      const denied = state.queryParamDenylist.some((pattern) => {
        const src = pattern.source.toLowerCase();
        return src.includes(lowerKey);
      });
      scrubbedParams.append(key, denied ? 'REDACTED' : value);
    });
    const rebuiltSearch = scrubbedParams.toString();
    url.search = rebuiltSearch ? `?${rebuiltSearch}` : '';

    // Apply URL masks — replace matching path prefixes.
    const originalPath = url.pathname;
    for (const prefix of state.urlMasks) {
      if (matchesPrefix(originalPath, prefix)) {
        const normalizedPrefix = prefix.startsWith('/') ? prefix : `/${prefix}`;
        url.pathname = `${normalizedPrefix}/:masked`;
        break;
      }
    }

    return url.toString();
  } catch {
    return href;
  }
};

/** Returns true when the given field name matches the scrub denylist. */
export const shouldScrubField = (name: string | null | undefined): boolean => {
  if (!name) return false;
  const lower = name.toLowerCase();
  return state.fieldScrubs.some((pattern) => lower.indexOf(pattern.toLowerCase()) !== -1);
};

/** Returns the field name to emit (or null to suppress the event). */
export const scrubFieldName = (name: string | null | undefined): string | null => {
  if (!name) return null;
  return shouldScrubField(name) ? 'REDACTED' : name;
};

export const isInputCaptureDisabled = (): boolean => state.disableInputCapture;

// ── Public config API ────────────────────────────────────────────────────────
export const privacyApi = {
  maskUrls(patterns: string[]): void {
    if (!Array.isArray(patterns)) return;
    state.urlMasks = patterns.filter((p): p is string => typeof p === 'string' && p.length > 0);
  },
  scrubFields(patterns: string[]): void {
    if (!Array.isArray(patterns)) return;
    const extras = patterns.filter((p): p is string => typeof p === 'string' && p.length > 0);
    // Merge — never remove the defaults (password/ssn/cvv/cc/card).
    const defaults = ['password', 'ssn', 'cvv', 'cc', 'card'];
    const merged = new Set<string>([...defaults, ...extras]);
    state.fieldScrubs = Array.from(merged);
  },
  disableInputCapture(): void {
    state.disableInputCapture = true;
  },
};
