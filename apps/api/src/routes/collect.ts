/**
 * POST /collect — SDK data ingestion endpoint
 * Public (no auth token) — authenticated by site_key
 * Receives batched events from dxm.js
 *
 * POST /collect-replay — rrweb replay chunks
 * Public — authenticated by site_key
 */
import { Router } from 'express';
import { db } from '../db/index.js';
import { validate } from '../middleware/validate.js';
import { collectLimiter } from '../middleware/rateLimiter.js';
import { collectSchema, collectReplaySchema } from '../schemas/collectSchema.js';
import { runAlertChecks } from '../services/alertEngine.js';

const router = Router();

function detectDevice(ua: string): string {
  if (!ua) return 'desktop';
  const u = ua.toLowerCase();
  if (u.includes('mobile') || u.includes('android') || u.includes('iphone')) return 'mobile';
  if (u.includes('tablet') || u.includes('ipad')) return 'tablet';
  return 'desktop';
}

function detectBrowser(ua: string): string {
  if (!ua) return 'Unknown';
  if (ua.includes('Firefox/')) return 'Firefox';
  if (ua.includes('Edg/')) return 'Edge';
  if (ua.includes('Chrome/')) return 'Chrome';
  if (ua.includes('Safari/')) return 'Safari';
  return 'Unknown';
}

// POST /collect
router.post('/', collectLimiter, validate(collectSchema), (req, res) => {
  const { sessionId, siteId, events, metadata } = req.body;

  // Validate site key
  const site = db.prepare('SELECT id, workspace_id FROM sites WHERE site_key = ?').get(siteId) as any;
  if (!site) return res.status(404).json({ error: 'Unknown site key' });

  const ua = metadata?.userAgent || '';

  db.transaction(() => {
    // Upsert session
    const existing = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId);
    if (!existing) {
      db.prepare(`
        INSERT INTO sessions (id, site_id, workspace_id, started_at, device, browser, language,
          screen_width, screen_height, entry_url)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?)
      `).run(sessionId, site.id, site.workspace_id,
             detectDevice(ua), detectBrowser(ua),
             metadata?.language || null,
             metadata?.screen?.width || null,
             metadata?.screen?.height || null,
             metadata?.url || null);
    }

    // Insert events
    const insertEvt = db.prepare(`
      INSERT INTO events (session_id, type, ts, x, y, scroll_depth, target, url, value_text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let clicks = 0;
    let maxScroll = 0;

    for (const evt of events) {
      const ts = typeof evt.ts === 'number' ? evt.ts : Date.now();
      let valueText: string | null = null;

      if (evt.type === 'vital') valueText = `${evt.name}:${evt.value}`;
      else if (evt.type === 'custom') valueText = evt.event || null;
      else if (evt.type === 'identify') valueText = evt.userId || null;

      insertEvt.run(
        sessionId, evt.type, ts,
        evt.x ?? null, evt.y ?? null,
        evt.depth ?? null,
        evt.target ?? null,
        evt.url ?? metadata?.url ?? null,
        valueText,
      );

      if (evt.type === 'click') clicks++;
      if (evt.type === 'scroll' && evt.depth > maxScroll) maxScroll = evt.depth;
    }

    // Update session stats
    db.prepare(`
      UPDATE sessions SET
        total_events = total_events + ?,
        clicks = clicks + ?,
        scroll_depth = MAX(scroll_depth, ?),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(events.length, clicks, maxScroll, sessionId);
  })();

  // Fire alert checks asynchronously — do not await
  void runAlertChecks(site.workspace_id as string, site.id as string);

  return res.json({ ok: true });
});

// POST /collect-replay — rrweb chunk ingestion
router.post('/replay', collectLimiter, validate(collectReplaySchema), (req, res) => {
  const { sessionId, siteId, replayEvents, chunkIndex } = req.body;

  const site = db.prepare('SELECT id FROM sites WHERE site_key = ?').get(siteId) as any;
  if (!site) return res.status(404).json({ error: 'Unknown site key' });

  const existing = db.prepare('SELECT session_id, events_json FROM session_replays WHERE session_id = ?').get(sessionId) as any;

  if (existing) {
    let all: any[] = [];
    try { all = JSON.parse(existing.events_json); } catch {}
    all = all.concat(replayEvents);
    if (all.length > 10000) all = all.slice(-10000); // cap
    const json = JSON.stringify(all);
    db.prepare('UPDATE session_replays SET events_json = ?, size_bytes = ? WHERE session_id = ?')
      .run(json, Buffer.byteLength(json), sessionId);
  } else {
    const json = JSON.stringify(replayEvents);
    db.prepare('INSERT INTO session_replays (session_id, events_json, size_bytes) VALUES (?, ?, ?)')
      .run(sessionId, json, Buffer.byteLength(json));
  }

  return res.json({ ok: true, chunk: chunkIndex });
});

export default router;
