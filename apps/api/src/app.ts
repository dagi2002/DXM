import * as Sentry from '@sentry/node';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { apiLimiter } from './middleware/rateLimiter.js';
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

const dashboardCors = cors({
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }
    // In development, allow all origins (Replit proxy uses dynamic hostnames)
    if (process.env.NODE_ENV !== 'production') {
      callback(null, true);
      return;
    }
    if (origin === WEB_ORIGIN) {
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
