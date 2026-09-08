import { Router, type Request, type Response } from "express";
import type { AppConfig } from "../config.js";
import { AgentRunner, type RunAgentRequest } from "../agents/agent.js";
import { SessionEventBuffer } from "../services/eventBuffer.js";
import type { SessionStore, StoredMessage } from "../services/sessionStore.js";
import type { PlanApprovalStore } from "../services/planApprovalStore.js";
import type { QuestionStore } from "../services/questionStore.js";
import type { SkillDefinition, SkillFileDefinition, SubAgentDefinition } from "../agents/tools/types.js";
import { normalizeEffort } from "../agents/providers/reasoning.js";
import { normalizeTodos } from "../agents/todos.js";
import { normalizeMemoryFiles } from "../agents/memory.js";
import { normalizeKnowledgeFiles } from "../agents/knowledge.js";
import { initSSE, formatSSE } from "../utils/sse.js";
import type { GptLoopDatabase } from "../database/index.js";
import { createCustomAgentId } from "../database/index.js";
import type { MultiAgentRunner } from "../agents/multiagent/index.js";
import type { AgentTeamDefinition, TeamMemberDefinition, RunTeamRequest } from "../agents/multiagent/index.js";
import {
  CustomAgentRunner,
  CustomAgentManager,
  normalizeCustomAgentConfig,
  type CustomAgentConfig,
} from "../agents/customagent/index.js";

/** Extract a string field from an untrusted object (used on the custom_provider payload). */
function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Coerce an untrusted temperature into a finite number clamped to the range every
 * OpenAI-compatible provider accepts (0–2). Returns `undefined` when nothing usable
 * was sent so the provider applies its own default.
 */
function sanitizeTemperature(value: unknown): number | undefined {
  const num = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(num)) return undefined;
  return Math.min(2, Math.max(0, num));
}

/** Derive the API key used for provider auth: prefer the top-level key, else custom provider's. */
function effectiveApiKey(body: StreamBody): string {
  const top = (body.api_key ?? "").trim();
  if (top) return top;
  if (body.custom_provider && typeof body.custom_provider === "object") {
    const custom = body.custom_provider as Record<string, unknown>;
    return str(custom.apiKey);
  }
  return "";
}

interface StreamBody {
  chat_id?: string;
  user_message?: string;
  history?: StoredMessage[];
  provider?: string;
  model?: string;
  api_key?: string;
  base_url?: string;
  custom_provider?: unknown;
  max_iterations?: number;
  temperature?: number;
  effort?: string;
  since_event_id?: number;
  tavily_api_key?: string;
  exa_api_key?: string;
  serpapi_api_key?: string;
  search_provider?: "duckduckgo" | "tavily" | "exa" | "serpapi";
  fetch_provider?: "builtin" | "firecrawl";
  firecrawl_api_key?: string;
  sub_agents?: unknown;
  skills?: unknown;
  todos?: unknown;
  memory?: unknown;
  knowledge?: unknown;
  enable_reuse_sub_agent_session?: unknown;
  /** When true (with a valid agent_team), run this turn as a multi-agent team instead of one agent. */
  multi_agent?: unknown;
  /** The active agent team definition (head + members) sent from the frontend. */
  agent_team?: unknown;
  /** Mirrors settings; gates the sensitive send_message_to_team tool for the team this turn. */
  enable_send_message_to_team?: unknown;
  /**
   * The active Custom Agent config (a top-level, user-created Main Agent) for this turn. When present
   * and valid, the turn runs as that independent agent — its own system prompt + selected tools —
   * through the shared core runtime. Sent as a full config from the frontend.
   */
  custom_agent?: unknown;
  /**
   * Alternatively, the id of a stored Custom Agent to run this turn. Resolved server-side via the
   * CustomAgentManager, so a Custom Agent can be started independently of the Main Agent.
   */
  custom_agent_id?: unknown;
}

/**
 * Resolve the Custom Agent for this turn, if any: prefer a full config sent from the frontend, else
 * load a stored config by id via the manager. Returns null when neither yields a usable agent.
 */
function resolveCustomAgent(body: StreamBody, manager: CustomAgentManager): CustomAgentConfig | null {
  if (body.custom_agent && typeof body.custom_agent === "object") {
    const normalized = normalizeCustomAgentConfig(body.custom_agent, {
      id: createCustomAgentId(),
      now: Date.now(),
    });
    if (normalized) return normalized;
  }
  const id = typeof body.custom_agent_id === "string" ? body.custom_agent_id.trim() : "";
  if (id) return manager.get(id);
  return null;
}

/** Defensively coerce the client-provided agent-team definition into a safe, well-typed value. */
function normalizeTeam(raw: unknown): AgentTeamDefinition | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const leaderName = typeof record.leader_name === "string" ? record.leader_name.trim() : "";
  if (!leaderName) return null;

  const rawMembers = Array.isArray(record.members) ? record.members : [];
  const members: TeamMemberDefinition[] = [];
  const seen = new Set<string>([leaderName.toLowerCase()]);
  for (const item of rawMembers) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;
    const name = typeof m.name === "string" ? m.name.trim() : "";
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue; // no duplicate ids (and members can't share the leader's id)
    seen.add(key);
    members.push({
      name,
      description: typeof m.description === "string" ? m.description : "",
      system_prompt: typeof m.system_prompt === "string" ? m.system_prompt : "",
    });
  }

  return {
    id: typeof record.id === "string" && record.id.trim().length > 0 ? record.id.trim() : "team",
    name: typeof record.name === "string" ? record.name : "Agent team",
    leader_name: leaderName,
    leader_system_prompt:
      typeof record.leader_system_prompt === "string" ? record.leader_system_prompt : "",
    members,
  };
}

/** Defensively coerce the client-provided sub-agent definitions into safe, well-typed values. */
function normalizeSubAgents(raw: unknown): SubAgentDefinition[] {
  if (!Array.isArray(raw)) return [];
  const out: SubAgentDefinition[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    if (!name) continue;
    const systemPrompt =
      typeof record.system_prompt === "string"
        ? record.system_prompt
        : typeof record.systemPrompt === "string"
          ? (record.systemPrompt as string)
          : "";
    const tools = Array.isArray(record.tools)
      ? record.tools.filter((t): t is string => typeof t === "string")
      : [];
    out.push({
      name,
      description: typeof record.description === "string" ? record.description : "",
      system_prompt: systemPrompt,
      tools,
      enabled: record.enabled !== false,
    });
  }
  return out;
}

/** Defensively coerce the client-provided skill definitions into safe, well-typed values. */
function normalizeSkills(raw: unknown): SkillDefinition[] {
  if (!Array.isArray(raw)) return [];
  const out: SkillDefinition[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    if (!name) continue;

    const skillFile =
      typeof record.skill_file === "string" && record.skill_file.trim().length > 0
        ? record.skill_file.trim()
        : typeof record.skillFile === "string" && record.skillFile.trim().length > 0
          ? record.skillFile.trim()
          : "SKILL.md";

    const rawFiles = Array.isArray(record.files) ? record.files : [];
    const files: SkillFileDefinition[] = [];
    for (const file of rawFiles) {
      if (!file || typeof file !== "object") continue;
      const f = file as Record<string, unknown>;
      const path = typeof f.path === "string" ? f.path.trim() : "";
      if (!path) continue;
      files.push({ path, content: typeof f.content === "string" ? f.content : "" });
    }

    out.push({
      name,
      description: typeof record.description === "string" ? record.description : "",
      skillFile,
      files,
      enabled: record.enabled !== false,
    });
  }
  return out;
}

export function buildChatRouter(
  agent: AgentRunner,
  store: SessionStore,
  config: AppConfig,
  planApprovals: PlanApprovalStore,
  askQuestions: QuestionStore,
  db: GptLoopDatabase,
  multiAgent: MultiAgentRunner,
  customAgents: CustomAgentManager,
  customAgentRunner: CustomAgentRunner,
): Router {
  const router = Router();

  /**
   * Persist the turn's outcome: transcript + session bookkeeping (batched, off hot path).
   * `buffer` guards against stale settles: when a new turn has already replaced the
   * session's buffer (rapid abort → resend), the old turn's late `.finally` must not
   * clear the new turn's `running` flag or overwrite its `last_event_id`.
   */
  const settleTurn = (
    chatId: string,
    session: { messages: unknown[]; eventBuffer: SessionEventBuffer | null },
    buffer: SessionEventBuffer,
  ): void => {
    if (session.eventBuffer !== buffer) return;
    try {
      db.queue.enqueueMessages(chatId, session.messages);
      db.sessions.finishTurn(chatId, buffer.lastEventId);
    } catch {
      // Persistence failures must never break the chat flow.
    }
  };

  router.post("/abort/:chatId", (req: Request, res: Response) => {
    const chatId = String(req.params.chatId);
    const session = store.get(chatId);
    if (!session) {
      res.json({ ok: false });
      return;
    }
    session.abortController?.abort();
    session.eventBuffer?.setDone();
    session.running = false;
    if (session.eventBuffer) settleTurn(chatId, session, session.eventBuffer);
    res.json({ ok: true });
  });

  /**
   * Supply the user's decision for a pending submit_plan review.
   *   body: { decision: "approved" | "canceled" | "edited", plan?: string }
   * `plan` is required (and enforced) when decision is "edited". A no-op (ok:false) is returned
   * when no matching pending plan exists (already decided, timed out, or aborted).
   */
  router.post("/plan/:chatId/:toolCallId", (req: Request, res: Response) => {
    const chatId = String(req.params.chatId);
    const toolCallId = String(req.params.toolCallId);
    const body = (req.body ?? {}) as { decision?: unknown; plan?: unknown };

    const decision = String(body.decision ?? "");
    if (decision !== "approved" && decision !== "canceled" && decision !== "edited") {
      res.status(400).json({ error: "decision must be one of approved, canceled, edited." });
      return;
    }

    const plan = typeof body.plan === "string" ? body.plan : "";
    if (decision === "edited" && plan.trim().length === 0) {
      res.status(400).json({ error: "A non-empty plan is required when decision is edited." });
      return;
    }

    const supplied = planApprovals.decide(chatId, toolCallId, decision, decision === "edited" ? plan : undefined);
    res.json({ ok: supplied });
  });

  /**
   * Supply the user's answers for a pending ask_question_to_user request.
   *   body: { answers: [{ question: string, answer: string }] }
   * A no-op (ok:false) is returned when no matching pending request exists (already
   * answered, timed out, or aborted).
   */
  router.post("/question/:chatId/:toolCallId", (req: Request, res: Response) => {
    const chatId = String(req.params.chatId);
    const toolCallId = String(req.params.toolCallId);
    const body = (req.body ?? {}) as { answers?: unknown };

    if (!Array.isArray(body.answers)) {
      res.status(400).json({ error: "answers must be an array of { question, answer } objects." });
      return;
    }

    const answers = body.answers
      .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
      .map((item) => ({
        question: typeof item.question === "string" ? item.question : "",
        answer: typeof item.answer === "string" ? item.answer : "",
      }))
      .filter((a) => a.question.trim().length > 0);

    if (answers.length === 0) {
      res.status(400).json({ error: "At least one non-empty answer is required." });
      return;
    }

    const supplied = askQuestions.submitAnswers(chatId, toolCallId, answers);
    res.json({ ok: supplied });
  });

  router.post("/stream", async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as StreamBody;
    const chatId = body.chat_id?.trim();
    if (!chatId) {
      res.status(400).json({ error: "chat_id is required." });
      return;
    }

    const startNew = Boolean(
      body.user_message &&
        body.provider &&
        body.model &&
        (body.api_key || Boolean(body.custom_provider)),
    );

    if (startNew) {
      // Cancel any in-flight turn for this chat before starting a fresh one.
      const existing = store.get(chatId);
      if (existing?.running) {
        existing.abortController?.abort();
        existing.eventBuffer?.setDone();
      }

      // Transcript source of truth, in order of fidelity:
      //   1. the in-memory session (full provider transcript incl. tool calls/results),
      //   2. the SQLite transcript (survives backend restarts with full fidelity),
      //   3. the client-sent history (lossy, text-only — last resort for fresh installs).
      // Never let the lossy client history overwrite a richer stored transcript.
      const session = store.getOrCreate(chatId);
      if (session.messages.length === 0) {
        const persisted = db.messages.list(chatId);
        session.messages =
          persisted.length > 0 ? persisted : (body.history ?? []).map((m) => ({ ...m }));
        session.updatedAt = Date.now();
      }

      // Register the turn in the database (creates the session row on first use) and
      // wire every SSE event — main agent AND sub-agents — into the batched write queue.
      const title = (body.user_message ?? "").trim().slice(0, 80);
      const turn = db.sessions.startTurn(chatId, title);
      const buffer = new SessionEventBuffer((id, event, data) => {
        db.queue.enqueueEvent(chatId, turn, id, event, data);
      });
      const abortController = new AbortController();
      session.eventBuffer = buffer;
      session.abortController = abortController;
      session.running = true;

      // Multi-agent team mode: when the frontend has an active team enabled, route the FIRST user
      // input to the team head/leader instead of the single agent. The team runner streams onto the
      // very same buffer, so resume/replay/persistence all work identically.
      const team = body.multi_agent === true ? normalizeTeam(body.agent_team) : null;
      if (team) {
        const teamRequest: RunTeamRequest = {
          chatId,
          userMessage: body.user_message!,
          team,
          sendMessageToTeamEnabled:
            body.enable_send_message_to_team === true || body.enable_send_message_to_team === "yes",
          provider: body.provider!,
          model: body.model!,
          apiKey: effectiveApiKey(body),
          baseUrl: body.base_url,
          customProvider: body.custom_provider,
          temperature: sanitizeTemperature(body.temperature),
          effort: normalizeEffort(body.effort),
          tavilyApiKey: body.tavily_api_key,
          exaApiKey: body.exa_api_key,
          serpapiApiKey: body.serpapi_api_key,
          searchProvider: body.search_provider,
          fetchProvider: body.fetch_provider,
          firecrawlApiKey: body.firecrawl_api_key,
          subAgents: normalizeSubAgents(body.sub_agents),
          skills: normalizeSkills(body.skills),
          todos: normalizeTodos(body.todos),
          memory: normalizeMemoryFiles(body.memory),
          knowledge: normalizeKnowledgeFiles(body.knowledge),
        };

        void multiAgent
          .run(teamRequest, session, buffer, abortController.signal)
          .catch((error) => {
            buffer.append("error", {
              code: "team_crashed",
              message: error instanceof Error ? error.message : String(error),
            });
            buffer.setDone();
            session.running = false;
          })
          .finally(() => {
            settleTurn(chatId, session, buffer);
          });

        await streamFromBuffer(res, buffer, body.since_event_id ?? -1);
        return;
      }

      const runRequest: RunAgentRequest = {
        chatId,
        userMessage: body.user_message!,
        provider: body.provider!,
        model: body.model!,
        apiKey: effectiveApiKey(body),
        baseUrl: body.base_url,
        customProvider: body.custom_provider,
        maxIterations: body.max_iterations ?? config.maxIterations,
        temperature: sanitizeTemperature(body.temperature),
        effort: normalizeEffort(body.effort),
        tavilyApiKey: body.tavily_api_key,
        exaApiKey: body.exa_api_key,
        serpapiApiKey: body.serpapi_api_key,
        searchProvider: body.search_provider,
        fetchProvider: body.fetch_provider,
        firecrawlApiKey: body.firecrawl_api_key,
        subAgents: normalizeSubAgents(body.sub_agents),
        skills: normalizeSkills(body.skills),
        todos: normalizeTodos(body.todos),
        memory: normalizeMemoryFiles(body.memory),
        knowledge: normalizeKnowledgeFiles(body.knowledge),
        enableReuseSubAgentSession:
          body.enable_reuse_sub_agent_session === true ||
          body.enable_reuse_sub_agent_session === "yes",
      };

      // Custom Agent mode: when the active agent is a user-created top-level Custom Agent, run this
      // turn through the dedicated CustomAgentRunner. It parameterizes the SAME core runtime with the
      // agent's own system prompt + selected tools, so it behaves as an independent Main Agent (not a
      // sub-agent) and does not require the default Main Agent to be running.
      const customAgent = resolveCustomAgent(body, customAgents);
      if (customAgent) {
        void customAgentRunner
          .run(runRequest, customAgent, session, buffer, abortController.signal)
          .catch((error) => {
            buffer.append("error", {
              code: "custom_agent_crashed",
              message: error instanceof Error ? error.message : String(error),
            });
            buffer.setDone();
            session.running = false;
          })
          .finally(() => {
            settleTurn(chatId, session, buffer);
          });

        await streamFromBuffer(res, buffer, body.since_event_id ?? -1);
        return;
      }

      // Fire-and-forget the autonomous agent loop; the response streams from the buffer.
      void agent
        .run(runRequest, session, buffer, abortController.signal)
        .catch((error) => {
          buffer.append("error", {
            code: "agent_crashed",
            message: error instanceof Error ? error.message : String(error),
          });
          buffer.setDone();
          session.running = false;
        })
        .finally(() => {
          settleTurn(chatId, session, buffer);
        });

      await streamFromBuffer(res, buffer, body.since_event_id ?? -1);
      return;
    }

    // Reconnect path: attach to an existing buffer and replay from since_event_id.
    const session = store.get(chatId);
    if (session?.eventBuffer) {
      await streamFromBuffer(res, session.eventBuffer, body.since_event_id ?? -1);
      return;
    }

    // No live buffer (e.g. the backend restarted): replay the persisted event log of the
    // session's latest turn from the database, then terminate the stream cleanly.
    if (db.sessions.get(chatId)) {
      replayFromDatabase(res, db, chatId, body.since_event_id ?? -1);
      return;
    }

    res.status(400).json({ error: "No active agent and no user_message provided." });
  });

  return router;
}

/**
 * Serve a finished (or interrupted) turn straight from the SQLite event log. Coalesced
 * delta rows replay as single events carrying the concatenated text — reconnecting to a
 * finished stream is a single indexed range read, fast regardless of database size.
 */
function replayFromDatabase(
  res: Response,
  db: GptLoopDatabase,
  chatId: string,
  sinceId: number,
): void {
  initSSE(res);
  const turn = db.events.lastTurn(chatId);
  const events = turn > 0 ? db.events.listTurnSince(chatId, turn, sinceId) : [];

  let sawTerminal = false;
  let lastId = sinceId;
  for (const event of events) {
    // A coalesced row whose range straddles sinceId contains text the client already
    // rendered — skip it rather than resend duplicated content (its unseen tail, if
    // any, belongs to a crashed run that is terminated with `interrupted` below).
    if (event.firstEventId <= sinceId) continue;
    res.write(formatSSE(event.event, { ...event.data, _event_id: event.eventId }));
    lastId = event.eventId;
    if (event.event === "done") sawTerminal = true;
  }
  // A turn interrupted by a restart has no terminal event — synthesize one so the
  // client stops waiting instead of reconnect-looping.
  if (!sawTerminal) {
    res.write(formatSSE("done", { ok: false, interrupted: true, _event_id: lastId + 1 }));
  }
  res.end();
}

async function streamFromBuffer(
  res: Response,
  buffer: SessionEventBuffer,
  sinceId: number,
): Promise<void> {
  initSSE(res);
  let closed = false;
  res.on("close", () => {
    closed = true;
  });

  try {
    for await (const event of buffer.subscribe(sinceId)) {
      if (closed) break;
      res.write(formatSSE(event.event, event.data));
    }
  } catch {
    // client disconnected or buffer ended; fall through to close.
  } finally {
    if (!closed) res.end();
  }
}
