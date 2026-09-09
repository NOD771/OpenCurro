import { Plus, Settings, ListTodo, Paperclip, Brain, History, Boxes } from "lucide-react";
import { useStore, type Section } from "@/store/useStore";
import { cn } from "@/utils/cn";

function contextLabel(section: Section, counts: Record<string, number>): string | null {
  switch (section) {
    case "memory":
      return "Across threads";
    case "knowledge":
      return `${counts.knowledge} source${counts.knowledge === 1 ? "" : "s"}`;
    case "agents":
      return `${counts.agents} agent${counts.agents === 1 ? "" : "s"}`;
    case "skills":
      return `${counts.skills} skill${counts.skills === 1 ? "" : "s"}`;
    case "teams":
      return `${counts.teams} team${counts.teams === 1 ? "" : "s"}`;
    case "customagents":
      return `${counts.customagents} agent${counts.customagents === 1 ? "" : "s"}`;
    case "systemprompts":
      return `${counts.systemprompts} prompt${counts.systemprompts === 1 ? "" : "s"}`;
    default:
      return null;
  }
}

export function TopBar() {
  const section = useStore((s) => s.section);
  const newConversation = useStore((s) => s.newConversation);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const setTodosOpen = useStore((s) => s.setTodosOpen);
  const setFilesOpen = useStore((s) => s.setFilesOpen);
  const setMemoryAgentOpen = useStore((s) => s.setMemoryAgentOpen);
  const setMemoryAgentSessionsOpen = useStore((s) => s.setMemoryAgentSessionsOpen);
  const memoryAgentCounts = useStore((s) => s.memoryAgentCounts);
  const knowledge = useStore((s) => s.knowledge);
  const subAgents = useStore((s) => s.subAgents);
  const skills = useStore((s) => s.skills);
  const todos = useStore((s) => s.todos);
  const attachedFiles = useStore((s) => s.attachedFiles);
  const agentTeams = useStore((s) => s.agentTeams);
  const customAgents = useStore((s) => s.customAgents);
  const activeCustomAgentId = useStore((s) => s.activeCustomAgentId);
  const mainAgentPrompts = useStore((s) => s.mainAgentPrompts);
  const setSection = useStore((s) => s.setSection);

  const label = contextLabel(section, {
    knowledge: knowledge.length,
    agents: subAgents.length,
    skills: skills.length,
    teams: agentTeams.length,
    customagents: customAgents.length,
    systemprompts: mainAgentPrompts.length,
  });
  const isChat = section === "chat";
  const activeAgent = customAgents.find((a) => a.id === activeCustomAgentId) ?? null;

  return (
    <header className="flex h-14 shrink-0 items-center justify-between px-6 max-[640px]:px-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <p className="m-0 text-sm font-medium">Haku</p>
        {/* Which top-level agent chat turns run as (only shown when a Custom Agent is active). */}
        {activeAgent && (
          <button
            type="button"
            onClick={() => setSection("customagents")}
            title={`Chatting with your custom agent "${activeAgent.name}". Click to manage agents.`}
            className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-[var(--chip)] px-2.5 py-1 text-xs font-medium text-[var(--muted)] transition-colors hover:bg-[var(--chip-hover)] hover:text-[var(--fg)]"
          >
            <Boxes className="h-3.5 w-3.5 shrink-0 text-[var(--secondary)]" />
            <span className="truncate max-w-[10rem]">{activeAgent.name}</span>
          </button>
        )}
      </div>

      <div className="flex items-center gap-2.5">
        {isChat ? (
          <button
            type="button"
            onClick={() => newConversation()}
            title="New thread"
            aria-label="New thread"
            className="inline-flex h-11 items-center gap-1.5 rounded-full bg-[var(--chip)] pl-4 pr-2 text-xs font-medium tracking-[0.02em] text-[var(--muted)] transition-colors hover:bg-[var(--chip-hover)] hover:text-[var(--fg)] active:scale-[0.98]"
          >
            New thread
            <span className="grid h-7 w-7 place-items-center rounded-full text-[var(--muted)]">
              <Plus className="h-4 w-4" strokeWidth={1.9} />
            </span>
          </button>
        ) : (
          label && (
            <span className="inline-flex items-center rounded-full bg-[var(--chip)] px-3 py-1 text-xs font-medium tracking-[0.02em] text-[var(--muted)]">
              {label}
            </span>
          )
        )}

        <TopIcon
          title="Memory agent"
          onClick={() => setMemoryAgentOpen(true)}
          count={memoryAgentCounts.running + memoryAgentCounts.queued}
        >
          <Brain className="h-[18px] w-[18px]" strokeWidth={1.7} />
        </TopIcon>
        <TopIcon title="Memory agent sessions" onClick={() => setMemoryAgentSessionsOpen(true)}>
          <History className="h-[18px] w-[18px]" strokeWidth={1.7} />
        </TopIcon>
        <TopIcon title="Todo list" onClick={() => setTodosOpen(true)} count={todos.length}>
          <ListTodo className="h-[18px] w-[18px]" strokeWidth={1.7} />
        </TopIcon>
        <TopIcon title="Attached files" onClick={() => setFilesOpen(true)} count={attachedFiles.length}>
          <Paperclip className="h-[18px] w-[18px]" strokeWidth={1.7} />
        </TopIcon>
        <TopIcon title="Settings" onClick={() => setSettingsOpen(true)}>
          <Settings className="h-5 w-5" strokeWidth={1.7} />
        </TopIcon>
      </div>
    </header>
  );
}

function TopIcon({
  title,
  onClick,
  count,
  children,
}: {
  title: string;
  onClick: () => void;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn(
        "relative grid h-11 w-11 place-items-center rounded-[var(--radius-md)] text-[var(--muted)] transition-colors hover:bg-[var(--chip)] hover:text-[var(--fg)]",
      )}
    >
      {children}
      {count != null && count > 0 && (
        <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--secondary)] px-1 text-[10px] font-semibold tabular-nums text-[var(--secondary-fg)]">
          {count}
        </span>
      )}
    </button>
  );
}
