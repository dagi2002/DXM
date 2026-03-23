import * as Sentry from '@sentry/node';

// Sentry must init before other imports so it can patch modules
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.2,
  });
}

import app from './app.js';
import { db } from './db/index.js';
import { logger } from './lib/logger.js';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '4000', 10);

// Auto-migrate on startup
try {
  const schema = readFileSync(path.join(__dirname, '../src/db/schema.sql'), 'utf8');
  const stmts = schema.split(';').map(s => s.trim()).filter(s => s.length > 0);
  db.transaction(() => { for (const s of stmts) db.prepare(s).run(); })();
  try { db.prepare("ALTER TABLE sessions ADD COLUMN page_count INTEGER NOT NULL DEFAULT 0").run(); } catch {}
  try { db.prepare('ALTER TABLE upgrade_requests ADD COLUMN chapa_tx_ref TEXT').run(); } catch {}
  try {
    db.prepare(
      'CREATE UNIQUE INDEX ux_upgrade_requests_chapa_tx_ref ON upgrade_requests(chapa_tx_ref) WHERE chapa_tx_ref IS NOT NULL'
    ).run();
  } catch {}
  try {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash  TEXT NOT NULL,
        expires_at  DATETIME NOT NULL,
        used_at     DATETIME,
        created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  } catch {}
  try {
    db.prepare(
      'CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id, created_at DESC)'
    ).run();
  } catch {}
  try { db.prepare('ALTER TABLE workspaces ADD COLUMN email_notifications_enabled INTEGER NOT NULL DEFAULT 1').run(); } catch {}
  try { db.prepare('ALTER TABLE sites ADD COLUMN first_session_at DATETIME').run(); } catch {}
  try {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS insights (
        id            TEXT PRIMARY KEY,
        workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        site_id       TEXT REFERENCES sites(id) ON DELETE CASCADE,
        type          TEXT NOT NULL,
        severity      TEXT NOT NULL,
        title         TEXT NOT NULL,
        description   TEXT NOT NULL,
        recommendation TEXT,
        data          TEXT,
        active        INTEGER NOT NULL DEFAULT 1,
        created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        resolved_at   DATETIME
      )
    `).run();
  } catch {}
  try { db.prepare('CREATE INDEX IF NOT EXISTS idx_insights_workspace_active ON insights(workspace_id, active, created_at DESC)').run(); } catch {}
  try { db.prepare('CREATE INDEX IF NOT EXISTS idx_insights_workspace_site_type ON insights(workspace_id, site_id, type, active)').run(); } catch {}
  logger.info('Database schema is up to date');
} catch (err) {
  logger.warn('Could not auto-migrate', { error: err instanceof Error ? err.message : String(err) });
}

if (process.env.NODE_ENV === 'production') {
  const required = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'ADMIN_SECRET', 'CHAPA_WEBHOOK_SECRET'];
  const missing  = required.filter(v => !process.env[v]?.trim());
  if (missing.length > 0) {
    logger.error('Missing required env vars', { vars: missing });
    process.exit(1);
  }
}

app.listen(PORT, () => {
  logger.info('DXM Pulse API started', { port: PORT, env: process.env.NODE_ENV || 'development' });
});

// ── Global error handlers ───────────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { error: reason instanceof Error ? reason.message : String(reason) });
  if (process.env.SENTRY_DSN) Sentry.captureException(reason);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(err);
    Sentry.flush(2000).then(() => process.exit(1));
  } else {
    process.exit(1);
  }
});
