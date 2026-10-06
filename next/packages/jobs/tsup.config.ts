import { defineConfig } from 'tsup';

/** Bundles the migration runner for deploys (set MIGRATIONS_DIR to the copied drizzle/ folder). */
export default defineConfig({
  entry: { migrate: 'scripts/migrate.ts' },
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  clean: true,
  splitting: false,
  noExternal: [/.*/],
  external: ['pg-native'],
  banner: {
    js: "import { createRequire as __pulseCreateRequire } from 'node:module'; const require = __pulseCreateRequire(import.meta.url);",
  },
});
