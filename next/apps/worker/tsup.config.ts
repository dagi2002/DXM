import { defineConfig } from 'tsup';

/**
 * One self-contained file per service (deploys need no node_modules). CommonJS dependencies
 * such as pg call require() at runtime, so the ESM bundle gets a real require via createRequire.
 */
export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  sourcemap: true,
  clean: true,
  splitting: false,
  noExternal: [/.*/],
  external: ['pg-native'],
  banner: {
    js: "import { createRequire as __pulseCreateRequire } from 'node:module'; const require = __pulseCreateRequire(import.meta.url);",
  },
});
