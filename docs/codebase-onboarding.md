# DXM Pulse Codebase Onboarding

This guide is the practical starting point for the current DXM Pulse monorepo. It describes the live product and active code paths only, and excludes archived or deprecated surfaces from the primary workflow.

## What The Product Does

DXM Pulse is an agency-first digital experience monitoring product. It helps agencies:

- add and verify client websites
- install a tracking snippet on each site
- collect session, navigation, click, scroll, replay, custom-event, and Web Vitals data
- review portfolio health across all tracked client sites
- investigate issues through session replay, heatmaps, funnels, user flow, and alerts
- send Telegram alerts and weekly digest summaries when configured

The current product includes a public landing page, public site audit, auth and onboarding, an agency dashboard, client-site management, analytics surfaces, reports, settings, a partial billing surface, and a demo route.

## Current Architecture Overview

DXM Pulse is a small monorepo with four active packages:

- `apps/web`: React + Vite frontend for public pages, onboarding, and the authenticated app
- `apps/api`: Express + TypeScript API backed by SQLite
- `packages/sdk`: browser tracking SDK (`dxm.js`) plus replay extension (`dxm-replay.js`)
- `packages/contracts`: shared public DTOs and endpoint constants used across SDK, API, and web

```text
Tracked Website
  └─ dxm.js / dxm-replay.js
      ├─ POST /collect
      └─ POST /collect-replay/replay

DXM Pulse Web
  ├─ public marketing + demo
  ├─ auth + onboarding
  └─ workspace app

DXM Pulse API
  ├─ auth + workspace cookies
  ├─ site management
  ├─ telemetry write model
  ├─ session + analytics read models
  ├─ alerts + digest delivery
  └─ public audit

SQLite
  ├─ workspaces
  ├─ users
  ├─ sites
  ├─ sessions
  ├─ events
  ├─ session_replays
  ├─ session_replay_chunks
  ├─ alerts
  └─ funnels
```

## Folder And Package Structure

```text
.
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── routes/       # Express route groups
│   │   │   ├── services/     # analytics, read models, tracking, alerts
│   │   │   ├── db/           # schema, migrations, seed, DB bootstrap
│   │   │   └── middleware/   # auth, validation, rate limiting
│   │   └── README.md
│   └── web/
│       ├── src/
│       │   ├── pages/        # routed page shells
│       │   ├── components/   # dashboard and analytics UI
│       │   ├── context/      # auth and workspace context
│       │   ├── lib/          # API helpers
│       │   └── types/        # frontend-facing type exports
│       └── package.json
├── packages/
│   ├── contracts/            # shared endpoint constants and DTOs
│   └── sdk/                  # tracking SDK builds
├── docs/                     # product, setup, architecture, API docs
├── .env.example
└── package.json
```

## How SDK, API, And Web Interact

### Shared contract layer

`packages/contracts` is the source of truth for the public session, replay, heatmap, and collect DTOs. The goal is to keep SDK payloads, API responses, and frontend consumers aligned.

### SDK to API

- `dxm.js` batches events to `POST /collect`
- `dxm-replay.js` posts replay chunks to `POST /collect-replay/replay`
- final page-hide flushes send `completed: true` so the API can finalize session KPI fields

### API to web

The web app uses authenticated, workspace-scoped read models instead of reconstructing analytics from raw session rows:

- `GET /sessions`
- `GET /sessions/:id`
- `GET /sessions/:id/replay`
- `GET /analytics/heatmap`

## Key Data Flows

### 1. Signup and first-site onboarding

1. A user signs up through `POST /auth/signup`.
2. The onboarding UI creates a client site through `POST /sites`.
3. The API returns site details, including the tracking snippet and `siteKey`.
4. The user installs the snippet on the client site.
5. The onboarding UI polls `GET /sites/:id/verify` until live traffic appears.

### 2. Telemetry ingestion

1. A tracked site loads `dxm.js`.
2. The SDK creates or reuses a session ID.
3. Events are queued and flushed to `POST /collect`.
4. The API resolves the incoming `siteId` to a stored `site_key`.
5. The session write path stores events and derives `endedAt`, `duration`, `bounced`, `converted`, and `completed`.

### 3. Session replay

1. A tracked site loads `dxm-replay.js`.
2. Replay chunks are posted to `POST /collect-replay/replay`.
3. The session replay UI fetches session summaries from `GET /sessions`.
4. Selecting a session loads detail from `GET /sessions/:id` and replay data from `GET /sessions/:id/replay`.

### 4. Operator workflow

1. The overview screen fetches `GET /overview`.
2. Client management uses `GET /sites` and `GET /sites/:id`.
3. Analytics tabs fetch:
   - `GET /analytics/heatmap`
   - `GET /funnels`
   - `GET /funnels/:id/analysis`
   - `GET /analytics/userflow`
   - `GET /analytics/vitals`
4. Alerts are read from `GET /alerts` and can be pushed to Telegram.

## Major Live Routes And Surfaces

### Web surfaces

Public:

- `/`
- `/login`
- `/signup`
- `/demo`

Authenticated onboarding:

- `/onboarding/*`

Authenticated app:

- `/overview`
- `/clients`
- `/clients/:id`
- `/sessions/*`
- `/analytics/*`
- `/alerts`
- `/reports`
- `/settings`
- `/settings/billing`

Notes:

- `/users` is not a primary web surface; it redirects to `/settings`
- the analytics UI currently exposes Heatmaps, Funnels, User Flow, and Performance tabs

### Primary API route groups

- `GET /health`
- `/auth/*`
- `POST /collect`
- `POST /collect-replay/replay`
- `/sessions/*`
- `/analytics/*`
- `/overview`
- `/sites/*`
- `/funnels/*`
- `/alerts/*`
- `/users`
- `/settings/*`
- `/billing/*`
- `/audit`
- `/digest/send-all`

## How To Run It Locally

### Prerequisites

- Node.js 20+
- npm with workspace support

### Setup

1. Install dependencies:

```bash
npm install
```

2. Create local environment config:

```bash
cp .env.example .env
```

3. Run database setup:

```bash
npm run migrate -w apps/api
npm run seed -w apps/api
```

`seed` is optional, but useful if you want non-empty local dashboards quickly.

4. Start the full stack:

```bash
npm run dev
```

This starts:

- web on `http://localhost:5173`
- API on `http://localhost:4000`
- SDK build watch in `packages/sdk`

### Quick verification

- open `http://localhost:5173/`
- open `http://localhost:5173/demo`
- call `http://localhost:4000/health`
- sign up and create a client site

### Useful commands

```bash
npm run dev:web
npm run dev:api
npm run build
npm run lint
npm run check
```

## Environment Variables And Setup Assumptions

The repo expects a root `.env` file.

Required:

- `JWT_SECRET`
- `JWT_REFRESH_SECRET`

Common local defaults:

- `PORT=4000`
- `DB_PATH=./data/dxm.db`
- `COOKIE_DOMAIN=localhost`
- `WEB_ORIGIN=http://localhost:5173`
- `VITE_API_URL=http://localhost:4000`
- `SDK_CDN_URL=http://localhost:5173/sdk/dxm.js`
- `VITE_SDK_CDN_URL=http://localhost:5173/sdk/dxm.js`

Optional integrations:

- `TELEGRAM_DEFAULT_BOT_TOKEN`
- `CHAPA_SECRET_KEY`
- `CHAPA_WEBHOOK_SECRET`

Setup assumptions:

- SQLite is the default local database and `apps/api/data/` already exists
- the API reads backend env vars from the root `.env`
- the web app reads `VITE_*` variables at build time
- the product is optimized for local MVP/self-hosted development, not large-scale distributed infrastructure

## Known Limitations And Follow-Up Areas

- billing is still partial in the UI and manual operationally
- the Chapa webhook endpoint exists, but billing automation is not complete
- DXM Pulse AI is planned, but not implemented in this branch
- the API still runs on SQLite and does not yet use a job queue for heavier background work
- weekly digest sending exists, but is intended to be triggered by a scheduler with `x-digest-key`
- funnel analysis is live, but still intentionally lightweight compared with a mature analytics product

## Related Docs

- [README](../README.md)
- [Architecture Overview](./architecture.md)
- [Current Status](./current-status.md)
- [API Reference](./api-reference.md)
- [Environment Variables](./environment-variables.md)
- [SDK Integration](./sdk-integration.md)
- [API App README](../apps/api/README.md)
