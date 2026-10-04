# ADR-010 — One metric registry

**Status:** Proposed · **Date:** 2026-10-04

## Context
The report showed a **1820.0% bounce rate** because the API returns 0–100 and the web multiplies by 100 again. There are three health formulas, three vitals percentile implementations, and three bounce windows. Logic matches on display labels (`label === 'Avg Duration'`).

## Decision
- `packages/metrics` defines every metric once: `id`, `unit` (`ratio` 0–1 | `ms` | `count` | `score` 0–100 | `money`), `isUpGood`, `thresholds`, the computation (SQL or rollup reference), and `format(value, locale)`.
- The API returns raw typed values plus the metric id. The web app, mobile app, PDF reports, Telegram, and AI all format through the registry.
- **Health score** is one server-side function, versioned (`health_v1`), with a breakdown the UI can explain.
- Lint bans `* 100` and percent-string building in UI packages.

## Consequences
A number reads the same on every surface, and a change to a definition happens in exactly one place.
