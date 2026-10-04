# ADR-002 — PostgreSQL with RLS, partitioned events, rollups

**Status:** Proposed · **Date:** 2026-10-04

## Context
SQLite with a single writer, synchronous queries on the event loop, no tenant columns on `events`, no retention, replay JSON stored in the main file, and migrations split on `;`. At plan caps the database grows without bound. Under load, the event loop stalls before disk becomes the problem.

## Decision
- **PostgreSQL 16** with **Drizzle ORM** and SQL migrations (a versioned journal, run as a one-shot deploy step that fails loudly).
- **Row-level security** on every tenant table (`org_id`), driven by `SET LOCAL app.org_id` per request transaction. The repository layer still filters explicitly (defense in depth).
- `events` is **partitioned by day**. Retention drops whole partitions (cheap, no VACUUM storm). Every event row carries `org_id` and `site_id`.
- Dashboards read **rollup tables** maintained by the worker, never raw events.
- Typed columns replace stringly-packed values (`"LCP:2300"` becomes the `vitals` table).

## Consequences
- Proper concurrency, real migrations, point-in-time recovery (WAL-G), and horizontal headroom.
- One more process to run (in Docker Compose).
- **Revisit trigger:** if events exceed ~50M/day or rollup lag goes past 5 minutes, add ClickHouse for events only (ADR to follow). Nothing in the API shape depends on Postgres for events.

## Alternatives considered
- Keep SQLite with Litestream: simplest ops, but a single writer and no RLS.
- ClickHouse from day one: excellent for events, but a second datastore for a solo founder before any customer exists.
- Supabase: a managed Postgres option. Viable for staging, but it complicates the Ethiopia-hosted option.
