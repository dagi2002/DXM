import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.ts'],
    // One shared test database: run files sequentially and reset between tests.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
