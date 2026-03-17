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

# ── Telegram (optional — enables push alert notifications) ────────────────────
TELEGRAM_DEFAULT_BOT_TOKEN=

# ── Chapa Payments (optional — enables billing features) ──────────────────────
CHAPA_SECRET_KEY=
CHAPA_WEBHOOK_SECRET=

# ── SDK / Frontend ────────────────────────────────────────────────────────────
SDK_CDN_URL=http://localhost:5173/sdk/dxm.js
VITE_API_URL=http://localhost:4000
VITE_SDK_CDN_URL=http://localhost:5173/sdk/dxm.js
```
