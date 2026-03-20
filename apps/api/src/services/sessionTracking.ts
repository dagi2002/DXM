import { CONVERSION_EVENT_KEYWORDS } from '../../../../packages/contracts/index.js';
import type {
  CollectReplayRequest,
  CollectRequest,
  SdkCollectEvent,
} from '../../../../packages/contracts/index.js';
import { db } from '../db/index.js';

export interface CollectionSite {
  id: string;
  workspaceId: string;
}

interface ExistingSessionRow {
  id: string;
  completed: number;
}

interface SessionAggregateRow {
  min_ts: number | null;
  max_ts: number | null;
  total_events: number | null;
  clicks: number | null;
  max_scroll: number | null;
  page_count: number | null;
  user_id_external: string | null;
}

interface SessionEventValueRow {
  value_text: string | null;
}

const conversionKeywords = new Set(CONVERSION_EVENT_KEYWORDS.map((keyword) => keyword.toLowerCase()));

const toSqliteDateTime = (timestamp: number) =>
  new Date(timestamp).toISOString().slice(0, 19).replace('T', ' ');

const detectDevice = (ua: string): string => {
  if (!ua) return 'desktop';
  const lowerUserAgent = ua.toLowerCase();
  if (
    lowerUserAgent.includes('mobile') ||
    lowerUserAgent.includes('android') ||
    lowerUserAgent.includes('iphone')
  ) {
    return 'mobile';
  }
  if (lowerUserAgent.includes('tablet') || lowerUserAgent.includes('ipad')) return 'tablet';
  return 'desktop';
};

const detectBrowser = (ua: string): string => {
  if (!ua) return 'Unknown';
  if (ua.includes('Firefox/')) return 'Firefox';
  if (ua.includes('Edg/')) return 'Edge';
  if (ua.includes('Chrome/')) return 'Chrome';
  if (ua.includes('Safari/')) return 'Safari';
  return 'Unknown';
};

const eventValueText = (event: SdkCollectEvent): string | null => {
  if (event.type === 'vital') return event.name && event.value != null ? `${event.name}:${event.value}` : null;
  if (event.type === 'custom') return event.event || null;
  if (event.type === 'identify') return event.userId || null;
  return null;
};

const isConversionEventName = (eventName: string | null | undefined) => {
  if (!eventName) return false;
  const normalized = eventName.trim().toLowerCase();
  if (!normalized) return false;
  if (conversionKeywords.has(normalized)) return true;
  return normalized.includes('purchase') || normalized.includes('checkout') || normalized.includes('convert');
};

export const findCollectionSite = (siteKey: string): CollectionSite | null => {
  const site = db
    .prepare('SELECT id, workspace_id FROM sites WHERE site_key = ?')
    .get(siteKey) as { id: string; workspace_id: string } | undefined;

  if (!site) return null;
  return {
    id: site.id,
    workspaceId: site.workspace_id,
  };
};

export const ingestSessionBatch = (site: CollectionSite, payload: CollectRequest) => {
  const metadata = payload.metadata ?? {};
  const ua = metadata.userAgent || '';
  const timestamps = payload.events
    .map((event) => (typeof event.ts === 'number' ? event.ts : Date.now()))
    .sort((a, b) => a - b);
  const startedAtTimestamp = timestamps[0] ?? Date.now();

  db.transaction(() => {
    const existing = db
      .prepare('SELECT id, completed FROM sessions WHERE id = ?')
      .get(payload.sessionId) as ExistingSessionRow | undefined;

    if (!existing) {
      db.prepare(`
        INSERT INTO sessions (
          id,
          site_id,
          workspace_id,
          started_at,
          user_agent,
          device,
          browser,
          language,
          screen_width,
          screen_height,
          entry_url,
          completed
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        payload.sessionId,
        site.id,
        site.workspaceId,
        toSqliteDateTime(startedAtTimestamp),
        ua || null,
        detectDevice(ua),
        detectBrowser(ua),
        metadata.language || null,
        metadata.screen?.width ?? null,
        metadata.screen?.height ?? null,
        metadata.url || null,
        payload.completed ? 1 : 0,
      );
    }

    if (payload.events.length) {
      const insertEvent = db.prepare(`
        INSERT INTO events (session_id, type, ts, x, y, scroll_depth, target, url, value_text)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const event of payload.events) {
        insertEvent.run(
          payload.sessionId,
          event.type,
          typeof event.ts === 'number' ? event.ts : Date.now(),
          event.x ?? null,
          event.y ?? null,
          event.depth ?? null,
          event.target ?? null,
          event.url ?? metadata.url ?? null,
          eventValueText(event),
        );
      }
    }

    const aggregate =
      db
      .prepare<[string], SessionAggregateRow>(`
        SELECT
          MIN(ts) as min_ts,
          MAX(ts) as max_ts,
          COUNT(*) as total_events,
          SUM(CASE WHEN type = 'click' THEN 1 ELSE 0 END) as clicks,
          MAX(CASE WHEN type = 'scroll' THEN COALESCE(scroll_depth, 0) ELSE 0 END) as max_scroll,
          COUNT(DISTINCT CASE WHEN type IN ('pageview', 'navigation') THEN NULLIF(url, '') END) as page_count,
          MAX(CASE WHEN type = 'identify' THEN value_text ELSE NULL END) as user_id_external
        FROM events
        WHERE session_id = ?
      `)
      .get(payload.sessionId) ?? {
        min_ts: null,
        max_ts: null,
        total_events: 0,
        clicks: 0,
        max_scroll: 0,
        page_count: 0,
        user_id_external: null,
      };

    const customEventNames = db
      .prepare<[string], SessionEventValueRow>(`
        SELECT value_text
        FROM events
        WHERE session_id = ? AND type = 'custom' AND value_text IS NOT NULL
      `)
      .all(payload.sessionId);

    const totalEvents = aggregate.total_events || 0;
    const clickCount = aggregate.clicks || 0;
    const maxScrollDepth = aggregate.max_scroll || 0;
    const pageCount = aggregate.page_count || 0;
    const completed = payload.completed || existing?.completed === 1 ? 1 : 0;
    const minTimestamp = aggregate.min_ts ?? startedAtTimestamp;
    const maxTimestamp = aggregate.max_ts ?? startedAtTimestamp;
    const durationSeconds = Math.max(0, Math.round((maxTimestamp - minTimestamp) / 1000));
    const bounced =
      completed && totalEvents > 0 && (totalEvents <= 2 || (pageCount <= 1 && clickCount === 0 && durationSeconds < 30))
        ? 1
        : 0;
    const converted = customEventNames.some(({ value_text }) => isConversionEventName(value_text)) ? 1 : 0;

    db.prepare(`
      UPDATE sessions SET
        started_at = COALESCE(started_at, ?),
        ended_at = ?,
        duration = ?,
        user_agent = COALESCE(user_agent, ?),
        device = ?,
        browser = ?,
        language = COALESCE(language, ?),
        screen_width = COALESCE(screen_width, ?),
        screen_height = COALESCE(screen_height, ?),
        entry_url = COALESCE(entry_url, ?),
        user_id_external = COALESCE(?, user_id_external),
        clicks = ?,
        scroll_depth = ?,
        total_events = ?,
        bounced = ?,
        converted = ?,
        completed = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      toSqliteDateTime(minTimestamp),
      completed ? toSqliteDateTime(maxTimestamp) : null,
      durationSeconds,
      ua || null,
      detectDevice(ua),
      detectBrowser(ua),
      metadata.language || null,
      metadata.screen?.width ?? null,
      metadata.screen?.height ?? null,
      metadata.url || null,
      aggregate.user_id_external ?? null,
      clickCount,
      maxScrollDepth,
      totalEvents,
      bounced,
      converted,
      completed,
      payload.sessionId,
    );
  })();
};

export const ingestReplayChunk = (site: CollectionSite, payload: CollectReplayRequest) => {
  const session = db
    .prepare('SELECT id FROM sessions WHERE id = ? AND site_id = ?')
    .get(payload.sessionId, site.id) as { id: string } | undefined;

  if (!session) {
    db.prepare(`
      INSERT INTO sessions (id, site_id, workspace_id, started_at, completed)
      VALUES (?, ?, ?, NULL, 0)
      ON CONFLICT(id) DO NOTHING
    `).run(payload.sessionId, site.id, site.workspaceId);
  }

  const existing = db
    .prepare('SELECT session_id, events_json FROM session_replays WHERE session_id = ?')
    .get(payload.sessionId) as { session_id: string; events_json: string } | undefined;

  if (existing) {
    let allEvents: unknown[] = [];
    try {
      allEvents = JSON.parse(existing.events_json);
    } catch {
      allEvents = [];
    }

    allEvents = allEvents.concat(payload.replayEvents);
    if (allEvents.length > 10000) allEvents = allEvents.slice(-10000);
    const json = JSON.stringify(allEvents);
    db.prepare('UPDATE session_replays SET events_json = ?, size_bytes = ? WHERE session_id = ?').run(
      json,
      Buffer.byteLength(json),
      payload.sessionId,
    );
  } else {
    const json = JSON.stringify(payload.replayEvents);
    db.prepare('INSERT INTO session_replays (session_id, events_json, size_bytes) VALUES (?, ?, ?)').run(
      payload.sessionId,
      json,
      Buffer.byteLength(json),
    );
  }

  return true;
};
