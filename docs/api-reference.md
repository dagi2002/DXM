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

### `POST /auth/forgot-password`

Initiates a password reset. Always returns `{ ok: true }` regardless of whether the email exists (no email enumeration leak).

```json
{
  "email": "abebe@example.com"
}
```

On success, a reset token is generated using `crypto.randomBytes(32)`, hashed with SHA-256 before storage, and a password reset email is sent (dev mode: console log only). Tokens expire after 1 hour and are single-use.

### `POST /auth/reset-password`

Completes the password reset. Requires the raw token from the email and a new password.

```json
{
  "token": "base64url-encoded-token",
  "password": "newSecurePassword"
}
```

On success:
- Password is updated (bcrypt hashed)
- All reset tokens for the user are marked as used
- All active sessions are invalidated (refresh tokens cleared)
- Returns `{ ok: true }`

Error cases:
- Invalid/expired/used token → `400`

### `POST /auth/logout`

Clears auth cookies.

### `GET /auth/me`

Returns the current user and workspace.

## Collection

### `POST /collect`

Public SDK ingestion route. Authenticates by `siteId` which maps to a stored `site_key`.

This route is intentionally public cross-origin for tracked client sites:

- browser credentials are not required
- arbitrary client origins may post SDK batches here
- deployment CORS should allow `POST`, `OPTIONS`, and `Content-Type`

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

Like `POST /collect`, this route is intended for public cross-origin SDK traffic and does not rely on browser credentials.

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
- optional `ai`

When AI is enabled, `GET /overview` may include an additional deterministic `ai` block:

- contract source of truth: `packages/contracts/index.d.ts`
- DTO: `OverviewAiBrief`
- generated from the existing overview rollups, not a separate analytics pipeline
- omitted entirely when `DXM_AI_ENABLED` is disabled or AI fails open

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

### `DELETE /sites/:id`

Deletes a client site only when it has no dependent data or linked configuration.

Success response:

- `204 No Content`

Blocked response:

- `409 Conflict`

```json
{
  "error": "Client site cannot be deleted because dependent data exists.",
  "blockers": {
    "sessions": 1,
    "replays": 1,
    "alerts": 1,
    "funnels": 1
  }
}
```

Notes:

- this is intentionally conservative
- there is no cascade delete in the current implementation
- there is no archive flow yet

### `GET /sites/:id`

Returns the full client-site detail payload:

- site summary fields
- `snippet`
- `recentSessions`
- `openAlertsList`
- `vitals`
- `funnels`
- optional `ai`

When AI is enabled, `GET /sites/:id` may include an additional deterministic `ai` block:

- contract source of truth: `packages/contracts/index.d.ts`
- DTO: `SiteAiBrief`
- generated from the existing client detail payload, not a separate analytics pipeline
- omitted entirely when `DXM_AI_ENABLED` is disabled or AI fails open

### `GET /sites/:id/verify`

Checks whether the client site has started sending traffic.

### `GET /sites/:id/overview`

Compatibility alias for the client detail overview payload. In this phase it remains unchanged and does not add the optional site AI brief.

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

Contract source of truth:

- `packages/contracts/index.d.ts`
- `FunnelAnalysisDetail`

Response includes:

- `funnelId`
- `funnelName`
- `period`
- `totalSessions`
- `steps`
- optional `ai`

When AI is enabled, `GET /funnels/:id/analysis` may include an additional deterministic `ai` block:

- contract source of truth: `packages/contracts/index.d.ts`
- DTO: `FunnelAiBrief`
- generated from the existing funnel analysis payload, not a separate funnel-analysis pipeline
- omitted entirely when `DXM_AI_ENABLED` is disabled or AI fails open

Important notes:

- the funnel AI brief is intentionally heuristic and conservative
- it interprets step counts, conversion rates, and drop-off shape from the current analysis response
- it does not make strong causal claims from `avgTimeToNext` or sparse data alone

## Alerts

### `GET /alerts`

Returns workspace alerts ordered by newest first using the stable list-item DTO:

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

### `GET /alerts/:id`

Returns a single alert detail record using the detail DTO. The base alert shape matches the list item contract, and when AI is enabled this route may also include an optional deterministic `ai` block.

```json
{
  "id": "alert_123",
  "siteId": "site_123",
  "type": "performance",
  "severity": "high",
  "title": "Slow page load detected",
  "description": "Recent signals suggest slower-than-expected rendering.",
  "timestamp": "2026-03-20 10:15:00",
  "resolved": false,
  "affectedSessions": 12,
  "telegramSent": true,
  "resolvedAt": null,
  "ai": {
    "period": "current",
    "mode": "deterministic",
    "generatedAt": "2026-03-20T10:17:00.000Z",
    "state": "active",
    "headline": "Slow page load detected needs prompt attention.",
    "summary": "High performance alert is still active and is currently tied to 12 sessions. Review it before it becomes client-visible.",
    "whyFired": "This alert fired because recent performance signals suggest slower-than-expected load or rendering behavior.",
    "impact": "This is already touching 12 sessions and can become account-visible quickly if it stays open.",
    "recommendations": [],
    "evidence": []
  }
}
```

Contracts:
- `GET /alerts` → `AlertListItem[]`
- `GET /alerts/:id` → `AlertDetail`
- `AlertDetail.ai` → optional `AlertAiBrief`

### `POST /alerts`

Creates an alert manually and attempts Telegram delivery if the workspace is configured. When severity is `critical` and the workspace has `email_notifications_enabled`, a critical alert email is also sent to the workspace owner.

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
- `workspace` (includes `emailNotificationsEnabled`)
- `team`
- `sites`

### `PATCH /settings`

Updates workspace name, weekly digest preferences, and email notification opt-out.

```json
{
  "name": "New Workspace Name",
  "digestEnabled": true,
  "digestLanguage": "am",
  "emailNotificationsEnabled": true
}
```

### `PUT /settings/telegram`

Stores workspace Telegram credentials.

### `POST /settings/telegram/test`

Sends a test Telegram message using stored workspace credentials.

## Compatibility Aliases

The primary client-site contract is `/sites`. The onboarding UI uses `/sites`, and new integrations should also use `/sites`.

`/onboarding/sites*` still exists only as a thin compatibility alias for older create/list/verify callers. It now delegates to the same `/sites` handlers so the compatibility surface does not drift from the primary contract. Do not build new product code against the compatibility routes.

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

### `GET /billing/upgrade-requests`

Returns upgrade request history for the authenticated workspace.

### `POST /billing/upgrade-requests`

Creates a manual upgrade request (e.g. from a plan-gated feature prompt).

```json
{
  "requestedPlan": "starter",
  "source": "alerts",
  "notes": "Need alerts for my agency clients"
}
```

Valid sources: `site_limit`, `replay`, `funnels`, `user_flow`, `alerts`, `reports`, `telegram`, `digest`, `direct_billing`.

Returns `400` if the workspace is already on the requested plan or higher.

### `POST /billing/chapa/initiate`

Creates a Chapa payment transaction and returns a checkout URL. Requires `CHAPA_SECRET_KEY` to be configured.

```json
{
  "requestedPlan": "starter"
}
```

Response:

```json
{
  "checkoutUrl": "https://checkout.chapa.co/...",
  "txRef": "dxmAbCdEfGhIjKlMnO"
}
```

Returns `503` if Chapa is not configured, `502` if the payment provider is unreachable.

### `POST /billing/chapa/webhook`

Receives Chapa payment notifications. Verifies HMAC signature using `CHAPA_WEBHOOK_SECRET`, looks up the upgrade request by `tx_ref`, and activates the workspace plan if payment succeeded. Idempotent — a workspace already on the target plan or higher is not downgraded.

## Admin

### `PATCH /admin/workspaces/:id/plan`

Operator-only route for manual plan activation (e.g. after Telegram/offline payments). Protected by `x-admin-key` header validated against `ADMIN_SECRET`.

```bash
curl -X PATCH /admin/workspaces/<id>/plan \
  -H "x-admin-key: $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"plan":"starter"}'
```

Valid plans: `starter`, `pro`.

Returns `503` if `ADMIN_SECRET` is not configured, `401` if the key is missing or invalid, `404` if the workspace does not exist.

## Insights

### `GET /insights`

Returns active insights for the authenticated workspace. Insights are computed at ingestion time and stored in the database.

Query params:

- `siteId` (optional): filter insights to a specific site
- `includeResolved` (optional, `true`/`false`): include recently resolved insights (last 24h)

```json
[
  {
    "id": "ins_abc123",
    "siteId": "site_123",
    "type": "bounce_rate",
    "severity": "warning",
    "title": "High bounce rate",
    "description": "78% of visitors left without engaging (39/50 sessions in the last 2 hours).",
    "recommendation": "Check your landing page load speed and ensure key content is visible above the fold.",
    "data": { "currentValue": 78, "threshold": 70, "total": 50, "bounced": 39 },
    "active": true,
    "createdAt": "2026-03-22T10:00:00.000Z",
    "resolvedAt": null
  }
]
```

Insight types: `bounce_rate`, `low_duration`, `no_activity`, `traffic_drop`, `traffic_growth`.

Severity levels: `info`, `warning`, `critical`.

Insights are deduplicated (one active insight per type per site), auto-resolve when conditions clear, and have a 6-hour cooldown before re-triggering after resolution.

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

This route is protected by the `x-digest-key` header.
In production, the header must match `DIGEST_CRON_SECRET`.
In non-production environments, the API falls back to `JWT_SECRET` only when `DIGEST_CRON_SECRET` is absent or blank after trimming.
