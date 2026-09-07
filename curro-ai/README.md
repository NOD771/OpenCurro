# GPTLoop AI

A fast, reliable, autonomous **local** coding agent — a second backend for this repo, built from
scratch in **TypeScript 7** on **Express**. It runs entirely on the machine where you start it: files
are created on your disk and shell commands run on your server. No sandbox, no sub-agents.

It follows the **ReAct** loop — Thought → Action → Observation → Repeat — with real, native LLM tool
calling and true token-by-token SSE streaming.

## Features

- **6 focused file/vision tools** (extensible registry): `file_read`, `file_write`, `file_list`, `str_replace`, `shall_tool`, `read_image` — plus web and sub-agent tools.
- **3 OpenAI-compatible providers** (extensible registry): OpenRouter, Groq, NVIDIA NIM.
- **Native function calling** only — tools are defined with zod schemas that are converted to JSON Schema
  and passed to the model in the `tools` parameter. Tool calls come from the model's `tool_calls`, never
  parsed out of text.
- **Real-time SSE streaming** of reasoning, answer tokens, tool calls and tool results, with a resilient
  replayable event buffer so clients can reconnect (`since_event_id`).
- **Autonomous harness**: up to `MAX_ITERATIONS` (default **1000**) Thought→Action→Observation cycles per turn.
- **Workspace-sandboxed file tools**: every path is resolved inside `WORKSPACE_ROOT` (default
  `curro-ai/workspace`) and cannot escape it — no permission errors.

## Project layout

```
curro-ai/
├── package.json / tsconfig.json / .env.example
└── src/
    ├── index.ts               # Express bootstrap
    ├── config.ts              # env config + workspace
    ├── agents/
    │   ├── agent.ts           # the ReAct main loop / harness
    │   ├── systemprompt.ts    # professional coding-agent system prompt
    │   ├── tools/             # file_read, file_write, file_list, str_replace, shall_tool, read_image + registry
    │   └── providers/         # openrouter.ts, groq.ts, nvidia.ts + base + registry
    ├── api/                   # chat (SSE), providers, files
    ├── services/             # session store + event buffer
    └── utils/                # paths, json, sse
```

## Setup

```bash
cd curro-ai
cp .env.example .env      # optional; sane defaults are built in
npm install
npm run dev               # http://localhost:8787 (tsx watch)
# or
npm start                 # production run
npm run typecheck         # TypeScript 7 type check
```

## Configuration (`.env`)

| Variable          | Default                | Description                                        |
| ----------------- | ---------------------- | -------------------------------------------------- |
| `PORT`            | `8787`                 | Express port                                       |
| `WORKSPACE_ROOT`  | `curro-ai/workspace`   | Directory all file tools are sandboxed to          |
| `MAX_ITERATIONS`  | `1000`                 | Max ReAct iterations per turn                      |
| `CORS_ORIGINS`    | `*`                    | Comma-separated allowed origins, or `*`            |
| `SHELL_TIMEOUT_MS`| `180000`               | Timeout for `shall_tool` foreground commands       |
| `VISION_MODEL_PATTERNS` | *(empty)*       | Extra model-id substrings treated as vision capable (read_image) |
| `TEXT_ONLY_MODEL_PATTERNS` | *(empty)*   | Extra model-id substrings treated as text-only (read_image) |

## HTTP API

- `GET  /health` — status, workspace, registered providers/tools.
- `GET  /api/providers` — list providers.
- `POST /api/providers/models` — `{ provider, api_key, base_url? }` → available models.
- `POST /api/chat/stream` — start a turn and stream SSE, or reconnect to an in-flight turn.
  - Start: `{ chat_id, user_message, provider, model, api_key, base_url?, history?, max_iterations?, since_event_id? }`
  - Reconnect: `{ chat_id, since_event_id }`
- `POST /api/chat/abort/:chatId` — cancel the running turn.
- `GET  /api/files/tree?path=` — workspace file tree (for the explorer).
- `GET  /api/files/read?path=` — read a workspace file.

### SSE events

`iteration`, `status` (thinking), `reasoning`, `token`, `tool_call`, `tool_result`,
`message_complete`, `error`, `done`.

## Adding a tool

Create a file in `src/agents/tools/` exporting a `Tool` via `defineTool({ name, description, schema, label, execute })`
and register it in `src/agents/tools/index.ts`. The zod `schema` is auto-converted to the model's
function schema and used to validate arguments.

## Adding a provider

Create `src/agents/providers/<name>.ts` exporting `new OpenAICompatibleProvider({ id, label, defaultBaseUrl })`
and register it in `src/agents/providers/registry.ts`.
