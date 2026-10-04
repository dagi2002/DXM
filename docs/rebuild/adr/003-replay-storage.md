# ADR-003 — Replay storage in object storage

**Status:** Proposed · **Date:** 2026-10-04

## Context
Replay chunks are JSON TEXT rows in SQLite (~100 KB per session). The SDK's `chunkIndex = floor(total/50)` resets on reload, and the server's `ON CONFLICT DO UPDATE` then overwrites earlier chunks, including the full snapshot. Reading a replay loads every chunk into memory.

## Decision
- Chunks are gzip-compressed in the browser (`CompressionStream`, with an uncompressed fallback). Each carries a **monotonic per-visit `seq`** that persists in `sessionStorage`.
- The collector writes each chunk directly to S3-compatible storage at `orgs/{org}/sites/{site}/visits/{visit}/{seq}.json.gz`, using write-once keys (an existing key is rejected).
- Postgres stores metadata only (`replay_chunks`). The player streams chunks in order through a signed-URL endpoint.
- `checkoutEveryNms = 5 min`, so a lost chunk never makes a whole replay unplayable.
- Retention is applied by an object lifecycle rule plus a metadata purge, per plan.
- Providers: Cloudflare R2 (no egress fees) by default, or MinIO on the same VM for the in-country option.

## Consequences
Replays stop competing with transactional data. Storage costs are predictable (~10–20 KB per session after gzip). Backups of the database stay small.
