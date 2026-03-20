import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { apiLimiter } from './middleware/rateLimiter.js';

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

const app = express();

// ── Middleware ───────────────────────────────────────────────────────────────
const WEB_ORIGIN = process.env.WEB_ORIGIN || 'http://localhost:5173';

app.use(cors({
  origin: [WEB_ORIGIN, 'http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}));

app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Routes ───────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

app.use('/collect', collectRoutes);
app.use('/collect-replay', collectRoutes);   // collect router handles /replay sub-path

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
app.use('/billing', billingRoutes);
app.use('/onboarding', onboardingRoutes);
app.use('/funnels', funnelsRoutes);
app.use('/audit', auditRoutes);
app.use('/digest', digestRoutes);

// ── Fallback error handler ───────────────────────────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[api error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
