# ADR-004 — Authentication & organizations

**Status:** Proposed · **Date:** 2026-10-04

## Context
- JWT access tokens with no refresh endpoint, so users are force-logged-out every 15 minutes.
- No revocation.
- `users.email` is globally unique, so a person can belong to only one workspace. That blocks agencies.
- Role checks are uneven, and the role lives inside the JWT, so changes go stale.

## Decision
- Use **Better Auth** (TypeScript, Drizzle adapter) with DB-backed sessions in `__Host-` cookies. Plugins: email+password (argon2id), **magic link**, **Google OAuth**, **TOTP 2FA**, and **organizations** (multi-membership, invitations, roles).
- Roles: `owner`, `admin`, `member`, `client_viewer`. A client viewer is limited to the specific sites listed in the membership. Every authorization check reads the membership live, never a stale claim.
- The session lifetime is 30 days, extended on each use. Users can see and revoke their active sessions. Logout and password reset revoke sessions server-side.
- Port the existing token discipline (32-byte random tokens, stored as sha256, single-use, with expiry) for invites and report shares.
- Accounts can be deleted, with org transfer or org deletion and a data purge.

## Consequences
Agencies can add staff to many client orgs. Clients can log in to see only their own site. The 15-minute logout bug disappears.

## Alternatives considered
- Hand-rolled sessions (Lucia-style): full control, but more code to secure.
- Clerk or Auth0: fast, but USD pricing, a data-residency problem, and they don't run on an Ethiopian VM.
