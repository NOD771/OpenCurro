import type { Provider } from "../../providers/types.js";
import type { ToolRegistry, OpenAIToolSchema } from "../../tools/registry.js";
import type { StoredMessage } from "../../../services/sessionStore.js";
import type { ToolContext } from "../../tools/types.js";
import { runTeamAgentLoop } from "../agentLoop.js";
import { buildCeoSystemPrompt } from "./systemprompt.js";
import type { AgentTeamDefinition, TeamAgentRunResult } from "../types.js";
import type { CeoAgentDefinition } from "./types.js";

/**
 * The CEO agent runtime. The CEO owns the conversation with the user: it plans at the organizational
 * level, assigns tasks to the teams' head/leaders, reviews their completion reports, and delivers the
 * final result. It is a real agent with the full tool surface plus the CEO-only tools
 * (assign_tasks_to_teams, list_teams). This wrapper builds the CEO's system prompt and runs one
 * streaming agentic loop; the CEO orchestrator drives when it runs. Reuses the exact same agent loop
 * (runTeamAgentLoop) as the head/member agents — the CEO layer is built ON the same multi-agent
 * runtime, not a fork of it.
 */
export interface RunCeoAgentArgs {
  ceo: CeoAgentDefinition;
  teams: AgentTeamDefinition[];
  workspaceRoot: string;
  /** The CEO's conversation (mutated in place across runs and turns). */
  messages: StoredMessage[];
  allowedTools: Set<string>;
  toolSchemas: OpenAIToolSchema[];
  toolCtx: ToolContext;
  send: (event: string, data: Record<string, unknown>) => void;
  signal?: AbortSignal;
  provider: Provider;
  tools: ToolRegistry;
  model: string;
  apiKey: string;
  baseUrl?: string;
  temperature?: number;
  effort?: string;
}

export async function runCeoAgent(args: RunCeoAgentArgs): Promise<TeamAgentRunResult> {
  const systemPrompt = buildCeoSystemPrompt(args.ceo, args.teams, args.workspaceRoot);
  return runTeamAgentLoop({
    provider: args.provider,
    tools: args.tools,
    model: args.model,
    apiKey: args.apiKey,
    baseUrl: args.baseUrl,
    temperature: args.temperature,
    effort: args.effort,
    systemPrompt,
    messages: args.messages,
    allowedTools: args.allowedTools,
    toolSchemas: args.toolSchemas,
    toolCtx: args.toolCtx,
    send: args.send,
    signal: args.signal,
  });
}
