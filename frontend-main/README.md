# Haku — frontend-main

A quiet, streaming-first workspace for the **gptloop** agent. Chat, memory, knowledge, and
skills, with a resilient, resumable networking layer so the agent keeps running even when the
browser refreshes, disconnects, or the network gets slow.

Built with **React 19 · Vite 8 · Tailwind v4 · Zustand 5 · TypeScript 7**.

> Full design & architecture notes: [`../specs/design.md`](../specs/design.md).

## Quick start

```bash
# 1) start the backend (in ../gptloop)
cd ../gptloop && npm install && npm start      # http://localhost:8787

# 2) start this frontend
npm install
npm run dev                                      # http://localhost:5173
```

The browser only ever calls this app's own `/api/*` routes; Vite proxies them to the backend, so
`localhost` stays server-side and SSE keeps working through a proxy URL.

## Configuration

Copy `.env.example` → `.env`:

```
GPTLOOP_API_URL=http://localhost:8787   # backend base URL (proxied)
VITE_PORT=5173                        # dev server port
```

Provider, model, API keys, web-search/fetch providers, and custom OpenAI-compatible providers are
configured in-app via **Settings** (stored locally in the browser).

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server (proxy to backend) |
| `npm run build` | `tsc -b` + production build |
| `npm run typecheck` | strict type check |
| `npm run preview` | preview the production build (also proxied) |
| `npm run lint` | oxlint |

## What makes it resilient

- **Server-owned runs.** The agent runs on the backend; the browser is just a client. After a
  refresh it re-attaches to the running run, replays buffered output in a flash, and continues.
- **A disconnect never cancels.** Only pressing **Stop** aborts a run.
- **Slow ≠ offline.** No request timeouts anywhere — 500 KB/s down to <1 KB/s keeps streaming.
  Only a fully offline device shows a Network status; otherwise it patiently reconnects.

## Structure

```
src/
├── app/         shell, entry, styles, typed /api route registry
├── components/  Rail · TopBar · Composer · chat/ · panels/ · editors/ · overlays/ · ui/
├── hooks/       useChatStream · useConnectionWatch · useAutoScroll
├── lib/         api · net · sse · chatStream · streamBatcher · streamDispatch · defaults
├── store/       zustand store (persisted, debounced)
├── types/ utils/
```
