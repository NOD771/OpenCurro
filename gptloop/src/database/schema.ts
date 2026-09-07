import type Database from "better-sqlite3";

/**
 * Database schema.
 *
 * Design notes for "never gets slower as the database grows":
 * - Every read path is a point lookup or an indexed range scan — there is not a single
 *   full-table scan anywhere in the repositories.
 * - `stream_events` is a WITHOUT ROWID table clustered on (session_id, turn, event_id):
 *   appends land at the end of a session's cluster and replay reads are one contiguous
 *   range scan, regardless of how many other sessions/tokens exist.
 * - Token/reasoning deltas are coalesced by the write queue before insertion, so a
 *   100k tokens/second stream produces a handful of rows per flush, not 100k rows.
 * - Schema version is tracked in `user_version` for forward migrations.
 */

const SCHEMA_VERSION = 1;

const DDL = `
CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,            -- 20-char alphanumeric chat session id
  title         TEXT NOT NULL DEFAULT '',
  running       INTEGER NOT NULL DEFAULT 0,
  turn_count    INTEGER NOT NULL DEFAULT 0,  -- number of agent turns executed
  last_event_id INTEGER NOT NULL DEFAULT -1, -- last stream event id of the latest turn
  message_count INTEGER NOT NULL DEFAULT 0,  -- maintained by the write queue (no COUNT scans)
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions (updated_at DESC);

-- Provider-format transcript (OpenAI wire shape), authoritative model context per session.
CREATE TABLE IF NOT EXISTS messages (
  session_id TEXT NOT NULL,
  seq        INTEGER NOT NULL,
  role       TEXT NOT NULL,
  data       TEXT NOT NULL,                  -- full StoredMessage JSON
  created_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, seq)
) WITHOUT ROWID;

-- Full stream event log: every SSE event of the main agent AND all sub-agents
-- (tokens, reasoning, tool calls, tool results, statuses...). Consecutive token /
-- reasoning deltas are coalesced into single rows by the write queue.
CREATE TABLE IF NOT EXISTS stream_events (
  session_id     TEXT NOT NULL,
  turn           INTEGER NOT NULL,
  event_id       INTEGER NOT NULL,           -- LAST event id covered by this row
  first_event_id INTEGER NOT NULL,           -- FIRST event id covered (== event_id unless coalesced)
  event          TEXT NOT NULL,
  data           TEXT NOT NULL,
  created_at     INTEGER NOT NULL,
  PRIMARY KEY (session_id, turn, event_id)
) WITHOUT ROWID;

-- One row per sub-agent invocation; 10-char alphanumeric run/session id.
CREATE TABLE IF NOT EXISTS sub_agent_runs (
  id           TEXT PRIMARY KEY,             -- 10-char sub-agent session id
  session_id   TEXT NOT NULL,
  turn         INTEGER NOT NULL DEFAULT 0,
  tool_call_id TEXT NOT NULL DEFAULT '',
  agent        TEXT NOT NULL DEFAULT '',
  task         TEXT NOT NULL DEFAULT '',
  background   INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'running', -- running | completed | failed | aborted
  output       TEXT NOT NULL DEFAULT '',
  error        TEXT,
  output_file  TEXT,
  started_at   INTEGER NOT NULL,
  finished_at  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_sub_agent_runs_session ON sub_agent_runs (session_id, started_at);

-- Structured record of every tool call + result (main agent and sub-agents).
CREATE TABLE IF NOT EXISTS tool_calls (
  session_id       TEXT NOT NULL,
  tool_call_id     TEXT NOT NULL,
  sub_agent_run_id TEXT,                     -- NULL for main-agent tool calls
  name             TEXT NOT NULL DEFAULT '',
  label            TEXT,
  args             TEXT,
  ok               INTEGER,                  -- NULL until the result arrives
  result           TEXT,
  created_at       INTEGER NOT NULL,
  finished_at      INTEGER,
  PRIMARY KEY (session_id, tool_call_id)
) WITHOUT ROWID;

-- UI-shaped conversation snapshots (what the frontend renders), one JSON doc per session.
CREATE TABLE IF NOT EXISTS session_snapshots (
  session_id TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  updated_at INTEGER NOT NULL
) WITHOUT ROWID;

-- Application state documents: settings (incl. API keys), custom sub-agent definitions,
-- skill files, memory files, knowledge files, todos, custom providers, UI selections...
CREATE TABLE IF NOT EXISTS app_state (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
) WITHOUT ROWID;

-- One row per background memory-agent run. A run is enqueued every time the main agent
-- finishes a turn; the queue executes runs strictly one at a time, each in a brand-new
-- session (sessions are never reused).
CREATE TABLE IF NOT EXISTS memory_agent_runs (
  id              TEXT PRIMARY KEY,           -- 10-char memory-agent run/session id
  chat_session_id TEXT NOT NULL,              -- chat session whose turn triggered this run
  status          TEXT NOT NULL DEFAULT 'queued', -- queued | running | completed | failed
  provider        TEXT NOT NULL DEFAULT '',
  model           TEXT NOT NULL DEFAULT '',
  summary         TEXT NOT NULL DEFAULT '',   -- the agent's final message
  error           TEXT,
  updated_files   TEXT NOT NULL DEFAULT '[]', -- JSON array of memory paths written/edited/deleted
  last_event_id   INTEGER NOT NULL DEFAULT -1,
  queued_at       INTEGER NOT NULL,
  started_at      INTEGER,
  finished_at     INTEGER
);

CREATE INDEX IF NOT EXISTS idx_memory_agent_runs_queued ON memory_agent_runs (queued_at DESC);

-- Full stream event log of every memory-agent run (tokens, reasoning, tool calls,
-- tool results, memory updates...). Consecutive token/reasoning deltas are coalesced
-- into single rows by the memory-agent event persister.
CREATE TABLE IF NOT EXISTS memory_agent_events (
  run_id         TEXT NOT NULL,
  event_id       INTEGER NOT NULL,            -- LAST event id covered by this row
  first_event_id INTEGER NOT NULL,            -- FIRST event id covered (== event_id unless coalesced)
  event          TEXT NOT NULL,
  data           TEXT NOT NULL,
  created_at     INTEGER NOT NULL,
  PRIMARY KEY (run_id, event_id)
) WITHOUT ROWID;
`;

/** Create all tables/indexes (idempotent) and stamp the schema version. */
export function applySchema(db: Database.Database): void {
  const current = Number(db.pragma("user_version", { simple: true }));
  db.exec(DDL);

  // Additive migrations for databases created by earlier schema revisions.
  ensureColumn(db, "sessions", "message_count", "INTEGER NOT NULL DEFAULT 0");

  if (current < SCHEMA_VERSION) {
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
  }
}

/** Add a column to an existing table when it is missing (idempotent, additive-only). */
function ensureColumn(
  db: Database.Database,
  table: string,
  column: string,
  definition: string,
): void {
  const columns = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
