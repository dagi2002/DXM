# DXM Pulse

A full-stack Digital Experience Management platform for Ethiopian agencies. Combines portfolio overview, client-site management, session replay, heatmaps, funnels, alerts, performance monitoring, site audits, and Telegram reporting.

## Architecture

Monorepo with npm workspaces:

- `apps/web` — React + Vite + TypeScript frontend (port 5000 in dev)
- `apps/api` — Express + TypeScript + SQLite backend (port 4000)
- `packages/sdk` — Tracking SDK and replay extension
- `packages/contracts` — Shared DTOs and endpoint constants

## Running the App

Single workflow `Start application` runs `bash start.sh`, which starts:
- API server on port 4000 (localhost)
- Vite dev server on port 5000 (0.0.0.0)

Vite proxies `/api` requests to the backend at `localhost:4000`.

## Database

SQLite database at `apps/api/data/dxm.db`. Auto-migrates on API startup using `apps/api/src/db/schema.sql`.

To run migration manually:
```bash
npm run migrate -w apps/api
```

To seed demo data:
```bash
npm run seed -w apps/api
```

## Environment Variables

Set in Replit Secrets/Env Vars (development environment):
- `PORT` — API port (4000)
- `NODE_ENV` — development
- `DB_PATH` — ./data/dxm.db
- `JWT_SECRET` — JWT signing secret (min 32 chars)
- `JWT_REFRESH_SECRET` — JWT refresh secret (min 32 chars)
- `COOKIE_DOMAIN` — localhost
- `WEB_ORIGIN` — http://localhost:5000
- `VITE_API_URL` — http://localhost:4000
- `ADMIN_SECRET` — admin API secret
- `SDK_CDN_URL` / `VITE_SDK_CDN_URL` — SDK CDN URL

Optional:
- `SMTP_*` — Email/SMTP config for password reset
- `TELEGRAM_DEFAULT_BOT_TOKEN` — Telegram bot
- `CHAPA_SECRET_KEY` / `CHAPA_WEBHOOK_SECRET` — Billing
- `SENTRY_DSN` / `VITE_SENTRY_DSN` — Error tracking
- `DIGEST_CRON_SECRET` — Weekly digest cron

## Key Files

- `apps/web/vite.config.ts` — Vite config (host: 0.0.0.0, port: 5000, allowedHosts: true, /api proxy)
- `apps/api/src/app.ts` — Express app with CORS (dev mode allows all origins)
- `apps/api/src/db/schema.sql` — SQLite schema
- `start.sh` — Combined startup script

## Design System

- `surface-*` color scale (50-950) for backgrounds/text
- `primary-*` green scale (50-950) for CTAs and active states
- `accent-*` amber scale for warnings/secondary highlights
- `rounded-[28px]` / `rounded-2xl` / `rounded-xl` card hierarchy
- `shadow-sm` on cards, `shadow-md` on hover
- Split-screen auth pages (dark green left panel + clean right form)
- Uniform page pattern: `mx-auto max-w-7xl p-6 md:p-8 space-y-6`

## Features

- Public landing page with ETB pricing, site audit, and proper footer
- Premium split-screen login and signup with glassmorphism left panel
- Email/password auth with workspace isolation
- Client site management with install snippets (HTML/WordPress/React)
- Session replay, heatmaps, funnels, user flow
- Alerts view with polished stats cards and divide-based list
- Weekly digest reports with AI narrative
- Demo mode for offline walkthroughs
- Agency-first portfolio overview with AI Portfolio Brief panel
- Rule-based AI engine in `apps/api/src/services/ai/overviewBrief.ts`
- Navigation redesigned: 64-wide sidebar, AI Features section with NEW badge
- Dashboard upgraded: live stats header, polished MetricCard with tone bars
