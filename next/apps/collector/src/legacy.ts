import { VISIT_ID_RE, type IngestBatch, type IngestEvent } from '@pulse/contracts/ingest';
import { createHash } from 'node:crypto';

/**
 * Maps a legacy v1/v2 `/collect` payload onto the v3 batch so old installs keep reporting
 * (docs/rebuild/04 §1). Legacy shape: { sessionId, siteId: <siteKey>, events: [...], metadata }.
 * Anything unrecognized is dropped rather than trusted.
 */
interface LegacyEvent {
  type?: unknown;
  ts?: unknown;
  timestamp?: unknown;
  url?: unknown;
  x?: unknown;
  y?: unknown;
  target?: unknown;
  depth?: unknown;
  value?: unknown;
  name?: unknown;
  event?: unknown;
  formId?: unknown;
  fieldName?: unknown;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

function pathOf(url: unknown): string {
  if (typeof url !== 'string') return '/';
  try {
    return new URL(url, 'https://legacy.invalid').pathname.slice(0, 300);
  } catch {
    return '/';
  }
}

export function mapLegacyPayload(raw: unknown, now: number): IngestBatch | null {
  if (!raw || typeof raw !== 'object') return null;
  const body = raw as {
    sessionId?: unknown;
    siteId?: unknown;
    events?: unknown;
    metadata?: { url?: unknown; viewport?: unknown; language?: unknown };
  };
  const key = str(body.siteId, 64);
  const sid = str(body.sessionId, 200);
  if (!key || !sid || !Array.isArray(body.events)) return null;
  const vid = VISIT_ID_RE.test(sid)
    ? sid
    : `lg_${createHash('sha256').update(sid).digest('base64url').slice(0, 24)}`;
  const fallbackPath = pathOf(body.metadata?.url);
  const vp = body.metadata?.viewport as { width?: unknown; height?: unknown } | undefined;
  const vw = Math.min(20_000, Math.max(0, Math.round(num(vp?.width) ?? 1280)));

  const ev: IngestEvent[] = [];
  for (const e of body.events.slice(0, 100) as LegacyEvent[]) {
    const ts = Math.round(num(e.ts) ?? num(e.timestamp) ?? now);
    const p = e.url ? pathOf(e.url) : fallbackPath;
    switch (e.type) {
      case 'pageview':
      case 'navigation':
        ev.push({ t: 'pv', ts, p });
        break;
      case 'click': {
        const x = num(e.x);
        ev.push({
          t: 'cl',
          ts,
          p,
          s: str(e.target, 120) ?? '',
          x: x !== undefined ? Math.min(1, Math.max(0, x / vw)) : 0,
          y: Math.max(0, num(e.y) ?? 0),
        });
        break;
      }
      case 'dead_click':
        ev.push({ t: 'dc', ts, p, s: str(e.target, 120) ?? '' });
        break;
      case 'scroll': {
        const d = num(e.depth) ?? num(e.value);
        if (d !== undefined) ev.push({ t: 'sc', ts, p, d: Math.round(Math.min(100, Math.max(0, d))) });
        break;
      }
      case 'vital': {
        // legacy values look like "LCP:2300"
        const [name, value] = String(e.value ?? '').split(':');
        const v = Number(value);
        if (
          (name === 'LCP' || name === 'INP' || name === 'CLS' || name === 'FCP' || name === 'TTFB') &&
          Number.isFinite(v) &&
          v >= 0
        ) {
          ev.push({ t: 'vt', ts, p, n: name, v });
        }
        break;
      }
      case 'form_start':
        ev.push({ t: 'fs', ts, p, f: str(e.formId, 80) ?? 'form' });
        break;
      case 'form_submit':
        ev.push({ t: 'fx', ts, p, f: str(e.formId, 80) ?? 'form' });
        break;
      case 'form_error':
        ev.push({ t: 'fe', ts, p, f: str(e.formId, 80) ?? 'form', n: str(e.fieldName, 80) ?? 'field' });
        break;
      case 'custom': {
        const n = str(e.event ?? e.name, 64);
        if (n) ev.push({ t: 'ce', ts, p, n });
        break;
      }
      default:
        break;
    }
  }
  if (!ev.length) return null;
  return {
    v: 3,
    k: key,
    vid,
    sv: 'legacy',
    ctx: {
      vw,
      vh: Math.min(20_000, Math.max(0, Math.round(num(vp?.height) ?? 800))),
      lang: str(body.metadata?.language, 35),
      plat: 'web',
    },
    ev,
  };
}
