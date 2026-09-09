import type { MainAgentPrompt } from "@/types";

/**
 * Custom System Prompts for the built-in Main Agent.
 *
 * A Main Agent prompt is a named, user-authored system prompt for the EXISTING Main Agent — it is NOT
 * a new agent, sub-agent, or team. The user can save many prompts and activate exactly one; the
 * active prompt is sent with each turn (as `system_prompt_override`) and used verbatim as the Main
 * Agent's system prompt. When none is active, the Main Agent keeps using its built-in system prompt.
 *
 * Configs persist in the backend SQLite database via the shared app-state sync (`mainAgentPrompts` +
 * `activeMainAgentPromptId`), exactly like Custom Agents. This module owns the defensive
 * normalization and the active-prompt lookup.
 */

/** Defensive normalize of one stored/loaded prompt into a well-formed value, or null when unusable. */
export function normalizeMainAgentPrompt(raw: unknown): MainAgentPrompt | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id : "";
  const name = typeof r.name === "string" ? r.name.trim() : "";
  if (!id || !name) return null;
  const content =
    typeof r.content === "string"
      ? r.content
      : typeof (r as { system_prompt?: unknown }).system_prompt === "string"
        ? ((r as { system_prompt: string }).system_prompt)
        : typeof (r as { systemPrompt?: unknown }).systemPrompt === "string"
          ? ((r as { systemPrompt: string }).systemPrompt)
          : "";
  return {
    id,
    name,
    description: typeof r.description === "string" ? r.description : "",
    content,
    createdAt: typeof r.createdAt === "number" ? r.createdAt : Date.now(),
    updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : Date.now(),
  };
}

/** Normalize a persisted array of prompts, dropping malformed entries and duplicate ids. */
export function normalizeMainAgentPrompts(raw: unknown): MainAgentPrompt[] {
  if (!Array.isArray(raw)) return [];
  const out: MainAgentPrompt[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const prompt = normalizeMainAgentPrompt(item);
    if (!prompt || seen.has(prompt.id)) continue;
    seen.add(prompt.id);
    out.push(prompt);
  }
  return out;
}

/** The active prompt (by id) from a list, or null when the id is null / not found. */
export function findActiveMainAgentPrompt(
  prompts: MainAgentPrompt[],
  activeId: string | null,
): MainAgentPrompt | null {
  if (!activeId) return null;
  return prompts.find((p) => p.id === activeId) ?? null;
}
