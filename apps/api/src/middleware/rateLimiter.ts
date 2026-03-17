import rateLimit from 'express-rate-limit';

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

/** SDK /collect endpoint — generous limit per site key */
export const collectLimiter = rateLimit({
  windowMs: 10_000,
  max: 200,
  standardHeaders: false,
  legacyHeaders: false,
  keyGenerator: (req) => req.body?.siteId || req.ip || 'unknown',
  message: { error: 'Rate limit exceeded for SDK collect endpoint.' },
});
