import type { Provider } from "../../providers/types.js";
import type { ToolRegistry, OpenAIToolSchema } from "../../tools/registry.js";
import type { StoredMessage } from "../../../services/sessionStore.js";
import type { ToolContext } from "../../tools/types.js";
import { runTeamAgentLoop } from "../agentLoop.js";
import { buildHeadSystemPrompt } from "../systemprompt.js";
import type { AgentTeamDefinition, TeamAgentRunResult } from "../types.js";

/**
 * The HEAD (team leader) agent runtime. The head owns the conversation with the user: it plans,
 * delegates tasks to members, reviews their reports, and delivers the final result. It is a real
 * agent with the full tool surface plus the leader-only collaboration tools. This wrapper builds the
 * head's system prompt and runs one streaming agentic loop; the orchestrator drives when it runs.
 */
export interface RunHeadAgentArgs {
  team: AgentTeamDefinition;
  workspaceRoot: string;
  sendMessageEnabled: boolean;
  /** The head's conversation (mutated in place across runs and turns). */
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

export async function runHeadAgent(args: RunHeadAgentArgs): Promise<TeamAgentRunResult> {
  const systemPrompt = buildHeadSystemPrompt(args.team, args.workspaceRoot, args.sendMessageEnabled);
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
