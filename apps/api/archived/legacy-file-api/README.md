## Archived legacy file-based API prototype

This folder contains the pre-SQLite/file-backed DXM Pulse API prototype that lived beside the real Express + SQLite app.

Archived on 2026-03-20 during the technical-debt cleanup pass because:

- it is not referenced by `apps/api/package.json` scripts
- it is not part of the live `src/index.ts` / `src/app.ts` boot path
- it still encodes obsolete `/sessions` write behavior and old sample data shapes

Files kept here only for historical reference:

- `server.js`
- `data.json`
- `sessions.json`
- `seedUserFlows.js`

Do not use this folder as a source of truth for current DXM Pulse behavior.
