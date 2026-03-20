# Runbook - DXM Pulse

- Service: DXM Pulse
- Owner: engineering
- Environment: local development + single-VM production baseline
- Last verified: 2026-03-20

## Overview

DXM Pulse is a monorepo with three live runtime surfaces plus a shared contract package:

- `apps/web`: React + Vite frontend
- `apps/api`: Express + TypeScript + SQLite backend
- `packages/sdk`: browser SDK build output (`dxm.js`, `dxm-replay.js`)
- `packages/contracts`: shared public DTOs and endpoint constants

For local development, the important operational detail is:

- `npm run dev` starts the web app, the API, and the SDK build watcher
- the SDK watcher rebuilds files in `packages/sdk/dist`, but it does not serve those files by itself
- if you want to load the SDK from a browser page locally, you must also serve `packages/sdk/dist` from a local static server
- in production, the dashboard is expected to sit behind a reverse proxy path such as `/api`, while tracked client sites still post to the public API from arbitrary origins

## Preconditions

- Node.js 22.21.1 from `.nvmrc`
- npm available on the command line
- repo cloned locally
- ability to open multiple terminals

## Required Environment Variables

Create `.env` in the repo root:

```bash
cp .env.example .env
```

Recommended local values:

```bash
PORT=4000
NODE_ENV=development
DB_PATH=./data/dxm.db
JWT_SECRET=change_this_in_production_min_32_chars
JWT_REFRESH_SECRET=different_secret_also_min_32_chars
DIGEST_CRON_SECRET=change_this_digest_secret_in_production
COOKIE_DOMAIN=localhost
WEB_ORIGIN=http://localhost:5173
SDK_CDN_URL=http://localhost:8080/dxm.js
VITE_API_URL=http://localhost:4000
VITE_SDK_CDN_URL=http://localhost:8080/dxm.js
```

What each one does:

- `PORT`: API port
- `DB_PATH`: SQLite database path used by `apps/api`
- `JWT_SECRET`: signs access cookies
- `JWT_REFRESH_SECRET`: signs refresh cookies
- `DIGEST_CRON_SECRET`: authenticates manual or scheduled digest execution; required in production
- `COOKIE_DOMAIN`: cookie domain; `localhost` is correct for local dev
- `WEB_ORIGIN`: CORS allow-list origin for the frontend
- `SDK_CDN_URL`: snippet URL returned by the API for local site installs
- `VITE_API_URL`: base URL used by the web app for API requests
- `VITE_SDK_CDN_URL`: snippet URL shown in the frontend

Network behavior assumptions:

- dashboard/API browser traffic is tied to `WEB_ORIGIN` and uses credentials
- `POST /collect` and `POST /collect-replay/replay` are public ingest endpoints for tracked client sites and must allow cross-origin browser requests without credentials
- `GET /health` stays the simple local/non-browser verification endpoint
- `POST /digest/send-all` is a separate authenticated operation using `x-digest-key`

Optional, not required for basic local boot:

- `TELEGRAM_DEFAULT_BOT_TOKEN`
- `CHAPA_SECRET_KEY`
- `CHAPA_WEBHOOK_SECRET`

Digest auth note:

- in production, `POST /digest/send-all` requires `DIGEST_CRON_SECRET`
- in local/dev/test, the route falls back to `JWT_SECRET` only when `DIGEST_CRON_SECRET` is unset or blank

## Local Start Procedure

### 1. Install dependencies

From the repo root:

```bash
npm install
```

### 2. Create or update `.env`

```bash
cp .env.example .env
```

Then update the SDK URLs to `http://localhost:8080/dxm.js` if you plan to test the SDK from a browser page locally.

### 3. Run database setup

```bash
npm run migrate -w apps/api
npm run seed -w apps/api
```

Notes:

- `migrate` is safe to re-run
- `seed` is optional, but it makes the dashboard less empty
- the default local DB file is `apps/api/data/dxm.db`

### 4. Start web + API + SDK watcher together

```bash
npm run dev
```

Expected results:

- web on `http://localhost:5173`
- API on `http://localhost:4000`
- SDK build watcher writing to `packages/sdk/dist`

### 5. Serve the SDK files

In a second terminal:

```bash
cd packages/sdk/dist
python3 -m http.server 8080
```

Expected results:

- `http://localhost:8080/dxm.js`
- `http://localhost:8080/dxm-replay.js`

This step matters because the SDK build watcher does not expose a local HTTP endpoint on its own.

## Health Checks

### API health

```bash
curl -sS http://localhost:4000/health
```

Expected result:

```json
{"status":"ok","ts":"..."}
```

## Manual Digest Trigger

### Raw curl

```bash
curl -fsS -X POST http://127.0.0.1:4000/digest/send-all \
  -H "x-digest-key: $DIGEST_CRON_SECRET"
```

For local development only, if `DIGEST_CRON_SECRET` is unset, the API falls back to `JWT_SECRET`.

### Helper script

```bash
./ops/run-digest.sh
```

The helper uses:

- `DIGEST_CRON_SECRET` when present
- otherwise `JWT_SECRET` only when `NODE_ENV != production`
- `DIGEST_URL` if you need a non-default local endpoint

### Web health

Open:

- `http://localhost:5173/`
- `http://localhost:5173/login`
- `http://localhost:5173/signup`

### SDK health

Open:

- `http://localhost:8080/dxm.js`
- `http://localhost:8080/dxm-replay.js`

If either returns 404, the SDK is not being served correctly.

## Production Operations

The production baseline is a single Linux VM with:

- a full repo checkout at `/opt/dxm-pulse/app`
- API runtime env in `/etc/dxm-pulse.env`
- API service managed by `dxm-api.service`
- digest execution managed by `dxm-digest.service` and `dxm-digest.timer`
- Caddy serving the web app at `/`, the API at `/api`, and SDK assets at `/sdk/*`
- SQLite stored at `/var/lib/dxm/dxm.db`

Keep the VM timezone set to `Africa/Addis_Ababa` so the weekly timer runs at the expected local time.

### Required production paths

- repo checkout: `/opt/dxm-pulse/app`
- runtime env: `/etc/dxm-pulse.env`
- database: `/var/lib/dxm/dxm.db`
- backups: `/var/backups/dxm`

### Build and file-mode expectations

Build from the repo root after exporting the production Vite variables:

```bash
export VITE_API_URL=/api
export VITE_SDK_CDN_URL=https://app.dxmpulse.et/sdk/dxm.js
npm run build
```

If file mode is not preserved on the host, restore executability explicitly:

```bash
chmod +x /opt/dxm-pulse/app/ops/run-digest.sh
chmod +x /opt/dxm-pulse/app/ops/backup-sqlite.sh
```

### Service management

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now dxm-api.service
sudo systemctl enable --now dxm-digest.timer
sudo systemctl restart dxm-api.service
sudo systemctl restart caddy
```

Status checks:

```bash
systemctl status dxm-api.service
systemctl status dxm-digest.service
systemctl status dxm-digest.timer
systemctl status caddy
```

### Log inspection

```bash
journalctl -u dxm-api.service -n 100 --no-pager
journalctl -u dxm-digest.service -n 100 --no-pager
journalctl -u caddy -n 100 --no-pager
```

### Health checks

Local API:

```bash
curl -sS http://127.0.0.1:4000/health
```

External API:

```bash
curl -sS https://app.dxmpulse.et/api/health
```

SDK files:

```bash
curl -I https://app.dxmpulse.et/sdk/dxm.js
curl -I https://app.dxmpulse.et/sdk/dxm-replay.js
```

### Digest timer and manual trigger

Inspect the timer:

```bash
systemctl list-timers dxm-digest.timer
```

Trigger manually:

```bash
sudo -u dxm --preserve-env=NODE_ENV,DIGEST_CRON_SECRET,DIGEST_URL /opt/dxm-pulse/app/ops/run-digest.sh
```

### Backup creation

```bash
sudo DB_PATH=/var/lib/dxm/dxm.db BACKUP_DIR=/var/backups/dxm /opt/dxm-pulse/app/ops/backup-sqlite.sh
sqlite3 /var/backups/dxm/<latest>.db "pragma integrity_check;"
```

### Backup restore

1. Stop the API:

```bash
sudo systemctl stop dxm-api.service
```

2. Remove stale WAL/SHM files if present:

```bash
sudo rm -f /var/lib/dxm/dxm.db-wal /var/lib/dxm/dxm.db-shm
```

3. Restore the backup:

```bash
sudo cp /var/backups/dxm/<backup-file>.db /var/lib/dxm/dxm.db
sudo chown dxm:dxm /var/lib/dxm/dxm.db
```

4. Start the API and recheck health:

```bash
sudo systemctl start dxm-api.service
curl -sS https://app.dxmpulse.et/api/health
```

### Minimal rollback

```bash
cd /opt/dxm-pulse/app
git checkout <previous-known-good-commit>
export VITE_API_URL=/api
export VITE_SDK_CDN_URL=https://app.dxmpulse.et/sdk/dxm.js
npm ci
npm run build
sudo systemctl restart dxm-api.service
sudo systemctl restart caddy
```

## End-to-End Verification

### Fastest working path

1. Open `http://localhost:5173/signup`
2. Create a workspace and user
3. In onboarding, create a site
4. Copy the `data-site-id` value from the generated snippet
5. Open:

```text
http://localhost:5173/test.html?siteKey=YOUR_SITE_KEY&apiUrl=http://localhost:4000&sdkBase=http://localhost:8080
```

6. On the test page:
   - wait for the green status
   - click `Identify local user`
   - click `Track custom event`
   - click `Track conversion event`
   - click `Push SPA navigation`
   - scroll through the page
   - click several CTA buttons
   - close the tab once to trigger the final flush

### Verify ingest

In browser DevTools Network, confirm:

- `POST http://localhost:4000/collect`
- `POST http://localhost:4000/collect-replay/replay`

### Verify sessions

Open:

- `http://localhost:5173/sessions`

You should see a new recent session.

### Verify replay

Open the newest session in `/sessions` and confirm replay playback loads.

### Verify heatmaps

Open:

- `http://localhost:5173/analytics`

Stay on the Heatmaps tab and refresh once if needed.

### Verify via SQLite

```bash
sqlite3 apps/api/data/dxm.db "select id, completed, converted, total_events, clicks, scroll_depth, created_at from sessions order by created_at desc limit 5;"
sqlite3 apps/api/data/dxm.db "select session_id, type, value_text, url, created_at from events order by id desc limit 20;"
sqlite3 apps/api/data/dxm.db "select session_id, size_bytes, created_at from session_replays order by created_at desc limit 5;"
```

## Common Failure Points

### SDK watcher is running, but the browser still cannot load `dxm.js`

Cause:

- `npm run dev` rebuilds the SDK but does not serve it

Fix:

- start a separate static server from `packages/sdk/dist`
- make sure both `SDK_CDN_URL` and `VITE_SDK_CDN_URL` point to `http://localhost:8080/dxm.js`

### Frontend loads, but dashboards are blank

Common causes:

- API is not running
- `VITE_API_URL` points to the wrong base URL
- auth cookies are missing or stale
- browser requests are returning `401` or `500`
- DB is empty and no sites/sessions exist yet

Fast checks:

1. Confirm `curl http://localhost:4000/health` works
2. In DevTools Network, inspect failing requests from `/overview`, `/sites`, `/sessions`, `/alerts`, `/analytics/*`
3. Check for `401` responses from `/auth/me`
4. Log out and log back in
5. If needed, clear browser cookies for `localhost`

### Snippet shows the wrong SDK URL

Cause:

- `SDK_CDN_URL` or `VITE_SDK_CDN_URL` still points at the default non-local value

Fix:

- set both to `http://localhost:8080/dxm.js`
- restart the web and API processes after changing `.env`

## Troubleshooting Ingestion Issues

### Events are not appearing

Check in this order:

1. Confirm the test page status is green
2. Confirm `dxm.js` and `dxm-replay.js` load from `http://localhost:8080`
3. Confirm the page uses the snippet’s `data-site-id` value, not the internal `site_...` id
4. Confirm Network shows `POST /collect`
5. Wait at least 10 seconds or close the tab once to force a flush
6. Query the `events` table directly

What usually fixes it:

- wrong `siteKey`
- wrong `data-api-url`
- opening a raw file via `file://` instead of using `http://localhost:5173/test.html`

### Sessions are missing

Check in this order:

1. Confirm `/collect` requests succeed
2. Query the `sessions` table
3. Confirm you are logged into the same workspace that owns the site key
4. Confirm `/sessions` requests are not returning `401`

Useful query:

```bash
sqlite3 apps/api/data/dxm.db "select id, site_id, workspace_id, completed, total_events, created_at from sessions order by created_at desc limit 10;"
```

### Replay is not loading

Check in this order:

1. Confirm `dxm-replay.js` loads after `dxm.js`
2. Confirm Network shows `POST /collect-replay/replay`
3. Confirm `session_replays` has a row for the session
4. Interact more with the page, then close the tab once

Useful query:

```bash
sqlite3 apps/api/data/dxm.db "select session_id, size_bytes, created_at from session_replays order by created_at desc limit 10;"
```

### Heatmap is blank

Check in this order:

1. Confirm click events exist in the `events` table
2. Confirm you are viewing the authenticated analytics UI, not just the public pages
3. Refresh the analytics page once after generating test activity
4. Generate a second session if needed so the data is easier to spot

Useful query:

```bash
sqlite3 apps/api/data/dxm.db "select session_id, x, y, url, created_at from events where type = 'click' order by id desc limit 20;"
```

## Troubleshooting Frontend Issues

### The app keeps redirecting to `/login`

Likely causes:

- API is down
- `/auth/me` is failing
- cookies were not set
- `COOKIE_DOMAIN` is wrong for local development

Fix:

- keep `COOKIE_DOMAIN=localhost`
- confirm `/auth/login` or `/auth/signup` returns success
- confirm `dxm_access` cookie exists in the browser
- clear cookies and retry

### The app loads, but requests fail

Check:

- `VITE_API_URL` is `http://localhost:4000`
- `WEB_ORIGIN` is `http://localhost:5173`
- browser console for failed fetches
- API terminal logs for request errors

### The page is blank or stuck on loading

Check:

- browser console for runtime errors
- Network tab for failed JS bundles or failed API requests
- API terminal for startup failures
- web terminal for Vite compile errors

## Reset Or Reseed Local Data

### Reseed on top of an existing database

```bash
npm run seed -w apps/api
```

The seed script is idempotent for its demo workspace. It will skip if the demo data already exists.

### Reset the local database completely

Stop the dev servers first, then remove the DB file if you are using the default path:

```bash
rm -f apps/api/data/dxm.db
npm run migrate -w apps/api
npm run seed -w apps/api
```

If you use a custom `DB_PATH`, delete that file instead.

### Reset browser-side test state

If smoke tests behave oddly, clear local browser state for `localhost`:

- cookies for `localhost`
- local storage
- session storage

This is especially useful after changing site keys or auth state.

## Debug Commands

### Confirm processes are reachable

```bash
curl -sS http://localhost:4000/health
curl -I http://localhost:8080/dxm.js
curl -I http://localhost:8080/dxm-replay.js
```

### Verify the database path being used

If you are unsure which DB file the API is using, check your `.env` and confirm `DB_PATH`. With the default config, the active file is:

- `apps/api/data/dxm.db`

### Build everything

```bash
npm run build
```

## Escalation / Next Checks

If the local flow still fails after the checks above:

1. capture browser Network requests for `/auth/*`, `/collect`, `/collect-replay/replay`, `/sessions`, and `/analytics/heatmap`
2. capture the API terminal output
3. run the SQLite queries in this runbook
4. confirm the exact values of:
   - `VITE_API_URL`
   - `WEB_ORIGIN`
   - `SDK_CDN_URL`
   - `VITE_SDK_CDN_URL`
   - the `data-site-id` value being used

## Related Docs

- [Codebase Onboarding](./codebase-onboarding.md)
- [Environment Variables](./environment-variables.md)
- [API Reference](./api-reference.md)
- [SDK Integration Guide](./sdk-integration.md)
- [Local Smoke Test](./local-smoke-test.md)
