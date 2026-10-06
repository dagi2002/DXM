/** Query parameters that are safe and useful to keep (campaign attribution). Everything else is dropped. */
export const KEPT_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref'];

const EMAIL = /[^/\s@]+@[^/\s@]+\.[^/\s@]+/g;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const LONG_DIGITS = /\d{7,}/g; // phone numbers (09…, +2519…), order and account numbers
const TOKENISH = /[A-Za-z0-9_-]{24,}/g; // session ids, reset tokens, JWT parts

/** Masks identifiers that commonly leak into URL paths. */
export function scrubPath(path: string): string {
  return path
    .replace(EMAIL, ':email')
    .replace(UUID, ':id')
    .replace(TOKENISH, ':token')
    .replace(LONG_DIGITS, ':num')
    .slice(0, 300);
}

/** Path + allow-listed query string; fragments (often OAuth tokens) are always dropped. */
export function scrubUrl(href: string): { p: string; q?: string } {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return { p: '/' };
  }
  const kept = new URLSearchParams();
  u.searchParams.forEach((v, k) => {
    if (KEPT_PARAMS.includes(k.toLowerCase())) kept.append(k.toLowerCase(), scrubPath(v).slice(0, 100));
  });
  const q = kept.toString();
  return q ? { p: scrubPath(u.pathname), q } : { p: scrubPath(u.pathname) };
}

/** Referrer host only, and only when it's another site. */
export function referrerHost(referrer: string, ownHost: string): string | undefined {
  try {
    const h = new URL(referrer).hostname;
    return h && h !== ownHost ? h : undefined;
  } catch {
    return undefined;
  }
}

const GENERATED_CLASS = /^(css|sc|jsx|tw|svelte|emotion)-|[0-9a-f]{5,}|__/i;

/** Short, stable CSS-ish selector for heatmaps and issue grouping. Never includes text content. */
export function selectorFor(el: Element | null): string {
  if (!el) return '';
  const named = el.closest('[data-pulse-name]');
  if (named) return `[${named.getAttribute('data-pulse-name')?.slice(0, 60)}]`;
  const parts: string[] = [];
  let node: Element | null = el;
  for (let depth = 0; node && depth < 3 && node.tagName !== 'BODY'; depth++) {
    let part = node.tagName.toLowerCase();
    if (node.id && !/\d{3,}/.test(node.id)) {
      parts.unshift(`${part}#${node.id}`);
      break;
    }
    const classes = Array.from(node.classList)
      .filter((c) => !GENERATED_CLASS.test(c))
      .slice(0, 2);
    if (classes.length) part += `.${classes.join('.')}`;
    parts.unshift(part);
    node = node.parentElement;
  }
  return parts.join('>').slice(0, 120);
}
