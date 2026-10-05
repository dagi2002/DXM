import { defineConfig } from 'tsup';

// Bundles the API and its workspace packages into one file; npm dependencies stay external.
export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  sourcemap: true,
  clean: true,
  noExternal: [/^@pulse\//],
});
