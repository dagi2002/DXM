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
  console.log('✅ Database schema is up to date.');
} catch (err) {
  console.warn('⚠️  Could not auto-migrate:', err);
}

app.listen(PORT, () => {
  console.log(`\n🚀 DXM Pulse API running on http://localhost:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
});
