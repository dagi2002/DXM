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
      },
    },
    {
      command: 'pnpm exec vite',
      url: APP_URL,
      reuseExistingServer: false,
      env: { PORT: String(WEB_PORT), PULSE_API_PROXY: `http://localhost:${API_PORT}` },
    },
  ],
});
