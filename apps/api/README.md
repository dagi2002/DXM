# DXM Pulse API

Express + TypeScript backend for DXM Pulse. The API handles authentication, workspace isolation, site management, event collection, replay ingestion, analytics aggregation, alerts, settings, public audit, billing stubs, and weekly digest delivery.

## Stack

- Express 5
- TypeScript
- SQLite via `better-sqlite3`
- JWT auth with httpOnly cookies
- Zod validation
- Telegram integration for alerts and digests

## Development

From the repo root:

```bash
npm run dev -w apps/api
```

Build:

```bash
npm run build -w apps/api
```

Run migrations and seed data:

```bash
npm run migrate -w apps/api
npm run seed -w apps/api
```

## Important Routes

| Group | Routes |
|---|---|
| Health | `GET /health` |
| Auth | `/auth/signup`, `/auth/login`, `/auth/logout`, `/auth/me` |
| Sites | `GET /sites`, `POST /sites`, `PATCH /sites/:id`, `DELETE /sites/:id`, `GET /sites/:id`, `GET /sites/:id/verify`, `GET /sites/:id/overview` |
| Collection | `POST /collect`, `POST /collect-replay/replay` |
| Sessions | `GET /sessions`, `GET /sessions/:id`, `GET /sessions/:id/replay` |
| Analytics | `GET /analytics/metrics`, `GET /analytics/vitals`, `GET /analytics/userflow`, `GET /analytics/heatmap` |
| Funnels | `GET /funnels`, `POST /funnels`, `DELETE /funnels/:id`, `GET /funnels/:id/analysis` |
| Alerts | `GET /alerts`, `GET /alerts/:id`, `POST /alerts`, `PATCH /alerts/:id/resolve` |
| Users | `GET /users` |
| Settings | `GET /settings`, `PATCH /settings`, `PUT /settings/telegram`, `POST /settings/telegram/test` |
| Billing | `GET /billing/plans`, `GET /billing/current`, `POST /billing/chapa/webhook` |
| Public audit | `GET /audit?url=` |
| Weekly digest | `POST /digest/send-all` |

## Environment

The API reads configuration from the workspace root `.env`.

Most important variables:

```bash
PORT=4000
DB_PATH=./data/dxm.db
JWT_SECRET=...
JWT_REFRESH_SECRET=...
WEB_ORIGIN=http://localhost:5173
COOKIE_DOMAIN=localhost
```

Optional:
- `TELEGRAM_DEFAULT_BOT_TOKEN`
- `CHAPA_SECRET_KEY`
- `CHAPA_WEBHOOK_SECRET`
- `SDK_CDN_URL`
- `DIGEST_CRON_SECRET`

See [../../docs/environment-variables.md](../../docs/environment-variables.md) for details.

## Current Reality

Fully live:
- Auth and workspace isolation
- `/sites` as the primary client-site contract, including conservative clean-site deletion
- Session/event ingestion
- Replay storage
- Shared session DTO/read-model contract
- Alerts and Telegram delivery
- Metrics, funnels, user flow, users endpoint
- Site audit and weekly digest plumbing
- `/onboarding/sites*` as a thin compatibility alias for create/list/verify only

Still partial:
- Billing webhook is a stub for future Chapa automation
- Digest triggering is protected by `x-digest-key`, uses `DIGEST_CRON_SECRET` in production, and falls back to `JWT_SECRET` only outside production when the digest secret is unset
- The API is SQLite-first and optimized for MVP/self-hosted simplicity, not multi-region scale
- Deterministic AI currently enhances `GET /overview`, `GET /sites/:id`, `GET /alerts/:id`, and `GET /funnels/:id/analysis` only
- Site deletion is intentionally conservative: no cascade delete and no archive flow yet

For local manual digest execution, use [../../ops/run-digest.sh](../../ops/run-digest.sh).

## Related Docs

- [Architecture](../../docs/architecture.md)
- [API Reference](../../docs/api-reference.md)
- [Shared Contracts](../../packages/contracts/README.md)
- [Database Schema](../../docs/database-schema.md)
- [Alert Engine](../../docs/alert-engine.md)
