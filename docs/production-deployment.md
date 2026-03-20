# Production Deployment

This guide documents the smallest reliable production target for DXM Pulse: one Linux VM, one public hostname, local persistent SQLite storage, Caddy for HTTPS + static hosting, and `systemd` for the API and weekly digest timer.

## Baseline Shape

- Public host: `https://app.dxmpulse.et`
- Web app: served from `/`
- API: reverse proxied under `/api`
- SDK files: served under `/sdk/*`
- Database: local SQLite file at `/var/lib/dxm/dxm.db`
- Runtime: full repo checkout at `/opt/dxm-pulse/app`

This guide assumes the VM timezone is `Africa/Addis_Ababa` so the weekly digest timer runs at the expected local time.

## Prerequisites

Install these packages on the VM:

- Node `22.21.1` from [.nvmrc](/Users/dagemamogne/Downloads/ARC%20Downloads/project%202/.nvmrc)
- npm
- Caddy
- sqlite3

## Create the Runtime User and Directories

```bash
sudo useradd --system --create-home --shell /bin/bash dxm
sudo mkdir -p /opt/dxm-pulse/app
sudo mkdir -p /var/lib/dxm
sudo mkdir -p /var/backups/dxm
sudo chown -R dxm:dxm /opt/dxm-pulse /var/lib/dxm /var/backups/dxm
```

## Clone and Build the Repo

```bash
sudo -u dxm git clone <your-repo-url> /opt/dxm-pulse/app
cd /opt/dxm-pulse/app
npm ci
```

Before building the web bundle, export the production Vite variables:

```bash
export VITE_API_URL=/api
export VITE_SDK_CDN_URL=https://app.dxmpulse.et/sdk/dxm.js
npm run build
```

This produces:

- `apps/api/dist`
- `apps/web/dist`
- `packages/sdk/dist`

## Create the Production Environment File

Create `/etc/dxm-pulse.env` with production values:

```bash
NODE_ENV=production
PORT=4000
DB_PATH=/var/lib/dxm/dxm.db
WEB_ORIGIN=https://app.dxmpulse.et
COOKIE_DOMAIN=app.dxmpulse.et
SDK_CDN_URL=https://app.dxmpulse.et/sdk/dxm.js
API_PUBLIC_URL=https://app.dxmpulse.et/api
JWT_SECRET=change_this_in_production_min_32_chars
JWT_REFRESH_SECRET=different_secret_also_min_32_chars
DIGEST_CRON_SECRET=change_this_digest_secret_in_production
```

Notes:

- the API reads runtime env from `/etc/dxm-pulse.env`
- the web build uses `VITE_*` env at build time, so keep the `export` step before `npm run build`
- deploy from a full repo checkout because the API startup path still reads the schema SQL from the repo tree

## Install the Deployment Assets

Copy the repo templates into system locations:

```bash
sudo cp /opt/dxm-pulse/app/ops/systemd/dxm-api.service /etc/systemd/system/dxm-api.service
sudo cp /opt/dxm-pulse/app/ops/systemd/dxm-digest.service /etc/systemd/system/dxm-digest.service
sudo cp /opt/dxm-pulse/app/ops/systemd/dxm-digest.timer /etc/systemd/system/dxm-digest.timer
sudo cp /opt/dxm-pulse/app/ops/caddy/Caddyfile.production.example /etc/caddy/Caddyfile
```

Ensure the ops scripts are executable:

```bash
sudo chmod +x /opt/dxm-pulse/app/ops/run-digest.sh
sudo chmod +x /opt/dxm-pulse/app/ops/backup-sqlite.sh
```

Update `/etc/caddy/Caddyfile` to replace `app.example.com` with your real hostname.

## Enable Services

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now dxm-api.service
sudo systemctl enable --now dxm-digest.timer
sudo systemctl restart caddy
```

## First Verification

Local API health:

```bash
curl -sS http://127.0.0.1:4000/health
```

External API health:

```bash
curl -sS https://app.dxmpulse.et/api/health
```

SDK hosting:

```bash
curl -I https://app.dxmpulse.et/sdk/dxm.js
curl -I https://app.dxmpulse.et/sdk/dxm-replay.js
```

Timer registration:

```bash
systemctl list-timers dxm-digest.timer
```

Manual digest trigger:

```bash
sudo -u dxm --preserve-env=NODE_ENV,DIGEST_CRON_SECRET,DIGEST_URL /opt/dxm-pulse/app/ops/run-digest.sh
```

Manual SQLite backup:

```bash
sudo DB_PATH=/var/lib/dxm/dxm.db BACKUP_DIR=/var/backups/dxm /opt/dxm-pulse/app/ops/backup-sqlite.sh
sqlite3 /var/backups/dxm/<latest>.db "pragma integrity_check;"
```

## Expected URL Layout

- `https://app.dxmpulse.et/` -> web app
- `https://app.dxmpulse.et/api/health` -> API health
- `https://app.dxmpulse.et/sdk/dxm.js` -> SDK script
- `https://app.dxmpulse.et/sdk/dxm-replay.js` -> replay extension

## Notes

- `dxm-digest.timer` uses `OnCalendar=Mon 08:00`
- the timer follows the VM timezone, so set the VM to `Africa/Addis_Ababa`
- this baseline intentionally does not add Docker, PostgreSQL, queues, or automated deployment
