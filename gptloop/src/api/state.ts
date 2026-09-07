import { Router, type Request, type Response } from "express";
import {
  type GptLoopDatabase,
  isAppStateKey,
  isSafeSessionId,
  createChatSessionId,
} from "../database/index.js";

/**
 * State + session APIs backing the frontend's persistence. The browser keeps NOTHING
 * in localStorage anymore — on boot it hydrates from `GET /api/state`, and every
 * settings/skills/memory/knowledge/sub-agent/todo change is written back here into
 * the SQLite database. Conversation snapshots (the UI-shaped chat history) live in
 * `PUT/GET /api/sessions/:id`.
 */

export function buildStateRouter(db: GptLoopDatabase): Router {
  const router = Router();

  /** Everything the frontend needs to boot, in one round trip. */
  router.get("/", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      sqlite_version: db.version,
      state: db.appState.getAll(),
      // One indexed read — messageCount is maintained by the write queue, so boot
      // cost stays flat no matter how large the message/event tables grow.
      sessions: db.sessions.list().map((s) => ({
        id: s.id,
        title: s.title,
        running: s.running,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        messageCount: s.messageCount,
      })),
    });
  });

  /** Persist one application-state document (settings, skills, memory, ...). */
  const putState = (req: Request, res: Response): void => {
    const key = String(req.params.key);
    if (!isAppStateKey(key)) {
      res.status(400).json({ error: `Unknown state key "${key}".` });
      return;
    }
    const body = (req.body ?? {}) as { value?: unknown };
    db.appState.set(key, body.value ?? null);
    res.json({ ok: true });
  };
  router.put("/:key", putState);
  // POST alias so navigator.sendBeacon (POST-only) can flush state on page close.
  router.post("/:key", putState);

  return router;
}

export function buildSessionsRouter(db: GptLoopDatabase): Router {
  const router = Router();

  /** Create a new session with a server-generated 20-character id. */
  router.post("/", (req: Request, res: Response) => {
    const body = (req.body ?? {}) as { title?: unknown };
    const title = typeof body.title === "string" ? body.title.slice(0, 200) : "";
    const session = db.sessions.create(title);
    res.json({ ok: true, id: session.id, session });
  });

  router.get("/", (_req: Request, res: Response) => {
    res.json({ ok: true, sessions: db.sessions.list() });
  });

  /** Full session detail: metadata, UI snapshot, and the provider-format transcript. */
  router.get("/:id", (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!isSafeSessionId(id)) {
      res.status(400).json({ error: "Invalid session id." });
      return;
    }
    const session = db.sessions.get(id);
    if (!session) {
      res.status(404).json({ error: "Session not found." });
      return;
    }
    res.json({
      ok: true,
      session,
      snapshot: db.snapshots.get(id),
      transcript: db.messages.list(id),
      subAgentRuns: db.subAgentRuns.listBySession(id),
    });
  });

  /** Upsert a session: title rename and/or the UI conversation snapshot. */
  const putSession = (req: Request, res: Response): void => {
    const id = String(req.params.id);
    if (!isSafeSessionId(id)) {
      res.status(400).json({ error: "Invalid session id." });
      return;
    }
    const body = (req.body ?? {}) as { title?: unknown; snapshot?: unknown };
    db.sessions.ensure(id);
    if (typeof body.title === "string") {
      db.sessions.rename(id, body.title.slice(0, 200));
    }
    if (body.snapshot !== undefined) {
      db.snapshots.set(id, body.snapshot);
    }
    res.json({ ok: true });
  };
  router.put("/:id", putSession);
  // POST alias so navigator.sendBeacon (POST-only) can flush snapshots on page close.
  router.post("/:id", putSession);

  router.delete("/:id", (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!isSafeSessionId(id)) {
      res.status(400).json({ error: "Invalid session id." });
      return;
    }
    db.sessions.delete(id);
    res.json({ ok: true });
  });

  return router;
}

/** Re-exported so callers can mint ids without touching the database module directly. */
export { createChatSessionId };
