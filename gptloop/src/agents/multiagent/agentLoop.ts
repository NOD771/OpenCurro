import type { Provider, ToolCall, ToolCallDelta } from "../providers/types.js";
import type { ToolRegistry, OpenAIToolSchema } from "../tools/registry.js";
import type { StoredMessage } from "../../services/sessionStore.js";
import type { ToolContext, ToolResult } from "../tools/types.js";
import { safeJsonParse } from "../../utils/json.js";
import {
  buildImageMessage,
  extractImageAttachment,
  withoutImageAttachment,
} from "../tools/readImage.js";
import {
  EV_AGENT_REASONING,
  EV_AGENT_SEGMENT,
  EV_AGENT_TOKEN,
  EV_AGENT_TOOL_CALL,
  EV_AGENT_TOOL_RESULT,
  type TeamAgentRunResult,
} from "./types.js";

/**
 * Parameters for one team agent's streaming Thought -> Action -> Observation loop. `messages` is
 * mutated in place so the caller keeps the agent's growing conversation. Every event is emitted via
 * `send`, which the caller has already stamped with the agent id/role so the UI can attribute it.
 */
export interface TeamAgentLoopParams {
  provider: Provider;
  tools: ToolRegistry;
  model: string;
  apiKey: string;
  baseUrl?: string;
  temperature?: number;
  effort?: string;
  systemPrompt: string;
  /** The agent's conversation (mutated in place). */
  messages: StoredMessage[];
  /** Tool names this agent may actually execute. */
  allowedTools: Set<string>;
  /** OpenAI tool schemas advertised to the model for this agent. */
  toolSchemas: OpenAIToolSchema[];
  /** The tool-execution context (already carries the team runtime + shared runtimes). */
  toolCtx: ToolContext;
  /** Emit an SSE event already stamped with this agent's id/role. */
  send: (event: string, data: Record<string, unknown>) => void;
  signal?: AbortSignal;
}

/**
 * Execute one team agent's UNBOUNDED agentic loop (no iteration limit — the agent stops only when it
 * produces a final message with no tool calls, or the turn is aborted). Streams team_agent_* events.
 * Returns the agent's final output text. Never throws — provider/tool failures resolve to a failed
 * result so the orchestrator keeps the team alive.
 */
export async function runTeamAgentLoop(params: TeamAgentLoopParams): Promise<TeamAgentRunResult> {
  const { provider, tools, messages, allowedTools, toolSchemas, toolCtx, send, signal } = params;

  const answerAcrossTurns: string[] = [];

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (signal?.aborted) return { ok: false, aborted: true, output: "" };

      const answerParts: string[] = [];
      const reasoningParts: string[] = [];
      let toolCalls: ToolCall[] = [];
      let finishReason: string | null = null;

      try {
        const stream = provider.streamChatCompletion({
          apiKey: params.apiKey,
          model: params.model,
          messages: buildProviderMessages(params.systemPrompt, messages),
          tools: toolSchemas,
          baseUrl: params.baseUrl,
          temperature: params.temperature,
          effort: params.effort,
          signal,
        });

        for await (const delta of stream) {
          if (delta.reasoning) {
            const cleaned = normalize(delta.reasoning);
            reasoningParts.push(cleaned);
            send(EV_AGENT_REASONING, { value: cleaned });
          }
          if (delta.text) {
            const cleaned = normalize(delta.text);
            answerParts.push(cleaned);
            send(EV_AGENT_TOKEN, { value: cleaned });
          }
          if (delta.toolCalls) toolCalls = mergeToolCalls(toolCalls, delta.toolCalls);
          if (delta.finishReason) finishReason = delta.finishReason;
        }
      } catch (error) {
        if (signal?.aborted) return { ok: false, aborted: true, output: "" };
        const message = `Provider error: ${messageOf(error)}`;
        return { ok: false, aborted: false, output: "", error: message };
      }

      const namedCalls = toolCalls.filter((c) => c.function.name);
      const hasToolCalls = namedCalls.length > 0 || finishReason === "tool_calls";

      if (hasToolCalls && namedCalls.length > 0) {
        const assistantMessage: StoredMessage = {
          role: "assistant",
          content: answerParts.join("") || null,
          tool_calls: namedCalls.map((c) => ({
            id: c.id,
            type: c.type,
            function: { name: c.function.name, arguments: c.function.arguments },
          })),
        };
        if (reasoningParts.length > 0) assistantMessage.reasoning_content = reasoningParts.join("");
        messages.push(assistantMessage);
        if (answerParts.length > 0) answerAcrossTurns.push(answerParts.join(""));

        const imageMessages: StoredMessage[] = [];

        for (const toolCall of namedCalls) {
          const name = toolCall.function.name;
          const args = safeJsonParse(toolCall.function.arguments);
          const label = tools.label(name, args);

          send(EV_AGENT_TOOL_CALL, { tool_id: toolCall.id, name, args, label });

          const result: ToolResult = allowedTools.has(name)
            ? await tools.execute(name, args, toolCtx)
            : {
                ok: false,
                error: {
                  code: "tool_not_permitted",
                  message: `This team agent is not permitted to use the tool "${name}".`,
                },
              };

          const resultForModel = withoutImageAttachment(result);
          const imageAttachment = extractImageAttachment(result);

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id ?? undefined,
            name,
            content: JSON.stringify(resultForModel),
          });

          if (imageAttachment) imageMessages.push(buildImageMessage(imageAttachment));

          send(EV_AGENT_TOOL_RESULT, {
            tool_id: toolCall.id,
            name,
            ok: result.ok,
            result: resultForModel,
            label,
          });
        }

        for (const imageMessage of imageMessages) messages.push(imageMessage);
        continue;
      }

      // No tool calls -> the agent's final message for this run.
      const finalContent = answerParts.join("");
      const finalMessage: StoredMessage = { role: "assistant", content: finalContent };
      if (reasoningParts.length > 0) finalMessage.reasoning_content = reasoningParts.join("");
      messages.push(finalMessage);

      const output = finalContent.trim() || answerAcrossTurns.join("\n").trim();
      send(EV_AGENT_SEGMENT, { content: output });
      return { ok: true, aborted: false, output };
    }
  } catch (error) {
    return { ok: false, aborted: false, output: "", error: `Agent failed: ${messageOf(error)}` };
  }
}

/** Build provider (OpenAI) messages: system prompt followed by the agent's conversation. */
function buildProviderMessages(
  systemPrompt: string,
  messages: StoredMessage[],
): Array<Record<string, unknown>> {
  const built: Array<Record<string, unknown>> = [{ role: "system", content: systemPrompt }];
  for (const message of messages) {
    const entry: Record<string, unknown> = { role: message.role };
    if (message.content !== undefined && message.content !== null) entry.content = message.content;
    else if (message.role === "assistant" && message.tool_calls) entry.content = null;
    if (message.tool_calls) entry.tool_calls = message.tool_calls;
    if (message.tool_call_id) entry.tool_call_id = message.tool_call_id;
    if (message.name) entry.name = message.name;
    if (message.reasoning_content) entry.reasoning_content = message.reasoning_content;
    built.push(entry);
  }
  return built;
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
