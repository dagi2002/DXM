import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  // events.ts is hand-written SQL (partitioned) — keep it out of generated migrations.
  schema: ['./src/schema/auth.ts', './src/schema/app.ts'],
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_ADMIN_URL ?? 'postgres://localhost:5432/pulse_dev' },
  strict: true,
});
