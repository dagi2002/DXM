import { SHARE_TOKEN_RE, ReportSnapshot, type PublicReport } from '@pulse/contracts';
import { sql } from '@pulse/db';
import { hashShareToken } from '@pulse/reports';
import { Hono, type Context } from 'hono';
import type { AppDeps } from '../app';
import { ApiError, notFound, type AppEnv } from '../http';
import { sendLogo, sharedBrand, toReportBrand } from './branding';
import type { BlobStore } from '@pulse/storage';
import { createRateLimiter } from '../rate-limit';

/** Per client IP: a burst of 30 opens, then one every 2 seconds. */
export const PUBLIC_REPORT_RATE_LIMIT = { capacity: 30, refillPerSecond: 0.5 };

/** For request logs: the token is a bearer credential and must never be written down. */
export const PUBLIC_REPORT_PATH_RE = /^(\/api\/v1\/public\/reports\/)[^/]+/;
/** The digest's unsubscribe token (task 15) is a capability too. */
const DIGEST_UNSUBSCRIBE_PATH_RE = /^(\/api\/v1\/public\/digest\/unsubscribe\/)[^/]+/;
export const redactPath = (path: string) =>
  path.replace(PUBLIC_REPORT_PATH_RE, '$1:token').replace(DIGEST_UNSUBSCRIBE_PATH_RE, '$1:token');

/**
 * `GET /api/v1/public/reports/:token` — unauthenticated, token-scoped. It returns that one
 * report's frozen snapshot and nothing else about the org. Unknown, expired and revoked tokens
 * get the same 404, so the response never tells which one it was.
 */
export function publicReportRoutes(deps: AppDeps & { blobs: BlobStore }) {
  const r = new Hono<AppEnv>();
  const limiter = createRateLimiter(deps.publicReportRateLimit ?? PUBLIC_REPORT_RATE_LIMIT);

  const guard = (c: Context<AppEnv>) => {
    const limit = limiter.take(c.get('clientIp'));
    if (!limit.ok) {
      c.header('retry-after', String(limit.retryAfter));
      throw new ApiError(429, 'rate_limited', 'Too many requests — try again shortly');
    }
    c.header('x-robots-tag', 'noindex, nofollow');
    const token = c.req.param('token') ?? '';
    if (!SHARE_TOKEN_RE.test(token)) throw notFound('Report');
    return token;
  };

  r.get('/:token', async (c) => {
    const token = guard(c);
    c.header('cache-control', 'no-store');
    // The lookup function is SECURITY DEFINER: it reads across orgs, but only for this hash.
    const res = await deps.db.execute<{
      report_id: string;
      period: string;
      snapshot: unknown;
      expires_at: Date | string;
    }>(sql`select * from pulse_shared_report(${hashShareToken(token)})`);
    const row = res.rows[0];
    if (!row) throw notFound('Report');
    const brand = await sharedBrand(deps.db, hashShareToken(token));
    const body: PublicReport = {
      report: {
        period: row.period,
        expiresAt: new Date(row.expires_at).toISOString(),
        snapshot: ReportSnapshot.parse(row.snapshot),
        brand: toReportBrand(
          brand && {
            agencyName: brand.agency_name,
            hasLogo: Boolean(brand.logo_key),
            logoUpdatedAt: brand.logo_updated_at ? new Date(brand.logo_updated_at) : null,
          },
          // The reader already holds the token (it's in their URL); the logo route is scoped by it.
          `/api/v1/public/reports/${encodeURIComponent(token)}/logo`,
        ),
      },
    };
    return c.json(body);
  });

  /**
   * The logo of the report behind this link — that org's and nobody else's. Same 404 for unknown,
   * expired and revoked links, and for a report whose org has no logo.
   */
  r.get('/:token/logo', async (c) => {
    const token = guard(c);
    const brand = await sharedBrand(deps.db, hashShareToken(token));
    if (!brand?.logo_key || !brand.logo_type) throw notFound('Logo');
    const data = await deps.blobs.get(brand.logo_key);
    if (!data) throw notFound('Logo');
    // Short and private: a turned-off link should stop showing the logo soon.
    return sendLogo(c, data, brand.logo_type, 'private, max-age=300');
  });

  return r;
}
