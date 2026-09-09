import type Database from "better-sqlite3";
import { openDatabase, resolveDatabasePath, sqliteVersion } from "./connection.js";
import { applySchema } from "./schema.js";
import { DatabaseWriteQueue } from "./writeQueue.js";
import { DatabaseMaintenance } from "./maintenance.js";
import { SessionsRepo } from "./repositories/sessionsRepo.js";
import { MessagesRepo } from "./repositories/messagesRepo.js";
import { EventsRepo } from "./repositories/eventsRepo.js";
import { SubAgentRunsRepo } from "./repositories/subAgentRunsRepo.js";
import { SnapshotsRepo } from "./repositories/snapshotsRepo.js";
import { AppStateRepo } from "./repositories/appStateRepo.js";
import { MemoryAgentRunsRepo } from "./repositories/memoryAgentRunsRepo.js";

export {
  createChatSessionId,
  createSubAgentSessionId,
  createCustomAgentId,
  createMainAgentPromptId,
  isSafeSessionId,
} from "./ids.js";
export { resolveDatabasePath, GPTLOOP_DATA_DIR, DATABASE_FILE_NAME } from "./connection.js";
export { APP_STATE_KEYS, isAppStateKey, type AppStateKey } from "./repositories/appStateRepo.js";
export type { SessionRow } from "./repositories/sessionsRepo.js";
export type { StoredStreamEvent } from "./repositories/eventsRepo.js";
export type { SubAgentRunRow } from "./repositories/subAgentRunsRepo.js";
export type {
  MemoryAgentRunRow,
  MemoryAgentRunStatus,
  MemoryAgentRunCounts,
  StoredMemoryAgentEvent,
} from "./repositories/memoryAgentRunsRepo.js";

/**
 * The application's persistence facade. Everything the system produces — main-agent
 * streaming, sub-agent streaming, tool calls + results, transcripts, UI snapshots,
 * settings/API keys, skills, knowledge, memory, custom sub-agents — is stored here,
 * in a single SQLite (3.53.4) database at `<workspace>/.gptloop/gptloop.db` that is
 * created automatically on boot.
 */
export class GptLoopDatabase {
  readonly sessions: SessionsRepo;
  readonly messages: MessagesRepo;
  readonly events: EventsRepo;
  readonly subAgentRuns: SubAgentRunsRepo;
  readonly snapshots: SnapshotsRepo;
  readonly appState: AppStateRepo;
  readonly memoryAgentRuns: MemoryAgentRunsRepo;
  readonly queue: DatabaseWriteQueue;

  private readonly maintenance: DatabaseMaintenance;
  private closed = false;

  private constructor(
    private readonly db: Database.Database,
    readonly path: string,
  ) {
    this.sessions = new SessionsRepo(db);
    this.messages = new MessagesRepo(db);
    this.events = new EventsRepo(db);
    this.subAgentRuns = new SubAgentRunsRepo(db);
    this.snapshots = new SnapshotsRepo(db);
    this.appState = new AppStateRepo(db);
    this.memoryAgentRuns = new MemoryAgentRunsRepo(db);
    this.queue = new DatabaseWriteQueue(db);
    this.maintenance = new DatabaseMaintenance(db);
  }

  /** Open (creating if needed) the database for a workspace and start maintenance. */
  static open(workspaceRoot: string): GptLoopDatabase {
    const dbPath = resolveDatabasePath(workspaceRoot);
    const exclusive = process.env.GPTLOOP_DB_EXCLUSIVE !== "0";
    const db = openDatabase(dbPath, { exclusiveLocking: exclusive });
    applySchema(db);

    const instance = new GptLoopDatabase(db, dbPath);
    // After a restart nothing can still be running.
    instance.sessions.resetRunningFlags();
    instance.memoryAgentRuns.failInterrupted();
    instance.maintenance.start();

    // eslint-disable-next-line no-console
    console.log(`[gptloop-db] SQLite ${sqliteVersion(db)} ready at ${dbPath}`);
    return instance;
  }

  /** SQLite library version in use. */
  get version(): string {
    return sqliteVersion(this.db);
  }

  /** Flush pending writes and close cleanly (safe to call multiple times). */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.queue.close();
    } catch {
      // best effort
    }
    this.maintenance.stop();
    try {
      this.db.close();
    } catch {
      // best effort
    }
  }
}
