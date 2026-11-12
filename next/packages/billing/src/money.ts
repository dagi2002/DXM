/**
 * Money is integer santim everywhere (1 birr = 100 santim). Chapa speaks birr with up to two
 * decimals, as a string or a number; these two functions are the only place that crosses over,
 * and they never do floating-point arithmetic on an amount.
 */

/** 240000 → "2400.00" (what Chapa's initialize endpoint takes). */
export function santimToBirr(santim: number): string {
  if (!Number.isSafeInteger(santim) || santim < 0) throw new Error('santim must be a non-negative integer');
  const s = String(santim).padStart(3, '0');
  return `${s.slice(0, -2)}.${s.slice(-2)}`;
}

/**
 * "2400", "2400.5", "2400.50" or the numbers 2400 / 2400.5 → santim. Anything else (negative,
 * exponent, more than two decimals, not a number) → null, which callers treat as a mismatch.
 */
export function birrToSantim(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const m = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(String(value).trim());
  if (!m) return null;
  const santim = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(santim) ? santim : null;
}
