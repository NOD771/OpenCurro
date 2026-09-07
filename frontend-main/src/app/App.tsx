import { useEffect, useRef } from "react";
import { Rail } from "@/components/Rail";
import { TopBar } from "@/components/TopBar";
import { Composer } from "@/components/Composer";
import { NetworkBanner } from "@/components/NetworkBanner";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { MemoryPanel } from "@/components/panels/MemoryPanel";
import { KnowledgePanel } from "@/components/panels/KnowledgePanel";
import { AgentsPanel } from "@/components/panels/AgentsPanel";
import { SkillsPanel } from "@/components/panels/SkillsPanel";
import { TeamsPanel } from "@/components/panels/TeamsPanel";
import { RolesPanel } from "@/components/panels/RolesPanel";
import { SettingsModal } from "@/components/editors/SettingsModal";
import { TodoPanel } from "@/components/overlays/TodoPanel";
import { FilesPanel } from "@/components/overlays/FilesPanel";
import { PreviewPanel } from "@/components/overlays/PreviewPanel";
import { MemoryAgentPanel } from "@/components/overlays/MemoryAgentPanel";
import { MemoryAgentSessionsPanel } from "@/components/overlays/MemoryAgentSessionsPanel";
import { TeamMonitorPanel } from "@/components/overlays/TeamMonitorPanel";
import { useStore } from "@/store/useStore";
import { useChatStream, useConnectionWatch } from "@/hooks/useChatStream";
import { fetchProviders } from "@/lib/api";
import { attachLatestMemoryAgentRun } from "@/lib/memoryAgent";
import {
  bootstrapFromBackend,
  loadConversationIfNeeded,
  startStatePersistence,
} from "@/lib/statePersistence";

export function App() {
  const section = useStore((s) => s.section);
  const currentId = useStore((s) => s.currentId);
  const hydrated = useStore((s) => s.hydrated);
  const setProviders = useStore((s) => s.setProviders);
  const { send, resume, stop } = useChatStream();
  const bootedRef = useRef(false);

  useConnectionWatch();

  // Boot: hydrate the runtime store from the backend SQLite database, start the
  // change-sync bridge, then re-attach to any run the backend is still executing —
  // a page refresh loses nothing and reconnects to the live stream immediately.
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;

    fetchProviders().then(setProviders).catch(() => {});

    void (async () => {
      const payload = await bootstrapFromBackend();
      startStatePersistence();

      const store = useStore.getState();
      const activeId = store.currentId;
      if (activeId) await loadConversationIfNeeded(activeId);
      useStore.getState().ensureConversation();

      // Load the memory-agent sessions overview and re-attach to any run the backend
      // queue is still executing (the agent keeps running regardless of the browser).
      void attachLatestMemoryAgentRun();

      // Re-attach to a still-running stream (survives refresh/close/reconnect).
      const running = payload.sessions.find((s) => s.running);
      if (running) {
        await loadConversationIfNeeded(running.id);
        void resume({
          chatId: running.id,
          assistantId: "", // rebuilt by resume(): a fresh placeholder receives the replay
          lastEventId: -1,
          startedAt: Date.now(),
        });
      }
    })();
  }, [resume, setProviders]);

  // Lazily pull a conversation's stored snapshot from the database when it is opened.
  useEffect(() => {
    if (!hydrated || !currentId) return;
    void loadConversationIfNeeded(currentId);
  }, [hydrated, currentId]);

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-[var(--bg)] text-[var(--fg)]">
      <Rail />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />

        <main className="relative flex min-h-0 flex-1 flex-col">
          {section === "chat" && <ChatPanel onSend={send} />}
          {section !== "chat" && (
            <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6 max-[640px]:px-4">
              {section === "memory" && <MemoryPanel />}
              {section === "knowledge" && <KnowledgePanel />}
              {section === "agents" && <AgentsPanel />}
              {section === "skills" && <SkillsPanel />}
              {section === "teams" && <TeamsPanel />}
              {section === "roles" && <RolesPanel />}
            </div>
          )}
        </main>

        <Composer onSend={send} onStop={stop} />
      </div>

      <NetworkBanner />
      <SettingsModal />
      <TodoPanel />
      <FilesPanel />
      <PreviewPanel />
      <MemoryAgentPanel />
      <MemoryAgentSessionsPanel />
      <TeamMonitorPanel />
    </div>
  );
}
