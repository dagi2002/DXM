# DXM Pulse Contracts

Shared public contracts for the DXM Pulse SDK, API, and web app.

This package is intentionally small:

- `index.js` exposes runtime-safe endpoint constants and conversion keywords
- `index.d.ts` defines the public request and response DTOs

Primary contract surfaces:

- `CollectRequest`
- `CollectReplayRequest`
- `SessionSummary`
- `SessionDetail`
- `SessionReplay`
- `HeatmapReadModel`
- `OverviewAiBrief`
- `SiteAiBrief`

Public endpoints are centralized in `API_ENDPOINTS` so SDK and docs stay aligned with the API surface.

The phase-1 AI surface is intentionally small:

- `GET /overview` may include an optional deterministic `ai` block using `OverviewAiBrief`
- `GET /sites/:id` may include an optional deterministic `ai` block using `SiteAiBrief`
- the AI contract is shared so API and web stay aligned even while AI remains an internal, cached interpretation layer
