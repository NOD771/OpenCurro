import type { AppConfig } from "../../config.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { ChatSession } from "../../services/sessionStore.js";
import type { SessionEventBuffer } from "../../services/eventBuffer.js";
import type { RunAgentRequest } from "../agent.js";
import type { CustomAgentConfig } from "./configuration.js";
import { resolveCustomAgentSystemPrompt, resolveCustomAgentTools } from "./loader.js";

/**
 * The minimal shape of the shared core agent runtime the Custom Agent runner delegates to. The
 * built-in `AgentRunner` satisfies this structurally, so both the default Main Agent and every
 * Custom Agent execute through the exact same runtime code (spec §11) — same execution lifecycle,
 * ReAct loop, native tool calling, streaming, cancellation, persistence, and memory-agent trigger.
 */
export interface CoreAgentRuntime {
  run(
    request: RunAgentRequest,
    session: ChatSession,
    buffer: SessionEventBuffer,
    signal: AbortSignal,
  ): Promise<void>;
}

/**
 * CustomAgentRunner — the dedicated runtime for executing Custom Agents.
 *
 * Architecturally a Custom Agent is a real, independent, TOP-LEVEL Main Agent (spec §5): this runner
 * does NOT wrap the Main Agent as a sub-agent, delegate to it, or require it to be running. It simply
 * parameterizes the SHARED core runtime with the Custom Agent's configuration:
 *   - its edited system prompt (used verbatim), and
 *   - its selected tools, resolved fresh against the live registry (latest schemas; removed tools
 *     dropped safely).
 * Everything else — streaming, tool execution, observations, session/state, error handling,
 * interruption, persistence, the background memory agent — is inherited unchanged from the core
 * runtime, giving Custom Agents full feature parity with the Main Agent.
 */
export class CustomAgentRunner {
  constructor(
    private readonly core: CoreAgentRuntime,
    private readonly tools: ToolRegistry,
    private readonly config: AppConfig,
  ) {}

  /**
   * Execute one autonomous turn for a Custom Agent. The turn runs through the shared core runtime
   * with the Custom Agent's system prompt and allowed tools applied via request overrides.
   */
  async run(
    request: RunAgentRequest,
    agent: CustomAgentConfig,
    session: ChatSession,
    buffer: SessionEventBuffer,
    signal: AbortSignal,
  ): Promise<void> {
    const resolved = resolveCustomAgentTools(this.tools, agent.selectedTools);
    const systemPrompt = resolveCustomAgentSystemPrompt(agent, this.config.workspaceRoot);

    // Announce which top-level agent is handling this turn (a Custom Agent, not a sub-agent) so the
    // UI/persistence can label it. Sent before the run so it is captured in the event log.
    buffer.append("custom_agent_active", {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      allowed_tools: resolved.allowed,
      missing_tools: resolved.missing,
    });

    const enriched: RunAgentRequest = {
      ...request,
      systemPromptOverride: systemPrompt,
      allowedToolNames: resolved.allowed,
      customAgent: agent,
    };

    await this.core.run(enriched, session, buffer, signal);
  }
}
