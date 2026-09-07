import type { AppConfig } from "../config.js";
import { buildSystemPrompt } from "./systemprompt.js";
import type { ProviderRegistry } from "./providers/registry.js";
import { resolveProvider } from "./providers/registry.js";
import type { Provider } from "./providers/types.js";
import type { ToolRegistry } from "./tools/index.js";
import {
  buildImageMessage,
  extractImageAttachment,
  withoutImageAttachment,
} from "./tools/readImage.js";
import { isVisionCapableModel } from "../utils/vision.js";
import type { SkillDefinition, SubAgentDefinition, WebToolsConfig } from "./tools/types.js";
import type { ToolCall, ToolCallDelta } from "./providers/types.js";
import type { ChatSession, StoredMessage } from "../services/sessionStore.js";
import type { SessionEventBuffer } from "../services/eventBuffer.js";
import type { PlanApprovalStore } from "../services/planApprovalStore.js";
import type { QuestionStore } from "../services/questionStore.js";
import { safeJsonParse } from "../utils/json.js";
import { createSubAgentRuntime } from "./subagents.js";
import { createSkillRuntime } from "./skills.js";
import { mergeDefaultSkills, resolveDefaultSkills } from "./skills/index.js";
import { resolveDefaultSubAgents, mergeDefaultSubAgents } from "./sub-agents/index.js";
import { createTodoRuntime } from "./todos.js";
import { createMemoryRuntime } from "./memory.js";
import { createKnowledgeRuntime } from "./knowledge.js";
import type { KnowledgeFile, MemoryFile, MemoryRuntime, TodoItem } from "./tools/types.js";
import type { MemoryAgentService } from "./memoryagent/index.js";
import { TEAM_TOOL_NAMES } from "./tools/teamTools.js";

export interface RunAgentRequest {
  chatId: string;
  userMessage: string;
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  /** Full user-defined provider config, present when a `custom_` provider is selected. */
  customProvider?: unknown;
  /**
   * @deprecated The agent runs with NO iteration cap and this value is ignored. Kept only for
   * backward compatibility with the wire request; the loop runs until the agent is done or aborted.
   */
  maxIterations?: number;
  temperature?: number;
  /**
   * Reasoning effort chosen in Settings: a preset (`low` | `medium` | `high` | `max`)
   * or a custom string. Forwarded to the provider; ignored by models without reasoning.
   */
  effort?: string;
  /** Per-request web tool keys/provider (from frontend Settings); falls back to env config. */
  tavilyApiKey?: string;
  exaApiKey?: string;
  serpapiApiKey?: string;
  searchProvider?: "duckduckgo" | "tavily" | "exa" | "serpapi";
  fetchProvider?: "builtin" | "firecrawl";
  firecrawlApiKey?: string;
  /** User-defined sub-agents (from the frontend, stored in the browser) available this turn. */
  subAgents?: SubAgentDefinition[];
  /** User-defined skills (from the frontend, stored in the browser) available this turn. */
  skills?: SkillDefinition[];
  /** User-defined todos (from the frontend, stored in the browser) available this turn. */
  todos?: TodoItem[];
  /** The user's memory files (from the frontend, stored in the browser) available this turn. */
  memory?: MemoryFile[];
  /** The user's knowledge base files (from the frontend, stored in the browser) available this turn. */
  knowledge?: KnowledgeFile[];
  /**
   * Whether the sub-agent session tools (list_sub_agent_sessions / reuse_same_sub_agent_session)
   * are enabled for this turn. Mirrors the user's Settings choice. When false (default) the two
   * tools are hidden from the model and their usage guidance is omitted from the system prompt.
   */
  enableReuseSubAgentSession?: boolean;
}

/**
 * The sub-agent session tools, gated by the `enable_reuse_sub_agent_session` setting. When the
 * setting is off they are neither advertised to the model nor described in the system prompt.
 */
const SESSION_REUSE_TOOLS: readonly string[] = [
  "list_sub_agent_sessions",
  "reuse_same_sub_agent_session",
];

/**
 * The five multi-agent collaboration tools are ONLY for agents inside an active team (see the
 * multiagent runtime). The normal single agent never sees them nor their guidance — it has no
 * `team` runtime, so they would be unusable anyway; hiding them keeps the single-agent surface clean.
 */
const TEAM_TOOLS: readonly string[] = TEAM_TOOL_NAMES;

export class AgentRunner {
  constructor(
    private readonly providers: ProviderRegistry,
    private readonly tools: ToolRegistry,
    private readonly config: AppConfig,
    private readonly planApprovals: PlanApprovalStore,
    private readonly askQuestions: QuestionStore,
    /**
     * Optional background memory agent. When present, every completed turn enqueues a
     * memory-build run that receives this turn's FULL context (untruncated transcript +
     * final memory state) and updates the user's memory files autonomously.
     */
    private readonly memoryAgent?: MemoryAgentService,
  ) {}

  /**
   * Execute a full autonomous turn: stream reasoning + tokens, run tools natively, and
   * loop (Thought -> Action -> Observation) until the model produces a final answer with
   * no further tool calls. The loop is UNBOUNDED — there is no iteration limit; the agent
   * keeps working until it is genuinely done or the turn is aborted.
   */
  async run(
    request: RunAgentRequest,
    session: ChatSession,
    buffer: SessionEventBuffer,
    signal: AbortSignal,
  ): Promise<void> {
    const send = (event: string, data: Record<string, unknown>) => buffer.append(event, data);

    // Hoisted so the post-turn memory-agent trigger (in `finally`) can hand the background
    // memory agent the FINAL memory state of this turn, including the main agent's own writes.
    let memoryRuntime: MemoryRuntime | undefined;
    let turnOk = false;

    try {
      let provider: Provider;
      try {
        provider = resolveProvider(this.providers, request.provider, request.customProvider);
      } catch (error) {
        send("error", { code: "provider_error", message: messageOf(error) });
        send("done", { ok: false });
        return;
      }

      // Memory runtime for this turn — a snapshot of the user's memory files that the `memory`
      // tool reads and mutates. Present only for main-agent tool calls. The four pre-added files
      // (MEMORY.md, SOUL.md, USER.md, session-memory.md) are auto-appended to the user's FIRST
      // message of a chat so the agent starts every conversation already knowing its accumulated
      // context.
      memoryRuntime = createMemoryRuntime(request.memory ?? []);

      // Knowledge runtime for this turn — a browser-backed snapshot of the user's knowledge base
      // (a file-tree of durable reference material) that the knowledge_* tools read and mutate.
      // Present only for main-agent tool calls. Unlike memory it has no pre-added files; a one-time
      // notice is appended to the user's FIRST message ONLY when the user actually has knowledge
      // files, telling the agent to discover/read them with the knowledge tools.
      const knowledgeRuntime = createKnowledgeRuntime(request.knowledge ?? []);

      // "First user input" = no prior user turn exists in this session's history. On that first
      // message (and only then) we prepend the pre-added memory files so the model has its
      // persistent context; later turns rely on the `memory` tool to read anything it needs. The
      // knowledge-base notice is likewise appended only on this first message (and only if any
      // knowledge files exist).
      const isFirstUserMessage = !session.messages.some((m) => m.role === "user");
      const userContent = isFirstUserMessage
        ? withFirstMessageContext(
            request.userMessage,
            memoryRuntime.firstMessageContext(),
            knowledgeRuntime.firstMessageContext(),
          )
        : request.userMessage;

      session.messages.push({ role: "user", content: userContent });
      const reuseSessionsEnabled = request.enableReuseSubAgentSession === true;
      const systemPrompt = buildSystemPrompt(this.config.workspaceRoot, {
        enableReuseSubAgentSession: reuseSessionsEnabled,
      });
      // Expose the sub-agent session tools to the model only when the setting is on. Everything else
      // in the registry is always available; the two session tools are filtered out otherwise.
      const hiddenTools = new Set<string>(TEAM_TOOLS);
      if (!reuseSessionsEnabled) for (const name of SESSION_REUSE_TOOLS) hiddenTools.add(name);
      const toolSchemas = this.tools.schemas.filter((s) => !hiddenTools.has(s.function.name));
      const visionCapable = isVisionCapableModel(request.model, this.config);
      const web: WebToolsConfig = {
        searchProvider: request.searchProvider ?? this.config.searchProvider,
        fetchProvider: request.fetchProvider ?? this.config.fetchProvider,
        tavilyApiKey: request.tavilyApiKey || this.config.tavilyApiKey || undefined,
        exaApiKey: request.exaApiKey || this.config.exaApiKey || undefined,
        serpapiApiKey: request.serpapiApiKey || this.config.serpapiApiKey || undefined,
        firecrawlApiKey: request.firecrawlApiKey || this.config.firecrawlApiKey || undefined,
      };

      // Sub-agent runtime for this turn — a separate LLM call per sub-agent, using the same
      // provider/model/credentials the user chose for the main agent. Streams `sub_agent_*`
      // side-channel events onto the same buffer so the UI can show live progress. The agent's
      // built-in default sub-agents are merged underneath so they are pre-added and always
      // available, unless the user provides their own sub-agent with the same name (which
      // overrides the default).
      const defaultSubAgents = await resolveDefaultSubAgents();
      const subAgentRuntime = createSubAgentRuntime({
        provider,
        tools: this.tools,
        config: this.config,
        chatId: request.chatId,
        definitions: mergeDefaultSubAgents(defaultSubAgents, request.subAgents ?? []),
        model: request.model,
        apiKey: request.apiKey,
        baseUrl: request.baseUrl,
        temperature: request.temperature,
        effort: request.effort,
        send,
        // Snapshot the live conversation so a call_sub_agent with send_my_context=true can share
        // the surrounding context. Returns the current messages at the moment the sub-agent is called.
        getConversationContext: () => session.messages,
      });

      // Skill runtime for this turn — enumerates the user's skills (list_skills) and materializes
      // them onto disk inside the workspace's ".curro/skills" directory (skill_initialize). Skills, like
      // sub-agents, are authored in the frontend and travel with each turn. The agent's built-in
      // default skills are merged underneath so they are pre-added and always available, unless
      // the user provides their own skill with the same name (which overrides the default).
      const defaultSkills = await resolveDefaultSkills();
      const skillRuntime = createSkillRuntime(mergeDefaultSkills(defaultSkills, request.skills ?? []));

      // Todo runtime for this turn — a browser-backed snapshot of the user's todo list that the
      // TodoWrite / read_todos tools read and update. Present only for main-agent tool calls.
      const todoRuntime = createTodoRuntime(request.todos ?? []);

      const visibleAnswer: string[] = [];
      const visibleReasoning: string[] = [];
      let iteration = 0;

      // The agent runs with NO iteration cap. `limit: null` signals "unlimited" to any UI listener.
      send("iteration", { current: 0, limit: null });

      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (signal.aborted) {
          send("done", { ok: false, aborted: true });
          return;
        }

        iteration += 1;
        send("iteration", { current: iteration, limit: null });
        send("status", { state: "thinking", label: "Thinking..." });

        const answerParts: string[] = [];
        const reasoningParts: string[] = [];
        let toolCalls: ToolCall[] = [];
        let finishReason: string | null = null;

        try {
          const stream = provider.streamChatCompletion({
            apiKey: request.apiKey,
            model: request.model,
            messages: this.buildProviderMessages(systemPrompt, session.messages),
            tools: toolSchemas,
            baseUrl: request.baseUrl,
            temperature: request.temperature,
            effort: request.effort,
            signal,
          });

          for await (const delta of stream) {
            if (delta.reasoning) {
              const cleaned = normalize(delta.reasoning);
              reasoningParts.push(cleaned);
              visibleReasoning.push(cleaned);
              send("reasoning", { value: cleaned });
            }
            if (delta.text) {
              const cleaned = normalize(delta.text);
              answerParts.push(cleaned);
              visibleAnswer.push(cleaned);
              send("token", { value: cleaned });
            }
            if (delta.toolCalls) {
              toolCalls = mergeToolCalls(toolCalls, delta.toolCalls);
            }
            if (delta.finishReason) {
              finishReason = delta.finishReason;
            }
          }
        } catch (error) {
          if (signal.aborted) {
            send("done", { ok: false, aborted: true });
            return;
          }
          send("error", { code: "provider_api_error", message: `Provider API error: ${messageOf(error)}` });
          send("done", { ok: false });
          return;
        }

        const hasToolCalls = toolCalls.some((c) => c.function.name) || finishReason === "tool_calls";

        if (hasToolCalls) {
          const assistantMessage: StoredMessage = {
            role: "assistant",
            content: answerParts.join("") || null,
            tool_calls: toolCalls.map((c) => ({
              id: c.id,
              type: c.type,
              function: { name: c.function.name, arguments: c.function.arguments },
            })),
          };
          if (reasoningParts.length > 0) assistantMessage.reasoning_content = reasoningParts.join("");
          session.messages.push(assistantMessage);

          const imageMessages: StoredMessage[] = [];

          for (const toolCall of toolCalls) {
            if (!toolCall.function.name) continue;
            const args = safeJsonParse(toolCall.function.arguments);

            send("tool_call", {
              id: toolCall.id,
              name: toolCall.function.name,
              args,
              label: this.tools.label(toolCall.function.name, args),
            });

            const result = await this.tools.execute(toolCall.function.name, args, {
              workspaceRoot: this.config.workspaceRoot,
              shellTimeoutMs: this.config.shellTimeoutMs,
              signal,
              web,
              subAgents: subAgentRuntime,
              skills: skillRuntime,
              todos: todoRuntime,
              memory: memoryRuntime,
              knowledge: knowledgeRuntime,
              toolCallId: toolCall.id ?? undefined,
              chatId: request.chatId,
              emit: send,
              planApprovals: this.planApprovals,
              planApprovalTimeoutMs: this.config.planApprovalTimeoutMs,
              askQuestions: this.askQuestions,
              questionTimeoutMs: this.config.questionTimeoutMs,
              model: request.model,
              visionCapable,
              availableToolNames: this.tools.names(),
            });

            // read_image attaches the loaded image to its result. The base64 payload
            // is stripped from the model-visible tool message (it is useless as text
            // and would bloat every follow-up request); the image is instead injected
            // as a vision content part after all tool responses so the model can see it.
            const resultForModel = withoutImageAttachment(result);
            const imageAttachment = extractImageAttachment(result);

            session.messages.push({
              role: "tool",
              tool_call_id: toolCall.id ?? undefined,
              name: toolCall.function.name,
              content: JSON.stringify(resultForModel),
            });

            if (imageAttachment) imageMessages.push(buildImageMessage(imageAttachment));

            send("tool_result", {
              id: toolCall.id,
              name: toolCall.function.name,
              ok: result.ok,
              result: resultForModel,
              label: this.tools.label(toolCall.function.name, args),
            });
          }

          // Append any vision inputs after all tool responses so providers see
          // contiguous tool messages immediately following the assistant tool_calls.
          for (const imageMessage of imageMessages) {
            session.messages.push(imageMessage);
          }

          // Observation delivered — loop again so the model can reason about the results.
          continue;
        }

        // No tool calls -> this is the final assistant answer for the turn.
        const finalContent = answerParts.join("");
        const finalMessage: StoredMessage = { role: "assistant", content: finalContent };
        if (reasoningParts.length > 0) finalMessage.reasoning_content = reasoningParts.join("");
        session.messages.push(finalMessage);

        send("message_complete", {
          content: visibleAnswer.join(""),
          reasoning: visibleReasoning.length > 0 ? visibleReasoning.join("") : null,
          iteration_count: iteration,
        });
        turnOk = true;
        send("done", { ok: true });
        return;
      }
    } finally {
      // The main agent's turn is over — hand the COMPLETE turn context (full untruncated
      // transcript, the triggering user prompt, and the FINAL memory state) to the background
      // memory agent. Every trigger starts a brand-new memory-agent session; the service's
      // FIFO queue serializes overlapping requests. Enqueued BEFORE the buffer closes so the
      // `memory_agent_queued` notice still reaches any attached client.
      if (this.memoryAgent && memoryRuntime && session.messages.some((m) => m.role === "user")) {
        try {
          const runId = this.memoryAgent.enqueue({
            chatId: request.chatId,
            userMessage: request.userMessage,
            transcript: session.messages.map((m) => ({ ...m })),
            memoryFiles: memoryRuntime.files,
            turnOk,
            aborted: signal.aborted,
            provider: request.provider,
            model: request.model,
            apiKey: request.apiKey,
            baseUrl: request.baseUrl,
            customProvider: request.customProvider,
            temperature: request.temperature,
            effort: request.effort,
          });
          if (runId) {
            send("memory_agent_queued", { run_id: runId, chat_id: request.chatId });
          }
        } catch {
          // The memory agent must never break the chat flow.
        }
      }

      buffer.setDone();
      session.running = false;
      session.updatedAt = Date.now();
    }
  }

  private buildProviderMessages(systemPrompt: string, messages: StoredMessage[]): Array<Record<string, unknown>> {
    const built: Array<Record<string, unknown>> = [{ role: "system", content: systemPrompt }];
    for (const message of messages) {
      const entry: Record<string, unknown> = { role: message.role };
      if (message.content !== undefined && message.content !== null) entry.content = message.content;
      else if (message.role === "assistant" && message.tool_calls) entry.content = null;
      if (message.tool_calls) entry.tool_calls = message.tool_calls;
      if (message.tool_call_id) entry.tool_call_id = message.tool_call_id;
      if (message.name) entry.name = message.name;
      // Reasoning-capable models (e.g. OpenCode Zen thinking mode, DeepSeek) require the
      // reasoning_content of a prior assistant message to be passed back unchanged on the
      // next request; omitting it triggers a 400 invalid_request_error.
      if (message.reasoning_content) entry.reasoning_content = message.reasoning_content;
      built.push(entry);
    }
    return built;
  }
}

/**
 * Prepend the one-time context blocks to the user's FIRST message of a chat: the pre-added memory
 * files (MEMORY.md/SOUL.md/USER.md), then the knowledge-base notice (only present when the user has
 * knowledge files). Each block is added only when non-empty; the raw message is returned unchanged
 * when there is nothing to add.
 */
function withFirstMessageContext(
  userMessage: string,
  memoryContext: string,
  knowledgeContext: string,
): string {
  const blocks = [memoryContext.trim(), knowledgeContext.trim()].filter((b) => b.length > 0);
  if (blocks.length === 0) return userMessage;
  return `${blocks.join("\n\n")}\n\n${userMessage}`;
}

function normalize(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Merge streamed tool-call fragments into complete tool calls, keyed by index. */
function mergeToolCalls(accumulated: ToolCall[], incoming: ToolCallDelta[]): ToolCall[] {
  const merged = accumulated.slice();
  for (const chunk of incoming) {
    const index = chunk.index ?? merged.length;
    while (merged.length <= index) {
      merged.push({ id: null, type: "function", function: { name: "", arguments: "" } });
    }
    const target = merged[index]!;
    if (chunk.id) target.id = chunk.id;
    if (chunk.function?.name) target.function.name += chunk.function.name;
    if (chunk.function?.arguments) target.function.arguments += chunk.function.arguments;
  }
  return merged;
}
