import type { RequestHandler } from 'express';

/**
 * Security headers middleware.
 * No external dependencies — replaces helmet with only the headers we need.
 */
export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '0'); // modern recommendation: disable, rely on CSP
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // CSP: allow 'unsafe-inline' for styles (Tailwind + rrweb), blob: for rrweb replay iframe
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-src blob:; worker-src blob:",
  );

  // HSTS — only in production (behind TLS termination)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
};
