import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run the real API against a dedicated database (pulse_e2e) and the Vite app
 * proxying to it — the same single-origin shape as production.
 */
const user = process.env.USER ?? 'postgres';
const E2E_DB = process.env.E2E_DATABASE_URL ?? 'postgres://pulse_app:pulse_app_dev@localhost:5432/pulse_e2e';
const E2E_ADMIN_DB = process.env.E2E_DATABASE_ADMIN_URL ?? `postgres://${user}@localhost:5432/pulse_e2e`;
const WEB_PORT = 5175;
const API_PORT = 4101;
const APP_URL = `http://localhost:${WEB_PORT}`;
const COLLECTOR_PORT = 4201;
const DEMO_PORT = 4301;
export const COLLECTOR_URL = `http://localhost:${COLLECTOR_PORT}`;
export const DEMO_URL = `http://localhost:${DEMO_PORT}`;
const API_READY = `http://localhost:${API_PORT}/readyz`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: APP_URL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 360, height: 780 } } },
  ],
  webServer: [
    {
      command: 'pnpm exec tsx e2e/prepare-db.ts && pnpm --dir ../api exec tsx src/server.ts',
      stdout: 'pipe',
      stderr: 'pipe',
      url: `http://localhost:${API_PORT}/readyz`,
      reuseExistingServer: false,
      env: {
        NODE_ENV: 'test',
        PORT: String(API_PORT),
        LOG_LEVEL: 'warn',
        DATABASE_URL: E2E_DB,
        E2E_DATABASE_ADMIN_URL: E2E_ADMIN_DB,
        APP_URL,
        API_URL: APP_URL,
        BETTER_AUTH_SECRET: 'e2e-secret-e2e-secret-e2e-secret-0123456789abcdef',
        COLLECTOR_PUBLIC_URL: COLLECTOR_URL,
      },
    },
    {
      // Collector serves the freshly built SDK; starts once the API has prepared the database.
      command: `node e2e/wait-for.mjs ${API_READY} && pnpm --filter @pulse/sdk build && pnpm --dir ../collector exec tsx src/server.ts`,
      url: `${COLLECTOR_URL}/livez`,
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        NODE_ENV: 'test',
        LOG_LEVEL: 'warn',
        DATABASE_URL: E2E_DB,
        COLLECTOR_PORT: String(COLLECTOR_PORT),
        // Playwright's Chromium identifies as headless; let it through in tests only.
        COLLECTOR_ALLOW_HEADLESS: '1',
      },
    },
    {
      command: `node e2e/wait-for.mjs ${API_READY} && pnpm --dir ../worker exec tsx src/main.ts`,
      url: 'http://localhost:4251/livez',
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { NODE_ENV: 'test', LOG_LEVEL: 'warn', DATABASE_URL: E2E_DB, APP_URL, WORKER_HEALTH_PORT: '4251' },
    },
    {
      // A stand-in customer website on its own origin.
      command: 'node e2e/demo-server.mjs',
      url: DEMO_URL,
      reuseExistingServer: false,
      env: { DEMO_PORT: String(DEMO_PORT) },
    },
    {
      command: 'pnpm exec vite',
      url: APP_URL,
      reuseExistingServer: false,
      env: { PORT: String(WEB_PORT), PULSE_API_PROXY: `http://localhost:${API_PORT}` },
    },
  ],
});
