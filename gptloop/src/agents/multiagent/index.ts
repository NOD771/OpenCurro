import type { AppConfig } from "../../config.js";
import type { ProviderRegistry } from "../providers/registry.js";
import { resolveProvider } from "../providers/registry.js";
import type { Provider } from "../providers/types.js";
import type { ToolRegistry } from "../tools/index.js";
import type { ChatSession } from "../../services/sessionStore.js";
import type { SessionEventBuffer } from "../../services/eventBuffer.js";
import type { WebToolsConfig } from "../tools/types.js";
import { createMemoryRuntime } from "../memory.js";
import { createKnowledgeRuntime } from "../knowledge.js";
import { createSkillRuntime } from "../skills.js";
import { mergeDefaultSkills, resolveDefaultSkills } from "../skills/index.js";
import { createTodoRuntime } from "../todos.js";
import { resolveDefaultSubAgents } from "../sub-agents/index.js";
import { MultiAgentSessionStore } from "./store.js";
import { TeamOrchestrator } from "./runtime.js";
import type { RunTeamRequest } from "./types.js";

export type { AgentTeamDefinition, TeamMemberDefinition, RunTeamRequest } from "./types.js";
export { MultiAgentSessionStore } from "./store.js";

/**
 * The multi-agent team runner — the team counterpart of AgentRunner. It drives a whole agent team
 * (head + members) for one chat turn, streaming every agent's output onto the SAME turn event
 * buffer the single agent uses, so resume/replay/persistence all work unchanged. Agent contexts
 * persist across turns via an in-memory session store, so the team keeps its full context.
 */
export class MultiAgentRunner {
  private readonly store = new MultiAgentSessionStore();

  constructor(
    private readonly providers: ProviderRegistry,
    private readonly tools: ToolRegistry,
    private readonly config: AppConfig,
  ) {}

  async run(
    request: RunTeamRequest,
    session: ChatSession,
    buffer: SessionEventBuffer,
    signal: AbortSignal,
  ): Promise<void> {
    const send = (event: string, data: Record<string, unknown>) => buffer.append(event, data);

    try {
      let provider: Provider;
      try {
        provider = resolveProvider(this.providers, request.provider, request.customProvider);
      } catch (error) {
        send("error", { code: "provider_error", message: messageOf(error) });
        send("done", { ok: false });
        return;
      }

      if (!request.team || !request.team.leader_name?.trim()) {
        send("error", { code: "invalid_team", message: "No valid agent team was provided." });
        send("done", { ok: false });
        return;
      }

      // Shared team tooling — one memory/knowledge/skill/todo surface for the whole team.
      const memory = createMemoryRuntime(request.memory ?? []);
      const knowledge = createKnowledgeRuntime(request.knowledge ?? []);
      const defaultSkills = await resolveDefaultSkills();
      const skills = createSkillRuntime(mergeDefaultSkills(defaultSkills, request.skills ?? []));
      const todos = createTodoRuntime(request.todos ?? []);
      const subAgentDefinitions = await resolveDefaultSubAgents();

      const web: WebToolsConfig = {
        searchProvider: request.searchProvider ?? this.config.searchProvider,
        fetchProvider: request.fetchProvider ?? this.config.fetchProvider,
        tavilyApiKey: request.tavilyApiKey || this.config.tavilyApiKey || undefined,
        exaApiKey: request.exaApiKey || this.config.exaApiKey || undefined,
        serpapiApiKey: request.serpapiApiKey || this.config.serpapiApiKey || undefined,
        firecrawlApiKey: request.firecrawlApiKey || this.config.firecrawlApiKey || undefined,
      };

      const teamSession = this.store.getOrCreate(request.chatId, request.team.id);
      const leaderKey = request.team.leader_name.trim().toLowerCase();
      const headCtx = teamSession.contexts.get(leaderKey);
      const isFirstMessage = !headCtx || !headCtx.messages.some((m) => m.role === "user");

      const firstMessageContext = isFirstMessage
        ? [memory.firstMessageContext().trim(), knowledge.firstMessageContext().trim()]
            .filter((b) => b.length > 0)
            .join("\n\n")
        : "";

      // Mirror the user message into the chat session transcript for persistence + the sidebar title.
      session.messages.push({ role: "user", content: request.userMessage });

      const orchestrator = new TeamOrchestrator({
        provider,
        tools: this.tools,
        config: this.config,
        team: request.team,
        sendMessageToTeamEnabled: request.sendMessageToTeamEnabled,
        contexts: teamSession.contexts,
        chatId: request.chatId,
        model: request.model,
        apiKey: request.apiKey,
        baseUrl: request.baseUrl,
        temperature: request.temperature,
        effort: request.effort,
        web,
        memory,
        knowledge,
        skills,
        todos,
        subAgentDefinitions,
        userSubAgents: request.subAgents ?? [],
        send,
        signal,
      });

      await orchestrator.run(request.userMessage, firstMessageContext);

      if (signal.aborted) {
        send("done", { ok: false, aborted: true });
      } else {
        send("done", { ok: true });
      }
    } catch (error) {
      send("error", { code: "team_crashed", message: messageOf(error) });
      send("done", { ok: false });
    } finally {
      buffer.setDone();
      session.running = false;
      session.updatedAt = Date.now();
    }
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
