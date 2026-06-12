# Environment Variables

Copy `.env.example` to `.env` in the project root before starting the server.

```bash
cp .env.example .env
```

---

## Required Variables

These must be set for the API to start correctly.

### `JWT_SECRET`
**Required** | String (32+ characters)

Secret key used to sign access tokens (15-minute JWTs). Use a long random string.

```bash
JWT_SECRET=change_this_in_production_min_32_chars
```

Generate one:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

### `JWT_REFRESH_SECRET`
**Required** | String (32+ characters)

A **different** secret key for signing refresh tokens (7-day JWTs). Must not be the same as `JWT_SECRET`.

```bash
JWT_REFRESH_SECRET=different_secret_also_min_32_chars
```

---

## Server Configuration

### `PORT`
**Optional** | Default: `4000`

Port the Express API server listens on.

```bash
PORT=4000
```

---

### `DB_PATH`
**Optional** | Default: `./data/dxm.db`

Path to the SQLite database file, relative to the `apps/api` directory. The directory must exist before starting the server. The `apps/api/data/` directory is pre-created with a `.gitkeep` file.

```bash
DB_PATH=./data/dxm.db
```

---

### `COOKIE_DOMAIN`
**Optional** | Default: `localhost`

Domain scope for the JWT cookies. Set to your production domain (e.g. `dxmpulse.et`) when deploying.

```bash
COOKIE_DOMAIN=localhost
```

---

### `WEB_ORIGIN`
**Optional** | Default: `http://localhost:5173`

The CORS allowed origin. Must match the URL of the deployed web app exactly (no trailing slash).

```bash
WEB_ORIGIN=http://localhost:5173
```

In production:
```bash
WEB_ORIGIN=https://app.dxmpulse.et
```

---

### `ANTHROPIC_API_KEY`
**Optional** | Anthropic API key (`sk-ant-...`)

Enables LLM-backed AI brief generation using Claude. When set, brief generation calls `api.anthropic.com/v1/messages` and produces richer, context-aware narratives. Results are cached in `ai_artifacts` for 24 hours.

When absent, the AI layer falls back to deterministic mode (pre-written template strings derived from portfolio data — no external call, no cost).

Get a key at [console.anthropic.com](https://console.anthropic.com).

```bash
ANTHROPIC_API_KEY=sk-ant-api03-...
```

**Cost note:** Each brief generation costs approximately $0.003–$0.01 depending on portfolio size. The 24-hour cache means Claude is called at most once per workspace per day.

---

### `DXM_AI_ENABLED`
**Optional** | Default: enabled

Master switch for the AI layer. Controls both deterministic and LLM AI brief generation.

- AI is enabled by default when the variable is missing
- set to `0`, `false`, or `off` to disable entirely
- when disabled, `GET /overview` returns the non-AI payload and the API skips `ai_artifacts` reads and writes entirely
- `ANTHROPIC_API_KEY` controls whether the enabled AI runs in LLM or deterministic mode

```bash
DXM_AI_ENABLED=true
```

To disable:

```bash
DXM_AI_ENABLED=false
```

---

## Frontend Variables

These are read by Vite at **build time** and embedded in the frontend bundle. They must start with `VITE_`.

### `VITE_API_URL`
**Optional** | Default: `http://localhost:4000`

Base URL for all API requests from the web app. Must be set before building for production.

```bash
VITE_API_URL=http://localhost:4000
```

In production:
```bash
VITE_API_URL=https://api.dxmpulse.et
```

---

### `VITE_SDK_CDN_URL`
**Optional** | Default: `http://localhost:5173/sdk/dxm.js`

URL shown to users in the onboarding wizard as the SDK script tag src. Points to wherever `dxm.js` is hosted.

```bash
VITE_SDK_CDN_URL=http://localhost:5173/sdk/dxm.js
```

---

### `SDK_CDN_URL`
**Optional** | Same as `VITE_SDK_CDN_URL` but read by the API (e.g. for onboarding email templates).

```bash
SDK_CDN_URL=http://localhost:5173/sdk/dxm.js
```

---

### `API_PUBLIC_URL`
**Optional** | API-only public base URL used in generated install snippets.

When set, the API adds an explicit `data-api-url="..."` attribute to generated SDK install snippets. This is useful for deployment setups where the SDK should post to a public API URL instead of relying on the SDK's baked-in default.

- blank values are ignored after trimming
- trailing slashes are removed in generated snippets
- this variable only affects API-generated snippets in the current deployment-groundwork phase

```bash
API_PUBLIC_URL=https://app.dxmpulse.et/api
```

---

### `DIGEST_CRON_SECRET`
**Optional in local/dev/test** | **Required for production digest execution**

Dedicated secret for authenticating `POST /digest/send-all`.

- in production, digest execution uses only `DIGEST_CRON_SECRET`
- in non-production, the API falls back to `JWT_SECRET` only when `DIGEST_CRON_SECRET` is absent or blank after trimming
- blank values are ignored after trimming

```bash
DIGEST_CRON_SECRET=change_this_digest_secret_in_production
```

---

### `ADMIN_SECRET`
**Optional in local/dev/test** | **Required for admin endpoints in production**

Dedicated secret for authenticating `PATCH /admin/workspaces/:id/plan`. The admin route validates the `x-admin-key` request header against this value using a timing-safe comparison.

- returns `503` if not configured
- returns `401` if the header is missing or does not match

```bash
ADMIN_SECRET=change_this_admin_secret_in_production
```

---

## Optional Integrations

### `TELEGRAM_DEFAULT_BOT_TOKEN`
**Optional** | Telegram Bot API token

Enables Telegram alert notifications. Create a bot via [@BotFather](https://t.me/BotFather) and paste the token here.

If left empty, alerts are still created in the database but not pushed to Telegram.

```bash
TELEGRAM_DEFAULT_BOT_TOKEN=7123456789:AAF...
```

Each workspace can also configure their own bot token + chat ID via the Settings page in the dashboard. The workspace-level token overrides this default.

---

### `CHAPA_SECRET_KEY`
**Optional** | Chapa API secret key

Enables billing via [Chapa](https://chapa.co) (Ethiopian payment gateway). Get your key from the Chapa merchant dashboard.

```bash
CHAPA_SECRET_KEY=CHASECK_test-...
```

---

### `CHAPA_WEBHOOK_SECRET`
**Optional** | Chapa webhook verification secret

Used to verify that incoming payment webhooks are genuinely from Chapa. Set this to the value configured in your Chapa merchant dashboard.

```bash
CHAPA_WEBHOOK_SECRET=your_webhook_secret
```

---

### `WORKSPACE_API_PEPPER`
**Recommended in production** | Secret string mixed into every workspace API key hash

Workspace API keys (used by the `/mcp` endpoint for Claude Desktop / Cursor) are stored as `sha256(raw_key || WORKSPACE_API_PEPPER)`. The pepper is a second secret that lives only in the process environment — an attacker who exfiltrates the database still cannot forge key lookups without it.

```bash
WORKSPACE_API_PEPPER=change_this_pepper_before_you_accept_live_mcp_clients
```

Generate one:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

If unset, the pepper is an empty string — acceptable for local development but a silent security downgrade in production. Rotating the pepper invalidates every existing API key, so pick a value before issuing any keys to real users.

---

## Complete `.env.example`

```bash
# ── Server ────────────────────────────────────────────────────────────────────
PORT=4000
DB_PATH=./data/dxm.db

# ── Auth (REQUIRED — change before deploying) ─────────────────────────────────
JWT_SECRET=change_this_in_production_min_32_chars
JWT_REFRESH_SECRET=different_secret_also_min_32_chars

# ── CORS / Cookies ────────────────────────────────────────────────────────────
COOKIE_DOMAIN=localhost
WEB_ORIGIN=http://localhost:5173

# ── Anthropic AI (optional — enables LLM-backed briefs via Claude) ────────────
# Without this key, AI briefs fall back to deterministic mode (no external call)
ANTHROPIC_API_KEY=

# ── Telegram (optional — enables push alert notifications) ────────────────────
TELEGRAM_DEFAULT_BOT_TOKEN=

# ── Chapa Payments (optional — enables billing features) ──────────────────────
CHAPA_SECRET_KEY=
CHAPA_WEBHOOK_SECRET=

# ── Admin (optional — enables admin plan activation endpoint) ─────────────────
ADMIN_SECRET=

# ── Digest (optional — required for production digest cron) ──────────────────
DIGEST_CRON_SECRET=change_this_digest_secret_in_production

# ── Workspace API keys / MCP (recommended in production) ─────────────────────
# Pepper added to sha256(raw) when storing workspace_api_keys. Set before
# issuing any keys to live users — rotating later invalidates all keys.
WORKSPACE_API_PEPPER=change_this_pepper_before_accepting_live_mcp_clients

# ── SDK / Frontend ────────────────────────────────────────────────────────────
SDK_CDN_URL=http://localhost:5173/sdk/dxm.js
API_PUBLIC_URL=
VITE_API_URL=http://localhost:4000
VITE_SDK_CDN_URL=http://localhost:5173/sdk/dxm.js
```
