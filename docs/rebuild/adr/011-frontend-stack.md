# ADR-011 — Frontend stack

**Status:** Proposed · **Date:** 2026-10-04

## Decision
- **App:**
  - React 19, Vite, **TanStack Router** (typed routes and search params, so deep links work) and **TanStack Query** (cache, dedupe, abort, background refetch paused when the tab is hidden).
  - **React Aria Components** for accessible primitives. **Tailwind v4** driven by `packages/tokens`.
  - Charts: small custom SVG components on `d3-scale`/`d3-shape` (a few KB) with built-in table alternatives. No heavyweight chart library.
  - rrweb player lazy-loaded.
  - i18next + ICU, lazy per language.
- **Marketing / docs / Health Check:** **Astro**, static and bilingual, under 100 KB of JS, with islands only for the Health Check form.
- **PWA:** `vite-plugin-pwa` with a cache-first shell and network-first API.
- **Mobile (slice 8):** Expo Router sharing tokens, i18n, and the API client.

## Alternatives
Next.js for everything. Rejected for the app because it's an authenticated SPA where SSR adds operational weight for no SEO gain. Astro handles the SEO surfaces.
