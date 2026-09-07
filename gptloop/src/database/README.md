# GPTLoop Database (SQLite 3.53.4)

Everything the system produces is persisted here — main-agent streaming, sub-agent
streaming (any number of concurrent sub-agents), tool calls + results, chat
transcripts, UI conversation snapshots, settings (including API keys), user-created
skills, knowledge files, memory files, custom sub-agents, and todos.

The database file is created automatically on boot at **`<workspace>/.gptloop/gptloop.db`**.
The browser keeps **nothing** in localStorage/sessionStorage/IndexedDB — the frontend
hydrates from `GET /api/state` and streams live over SSE; SQLite is the single source
of durability.

## File structure

| File | Responsibility |
| --- | --- |
| `index.ts` | `GptLoopDatabase` facade: opens the DB, wires repos + queue + maintenance, clean shutdown. |
| `connection.ts` | Opens the file, applies the performance PRAGMAs (WAL, NORMAL sync, 64MB cache, exclusive locking, mmap…). |
| `schema.ts` | DDL for all tables/indexes + additive migrations (`user_version`). |
| `ids.ts` | 20-char chat-session ids and 10-char sub-agent session ids (digits + all letters). |
| `writeQueue.ts` | Batched async writer — the ONLY write path for streaming-rate data. |
| `maintenance.ts` | Idle PASSIVE WAL checkpoints + `PRAGMA optimize` so the DB never slows down as it grows. |
| `repositories/sessionsRepo.ts` | Chat sessions (running flag, turn counter, message count). |
| `repositories/messagesRepo.ts` | Provider-format transcripts (model context, survives restarts). |
| `repositories/eventsRepo.ts` | The full stream-event log (replay/reconnect reads). |
| `repositories/subAgentRunsRepo.ts` | One row per sub-agent invocation (10-char session id). |
| `repositories/snapshotsRepo.ts` | UI-shaped conversation snapshots the frontend renders. |
| `repositories/appStateRepo.ts` | Settings/API keys, skills, knowledge, memory, sub-agents, todos, custom providers. |

## Why streaming never lags, hangs, or freezes

1. **Nothing writes to SQLite on the hot path.** `SessionEventBuffer` hands every SSE
   event to `DatabaseWriteQueue.enqueueEvent()`, which is O(1) in-memory work — no
   JSON serialization, no I/O. Measured: **250,000 events enqueued in ~270ms**.
2. **Token coalescing.** Consecutive token/reasoning deltas of the same stream merge
   into a single pending row (per main agent and per sub-agent). A flush window of a
   100k tok/s stream becomes ~1 row, not 100k rows.
3. **Batched WAL transactions.** A timer flushes every 200ms inside one transaction
   with prepared statements; backlogs are written in bounded chunks with event-loop
   yields between chunks. `synchronous = NORMAL` keeps fsync off the app thread.
4. **Flat-cost reads.** Every query is a point lookup or clustered-index range scan
   (`stream_events` is WITHOUT ROWID, clustered on `(session_id, turn, event_id)`),
   so replay/boot cost does not depend on total database size. Boot metadata like
   message counts is maintained by the write queue instead of `COUNT(*)` scans.
5. **Background maintenance.** Passive checkpoints keep the WAL small and
   `PRAGMA optimize` keeps the query planner sharp — without ever blocking a writer.
   This is why the agent, sub-agents, scraper, and search never get slower as the
   database grows: they never wait on the database at all.

## PRAGMAs

```sql
PRAGMA journal_mode = WAL;         -- non-blocking concurrent writes
PRAGMA synchronous = NORMAL;       -- decouple fsync from the app thread
PRAGMA cache_size = -64000;        -- exactly 64MB RAM page cache
PRAGMA locking_mode = EXCLUSIVE;   -- lock the file to this process (GPTLOOP_DB_EXCLUSIVE=0 to disable)
PRAGMA temp_store = MEMORY;
PRAGMA mmap_size = 268435456;      -- 256MB mmap reads
PRAGMA wal_autocheckpoint = 2000;
PRAGMA busy_timeout = 5000;
PRAGMA foreign_keys = ON;
```

## Sessions

- **Chat sessions**: 20-character ids over `0-9a-zA-Z` (e.g. `3IiQmdMwK6inZmumsaWv`),
  minted by the frontend (`newSessionId()`) or `POST /api/sessions`.
- **Sub-agent sessions**: every `call_sub_agent` invocation gets a 10-character id
  stamped onto all of its `sub_agent_*` events (`sub_session_id`), keying its stream,
  tool calls, and final output in the database.
