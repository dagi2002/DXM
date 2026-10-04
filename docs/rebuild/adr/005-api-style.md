# ADR-005 — API style: Hono + Zod contracts + OpenAPI

**Status:** Proposed · **Date:** 2026-10-04

## Context
- Express 4 async handlers hang on throw.
- Error shapes and casing are inconsistent.
- The contracts package is hand-maintained.
- MCP and Ask Pulse duplicate the same tools.

## Decision
- **Hono** on Node for both `api` and `collector`. Routes are defined with `@hono/zod-openapi`, so request validation, response typing, and the OpenAPI document all come from `packages/contracts`.
- One error envelope everywhere: `{ error: { code, message, details?, requestId } }`. Codes are stable (`plan_limit_reached`, `feature_not_in_plan`, `session_quota_exceeded`, `not_found`, …). JSON is camelCase.
- Layering: `route → service → repository`. Services are pure and testable. Repositories own the SQL and the tenant scoping.
- A single **tool layer** (`packages/ai/tools`) backs Ask Pulse, MCP, and the Telegram bot's `/status`.
- A typed client is generated for web, mobile, and the bot.

## Consequences
Contracts can't drift, and the public API (v1.x) is documented automatically. Hono also runs on edge runtimes if the collector ever needs it.
