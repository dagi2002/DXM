import { createHash } from 'node:crypto';

const ID_SEGMENT = [
  /^\d+$/, // 123
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, // uuid
  /^[0-9a-f]{12,}$/i, // long hex (mongo ids, hashes)
  /^(?=.*\d)[A-Za-z0-9_-]{16,}$/, // long opaque tokens with digits
  /^(?=.*\d)(?=.*[a-z])[a-z0-9]+(?:-[a-z0-9]+)*-\d+$/i, // slug-123
];

/**
 * Collapses ids in a path so the same template groups together: `/orders/8812` and `/orders/913`
 * become `/orders/*`. Trailing slashes are dropped (except for `/`). Slugs without digits are
 * kept, since `/products/habesha-kemis` is a page owners recognize.
 */
export function normalizePath(path: string | null | undefined): string | null {
  if (!path) return null;
  const clean = path.split(/[?#]/)[0]!;
  if (!clean.startsWith('/')) return null;
  const segments = clean
    .split('/')
    .filter(Boolean)
    .map((s) => (ID_SEGMENT.some((re) => re.test(s)) ? '*' : s));
  return `/${segments.join('/')}`;
}

/** Stable id for "this kind of problem on this element of this page template". */
export function fingerprintOf(kind: string, path: string, selector: string): string {
  return createHash('sha256').update(`${kind}\u0000${path}\u0000${selector}`).digest('hex').slice(0, 32);
}
