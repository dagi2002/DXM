/**
 * In-memory token bucket per key (one API process; the public report route is the only user so
 * far). Each key holds up to `capacity` tokens and regains `refillPerSecond`; a request spends one.
 * Memory is bounded: when the map grows past `maxKeys`, full (idle) buckets are dropped first.
 */
export interface RateLimiterOptions {
  capacity: number;
  refillPerSecond: number;
  maxKeys?: number;
}

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until one token is available again (0 when ok). */
  retryAfter: number;
}

export function createRateLimiter(opts: RateLimiterOptions, clock: () => number = Date.now) {
  const { capacity, refillPerSecond } = opts;
  const maxKeys = opts.maxKeys ?? 10_000;
  const buckets = new Map<string, { tokens: number; at: number }>();

  const refill = (b: { tokens: number; at: number }, now: number) => {
    b.tokens = Math.min(capacity, b.tokens + ((now - b.at) / 1000) * refillPerSecond);
    b.at = now;
  };

  return {
    take(key: string): RateLimitResult {
      const now = clock();
      let b = buckets.get(key);
      if (!b) {
        if (buckets.size >= maxKeys) {
          for (const [k, v] of buckets) {
            refill(v, now);
            if (v.tokens >= capacity) buckets.delete(k);
          }
          if (buckets.size >= maxKeys) buckets.clear();
        }
        b = { tokens: capacity, at: now };
        buckets.set(key, b);
      } else {
        refill(b, now);
      }
      if (b.tokens >= 1) {
        b.tokens -= 1;
        return { ok: true, retryAfter: 0 };
      }
      return { ok: false, retryAfter: Math.max(1, Math.ceil((1 - b.tokens) / refillPerSecond)) };
    },
    get size() {
      return buckets.size;
    },
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;
