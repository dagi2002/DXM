import { SHARE_TOKEN_RE, ReportSnapshot, type PublicReport } from '@pulse/contracts';
import { sql } from '@pulse/db';
import { hashShareToken } from '@pulse/reports';
import { Hono } from 'hono';
import type { AppDeps } from '../app';
import { ApiError, notFound, type AppEnv } from '../http';
import { createRateLimiter } from '../rate-limit';

/** Per client IP: a burst of 30 opens, then one every 2 seconds. */
export const PUBLIC_REPORT_RATE_LIMIT = { capacity: 30, refillPerSecond: 0.5 };

/** For request logs: the token is a bearer credential and must never be written down. */
export const PUBLIC_REPORT_PATH_RE = /^(\/api\/v1\/public\/reports\/)[^/]+/;
export const redactPath = (path: string) => path.replace(PUBLIC_REPORT_PATH_RE, '$1:token');

/**
 * `GET /api/v1/public/reports/:token` — unauthenticated, token-scoped. It returns that one
 * report's frozen snapshot and nothing else about the org. Unknown, expired and revoked tokens
 * get the same 404, so the response never tells which one it was.
 */
export function publicReportRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();
  const limiter = createRateLimiter(deps.publicReportRateLimit ?? PUBLIC_REPORT_RATE_LIMIT);

  r.get('/:token', async (c) => {
    const limit = limiter.take(c.get('clientIp'));
    if (!limit.ok) {
      c.header('retry-after', String(limit.retryAfter));
      throw new ApiError(429, 'rate_limited', 'Too many requests — try again shortly');
    }
    c.header('cache-control', 'no-store');
    c.header('x-robots-tag', 'noindex, nofollow');
    const token = c.req.param('token');
    if (!SHARE_TOKEN_RE.test(token)) throw notFound('Report');
    // The lookup function is SECURITY DEFINER: it reads across orgs, but only for this hash.
    const res = await deps.db.execute<{
      report_id: string;
      period: string;
      snapshot: unknown;
      expires_at: Date | string;
    }>(sql`select * from pulse_shared_report(${hashShareToken(token)})`);
    const row = res.rows[0];
    if (!row) throw notFound('Report');
    const body: PublicReport = {
      report: {
        period: row.period,
        expiresAt: new Date(row.expires_at).toISOString(),
        snapshot: ReportSnapshot.parse(row.snapshot),
      },
    };
    return c.json(body);
  });

  return r;
}
