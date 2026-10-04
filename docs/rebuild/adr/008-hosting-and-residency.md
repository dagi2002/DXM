# ADR-008 — Hosting & data residency

**Status:** Proposed — **needs founder decision** · **Date:** 2026-10-04

## Context
Ethiopia's Personal Data Protection Proclamation (2024) regulates personal data processing and cross-border transfers. Banks, fintechs, and government customers will ask where their data lives. The founder needs low ops overhead and low cost now.

## Decision (recommended)
- **Default:** a single VM at an international provider with good East Africa latency (EU-central or a Middle East/Africa region), running Docker Compose + Caddy. R2 for objects. About $20–40/month at pilot scale.
- **Residency option:** the *same* Compose stack on an Ethiopian provider's VM, with MinIO for objects, sold as part of Growth+/Enterprise. No code differences, only configuration.
- **Cross-border processing is explicit:** AI (Anthropic), email, and Sentry are listed as sub-processors. Each org can choose "AI off" or "EU-only telemetry". PII scrubbing runs before anything leaves the system.
- Legal deliverables: privacy policy, DPA template, sub-processor list, retention schedule, DPIA for session replay. **Needs review by an Ethiopian lawyer** before enterprise deals.

## Consequences
Cheap to start, and residency becomes a selling point instead of a blocker.
