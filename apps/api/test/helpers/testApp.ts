import { mkdtempSync, readFileSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { vi } from 'vitest';
import type Database from 'better-sqlite3';

export interface ApiTestContext {
  app: unknown;
  db: Database.Database;
  dbPath: string;
  cleanup: () => Promise<void>;
}

const TEST_JWT_SECRET = 'test-secret-change-me-1234567890';
const TEST_REFRESH_SECRET = 'test-refresh-secret-change-me-1234567890';

const applySchema = (db: Database.Database) => {
  const schemaPath = new URL('../../src/db/schema.sql', import.meta.url);
  const schema = readFileSync(schemaPath, 'utf8');
  const statements = schema
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  db.transaction(() => {
    for (const statement of statements) {
      db.prepare(statement).run();
    }
  })();
};

export const createTestApp = async (): Promise<ApiTestContext> => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'dxm-api-test-'));
  const dbPath = path.join(tempDir, 'test.db');

  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = dbPath;
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  process.env.JWT_REFRESH_SECRET = TEST_REFRESH_SECRET;
  process.env.COOKIE_DOMAIN = 'localhost';
  process.env.WEB_ORIGIN = 'http://localhost:5173';

  vi.resetModules();

  const { db } = await import('../../src/db/index.js');
  applySchema(db);

  const { default: app } = await import('../../src/app.js');

  return {
    app,
    db,
    dbPath,
    cleanup: async () => {
      try {
        db.close();
      } catch {}
      vi.resetModules();
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
};
