# ADR-006 — Mobile: PWA + Telegram bot first, Expo app in slice 8

**Status:** Accepted (2026-10-04) · **Date:** 2026-10-04

## Context
There is no mobile app today, and the founder wants one. The users (agency owners and SMB owners in Ethiopia) live on their phones and on Telegram. A native app adds store review, release overhead, and push infrastructure, and needs people to install it. Telegram already reaches almost everyone in the target market and costs nothing to adopt.

## Decision (recommended)
1. **v1:** the web app is a high-quality **installable PWA** (Today feed, Fix detail, replays, report sharing, web push). The **Telegram bot** carries alerts, inline actions, the weekly digest, and `/status`.
2. **Slice 8:** an **Expo (React Native) companion app** sharing `contracts`, `api-client`, `tokens`, and `i18n`. Scope: Today feed, Fix detail with replay clips (rendered by a WebView player), push notifications, report share, and quick actions. Ship it if pilot usage shows phone-first operators who aren't served by Telegram plus PWA, or if enterprise buyers expect an app.
3. **Separate track (ICP 3):** *tracking SDKs* for customers' mobile apps (React Native, Flutter) and Telegram Mini Apps. This is a different product surface and is out of v1 scope.

## Alternatives
- **Expo in v1 (founder's instinct):** about 3–4 extra weeks before the first paid pilot. The PWA plus bot covers about 90% of the value sooner.
- **Capacitor wrapper of the PWA:** cheap, but still requires store presence for little gain.
