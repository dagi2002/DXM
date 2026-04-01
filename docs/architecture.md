# Architecture Overview

DXM Pulse is a monorepo with three major runtime surfaces:

- `apps/web`: React + Vite application for landing, auth, dashboard, demo, billing, and settings
- `apps/api`: Express + TypeScript backend for auth, event collection, analytics, alerts, onboarding, audit, and digest
- `packages/sdk`: base tracking SDK plus replay extension
- `packages/contracts`: shared public DTO and endpoint contract for SDK/API/web alignment

## High-Level System

```text
Tracked Website
  └─ dxm.js / dxm-replay.js
      ├─ POST /collect
      └─ POST /collect-replay/replay

DXM Pulse Web (apps/web)
  ├─ public marketing pages
  ├─ auth + onboarding
  ├─ dashboard + analytics
  └─ settings + billing

DXM Pulse API (apps/api)
  ├─ auth + cookies
  ├─ dashboard/API CORS bound to the configured web origin
  ├─ analytics + funnels
  ├─ alerts + Telegram
  ├─ deterministic AI interpretation layer
  ├─ site management + onboarding compatibility alias
  ├─ public site audit
  ├─ weekly digest trigger
  ├─ public cross-origin ingest for tracked client sites
  ├─ session write model (collect + replay ingestion)
  ├─ session read models (summary, detail, replay, heatmap)
  ├─ AI artifact cache
  └─ SQLite data layer

SQLite
  ├─ workspaces
  ├─ users
  ├─ sites
  ├─ sessions
  ├─ events
  ├─ session_replays
  ├─ session_replay_chunks
  ├─ alerts
  ├─ funnels
  └─ ai_artifacts
```

## Core Flows

### 1. Visitor tracking

1. A tracked site loads `dxm.js`
2. The SDK creates or reuses a session ID
3. Events queue locally for resilience on weak networks
4. The SDK flushes batches to `POST /collect`
5. Replay chunks go to `POST /collect-replay/replay`
6. Final page-hide flushes include `completed: true`
7. The API accepts these public ingest requests cross-origin, resolves the `site_key`, writes to the session write model, derives KPI fields, and runs alert checks

### 2. Operator workflow

1. A user signs up or logs in through `/auth/*`
2. The web app receives auth via httpOnly cookies
3. Dashboard screens fetch live data from workspace-scoped routes using browser credentials and the configured web origin
4. Settings surfaces tracked sites, install snippets, Telegram, and digest options
5. Alerts and weekly digest keep value flowing outside the dashboard itself

### 3. Public top-of-funnel workflow

1. A prospect lands on `/`
2. They can run a public site audit without signing up
3. They can then sign up, add a site, and verify installation
4. From there the app transitions into the authenticated workspace flow

## Multi-Tenancy

Workspace isolation is row-based and enforced in the API:

- users belong to a workspace
- sites belong to a workspace
- sessions inherit both `site_id` and `workspace_id`
- alerts and funnels are scoped to a workspace
- authenticated routes read the workspace from the verified JWT payload

`GET /users`, `GET /sessions`, `GET /alerts`, `GET /funnels`, and settings routes are all workspace-scoped.

## Integrations

### Telegram

Used for:
- immediate alert delivery
- weekly digest delivery
- manual upgrade/contact path in the current MVP

### Chapa

Current role:
- plan and billing surface preparation
- webhook stub for future production billing automation

## Current Architectural Boundaries

Intentionally strong already:
- monorepo separation
- workspace isolation
- SDK/API split
- SQLite-backed source of truth

Still intentionally lightweight:
- no job queue yet for digest or heavy background work
- no separate analytics warehouse
- billing automation and AI features are still intentionally thin in this branch
- no archive flow or cascade delete for client sites yet
- `/onboarding/sites*` still exists only as a thin compatibility alias over `/sites`

## AI Boundary

The AI layer lives inside `apps/api/src/services/ai` as an internal interpretation layer, not a separate service. It operates in two modes:

**LLM mode** — when `ANTHROPIC_API_KEY` is set in the environment:
- calls `api.anthropic.com/v1/messages` (Claude) to generate natural-language briefs
- artifacts cached in `ai_artifacts` for 24 hours per workspace
- the `mode` field on the artifact is `'llm'`

**Deterministic mode** — fallback when no API key is present:
- derives a brief from pre-written template strings using portfolio data
- no external call, no cost, always available
- the `mode` field on the artifact is `'deterministic'`

In both cases:

- AI reads the existing overview rollups, site-detail payloads, alert-detail records, and funnel-analysis responses instead of bypassing product-truth services
- AI fails open — `/overview`, `/sites/:id`, `GET /alerts/:id`, and `GET /funnels/:id/analysis` all still work when AI is disabled or the cache table is unavailable
- the frontend reads `artifact.mode` to show either an `AI` (blue) or `AUTO` (gray) badge on the portfolio brief
- the Regenerate button on the overview page busts the 24-hour cache by adding `?refresh=1&t=<timestamp>` to the overview request

This keeps AI additive to the DXM product rather than a separate surface.

## Session Boundary

The session surface now has an explicit write/read split instead of one mixed route shape:

- write model:
  - `POST /collect`
  - `POST /collect-replay/replay`
- read models:
  - `GET /sessions`
  - `GET /sessions/:id`
  - `GET /sessions/:id/replay`
  - `GET /analytics/heatmap`

This is intentionally a small structural refactor, not a broader platform redesign.
