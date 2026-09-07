import { useState, type ReactNode } from "react";
import {
  Bot,
  Blocks,
  Braces,
  Brain,
  Check,
  ChevronDown,
  ClipboardList,
  CornerDownLeft,
  Download,
  ExternalLink,
  Eye,
  FileDiff,
  FileEdit,
  FilePlus2,
  FileText,
  FolderTree,
  Globe,
  Hash,
  History,
  Image as ImageIcon,
  Library,
  Link2,
  List,
  ListTodo,
  ListTree,
  Loader2,
  PackagePlus,
  Paperclip,
  Pencil,
  PencilLine,
  Repeat2,
  Search,
  Terminal,
  Timer,
  Trash2,
  UserMinus,
  UserPlus,
  Wand2,
  Wrench,
  X,
} from "lucide-react";
import type {
  AttachedFile,
  SubAgentRun,
  ToolActivity,
  ToolActivityStatus,
} from "@/types";
import { cn } from "@/utils/cn";
import { formatBytes } from "@/utils/format";
import { useStore } from "@/store/useStore";
import { API_ROUTES, routeUrl } from "@/app/api/routes";

const MEMORY_TOOLS = new Set([
  "memory_list",
  "memory_read",
  "memory_write",
  "memory_edit",
  "memory_delete",
]);
const KNOWLEDGE_TOOLS = new Set([
  "knowledge_list",
  "knowledge_read",
  "knowledge_create",
  "knowledge_edit",
  "knowledge_delete",
]);

const PROVIDER_LABELS: Record<string, string> = {
  tavily: "Tavily",
  exa: "Exa",
  serpapi: "SerpAPI",
  duckduckgo: "DuckDuckGo",
  builtin: "Built-in scraper",
  firecrawl: "Firecrawl",
};

const ICONS: Record<string, typeof Terminal> = {
  file_write: FilePlus2,
  file_read: FileText,
  file_list: FolderTree,
  str_replace: Pencil,
  apply_multiple_edits: PencilLine,
  apply_patch: FileDiff,
  shall_tool: Terminal,
  shell_view: Eye,
  bash_write_to_process: CornerDownLeft,
  web_search: Globe,
  fatch_web_urls: Globe,
  read_image: ImageIcon,
  image_search: ImageIcon,
  call_sub_agent: Bot,
  call_multiple_sub_agents: Bot,
  list_sub_agents: ListTree,
  list_skills: Blocks,
  skill_initialize: PackagePlus,
  create_sub_agent: UserPlus,
  create_skill: Wand2,
  delete_sub_agent: UserMinus,
  delete_skill: Trash2,
  list_sub_agent_sessions: History,
  reuse_same_sub_agent_session: Repeat2,
  wait: Timer,
  TodoWrite: ListTodo,
  read_todos: ClipboardList,
  memory_search: Search,
  knowledge_search: Search,
  embed_url: Link2,
  attach_files: Paperclip,
};

/* ------------------------------------------------------------------ shared UI */

function StatusIcon({ status }: { status: ToolActivityStatus }) {
  if (status === "running") return <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--secondary)]" />;
  if (status === "ok") return <Check className="h-3.5 w-3.5 text-[var(--success)]" />;
  return <X className="h-3.5 w-3.5 text-[var(--danger)]" />;
}

function chipClasses(status: ToolActivityStatus, clickable: boolean): string {
  return cn(
    "inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors",
    status === "error"
      ? "border-[color:color-mix(in_oklab,var(--danger)_35%,transparent)] bg-[var(--danger-soft)] text-[var(--danger)]"
      : "border-[var(--border)] bg-[var(--chip)] text-[var(--fg)]",
    clickable && "hover:bg-[var(--chip-hover)]",
    !clickable && "cursor-default",
  );
}

function Pill({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "off" | "accent" | "danger" | "warn" }) {
  const tones: Record<string, string> = {
    default: "border-[var(--border)] text-[var(--muted)]",
    off: "border-dashed border-[var(--border)] text-[var(--subtle)]",
    accent: "border-[var(--secondary)] text-[var(--secondary)]",
    danger: "border-[color:color-mix(in_oklab,var(--danger)_35%,transparent)] text-[var(--danger)]",
    warn: "border-[color:color-mix(in_oklab,var(--warning)_35%,transparent)] text-[var(--warning)]",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]", tones[tone])}>
      {children}
    </span>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="mt-1.5 w-full space-y-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg)] p-3 text-xs fade-in">
      {children}
    </div>
  );
}

function Pre({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <pre
      className={cn(
        "max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--chip)] p-2 font-mono text-[11px] leading-relaxed text-[var(--fg)]",
        className,
      )}
    >
      {children}
    </pre>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--subtle)]">{children}</div>;
}

/** Reusable expandable chip shell. `panel` is only invoked when expanded (perf). */
function Shell({
  icon,
  label,
  pills,
  status,
  expandable,
  panel,
}: {
  icon: ReactNode;
  label: ReactNode;
  pills?: ReactNode;
  status: ToolActivityStatus;
  expandable: boolean;
  panel?: () => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="w-full max-w-full">
      <button
        type="button"
        disabled={!expandable}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={expandable ? open : undefined}
        className={chipClasses(status, expandable)}
      >
        <span className="shrink-0 opacity-80">{icon}</span>
        <span className="max-w-[280px] truncate font-medium">{label}</span>
        {pills}
        {expandable && (
          <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 opacity-70 transition-transform", open && "rotate-180")} />
        )}
        <StatusIcon status={status} />
      </button>
      {expandable && open && panel && <Panel>{panel()}</Panel>}
    </div>
  );
}

/* ------------------------------------------------------------------ dispatcher */

type Result = { ok?: boolean; data?: Record<string, any>; error?: Record<string, any> } | undefined;

function parts(tool: ToolActivity) {
  const result = tool.result as Result;
  const hasResult = tool.status !== "running" && Boolean(result);
  const data = result?.ok ? result?.data : undefined;
  const error = result && !result.ok ? result.error : undefined;
  const args = (tool.args ?? {}) as Record<string, any>;
  return { result, hasResult, data, error, args, icon: (ICONS[tool.name] ?? Terminal) };
}

export function ToolChip({ tool }: { tool: ToolActivity }) {
  if (tool.name === "call_sub_agent" && tool.subAgent) return <SubAgentChip tool={tool} run={tool.subAgent} />;
  if (tool.name === "call_multiple_sub_agents") return <MultiSubAgentChip tool={tool} />;
  if (tool.name === "shall_tool") return <ShellChip tool={tool} />;
  if (tool.name === "shell_view") return <ShellViewChip tool={tool} />;
  if (tool.name === "bash_write_to_process") return <BashWriteChip tool={tool} />;
  if (tool.name === "file_read") return <FileReadChip tool={tool} />;
  if (tool.name === "str_replace") return <StrReplaceChip tool={tool} />;
  if (tool.name === "apply_multiple_edits") return <ApplyEditsChip tool={tool} />;
  if (tool.name === "apply_patch") return <ApplyPatchChip tool={tool} />;
  if (tool.name === "read_image") return <ReadImageChip tool={tool} />;
  if (tool.name === "image_search") return <ImageSearchChip tool={tool} />;
  if (tool.name === "fatch_web_urls") return <FetchChip tool={tool} />;
  if (tool.name === "web_search") return <WebSearchChip tool={tool} />;
  if (tool.name === "TodoWrite" || tool.name === "read_todos") return <TodoChip tool={tool} />;
  if (tool.name === "memory_search" || tool.name === "knowledge_search") return <SearchLocatorChip tool={tool} />;
  if (MEMORY_TOOLS.has(tool.name)) return <MemoryChip tool={tool} kind="memory" />;
  if (KNOWLEDGE_TOOLS.has(tool.name)) return <MemoryChip tool={tool} kind="knowledge" />;
  if (tool.name === "embed_url") return <EmbedUrlChip tool={tool} />;
  if (tool.name === "attach_files") return <AttachFilesChip tool={tool} />;
  if (tool.name === "list_sub_agents") return <ListSubAgentsChip tool={tool} />;
  if (tool.name === "list_skills") return <ListSkillsChip tool={tool} />;
  if (tool.name === "skill_initialize") return <SkillInitChip tool={tool} />;
  if (tool.name === "create_sub_agent") return <CreateSubAgentChip tool={tool} />;
  if (tool.name === "delete_sub_agent") return <DeleteSubAgentChip tool={tool} />;
  if (tool.name === "create_skill") return <CreateSkillChip tool={tool} />;
  if (tool.name === "delete_skill") return <DeleteSkillChip tool={tool} />;
  if (tool.name === "list_sub_agent_sessions") return <ListSubAgentSessionsChip tool={tool} />;
  if (tool.name === "reuse_same_sub_agent_session") return <ReuseSessionChip tool={tool} />;
  if (tool.name === "wait") return <WaitChip tool={tool} />;
  return <GenericChip tool={tool} />;
}

/* ------------------------------------------------------------------ sub-agent */

/** The expandable body of a single sub-agent run — shared by the single and batch chips. */
function SubAgentRunView({ run }: { run: SubAgentRun }) {
  const [showReasoning, setShowReasoning] = useState(false);
  return (
    <>
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 font-medium text-[var(--fg)]">
          <Bot className="h-3.5 w-3.5 text-[var(--secondary)]" />
          {run.agent}
        </span>
        {run.background && <Pill>background</Pill>}
        {run.sentContext && <Pill>context shared</Pill>}
      </div>
      {run.background && run.outputFile && (
        <div>
          <Label>Output file</Label>
          <div className="mt-1 break-all font-mono text-[var(--muted)]">{run.outputFile}</div>
        </div>
      )}
      {run.task && (
        <div>
          <Label>Task</Label>
          <div className="mt-1 whitespace-pre-wrap text-[var(--muted)]">{run.task}</div>
        </div>
      )}
      {run.reasoning.trim().length > 0 && (
        <div className="overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border)]">
          <button
            onClick={() => setShowReasoning((v) => !v)}
            className="flex w-full items-center gap-1.5 px-2 py-1.5 text-[var(--muted)] hover:text-[var(--fg)]"
          >
            <ChevronDown className={cn("h-3 w-3 transition-transform", showReasoning && "rotate-180")} />
            Reasoning
          </button>
          {showReasoning && (
            <div className="whitespace-pre-wrap px-2 pb-2 text-[var(--muted)]">{run.reasoning}</div>
          )}
        </div>
      )}
      {run.tools.length > 0 && (
        <div className="flex flex-col items-start gap-1.5">
          {run.tools.map((t) => (
            <ToolChip key={t.id} tool={t} />
          ))}
        </div>
      )}
      <div>
        <Label>Output</Label>
        {run.output ? (
          <div className={cn("mt-1 whitespace-pre-wrap break-words text-[var(--fg)]", run.status === "running" && "caret")}>
            {run.output}
          </div>
        ) : run.status === "running" ? (
          <div className="mt-1 flex items-center gap-2 text-[var(--muted)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Working…
          </div>
        ) : (
          <div className="mt-1 text-[var(--muted)]">No output.</div>
        )}
      </div>
      {run.error && <div className="text-[var(--danger)]">⚠️ {run.error}</div>}
    </>
  );
}

/** A single sub-agent run rendered as its own expandable chip (the call_sub_agent block). */
function SubAgentRunChip({ run }: { run: SubAgentRun }) {
  const label = `Sub-Agent: ${run.agent || "sub-agent"}${run.background ? " · background" : ""}`;
  return (
    <Shell
      icon={<Bot className="h-3.5 w-3.5" />}
      label={label}
      status={run.status}
      expandable
      panel={() => <SubAgentRunView run={run} />}
    />
  );
}

function SubAgentChip({ tool, run }: { tool: ToolActivity; run: SubAgentRun }) {
  void tool;
  return <SubAgentRunChip run={run} />;
}

/** Aggregate status for the batch block: running if any child is still running, else error if any
 * child failed, else ok. */
function aggregateStatus(runs: SubAgentRun[]): ToolActivityStatus {
  if (runs.some((r) => r.status === "running")) return "running";
  if (runs.some((r) => r.status === "error")) return "error";
  return "ok";
}

/**
 * The call_multiple_sub_agents block. It reuses the single call_sub_agent block for each child,
 * nested inside one extra "batch" block that identifies this tool and groups every sub-agent.
 */
function MultiSubAgentChip({ tool }: { tool: ToolActivity }) {
  const order = tool.multiOrder ?? Object.keys(tool.multiRuns ?? {});
  const runs = order.map((id) => tool.multiRuns?.[id]).filter((r): r is SubAgentRun => Boolean(r));
  // Prefer the live aggregate of the child runs; fall back to the tool's own status before any
  // child has registered (e.g. a brand-new batch whose start event hasn't arrived yet).
  const status = runs.length > 0 ? aggregateStatus(runs) : tool.status;
  const done = runs.filter((r) => r.status !== "running").length;
  return (
    <Shell
      icon={<Bot className="h-3.5 w-3.5" />}
      label={tool.label || `Sub-Agents (${runs.length})`}
      status={status}
      expandable={runs.length > 0}
      pills={
        runs.length > 0 ? (
          <Pill>
            {done}/{runs.length} done
          </Pill>
        ) : undefined
      }
      panel={() => (
        <>
          <div className="text-[var(--muted)]">
            {runs.length} sub-agent(s) called in parallel. Each runs independently below.
          </div>
          <div className="flex flex-col items-stretch gap-1.5">
            {runs.map((run, i) => (
              <SubAgentRunChip key={order[i]} run={run} />
            ))}
          </div>
        </>
      )}
    />
  );
}

/* ------------------------------------------------------------------ shell */

function ShellChip({ tool }: { tool: ToolActivity }) {
  const { data, error, args, hasResult } = parts(tool);
  const command = data?.command ?? args.command ?? tool.label;
  const stdout = data?.stdout ?? error?.stdout ?? "";
  const stderr = data?.stderr ?? error?.stderr ?? "";
  const exitCode = data?.exit_code;
  const timedOut = data?.timed_out ?? error?.code === "shell_timeout";
  const timeout = error?.timeout_seconds ?? args.timeout ?? 60;
  return (
    <Shell
      icon={<Terminal className="h-3.5 w-3.5" />}
      label={tool.label}
      status={tool.status}
      expandable={hasResult || Boolean(args.command)}
      pills={
        <>
          <Pill>
            <Timer className="h-2.5 w-2.5" />
            {timeout}s
          </Pill>
        </>
      }
      panel={() => (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <Pill>
              <Terminal className="h-2.5 w-2.5" />
              <span className="font-mono">{String(command)}</span>
            </Pill>
            {exitCode != null && <Pill tone={exitCode === 0 ? "default" : "danger"}>exit: {exitCode}</Pill>}
            {timedOut && <Pill tone="warn">timed out</Pill>}
            {(data?.truncated || error?.truncated) && <Pill tone="warn">truncated</Pill>}
          </div>
          {error?.message && <div className="text-[var(--danger)]">Command failed: {error.message}</div>}
          {stdout ? (
            <div>
              <Label>stdout</Label>
              <Pre className="mt-1">{stdout}</Pre>
            </div>
          ) : null}
          {stderr ? (
            <div>
              <Label>stderr</Label>
              <Pre className="mt-1 text-[var(--danger)]">{stderr}</Pre>
            </div>
          ) : null}
          {!stdout && !stderr && <div className="text-[var(--muted)]">No output.</div>}
        </>
      )}
    />
  );
}

function ShellViewChip({ tool }: { tool: ToolActivity }) {
  const { data, error, hasResult } = parts(tool);
  const sessions: any[] = (data?.sessions as any[]) ?? (error?.sessions as any[]) ?? [];
  return (
    <Shell
      icon={<Eye className="h-3.5 w-3.5" />}
      label={tool.label}
      status={tool.status}
      expandable={hasResult}
      pills={sessions.length > 0 ? <Pill>{sessions.length} session(s)</Pill> : undefined}
      panel={() => (
        <>
          {error?.message && <div className="text-[var(--danger)]">{error.message}</div>}
          {sessions.map((s, i) => (
            <div key={i} className="rounded-[var(--radius-sm)] border border-[var(--border)] p-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="flex items-center gap-1 font-mono text-[var(--fg)]">
                  <Eye className="h-3 w-3" />
                  {s.session_name}
                </span>
                {s.status && <Pill>{s.status}</Pill>}
                {s.pid != null && <Pill>pid: {s.pid}</Pill>}
                {s.exit_code != null && <Pill tone={s.exit_code === 0 ? "default" : "danger"}>exit: {s.exit_code}</Pill>}
              </div>
              <Pre className="mt-1.5">{s.output || "(no output yet)"}</Pre>
            </div>
          ))}
          {sessions.length === 0 && !error && <div className="text-[var(--muted)]">No sessions.</div>}
        </>
      )}
    />
  );
}

function BashWriteChip({ tool }: { tool: ToolActivity }) {
  const { data, error, hasResult } = parts(tool);
  return (
    <Shell
      icon={<CornerDownLeft className="h-3.5 w-3.5" />}
      label={tool.label}
      status={tool.status}
      expandable={hasResult}
      panel={() => (
        <>
          {error?.message && <div className="text-[var(--danger)]">Write failed: {error.message}</div>}
          {data && (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                {data.session_name && <Pill>{data.session_name}</Pill>}
                <Pill tone={data.press_enter ? "default" : "off"}>press_enter: {String(Boolean(data.press_enter))}</Pill>
                {data.bytes_written != null && <Pill>{data.bytes_written} bytes</Pill>}
              </div>
              {data.written != null && (
                <div>
                  <Label>Written to stdin</Label>
                  <Pre className="mt-1">{String(data.written)}</Pre>
                </div>
              )}
            </>
          )}
        </>
      )}
    />
  );
}

/* ------------------------------------------------------------------ files */

function FileReadChip({ tool }: { tool: ToolActivity }) {
  const { data, error, args, hasResult } = parts(tool);
  return (
    <Shell
      icon={<FileText className="h-3.5 w-3.5" />}
      label={tool.label}
      status={tool.status}
      expandable={hasResult}
      panel={() => (
        <>
          {error?.message && <div className="text-[var(--danger)]">Read failed: {error.message}</div>}
          {data && (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <Pill>
                  <span className="font-mono">{data.file_path ?? tool.filePath}</span>
                </Pill>
                <Pill tone={args.offset != null ? "default" : "off"}>offset: {args.offset ?? "—"}</Pill>
                <Pill tone={args.limit != null ? "default" : "off"}>limit: {args.limit ?? "—"}</Pill>
                {data.truncated && <Pill tone="warn">truncated</Pill>}
              </div>
              <Pre>{data.content || "(empty file)"}</Pre>
              {data.line_count != null && (
                <div className="text-[var(--muted)]">
                  {data.line_count} of {data.total_lines} lines · lines {data.first_line}–{data.last_line}
                </div>
              )}
            </>
          )}
        </>
      )}
    />
  );
}

function StrReplaceChip({ tool }: { tool: ToolActivity }) {
  const { data, error, args, hasResult } = parts(tool);
  return (
    <Shell
      icon={<Pencil className="h-3.5 w-3.5" />}
      label={tool.label}
      status={tool.status}
      expandable={hasResult || args.old_string !== undefined}
      panel={() => (
        <>
          {error?.message && <div className="text-[var(--danger)]">Edit failed: {error.message}</div>}
          <div className="flex flex-wrap items-center gap-1.5">
            <Pill>
              <FileText className="h-2.5 w-2.5" />
              <span className="font-mono">{data?.file_path ?? tool.filePath}</span>
            </Pill>
            <Pill tone={args.replace_all ? "accent" : "off"}>replace_all: {String(Boolean(args.replace_all))}</Pill>
            {data?.replaced != null && <Pill>replaced: {data.replaced}</Pill>}
          </div>
          <div>
            <Label>Old string</Label>
            <Pre className="mt-1">{args.old_string || "(empty)"}</Pre>
          </div>
          <div>
            <Label>New string</Label>
            <Pre className="mt-1">{args.new_string || "(empty)"}</Pre>
          </div>
        </>
      )}
    />
  );
}

function ApplyEditsChip({ tool }: { tool: ToolActivity }) {
  const { data, error, args, hasResult } = parts(tool);
  const edits: any[] = Array.isArray(args.edits) ? args.edits : [];
  return (
    <Shell
      icon={<PencilLine className="h-3.5 w-3.5" />}
      label={tool.label}
      status={tool.status}
      expandable={hasResult || edits.length > 0}
      pills={edits.length > 0 ? <Pill>{edits.length} edit(s)</Pill> : undefined}
      panel={() => (
        <>
          {error?.message && <div className="text-[var(--danger)]">Edit failed: {error.message}</div>}
          <div className="flex flex-wrap items-center gap-1.5">
            <Pill>
              <span className="font-mono">{data?.file_path ?? tool.filePath}</span>
            </Pill>
            {data?.edits_applied != null && <Pill>applied: {data.edits_applied}</Pill>}
          </div>
          {edits.map((e, i) => (
            <div key={i} className="rounded-[var(--radius-sm)] border border-[var(--border)] p-2">
              <Label>Edit #{i + 1}</Label>
              <Pre className="mt-1">{e.old_text || "(empty)"}</Pre>
              <Pre className="mt-1">{e.new_text || "(empty — deletes matched text)"}</Pre>
            </div>
          ))}
        </>
      )}
    />
  );
}

/** Colorised view of a raw apply_patch envelope: +add lines green, -remove lines red, headers bold. */
function PatchDiff({ input }: { input: string }) {
  const lines = String(input ?? "").split("\n");
  return (
    <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--chip)] p-2 font-mono text-[11px] leading-relaxed">
      {lines.map((line, i) => {
        const isHeader = line.startsWith("*** ") || line.startsWith("@@");
        const isAdd = !isHeader && line.startsWith("+");
        const isDel = !isHeader && line.startsWith("-");
        return (
          <div
            key={i}
            className={cn(
              isHeader && "font-semibold text-[var(--secondary)]",
              isAdd && "bg-[var(--success-soft)] text-[var(--success)]",
              isDel && "bg-[var(--danger-soft)] text-[var(--danger)]",
              !isHeader && !isAdd && !isDel && "text-[var(--fg)]",
            )}
          >
            {line || " "}
          </div>
        );
      })}
    </pre>
  );
}

const PATCH_OP_META: Record<string, { label: string; tone: "accent" | "default" | "danger" }> = {
  add: { label: "add", tone: "accent" },
  update: { label: "update", tone: "default" },
  delete: { label: "delete", tone: "danger" },
};

/** apply_patch — shows the raw structured patch (colorised) plus the per-file operations applied. */
function ApplyPatchChip({ tool }: { tool: ToolActivity }) {
  const { data, error, args, hasResult } = parts(tool);
  const input: string = (args.input as string) ?? "";
  const operations: any[] = (data?.operations as any[]) ?? [];
  return (
    <Shell
      icon={<FileDiff className="h-3.5 w-3.5" />}
      label={tool.label}
      status={tool.status}
      expandable={hasResult || input.length > 0}
      pills={
        data?.files_changed != null ? (
          <Pill>{data.files_changed} file(s)</Pill>
        ) : input.length > 0 ? (
          <Pill tone="accent">patch</Pill>
        ) : undefined
      }
      panel={() => (
        <>
          {error?.message && (
            <div className="text-[var(--danger)]">
              Patch failed: {error.message}
              {error.line != null && <span className="ml-1 opacity-70">(line {error.line})</span>}
            </div>
          )}
          {operations.length > 0 && (
            <div className="flex flex-col gap-1">
              {operations.map((op, i) => {
                const meta = PATCH_OP_META[op.type] ?? { label: op.type, tone: "default" as const };
                return (
                  <div key={i} className="flex flex-wrap items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] p-1.5">
                    <Pill tone={meta.tone}>{meta.label}</Pill>
                    <span className="font-mono text-[var(--fg)]">{op.file_path}</span>
                    {op.moved_to && (
                      <span className="flex items-center gap-1 text-[var(--muted)]">
                        <CornerDownLeft className="h-2.5 w-2.5" />
                        <span className="font-mono">{op.moved_to}</span>
                      </span>
                    )}
                    {op.lines_added != null && op.lines_added > 0 && <Pill tone="accent">+{op.lines_added}</Pill>}
                    {op.lines_removed != null && op.lines_removed > 0 && <Pill tone="danger">-{op.lines_removed}</Pill>}
                  </div>
                );
              })}
            </div>
          )}
          {data?.summary && <div className="text-[var(--muted)]">{String(data.summary)}</div>}
          {input.length > 0 && (
            <div>
              <Label>Patch</Label>
              <div className="mt-1">
                <PatchDiff input={input} />
              </div>
            </div>
          )}
        </>
      )}
    />
  );
}

/* ------------------------------------------------------------------ images */

function ReadImageChip({ tool }: { tool: ToolActivity }) {
  const { data, error, hasResult } = parts(tool);
  const filePath: string = data?.file_path ?? "";
  const isUrl = data?.source === "url" || /^https?:\/\//i.test(filePath);
  return (
    <Shell
      icon={<ImageIcon className="h-3.5 w-3.5" />}
      label={tool.label}
      status={tool.status}
      expandable={hasResult}
      panel={() => (
        <>
          {error?.message && <div className="text-[var(--danger)]">Read failed: {error.message}</div>}
          {data && (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <Pill>
                  {isUrl ? <Link2 className="h-2.5 w-2.5" /> : <ImageIcon className="h-2.5 w-2.5" />}
                  <span className="font-mono">{filePath}</span>
                </Pill>
                <Pill>source: {isUrl ? "URL" : "workspace"}</Pill>
                {data.content_type && <Pill>{data.content_type}</Pill>}
                {data.size_bytes != null && <Pill>{formatBytes(data.size_bytes)}</Pill>}
              </div>
              {isUrl && (
                <img src={filePath} alt="Read image" className="max-h-64 rounded-[var(--radius-sm)] border border-[var(--border)]" referrerPolicy="no-referrer" />
              )}
              <div className="text-[var(--muted)]">The image was attached to the model's vision input for analysis.</div>
            </>
          )}
        </>
      )}
    />
  );
}

function ImageSearchChip({ tool }: { tool: ToolActivity }) {
  const { data, hasResult } = parts(tool);
  const results: any[] = (data?.results as any[]) ?? [];
  return (
    <Shell
      icon={<ImageIcon className="h-3.5 w-3.5" />}
      label={tool.label}
      status={tool.status}
      expandable={hasResult}
      pills={results.length > 0 ? <Pill>{results.length} image(s)</Pill> : undefined}
      panel={() => (
        <>
          <div className="text-[var(--muted)]">
            {results.length} image(s) · {PROVIDER_LABELS[data?.provider] ?? data?.provider} · "{data?.query}"
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {results.map((r, i) => (
              <a
                key={i}
                href={r.source_url ?? r.image_url}
                target="_blank"
                rel="noreferrer"
                className="group overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border)]"
              >
                <img
                  src={r.image_url}
                  alt={r.title ?? "Image result"}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="aspect-square w-full object-cover"
                  onError={(e) => (e.currentTarget.style.opacity = "0.2")}
                />
                <div className="flex items-center gap-1 px-1.5 py-1 text-[10px] text-[var(--muted)]">
                  <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                  <span className="truncate">{r.title || "Image result"}</span>
                </div>
              </a>
            ))}
          </div>
        </>
      )}
    />
  );
}

/* ------------------------------------------------------------------ web */

function WebSearchChip({ tool }: { tool: ToolActivity }) {
  const { data, error, hasResult } = parts(tool);
  const results: any[] = (data?.results as any[]) ?? [];
  return (
    <Shell
      icon={<Globe className="h-3.5 w-3.5" />}
      label={tool.label}
      status={tool.status}
      expandable={hasResult}
      pills={results.length > 0 ? <Pill>{results.length} result(s)</Pill> : undefined}
      panel={() => (
        <>
          {error?.message && <div className="text-[var(--danger)]">Search failed: {error.message}</div>}
          {results.length === 0 && !error && <div className="text-[var(--muted)]">No results found.</div>}
          {results.length > 0 && (
            <div className="text-[var(--muted)]">
              {results.length} result(s) · {PROVIDER_LABELS[data?.provider] ?? data?.provider} · "{data?.query}"
            </div>
          )}
          {results.map((r, i) => (
            <a key={i} href={r.url} target="_blank" rel="noreferrer" className="block rounded-[var(--radius-sm)] border border-[var(--border)] p-2 hover:bg-[var(--chip)]">
              <div className="flex items-center gap-1 font-medium text-[var(--secondary)]">
                <ExternalLink className="h-3 w-3 shrink-0" />
                <span className="truncate">{r.title || r.url}</span>
              </div>
              <div className="truncate text-[10px] text-[var(--subtle)]">{r.url}</div>
              {(r.Description || r.description) && (
                <div className="line-clamp-2 mt-0.5 text-[var(--muted)]">{r.Description || r.description}</div>
              )}
            </a>
          ))}
        </>
      )}
    />
  );
}

function FetchChip({ tool }: { tool: ToolActivity }) {
  const { data, error, hasResult } = parts(tool);
  const isCrawl = Boolean(data && (data.mode === "crawl" || Array.isArray(data.pages)));
  const pages: any[] = (data?.pages as any[]) ?? [];
  return (
    <Shell
      icon={<Globe className="h-3.5 w-3.5" />}
      label={tool.label}
      status={tool.status}
      expandable={hasResult}
      pills={data?.provider ? <Pill>{PROVIDER_LABELS[data.provider] ?? data.provider}</Pill> : undefined}
      panel={() => (
        <>
          {error?.message && <div className="text-[var(--danger)]">Fetch failed: {error.message}</div>}
          {isCrawl ? (
            pages.map((p, i) => (
              <div key={i} className="rounded-[var(--radius-sm)] border border-[var(--border)] p-2">
                <div className="flex items-center gap-1.5">
                  <Globe className="h-3 w-3" />
                  <span className="truncate font-medium">{p.title || p.url}</span>
                  {p.status != null && <Pill>{p.status}</Pill>}
                </div>
                <a href={p.url} target="_blank" rel="noreferrer" className="block truncate text-[10px] text-[var(--secondary)]">
                  {p.url}
                </a>
                {p.content && <Pre className="mt-1">{p.content}</Pre>}
              </div>
            ))
          ) : (
            data && (
              <>
                {data.url && data.title && (
                  <a href={data.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-medium text-[var(--secondary)]">
                    <ExternalLink className="h-3 w-3" /> {data.title}
                  </a>
                )}
                {data.description && <div className="text-[var(--muted)]">{data.description}</div>}
                {data.content ? <Pre>{data.content}</Pre> : <div className="text-[var(--muted)]">No content returned.</div>}
              </>
            )
          )}
        </>
      )}
    />
  );
}

/* ------------------------------------------------------------------ todos */

const TODO_STATUS: Record<string, string> = { pending: "off", in_progress: "accent", completed: "default" };

function TodoChip({ tool }: { tool: ToolActivity }) {
  const { data, args, hasResult } = parts(tool);
  const todos: any[] = (data?.todos as any[]) ?? (args.todos as any[]) ?? [];
  return (
    <Shell
      icon={tool.name === "read_todos" ? <ClipboardList className="h-3.5 w-3.5" /> : <ListTodo className="h-3.5 w-3.5" />}
      label={tool.label}
      status={tool.status}
      expandable={hasResult || todos.length > 0}
      pills={<Pill>{data?.count ?? todos.length} todo(s)</Pill>}
      panel={() =>
        todos.length === 0 ? (
          <div className="text-[var(--muted)]">Todo list is empty.</div>
        ) : (
          <ul className="space-y-1.5">
            {todos.map((t) => (
              <li key={t.id} className="flex items-start gap-2">
                <span
                  className={cn(
                    "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border",
                    t.status === "completed" ? "border-[var(--success)] bg-[var(--success)] text-white" : "border-[var(--border)]",
                  )}
                >
                  {t.status === "completed" && <Check className="h-2.5 w-2.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <span className={cn("text-[var(--fg)]", t.status === "completed" && "text-[var(--muted)] line-through")}>{t.content}</span>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    <Pill tone={(TODO_STATUS[t.status] as any) ?? "default"}>{String(t.status).replace("_", " ")}</Pill>
                    <Pill>{t.priority}</Pill>
                    <Pill>#{t.id}</Pill>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )
      }
    />
  );
}

/* ------------------------------------------------------------------ search locator */

function SearchLocatorChip({ tool }: { tool: ToolActivity }) {
  const { data, error, hasResult } = parts(tool);
  const results: any[] = (data?.results as any[]) ?? [];
  return (
    <Shell
      icon={<Search className="h-3.5 w-3.5" />}
      label={tool.label}
      status={tool.status}
      expandable={hasResult}
      pills={results.length > 0 ? <Pill>{results.length} file(s)</Pill> : undefined}
      panel={() => (
        <>
          {error?.message && <div className="text-[var(--danger)]">{error.message}</div>}
          {data && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Pill>"{data.query}"</Pill>
              <Pill>{data.match_count} line(s)</Pill>
            </div>
          )}
          {results.map((r, i) => {
            const matches: { line?: number; content?: string }[] = Array.isArray(r.matches)
              ? r.matches
              : ((r.lines as number[] | undefined) ?? []).map((ln) => ({ line: ln }));
            return (
              <div key={i} className="rounded-[var(--radius-sm)] border border-[var(--border)] p-2">
                <span className="flex items-center gap-1 font-mono text-[var(--fg)]">
                  <FileText className="h-3 w-3" />
                  {r.path}
                </span>
                <div className="mt-1 flex flex-col gap-1">
                  {matches.map((m, li) => (
                    <div key={li} className="flex items-start gap-1.5 font-mono text-[11px]">
                      <span className="flex shrink-0 items-center gap-0.5 text-[var(--muted)]">
                        <Hash className="h-2.5 w-2.5" />
                        {m.line}
                      </span>
                      {m.content != null && (
                        <span className="whitespace-pre-wrap break-all text-[var(--fg)]">
                          {m.content}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}
    />
  );
}

/* ------------------------------------------------------------------ memory / knowledge */

const MEM_META: Record<string, { label: string; Icon: typeof List }> = {
  memory_list: { label: "List memory", Icon: List },
  memory_read: { label: "Read memory", Icon: FileText },
  memory_write: { label: "Write memory", Icon: FilePlus2 },
  memory_edit: { label: "Edit memory", Icon: FileEdit },
  memory_delete: { label: "Delete memory", Icon: Trash2 },
  knowledge_list: { label: "List knowledge", Icon: List },
  knowledge_read: { label: "Read knowledge", Icon: FileText },
  knowledge_create: { label: "Create knowledge", Icon: FilePlus2 },
  knowledge_edit: { label: "Edit knowledge", Icon: FileEdit },
  knowledge_delete: { label: "Delete knowledge", Icon: Trash2 },
};

function MemoryChip({ tool, kind }: { tool: ToolActivity; kind: "memory" | "knowledge" }) {
  const { data, error, args, hasResult } = parts(tool);
  const meta = MEM_META[tool.name] ?? { label: tool.label, Icon: kind === "memory" ? Brain : Library };
  const root = kind === "memory" ? "memory/" : "knowledge/";
  const path = (data?.path ?? args.path ?? args.knowledge_path ?? "").replace(new RegExp(`^${root}`, "i"), "");
  const files: any[] = (data?.files as any[]) ?? [];
  const isList = tool.name.endsWith("_list");
  return (
    <Shell
      icon={kind === "memory" ? <Brain className="h-3.5 w-3.5" /> : <Library className="h-3.5 w-3.5" />}
      label={tool.label}
      status={tool.status}
      expandable={hasResult}
      pills={isList && data?.count != null ? <Pill>{data.count} file(s)</Pill> : undefined}
      panel={() => (
        <>
          {error?.message && (
            <div className="text-[var(--danger)]">
              {error.message}
              {Array.isArray(error.available_paths) && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {error.available_paths.map((p: string, i: number) => (
                    <Pill key={i}>{p}</Pill>
                  ))}
                </div>
              )}
            </div>
          )}
          {data && (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="flex items-center gap-1 font-medium text-[var(--fg)]">
                  <meta.Icon className="h-3 w-3" />
                  {meta.label}
                </span>
                {path && <Pill><span className="font-mono">{root}{path}</span></Pill>}
                {data.preadded && <Pill tone="accent">core</Pill>}
                {data.chars != null && (
                  <Pill>
                    {data.chars}
                    {data.char_limit != null ? `/${data.char_limit}` : ""} chars
                  </Pill>
                )}
              </div>
              {isList && (
                <>
                  {data.tree && <Pre>{data.tree}</Pre>}
                  <ul className="space-y-1">
                    {files.map((f, i) => (
                      <li key={i} className="flex items-center gap-1.5">
                        <FileText className="h-3 w-3 text-[var(--muted)]" />
                        <span className="font-mono">{f.path}</span>
                        {f.preadded && <Pill tone="accent">core</Pill>}
                        <Pill>{f.chars} chars</Pill>
                      </li>
                    ))}
                  </ul>
                  {files.length === 0 && !data.tree && <div className="text-[var(--muted)]">No files.</div>}
                </>
              )}
              {tool.name.endsWith("_read") && <Pre>{data.content || "(empty file)"}</Pre>}
              {(tool.name.endsWith("_write") || tool.name.endsWith("_create")) && args.content != null && (
                <div>
                  <Label>Saved content</Label>
                  <Pre className="mt-1">{String(args.content)}</Pre>
                </div>
              )}
              {tool.name.endsWith("_edit") && (
                <>
                  <div>
                    <Label>Old string</Label>
                    <Pre className="mt-1">{args.old_str || "(empty)"}</Pre>
                  </div>
                  <div>
                    <Label>New string</Label>
                    <Pre className="mt-1">{args.new_str || "(empty — deletes matched text)"}</Pre>
                  </div>
                </>
              )}
              {data.message && <div className="text-[var(--muted)]">{data.message}</div>}
            </>
          )}
        </>
      )}
    />
  );
}

/* ------------------------------------------------------------------ embed / attach */

function EmbedUrlChip({ tool }: { tool: ToolActivity }) {
  const { data, error, args, hasResult } = parts(tool);
  const url: string = data?.url ?? args.url ?? "";
  const setPreview = useStore((s) => s.setPreview);
  const setPreviewOpen = useStore((s) => s.setPreviewOpen);
  return (
    <Shell
      icon={<Link2 className="h-3.5 w-3.5" />}
      label={url || tool.label}
      status={tool.status}
      expandable={hasResult || Boolean(url)}
      pills={<Pill tone="accent">preview</Pill>}
      panel={() => (
        <>
          {error?.message && <div className="text-[var(--danger)]">Embed failed: {error.message}</div>}
          {url && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setPreview(url);
                  setPreviewOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--secondary)] px-3 py-1.5 text-[var(--secondary-fg)]"
              >
                <Eye className="h-3.5 w-3.5" /> Open browser preview
              </button>
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1.5 text-[var(--fg)] hover:bg-[var(--chip)]"
              >
                <ExternalLink className="h-3.5 w-3.5" /> New tab
              </a>
            </div>
          )}
        </>
      )}
    />
  );
}

function AttachFilesChip({ tool }: { tool: ToolActivity }) {
  const { data, error, hasResult } = parts(tool);
  const files: AttachedFile[] = (data?.files as AttachedFile[]) ?? [];
  const errors: any[] = (data?.errors as any[]) ?? (error?.errors as any[]) ?? [];
  const setPreview = useStore((s) => s.setPreview);
  const setPreviewOpen = useStore((s) => s.setPreviewOpen);
  return (
    <Shell
      icon={<Paperclip className="h-3.5 w-3.5" />}
      label={tool.label}
      status={tool.status}
      expandable={hasResult}
      pills={<Pill>{data?.file_count ?? files.length} file(s)</Pill>}
      panel={() => (
        <>
          {error?.message && <div className="text-[var(--danger)]">{error.message}</div>}
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] p-2">
              <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-[var(--fg)]">{f.name}</div>
                <div className="truncate text-[10px] text-[var(--subtle)]">
                  {f.path} · {f.size_label ?? formatBytes(f.size)}
                </div>
              </div>
              <button
                onClick={() => {
                  setPreview(routeUrl(API_ROUTES.filesPreview, { query: { path: f.path } }));
                  setPreviewOpen(true);
                }}
                className="rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-1 text-[10px] hover:bg-[var(--chip)]"
              >
                <Eye className="inline h-3 w-3" /> Preview
              </button>
              <a
                href={routeUrl(API_ROUTES.filesDownload, { query: { path: f.path } })}
                download={f.name}
                className="rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-1 text-[10px] hover:bg-[var(--chip)]"
              >
                <Download className="inline h-3 w-3" />
              </a>
            </div>
          ))}
          {errors.length > 0 && (
            <div className="space-y-1">
              {errors.map((e, i) => (
                <div key={i} className="text-[var(--danger)]">
                  {e.path} — {e.error}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    />
  );
}

/* ------------------------------------------------------------------ lists / creates */

function ListSubAgentsChip({ tool }: { tool: ToolActivity }) {
  const { data, hasResult } = parts(tool);
  const agents: any[] = (data?.available_sub_agents as any[]) ?? [];
  return (
    <Shell
      icon={<ListTree className="h-3.5 w-3.5" />}
      label={tool.label}
      status={tool.status}
      expandable={hasResult}
      pills={agents.length > 0 ? <Pill>{agents.length}</Pill> : undefined}
      panel={() =>
        agents.length === 0 ? (
          <div className="text-[var(--muted)]">No sub-agents available.</div>
        ) : (
          agents.map((a, i) => (
            <div key={i} className="rounded-[var(--radius-sm)] border border-[var(--border)] p-2">
              <div className="flex items-center gap-1.5 font-medium text-[var(--secondary)]">
                <Bot className="h-3 w-3" />
                {a.name}
              </div>
              <div className="text-[var(--muted)]">{a.description}</div>
            </div>
          ))
        )
      }
    />
  );
}

function ListSkillsChip({ tool }: { tool: ToolActivity }) {
  const { data, error, hasResult } = parts(tool);
  const skills: any[] = (data?.skills as any[]) ?? [];
  return (
    <Shell
      icon={<Blocks className="h-3.5 w-3.5" />}
      label={tool.label}
      status={tool.status}
      expandable={hasResult}
      pills={skills.length > 0 ? <Pill>{skills.length}</Pill> : undefined}
      panel={() => (
        <>
          {error?.message && <div className="text-[var(--danger)]">List skills failed: {error.message}</div>}
          {skills.map((sk, i) => (
            <div key={i} className="rounded-[var(--radius-sm)] border border-[var(--border)] p-2">
              <div className="flex items-center gap-1.5 font-mono font-medium text-[var(--secondary)]">
                <Blocks className="h-3 w-3" />
                {sk.name}
              </div>
              <div className="text-[var(--muted)]">{sk.description}</div>
              {sk.tree && <Pre className="mt-1">{sk.tree}</Pre>}
            </div>
          ))}
        </>
      )}
    />
  );
}

function SkillInitChip({ tool }: { tool: ToolActivity }) {
  const { data, hasResult } = parts(tool);
  const initialized: any[] = (data?.initialized as any[]) ?? [];
  const failed: any[] = (data?.failed as any[]) ?? [];
  return (
    <Shell
      icon={<PackagePlus className="h-3.5 w-3.5" />}
      label={tool.label}
      status={tool.status}
      expandable={hasResult}
      pills={
        <>
          {initialized.length > 0 && <Pill>{initialized.length} ok</Pill>}
          {failed.length > 0 && <Pill tone="danger">{failed.length} failed</Pill>}
        </>
      }
      panel={() => (
        <>
          {initialized.map((s, i) => (
            <div key={i} className="rounded-[var(--radius-sm)] border border-[var(--border)] p-2">
              <div className="flex items-center gap-1.5 text-[var(--success)]">
                <FolderTree className="h-3 w-3" />
                {s.skill_name}
              </div>
              <div className="font-mono text-[10px] text-[var(--muted)]">{s.path}</div>
            </div>
          ))}
          {failed.map((f, i) => (
            <div key={i} className="rounded-[var(--radius-sm)] border border-[color:color-mix(in_oklab,var(--danger)_35%,transparent)] p-2 text-[var(--danger)]">
              {f.skill_name} — {f.error}
            </div>
          ))}
          {initialized.length === 0 && failed.length === 0 && <div className="text-[var(--muted)]">No skills initialized.</div>}
        </>
      )}
    />
  );
}

function CreateSubAgentChip({ tool }: { tool: ToolActivity }) {
  const { data, hasResult } = parts(tool);
  const created = data?.created_sub_agent as any;
  return (
    <Shell
      icon={<UserPlus className="h-3.5 w-3.5" />}
      label={tool.label}
      status={tool.status}
      expandable={hasResult}
      pills={created ? <Pill tone="accent">saved</Pill> : undefined}
      panel={() =>
        created ? (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="flex items-center gap-1 font-medium text-[var(--fg)]">
                <UserPlus className="h-3 w-3" />
                {created.name}
              </span>
              <Pill>{(created.tools ?? []).length} tool(s)</Pill>
            </div>
            <div className="text-[var(--muted)]">{created.description}</div>
            <div>
              <Label>System prompt</Label>
              <Pre className="mt-1">{created.system_prompt}</Pre>
            </div>
            <div className="flex flex-wrap gap-1">
              {(created.tools ?? []).map((t: string, i: number) => (
                <Pill key={i}>
                  <Wrench className="h-2.5 w-2.5" />
                  {t}
                </Pill>
              ))}
            </div>
          </>
        ) : (
          <div className="text-[var(--muted)]">No data.</div>
        )
      }
    />
  );
}

function DeleteSubAgentChip({ tool }: { tool: ToolActivity }) {
  const { data, error, args, hasResult } = parts(tool);
  const name: string = (data?.deleted_sub_agent as string) ?? (args.name as string) ?? "";
  return (
    <Shell
      icon={<UserMinus className="h-3.5 w-3.5" />}
      label={tool.label}
      status={tool.status}
      expandable={hasResult}
      pills={data?.deleted_sub_agent ? <Pill tone="danger">deleted</Pill> : undefined}
      panel={() => (
        <>
          {error?.message && <div className="text-[var(--danger)]">{error.message}</div>}
          {data?.deleted_sub_agent && (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="flex items-center gap-1 font-medium text-[var(--fg)]">
                  <UserMinus className="h-3 w-3" />
                  {name}
                </span>
              </div>
              {data.message && <div className="text-[var(--muted)]">{String(data.message)}</div>}
            </>
          )}
          {!data && !error && <div className="text-[var(--muted)]">No data.</div>}
        </>
      )}
    />
  );
}

function WaitChip({ tool }: { tool: ToolActivity }) {
  const { data, error, args, hasResult } = parts(tool);
  const seconds = (data?.waited_seconds as number) ?? (args.seconds as number) ?? 0;
  return (
    <Shell
      icon={<Timer className="h-3.5 w-3.5" />}
      label={tool.label}
      status={tool.status}
      expandable={hasResult}
      pills={<Pill><Timer className="h-2.5 w-2.5" />{seconds}s</Pill>}
      panel={() => (
        <>
          {error?.message && <div className="text-[var(--danger)]">{error.message}</div>}
          {data ? (
            <div className="text-[var(--muted)]">
              {data.message ? String(data.message) : `Waited ${seconds} second(s).`}
            </div>
          ) : (
            !error && <div className="text-[var(--muted)]">Waiting {seconds} second(s)…</div>
          )}
        </>
      )}
    />
  );
}

function CreateSkillChip({ tool }: { tool: ToolActivity }) {
  const { data, hasResult } = parts(tool);
  const created = data?.created_skill as any;
  const files: any[] = created?.files ?? [];
  return (
    <Shell
      icon={<Wand2 className="h-3.5 w-3.5" />}
      label={tool.label}
      status={tool.status}
      expandable={hasResult}
      pills={created ? <Pill tone="accent">saved</Pill> : undefined}
      panel={() =>
        created ? (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="flex items-center gap-1 font-medium text-[var(--fg)]">
                <Wand2 className="h-3 w-3" />
                {created.name}
              </span>
              <Pill>{data?.file_count ?? files.length} file(s)</Pill>
              <Pill tone="accent">{created.skill_file || "SKILL.md"}</Pill>
            </div>
            <div className="text-[var(--muted)]">{created.description}</div>
            <div className="flex flex-wrap gap-1">
              {files.map((f: any, i: number) => (
                <Pill key={i}>
                  <FileText className="h-2.5 w-2.5" />
                  {f.path}
                </Pill>
              ))}
            </div>
          </>
        ) : (
          <div className="text-[var(--muted)]">No data.</div>
        )
      }
    />
  );
}

/* ---------------------------------------------------- sub-agent sessions / delete skill */

/** delete_skill — mirrors the delete_sub_agent chip. */
function DeleteSkillChip({ tool }: { tool: ToolActivity }) {
  const { data, error, args, hasResult } = parts(tool);
  const name: string = (data?.deleted_skill as string) ?? (args.skill_name as string) ?? "";
  return (
    <Shell
      icon={<Trash2 className="h-3.5 w-3.5" />}
      label={tool.label}
      status={tool.status}
      expandable={hasResult}
      pills={data?.deleted_skill ? <Pill tone="danger">deleted</Pill> : undefined}
      panel={() => (
        <>
          {error?.message && <div className="text-[var(--danger)]">{error.message}</div>}
          {data?.deleted_skill && (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="flex items-center gap-1 font-medium text-[var(--fg)]">
                  <Blocks className="h-3 w-3" />
                  {name}
                </span>
              </div>
              {data.message && <div className="text-[var(--muted)]">{String(data.message)}</div>}
            </>
          )}
          {!data && !error && <div className="text-[var(--muted)]">No data.</div>}
        </>
      )}
    />
  );
}

/** list_sub_agent_sessions — the list of every sub-agent session created this chat, in a dropdown. */
function ListSubAgentSessionsChip({ tool }: { tool: ToolActivity }) {
  const { data, error, hasResult } = parts(tool);
  const sessions: any[] = (data?.sessions as any[]) ?? [];
  return (
    <Shell
      icon={<History className="h-3.5 w-3.5" />}
      label={tool.label}
      status={tool.status}
      expandable={hasResult}
      pills={sessions.length > 0 ? <Pill>{sessions.length}</Pill> : undefined}
      panel={() => (
        <>
          {error?.message && <div className="text-[var(--danger)]">{error.message}</div>}
          {sessions.length === 0 && !error && (
            <div className="text-[var(--muted)]">No sub-agent sessions yet.</div>
          )}
          {sessions.map((s, i) => (
            <div
              key={i}
              className="flex flex-wrap items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] p-2"
            >
              <span className="flex items-center gap-1 font-medium text-[var(--secondary)]">
                <Bot className="h-3 w-3" />
                {s.agent || "sub-agent"}
              </span>
              <Pill>
                <Hash className="h-2.5 w-2.5" />
                <span className="font-mono">{s.session_id}</span>
              </Pill>
              {s.status && <Pill tone={s.status === "completed" ? "default" : s.status === "running" ? "accent" : "danger"}>{s.status}</Pill>}
            </div>
          ))}
        </>
      )}
    />
  );
}

/**
 * reuse_same_sub_agent_session — a dropdown that reveals the reused sub-agent's live streaming run
 * (its output, reasoning, and nested tool calls), exactly like the call_sub_agent block.
 */
function ReuseSessionChip({ tool }: { tool: ToolActivity }) {
  const { data, error, args, hasResult } = parts(tool);
  const run = tool.subAgent;
  const sessionId: string = (data?.session_id as string) ?? (args.session_id as string) ?? "";
  const status = run ? run.status : tool.status;
  return (
    <Shell
      icon={<Repeat2 className="h-3.5 w-3.5" />}
      label={tool.label || `Reuse Sub-Agent Session: ${sessionId}`}
      status={status}
      expandable={Boolean(run) || hasResult}
      pills={
        sessionId ? (
          <Pill>
            <Hash className="h-2.5 w-2.5" />
            <span className="font-mono">{sessionId}</span>
          </Pill>
        ) : undefined
      }
      panel={() => (
        <>
          {error?.message && <div className="text-[var(--danger)]">{error.message}</div>}
          {run ? (
            <SubAgentRunView run={run} />
          ) : data ? (
            <div className="text-[var(--muted)]">{String(data.message ?? "Session reused.")}</div>
          ) : (
            !error && <div className="text-[var(--muted)]">Continuing the sub-agent session…</div>
          )}
        </>
      )}
    />
  );
}

/* ------------------------------------------------------------------ fallback */

function GenericChip({ tool }: { tool: ToolActivity }) {
  const { hasResult, icon: Icon } = parts(tool);
  const expandable = hasResult && Boolean(tool.result);
  return (
    <Shell
      icon={<Icon className="h-3.5 w-3.5" />}
      label={tool.label}
      status={tool.status}
      expandable={expandable}
      panel={() => (
        <div className="flex items-start gap-1.5">
          <Braces className="mt-0.5 h-3 w-3 shrink-0 text-[var(--muted)]" />
          <Pre>{JSON.stringify(tool.result, null, 2)}</Pre>
        </div>
      )}
    />
  );
}
