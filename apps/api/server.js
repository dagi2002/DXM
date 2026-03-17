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

const normalisePageValue = (value) => {
  if (typeof value !== 'string') return null;

  let raw = value.trim();
  if (!raw) return null;

  raw = raw.replace(/^(?:route|page|path|screen|view|nav|goto)[:=\-]?/i, '').trim();
  if (!raw) return null;

  const normaliseOutput = (path) => {
    if (!path) return '/';
    const trimmed = path.trim();
    if (!trimmed) {
      return '/';
    }
    if (trimmed === '/') {
      return '/';
    }
    return trimmed.replace(/\/+$/u, '') || '/';
  };

  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      if (url.hash && url.hash.startsWith('#/')) {
        return normaliseOutput(url.hash.slice(1));
      }
      return normaliseOutput(url.pathname || '/');
    } catch (error) {
      return null;
    }
  }

  if (raw.startsWith('//')) {
    try {
      const url = new URL(`https:${raw}`);
      if (url.hash && url.hash.startsWith('#/')) {
        return normaliseOutput(url.hash.slice(1));
      }
      return normaliseOutput(url.pathname || '/');
    } catch (error) {
      return null;
    }
  }

  const hashRouteIndex = raw.indexOf('#/');
  if (hashRouteIndex >= 0) {
    raw = raw.slice(hashRouteIndex + 1);
  }

  const queryIndex = raw.indexOf('?');
  if (queryIndex >= 0) {
    raw = raw.slice(0, queryIndex);
  }

  const hashIndex = raw.indexOf('#');
  if (hashIndex >= 0) {
    raw = raw.slice(0, hashIndex);
  }

  if (raw.startsWith('/')) {
    return normaliseOutput(raw);
  }

  const slashIndex = raw.indexOf('/');
  if (slashIndex >= 0) {
    const candidate = raw.slice(slashIndex);
    return normaliseOutput(candidate.startsWith('/') ? candidate : `/${candidate}`);
  }

  return null;
};

const extractPageFromEvent = (event) => {
  if (!event || typeof event !== 'object') return null;

  const candidates = [event.target, event.url, event.href, event.location];
  for (const candidate of candidates) {
    const page = normalisePageValue(candidate);
    if (page) {
      return page;
    }
  }

  return null;
};

const buildUserFlow = (sessions) => {
  const flows = new Map();

  const ensureEntry = (page) => {
    if (!flows.has(page)) {
      flows.set(page, {
        users: 0,
        transitions: new Map(),
        totalTransitions: 0,
      });
    }
    return flows.get(page);
  };

  for (const session of sessions) {
    const events = Array.isArray(session.events)
      ? [...session.events].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
      : [];

    const pageSequence = [];
    const pushPage = (page) => {
      if (!page) return;
      if (pageSequence.length && pageSequence[pageSequence.length - 1] === page) {
        return;
      }
      pageSequence.push(page);
    };

    const initialPage = normalisePageValue(session.metadata?.url);
    if (initialPage) {
      pushPage(initialPage);
    }

    for (const event of events) {
      const page = extractPageFromEvent(event);
      if (page) {
        pushPage(page);
      }
    }

    if (!pageSequence.length) {
      continue;
    }

    const uniquePages = new Set(pageSequence);
    for (const page of uniquePages) {
      const entry = ensureEntry(page);
      entry.users += 1;
    }

    for (let index = 0; index < pageSequence.length; index += 1) {
      const current = pageSequence[index];
      const next = pageSequence[index + 1] ?? 'exit';
      const entry = ensureEntry(current);
      entry.totalTransitions += 1;
      entry.transitions.set(next, (entry.transitions.get(next) ?? 0) + 1);
    }
  }

  return Array.from(flows.entries()).map(([page, entry]) => {
    const transitions = Array.from(entry.transitions.entries());
    const next = transitions
      .map(([target, count]) => ({
        target,
        percent: entry.totalTransitions ? Math.round((count / entry.totalTransitions) * 100) : 0,
      }))
      .sort((a, b) => b.percent - a.percent);

    return {
      page,
      users: entry.users,
      next,
    };
  }).sort((a, b) => b.users - a.users);
};

app.get('/', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/sessions', (_req, res) => {
  const sessions = getSessions().map(summariseSession);
  res.json(sessions);
});

app.get('/userflow', (_req, res) => {
  const sessions = getSessions();
  const flow = buildUserFlow(sessions);
  // FUTURE: Add Path Conversion Impact (P10: AI Insight Engine)
  // <DXM_INSERT_ANALYTICS>
  res.json(flow);
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