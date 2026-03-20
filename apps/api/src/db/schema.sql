-- DXM Pulse — SQLite Schema
-- Run via: ts-node src/db/migrate.ts (safe to re-run — uses IF NOT EXISTS)

CREATE TABLE IF NOT EXISTS workspaces (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  plan                TEXT NOT NULL DEFAULT 'free',       -- free | starter | pro
  billing_status      TEXT NOT NULL DEFAULT 'active',     -- active | past_due | cancelled
  telegram_chat_id    TEXT,
  telegram_bot_token  TEXT,
  digest_enabled      INTEGER NOT NULL DEFAULT 0,
  digest_language     TEXT NOT NULL DEFAULT 'en',
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
  page_count       INTEGER NOT NULL DEFAULT 0,
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
  events_json  TEXT NOT NULL,          -- legacy fallback blob, kept as [] for new writes
  size_bytes   INTEGER,                -- total replay payload size across stored chunks
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS session_replay_chunks (
  session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  chunk_index  INTEGER NOT NULL,
  events_json  TEXT NOT NULL,
  size_bytes   INTEGER NOT NULL DEFAULT 0,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (session_id, chunk_index)
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

CREATE TABLE IF NOT EXISTS ai_artifacts (
  id             TEXT PRIMARY KEY,
  workspace_id   TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  site_id        TEXT REFERENCES sites(id) ON DELETE CASCADE,
  entity_type    TEXT NOT NULL,    -- workspace | site | alert | funnel | session | report
  entity_id      TEXT NOT NULL,
  artifact_kind  TEXT NOT NULL,    -- overview_brief
  period_key     TEXT NOT NULL,    -- 7d
  status         TEXT NOT NULL DEFAULT 'ready', -- ready | error | building
  generator_type TEXT NOT NULL DEFAULT 'deterministic', -- deterministic | llm
  input_hash     TEXT NOT NULL,
  evidence_json  TEXT NOT NULL,
  output_json    TEXT NOT NULL,
  last_error     TEXT,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at     DATETIME NOT NULL
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sessions_site      ON sessions(site_id);
CREATE INDEX IF NOT EXISTS idx_sessions_created   ON sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_workspace_created ON sessions(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_site_created ON sessions(site_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_workspace_site_created ON sessions(workspace_id, site_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_session     ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_type        ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_session_ts ON events(session_id, ts ASC);
CREATE INDEX IF NOT EXISTS idx_events_session_type_ts ON events(session_id, type, ts ASC);
CREATE INDEX IF NOT EXISTS idx_events_type_created_session ON events(type, created_at DESC, session_id);
CREATE INDEX IF NOT EXISTS idx_alerts_workspace   ON alerts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_alerts_resolved    ON alerts(resolved);
CREATE INDEX IF NOT EXISTS idx_alerts_workspace_site_resolved_created ON alerts(workspace_id, site_id, resolved, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_email        ON users(email);
CREATE INDEX IF NOT EXISTS idx_sites_key          ON sites(site_key);
CREATE INDEX IF NOT EXISTS idx_sites_workspace_created ON sites(workspace_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_ai_artifacts_scope
  ON ai_artifacts(workspace_id, entity_type, entity_id, artifact_kind, period_key);
CREATE INDEX IF NOT EXISTS idx_ai_artifacts_workspace_kind_expiry
  ON ai_artifacts(workspace_id, artifact_kind, expires_at);
