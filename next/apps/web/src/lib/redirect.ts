/**
 * Only same-app relative paths are allowed as post-login destinations (no open redirects).
 * Browsers treat `\` like `/` and strip tabs/newlines while parsing URLs, so `/\evil.example`
 * or `/\t/evil.example` would become the protocol-relative `//evil.example`; both are refused.
 */
export function safeRedirect(target: unknown): string {
  if (typeof target !== 'string' || !target.startsWith('/')) return '/';
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(target) || target.startsWith('//')) return '/';
  try {
    const base = 'https://pulse.invalid';
    const url = new URL(target, base);
    if (url.origin !== base) return '/';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/';
  }
}
