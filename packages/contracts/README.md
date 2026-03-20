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

Public endpoints are centralized in `API_ENDPOINTS` so SDK and docs stay aligned with the API surface.
