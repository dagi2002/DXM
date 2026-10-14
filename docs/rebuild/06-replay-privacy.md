# 06 — Session replay: privacy, storage and retention

Slice 4 records visits as session replays. This note says what is captured, what never is, where it is stored, and how it is deleted. Share it with customers who ask "what does Pulse record about my visitors?"

## When recording happens

- **Only with consent.** The recorder (`r.js`) is a separate file. `p.js` loads it only when tracking consent is `granted`. Sites using `data-consent="required"`, and visitors sending Global Privacy Control, are not recorded until consent is given. If consent is withdrawn (`dxm('consent','denied')`), recording stops and the unsent buffer is dropped.
- **Only sampled visits.** Each site has a `replay_sample_rate` (0–1, default 1 = every visit; change it with `PATCH /api/v1/sites/:id`). The decision is a hash of the visit id, so a visit is either recorded on every page or on none. The collector enforces the same rate, so a modified script can't upload unsampled visits.
- **Site owners can switch it off** client-side with `data-replay="off"` on the snippet, or by setting the rate to 0.
- Visitors who set `localStorage.pulse_optout = '1'` (site owners excluding themselves) load nothing at all.

## Masking defaults (in the browser, before anything is sent)

- **All text is masked** (`maskTextSelector: '*'`): every character becomes `*`, keeping the word shapes so the layout still makes sense.
- **All input values are masked** (`maskAllInputs`), including selects and text areas.
- **Allowlist:** owners can unmask navigation, product names or buttons by adding `data-dxm-unmask` to an element (it applies to the element and everything inside it). **Password fields stay masked even inside an unmasked area.**
- **Blocklist:** `data-dxm-block` drops an element from the recording entirely (it appears as an empty box).
- No canvas, no inline images, no fonts are captured. Images and stylesheets are referenced by URL and loaded by the dashboard at playback time.
- The page URL in the recording goes through the same scrubbing as events: only the path (with emails, phone numbers, long ids and tokens masked) and UTM tags are kept; other query parameters and fragments are dropped.
- Recorded scripts never run during playback: rrweb strips them, and the player iframe is sandboxed without script permission.

Tests: `packages/sdk/src/replay.test.ts` pins the options and mask functions; `apps/web/e2e/replays.spec.ts` records a real page in Chromium and checks the **stored bytes** contain neither the typed phone number nor the masked personal details, while the unmasked card is readable.

## Storage

- Chunks are gzip'd JSON (≤ 512 KB each, ≤ 8 MB inflated) written through the `BlobStore` interface (`packages/storage`) at `orgs/{org}/sites/{site}/visits/{visit}/{seq}.json.gz`.
- **Today: local disk** (`BLOB_STORE=local`, files under `REPLAY_DIR`; in production a Docker volume shared by collector, worker and API).
- **Moving to S3 / Cloudflare R2 / MinIO is configuration only:** `BLOB_STORE=s3` plus `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`. Copy the existing folder tree into the bucket with the same keys. (With S3, the API hands the player short-lived signed URLs; add the bucket host to the dashboard CSP `connect-src` and allow the app origin in the bucket's CORS.)
- The database holds metadata only (`replay_chunks`: visit, seq, size, key, time range), under row-level security like every other org table.
- Only owners, admins and members can watch replays. Client viewers cannot.

## Retention

- Replays are deleted after **30 days** by default (`REPLAY_RETENTION_DAYS`). The worker's daily `maintenance.replay-retention` job deletes the rows and then the blobs, in batches.
- A deleted site's replays disappear from the dashboard immediately and are removed by retention like any other (a site purge job, when it exists, should also call `deletePrefix(orgs/{org}/sites/{site}/)`).

## Deleting one visitor's recording

When a visitor asks to be forgotten, an owner or admin calls `DELETE /api/v1/replays/:visitId` (the visit id is in the replay URL). It deletes the rows and every blob of that visit, and writes `replay.delete` to the audit log. (A button in the player is a follow-up.)
