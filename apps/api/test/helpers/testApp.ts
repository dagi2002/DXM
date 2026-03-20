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

interface CreateTestAppOptions {
  env?: Record<string, string | undefined>;
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

export const createTestApp = async (options?: CreateTestAppOptions): Promise<ApiTestContext> => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'dxm-api-test-'));
  const dbPath = path.join(tempDir, 'test.db');
  const baseEnv: Record<string, string | undefined> = {
    NODE_ENV: 'test',
    DB_PATH: dbPath,
    JWT_SECRET: TEST_JWT_SECRET,
    JWT_REFRESH_SECRET: TEST_REFRESH_SECRET,
    COOKIE_DOMAIN: 'localhost',
    WEB_ORIGIN: 'http://localhost:5173',
  };
  const mergedEnv = { ...baseEnv, ...(options?.env ?? {}) };
  const envKeys = new Set([...Object.keys(baseEnv), ...Object.keys(options?.env ?? {})]);
  const previousEnv = new Map<string, string | undefined>();

  for (const key of envKeys) {
    previousEnv.set(key, process.env[key]);
  }

  for (const [key, value] of Object.entries(mergedEnv)) {
    if (value === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }

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

      for (const key of envKeys) {
        const previousValue = previousEnv.get(key);
        if (previousValue === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = previousValue;
        }
      }

      vi.resetModules();
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
};
