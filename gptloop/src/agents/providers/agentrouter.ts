import { OpenAICompatibleProvider } from "./base.js";
import type { ProviderModel } from "./types.js";

/**
 * AgentRouter (https://agentrouter.org/docs/index.html) is a non-profit, OpenAI-compatible
 * gateway that proxies 30+ upstream models (Anthropic, OpenAI, DeepSeek, Zhipu AI, Google…)
 * behind a single key at `https://agentrouter.org/v1`. It exposes the standard OpenAI
 * `chat/completions` schema and authenticates with `Authorization: Bearer sk-…`.
 *
 * Its `/models` endpoint is gated (and can return an unexpected shape / 4xx), so — like the
 * Cohere provider — we try the live list first and fall back to a curated set of known
 * models so the dropdown is never empty when the endpoint is unavailable.
 */
class AgentRouterProvider extends OpenAICompatibleProvider {
  override async listModels(apiKey: string, baseUrl?: string): Promise<ProviderModel[]> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl(baseUrl)}/models`, {
        method: "GET",
        headers: this.headers(apiKey),
      });
    } catch {
      return this.fallbackModels();
    }

    if (!response.ok) {
      return this.fallbackModels();
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return this.fallbackModels();
    }

    const items: Array<Record<string, unknown>> = Array.isArray(payload)
      ? (payload as Array<Record<string, unknown>>)
      : (((payload as Record<string, unknown>)?.data as Array<Record<string, unknown>>) ?? []);
    if (!Array.isArray(items) || items.length === 0) {
      return this.fallbackModels();
    }

    const models: ProviderModel[] = [];
    for (const item of items) {
      const id = (item.id as string) || (item.name as string);
      if (!id) continue;
      models.push({
        id,
        provider: this.metadata.id,
        label: id,
        owned_by: (item.owned_by as string) || (item.provider as string) || null,
        context_window:
          (item.context_length as number) || (item.max_context_window as number) || null,
      });
    }
    if (models.length === 0) return this.fallbackModels();
    models.sort((a, b) => a.label.toLowerCase().localeCompare(b.label.toLowerCase()));
    return models;
  }

  private fallbackModels(): ProviderModel[] {
    const ids = [
      "claude-opus-4-8",
      "claude-opus-5",
      "claude-sonnet-4-5-20250929",
      "gpt-5.6-sol",
      "gpt-5",
      "gpt-4o",
      "gemini-3-pro",
      "deepseek-v4-flash",
      "deepseek-r1",
      "glm-4.5-air",
    ];
    return ids.map((id) => ({
      id,
      provider: this.metadata.id,
      label: id,
      owned_by: null,
      context_window: null,
    }));
  }
}

export const agentrouterProvider = new AgentRouterProvider({
  id: "agentrouter",
  label: "AgentRouter",
  defaultBaseUrl: "https://agentrouter.org/v1",
});
