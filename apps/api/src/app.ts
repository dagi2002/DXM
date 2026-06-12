import * as Sentry from '@sentry/node';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { apiLimiter, mcpLimiter, publicReportLimiter } from './middleware/rateLimiter.js';
import { securityHeaders } from './middleware/securityHeaders.js';
import { requestId } from './middleware/requestId.js';
import { requestLogger } from './middleware/requestLogger.js';
import { db } from './db/index.js';
import { logger } from './lib/logger.js';

// Routes
import authRoutes from './routes/auth.js';
import collectRoutes from './routes/collect.js';
import sessionsRoutes from './routes/sessions.js';
import analyticsRoutes from './routes/analytics.js';
import alertsRoutes from './routes/alerts.js';
import usersRoutes from './routes/users.js';
import settingsRoutes from './routes/settings.js';
import billingRoutes from './routes/billing.js';
import onboardingRoutes from './routes/onboarding.js';
import funnelsRoutes from './routes/funnels.js';
import auditRoutes from './routes/audit.js';
import digestRoutes from './routes/digest.js';
import sitesRoutes from './routes/sites.js';
import overviewRoutes from './routes/overview.js';
import insightsRoutes from './routes/insights.js';
import adminRoutes from './routes/admin.js';
import askRoutes from './routes/ask.js';
import mcpRoutes from './routes/mcp.js';
import apiKeysRoutes from './routes/apiKeys.js';
import publicReportsRoutes from './routes/publicReports.js';

const app = express();

// ── Middleware ───────────────────────────────────────────────────────────────
const WEB_ORIGIN = process.env.WEB_ORIGIN || 'http://localhost:5173';
const publicIngestCors = cors({
  origin: '*',
  credentials: false,
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  optionsSuccessStatus: 204,
});

// Dashboard CORS is fail-closed: only WEB_ORIGIN plus any EXTRA_ORIGINS are
// allowed. Proxied dev environments with dynamic hostnames (e.g. Replit) must
// opt in explicitly via DEV_ALLOW_ALL_ORIGINS=1 — and even then the escape
// hatch is dead in production, because these are credentialed requests.
const EXTRA_ORIGINS = (process.env.EXTRA_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const ALLOWED_ORIGINS = new Set([WEB_ORIGIN, ...EXTRA_ORIGINS]);
const DEV_ALLOW_ALL =
  process.env.DEV_ALLOW_ALL_ORIGINS === '1' && process.env.NODE_ENV !== 'production';
if (process.env.DEV_ALLOW_ALL_ORIGINS === '1') {
  if (process.env.NODE_ENV === 'production') {
    logger.warn('DEV_ALLOW_ALL_ORIGINS is set but ignored in production');
  } else {
    logger.warn('CORS origin allowlist disabled via DEV_ALLOW_ALL_ORIGINS');
  }
}

const dashboardCors = cors({
  origin(origin, callback) {
    if (!origin) {
      callback(null, true); // curl / health checks / same-origin
      return;
    }
    if (ALLOWED_ORIGINS.has(origin) || DEV_ALLOW_ALL) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
  credentials: true,
});

// Capture raw body for Chapa webhook HMAC verification — must come before express.json
app.use('/billing/chapa/webhook', express.raw({ type: 'application/json', limit: '64kb' }));
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());
app.use(requestId);
app.use(requestLogger);
app.use(securityHeaders);

// ── Routes ───────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  let dbOk = false;
  try { db.prepare('SELECT 1').get(); dbOk = true; } catch {}
  const status = dbOk ? 'ok' : 'degraded';
  res.status(dbOk ? 200 : 503).json({
    status,
    db: dbOk ? 'ok' : 'error',
    uptime: process.uptime(),
    ts: new Date().toISOString(),
  });
});

app.options('/collect', publicIngestCors);
app.options('/collect-replay/replay', publicIngestCors);

app.use('/collect', publicIngestCors, collectRoutes);
app.use('/collect-replay', publicIngestCors, collectRoutes);   // collect router handles /replay sub-path

// Admin routes — no CORS, curl-only, must sit before dashboardCors
app.use('/admin/workspaces', adminRoutes);

// MCP endpoint — called by Claude Desktop / Cursor via bearer-token, not the
// dashboard. Must sit outside dashboardCors so external clients aren't blocked
// by the origin allowlist. Authentication happens inside the route via
// requireApiKey; mcpLimiter throttles per bearer token (per IP when absent)
// since this mount point sits before the general apiLimiter.
app.use('/mcp', mcpLimiter, mcpRoutes);

// Public shared client reports — token-authenticated inside the route, served
// to unauthenticated clients, so it sits outside dashboardCors with its own
// permissive read-only CORS and a per-IP limiter.
app.use('/public/reports', publicReportLimiter, publicReportsRoutes);

app.use(dashboardCors);

// Apply the general API limiter after telemetry so ingest uses collect-specific limits.
app.use(apiLimiter);

app.use('/auth', authRoutes);
app.use('/sessions', sessionsRoutes);
app.use('/analytics', analyticsRoutes);
app.use('/alerts', alertsRoutes);
app.use('/users', usersRoutes);
app.use('/overview', overviewRoutes);
app.use('/sites', sitesRoutes);
app.use('/settings', settingsRoutes);
app.use('/insights', insightsRoutes);
app.use('/billing', billingRoutes);
app.use('/onboarding', onboardingRoutes);
app.use('/funnels', funnelsRoutes);
app.use('/audit', auditRoutes);
app.use('/digest', digestRoutes);
app.use('/ask', askRoutes);
app.use('/api-keys', apiKeysRoutes);

// ── Sentry error handler (captures before custom handler swallows) ───────────
if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

// ── Fallback error handler ───────────────────────────────────────────────────
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', {
    message: err?.message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err?.stack,
    requestId: req.id,
  });
  res.status(500).json({ error: 'Something went wrong', requestId: req.id });
});

export default app;
