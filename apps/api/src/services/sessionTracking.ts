import { CONVERSION_EVENT_KEYWORDS } from '../../../../packages/contracts/index.js';
import type {
  CollectReplayRequest,
  CollectRequest,
  SdkCollectEvent,
} from '../../../../packages/contracts/index.js';
import { db } from '../db/index.js';
import { recordJourneyMilestone } from '../lib/workspaceSignals.js';
import { sendSiteVerifiedEmail } from '../lib/mailer.js';

export interface CollectionSite {
  id: string;
  workspaceId: string;
}

interface ExistingSessionRow {
  id: string;
  started_at: string | null;
  duration: number | null;
  completed: number;
  user_id_external: string | null;
  total_events: number;
  clicks: number;
  scroll_depth: number;
  converted: number;
  page_count: number;
  entry_url: string | null;
}

interface ExistingReplayRow {
  session_id: string;
  events_json: string;
  size_bytes: number | null;
}

const conversionKeywords = new Set(CONVERSION_EVENT_KEYWORDS.map((keyword) => keyword.toLowerCase()));

const toSqliteDateTime = (timestamp: number) =>
  new Date(timestamp).toISOString().slice(0, 19).replace('T', ' ');

const fromSqliteDateTime = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const timestamp = new Date(value.replace(' ', 'T') + 'Z').getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
};

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

const normalizeTrackedUrl = (value: string | null | undefined) => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
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
  const eventTimestamps = payload.events
    .map((event) => (typeof event.ts === 'number' ? event.ts : Date.now()))
    .sort((a, b) => a - b);
  const batchStartedAtTimestamp = eventTimestamps[0] ?? Date.now();
  const batchEndedAtTimestamp = eventTimestamps[eventTimestamps.length - 1] ?? batchStartedAtTimestamp;
  const batchClickCount = payload.events.filter((event) => event.type === 'click').length;
  const batchMaxScrollDepth = payload.events.reduce((maxDepth, event) => {
    if (event.type !== 'scroll') return maxDepth;
    return Math.max(maxDepth, event.depth ?? 0);
  }, 0);
  const batchIdentifyUserId =
    [...payload.events]
      .reverse()
      .find((event) => event.type === 'identify' && typeof event.userId === 'string' && event.userId.trim())?.userId ??
    null;
  const batchConverted = payload.events.some(
    (event) => event.type === 'custom' && isConversionEventName(event.event),
  );
  const batchPageUrls = new Set(
    payload.events
      .filter((event) => event.type === 'pageview' || event.type === 'navigation')
      .map((event) => normalizeTrackedUrl(event.url ?? metadata.url))
      .filter((url): url is string => Boolean(url)),
  );

  let siteVerifiedEmail: { email: string; domain: string } | null = null;

  db.transaction(() => {
    const existing = db
      .prepare(`
        SELECT
          id,
          started_at,
          duration,
          completed,
          user_id_external,
          total_events,
          clicks,
          scroll_depth,
          converted,
          page_count,
          entry_url
        FROM sessions
        WHERE id = ?
      `)
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
          page_count,
          completed
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        payload.sessionId,
        site.id,
        site.workspaceId,
        toSqliteDateTime(batchStartedAtTimestamp),
        ua || null,
        detectDevice(ua),
        detectBrowser(ua),
        metadata.language || null,
        metadata.screen?.width ?? null,
        metadata.screen?.height ?? null,
        normalizeTrackedUrl(metadata.url),
        0,
        payload.completed ? 1 : 0,
      );

      // Check if this is the first session for this site
      const siteRow = db.prepare('SELECT first_session_at FROM sites WHERE id = ?')
        .get(site.id) as { first_session_at: string | null } | undefined;

      if (siteRow && !siteRow.first_session_at) {
        db.prepare('UPDATE sites SET first_session_at = CURRENT_TIMESTAMP WHERE id = ?').run(site.id);

        const ownerInfo = db.prepare(`
          SELECT u.email, s.domain, w.email_notifications_enabled
          FROM sites s
          JOIN workspaces w ON w.id = s.workspace_id
          JOIN users u ON u.workspace_id = w.id AND u.role = 'owner'
          WHERE s.id = ?
        `).get(site.id) as { email: string; domain: string; email_notifications_enabled: number } | undefined;

        if (ownerInfo?.email_notifications_enabled) {
          siteVerifiedEmail = { email: ownerInfo.email, domain: ownerInfo.domain };
        }
      }
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

    const existingStartedAtTimestamp = fromSqliteDateTime(existing?.started_at) ?? batchStartedAtTimestamp;
    const startedAtTimestamp = existing?.started_at
      ? Math.min(existingStartedAtTimestamp, batchStartedAtTimestamp)
      : batchStartedAtTimestamp;
    const existingDurationMilliseconds = Math.max(0, (existing?.duration ?? 0) * 1000);
    const existingLatestTimestamp = existingStartedAtTimestamp + existingDurationMilliseconds;
    const latestTimestamp = Math.max(existingLatestTimestamp, batchEndedAtTimestamp);
    const totalEvents = (existing?.total_events ?? 0) + payload.events.length;
    const clickCount = (existing?.clicks ?? 0) + batchClickCount;
    const maxScrollDepth = Math.max(existing?.scroll_depth ?? 0, batchMaxScrollDepth);
    const completed = payload.completed || existing?.completed === 1 ? 1 : 0;
    const durationSeconds = Math.max(0, Math.round((latestTimestamp - startedAtTimestamp) / 1000));
    const knownPages = new Set<string>();
    const entryUrl = normalizeTrackedUrl(existing?.entry_url ?? metadata.url);
    if (entryUrl) knownPages.add(entryUrl);
    for (const url of batchPageUrls) knownPages.add(url);
    const pageCount = Math.max(existing?.page_count ?? 0, knownPages.size);
    const bounced =
      completed && totalEvents > 0 && (totalEvents <= 2 || (pageCount <= 1 && clickCount === 0 && durationSeconds < 30))
        ? 1
        : 0;
    const converted = existing?.converted === 1 || batchConverted ? 1 : 0;

    db.prepare(`
      UPDATE sessions SET
        started_at = ?,
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
        page_count = ?,
        bounced = ?,
        converted = ?,
        completed = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      toSqliteDateTime(startedAtTimestamp),
      completed ? toSqliteDateTime(latestTimestamp) : null,
      durationSeconds,
      ua || null,
      detectDevice(ua),
      detectBrowser(ua),
      metadata.language || null,
      metadata.screen?.width ?? null,
      metadata.screen?.height ?? null,
      metadata.url || null,
      batchIdentifyUserId ?? existing?.user_id_external ?? null,
      clickCount,
      maxScrollDepth,
      totalEvents,
      pageCount,
      bounced,
      converted,
      completed,
      payload.sessionId,
    );
  })();

  if (siteVerifiedEmail) {
    sendSiteVerifiedEmail(siteVerifiedEmail.email, siteVerifiedEmail.domain)
      .catch(err => console.error('[mailer] site-verified email failed:', err));
  }

  if (payload.events.length > 0) {
    recordJourneyMilestone(site.workspaceId, 'site_live');
  }
};

export const ingestReplayChunk = (site: CollectionSite, payload: CollectReplayRequest) => {
  db.transaction(() => {
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

    let replay = db
      .prepare<[string], ExistingReplayRow>('SELECT session_id, events_json, size_bytes FROM session_replays WHERE session_id = ?')
      .get(payload.sessionId);

    if (!replay) {
      db.prepare('INSERT INTO session_replays (session_id, events_json, size_bytes) VALUES (?, ?, ?)').run(
        payload.sessionId,
        '[]',
        0,
      );
      replay = {
        session_id: payload.sessionId,
        events_json: '[]',
        size_bytes: 0,
      };
    }

    const hasStoredChunks = Boolean(
      db.prepare('SELECT 1 FROM session_replay_chunks WHERE session_id = ? LIMIT 1').get(payload.sessionId),
    );

    if (!hasStoredChunks && replay.events_json && replay.events_json !== '[]') {
      const legacySize = replay.size_bytes ?? Buffer.byteLength(replay.events_json);
      db.prepare(`
        INSERT OR IGNORE INTO session_replay_chunks (session_id, chunk_index, events_json, size_bytes)
        VALUES (?, ?, ?, ?)
      `).run(payload.sessionId, -1, replay.events_json, legacySize);
      db.prepare('UPDATE session_replays SET events_json = ?, size_bytes = ? WHERE session_id = ?').run(
        '[]',
        legacySize,
        payload.sessionId,
      );
      replay = {
        ...replay,
        events_json: '[]',
        size_bytes: legacySize,
      };
    }

    const chunkJson = JSON.stringify(payload.replayEvents);
    const chunkSize = Buffer.byteLength(chunkJson);
    const previousChunk = db
      .prepare<[string, number], { size_bytes: number | null }>(
        'SELECT size_bytes FROM session_replay_chunks WHERE session_id = ? AND chunk_index = ?',
      )
      .get(payload.sessionId, payload.chunkIndex);

    db.prepare(`
      INSERT INTO session_replay_chunks (session_id, chunk_index, events_json, size_bytes)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(session_id, chunk_index) DO UPDATE SET
        events_json = excluded.events_json,
        size_bytes = excluded.size_bytes,
        created_at = CURRENT_TIMESTAMP
    `).run(payload.sessionId, payload.chunkIndex, chunkJson, chunkSize);

    const updatedSize = Math.max(0, (replay.size_bytes ?? 0) - (previousChunk?.size_bytes ?? 0) + chunkSize);
    db.prepare('UPDATE session_replays SET events_json = ?, size_bytes = ? WHERE session_id = ?').run(
      '[]',
      updatedSize,
      payload.sessionId,
    );
  })();

  return true;
};
