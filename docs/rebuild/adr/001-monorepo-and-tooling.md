# ADR-001 — Monorepo & tooling

**Status:** Proposed · **Date:** 2026-10-04

## Context
The current repo uses npm workspaces. Shared code is consumed through deep relative paths (`../../../../packages/contracts/index.js`), and contracts are hand-written `.js` + `.d.ts`. `tsc -p .` checks 0 files, which hides 10 type errors. CI runs no lint and no type check.

## Decision
- **pnpm workspaces + Turborepo** in a new `next/` directory. Packages are consumed by name (`@pulse/contracts`).
- TypeScript `strict` + `noUncheckedIndexedAccess`, with `tsc -b` at the root as a required CI gate.
- ESLint (typescript-eslint) with custom rules: no raw color or arbitrary Tailwind values outside `packages/ui`, no `* 100` percentage math in UI, no hard-coded JSX text. Prettier for formatting.
- Node 22 LTS, pinned in `.nvmrc` and `packageManager`.
- Renovate for dependency updates. gitleaks for secret scanning.

## Consequences
- Fast incremental builds and cached tests.
- One install for every app, including Expo.
- The old `apps/` tree stays on npm until cutover.

## Alternatives considered
Nx (heavier, more config), npm workspaces alone (no task caching or pipelines), Bun (Expo/Playwright compatibility risk).
