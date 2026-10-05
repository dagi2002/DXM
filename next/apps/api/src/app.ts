import { randomUUID } from 'node:crypto';
import type { ServerEnv } from '@pulse/config';
import type { Db } from '@pulse/db';
import { sql } from '@pulse/db';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import type { Logger } from 'pino';
import { ZodError } from 'zod';
import { CLIENT_IP_HEADER, type Auth } from './auth';
import { ApiError, errorBody, type AppEnv } from './http';
import type { Mailer } from './mailer';
import { meRoutes } from './routes/me';
import { siteRoutes } from './routes/sites';

export interface AppDeps {
  env: ServerEnv;
  db: Db;
  auth: Auth;
  mailer: Mailer;
  log: Logger;
  /** Resolves the TCP peer address; injected so tests and the Node server can differ. */
  peerAddress?: (raw: Request, c: unknown) => string | undefined;
}

const REQUEST_ID_RE = /^[A-Za-z0-9._-]{8,64}$/;

/**
 * Client IP = the address appended by our N-th trusted proxy (Caddy = 1).
 * Anything a client puts further left in X-Forwarded-For is ignored, so it can't be spoofed.
 */
export function resolveClientIp(
  xff: string | undefined,
  peer: string | undefined,
  trustedHops: number,
): string {
  if (trustedHops <= 0 || !xff) return peer ?? 'unknown';
  const chain = xff
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return chain[chain.length - trustedHops] ?? peer ?? 'unknown';
}

export function createApp(deps: AppDeps) {
  const { env, db, auth, log } = deps;
  const app = new Hono<AppEnv>();
  const allowedOrigins = new Set([env.APP_URL, ...env.TRUSTED_ORIGINS]);

  app.use('*', async (c, next) => {
    const incoming = c.req.header('x-request-id');
    const requestId = incoming && REQUEST_ID_RE.test(incoming) ? incoming : randomUUID();
    c.set('requestId', requestId);
    c.header('x-request-id', requestId);
    c.set(
      'clientIp',
      resolveClientIp(
        c.req.header('x-forwarded-for'),
        deps.peerAddress?.(c.req.raw, c),
        env.TRUST_PROXY_HOPS,
      ),
    );
    c.set('log', log.child({ requestId }));
    const started = performance.now();
    await next();
    // Paths only (never query strings): tokens must not reach logs.
    c.get('log').info(
      {
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        ms: Math.round(performance.now() - started),
        userId: c.get('user')?.id,
        orgId: c.get('orgId'),
      },
      'request',
    );
  });

  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      crossOriginResourcePolicy: 'same-site',
      referrerPolicy: 'no-referrer',
    }),
  );

  app.use(
    '/api/*',
    cors({
      origin: (origin) => (allowedOrigins.has(origin) ? origin : null),
      credentials: true,
      allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['content-type', 'x-request-id'],
      exposeHeaders: ['x-request-id'],
      maxAge: 600,
    }),
  );

  // CSRF defense in depth on top of SameSite=Lax cookies: state-changing API calls (ours and
  // Better Auth's) must come from a trusted origin. Browsers always send Origin on cross-site
  // POST/PATCH/DELETE. GETs stay open so OAuth and magic-link callbacks keep working.
  app.use('/api/*', async (c, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
      const origin = c.req.header('origin');
      const site = c.req.header('sec-fetch-site');
      if ((origin && !allowedOrigins.has(origin)) || (!origin && site === 'cross-site')) {
        throw new ApiError(403, 'forbidden', 'Cross-site request blocked');
      }
    }
    await next();
  });

  app.get('/livez', (c) => c.json({ status: 'ok' }));
  app.get('/readyz', async (c) => {
    try {
      await db.execute(sql`select 1`);
      return c.json({ status: 'ok', db: 'ok' });
    } catch {
      return c.json({ status: 'degraded', db: 'unreachable' }, 503);
    }
  });

  // Better Auth owns /api/auth/*. It only trusts our computed client-IP header for rate limiting.
  app.on(['GET', 'POST'], '/api/auth/*', (c) => {
    const headers = new Headers(c.req.raw.headers);
    headers.set(CLIENT_IP_HEADER, c.get('clientIp'));
    return auth.handler(new Request(c.req.raw, { headers }));
  });

  /** Unauthenticated, cacheable facts the sign-in screens need. */
  app.get('/api/v1/public-config', (c) =>
    c.json({ googleEnabled: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) }),
  );

  app.route('/api/v1/me', meRoutes(deps));
  app.route('/api/v1/sites', siteRoutes(deps));

  app.notFound((c) => c.json(errorBody(c, 'not_found', 'Route not found'), 404));

  app.onError((err, c) => {
    if (err instanceof ApiError) return c.json(errorBody(c, err.code, err.message, err.details), err.status);
    if (err instanceof ZodError) {
      return c.json(
        errorBody(
          c,
          'validation_failed',
          'Request validation failed',
          err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        ),
        400,
      );
    }
    if (err instanceof SyntaxError) return c.json(errorBody(c, 'bad_request', 'Malformed JSON body'), 400);
    c.get('log').error({ err }, 'unhandled error');
    return c.json(errorBody(c, 'internal', 'Something went wrong'), 500);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
