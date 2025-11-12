import express from 'express';
import cors from 'cors';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '5mb' }));

const dataPath = join(__dirname, 'data.json');
const sessionsPath = join(__dirname, 'sessions.json');


const readJson = (path, fallback) => {
  try {
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
};

const writeJson = (path, data) => {
  writeFileSync(path, JSON.stringify(data, null, 2));
};

const ensureSessionsFile = () => {
  if (!existsSync(sessionsPath)) {
    writeJson(sessionsPath, { sessions: [] });
  }
};

const getData = () => readJson(dataPath, { sessions: [], metrics: [], alerts: [], users: [] });

const getSessions = () => {
  ensureSessionsFile();
  const data = readJson(sessionsPath, { sessions: [] });
  return Array.isArray(data.sessions) ? data.sessions : [];
};

const saveSessions = (sessions) => {
  ensureSessionsFile();
  writeJson(sessionsPath, { sessions });
};

const detectDevice = (userAgent = '') => {
  const ua = userAgent.toLowerCase();
  if (ua.includes('mobile')) return 'mobile';
  if (ua.includes('tablet') || ua.includes('ipad')) return 'tablet';
  return 'desktop';
};

const detectBrowser = (userAgent = '') => {
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Edg')) return 'Edge';
  if (userAgent.includes('Chrome')) return 'Chrome';
  if (userAgent.includes('Safari')) return 'Safari';
  return 'Unknown';
};

const summariseSession = (session) => {
  const {
    id,
    startedAt,
    endedAt,
    completed = false,
    metadata = {},
    events = [],
    updatedAt
  } = session;

  const sortedEvents = [...events].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
  const lastEventTimestamp = sortedEvents.length ? sortedEvents[sortedEvents.length - 1].timestamp ?? 0 : 0;

  const endTimestamp = endedAt
    ? new Date(endedAt).getTime()
    : completed
      ? new Date(startedAt).getTime() + lastEventTimestamp
      : undefined;

  const durationMs = endTimestamp
    ? Math.max(0, endTimestamp - new Date(startedAt).getTime())
    : Math.max(0, lastEventTimestamp);

  const clicks = sortedEvents.filter(event => event.type === 'click').length;
  const scrollDepth = sortedEvents.reduce((max, event) => {
    if (event.type !== 'scroll') return max;
    const scrollY = typeof event.scrollY === 'number' ? event.scrollY : 0;
    return Math.max(max, scrollY);
  }, 0);

  return {
    id,
    startedAt,
    endedAt: endTimestamp ? new Date(endTimestamp).toISOString() : undefined,
    duration: Math.round(durationMs / 1000),
    metadata: {
      ...metadata,
      device: metadata.device ?? detectDevice(metadata.userAgent),
      browser: metadata.browser ?? detectBrowser(metadata.userAgent),
    },
    stats: {
      clicks,
      scrollDepth,
      totalEvents: sortedEvents.length,
    },
    events: sortedEvents,
    updatedAt: updatedAt ?? new Date().toISOString(),
    completed,
  };
};

app.get('/', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/sessions', (_req, res) => {
  const sessions = getSessions().map(summariseSession);
  res.json(sessions);
});

app.get('/sessions/:id', (req, res) => {
  const sessions = getSessions();
  const session = sessions.find(item => item.id === req.params.id);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json(summariseSession(session));
});

app.post('/sessions', (req, res) => {
  const { sessionId, events = [], metadata, completed = false, startedAt, endedAt } = req.body ?? {};

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }

  const sessions = getSessions();
  const now = new Date().toISOString();
  const normalisedEvents = Array.isArray(events)
    ? events
        .map(event => ({
          type: event.type,
          timestamp: typeof event.timestamp === 'number' ? event.timestamp : 0,
          x: typeof event.x === 'number' ? event.x : undefined,
          y: typeof event.y === 'number' ? event.y : undefined,
          scrollX: typeof event.scrollX === 'number' ? event.scrollX : undefined,
          scrollY: typeof event.scrollY === 'number' ? event.scrollY : undefined,
          target: typeof event.target === 'string' ? event.target : undefined,
        }))
        .filter(event => Boolean(event.type))
    : [];

  let session = sessions.find(item => item.id === sessionId);

  if (!session) {
    session = {
      id: sessionId,
      startedAt: startedAt ?? metadata?.startedAt ?? now,
      metadata: metadata ? { ...metadata } : {},
      events: [],
      completed: false,
      createdAt: now,
      updatedAt: now,
    };
    sessions.push(session);
  }

  if (metadata) {
  session.metadata = {
    ...session.metadata,
    ...metadata,
    url: metadata.url ?? session.metadata.url ?? req.headers.origin ?? "Unknown URL",
    userId: metadata.userId ?? session.metadata.userId ?? null,
    device: metadata.device ?? detectDevice(metadata.userAgent),
    browser: metadata.browser ?? detectBrowser(metadata.userAgent),
    language: metadata.language ?? session.metadata.language ?? req.headers["accept-language"] ?? "Unknown locale",
    screen: metadata.screen ?? session.metadata.screen ?? { width: 1440, height: 900 },
  };
}


  if (normalisedEvents.length) {
    session.events = [...(session.events ?? []), ...normalisedEvents].sort(
      (a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0)
    );
  }

  session.completed = completed ? true : session.completed;
  if (endedAt || completed) {
    session.endedAt = endedAt ?? now;
  }

  session.updatedAt = now;

  saveSessions(sessions);

  res.json({ status: 'ok' });
});

app.get('/metrics', (_req, res) => {
  const data = getData();
  res.json(data.metrics || []);
});

app.get('/alerts', (_req, res) => {
  const data = getData();
  res.json(data.alerts || []);
});

app.get('/users', (_req, res) => {
  const data = getData();
  res.json(data.users || []);
});

app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});