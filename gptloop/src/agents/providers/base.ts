import type {
  ChatCompletionOptions,
  Provider,
  ProviderMetadata,
  ProviderModel,
  StreamDelta,
} from "./types.js";
import { applyReasoningEffort } from "./reasoning.js";

/**
 * Base implementation of an OpenAI-compatible provider (chat/completions + models endpoints
 * with SSE streaming and native tool calling). New providers extend this with just metadata.
 */
export class OpenAICompatibleProvider implements Provider {
  readonly metadata: ProviderMetadata;

  constructor(metadata: ProviderMetadata) {
    this.metadata = metadata;
  }

  protected baseUrl(override?: string): string {
    return (override || this.metadata.defaultBaseUrl).replace(/\/+$/, "");
  }

  protected headers(apiKey: string): Record<string, string> {
    return {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(this.metadata.extraHeaders ?? {}),
    };
  }

  async listModels(apiKey: string, baseUrl?: string): Promise<ProviderModel[]> {
    const response = await fetch(`${this.baseUrl(baseUrl)}/models`, {
      method: "GET",
      headers: this.headers(apiKey),
    });
    if (!response.ok) {
      throw new Error(`${this.metadata.label} models error ${response.status}: ${await safeText(response)}`);
    }
    const payload = (await response.json()) as unknown;
    const items: Array<Record<string, unknown>> = Array.isArray(payload)
      ? (payload as Array<Record<string, unknown>>)
      : (((payload as Record<string, unknown>)?.data as Array<Record<string, unknown>>) ?? []);

    const models: ProviderModel[] = [];
    for (const item of items) {
      const id = (item.id as string) || (item.name as string);
      if (!id) continue;
      const topProvider = item.top_provider as Record<string, unknown> | undefined;
      const architecture = item.architecture as Record<string, unknown> | undefined;
      models.push({
        id,
        provider: this.metadata.id,
        label: id,
        owned_by:
          (item.owned_by as string) ||
          (item.provider as string) ||
          (architecture?.tokenizer as string) ||
          null,
        context_window:
          (item.context_length as number) ||
          (topProvider?.context_length as number) ||
          (item.max_context_window as number) ||
          null,
      });
    }
    models.sort((a, b) => a.label.toLowerCase().localeCompare(b.label.toLowerCase()));
    return models;
  }

  /**
   * Build the JSON body for the chat/completions request. Subclasses override this
   * to tweak the payload (e.g. providers that reject `parallel_tool_calls`).
   */
  protected buildRequestBody(options: ChatCompletionOptions): Record<string, unknown> {
    const hasTools = Array.isArray(options.tools) && options.tools.length > 0;
    const body: Record<string, unknown> = {
      model: options.model,
      messages: options.messages,
      ...(hasTools ? { tools: options.tools, tool_choice: "auto", parallel_tool_calls: false } : {}),
      temperature: options.temperature ?? 0.2,
      stream: true,
    };
    return applyReasoningEffort(body, options.effort);
  }

  async *streamChatCompletion(options: ChatCompletionOptions): AsyncGenerator<StreamDelta, void, unknown> {
    const body = this.buildRequestBody(options);

    const response = await fetch(`${this.baseUrl(options.baseUrl)}/chat/completions`, {
      method: "POST",
      headers: this.headers(options.apiKey),
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(
        `${this.metadata.label} API error ${response.status}: ${await safeText(response)}`,
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let separatorIndex: number;
        while ((separatorIndex = buffer.indexOf("\n\n")) !== -1) {
          const rawEvent = buffer.slice(0, separatorIndex);
          buffer = buffer.slice(separatorIndex + 2);

          const dataLines: string[] = [];
          for (const line of rawEvent.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(":")) continue;
            if (trimmed.startsWith("data:")) dataLines.push(trimmed.slice(5).trim());
          }
          if (dataLines.length === 0) continue;

          const data = dataLines.join("\n");
          if (data === "[DONE]") return;

          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(data);
          } catch {
            continue;
          }

          const delta = this.parseChunk(parsed);
          if (delta) yield delta;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  protected parseChunk(event: Record<string, unknown>): StreamDelta | null {
    const choices = event.choices as Array<Record<string, unknown>> | undefined;
    const choice = choices?.[0] ?? {};
    const delta = (choice.delta as Record<string, unknown>) ?? {};
    const finishReason = (choice.finish_reason as string) ?? null;

    const text = extractText(delta.content);
    const reasoning = extractText(delta.reasoning ?? delta.reasoning_content ?? delta.reason ?? "");
    const toolCalls = (delta.tool_calls as StreamDelta["toolCalls"]) ?? undefined;

    if (!text && !reasoning && !toolCalls && !finishReason) return null;
    return {
      text: text || undefined,
      reasoning: reasoning || undefined,
      toolCalls,
      finishReason,
    };
  }
}

function extractText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item && typeof item === "object") {
          const record = item as Record<string, unknown>;
          return String(record.text ?? record.content ?? "");
        }
        return String(item);
      })
      .join("");
  }
  return String(value);
}

async function safeText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 500);
  } catch {
    return "<no body>";
  }
}
