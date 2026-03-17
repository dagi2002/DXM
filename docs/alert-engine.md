# Alert Engine

The alert engine (`apps/api/src/services/alertEngine.ts`) automatically detects user experience problems and creates alerts without any manual configuration.

---

## How It Works

The alert engine runs **asynchronously** after every event batch is ingested via `POST /collect`. It is fire-and-forget — it does not block the collect response.

```typescript
// In routes/collect.ts, after inserting events:
void runAlertChecks(site.workspace_id, site.id);
```

Each call to `runAlertChecks` runs three independent checks:

1. **Rage Click Detection**
2. **Slow LCP Detection**
3. **High Bounce Rate Detection**

---

## Alert Types

### 1. Rage Click Detection

**Trigger:** 3 or more clicks on the same CSS target within a 2-second window.

**What it catches:** Broken buttons, unresponsive elements, confusing UI that users frantically click.

**Logic:**
```sql
SELECT target, COUNT(*) as click_count
FROM events
WHERE session_id IN (
  SELECT id FROM sessions WHERE workspace_id = ? AND site_id = ?
)
AND type = 'click'
AND ts >= (unixepoch('now') * 1000 - 2000)  -- last 2 seconds
GROUP BY target
HAVING click_count >= 3
LIMIT 1
```

**Alert properties:**
- Type: `frustration`
- Severity: `high`
- Title: `Rage clicks detected on [target]`

---

### 2. Slow LCP Detection

**Trigger:** Average Largest Contentful Paint (LCP) exceeds **4,000 ms** over the last 30 minutes.

**What it catches:** Slow page loads that degrade SEO and user experience. Google's "poor" threshold is 4000ms.

**Logic:**
```sql
SELECT AVG(CAST(value_text AS REAL)) as avg_lcp
FROM events
WHERE type = 'vital'
AND target = 'LCP'
AND session_id IN (
  SELECT id FROM sessions WHERE workspace_id = ? AND site_id = ?
  AND created_at >= datetime('now', '-30 minutes')
)
```

**Alert properties:**
- Type: `performance`
- Severity: `high`
- Title: `Slow LCP detected: [value]ms average (last 30 min)`

---

### 3. High Bounce Rate Detection

**Trigger:** Bounce rate exceeds **70%** over the last 2 hours (minimum 10 sessions required).

**What it catches:** Landing pages or flows where users leave immediately without engaging.

**Logic:**
```sql
SELECT
  COUNT(*) as total,
  SUM(bounced) as bounces
FROM sessions
WHERE workspace_id = ? AND site_id = ?
AND created_at >= datetime('now', '-2 hours')
```

Bounce rate = `(bounces / total) * 100`

**Alert properties:**
- Type: `conversion`
- Severity: `medium`
- Title: `High bounce rate: [rate]% (last 2 hours)`

---

## Deduplication

Before creating any alert, the engine checks if an **open alert of the same type already exists** for the workspace and site:

```sql
SELECT id FROM alerts
WHERE workspace_id = ? AND site_id = ? AND type = ? AND resolved = 0
LIMIT 1
```

If a matching open alert exists, no new alert is created. This prevents alert storms when a problem persists across multiple event batches.

---

## Telegram Notifications

When an alert is created, the engine optionally sends a Telegram message.

**Priority:** workspace-level bot token → `TELEGRAM_DEFAULT_BOT_TOKEN` env var.

**Message format:**
```
🚨 DXM Pulse Alert

High Bounce Rate: 78% (last 2 hours)

Workspace: Acme Corp
Severity: medium
```

The `telegram_sent` flag is set on the alert row to `1` after a successful notification.

If no Telegram credentials are configured, alerts are still created in the database — only the push notification is skipped.

---

## Adding New Alert Types

To add a new detection rule, add a new async function in `alertEngine.ts` and call it inside `runAlertChecks`:

```typescript
async function checkNewPattern(workspaceId: string, siteId: string): Promise<void> {
  // 1. Query events/sessions for the pattern
  const result = db.prepare(`SELECT ...`).get(workspaceId, siteId);

  // 2. Check threshold
  if (!result || result.value < THRESHOLD) return;

  // 3. Deduplicate
  const existing = db.prepare(
    `SELECT id FROM alerts WHERE workspace_id=? AND site_id=? AND type=? AND resolved=0`
  ).get(workspaceId, siteId, 'your_type');
  if (existing) return;

  // 4. Create alert
  const alert = {
    id: crypto.randomUUID(),
    workspace_id: workspaceId,
    site_id: siteId,
    type: 'your_type',   // error | performance | frustration | conversion
    severity: 'medium',  // low | medium | high | critical
    title: `Your alert title`,
    description: `Details about what was detected`,
  };
  db.prepare(`INSERT INTO alerts (...) VALUES (...)`).run(alert);

  // 5. Telegram
  await sendTelegramAlert(workspaceId, alert);
}

// Add to runAlertChecks:
export async function runAlertChecks(workspaceId: string, siteId: string): Promise<void> {
  await Promise.allSettled([
    checkRageClicks(workspaceId, siteId),
    checkSlowLCP(workspaceId, siteId),
    checkHighBounceRate(workspaceId, siteId),
    checkNewPattern(workspaceId, siteId),  // ← add here
  ]);
}
```

---

## Alert Severity Guide

| Severity | Use for |
|---|---|
| `critical` | Site down, data loss, payment failures |
| `high` | Rage clicks, LCP > 4s, error rate spike |
| `medium` | High bounce rate, slow FID, funnel drop |
| `low` | Minor anomalies, informational notices |

---

## Resolving Alerts

Alerts can be resolved via the dashboard (Alerts view → Resolve button) or directly via the API:

```bash
PATCH /alerts/:id/resolve
```

Once resolved, the alert's `resolved` flag is set to `1` and `resolved_at` is recorded. A new alert of the same type can be created after resolution if the problem recurs.
