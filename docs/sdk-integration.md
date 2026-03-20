# SDK Integration Guide

DXM Pulse ships its tracking code from `packages/sdk`.

There are two scripts:

- `dxm.js`: base tracking for pageviews, clicks, scroll, navigation, and vitals
- `dxm-replay.js`: replay extension for rrweb-based session playback

Shared public contract source:

- `packages/contracts/index.js`
- `packages/contracts/index.d.ts`

## Base Install

```html
<script
  src="https://cdn.dxmpulse.com/dxm.js"
  data-site-id="YOUR_SITE_KEY"
  async
></script>
```

Optional override when self-hosting:

```html
<script
  src="https://your-cdn.example.com/dxm.js"
  data-site-id="YOUR_SITE_KEY"
  data-api-url="https://api.your-domain.com"
  async
></script>
```

## Replay Install

Load the replay extension after the base SDK:

```html
<script src="https://cdn.dxmpulse.com/dxm.js" data-site-id="YOUR_SITE_KEY" async></script>
<script src="https://cdn.dxmpulse.com/dxm-replay.js" data-site-id="YOUR_SITE_KEY" async></script>
```

## What The Base SDK Captures

- initial pageview
- clicks with coordinates and target hints
- scroll depth
- SPA navigation
- browser-native vitals such as LCP, CLS, FCP, INP, and TTFB

The base SDK is designed to:

- queue locally for unreliable networks
- batch events instead of sending one request per event
- flush on page hide and when connectivity resumes
- mark the final flush with `completed: true` so the API can finalize KPI fields

## Public API

The SDK exposes a minimal `window.dxm` object:

```js
window.dxm.track('upgrade_clicked', { plan: 'starter' });
window.dxm.identify('user_123');
```

Custom conversion events:

- sessions are marked `converted` when `window.dxm.track(...)` uses a conversion-style event name such as `purchase`, `checkout_complete`, `lead_submitted`, `trial_started`, or `signup_completed`

## API Endpoints Used

- `POST /collect`
- `POST /collect-replay/replay`

The API authenticates SDK traffic by the `data-site-id` value, which maps to a stored `site_key`.

## Source Locations

- `packages/sdk/src/dxm.js`
- `packages/sdk/src/dxm-replay.js`
- `packages/sdk/build.js`

Built output:

- `packages/sdk/dist/dxm.js`
- `packages/sdk/dist/dxm-replay.js`

## Current Constraints

- The SDK is already lightweight and resilient, but not yet at the final “fully polished production CDN package” stage
- Replay adds meaningful payload size and should be used intentionally
- DXM Pulse AI is not coupled to the SDK yet; it will consume the data the SDK already collects
- `dxm.js` now bundles a tiny shared endpoint contract to stay aligned with the API surface, which keeps the architecture cleaner but still leaves the file above the original `<2kb` target
