import type { AppStateRepo } from "../../database/repositories/appStateRepo.js";
import { createMainAgentPromptId } from "../../database/ids.js";
import {
  normalizeMainAgentPromptConfig,
  type MainAgentPromptConfig,
} from "./configuration.js";

/** Fields accepted when creating a Main Agent prompt (id/timestamps are assigned by the manager). */
export interface CreateMainAgentPromptInput {
  name: string;
  description?: string;
  content: string;
}

/** Fields accepted when updating a Main Agent prompt (all optional; id/createdAt are immutable). */
export interface UpdateMainAgentPromptInput {
  name?: string;
  description?: string;
  content?: string;
}

/**
 * MainAgentPromptManager — the persistent store and source of truth for the Main Agent's custom
 * system prompts and which one is currently active.
 *
 * It reuses the application's existing persistence architecture: prompts live in the SQLite-backed
 * `app_state` document keyed `mainAgentPrompts` (the same document the frontend syncs to), and the
 * active-prompt selection lives under `activeMainAgentPromptId`. No new persistence system is
 * introduced, and nothing about the Main Agent architecture changes — these prompts only alter the
 * instructions the built-in Main Agent runs with.
 */
export class MainAgentPromptManager {
  constructor(private readonly appState: AppStateRepo) {}

  /** All stored prompts, normalized and newest-first (by createdAt). */
  list(): MainAgentPromptConfig[] {
    const raw = this.appState.get("mainAgentPrompts");
    if (!Array.isArray(raw)) return [];
    const now = Date.now();
    const out: MainAgentPromptConfig[] = [];
    const seen = new Set<string>();
    for (const item of raw) {
      const config = normalizeMainAgentPromptConfig(item, { id: createMainAgentPromptId(), now });
      if (!config || seen.has(config.id)) continue;
      seen.add(config.id);
      out.push(config);
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  }

  /** One prompt by id, or null when it does not exist. */
  get(id: string): MainAgentPromptConfig | null {
    if (!id) return null;
    return this.list().find((p) => p.id === id) ?? null;
  }

  /** The id of the currently active prompt, or null when none is active. */
  getActiveId(): string | null {
    const raw = this.appState.get("activeMainAgentPromptId");
    return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
  }

  /** The currently active prompt config, or null when none is active / it no longer exists. */
  getActive(): MainAgentPromptConfig | null {
    const id = this.getActiveId();
    if (!id) return null;
    return this.get(id);
  }

  /**
   * The active prompt's text if there is an active prompt with non-empty content, else null. This is
   * what the Main Agent uses as its system-prompt override; null means "fall back to the built-in
   * Main Agent system prompt".
   */
  getActivePromptText(): string | null {
    const active = this.getActive();
    if (!active) return null;
    const text = active.content.trim();
    return text.length > 0 ? active.content : null;
  }

  /** Create and persist a new prompt. Throws when the name is empty. */
  create(input: CreateMainAgentPromptInput): MainAgentPromptConfig {
    const name = (input.name ?? "").trim();
    if (!name) throw new Error("A prompt name is required.");
    const now = Date.now();
    const config: MainAgentPromptConfig = {
      id: createMainAgentPromptId(),
      name,
      description: (input.description ?? "").trim(),
      content: input.content ?? "",
      createdAt: now,
      updatedAt: now,
    };
    const all = this.list();
    this.persist([config, ...all]);
    return config;
  }

  /** Update an existing prompt. Returns the updated config, or null when it does not exist. */
  update(id: string, patch: UpdateMainAgentPromptInput): MainAgentPromptConfig | null {
    const all = this.list();
    const index = all.findIndex((p) => p.id === id);
    if (index === -1) return null;
    const existing = all[index]!;
    const updated: MainAgentPromptConfig = {
      ...existing,
      name: patch.name !== undefined ? patch.name.trim() || existing.name : existing.name,
      description: patch.description !== undefined ? patch.description.trim() : existing.description,
      content: patch.content !== undefined ? patch.content : existing.content,
      updatedAt: Date.now(),
    };
    const next = all.slice();
    next[index] = updated;
    this.persist(next);
    return updated;
  }

  /** Delete a prompt by id. Returns true when one was removed. Clears the active id if it matched. */
  delete(id: string): boolean {
    const all = this.list();
    const next = all.filter((p) => p.id !== id);
    if (next.length === all.length) return false;
    this.persist(next);
    if (this.getActiveId() === id) this.setActive(null);
    return true;
  }

  /**
   * Set (or clear) the active prompt. Passing null — or an id that does not exist — clears the
   * selection so the Main Agent falls back to its built-in system prompt. Only one prompt is ever
   * active at a time. Returns the active prompt (or null).
   */
  setActive(id: string | null): MainAgentPromptConfig | null {
    if (!id) {
      this.appState.set("activeMainAgentPromptId", null);
      return null;
    }
    const found = this.get(id);
    if (!found) {
      this.appState.set("activeMainAgentPromptId", null);
      return null;
    }
    this.appState.set("activeMainAgentPromptId", found.id);
    return found;
  }

  private persist(configs: MainAgentPromptConfig[]): void {
    this.appState.set("mainAgentPrompts", configs);
  }
}
