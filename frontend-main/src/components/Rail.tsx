import { MessageCircle, Brain, Library, Bot, Sparkles, Users, Boxes, FileText } from "lucide-react";
import { useStore, type Section } from "@/store/useStore";
import { cn } from "@/utils/cn";

const NAV: Array<{ id: Section; label: string; Icon: typeof MessageCircle }> = [
  { id: "chat", label: "Chat history", Icon: MessageCircle },
  { id: "customagents", label: "Custom agents", Icon: Boxes },
  { id: "systemprompts", label: "Custom system prompts", Icon: FileText },
  { id: "memory", label: "Memory", Icon: Brain },
  { id: "knowledge", label: "Knowledge base", Icon: Library },
  { id: "agents", label: "Sub-agents", Icon: Bot },
  { id: "skills", label: "Skills", Icon: Sparkles },
  { id: "teams", label: "Agent teams", Icon: Users },
];

export function Rail() {
  const section = useStore((s) => s.section);
  const setSection = useStore((s) => s.setSection);

  return (
    <aside
      className="flex shrink-0 flex-col border-r border-[var(--border)] bg-[var(--rail)]"
      style={{ width: "var(--rail-w)" }}
    >
      <div className="flex flex-col items-center pt-4">
        <div
          className="grid h-10 w-10 place-items-center rounded-[var(--radius-md)] bg-[var(--secondary)] text-[var(--secondary-fg)]"
          aria-hidden
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="7.25" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        </div>

        <nav aria-label="Workspace" className="mt-3 flex flex-col items-center gap-1">
          {NAV.map(({ id, label, Icon }) => {
            const active = section === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSection(id)}
                aria-current={active ? "page" : undefined}
                title={label}
                className={cn(
                  "group relative grid h-11 w-11 place-items-center rounded-[var(--radius-md)] transition-all duration-150 active:scale-95",
                  active
                    ? "bg-[var(--secondary)] text-[var(--secondary-fg)]"
                    : "text-[var(--muted)] hover:bg-[color:color-mix(in_oklab,var(--fg)_6%,transparent)] hover:text-[var(--fg)]",
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={1.7} />
                <span className="sr-only">{label}</span>
                <span
                  className="pointer-events-none absolute left-[calc(100%+0.75rem)] top-1/2 z-40 -translate-y-1/2 translate-x-[-4px] whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--secondary)] px-2.5 py-1.5 text-xs font-medium text-[var(--secondary-fg)] opacity-0 transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100 max-[640px]:hidden"
                  style={{ boxShadow: "var(--shadow-card)" }}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto flex flex-col items-center pb-4">
        <div
          className="grid h-10 w-10 place-items-center rounded-full bg-[var(--chip)] text-[var(--muted)]"
          style={{ boxShadow: "var(--shadow-chip)" }}
          aria-label="Account"
          title="Account"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="9" r="3.2" stroke="currentColor" strokeWidth="1.7" />
            <path
              d="M6.5 19c.8-2.8 2.8-4.2 5.5-4.2s4.7 1.4 5.5 4.2"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>
    </aside>
  );
}
