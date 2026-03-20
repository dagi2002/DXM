# Local Smoke Test

Use this guide to verify the current DXM SDK, API, sessions, replay, and heatmap flow locally.

## Required Env Vars

Set these in the repo root `.env`:

```bash
JWT_SECRET=change_this_in_production_min_32_chars
JWT_REFRESH_SECRET=different_secret_also_min_32_chars
WEB_ORIGIN=http://localhost:5173
VITE_API_URL=http://localhost:4000
SDK_CDN_URL=http://localhost:8080/dxm.js
VITE_SDK_CDN_URL=http://localhost:8080/dxm.js
```

## Commands To Run

From the repo root:

```bash
npm install
npm run migrate -w apps/api
npm run seed -w apps/api
npm run dev
```

In a second terminal, serve the built SDK files:

```bash
cd packages/sdk/dist
python3 -m http.server 8080
```

## How To Get A Site Key

1. Open `http://localhost:5173/signup`
2. Create a workspace and user
3. In onboarding, create a site
4. Copy the value inside `data-site-id` from the generated snippet

Example:

```html
<script src="http://localhost:8080/dxm.js" data-site-id="abc123xyz789" async></script>
```

The site key is `abc123xyz789`.

## How To Open The Test Page

Use the local test page served by the web app:

```text
http://localhost:5173/test.html?siteKey=YOUR_SITE_KEY&apiUrl=http://localhost:4000&sdkBase=http://localhost:8080
```

The test page lives at `apps/web/public/test.html`.

## What To Do In The Browser

On the test page:

1. Wait for the green status message
2. Click `Identify local user`
3. Click `Track custom event`
4. Click `Track conversion event`
5. Click `Push SPA navigation`
6. Scroll through the page
7. Click the CTA buttons
8. Close the tab once to trigger the final flush

## How To Verify

### Ingest

In DevTools Network, confirm:

- `POST http://localhost:4000/collect`
- `POST http://localhost:4000/collect-replay/replay`

Both should return success.

### Sessions

Open:

- `http://localhost:5173/sessions`

You should see a new recent session.

### Replay

Open the newest session in `/sessions` and confirm the replay player loads.

### Heatmaps

Open:

- `http://localhost:5173/analytics`

Stay on the Heatmaps tab and refresh once if needed.

### Optional SQLite Checks

```bash
sqlite3 apps/api/data/dxm.db "select id, completed, converted, total_events, clicks, scroll_depth, created_at from sessions order by created_at desc limit 5;"
sqlite3 apps/api/data/dxm.db "select session_id, type, value_text, url, created_at from events order by id desc limit 20;"
sqlite3 apps/api/data/dxm.db "select session_id, size_bytes, created_at from session_replays order by created_at desc limit 5;"
```

## Troubleshooting

### Script does not load

- Confirm `http://localhost:8080/dxm.js` opens directly
- Confirm `http://localhost:8080/dxm-replay.js` opens directly
- Confirm the test page URL uses `sdkBase=http://localhost:8080`

### Events do not appear

- Make sure you used the snippet’s `data-site-id`, not the internal `site_...` id
- Wait at least 10 seconds or close the tab once to force a flush
- Use `http://localhost:5173/test.html`, not `file://...`

### Replay does not load

- Confirm `/collect-replay/replay` appears in the Network tab
- Interact more: click, type, scroll, then close the tab once
- Check the `session_replays` table with the SQLite query above

### Wrong endpoint or base URL

Use these local values:

- API: `http://localhost:4000`
- SDK base: `http://localhost:8080`
- Test page: `http://localhost:5173/test.html`

The current implementation uses:

- `POST /collect`
- `POST /collect-replay/replay`
