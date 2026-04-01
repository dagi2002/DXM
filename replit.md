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

## Features

- Public landing page with ETB pricing and site audit
- Email/password auth with workspace isolation
- Client site management with install snippets
- Session replay, heatmaps, funnels, user flow
- Alerts with Telegram delivery
- Weekly digest reports
- Demo mode for offline walkthroughs
- Agency-first overview dashboard
