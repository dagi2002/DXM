import rateLimit from 'express-rate-limit';
import { createHash } from 'crypto';

/** General API limiter — 100 requests per minute */
export const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please try again shortly.' },
});

/** Auth endpoints — stricter: 10 attempts per minute */
export const authLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts — please wait before retrying.' },
});

/**
 * MCP endpoint — keyed per bearer token so one noisy client can't starve
 * others. The header is hashed so the raw secret never sits in limiter
 * memory. Unauthenticated probes fall back to per-IP.
 */
export const mcpLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const auth = req.header('authorization');
    if (auth) return createHash('sha256').update(auth).digest('hex');
    return req.ip || 'unknown';
  },
  message: { error: 'MCP rate limit exceeded — slow down.' },
});

/** SDK /collect endpoint — generous limit per site key */
export const collectLimiter = rateLimit({
  windowMs: 10_000,
  max: 200,
  standardHeaders: false,
  legacyHeaders: false,
  keyGenerator: (req) => req.body?.siteId || req.ip || 'unknown',
  message: { error: 'Rate limit exceeded for SDK collect endpoint.' },
});
