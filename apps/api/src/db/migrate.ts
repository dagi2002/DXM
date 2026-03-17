/**
 * DXM Pulse — Database Migration
 * Safe to run multiple times (all DDL uses IF NOT EXISTS).
 * Run: npx ts-node src/db/migrate.ts
 */
import { db } from './index.js';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

// Split on semicolons, filter empty statements, run each
const statements = schema
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0);

db.transaction(() => {
  for (const stmt of statements) {
    db.prepare(stmt).run();
  }
})();

// Add digest columns if they don't exist
try { db.prepare("ALTER TABLE workspaces ADD COLUMN digest_enabled INTEGER NOT NULL DEFAULT 0").run(); } catch {}
try { db.prepare("ALTER TABLE workspaces ADD COLUMN digest_language TEXT NOT NULL DEFAULT 'en'").run(); } catch {}

console.log('✅ Migration complete — all tables and indexes are up to date.');
