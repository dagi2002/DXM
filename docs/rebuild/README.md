# DXM Pulse Rebuild — Phase 0 & 1 deliverables

| Doc | What it is |
|---|---|
| [00-audit.md](./00-audit.md) | Full audit with grades, evidence, top findings, and a **hotfix list** to make the current app safe for pilots |
| [01-product-brief.md](./01-product-brief.md) | Positioning, ICPs, jobs to be done, core loop, v1 scope, pricing hypothesis, 90-day go-to-market |
| [02-design-system.md](./02-design-system.md) + [design-system.html](./design-system.html) | "Pulse" design system: tokens, type (Inter + Noto Sans Ethiopic), components, localization rules. Open the HTML in a browser. |
| [03-architecture.md](./03-architecture.md) + [adr/](./adr) | Target architecture and 12 decision records |
| [04-migration-plan.md](./04-migration-plan.md) | URL/SDK compatibility, SQLite → Postgres, cutover and rollback |
| [05-behavior-contracts.md](./05-behavior-contracts.md) | 45 behavior contracts from the 138 existing tests that the rebuild must preserve (or deliberately change) |
| [progress.md](./progress.md) | Running log of decisions and status |

Source prompt: [`../rebuild-prompt.md`](../rebuild-prompt.md).
