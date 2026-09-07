/**
 * API routes — the single source of truth for every `/api/*` endpoint the frontend
 * calls. In the browser these same-origin routes are served by Vite's dev/preview
 * proxy, which forwards them to the gptloop backend (see `vite.config.ts`).
 *
 * This mirrors the Next.js App Router `src/app/api/<route>/route.ts` layout that
 * `frontend-2` used, expressed as a typed registry for the Vite/React app.
 */

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export interface ApiRoute {
  /** Logical name used by the client (e.g. `chat.stream`). */
  name: string;
  method: HttpMethod;
  /** Path template, e.g. `/api/chat/abort/:chatId`. `:name` segments become params. */
  path: string;
  /** Description of the backend endpoint this route proxies to. */
  description: string;
}

export const API_ROUTES = {
  providersList: {
    name: "providers.list",
    method: "GET",
    path: "/api/providers",
    description: "List the configured LLM providers.",
  },
  providersModels: {
    name: "providers.models",
    method: "POST",
    path: "/api/providers/models",
    description: "Fetch the models available for a provider given its API key.",
  },
  toolsList: {
    name: "tools.list",
    method: "GET",
    path: "/api/tools",
    description: "List the tools a sub-agent can be granted (restricted sub-agent tools excluded).",
  },
  customAgentToolsList: {
    name: "tools.customAgent",
    method: "GET",
    path: "/api/tools/custom-agent",
    description: "List the tools a Custom Agent can be granted (all main-agent tools minus multi-agent tools).",
  },
  systemPrompt: {
    name: "systemPrompt.get",
    method: "GET",
    path: "/api/system-prompt",
    description: "Fetch the built Main Agent system prompt (used to pre-fill a Custom Agent's prompt).",
  },
  customAgentsList: {
    name: "customAgents.list",
    method: "GET",
    path: "/api/custom-agents",
    description: "List the persisted Custom Agents (top-level, user-created Main Agents).",
  },
  chatStream: {
    name: "chat.stream",
    method: "POST",
    path: "/api/chat/stream",
    description: "Start a turn (or reconnect to an in-flight turn) and stream SSE.",
  },
  chatAbort: {
    name: "chat.abort",
    method: "POST",
    path: "/api/chat/abort/:chatId",
    description: "Cancel the running turn for a chat session.",
  },
  chatPlanDecision: {
    name: "chat.plan.decision",
    method: "POST",
    path: "/api/chat/plan/:chatId/:toolCallId",
    description: "Submit the user's decision (approve / cancel / edited) for a submitted plan.",
  },
  chatQuestionAnswer: {
    name: "chat.question.answer",
    method: "POST",
    path: "/api/chat/question/:chatId/:toolCallId",
    description: "Submit the user's answers to the ask_question_to_user tool.",
  },
  filesTree: {
    name: "files.tree",
    method: "GET",
    path: "/api/files/tree",
    description: "Read the workspace file tree (bounded) for the explorer.",
  },
  filesRead: {
    name: "files.read",
    method: "GET",
    path: "/api/files/read",
    description: "Read a single workspace file's contents.",
  },
  filesPreview: {
    name: "files.preview",
    method: "GET",
    path: "/api/files/preview",
    description: "Stream a workspace file inline for browser preview.",
  },
  filesDownload: {
    name: "files.download",
    method: "GET",
    path: "/api/files/download",
    description: "Download a workspace file as an attachment.",
  },
  scrapeUrl: {
    name: "scrape.url",
    method: "POST",
    path: "/api/scrape",
    description: "Fetch a URL's content via the built-in scraper for the URL→knowledge flow.",
  },
  stateGet: {
    name: "state.get",
    method: "GET",
    path: "/api/state",
    description: "Load the full application state (settings, skills, memory, sessions…) from SQLite.",
  },
  stateSet: {
    name: "state.set",
    method: "POST",
    path: "/api/state/:key",
    description: "Persist one application-state document into the backend SQLite database.",
  },
  sessionGet: {
    name: "session.get",
    method: "GET",
    path: "/api/sessions/:id",
    description: "Load one session's snapshot + transcript from the backend SQLite database.",
  },
  sessionSave: {
    name: "session.save",
    method: "POST",
    path: "/api/sessions/:id",
    description: "Upsert a session (title and/or UI conversation snapshot) into SQLite.",
  },
  sessionDelete: {
    name: "session.delete",
    method: "DELETE",
    path: "/api/sessions/:id",
    description: "Delete a session and all of its stored data from SQLite.",
  },
  memoryAgentRuns: {
    name: "memoryAgent.runs",
    method: "GET",
    path: "/api/memory-agent/runs",
    description: "List background memory-agent sessions (queued/running/completed/failed) + counts.",
  },
  memoryAgentRunGet: {
    name: "memoryAgent.run.get",
    method: "GET",
    path: "/api/memory-agent/runs/:id",
    description: "Load one memory-agent run's metadata from the backend SQLite database.",
  },
  memoryAgentRunStream: {
    name: "memoryAgent.run.stream",
    method: "POST",
    path: "/api/memory-agent/runs/:id/stream",
    description: "Attach to a memory-agent run's SSE stream (live) or replay a finished run.",
  },
} as const satisfies Record<string, ApiRoute>;

export type ApiRouteName = keyof typeof API_ROUTES;

/** Fill `:param` segments of a route path and append an optional query string. */
export function routeUrl(
  route: ApiRoute,
  options?: { params?: Record<string, string>; query?: Record<string, string | number | undefined> },
): string {
  let path: string = route.path;
  for (const [key, value] of Object.entries(options?.params ?? {})) {
    path = path.replaceAll(`:${key}`, encodeURIComponent(value));
  }

  const query = options?.query;
  if (query) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        search.set(key, String(value));
      }
    }
    const qs = search.toString();
    if (qs) path += `?${qs}`;
  }
  return path;
}
