import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_PATH = process.env.DB_PATH ||
  path.join(__dirname, '../../data/dxm.db');

export const db: Database.Database = new Database(DB_PATH);

// Performance pragmas
db.pragma('journal_mode = WAL');     // allows concurrent reads while writing
db.pragma('foreign_keys = ON');      // enforce referential integrity
db.pragma('synchronous = NORMAL');   // balance of safety and speed
db.pragma('cache_size = -8000');     // 8MB page cache
db.pragma('temp_store = MEMORY');    // temporary tables in RAM
