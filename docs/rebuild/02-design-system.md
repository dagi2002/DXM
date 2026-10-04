# 02 — Design System: "Pulse"

Status: proposal for approval (Phase 1). Visual reference: open [`design-system.html`](./design-system.html) in a browser.

## 1. Principles

1. **Answer first, data second.** Every screen opens with the conclusion ("2 things to fix on demostore.et"), followed by the evidence. Charts support a sentence. They never replace it.
2. **One truth per number.** A metric has one definition, one unit, and one formatter, everywhere: dashboard, report, Telegram, PDF and AI text. (Today the same site is "100/100 healthy" on Dashboard, "54/100" on Overview, and has a "1820.0% bounce rate" in Reports.)
3. **Bilingual by construction.** Amharic is a co-equal layout, not a translation layer. Every component is tested with Ethiopic text, which is ~15–25% longer and taller.
4. **Built for a phone on mobile data.** Design at 360px first. Every interaction must work on a mid-range Android on a slow 4G connection.
5. **Calm by default, loud only when it matters.** Use neutral surfaces and save color for meaning. Only critical issues get a saturated color.
6. **Honest UI.** No fake numbers or decorative "LIVE" badges, and nothing that implies a feature that doesn't exist. Empty states teach the next step.

## 2. Tokens

All values are CSS custom properties, exported as Tailwind theme values and React Native constants from one source (`packages/tokens`). Components reference **semantic** tokens only, never raw palette values.

### 2.1 Color: base palettes

| Palette | Role | Notes |
|---|---|---|
| `basalt` 0–950 | Neutrals (warm grey) | Warm off-white paper `#FAF9F6` → ink `#14151A`. Keeps the warmth of today's `stone` palette. |
| `abay` 50–900 | **Brand** (deep blue, named after the Blue Nile) | `abay-600 #2D4BD8` is the primary action color. Chosen because it's outside the green/amber/red status hues, so "brand" never reads as "status". |
| `meskel` 50–900 | Highlight / AI accent (saffron) | Used sparingly for AI-generated content and "new". It never means "warning". |
| `good` / `warn` / `bad` / `info` | Status | Teal-green / amber / vermilion / blue-grey. Always paired with an icon and a word, so meaning never depends on color alone. |

> Why move off green as the brand color: health status is central to this product, and today's green brand collides with "healthy" green on every screen. The current `primary` ramp also jumps from `#22c55e` (500) to `#166534` (600), so it can't produce consistent states.

### 2.2 Color: semantic tokens (light / dark)

| Token | Light | Dark |
|---|---|---|
| `--bg` | basalt-0 `#FAF9F6` | `#0F1014` |
| `--surface` | `#FFFFFF` | `#17181D` |
| `--surface-sunken` | basalt-50 `#F3F1EC` | `#121317` |
| `--border` | basalt-200 `#E4E1DA` | `#2A2C33` |
| `--text` | basalt-900 `#1B1C21` | `#EDEBE6` |
| `--text-muted` | basalt-600 `#5F5D57` | `#A3A09A` |
| `--primary` | abay-600 `#2D4BD8` | abay-400 `#7F95F5` |
| `--primary-contrast` | `#FFFFFF` | `#0F1014` |
| `--good` / `--good-bg` | `#0F7A5C` / `#E3F4EE` | `#4FD1A5` / `#10261F` |
| `--warn` / `--warn-bg` | `#A15C00` / `#FDF0DC` | `#F2B45A` / `#2A1E0C` |
| `--bad` / `--bad-bg` | `#C2381E` / `#FCE7E2` | `#FF8A70` / `#2C1410` |
| `--ai` / `--ai-bg` | `#8A5A00` / `#FBF1DA` | `#F5C76B` / `#28200D` |
| `--focus` | abay-500 at 3px outline + 2px offset | same |

Every text/background pair meets 4.5:1 (body text) or 3:1 (large text and UI glyphs). CI checks this with a contrast test over the token pairs.

### 2.3 Data visualization

- **Categorical (max 6):** abay `#2D4BD8`, teal `#0F8C7E`, saffron `#C98A0B`, plum `#8B3FA8`, slate `#4A5568`, coral `#D9583B`. Validated for deuteranopia/protanopia distinguishability, and series always get direct labels as well.
- **Sequential (heatmaps):** single-hue abay ramp, light → dark. The current orange "fire" gradient over a blank canvas is replaced by a scaled overlay on a real page screenshot.
- **Diverging (deltas vs last period):** bad ← neutral → good, with arrows and signed numbers ("+12%"). An "is up good?" flag on each metric decides the coloring.
- Every chart ships a visually-hidden data table and a one-sentence summary ("Sessions rose 18% week over week, driven by mobile").

### 2.4 Typography

| Role | Latin | Ethiopic |
|---|---|---|
| UI + body | **Inter** (variable, `font-feature-settings: "tnum", "cv11"` for numbers) | **Noto Sans Ethiopic** (variable) |
| Display (marketing + report covers) | Inter Tight 600–700 | Noto Sans Ethiopic 700 |
| Mono (snippets, selectors) | JetBrains Mono | — |

- The font stack is `Inter, "Noto Sans Ethiopic", system-ui, sans-serif`, so mixed-script strings render in a single pass.
- Fonts are self-hosted and subset: Latin and Ethiopic unicode ranges are split with `unicode-range`, so English-only pages never download Ethiopic glyphs. Uses `font-display: swap`.
- **Ethiopic adjustments:** with `:lang(am)`, body line-height goes from 1.5 to 1.7, and sizes ≤14px get +1px. Fidel characters are dense, and the current UI renders them at 11–12px, where they are hard to read.
- `<html lang>` follows the UI language (it's currently stuck on `en`, so screen readers read Amharic with English rules).

**Scale** (rem, 16px base): 0.75 / 0.8125 / 0.875 / 1 / 1.125 / 1.25 / 1.5 / 1.875 / 2.25 / 3. Body text is 1rem on mobile and never below 0.875rem for Ethiopic.

### 2.5 Space, shape, depth, motion

- **Spacing:** 4px base: 0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.
- **Radius:** `sm 6` (inputs, pills), `md 10` (buttons, small cards), `lg 14` (cards), `xl 20` (sheets, hero panels), `full`.
- **Elevation:** `0` flat with border (default), `1` raised (popovers), `2` overlay (dialogs, sheets). Cards use borders, not shadows.
- **Motion:** 120ms (hover/press), 200ms (enter), 320ms (sheets), `cubic-bezier(.2,.8,.2,1)`. `prefers-reduced-motion` turns transitions into fades and freezes pulsing indicators.
- **Touch targets:** at least 44×44px. **Breakpoints:** 360 (base), 640, 1024, 1280, 1536.

## 3. Localization rules

- Dates can be shown in the **Ethiopian calendar** (`መስከረም 24, 2019 ዓ.ም`) or Gregorian. The default follows the UI language, and users can change it in their profile. Data is always stored in UTC. Display follows the workspace timezone (default `Africa/Addis_Ababa`).
- Time: 24h by default. The Amharic UI offers an optional Ethiopian 12-hour clock ("ከጠዋቱ 3 ሰዓት").
- Numbers use Western digits in both languages. Currency is shown as "1,490 ብር" (am) and "ETB 1,490" (en).
- Pluralization and interpolation go through ICU MessageFormat. Never build sentences by concatenating strings.
- Copy is written in Amharic, not translated word-for-word. Glossary (to be confirmed by a native reviewer): session → **ጉብኝት** (visit) rather than the literal ክፍለ ጊዜ; bounce rate → **ወዲያው የወጡ ጎብኚዎች** ("visitors who left immediately") rather than የማስወጣት መጠን; heatmap → **የጠቅታ ካርታ**.
- No layout may assume string length. Buttons and badges wrap or truncate with a tooltip, and are tested with the longest locale.

## 4. Component inventory

Built on React Aria Components (web), with headless logic shared with React Native where practical.

**Primitives:** Button (primary / secondary / ghost / danger; sm/md/lg; loading), IconButton (aria-label required by type), Link, Input, Textarea, Select, Combobox, Checkbox, Radio, Switch, SegmentedControl, Tabs, Tooltip, Popover, Dialog, Sheet (bottom on mobile, side on desktop), Toast, Skeleton, Spinner, Avatar, Badge, Kbd, CopyField (snippets).

**Product components:**

| Component | Purpose |
|---|---|
| **FixCard** | The core unit of the product: issue → evidence (replay clips, affected visitors, page) → impact estimate → suggested fix → status (open / fixing / fixed / verified). Shows up in the app, the Telegram bot, mobile push, and client reports. |
| **StatTile** | Value, unit, delta vs previous period (arrow + sign + color by "is up good"), a sparkline, and an "explain" affordance. Has a single formatter per metric type. |
| **HealthScore** | A 0–100 score with a band label and a breakdown popover. One definition, server-computed. |
| **StatusBadge / SeverityPill** | Icon, word and color. |
| **DataTable** | Sortable, keyboard-navigable. Collapses into a card list below 640px. |
| **EmptyState** | Illustration-free: a one-line explanation plus one primary next action. |
| **ReplayPlayer** | rrweb, lazy-loaded. Friction moments on the timeline. Skip-inactivity. Mobile-friendly controls. |
| **HeatmapOverlay** | Page screenshot + overlay, device toggle, selector list. |
| **FunnelChart, JourneyFlow, VitalsGauge, Sparkline, TrendChart** | Charts with built-in text alternatives. |
| **ReportBlock** | Building blocks for white-label reports (cover, KPI row, fix list, before/after). Print-perfect. |
| **SiteSwitcher / CommandMenu** | Jump to any client site, page, or action (⌘K). |
| **LanguageSwitch, CalendarSwitch** | Available on every surface, including mobile and public pages. |

## 5. Layout patterns

- **App shell:** a left rail (desktop) or bottom bar (mobile) with at most 5 destinations: **Today** (the fix feed), **Sites**, **Replays**, **Reports**, **Settings**. Insights (heatmaps, funnels, vitals, journeys) live *inside* a site, not as global pages. This merges today's overlapping Overview / Dashboard / AI Portfolio Brief / Analytics pages.
- **Bottom-bar labels are always visible** (they're icon-only today).
- **Page header:** title, scope (site + date range), and primary action. Below it, a one-sentence summary of the page.
- **Density:** comfortable by default, with a compact mode for agency operators running many sites.

## 6. Voice

Direct, specific, kind. Say "Your checkout button doesn't respond on Android — 31 visitors tried 4+ times today," not "Elevated frustration signals detected." Avoid jargon such as "DXM", "operational command center", or "proof-of-value conversations" in the product UI.
