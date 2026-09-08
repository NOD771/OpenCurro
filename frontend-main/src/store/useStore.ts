import { create } from "zustand";
import type {
  AgentTeam,
  AskQuestionInfo,
  AskQuestionStatus,
  AttachedFile,
  BrowserPreview,
  ChatMessage,
  Conversation,
  CustomAgent,
  CustomProvider,
  FetchProvider,
  KnowledgeFile,
  KnowledgeSource,
  MemoryAgentLiveRun,
  MemoryAgentRunCounts,
  MemoryAgentRunMeta,
  MemoryFile,
  ModelInfo,
  PlanApprovalStatus,
  ProviderMeta,
  SearchProvider,
  Settings,
  Skill,
  SubAgent,
  SubAgentRun,
  TeamAgentBlock,
  TeamAgentRole,
  TeamAgentSegment,
  TeamAgentStatus,
  TeamMessageKind,
  TeamRunState,
  TodoItem,
  ToolActivity,
} from "@/types";
import { uid, newSessionId } from "@/utils/id";
import type { BackendBootPayload } from "@/lib/backendState";
import { CUSTOM_PROVIDER_PREFIX } from "@/lib/providers";
import { DEFAULT_SUB_AGENTS, mergeSubAgentsWithDefaults } from "@/lib/defaultSubAgents";
import { DEFAULT_SKILLS, mergeSkillsWithDefaults } from "@/lib/defaultSkills";
import {
  DEFAULT_MEMORY_FILES,
  canonicalMemoryPath,
  isPreaddedMemory,
  mergeMemoryWithDefaults,
} from "@/lib/defaultMemory";
import { hasUnsafeSegment, normalizeKnowledgePath, sanitizeKnowledge } from "@/lib/defaultKnowledge";
import { enforceSingleActive, mergeTeamsWithDefaults } from "@/lib/defaultTeams";
import { MAIN_AGENT_ID, normalizeCustomAgents } from "@/lib/customAgents";

/** The workspace sections the rail switches between. */
export type Section =
  | "chat"
  | "memory"
  | "knowledge"
  | "agents"
  | "skills"
  | "teams"
  | "customagents";

/** Connection state surfaced to the user. Slow ≠ offline; only a lost connection is "offline". */
export type Connection = "online" | "reconnecting" | "offline";

/**
 * A run that the backend is executing independently of this browser (runtime-only).
 * After a refresh the backend's session list (`running` flag in SQLite) tells the client
 * which chat to re-attach to; the stream then replays from the database-backed buffer.
 */
export interface ActiveRun {
  chatId: string;
  assistantId: string;
  /** Last SSE `_event_id` this client has applied — the resume cursor. */
  lastEventId: number;
  startedAt: number;
}

interface StreamDelta {
  contentDelta?: string;
  reasoningDelta?: string;
  lastEventId?: number;
}

interface AppState {
  // Synced to the backend SQLite database (nothing is kept in browser storage)
  conversations: Conversation[];
  currentId: string | null;
  settings: Settings;
  subAgents: SubAgent[];
  skills: Skill[];
  todos: TodoItem[];
  memory: MemoryFile[];
  knowledge: KnowledgeFile[];
  knowledgeSources: Record<string, KnowledgeSource>;
  customProviders: CustomProvider[];
  agentTeams: AgentTeam[];
  /** User-created top-level Custom Agents (independent Main Agents). */
  customAgents: CustomAgent[];
  /** The active agent for chat turns: a Custom Agent id, or null / "main" for the built-in Main Agent. */
  activeCustomAgentId: string | null;
  activeRun: ActiveRun | null;

  // Ephemeral UI
  /** True once the store has been hydrated from the backend database. */
  hydrated: boolean;
  section: Section;
  providers: ProviderMeta[];
  models: ModelInfo[];
  modelsLoading: boolean;
  settingsOpen: boolean;
  todosOpen: boolean;
  filesOpen: boolean;
  teamMonitorOpen: boolean;
  streaming: boolean;
  connection: Connection;
  filesVersion: number;
  preview: BrowserPreview;
  attachedFiles: AttachedFile[];

  // Background memory agent (all data lives in the backend SQLite database; this is
  // purely the ephemeral view used to WATCH the agent's stream + sessions).
  memoryAgentOpen: boolean;
  memoryAgentSessionsOpen: boolean;
  /** Run currently shown in the memory-agent popup; null = the newest run. */
  memoryAgentSelectedId: string | null;
  memoryAgentRuns: MemoryAgentRunMeta[];
  memoryAgentCounts: MemoryAgentRunCounts;
  /** Streamed live state per run id (rebuilt from the SSE stream, live or replayed). */
  memoryAgentLive: Record<string, MemoryAgentLiveRun>;

  // Hydration from the backend SQLite database
  hydrateFromBackend: (payload: BackendBootPayload) => void;

  // Conversations
  newConversation: () => string;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  ensureConversation: () => string;
  /** Replace one conversation wholesale (used when its snapshot loads from the database). */
  replaceConversation: (conv: Conversation) => void;

  // Messages
  addMessage: (convId: string, message: ChatMessage) => void;
  updateMessage: (convId: string, msgId: string, patch: Partial<ChatMessage>) => void;
  /** Reset a message's streamed body (used before a full resume replay). */
  resetMessageStream: (convId: string, msgId: string) => void;
  /** Batched hot-path append: content + reasoning deltas and the resume cursor in one write. */
  applyAssistantDelta: (convId: string, msgId: string, delta: StreamDelta) => void;
  upsertTool: (convId: string, msgId: string, tool: ToolActivity) => void;

  // Active run (resumable streaming)
  setActiveRun: (run: ActiveRun | null) => void;
  setActiveRunCursor: (lastEventId: number) => void;

  // submit_plan review
  setPlanPending: (
    convId: string,
    msgId: string,
    toolId: string,
    info: { id: string; chatId: string; plan: string },
  ) => void;
  setPlanStatus: (convId: string, msgId: string, toolId: string, status: PlanApprovalStatus) => void;
  updatePlanForTool: (toolId: string, patch: { status?: PlanApprovalStatus; plan?: string }) => void;

  // ask_question_to_user Q&A
  setQuestionPending: (
    convId: string,
    msgId: string,
    toolId: string,
    info: { id: string; chatId: string; questions: AskQuestionInfo["questions"] },
  ) => void;
  setQuestionStatus: (convId: string, msgId: string, toolId: string, status: AskQuestionStatus) => void;
  updateQuestionForTool: (toolId: string, patch: { status?: AskQuestionStatus }) => void;

  // Sub-agent live runs
  startSubAgent: (
    convId: string,
    msgId: string,
    toolId: string,
    run: Pick<SubAgentRun, "agent" | "task" | "background" | "outputFile" | "sentContext">,
  ) => void;
  applySubAgentDelta: (
    convId: string,
    msgId: string,
    toolId: string,
    delta: { outputDelta?: string; reasoningDelta?: string },
  ) => void;
  upsertSubAgentTool: (convId: string, msgId: string, toolId: string, tool: ToolActivity) => void;
  finishSubAgent: (
    convId: string,
    msgId: string,
    toolId: string,
    patch: { status: SubAgentRun["status"]; output?: string; error?: string },
  ) => void;
  /** Create/refresh the call_multiple_sub_agents batch tool block with one run slot per child. */
  startMultiSubAgents: (
    convId: string,
    msgId: string,
    toolId: string,
    label: string,
    children: Array<{
      id: string;
      run: Pick<SubAgentRun, "agent" | "task" | "background" | "outputFile" | "sentContext"> & {
        error?: string;
      };
    }>,
  ) => void;
  /** Create/refresh a single child run inside a call_multiple_sub_agents batch block. */
  startSubAgentInParent: (
    convId: string,
    msgId: string,
    parentToolId: string,
    childId: string,
    run: Pick<SubAgentRun, "agent" | "task" | "background" | "outputFile" | "sentContext">,
  ) => void;
  /** Upsert a nested tool activity onto a child run inside a batch block. */
  upsertSubAgentToolInParent: (
    convId: string,
    msgId: string,
    parentToolId: string,
    childId: string,
    tool: ToolActivity,
  ) => void;
  /** Finalize a single child run inside a batch block. */
  finishSubAgentInParent: (
    convId: string,
    msgId: string,
    parentToolId: string,
    childId: string,
    patch: { status: SubAgentRun["status"]; output?: string; error?: string },
  ) => void;

  // Sub-agent management
  addSubAgent: (input: Omit<SubAgent, "id" | "createdAt" | "updatedAt">) => void;
  updateSubAgent: (id: string, patch: Partial<Omit<SubAgent, "id" | "createdAt">>) => void;
  deleteSubAgent: (id: string) => void;
  toggleSubAgent: (id: string) => void;

  // Agent team management
  addTeam: (team: AgentTeam) => void;
  updateTeam: (id: string, patch: Partial<Omit<AgentTeam, "id" | "createdAt">>) => void;
  deleteTeam: (id: string) => void;
  /** Activate a team (turns off any other active team — only one team is active at a time). */
  setActiveTeam: (id: string, enabled: boolean) => void;

  // Custom agent management (top-level, user-created Main Agents)
  addCustomAgent: (input: Omit<CustomAgent, "id" | "createdAt" | "updatedAt">) => CustomAgent;
  updateCustomAgent: (id: string, patch: Partial<Omit<CustomAgent, "id" | "createdAt">>) => void;
  deleteCustomAgent: (id: string) => void;
  /** Select which agent chat turns run as: a Custom Agent id, or null for the built-in Main Agent. */
  setActiveCustomAgent: (id: string | null) => void;

  // Multi-agent team live run (rendered inline in the assistant container message)
  startTeamRun: (
    convId: string,
    msgId: string,
    info: { teamName: string; leaderId: string; sendMessageEnabled: boolean; roster: TeamAgentBlock[] },
  ) => void;
  startTeamAgentSegment: (
    convId: string,
    msgId: string,
    agentId: string,
    info: { name?: string; role?: TeamAgentRole; trigger?: string },
  ) => void;
  applyTeamAgentDelta: (
    convId: string,
    msgId: string,
    agentId: string,
    delta: { outputDelta?: string; reasoningDelta?: string },
  ) => void;
  upsertTeamAgentTool: (convId: string, msgId: string, agentId: string, tool: ToolActivity) => void;
  setTeamAgentStatus: (
    convId: string,
    msgId: string,
    agentId: string,
    patch: { status?: TeamAgentStatus; queued?: number },
  ) => void;
  addTeamMonitorMessage: (
    convId: string,
    msgId: string,
    entry: { from?: string; to?: string; kind?: TeamMessageKind; text?: string },
  ) => void;

  // Skill management
  addSkill: (input: Omit<Skill, "id" | "createdAt" | "updatedAt">) => void;
  updateSkill: (id: string, patch: Partial<Omit<Skill, "id" | "createdAt">>) => void;
  deleteSkill: (id: string) => void;
  toggleSkill: (id: string) => void;

  // Todos / memory / knowledge
  setTodos: (todos: TodoItem[]) => void;
  setMemory: (files: MemoryFile[]) => void;
  saveMemoryFile: (path: string, content: string, originalPath?: string) => string | null;
  deleteMemoryFile: (path: string) => void;
  setKnowledge: (files: KnowledgeFile[]) => void;
  saveKnowledgeFile: (path: string, content: string, originalPath?: string) => string | null;
  deleteKnowledgeFile: (path: string) => void;
  setKnowledgeSource: (path: string, source: KnowledgeSource | null) => void;

  // Preview + attached files
  setPreview: (url: string) => void;
  setPreviewOpen: (open: boolean) => void;
  addAttachedFiles: (files: AttachedFile[]) => void;
  setFilesOpen: (open: boolean) => void;

  // Custom providers
  addCustomProvider: (input: Omit<CustomProvider, "id" | "createdAt" | "updatedAt">) => CustomProvider;
  updateCustomProvider: (id: string, patch: Partial<Omit<CustomProvider, "id" | "createdAt">>) => void;
  deleteCustomProvider: (id: string) => void;
  selectCustomProvider: (id: string) => void;

  // Settings + UI
  setSettings: (patch: Partial<Settings>) => void;
  setApiKey: (provider: string, key: string) => void;
  setSearchProvider: (provider: SearchProvider) => void;
  setFetchProvider: (provider: FetchProvider) => void;
  setSearchApiKey: (provider: "tavily" | "exa" | "serpapi" | "firecrawl", key: string) => void;
  setProviders: (p: ProviderMeta[]) => void;
  setModels: (m: ModelInfo[]) => void;
  setModelsLoading: (v: boolean) => void;
  setSection: (section: Section) => void;
  setSettingsOpen: (v: boolean) => void;
  setTodosOpen: (v: boolean) => void;
  setTeamMonitorOpen: (v: boolean) => void;
  setStreaming: (v: boolean) => void;
  setConnection: (c: Connection) => void;
  bumpFiles: () => void;

  // Background memory agent (watch-only)
  setMemoryAgentOpen: (v: boolean) => void;
  setMemoryAgentSessionsOpen: (v: boolean) => void;
  setMemoryAgentSelectedId: (id: string | null) => void;
  setMemoryAgentRuns: (runs: MemoryAgentRunMeta[], counts: MemoryAgentRunCounts) => void;
  /** Create/reset the live view of a run (called when its stream attaches/replays). */
  startMemoryAgentLive: (runId: string) => void;
  applyMemoryAgentDelta: (
    runId: string,
    delta: { reasoningDelta?: string; outputDelta?: string },
  ) => void;
  upsertMemoryAgentTool: (runId: string, tool: ToolActivity) => void;
  finishMemoryAgentLive: (
    runId: string,
    outcome: { status: "completed" | "failed"; error?: string; updatedFiles?: string[] },
  ) => void;
}

const defaultSettings: Settings = {
  provider: "openrouter",
  model: "",
  apiKeys: {},
  baseUrl: "",
  searchProvider: "duckduckgo",
  fetchProvider: "builtin",
  tavilyApiKey: "",
  exaApiKey: "",
  serpapiApiKey: "",
  firecrawlApiKey: "",
  enableReuseSubAgentSession: "no",
  effort: "high",
  temperature: 0.6,
  enableAgentTeams: "no",
  enableSendMessageToTeam: "no",
};

function touch(conv: Conversation): Conversation {
  return { ...conv, updatedAt: Date.now() };
}

/** Immutably update a single tool (by id) inside a single message (by id) inside a conversation. */
function patchTool(
  conversations: Conversation[],
  convId: string,
  msgId: string,
  toolId: string,
  updater: (tool: ToolActivity) => ToolActivity,
  createIfMissing?: () => ToolActivity,
): Conversation[] {
  return conversations.map((c) =>
    c.id === convId
      ? {
          ...c,
          messages: c.messages.map((m) => {
            if (m.id !== msgId) return m;
            const tools = m.tools ? [...m.tools] : [];
            const idx = tools.findIndex((t) => t.id === toolId);
            if (idx === -1) {
              if (!createIfMissing) return m;
              tools.push(updater(createIfMissing()));
            } else {
              tools[idx] = updater(tools[idx]);
            }
            return { ...m, tools };
          }),
        }
      : c,
  );
}

const emptyRun = (
  run: Pick<SubAgentRun, "agent" | "task" | "background" | "outputFile" | "sentContext"> & {
    error?: string;
  },
): SubAgentRun => ({
  agent: run.agent,
  task: run.task,
  background: run.background,
  sentContext: run.sentContext,
  outputFile: run.outputFile,
  reasoning: "",
  output: "",
  tools: [],
  status: run.error ? "error" : "running",
  error: run.error,
});

/**
 * Patch a single child run inside a call_multiple_sub_agents batch tool block. Locates the parent
 * tool by `parentToolId`, then updates `multiRuns[childId]` (creating the slot when missing). A
 * no-op when the parent tool or child slot cannot be resolved and `createIfMissing` is not given.
 */
function patchMultiRun(
  conversations: Conversation[],
  convId: string,
  msgId: string,
  parentToolId: string,
  childId: string,
  updater: (run: SubAgentRun) => SubAgentRun,
  createIfMissing?: () => SubAgentRun,
): Conversation[] {
  return patchTool(conversations, convId, msgId, parentToolId, (tool) => {
    const multiRuns = { ...tool.multiRuns };
    const existing = multiRuns[childId] ?? (createIfMissing ? createIfMissing() : undefined);
    if (!existing) return tool;
    multiRuns[childId] = updater(existing);
    const multiOrder = tool.multiOrder?.includes(childId)
      ? tool.multiOrder
      : [...(tool.multiOrder ?? []), childId];
    return { ...tool, multiRuns, multiOrder };
  });
}

/** Update the TeamRunState on a specific assistant container message (no-op if absent). */
function patchTeamRun(
  conversations: Conversation[],
  convId: string,
  msgId: string,
  updater: (team: TeamRunState) => TeamRunState,
): Conversation[] {
  return conversations.map((c) =>
    c.id === convId
      ? {
          ...c,
          messages: c.messages.map((m) =>
            m.id === msgId && m.team ? { ...m, team: updater(m.team) } : m,
          ),
        }
      : c,
  );
}

/** The last (current) segment of an agent block, creating one if none exists. */
function currentSegment(block: TeamAgentBlock): TeamAgentSegment {
  const last = block.segments[block.segments.length - 1];
  if (last) return last;
  return { id: `${block.id}-seg-0`, reasoning: "", output: "", tools: [] };
}

/**
 * Runtime store. NOTHING here touches browser storage (no localStorage, no
 * sessionStorage, no IndexedDB, no cookies): all durable data lives in the backend
 * SQLite database. The store hydrates from `GET /api/state` at boot (see
 * `lib/statePersistence.ts` + `hydrateFromBackend`), and every persistent slice is
 * synced back to the database when it changes. A page refresh rebuilds the runtime
 * state from the database and re-attaches to any still-running stream.
 */
export const useStore = create<AppState>()(
    (set, get) => ({
      conversations: [],
      currentId: null,
      settings: defaultSettings,
      subAgents: [...DEFAULT_SUB_AGENTS],
      skills: [...DEFAULT_SKILLS],
      todos: [],
      memory: DEFAULT_MEMORY_FILES.map((f) => ({ ...f })),
      knowledge: [],
      knowledgeSources: {},
      customProviders: [],
      agentTeams: mergeTeamsWithDefaults([]),
      customAgents: [],
      activeCustomAgentId: null,
      activeRun: null,

      hydrated: false,
      section: "chat",
      providers: [],
      models: [],
      modelsLoading: false,
      settingsOpen: false,
      todosOpen: false,
      filesOpen: false,
      teamMonitorOpen: false,
      streaming: false,
      connection: "online",
      filesVersion: 0,
      preview: { url: "", open: false },
      attachedFiles: [],

      memoryAgentOpen: false,
      memoryAgentSessionsOpen: false,
      memoryAgentSelectedId: null,
      memoryAgentRuns: [],
      memoryAgentCounts: { queued: 0, running: 0, completed: 0, failed: 0, total: 0 },
      memoryAgentLive: {},

      hydrateFromBackend: (payload) => {
        const state = payload.state ?? {};
        const p = state as Partial<AppState>;

        // Sessions from the database become conversation stubs; their full snapshots
        // are fetched lazily when selected (see lib/statePersistence.ts).
        const conversations: Conversation[] = payload.sessions.map((s) => ({
          id: s.id,
          title: s.title.trim().length > 0 ? s.title : "New thread",
          messages: [],
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          messageCount: s.messageCount,
          loaded: false,
        }));

        const storedCurrent =
          typeof state.currentSessionId === "string" ? (state.currentSessionId as string) : null;
        const currentId =
          storedCurrent && conversations.some((c) => c.id === storedCurrent)
            ? storedCurrent
            : (conversations[0]?.id ?? null);

        set((s) => ({
          hydrated: true,
          conversations,
          currentId,
          settings: { ...s.settings, ...(p.settings && typeof p.settings === "object" ? p.settings : {}) },
          subAgents: mergeSubAgentsWithDefaults(Array.isArray(p.subAgents) ? p.subAgents : s.subAgents),
          skills: mergeSkillsWithDefaults(Array.isArray(p.skills) ? p.skills : s.skills),
          todos: Array.isArray(p.todos) ? p.todos : s.todos,
          memory: mergeMemoryWithDefaults(Array.isArray(p.memory) ? p.memory : s.memory),
          knowledge: sanitizeKnowledge(Array.isArray(p.knowledge) ? p.knowledge : s.knowledge),
          knowledgeSources:
            p.knowledgeSources && typeof p.knowledgeSources === "object"
              ? (p.knowledgeSources as Record<string, KnowledgeSource>)
              : s.knowledgeSources,
          customProviders: Array.isArray(p.customProviders) ? p.customProviders : s.customProviders,
          agentTeams: mergeTeamsWithDefaults(
            Array.isArray((p as { agentTeams?: unknown }).agentTeams)
              ? ((p as { agentTeams?: AgentTeam[] }).agentTeams as AgentTeam[])
              : s.agentTeams,
          ),
          customAgents: normalizeCustomAgents(
            (p as { customAgents?: unknown }).customAgents ?? s.customAgents,
          ),
          activeCustomAgentId:
            typeof (state as { activeCustomAgentId?: unknown }).activeCustomAgentId === "string"
              ? ((state as { activeCustomAgentId?: string }).activeCustomAgentId ?? null)
              : s.activeCustomAgentId,
        }));
      },

      newConversation: () => {
        // 20-character alphanumeric session id — the database key for this chat.
        const id = newSessionId();
        const conv: Conversation = {
          id,
          title: "New thread",
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          loaded: true,
        };
        set((s) => ({ conversations: [conv, ...s.conversations], currentId: id, section: "chat" }));
        return id;
      },

      replaceConversation: (conv) =>
        set((s) => ({
          conversations: s.conversations.some((c) => c.id === conv.id)
            ? s.conversations.map((c) => (c.id === conv.id ? { ...conv, loaded: true } : c))
            : [{ ...conv, loaded: true }, ...s.conversations],
        })),

      ensureConversation: () => {
        const { currentId } = get();
        if (currentId && get().conversations.some((c) => c.id === currentId)) return currentId;
        return get().newConversation();
      },

      selectConversation: (id) => set({ currentId: id, section: "chat" }),

      deleteConversation: (id) =>
        set((s) => {
          const conversations = s.conversations.filter((c) => c.id !== id);
          const currentId = s.currentId === id ? (conversations[0]?.id ?? null) : s.currentId;
          const activeRun = s.activeRun?.chatId === id ? null : s.activeRun;
          return { conversations, currentId, activeRun };
        }),

      renameConversation: (id, title) =>
        set((s) => ({
          conversations: s.conversations.map((c) => (c.id === id ? { ...c, title } : c)),
        })),

      addMessage: (convId, message) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === convId ? touch({ ...c, messages: [...c.messages, message] }) : c,
          ),
        })),

      updateMessage: (convId, msgId, patch) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === convId
              ? { ...c, messages: c.messages.map((m) => (m.id === msgId ? { ...m, ...patch } : m)) }
              : c,
          ),
        })),

      resetMessageStream: (convId, msgId) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === msgId
                      ? { ...m, content: "", reasoning: "", tools: [], team: undefined, streaming: true }
                      : m,
                  ),
                }
              : c,
          ),
        })),

      applyAssistantDelta: (convId, msgId, delta) =>
        set((s) => {
          const activeRun =
            delta.lastEventId != null && s.activeRun && s.activeRun.chatId === convId
              ? { ...s.activeRun, lastEventId: delta.lastEventId }
              : s.activeRun;
          if (!delta.contentDelta && !delta.reasoningDelta) {
            return activeRun === s.activeRun ? {} : { activeRun };
          }
          return {
            activeRun,
            conversations: s.conversations.map((c) =>
              c.id === convId
                ? {
                    ...c,
                    messages: c.messages.map((m) =>
                      m.id === msgId
                        ? {
                            ...m,
                            content: delta.contentDelta ? m.content + delta.contentDelta : m.content,
                            reasoning: delta.reasoningDelta
                              ? (m.reasoning ?? "") + delta.reasoningDelta
                              : m.reasoning,
                          }
                        : m,
                    ),
                  }
                : c,
            ),
          };
        }),

      upsertTool: (convId, msgId, tool) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  messages: c.messages.map((m) => {
                    if (m.id !== msgId) return m;
                    const tools = m.tools ? [...m.tools] : [];
                    const idx = tools.findIndex((t) => t.id === tool.id);
                    if (idx === -1) tools.push(tool);
                    else tools[idx] = { ...tools[idx], ...tool };
                    return { ...m, tools };
                  }),
                }
              : c,
          ),
        })),

      setActiveRun: (activeRun) => set({ activeRun }),
      setActiveRunCursor: (lastEventId) =>
        set((s) => (s.activeRun ? { activeRun: { ...s.activeRun, lastEventId } } : {})),

      setPlanPending: (convId, msgId, toolId, info) =>
        set((s) => ({
          conversations: patchTool(
            s.conversations,
            convId,
            msgId,
            toolId,
            (tool) => ({ ...tool, plan: { ...info, status: "pending" as const } }),
            () => ({
              id: toolId,
              name: "submit_plan",
              label: "Submit Plan",
              status: "running",
              plan: { ...info, status: "pending" as const },
            }),
          ),
        })),

      setPlanStatus: (convId, msgId, toolId, status) =>
        set((s) => ({
          conversations: patchTool(s.conversations, convId, msgId, toolId, (tool) =>
            tool.plan ? { ...tool, plan: { ...tool.plan, status } } : tool,
          ),
        })),

      updatePlanForTool: (toolId, patch) =>
        set((s) => ({
          conversations: s.conversations.map((c) => ({
            ...c,
            messages: c.messages.map((m) =>
              m.tools?.some((t) => t.plan?.id === toolId)
                ? {
                    ...m,
                    tools: m.tools.map((t) =>
                      t.plan?.id === toolId
                        ? {
                            ...t,
                            plan: { ...t.plan, ...patch },
                            status: patch.status && patch.status !== "pending" ? "ok" : t.status,
                          }
                        : t,
                    ),
                  }
                : m,
            ),
          })),
        })),

      setQuestionPending: (convId, msgId, toolId, info) =>
        set((s) => ({
          conversations: patchTool(
            s.conversations,
            convId,
            msgId,
            toolId,
            (tool) => ({ ...tool, ask: { ...info, status: "pending" as const } }),
            () => ({
              id: toolId,
              name: "ask_question_to_user",
              label: `Ask ${info.questions.length} Question${info.questions.length === 1 ? "" : "s"}`,
              status: "running",
              ask: { ...info, status: "pending" as const },
            }),
          ),
        })),

      setQuestionStatus: (convId, msgId, toolId, status) =>
        set((s) => ({
          conversations: patchTool(s.conversations, convId, msgId, toolId, (tool) =>
            tool.ask ? { ...tool, ask: { ...tool.ask, status } } : tool,
          ),
        })),

      updateQuestionForTool: (toolId, patch) =>
        set((s) => ({
          conversations: s.conversations.map((c) => ({
            ...c,
            messages: c.messages.map((m) =>
              m.tools?.some((t) => t.ask?.id === toolId)
                ? {
                    ...m,
                    tools: m.tools.map((t) =>
                      t.ask?.id === toolId
                        ? {
                            ...t,
                            ask: { ...t.ask, ...patch },
                            status: patch.status && patch.status !== "pending" ? "ok" : t.status,
                          }
                        : t,
                    ),
                  }
                : m,
            ),
          })),
        })),

      startSubAgent: (convId, msgId, toolId, run) =>
        set((s) => ({
          conversations: patchTool(
            s.conversations,
            convId,
            msgId,
            toolId,
            (tool) => ({
              ...tool,
              subAgent: tool.subAgent
                ? {
                    ...tool.subAgent,
                    agent: run.agent,
                    task: run.task,
                    background: run.background ?? tool.subAgent.background,
                    sentContext: run.sentContext ?? tool.subAgent.sentContext,
                    outputFile: run.outputFile ?? tool.subAgent.outputFile,
                  }
                : emptyRun(run),
            }),
            () => ({
              id: toolId,
              name: "call_sub_agent",
              label: `Sub-Agent: ${run.agent}${run.background ? " (background)" : ""}`,
              status: "running",
              subAgent: emptyRun(run),
            }),
          ),
        })),

      applySubAgentDelta: (convId, msgId, toolId, delta) =>
        set((s) => {
          const applyDelta = (run: SubAgentRun): SubAgentRun => ({
            ...run,
            output: delta.outputDelta ? run.output + delta.outputDelta : run.output,
            reasoning: delta.reasoningDelta ? run.reasoning + delta.reasoningDelta : run.reasoning,
          });
          // Token/reasoning deltas are keyed only by the run's own event id (toolId). That id is a
          // top-level call_sub_agent chip, OR a child of a call_multiple_sub_agents batch. Locate
          // whichever holds the run so batch children stream correctly too.
          return {
            conversations: s.conversations.map((c) =>
              c.id !== convId
                ? c
                : {
                    ...c,
                    messages: c.messages.map((m) => {
                      if (m.id !== msgId || !m.tools) return m;
                      return {
                        ...m,
                        tools: m.tools.map((t) => {
                          if (t.id === toolId && t.subAgent) {
                            return { ...t, subAgent: applyDelta(t.subAgent) };
                          }
                          if (t.multiRuns && t.multiRuns[toolId]) {
                            return {
                              ...t,
                              multiRuns: { ...t.multiRuns, [toolId]: applyDelta(t.multiRuns[toolId]!) },
                            };
                          }
                          return t;
                        }),
                      };
                    }),
                  },
            ),
          };
        }),

      upsertSubAgentTool: (convId, msgId, toolId, subTool) =>
        set((s) => ({
          conversations: patchTool(s.conversations, convId, msgId, toolId, (tool) => {
            const run = tool.subAgent ?? emptyRun({ agent: "", task: "" });
            const tools = [...run.tools];
            const idx = tools.findIndex((t) => t.id === subTool.id);
            if (idx === -1) tools.push(subTool);
            else tools[idx] = { ...tools[idx], ...subTool };
            return { ...tool, subAgent: { ...run, tools } };
          }),
        })),

      finishSubAgent: (convId, msgId, toolId, patch) =>
        set((s) => ({
          conversations: patchTool(s.conversations, convId, msgId, toolId, (tool) => {
            const run = tool.subAgent ?? emptyRun({ agent: "", task: "" });
            return {
              ...tool,
              subAgent: {
                ...run,
                status: patch.status,
                output: patch.output != null && patch.output.length > 0 ? patch.output : run.output,
                error: patch.error,
              },
            };
          }),
        })),

      startMultiSubAgents: (convId, msgId, toolId, label, children) =>
        set((s) => ({
          conversations: patchTool(
            s.conversations,
            convId,
            msgId,
            toolId,
            (tool) => {
              // Merge in any children not already present (idempotent across replays), keeping the
              // requested order and preserving live state for children that already started.
              const multiRuns = { ...tool.multiRuns };
              const multiOrder = [...(tool.multiOrder ?? [])];
              for (const child of children) {
                if (!multiRuns[child.id]) {
                  multiRuns[child.id] = emptyRun(child.run);
                  if (!multiOrder.includes(child.id)) multiOrder.push(child.id);
                }
              }
              return { ...tool, name: "call_multiple_sub_agents", label, multiRuns, multiOrder };
            },
            () => ({
              id: toolId,
              name: "call_multiple_sub_agents",
              label,
              status: "running",
              multiRuns: Object.fromEntries(children.map((c) => [c.id, emptyRun(c.run)])),
              multiOrder: children.map((c) => c.id),
            }),
          ),
        })),

      startSubAgentInParent: (convId, msgId, parentToolId, childId, run) =>
        set((s) => ({
          conversations: patchMultiRun(
            s.conversations,
            convId,
            msgId,
            parentToolId,
            childId,
            (existing) => ({
              ...existing,
              agent: run.agent || existing.agent,
              task: run.task || existing.task,
              background: run.background ?? existing.background,
              sentContext: run.sentContext ?? existing.sentContext,
              outputFile: run.outputFile ?? existing.outputFile,
            }),
            () => emptyRun(run),
          ),
        })),

      upsertSubAgentToolInParent: (convId, msgId, parentToolId, childId, subTool) =>
        set((s) => ({
          conversations: patchMultiRun(
            s.conversations,
            convId,
            msgId,
            parentToolId,
            childId,
            (run) => {
              const tools = [...run.tools];
              const idx = tools.findIndex((t) => t.id === subTool.id);
              if (idx === -1) tools.push(subTool);
              else tools[idx] = { ...tools[idx], ...subTool };
              return { ...run, tools };
            },
            () => emptyRun({ agent: "", task: "" }),
          ),
        })),

      finishSubAgentInParent: (convId, msgId, parentToolId, childId, patch) =>
        set((s) => ({
          conversations: patchMultiRun(
            s.conversations,
            convId,
            msgId,
            parentToolId,
            childId,
            (run) => ({
              ...run,
              status: patch.status,
              output: patch.output != null && patch.output.length > 0 ? patch.output : run.output,
              error: patch.error,
            }),
            () => emptyRun({ agent: "", task: "" }),
          ),
        })),

      addSubAgent: (input) =>
        set((s) => {
          const now = Date.now();
          const agent: SubAgent = { id: uid("sa"), createdAt: now, updatedAt: now, ...input };
          return { subAgents: [agent, ...s.subAgents] };
        }),

      updateSubAgent: (id, patch) =>
        set((s) => ({
          subAgents: s.subAgents.map((a) => (a.id === id ? { ...a, ...patch, updatedAt: Date.now() } : a)),
        })),

      deleteSubAgent: (id) => set((s) => ({ subAgents: s.subAgents.filter((a) => a.id !== id) })),

      toggleSubAgent: (id) =>
        set((s) => ({
          subAgents: s.subAgents.map((a) =>
            a.id === id ? { ...a, enabled: !a.enabled, updatedAt: Date.now() } : a,
          ),
        })),

      // ---- Agent team management -------------------------------------------------
      addTeam: (team) =>
        set((s) => ({
          agentTeams: enforceSingleActive([{ ...team, updatedAt: Date.now() }, ...s.agentTeams]),
        })),

      updateTeam: (id, patch) =>
        set((s) => ({
          agentTeams: enforceSingleActive(
            s.agentTeams.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t)),
          ),
        })),

      deleteTeam: (id) => set((s) => ({ agentTeams: s.agentTeams.filter((t) => t.id !== id) })),

      setActiveTeam: (id, enabled) =>
        set((s) => ({
          agentTeams: s.agentTeams.map((t) =>
            t.id === id
              ? { ...t, enabled, updatedAt: Date.now() }
              : enabled
                ? { ...t, enabled: false } // only one team active at a time
                : t,
          ),
        })),

      // ---- Custom agent management (top-level, user-created Main Agents) ----------
      addCustomAgent: (input) => {
        const now = Date.now();
        const agent: CustomAgent = { id: uid("agent"), createdAt: now, updatedAt: now, ...input };
        set((s) => ({ customAgents: [agent, ...s.customAgents] }));
        return agent;
      },

      updateCustomAgent: (id, patch) =>
        set((s) => ({
          customAgents: s.customAgents.map((a) =>
            a.id === id ? { ...a, ...patch, updatedAt: Date.now() } : a,
          ),
        })),

      deleteCustomAgent: (id) =>
        set((s) => ({
          customAgents: s.customAgents.filter((a) => a.id !== id),
          // Deleting the active agent falls back to the built-in Main Agent.
          activeCustomAgentId: s.activeCustomAgentId === id ? null : s.activeCustomAgentId,
        })),

      setActiveCustomAgent: (id) =>
        set(() => ({ activeCustomAgentId: id && id !== MAIN_AGENT_ID ? id : null })),

      // ---- Multi-agent team live run ---------------------------------------------
      startTeamRun: (convId, msgId, info) =>
        set((s) => {
          const agents: Record<string, TeamAgentBlock> = {};
          const order: string[] = [];
          for (const block of info.roster) {
            agents[block.id] = block;
            order.push(block.id);
          }
          const team: TeamRunState = {
            teamName: info.teamName,
            leaderId: info.leaderId,
            sendMessageEnabled: info.sendMessageEnabled,
            agents,
            order,
            monitor: [],
          };
          return {
            conversations: s.conversations.map((c) =>
              c.id === convId
                ? {
                    ...c,
                    messages: c.messages.map((m) => (m.id === msgId ? { ...m, team } : m)),
                  }
                : c,
            ),
          };
        }),

      startTeamAgentSegment: (convId, msgId, agentId, info) =>
        set((s) => ({
          conversations: patchTeamRun(s.conversations, convId, msgId, (team) => {
            const existing = team.agents[agentId];
            const block: TeamAgentBlock = existing ?? {
              id: agentId,
              name: info.name ?? agentId,
              role: info.role ?? "member",
              status: "working",
              queued: 0,
              segments: [],
            };
            const segment: TeamAgentSegment = {
              id: `${agentId}-seg-${block.segments.length}`,
              trigger: info.trigger,
              reasoning: "",
              output: "",
              tools: [],
            };
            const updated: TeamAgentBlock = {
              ...block,
              name: info.name ?? block.name,
              role: info.role ?? block.role,
              status: "working",
              segments: [...block.segments, segment],
            };
            const order = team.order.includes(agentId) ? team.order : [...team.order, agentId];
            return { ...team, agents: { ...team.agents, [agentId]: updated }, order };
          }),
        })),

      applyTeamAgentDelta: (convId, msgId, agentId, delta) =>
        set((s) => {
          if (!delta.outputDelta && !delta.reasoningDelta) return {};
          return {
            conversations: patchTeamRun(s.conversations, convId, msgId, (team) => {
              const block = team.agents[agentId];
              if (!block) return team;
              const segments = block.segments.length > 0 ? [...block.segments] : [currentSegment(block)];
              const idx = segments.length - 1;
              const seg = segments[idx]!;
              segments[idx] = {
                ...seg,
                output: delta.outputDelta ? seg.output + delta.outputDelta : seg.output,
                reasoning: delta.reasoningDelta ? seg.reasoning + delta.reasoningDelta : seg.reasoning,
              };
              return { ...team, agents: { ...team.agents, [agentId]: { ...block, segments } } };
            }),
          };
        }),

      upsertTeamAgentTool: (convId, msgId, agentId, tool) =>
        set((s) => ({
          conversations: patchTeamRun(s.conversations, convId, msgId, (team) => {
            const block = team.agents[agentId];
            if (!block) return team;
            const segments = block.segments.length > 0 ? [...block.segments] : [currentSegment(block)];
            const idx = segments.length - 1;
            const seg = segments[idx]!;
            const tools = [...seg.tools];
            const ti = tools.findIndex((t) => t.id === tool.id);
            if (ti === -1) tools.push(tool);
            else tools[ti] = { ...tools[ti], ...tool };
            segments[idx] = { ...seg, tools };
            return { ...team, agents: { ...team.agents, [agentId]: { ...block, segments } } };
          }),
        })),

      setTeamAgentStatus: (convId, msgId, agentId, patch) =>
        set((s) => ({
          conversations: patchTeamRun(s.conversations, convId, msgId, (team) => {
            const block = team.agents[agentId];
            const updatedBlock: TeamAgentBlock = block
              ? {
                  ...block,
                  status: patch.status ?? block.status,
                  queued: patch.queued ?? block.queued,
                }
              : {
                  id: agentId,
                  name: agentId,
                  role: "member",
                  status: patch.status ?? "idle",
                  queued: patch.queued ?? 0,
                  segments: [],
                };
            const order = team.order.includes(agentId) ? team.order : [...team.order, agentId];
            const monitor = [
              ...team.monitor,
              {
                id: uid("mon"),
                at: Date.now(),
                kind: "status" as const,
                agentId,
                status: patch.status,
                queued: patch.queued,
              },
            ].slice(-200);
            return { ...team, agents: { ...team.agents, [agentId]: updatedBlock }, order, monitor };
          }),
        })),

      addTeamMonitorMessage: (convId, msgId, entry) =>
        set((s) => ({
          conversations: patchTeamRun(s.conversations, convId, msgId, (team) => ({
            ...team,
            monitor: [
              ...team.monitor,
              {
                id: uid("mon"),
                at: Date.now(),
                kind: "message" as const,
                from: entry.from,
                to: entry.to,
                messageKind: entry.kind,
                text: entry.text,
              },
            ].slice(-200),
          })),
        })),

      addSkill: (input) =>
        set((s) => {
          const now = Date.now();
          const skill: Skill = { id: uid("skill"), createdAt: now, updatedAt: now, ...input };
          return { skills: [skill, ...s.skills] };
        }),

      updateSkill: (id, patch) =>
        set((s) => ({
          skills: s.skills.map((sk) => (sk.id === id ? { ...sk, ...patch, updatedAt: Date.now() } : sk)),
        })),

      deleteSkill: (id) => set((s) => ({ skills: s.skills.filter((sk) => sk.id !== id) })),

      toggleSkill: (id) =>
        set((s) => ({
          skills: s.skills.map((sk) =>
            sk.id === id ? { ...sk, enabled: !sk.enabled, updatedAt: Date.now() } : sk,
          ),
        })),

      setTodos: (todos) =>
        set((s) => ({
          todos: Array.isArray(todos)
            ? todos.filter(
                (t) =>
                  t &&
                  typeof t === "object" &&
                  typeof t.id === "string" &&
                  typeof t.content === "string",
              )
            : s.todos,
        })),

      setMemory: (files) =>
        set((s) => ({
          memory: Array.isArray(files)
            ? mergeMemoryWithDefaults(
                files.filter(
                  (f) => f && typeof f === "object" && typeof f.path === "string" && f.path.trim().length > 0,
                ),
              )
            : s.memory,
        })),

      saveMemoryFile: (path, content, originalPath) => {
        const cleanPath = canonicalMemoryPath(path.trim().replace(/^[\\/]+/, "").replace(/\/+/g, "/"));
        if (!cleanPath) return "A file path is required.";
        if (/(^|\/)\.\.?(\/|$)/.test(cleanPath)) return "Path cannot contain '.' or '..' segments.";

        const original = originalPath ? canonicalMemoryPath(originalPath) : "";
        if (original && isPreaddedMemory(original) && original.toLowerCase() !== cleanPath.toLowerCase()) {
          return "The four core files (MEMORY.md, SOUL.md, USER.md, session-memory.md) cannot be renamed.";
        }

        const clash = get().memory.some(
          (f) =>
            f.path.toLowerCase() === cleanPath.toLowerCase() &&
            (!original || f.path.toLowerCase() !== original.toLowerCase()),
        );
        if (clash) return `A memory file named "${cleanPath}" already exists.`;

        set((s) => {
          const exists = s.memory.some(
            (f) => f.path.toLowerCase() === (original || cleanPath).toLowerCase(),
          );
          const memory = exists
            ? s.memory.map((f) =>
                f.path.toLowerCase() === (original || cleanPath).toLowerCase()
                  ? { path: cleanPath, content }
                  : f,
              )
            : [...s.memory, { path: cleanPath, content }];
          return { memory: mergeMemoryWithDefaults(memory) };
        });
        return null;
      },

      deleteMemoryFile: (path) =>
        set((s) => {
          if (isPreaddedMemory(path)) return {};
          return {
            memory: mergeMemoryWithDefaults(
              s.memory.filter((f) => f.path.toLowerCase() !== canonicalMemoryPath(path).toLowerCase()),
            ),
          };
        }),

      setKnowledge: (files) =>
        set((s) => {
          const knowledge = sanitizeKnowledge(files);
          const live = new Set(knowledge.map((f) => f.path.toLowerCase()));
          const knowledgeSources = Object.fromEntries(
            Object.entries(s.knowledgeSources).filter(([path]) => live.has(path.toLowerCase())),
          );
          return { knowledge, knowledgeSources };
        }),

      saveKnowledgeFile: (path, content, originalPath) => {
        const cleanPath = normalizeKnowledgePath(path);
        if (!cleanPath) return "A file path is required.";
        if (hasUnsafeSegment(cleanPath)) return "Path cannot contain '.' or '..' segments.";

        const original = originalPath ? normalizeKnowledgePath(originalPath) : "";
        const clash = get().knowledge.some(
          (f) =>
            f.path.toLowerCase() === cleanPath.toLowerCase() &&
            (!original || f.path.toLowerCase() !== original.toLowerCase()),
        );
        if (clash) return `A knowledge file named "${cleanPath}" already exists.`;

        set((s) => {
          const exists = s.knowledge.some(
            (f) => f.path.toLowerCase() === (original || cleanPath).toLowerCase(),
          );
          const knowledge = exists
            ? s.knowledge.map((f) =>
                f.path.toLowerCase() === (original || cleanPath).toLowerCase()
                  ? { path: cleanPath, content }
                  : f,
              )
            : [...s.knowledge, { path: cleanPath, content }];

          let knowledgeSources = s.knowledgeSources;
          if (original && original.toLowerCase() !== cleanPath.toLowerCase() && knowledgeSources[original]) {
            const { [original]: moved, ...rest } = knowledgeSources;
            knowledgeSources = { ...rest, [cleanPath]: moved };
          }
          return { knowledge: sanitizeKnowledge(knowledge), knowledgeSources };
        });
        return null;
      },

      deleteKnowledgeFile: (path) =>
        set((s) => {
          const target = normalizeKnowledgePath(path).toLowerCase();
          const knowledgeSources = Object.fromEntries(
            Object.entries(s.knowledgeSources).filter(([p]) => p.toLowerCase() !== target),
          );
          return {
            knowledge: s.knowledge.filter((f) => f.path.toLowerCase() !== target),
            knowledgeSources,
          };
        }),

      setKnowledgeSource: (path, source) =>
        set((s) => {
          const clean = normalizeKnowledgePath(path);
          if (!clean) return {};
          if (source === null) {
            const rest = { ...s.knowledgeSources };
            delete rest[clean];
            return { knowledgeSources: rest };
          }
          return { knowledgeSources: { ...s.knowledgeSources, [clean]: source } };
        }),

      addCustomProvider: (input) => {
        const now = Date.now();
        const provider: CustomProvider = {
          id: uid(CUSTOM_PROVIDER_PREFIX),
          createdAt: now,
          updatedAt: now,
          ...input,
          models: input.models.length > 0 ? input.models : [""],
        };
        set((s) => ({ customProviders: [provider, ...s.customProviders] }));
        return provider;
      },

      updateCustomProvider: (id, patch) =>
        set((s) => ({
          customProviders: s.customProviders.map((p) =>
            p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p,
          ),
        })),

      deleteCustomProvider: (id) =>
        set((s) => {
          const customProviders = s.customProviders.filter((p) => p.id !== id);
          let settings = s.settings;
          if (s.settings.provider === id) {
            settings = { ...s.settings, provider: "openrouter", model: "", baseUrl: "" };
          }
          return { customProviders, settings };
        }),

      selectCustomProvider: (id) =>
        set((s) => {
          const provider = s.customProviders.find((p) => p.id === id);
          if (!provider) return {};
          const model = provider.models.find((m) => m.trim().length > 0) ?? "";
          return { settings: { ...s.settings, provider: id, model, baseUrl: "" } };
        }),

      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      setApiKey: (provider, key) =>
        set((s) => ({ settings: { ...s.settings, apiKeys: { ...s.settings.apiKeys, [provider]: key } } })),
      setSearchProvider: (searchProvider) => set((s) => ({ settings: { ...s.settings, searchProvider } })),
      setFetchProvider: (fetchProvider) => set((s) => ({ settings: { ...s.settings, fetchProvider } })),
      setSearchApiKey: (provider, key) =>
        set((s) => {
          const field =
            provider === "tavily"
              ? "tavilyApiKey"
              : provider === "exa"
                ? "exaApiKey"
                : provider === "serpapi"
                  ? "serpapiApiKey"
                  : "firecrawlApiKey";
          const patch: Partial<Settings> = { [field]: key };

          if (provider !== "firecrawl" && key.trim()) {
            const selected = s.settings.searchProvider ?? "duckduckgo";
            const selectedHasKey =
              selected === "duckduckgo"
                ? true
                : selected === "tavily"
                  ? Boolean(s.settings.tavilyApiKey?.trim())
                  : selected === "exa"
                    ? Boolean(s.settings.exaApiKey?.trim())
                    : Boolean(s.settings.serpapiApiKey?.trim());
            if (!selectedHasKey) patch.searchProvider = provider;
          }

          return { settings: { ...s.settings, ...patch } };
        }),
      setProviders: (providers) => set({ providers }),
      setModels: (models) => set({ models }),
      setModelsLoading: (modelsLoading) => set({ modelsLoading }),
      setSection: (section) => set({ section }),
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
      setTodosOpen: (todosOpen) => set({ todosOpen }),
      setTeamMonitorOpen: (teamMonitorOpen) => set({ teamMonitorOpen }),
      setStreaming: (streaming) => set({ streaming }),
      setConnection: (connection) => set({ connection }),
      setPreview: (url) => set((s) => ({ preview: { url, open: s.preview.url !== url || s.preview.open } })),
      setPreviewOpen: (open) => set((s) => ({ preview: { ...s.preview, open } })),
      addAttachedFiles: (files) =>
        set((s) => {
          const seen = new Set(s.attachedFiles.map((f) => f.path));
          const fresh = files.filter((f) => f && f.path && !seen.has(f.path));
          if (fresh.length === 0) return {};
          return { attachedFiles: [...s.attachedFiles, ...fresh] };
        }),
      setFilesOpen: (filesOpen) => set({ filesOpen }),
      bumpFiles: () => set((s) => ({ filesVersion: s.filesVersion + 1 })),

      // ---- Background memory agent (watch-only) ----------------------------------
      setMemoryAgentOpen: (memoryAgentOpen) => set({ memoryAgentOpen }),
      setMemoryAgentSessionsOpen: (memoryAgentSessionsOpen) => set({ memoryAgentSessionsOpen }),
      setMemoryAgentSelectedId: (memoryAgentSelectedId) => set({ memoryAgentSelectedId }),
      setMemoryAgentRuns: (memoryAgentRuns, memoryAgentCounts) =>
        set({ memoryAgentRuns, memoryAgentCounts }),
      startMemoryAgentLive: (runId) =>
        set((s) => ({
          memoryAgentLive: {
            ...s.memoryAgentLive,
            [runId]: {
              id: runId,
              reasoning: "",
              output: "",
              tools: [],
              status: "running",
              updatedFiles: [],
            },
          },
        })),
      applyMemoryAgentDelta: (runId, delta) =>
        set((s) => {
          const run = s.memoryAgentLive[runId];
          if (!run) return {};
          return {
            memoryAgentLive: {
              ...s.memoryAgentLive,
              [runId]: {
                ...run,
                reasoning: delta.reasoningDelta ? run.reasoning + delta.reasoningDelta : run.reasoning,
                output: delta.outputDelta ? run.output + delta.outputDelta : run.output,
              },
            },
          };
        }),
      upsertMemoryAgentTool: (runId, tool) =>
        set((s) => {
          const run = s.memoryAgentLive[runId];
          if (!run) return {};
          const index = run.tools.findIndex((t) => t.id === tool.id);
          const tools =
            index === -1
              ? [...run.tools, tool]
              : run.tools.map((t, i) => (i === index ? { ...t, ...tool } : t));
          return { memoryAgentLive: { ...s.memoryAgentLive, [runId]: { ...run, tools } } };
        }),
      finishMemoryAgentLive: (runId, outcome) =>
        set((s) => {
          const run = s.memoryAgentLive[runId];
          if (!run) return {};
          return {
            memoryAgentLive: {
              ...s.memoryAgentLive,
              [runId]: {
                ...run,
                status: outcome.status,
                error: outcome.error,
                updatedFiles: outcome.updatedFiles ?? run.updatedFiles,
              },
            },
          };
        }),
    }),
);
