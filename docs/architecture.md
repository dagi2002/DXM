# Architecture Overview

## System Design

DXM Pulse is a **monorepo** consisting of two independently deployable applications:

```
┌─────────────────────────────────────────────────────┐
│                   Browser / App                      │
│                                                     │
│  ┌──────────────────┐    ┌──────────────────────┐  │
│  │  DXM Pulse Web   │    │  Instrumented Site   │  │
│  │  (apps/web)      │    │  (external customer) │  │
│  │  React + Vite    │    │  + SDK script tag    │  │
│  └────────┬─────────┘    └──────────┬───────────┘  │
│           │  Dashboard API           │  Event stream │
└───────────┼──────────────────────────┼──────────────┘
            │                          │
            ▼                          ▼
┌──────────────────────────────────────────────────────┐
│                   DXM Pulse API                      │
│                  (apps/api)                          │
│                Express 5 + TypeScript                │
│                                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────────┐ │
│  │  Routes  │ │ Services │ │      Middleware       │ │
│  │  auth    │ │  alert   │ │  JWT auth            │ │
│  │  collect │ │  engine  │ │  CORS                │ │
│  │  sessions│ └──────────┘ │  cookie-parser       │ │
│  │  analytics              └──────────────────────┘ │
│  │  funnels │                                        │
│  │  alerts  │                                        │
│  │  billing │                                        │
│  └──────────┘                                        │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │              SQLite (better-sqlite3)          │   │
│  │              apps/api/data/dxm.db            │   │
│  └──────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
            │
            ▼ (optional integrations)
┌──────────────────────────┐   ┌─────────────────────┐
│     Telegram Bot API     │   │   Chapa Payments    │
│   (alert notifications)  │   │  (Ethiopian gateway) │
└──────────────────────────┘   └─────────────────────┘
```

---

## Data Flow

### 1. Event Collection (SDK → API)

```
User visits instrumented site
  → SDK script tag fires
  → SDK batches events in memory (clicks, scrolls, navigations, vitals)
  → Every 3 seconds: POST /collect  { siteKey, sessionId, events[] }
  → API validates siteKey → looks up site + workspace
  → Inserts/updates session row
  → Inserts event rows
  → Triggers alert engine (fire-and-forget) in background
```

### 2. Dashboard (Web → API)

```
User opens DXM Pulse dashboard
  → Auto-login via httpOnly JWT cookie
  → Web app fetches:
      GET /sessions          — session list + counts
      GET /analytics/vitals  — LCP, FID, CLS aggregates
      GET /analytics/heatmap — click coordinate clusters
      GET /analytics/userflow — page-to-page navigation matrix
      GET /funnels           — funnel list
      GET /funnels/:id/analysis — step-by-step drop-off rates
      GET /alerts            — active alerts
  → useRealTimeData hook re-polls /sessions every 5 seconds
```

### 3. Alert Detection (Background)

```
After each event batch arrives at POST /collect:
  → runAlertChecks(workspaceId, siteId) runs asynchronously
  → Checks last 2 seconds of events for rage clicks (3+ on same target)
  → Checks last 30 minutes of vitals for slow LCP (> 4000 ms)
  → Checks last 2 hours of sessions for high bounce rate (> 70%)
  → If alert triggered and no open duplicate exists:
      → INSERT INTO alerts
      → POST to Telegram if bot token + chat_id are configured
```

---

## Authentication

DXM Pulse uses **dual-token JWT** with httpOnly cookies:

| Token | Storage | TTL | Purpose |
|---|---|---|---|
| Access token | httpOnly cookie (`dxm_access`) | 15 minutes | Authenticate API requests |
| Refresh token | httpOnly cookie (`dxm_refresh`) | 7 days | Issue new access tokens |

Flow:
1. `POST /auth/login` → validates email/password → sets both cookies
2. Every authenticated request reads `dxm_access` cookie via `middleware/auth.ts`
3. If access token expires, client calls `POST /auth/refresh` → new access token issued, refresh token rotated
4. `POST /auth/logout` → clears both cookies, invalidates refresh token in DB

The frontend `fetchJson()` wrapper automatically sends cookies on every request via `credentials: 'include'`.

---

## Multi-tenancy

The data model is workspace-scoped:

```
Workspace (1)
  └── Users (N)       — team members with roles (owner / admin / viewer)
  └── Sites (N)       — tracked websites, each with a unique site_key
        └── Sessions (N)
              └── Events (N)
        └── Funnels (N)
        └── Alerts (N)
```

Every API route that touches site data requires the JWT user's `workspace_id` to match the resource's `workspace_id`. This prevents cross-tenant data access.

---

## Monorepo Setup

The project uses **npm workspaces**:

```json
// package.json (root)
{
  "workspaces": ["apps/web", "apps/api"]
}
```

Running `npm install` at the root installs all packages. Individual scripts are run with:

```bash
npm run dev -w apps/api      # run a script in a specific workspace
npm run build -w apps/web
```

---

## Key Technology Choices

| Decision | Choice | Reason |
|---|---|---|
| Database | SQLite | Zero-config, no separate DB process, perfect for self-hosted Ethiopian SaaS |
| Auth storage | httpOnly cookies | Immune to XSS token theft vs localStorage |
| TypeScript runner | tsx | Native ESM support, replaces ts-node-dev which breaks with `"type":"module"` |
| Payment gateway | Chapa | Ethiopian payment gateway with Birr support |
| Session replay | rrweb | Industry-standard DOM recording library |
| Alerts delivery | Telegram | High mobile penetration in Ethiopia, no email server needed |
