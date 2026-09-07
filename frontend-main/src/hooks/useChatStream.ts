import { useCallback, useEffect, useRef } from "react";
import { abortChat } from "@/lib/api";
import { runChatStream, type StreamPhase, type StreamResult } from "@/lib/chatStream";
import { StreamBatcher } from "@/lib/streamBatcher";
import { dispatchStreamEvent } from "@/lib/streamDispatch";
import { attachLatestMemoryAgentRun } from "@/lib/memoryAgent";
import { CUSTOM_PROVIDER_PREFIX, toCustomProviderConfig } from "@/lib/providers";
import { activeTeam } from "@/lib/defaultTeams";
import { useStore, type ActiveRun } from "@/store/useStore";
import { uid } from "@/utils/id";
import type {
  BackendMessage,
  BackendSkill,
  BackendSubAgent,
  ChatMessage,
  KnowledgeFile,
  MemoryFile,
  StreamRequest,
  TodoItem,
} from "@/types";

function phaseToConnection(phase: StreamPhase): void {
  const setConnection = useStore.getState().setConnection;
  if (phase === "offline") setConnection("offline");
  else if (phase === "reconnecting") setConnection("reconnecting");
  else setConnection(navigator.onLine === false ? "offline" : "online");
}

/** Build the wire payload for a turn from the current store state. */
function buildStartRequest(convId: string, text: string): StreamRequest {
  const store = useStore.getState();
  const { settings, customProviders } = store;
  const isCustom = settings.provider.startsWith(CUSTOM_PROVIDER_PREFIX);
  const customProvider = customProviders.find((p) => p.id === settings.provider);
  const apiKey = isCustom
    ? (customProvider?.apiKey ?? "")
    : (settings.apiKeys[settings.provider] ?? "");

  const conv = store.conversations.find((c) => c.id === convId);
  const history: BackendMessage[] = (conv?.messages ?? [])
    .filter((m) => m.content.trim().length > 0)
    .map((m) => ({ role: m.role, content: m.content }));

  const subAgents: BackendSubAgent[] = store.subAgents.map((a) => ({
    name: a.name,
    description: a.description,
    system_prompt: a.systemPrompt,
    tools: a.tools,
    enabled: a.enabled,
  }));

  const skills: BackendSkill[] = store.skills.map((sk) => {
    const entryName = sk.skillFile.trim() || "SKILL.md";
    const files = [
      { path: entryName, content: sk.skillContent },
      ...sk.files
        .filter((f) => f.path.trim().length > 0)
        .map((f) => ({ path: f.path.trim(), content: f.content })),
    ];
    return {
      name: sk.name,
      description: sk.description,
      skill_file: entryName,
      files,
      enabled: sk.enabled,
    };
  });

  const todos: TodoItem[] = store.todos;
  const memory: MemoryFile[] = store.memory;
  const knowledge: KnowledgeFile[] = store.knowledge;

  // Multi-agent team mode: when enabled and a team is active, route the turn through the team head.
  const teamsEnabled = settings.enableAgentTeams === "yes";
  const team = teamsEnabled ? activeTeam(store.agentTeams) : null;
  const backendTeam = team
    ? {
        id: team.id,
        name: team.name,
        leader_name: team.leaderName,
        leader_system_prompt: team.leaderSystemPrompt,
        members: team.members
          .filter((m) => m.name.trim().length > 0)
          .map((m) => ({
            name: m.name.trim(),
            description: m.description,
            system_prompt: m.systemPrompt,
          })),
      }
    : undefined;

  return {
    chat_id: convId,
    user_message: text,
    history,
    provider: settings.provider,
    model: settings.model,
    api_key: apiKey,
    base_url: settings.baseUrl || undefined,
    custom_provider:
      isCustom && customProvider ? toCustomProviderConfig(customProvider, settings.model) : undefined,
    // The agent runs with no iteration cap; max_iterations is intentionally omitted (backend ignores it).
    temperature: typeof settings.temperature === "number" ? settings.temperature : undefined,
    effort: settings.effort?.trim() || undefined,
    tavily_api_key: settings.tavilyApiKey || undefined,
    exa_api_key: settings.exaApiKey || undefined,
    serpapi_api_key: settings.serpapiApiKey || undefined,
    search_provider: settings.searchProvider,
    fetch_provider: settings.fetchProvider,
    firecrawl_api_key: settings.firecrawlApiKey || undefined,
    sub_agents: subAgents,
    skills,
    todos,
    memory,
    knowledge,
    enable_reuse_sub_agent_session: settings.enableReuseSubAgentSession === "yes" ? "yes" : "no",
    multi_agent: Boolean(backendTeam),
    agent_team: backendTeam,
    enable_send_message_to_team: settings.enableSendMessageToTeam === "yes" ? "yes" : "no",
  };
}

export function useChatStream(onFilesChanged?: () => void) {
  const abortRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);

  const drive = useCallback(
    async (params: {
      convId: string;
      assistantId: string;
      start?: StreamRequest;
      resume: boolean;
    }) => {
      const { convId, assistantId, start, resume } = params;
      const controller = new AbortController();
      abortRef.current = controller;
      runningRef.current = true;

      const batcher = new StreamBatcher(convId, assistantId);
      const resumeFlag = { pending: resume };

      useStore.getState().setStreaming(true);
      useStore.getState().setConnection(navigator.onLine === false ? "offline" : "online");

      let result: StreamResult = "aborted";
      try {
        result = await runChatStream({
          chatId: convId,
          start,
          initialSinceId: -1,
          signal: controller.signal,
          onEvent: (event, data) =>
            dispatchStreamEvent(event, data, { convId, msgId: assistantId, batcher, onFilesChanged, resume: resumeFlag }),
          onPhase: phaseToConnection,
          onCursor: (id) => useStore.getState().setActiveRunCursor(id),
        });
      } catch {
        result = "aborted";
      } finally {
        batcher.dispose();
        runningRef.current = false;
        abortRef.current = null;

        const store = useStore.getState();
        // "gone": the backend no longer has this run. If nothing was produced, leave a marker.
        if (result === "gone") {
          const conv = store.conversations.find((c) => c.id === convId);
          const msg = conv?.messages.find((m) => m.id === assistantId);
          if (msg && msg.content.trim().length === 0 && (msg.tools?.length ?? 0) === 0) {
            store.applyAssistantDelta(convId, assistantId, {
              contentDelta: "⚠️ This run is no longer available on the server.",
            });
          }
        }

        store.updateMessage(convId, assistantId, { streaming: false });
        store.setStreaming(false);
        store.setActiveRun(null);
        store.setConnection(navigator.onLine === false ? "offline" : "online");
        onFilesChanged?.();

        // The finished turn enqueued a background memory-build run on the backend. The
        // `memory_agent_queued` SSE event normally attaches the watcher already; this is
        // the fallback that also refreshes the sessions list (idempotent per run).
        void attachLatestMemoryAgentRun();
      }
    },
    [onFilesChanged],
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || runningRef.current) return;

      const store = useStore.getState();
      const convId = store.ensureConversation();
      const conv = useStore.getState().conversations.find((c) => c.id === convId)!;

      const start = buildStartRequest(convId, trimmed);

      const userMsg: ChatMessage = {
        id: uid("msg"),
        role: "user",
        content: trimmed,
        createdAt: Date.now(),
      };
      store.addMessage(convId, userMsg);

      if (conv.messages.length === 0) {
        store.renameConversation(convId, trimmed.slice(0, 48) + (trimmed.length > 48 ? "…" : ""));
      }

      const assistantId = uid("msg");
      store.addMessage(convId, {
        id: assistantId,
        role: "assistant",
        content: "",
        streaming: true,
        tools: [],
        createdAt: Date.now(),
      });

      const run: ActiveRun = { chatId: convId, assistantId, lastEventId: -1, startedAt: Date.now() };
      store.setActiveRun(run);

      await drive({ convId, assistantId, start, resume: false });
    },
    [drive],
  );

  /**
   * Re-attach to a run the backend is still executing (after a refresh/reconnect).
   * The stream replays from event 0, so the assistant message is rebuilt in full —
   * after a refresh a fresh placeholder message is created to receive the replay.
   */
  const resume = useCallback(
    async (run: ActiveRun) => {
      if (runningRef.current) return;
      const store = useStore.getState();
      const conv = store.conversations.find((c) => c.id === run.chatId);
      if (!conv) {
        store.setActiveRun(null);
        return;
      }
      let assistantId = run.assistantId;
      const msg = conv.messages.find((m) => m.id === assistantId);
      if (!msg) {
        // Post-refresh: runtime state was rebuilt from the database snapshot. If the
        // snapshot already contains the in-flight (partial) assistant message, REUSE it
        // — the replay resets and refills it in place, so nothing is duplicated. Only
        // create a fresh placeholder when the thread doesn't end with an assistant.
        const last = conv.messages[conv.messages.length - 1];
        if (last && last.role === "assistant") {
          assistantId = last.id;
          store.updateMessage(run.chatId, assistantId, { streaming: true });
        } else {
          assistantId = uid("msg");
          store.addMessage(run.chatId, {
            id: assistantId,
            role: "assistant",
            content: "",
            streaming: true,
            tools: [],
            createdAt: Date.now(),
          });
        }
        store.setActiveRun({ ...run, assistantId });
      }
      await drive({ convId: run.chatId, assistantId, resume: true });
    },
    [drive],
  );

  const stop = useCallback(async () => {
    const store = useStore.getState();
    const run = store.activeRun;
    // Explicit user cancellation — this is the ONLY thing that stops the backend agent.
    abortRef.current?.abort();
    if (run?.chatId) await abortChat(run.chatId);
    store.setActiveRun(null);
    store.setStreaming(false);
  }, []);

  return { send, resume, stop, isRunning: () => runningRef.current };
}

/** Keep the global connection indicator honest even when no stream is active. */
export function useConnectionWatch(): void {
  const setConnection = useStore((s) => s.setConnection);
  const streaming = useStore((s) => s.streaming);
  useEffect(() => {
    const update = () => {
      if (useStore.getState().streaming) return; // the stream owns the status while running
      setConnection(navigator.onLine === false ? "offline" : "online");
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [setConnection, streaming]);
}
