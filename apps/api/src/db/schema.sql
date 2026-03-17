-- DXM Pulse — SQLite Schema
-- Run via: ts-node src/db/migrate.ts (safe to re-run — uses IF NOT EXISTS)

CREATE TABLE IF NOT EXISTS workspaces (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  plan                TEXT NOT NULL DEFAULT 'free',       -- free | starter | pro
  billing_status      TEXT NOT NULL DEFAULT 'active',     -- active | past_due | cancelled
  telegram_chat_id    TEXT,
  telegram_bot_token  TEXT,
  chapa_customer_id   TEXT,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id                  TEXT PRIMARY KEY,
  workspace_id        TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  email               TEXT NOT NULL UNIQUE,
  password_hash       TEXT NOT NULL,
  role                TEXT NOT NULL DEFAULT 'viewer',     -- owner | admin | viewer
  avatar              TEXT,
  last_login          DATETIME,
  refresh_token_hash  TEXT,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sites (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  domain       TEXT NOT NULL,
  site_key     TEXT NOT NULL UNIQUE,   -- data-site-id used in SDK script tag
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id               TEXT PRIMARY KEY,
  site_id          TEXT NOT NULL REFERENCES sites(id),
  workspace_id     TEXT NOT NULL REFERENCES workspaces(id),
  started_at       DATETIME,
  ended_at         DATETIME,
  duration         INTEGER,            -- seconds
  user_agent       TEXT,
  device           TEXT,               -- desktop | mobile | tablet
  browser          TEXT,
  language         TEXT,
  screen_width     INTEGER,
  screen_height    INTEGER,
  entry_url        TEXT,
  user_id_external TEXT,
  clicks           INTEGER NOT NULL DEFAULT 0,
  scroll_depth     INTEGER NOT NULL DEFAULT 0,
  total_events     INTEGER NOT NULL DEFAULT 0,
  bounced          INTEGER NOT NULL DEFAULT 0,  -- 0/1 boolean
  converted        INTEGER NOT NULL DEFAULT 0,
  completed        INTEGER NOT NULL DEFAULT 0,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,          -- pageview | click | scroll | navigation | vital | custom | identify
  ts           INTEGER NOT NULL,       -- epoch ms (from SDK)
  x            INTEGER,
  y            INTEGER,
  scroll_depth INTEGER,
  target       TEXT,
  url          TEXT,
  value_text   TEXT,                   -- vital value, custom event name, identify userId, etc.
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS session_replays (
  session_id   TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  events_json  TEXT NOT NULL,          -- JSON array of rrweb events
  size_bytes   INTEGER,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alerts (
  id                TEXT PRIMARY KEY,
  workspace_id      TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  site_id           TEXT REFERENCES sites(id),
  type              TEXT NOT NULL,     -- error | performance | frustration | conversion
  severity          TEXT NOT NULL,     -- low | medium | high | critical
  title             TEXT NOT NULL,
  description       TEXT,
  resolved          INTEGER NOT NULL DEFAULT 0,
  affected_sessions INTEGER NOT NULL DEFAULT 0,
  telegram_sent     INTEGER NOT NULL DEFAULT 0,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at       DATETIME
);

CREATE TABLE IF NOT EXISTS funnels (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  site_id      TEXT REFERENCES sites(id),
  name         TEXT NOT NULL,
  steps_json   TEXT NOT NULL,          -- JSON: [{ name, urlPattern }]
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sessions_site      ON sessions(site_id);
CREATE INDEX IF NOT EXISTS idx_sessions_created   ON sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_events_session     ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_type        ON events(type);
CREATE INDEX IF NOT EXISTS idx_alerts_workspace   ON alerts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_alerts_resolved    ON alerts(resolved);
CREATE INDEX IF NOT EXISTS idx_users_email        ON users(email);
CREATE INDEX IF NOT EXISTS idx_sites_key          ON sites(site_key);
