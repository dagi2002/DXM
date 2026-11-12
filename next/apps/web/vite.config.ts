import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const apiTarget = process.env.PULSE_API_PROXY ?? 'http://localhost:4100';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.PORT ?? 5174),
    strictPort: true,
    // Same-origin in dev, exactly like production (Caddy serves the app and proxies /api).
    proxy: { '/api': { target: apiTarget, changeOrigin: false, xfwd: true } },
  },
  preview: { port: Number(process.env.PORT ?? 5174), proxy: { '/api': { target: apiTarget, xfwd: true } } },
  build: {
    target: 'es2022',
    sourcemap: true,
    // Every browser we target (es2022) supports <link rel=modulepreload>; without the polyfill an
    // older one just skips preloading. Keeps it out of a chunk shared by the two entries.
    modulePreload: { polyfill: false },
    // The Monday email's unsubscribe page is its own tiny entry, outside the app bundle.
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('index.html', import.meta.url)),
        unsubscribe: fileURLToPath(new URL('unsubscribe.html', import.meta.url)),
      },
    },
  },
});
