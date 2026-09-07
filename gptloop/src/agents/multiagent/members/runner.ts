import type { Provider } from "../../providers/types.js";
import type { ToolRegistry, OpenAIToolSchema } from "../../tools/registry.js";
import type { StoredMessage } from "../../../services/sessionStore.js";
import type { ToolContext } from "../../tools/types.js";
import { runTeamAgentLoop } from "../agentLoop.js";
import { buildMemberSystemPrompt } from "../systemprompt.js";
import type {
  AgentTeamDefinition,
  TeamAgentRunResult,
  TeamMemberDefinition,
} from "../types.js";

/**
 * The MEMBER agent runtime. A member is a real, independent specialist agent: it receives delegated
 * tasks from the leader (and, when enabled, messages from teammates), completes them autonomously
 * with the full tool surface plus the member-only collaboration tools, and reports back to the
 * leader. This wrapper builds the member's system prompt and runs one streaming agentic loop; the
 * orchestrator drives when it runs.
 */
export interface RunMemberAgentArgs {
  member: TeamMemberDefinition;
  team: AgentTeamDefinition;
  workspaceRoot: string;
  sendMessageEnabled: boolean;
  /** The member's conversation (mutated in place across runs and turns). */
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

export async function runMemberAgent(args: RunMemberAgentArgs): Promise<TeamAgentRunResult> {
  const systemPrompt = buildMemberSystemPrompt(
    args.member,
    args.team,
    args.workspaceRoot,
    args.sendMessageEnabled,
  );
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
