import { describe, expect, it } from 'vitest';
import { newId, newPublicKey, randomBase62 } from './index';

describe('ids', () => {
  it('generates base62 strings of the requested length', () => {
    expect(randomBase62(32)).toMatch(/^[0-9A-Za-z]{32}$/);
  });

  it('prefixes ids and public keys', () => {
    expect(newId('site')).toMatch(/^site_[0-9A-Za-z]{20}$/);
    expect(newPublicKey()).toMatch(/^pk_[0-9A-Za-z]{22}$/);
  });

  it('does not repeat across many draws', () => {
    const seen = new Set(Array.from({ length: 5000 }, () => newPublicKey()));
    expect(seen.size).toBe(5000);
  });

  it('uses the whole alphabet roughly uniformly', () => {
    const counts = new Map<string, number>();
    for (const ch of randomBase62(62_000)) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    expect(counts.size).toBe(62);
    for (const n of counts.values()) expect(n).toBeGreaterThan(700); // expected ≈1000 each
  });
});
