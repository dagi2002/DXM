import type {
  HeatmapPoint,
  HeatmapReadModel,
  SessionDetail,
  SessionRecordingEvent,
  SessionReplay,
  SessionSummary,
} from '../../../../packages/contracts/index.js';
import { db } from '../db/index.js';

interface SessionSummaryRow {
  id: string;
  started_at: string | null;
  ended_at: string | null;
  duration: number | null;
  user_agent: string | null;
  device: string | null;
  browser: string | null;
  language: string | null;
  screen_width: number | null;
  screen_height: number | null;
  entry_url: string | null;
  user_id_external: string | null;
  clicks: number;
  scroll_depth: number;
  total_events: number;
  bounced: number;
  converted: number;
  completed: number;
  updated_at: string;
  site_domain: string | null;
  has_replay: number;
}

interface SessionEventRow {
  type: string;
  ts: number;
  x: number | null;
  y: number | null;
  scroll_depth: number | null;
  target: string | null;
  url: string | null;
  value_text: string | null;
}

interface ReplayRow {
  events_json: string;
  size_bytes: number | null;
}

const toSummary = (row: SessionSummaryRow): SessionSummary => ({
  id: row.id,
  startedAt: row.started_at ?? row.updated_at,
  endedAt: row.ended_at ?? undefined,
  duration: row.duration ?? 0,
  metadata: {
    startedAt: row.started_at ?? row.updated_at,
    userId: row.user_id_external ?? undefined,
    userAgent: row.user_agent ?? undefined,
    url: row.entry_url ?? undefined,
    language: row.language ?? undefined,
    screen:
      typeof row.screen_width === 'number' && typeof row.screen_height === 'number'
        ? { width: row.screen_width, height: row.screen_height }
        : undefined,
    device: row.device ?? undefined,
    browser: row.browser ?? undefined,
  },
  stats: {
    clicks: row.clicks,
    scrollDepth: row.scroll_depth,
    totalEvents: row.total_events,
    bounced: row.bounced === 1,
    converted: row.converted === 1,
  },
  events: [],
  updatedAt: row.updated_at,
  completed: row.completed === 1,
  hasReplay: row.has_replay === 1,
  siteDomain: row.site_domain ?? undefined,
});

const toRelativeTimestamp = (absoluteTimestamp: number, startedAt: string | null, updatedAt: string) => {
  const sessionStart = new Date(startedAt ?? updatedAt).getTime();
  if (Number.isNaN(sessionStart)) return absoluteTimestamp;
  return Math.max(0, absoluteTimestamp - sessionStart);
};

const toSessionEvent = (
  row: SessionEventRow,
  startedAt: string | null,
  updatedAt: string,
): SessionRecordingEvent => {
  const timestamp = toRelativeTimestamp(row.ts, startedAt, updatedAt);

  if (row.type === 'scroll') {
    return {
      type: 'scroll',
      timestamp,
      absoluteTimestamp: row.ts,
      x: row.x ?? undefined,
      y: row.y ?? undefined,
      scrollY: row.scroll_depth ?? undefined,
      depth: row.scroll_depth ?? undefined,
      target: row.target ?? undefined,
      url: row.url ?? undefined,
    };
  }

  if (row.type === 'click') {
    return {
      type: 'click',
      timestamp,
      absoluteTimestamp: row.ts,
      x: row.x ?? undefined,
      y: row.y ?? undefined,
      target: row.target ?? undefined,
      url: row.url ?? undefined,
    };
  }

  if (row.type === 'pageview' || row.type === 'navigation') {
    return {
      type: row.type,
      timestamp,
      absoluteTimestamp: row.ts,
      target: row.target ?? undefined,
      url: row.url ?? undefined,
    };
  }

  return {
    type: row.type === 'vital' ? 'vital' : 'custom',
    timestamp,
    absoluteTimestamp: row.ts,
    target: row.target ?? undefined,
    url: row.url ?? undefined,
    value: row.value_text ?? undefined,
  };
};

const summaryQuery = `
  SELECT
    s.id,
    s.started_at,
    s.ended_at,
    s.duration,
    s.user_agent,
    s.device,
    s.browser,
    s.language,
    s.screen_width,
    s.screen_height,
    s.entry_url,
    s.user_id_external,
    s.clicks,
    s.scroll_depth,
    s.total_events,
    s.bounced,
    s.converted,
    s.completed,
    s.updated_at,
    si.domain as site_domain,
    CASE WHEN sr.session_id IS NOT NULL THEN 1 ELSE 0 END as has_replay
  FROM sessions s
  LEFT JOIN sites si ON si.id = s.site_id
  LEFT JOIN session_replays sr ON sr.session_id = s.id
  WHERE s.workspace_id = ?
  ORDER BY COALESCE(s.started_at, s.created_at) DESC
  LIMIT 200
`;

export const listSessionSummaries = (workspaceId: string): SessionSummary[] => {
  const rows = db.prepare<[string], SessionSummaryRow>(summaryQuery).all(workspaceId);
  return rows.map(toSummary);
};

export const getSessionDetail = (workspaceId: string, sessionId: string): SessionDetail | null => {
  const row = db
    .prepare<[string, string], SessionSummaryRow>(`
      SELECT
        s.id,
        s.started_at,
        s.ended_at,
        s.duration,
        s.user_agent,
        s.device,
        s.browser,
        s.language,
        s.screen_width,
        s.screen_height,
        s.entry_url,
        s.user_id_external,
        s.clicks,
        s.scroll_depth,
        s.total_events,
        s.bounced,
        s.converted,
        s.completed,
        s.updated_at,
        si.domain as site_domain,
        CASE WHEN sr.session_id IS NOT NULL THEN 1 ELSE 0 END as has_replay
      FROM sessions s
      LEFT JOIN sites si ON si.id = s.site_id
      LEFT JOIN session_replays sr ON sr.session_id = s.id
      WHERE s.workspace_id = ? AND s.id = ?
    `)
    .get(workspaceId, sessionId);

  if (!row) return null;

  const summary = toSummary(row);
  const events = db
    .prepare<[string], SessionEventRow>(`
      SELECT type, ts, x, y, scroll_depth, target, url, value_text
      FROM events
      WHERE session_id = ?
      ORDER BY ts ASC
    `)
    .all(sessionId)
    .map((event) => toSessionEvent(event, row.started_at, row.updated_at));

  return {
    ...summary,
    events,
  };
};

export const getSessionReplay = (workspaceId: string, sessionId: string): SessionReplay | null => {
  const session = db
    .prepare<[string, string], Pick<SessionSummaryRow, 'started_at' | 'duration'>>(
      'SELECT started_at, duration FROM sessions WHERE id = ? AND workspace_id = ?',
    )
    .get(sessionId, workspaceId);

  if (!session) return null;

  const replay = db
    .prepare<[string], ReplayRow>('SELECT events_json, size_bytes FROM session_replays WHERE session_id = ?')
    .get(sessionId);

  if (!replay) return null;

  let events: SessionReplay['events'] = [];
  try {
    events = JSON.parse(replay.events_json);
  } catch {
    events = [];
  }

  const durationMs =
    typeof session.duration === 'number'
      ? session.duration * 1000
      : events.length >= 2
      ? Math.max(0, events[events.length - 1].timestamp - events[0].timestamp)
      : 0;

  return {
    sessionId,
    startedAt: session.started_at ?? new Date().toISOString(),
    duration: durationMs,
    sizeBytes: replay.size_bytes ?? 0,
    events,
  };
};

export const getHeatmapReadModel = (workspaceId: string): HeatmapReadModel => {
  const sessions = listSessionSummaries(workspaceId);

  if (!sessions.length) {
    return {
      sessions: [],
      points: [],
    };
  }

  const placeholders = sessions.map(() => '?').join(', ');
  const sessionIds = sessions.map((session) => session.id);
  const rows = db
    .prepare<any[], SessionEventRow & { session_id: string; entry_url: string | null }>(`
      SELECT e.session_id, e.type, e.ts, e.x, e.y, e.scroll_depth, e.target, e.url, e.value_text, s.entry_url
      FROM events e
      JOIN sessions s ON s.id = e.session_id
      WHERE e.session_id IN (${placeholders}) AND e.type IN ('click', 'scroll')
      ORDER BY e.ts ASC
    `)
    .all(...sessionIds);

  const points = rows.reduce<HeatmapPoint[]>((allPoints, row) => {
      const url = row.url ?? row.entry_url ?? '';
      if (!url) return allPoints;

      if (row.type === 'click') {
        allPoints.push({
          type: 'click' as const,
          sessionId: row.session_id,
          url,
          x: row.x ?? undefined,
          y: row.y ?? undefined,
          target: row.target ?? undefined,
          weight: 1,
        });
        return allPoints;
      }

      allPoints.push({
        type: 'scroll' as const,
        sessionId: row.session_id,
        url,
        depth: row.scroll_depth ?? 0,
        target: row.target ?? undefined,
        weight: 1,
      });
      return allPoints;
    }, []);

  return {
    sessions,
    points,
  };
};
