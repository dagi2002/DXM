# ADR-007 — Background work: pg-boss worker, detectors off the hot path

**Status:** Proposed · **Date:** 2026-10-04

## Context
About 15 aggregate queries run synchronously inside every `/collect` request, scanning all tenants' events. There is no job runner. The digest loop aborts on the first error. The `no_activity` insight can never fire.

## Decision
- **pg-boss** (a Postgres-backed queue: no Redis, transactional enqueue) in a dedicated `worker` process.
- Queues:
  - `ingest.apply`
  - `detect.site` (every 2 minutes per active site, staggered, checkpointed)
  - `rollup.*`
  - `visit.close` (idle 30 minutes)
  - `issue.verify`
  - `ai.recommend`
  - `report.build/send`
  - `digest.send`
  - `notify.*`
  - `retention.purge`
  - `billing.renewal`
  - `snapshot.page` (page screenshots for heatmaps)
- Every job is **idempotent** (keyed by natural keys), retries with backoff, sends failures to a dead-letter queue that alerts in Sentry, and is observable (lag metrics).
- Detectors are **pure functions** in `packages/detectors` with fixture-based tests. They include a *tracking-broken* detector driven by schedule rather than by ingest.

## Consequences
The ingest p99 stays flat as detectors grow. A new detector means a new pure function plus fixtures.
