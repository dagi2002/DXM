# API Reference

Development base URL: `http://localhost:4000`

Authenticated routes use the `dxm_access` cookie set by the auth endpoints.

## Health

### `GET /health`

Returns a simple health payload:

```json
{
  "status": "ok",
  "ts": "2026-03-20T12:00:00.000Z"
}
```

## Auth

### `POST /auth/signup`

Creates a workspace and owner account.

```json
{
  "name": "Abebe Kebede",
  "email": "abebe@example.com",
  "password": "securepassword",
  "workspaceName": "Habesha Shop"
}
```

### `POST /auth/login`

```json
{
  "email": "abebe@example.com",
  "password": "securepassword"
}
```

### `POST /auth/logout`

Clears auth cookies.

### `GET /auth/me`

Returns the current user and workspace.

## Collection

### `POST /collect`

Public SDK ingestion route. Authenticates by `siteId` which maps to a stored `site_key`.

Contract source of truth:

- `packages/contracts/index.d.ts`
- `CollectRequest`

```json
{
  "sessionId": "sess_123",
  "siteId": "site_key_abc",
  "completed": false,
  "events": [
    { "type": "pageview", "ts": 1710000000000, "url": "https://example.com/" },
    { "type": "click", "ts": 1710000002000, "x": 120, "y": 220, "target": "button.buy" },
    { "type": "vital", "ts": 1710000003000, "name": "LCP", "value": 2540 }
  ],
  "metadata": {
    "url": "https://example.com/",
    "userAgent": "Mozilla/5.0 ...",
    "language": "en-US",
    "screen": { "width": 1440, "height": 900 }
  }
}
```

Notes:

- `completed: true` is sent on final page-hide flushes so the API can finalize `endedAt`, `duration`, `bounced`, and `completed`
- conversion rate is now derived from custom event names such as `purchase`, `checkout_complete`, `lead_submitted`, `trial_started`, and `signup_completed`

### `POST /collect-replay/replay`

Public replay chunk ingestion route.

Contract source of truth:

- `packages/contracts/index.d.ts`
- `CollectReplayRequest`

## Sessions

### `GET /sessions`

Returns up to 200 workspace sessions in summary read-model form.

Contract source of truth:

- `packages/contracts/index.d.ts`
- `SessionSummary`

Important shape notes:

- `duration` is in seconds
- `events` is intentionally empty in the summary response
- `stats` contains the KPI-facing derived fields used by the web app

### `GET /sessions/:id`

Returns the full session detail read model with the event timeline.

Contract source of truth:

- `packages/contracts/index.d.ts`
- `SessionDetail`

### `GET /sessions/:id/replay`

Returns replay events for rrweb playback.

Contract source of truth:

- `packages/contracts/index.d.ts`
- `SessionReplay`

Important shape notes:

- `duration` is in milliseconds for the replay player
- this route is separate from `GET /sessions/:id` so rrweb payloads do not bloat the session detail timeline response

## Analytics

### `GET /analytics/metrics`

Returns dashboard summary metrics such as active sessions, bounce rate, conversion rate, and average session duration.

### `GET /analytics/vitals`

Returns aggregated Web Vitals keyed by metric name.

### `GET /analytics/userflow`

Returns page-to-page navigation patterns derived from recorded navigation events.

### `GET /analytics/heatmap`

Returns the dedicated heatmap read model.

Contract source of truth:

- `packages/contracts/index.d.ts`
- `HeatmapReadModel`

Important shape notes:

- heatmap consumers should use this route instead of reconstructing heatmaps from `GET /sessions`
- response contains `sessions` for filtering and `points` for click/scroll plotting

## Agency Overview

### `GET /overview`

Returns the workspace portfolio summary used by the agency overview screen.

Response includes:

- `summary`
- `siteRollups`
- `alertHotspots`
- `recentActivity`
- `recommendedActions`
- `reports`

## Client Sites

### `GET /sites`

Lists client sites in the workspace with live rollups such as:

- `trackingStatus`
- `sessionCount7d`
- `openAlerts`
- `healthScore`
- `bounceRate`
- `conversionRate`

### `POST /sites`

Creates a client site and returns the detail shape used by the client detail screen.

```json
{
  "name": "Abebe Furniture",
  "domain": "abebefurniture.et"
}
```

### `PATCH /sites/:id`

Updates client-site name and/or domain.

```json
{
  "name": "Abebe Furniture Main Site",
  "domain": "shop.abebefurniture.et"
}
```

### `GET /sites/:id`

Returns the full client-site detail payload:

- site summary fields
- `snippet`
- `recentSessions`
- `openAlertsList`
- `vitals`
- `funnels`

### `GET /sites/:id/verify`

Checks whether the client site has started sending traffic.

### `GET /sites/:id/overview`

Alias for the client detail overview payload.

## Funnels

### `GET /funnels`

Lists workspace funnels.

### `POST /funnels`

Creates a funnel.

```json
{
  "name": "Checkout Flow",
  "steps": [
    { "name": "Landing", "urlPattern": "/" },
    { "name": "Cart", "urlPattern": "/cart" },
    { "name": "Checkout", "urlPattern": "/checkout" }
  ]
}
```

### `DELETE /funnels/:id`

Deletes a funnel.

### `GET /funnels/:id/analysis`

Runs live analysis against recorded session paths.

## Alerts

### `GET /alerts`

Returns workspace alerts ordered by newest first using the stable web DTO:

```json
[
  {
    "id": "alert_123",
    "siteId": "site_123",
    "type": "performance",
    "severity": "high",
    "title": "LCP spike on checkout",
    "description": "Mobile users are waiting longer than expected for content to render.",
    "timestamp": "2026-03-20 10:15:00",
    "resolved": false,
    "affectedSessions": 12,
    "telegramSent": true,
    "resolvedAt": null
  }
]
```

### `POST /alerts`

Creates an alert manually and attempts Telegram delivery if the workspace is configured.

### `PATCH /alerts/:id/resolve`

Marks an alert resolved.

## Users

### `GET /users`

Returns workspace members in the web app’s current read-only shape:

```json
[
  {
    "id": "usr_123",
    "name": "Abebe Kebede",
    "email": "abebe@example.com",
    "role": "owner",
    "lastLogin": null
  }
]
```

## Settings

### `GET /settings`

Returns the full settings payload used by the agency settings screen:

- `profile`
- `workspace`
- `team`
- `sites`

### `PATCH /settings`

Updates workspace name and weekly digest preferences.

```json
{
  "name": "New Workspace Name",
  "digestEnabled": true,
  "digestLanguage": "am"
}
```

### `PUT /settings/telegram`

Stores workspace Telegram credentials.

### `POST /settings/telegram/test`

Sends a test Telegram message using stored workspace credentials.

## Compatibility Aliases

The primary client-site contract is `/sites`. The onboarding UI uses `/sites`, and new integrations should also use `/sites`.

### `POST /onboarding/sites`

Compatibility alias for site creation.

### `GET /onboarding/sites`

Compatibility alias for listing workspace sites.

### `GET /onboarding/sites/:id/verify`

Compatibility alias for install verification.

## Billing

### `GET /billing/plans`

Public plan catalog for the current MVP.

### `GET /billing/current`

Returns the authenticated workspace plan and billing status.

### `POST /billing/chapa/webhook`

Placeholder webhook receiver for future Chapa automation.

## Public Site Audit

### `GET /audit?url=example.com`

Unauthenticated public audit endpoint with a lightweight per-IP rate limit.

Response shape:

```json
{
  "url": "https://example.com",
  "ttfbMs": 812,
  "mobileReady": true,
  "pageSizeKb": 384,
  "score": "good"
}
```

## Weekly Digest

### `POST /digest/send-all`

Sends digest messages for all workspaces that have:

- Telegram configured
- `digest_enabled = 1`

This route is protected by the `x-digest-key` header, which must match `JWT_SECRET`.
