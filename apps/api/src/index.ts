import app from './app.js';
import { db } from './db/index.js';
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
  console.log('✅ Database schema is up to date.');
} catch (err) {
  console.warn('⚠️  Could not auto-migrate:', err);
}

if (process.env.NODE_ENV === 'production') {
  const required = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'ADMIN_SECRET', 'CHAPA_WEBHOOK_SECRET'];
  const missing  = required.filter(v => !process.env[v]?.trim());
  if (missing.length > 0) {
    console.error(`[startup] FATAL: Missing required env vars: ${missing.join(', ')}`);
    process.exit(1);
  }
}

app.listen(PORT, () => {
  console.log(`\n🚀 DXM Pulse API running on http://localhost:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
});
