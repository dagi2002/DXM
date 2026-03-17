# API Reference

Base URL: `http://localhost:4000` (development)

All authenticated routes require a valid `dxm_access` JWT cookie. The cookie is set automatically by `POST /auth/login` and refreshed by `POST /auth/refresh`.

The frontend sends cookies automatically via `credentials: 'include'` on every fetch.

---

## Authentication

### `POST /auth/signup`

Create a new workspace and owner account.

**Body:**
```json
{
  "name": "Abebe Kebede",
  "email": "abebe@example.com",
  "password": "securepassword",
  "workspaceName": "Acme Corp"
}
```

**Response `201`:**
```json
{
  "user": { "id": "...", "name": "Abebe Kebede", "email": "...", "role": "owner" },
  "workspace": { "id": "...", "name": "Acme Corp", "plan": "free" }
}
```
Sets `dxm_access` and `dxm_refresh` httpOnly cookies.

---

### `POST /auth/login`

```json
{ "email": "abebe@example.com", "password": "securepassword" }
```

**Response `200`:**
```json
{
  "user": { "id": "...", "name": "Abebe Kebede", "email": "...", "role": "owner" },
  "workspace": { "id": "...", "name": "Acme Corp", "plan": "free" }
}
```
Sets `dxm_access` and `dxm_refresh` cookies.

---

### `POST /auth/refresh`

Exchange a refresh token for a new access token. Reads the `dxm_refresh` cookie automatically.

**Response `200`:** Sets new `dxm_access` cookie.

---

### `POST /auth/logout`

Clears both cookies and invalidates the refresh token in the database.

---

### `GET /auth/me`

Returns the currently logged-in user.

**Response `200`:**
```json
{
  "user": { "id": "...", "name": "...", "email": "...", "role": "..." },
  "workspace": { "id": "...", "name": "...", "plan": "..." }
}
```

---

## Event Collection (SDK)

### `POST /collect`

Ingest a batch of events from the tracking SDK. **Does not require authentication** — authenticates via `siteKey`.

**Body:**
```json
{
  "siteKey": "site_abc123",
  "sessionId": "sess_xyz789",
  "events": [
    { "type": "pageview", "ts": 1710000000000, "url": "/home" },
    { "type": "click", "ts": 1710000001000, "x": 120, "y": 450, "target": "button.cta", "url": "/home" },
    { "type": "vital", "ts": 1710000002000, "target": "LCP", "value_text": "2340" }
  ],
  "meta": {
    "userAgent": "Mozilla/5.0 ...",
    "language": "am",
    "screenWidth": 1440,
    "screenHeight": 900
  }
}
```

**Response `200`:** `{ "ok": true }`

After inserting events, triggers the alert engine asynchronously (fire-and-forget).

---

## Sessions

### `GET /sessions`

List sessions for the authenticated workspace.

**Query params:**
- `period` — `1d` | `7d` | `30d` (default: `7d`)
- `limit` — max results (default: `50`)
- `offset` — pagination offset

**Response `200`:**
```json
{
  "sessions": [
    {
      "id": "sess_...",
      "device": "desktop",
      "browser": "Chrome",
      "entry_url": "/home",
      "duration": 142,
      "clicks": 8,
      "scroll_depth": 73,
      "bounced": 0,
      "started_at": "2024-03-10T08:23:00Z"
    }
  ],
  "total": 1247
}
```

---

### `GET /sessions/:id`

Get full details for a single session including events.

---

### `GET /sessions/:id/replay`

Get rrweb event log for session replay playback.

**Response `200`:**
```json
{
  "session": { "id": "...", "duration": 142, "started_at": "..." },
  "events": [ /* rrweb event objects */ ]
}
```

---

## Analytics

### `GET /analytics/vitals`

Core Web Vitals aggregates.

**Query params:** `period` — `1d` | `7d` | `30d`

**Response `200`:**
```json
{
  "lcp": { "value": 2340, "unit": "ms", "rating": "good" },
  "fid": { "value": 85, "unit": "ms", "rating": "good" },
  "cls": { "value": 0.08, "unit": "", "rating": "needs-improvement" },
  "ttfb": { "value": 420, "unit": "ms", "rating": "good" },
  "fcp": { "value": 1200, "unit": "ms", "rating": "good" }
}
```

Ratings: `good` | `needs-improvement` | `poor` based on Google thresholds.

---

### `GET /analytics/heatmap`

Click coordinate clusters for heatmap visualization.

**Query params:** `period`, `url` (filter to specific page)

**Response `200`:**
```json
{
  "clicks": [
    { "x": 120, "y": 450, "count": 47 },
    { "x": 800, "y": 200, "count": 12 }
  ]
}
```

---

### `GET /analytics/userflow`

Page-to-page navigation transition matrix.

**Query params:** `period`

**Response `200`:**
```json
{
  "nodes": [
    { "id": "/home", "visits": 1204 },
    { "id": "/pricing", "visits": 342 }
  ],
  "links": [
    { "source": "/home", "target": "/pricing", "value": 287 },
    { "source": "/pricing", "target": "/signup", "value": 143 }
  ]
}
```

---

## Funnels

### `GET /funnels`

List all funnels for the workspace.

**Response `200`:**
```json
{
  "funnels": [
    { "id": "...", "name": "Signup Flow", "steps": [...], "created_at": "..." }
  ]
}
```

---

### `POST /funnels`

Create a new funnel.

**Body:**
```json
{
  "name": "Signup Flow",
  "steps": [
    { "name": "Landing", "urlPattern": "/" },
    { "name": "Pricing", "urlPattern": "/pricing" },
    { "name": "Signup", "urlPattern": "/signup" }
  ]
}
```

**Response `201`:** `{ "id": "..." }`

---

### `DELETE /funnels/:id`

Delete a funnel.

---

### `GET /funnels/:id/analysis`

Run step-by-step drop-off analysis for a funnel.

**Query params:** `period`

**Response `200`:**
```json
{
  "funnel": { "id": "...", "name": "Signup Flow" },
  "steps": [
    { "name": "Landing", "urlPattern": "/", "sessions": 1204, "dropoff": 0 },
    { "name": "Pricing", "urlPattern": "/pricing", "sessions": 342, "dropoff": 71.6 },
    { "name": "Signup", "urlPattern": "/signup", "sessions": 143, "dropoff": 58.2 }
  ],
  "overallConversion": 11.9
}
```

`dropoff` is the percentage who left at this step.

---

## Alerts

### `GET /alerts`

List alerts for the workspace.

**Query params:**
- `resolved` — `0` (open only) | `1` (resolved) | omit for all

**Response `200`:**
```json
{
  "alerts": [
    {
      "id": "...",
      "type": "frustration",
      "severity": "high",
      "title": "Rage clicks detected on checkout button",
      "description": "3 clicks in 2 seconds on button.checkout",
      "resolved": 0,
      "affected_sessions": 1,
      "created_at": "2024-03-10T09:15:00Z"
    }
  ]
}
```

---

### `PATCH /alerts/:id/resolve`

Mark an alert as resolved.

**Response `200`:** `{ "ok": true }`

---

## Settings

### `GET /settings`

Get workspace settings including sites and team members.

---

### `PATCH /settings/workspace`

Update workspace name or Telegram credentials.

**Body:**
```json
{
  "name": "New Name",
  "telegram_chat_id": "-100123456789",
  "telegram_bot_token": "7123:AAF..."
}
```

---

### `POST /settings/sites`

Add a new site to the workspace.

**Body:**
```json
{ "name": "Marketing Site", "domain": "example.com" }
```

**Response `201`:** `{ "site": { "id": "...", "site_key": "site_abc123", ... } }`

---

### `DELETE /settings/sites/:id`

Remove a site and all its data.

---

## Billing

### `GET /billing`

Get current plan and billing status.

---

### `POST /billing/checkout`

Initiate a Chapa checkout session for plan upgrade.

**Body:** `{ "plan": "starter" | "pro" }`

**Response `200`:** `{ "checkout_url": "https://checkout.chapa.co/..." }`

---

### `POST /billing/webhook`

Chapa webhook receiver (called by Chapa, not the frontend). Verifies HMAC signature and upgrades the workspace plan on successful payment.

---

## Health

### `GET /health`

Returns `200 { "ok": true }`. No authentication required. Used for uptime monitoring.
