import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
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
  build: { target: 'es2022', sourcemap: true },
});
