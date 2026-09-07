import { useState } from "react";
import { Drama, Check, Pencil, Plus, Trash2 } from "lucide-react";
import { useStore } from "@/store/useStore";
import { Modal } from "@/components/ui/Modal";
import { Button, EmptyState, Field, PanelHeader, TextArea, TextInput, Toggle } from "@/components/ui/primitives";
import { isDefaultRole } from "@/lib/defaultRoles";
import { cn } from "@/utils/cn";

const NAME_MAX = 70;
const DESC_MAX = 300;

interface Draft {
  id: string | null;
  name: string;
  description: string;
  systemPrompt: string;
  enabled: boolean;
}

const empty = (): Draft => ({ id: null, name: "", description: "", systemPrompt: "", enabled: false });

/**
 * Custom Roles panel. A Custom Role is a role/expertise/behavior overlay applied to the SAME Main
 * Agent — NOT a new agent, sub-agent, LLM instance, or execution system. Selecting a role integrates
 * its system prompt with the Main Agent's built-in prompt; only one role is active at a time.
 */
export function RolesPanel() {
  const customRoles = useStore((s) => s.customRoles);
  const addCustomRole = useStore((s) => s.addCustomRole);
  const updateCustomRole = useStore((s) => s.updateCustomRole);
  const deleteCustomRole = useStore((s) => s.deleteCustomRole);
  const setActiveRole = useStore((s) => s.setActiveRole);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) return setError("A role name is required.");
    if (name.length > NAME_MAX) return setError(`Name must be ${NAME_MAX} characters or fewer.`);
    if (draft.description.length > DESC_MAX)
      return setError(`Description must be ${DESC_MAX} characters or fewer.`);
    if (!draft.systemPrompt.trim()) return setError("A role system prompt is required.");
    const clash = customRoles.some(
      (r) => r.id !== draft.id && r.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (clash) return setError(`A role named "${name}" already exists.`);

    const payload = {
      name,
      description: draft.description.trim(),
      systemPrompt: draft.systemPrompt,
      enabled: draft.enabled,
    };
    if (draft.id) updateCustomRole(draft.id, payload);
    else addCustomRole(payload);
    setDraft(null);
    setError(null);
  };

  const activeRoleName = customRoles.find((r) => r.enabled)?.name ?? null;

  return (
    <div className="mx-auto w-full max-w-2xl panel-in">
      <PanelHeader kicker="One agent, many personas" title="Custom roles" />
      <p className="mb-4 text-sm leading-relaxed text-[var(--muted)]">
        A Custom Role gives the Main Agent an additional role, expertise, and behavior — think Medical
        Expert, Coding Expert, or Research Assistant. Selecting a role layers its instructions on top
        of the same Main Agent; it does not create a new agent, and the agent keeps all of its tools
        and abilities. Only one role is active at a time.
      </p>

      <div
        className="mb-4 flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--chip)] px-3 py-2 text-xs text-[var(--muted)]"
        aria-live="polite"
      >
        <Drama className="h-3.5 w-3.5 shrink-0 text-[var(--subtle)]" />
        {activeRoleName ? (
          <span>
            Active role: <span className="font-medium text-[var(--fg)]">{activeRoleName}</span> — the
            Main Agent is adopting it.
          </span>
        ) : (
          <span>No role selected — the Main Agent behaves normally.</span>
        )}
      </div>

      {customRoles.length === 0 ? (
        <EmptyState icon={<Drama className="h-8 w-8" />}>No custom roles yet.</EmptyState>
      ) : (
        <ul className="grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
          {customRoles.map((role) => {
            const isDefault = isDefaultRole(role.id);
            return (
              <li key={role.id}>
                <article
                  className={cn(
                    "flex h-full flex-col rounded-[var(--radius-xl)] bg-[var(--bg)] p-5 transition-colors hover:bg-[var(--chip)]",
                    role.enabled && "ring-1 ring-[var(--secondary)]",
                  )}
                  style={{ boxShadow: "var(--shadow-chip)" }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-serif-display m-0 text-2xl text-[var(--fg)]">{role.name}</h3>
                    <div className="flex items-center gap-1.5">
                      {isDefault && (
                        <span className="rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--subtle)]">
                          default
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="line-clamp-2 m-0 mt-2 text-sm leading-relaxed text-[var(--muted)]">
                    {role.description || "No description."}
                  </p>

                  <div className="mt-3 flex items-center gap-2">
                    <Toggle
                      checked={role.enabled}
                      onChange={(v) => setActiveRole(role.id, v)}
                      label={role.enabled ? "Active role" : "Select role"}
                    />
                    <span className="text-xs text-[var(--muted)]">
                      {role.enabled ? "Active" : "Select"}
                    </span>
                  </div>

                  <div className="mt-4 flex items-center gap-1.5 border-t border-[var(--border)] pt-3">
                    <Button
                      variant="ghost"
                      className="px-2"
                      onClick={() => {
                        setError(null);
                        setDraft({
                          id: role.id,
                          name: role.name,
                          description: role.description,
                          systemPrompt: role.systemPrompt,
                          enabled: role.enabled,
                        });
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                    {/* Only user-created roles can be deleted; built-in defaults cannot. */}
                    {!isDefault && (
                      <Button
                        variant="ghost"
                        className="px-2 text-[var(--subtle)] hover:text-[var(--danger)]"
                        onClick={() => deleteCustomRole(role.id)}
                        title="Delete role"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </Button>
                    )}
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4">
        <Button
          onClick={() => {
            setError(null);
            setDraft(empty());
          }}
        >
          <Plus className="h-4 w-4" /> Create custom role
        </Button>
      </div>

      <Modal
        open={Boolean(draft)}
        onClose={() => setDraft(null)}
        icon={<Drama className="h-4 w-4" />}
        title={draft?.id ? "Edit custom role" : "New custom role"}
        size="lg"
        footer={
          <Button onClick={save}>
            <Check className="h-4 w-4" /> Save
          </Button>
        }
      >
        {draft && (
          <div className="space-y-4 p-5">
            <Field
              label="Role name"
              hint={`${draft.name.length}/${NAME_MAX}`}
              hintError={draft.name.length > NAME_MAX}
            >
              <TextInput
                value={draft.name}
                maxLength={NAME_MAX}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Medical Expert"
              />
            </Field>
            <Field
              label="Short role description"
              hint={`${draft.description.length}/${DESC_MAX}`}
              hintError={draft.description.length > DESC_MAX}
            >
              <TextArea
                rows={2}
                maxLength={DESC_MAX}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="A short summary of what this role is for."
              />
            </Field>
            <Field label="Role system prompt" hint="no limit">
              <TextArea
                rows={9}
                value={draft.systemPrompt}
                onChange={(e) => setDraft({ ...draft, systemPrompt: e.target.value })}
                className="text-xs"
                placeholder={
                  "Define ONLY the role, expertise, behavior, rules, communication style, and task-specific instructions.\n\nDo NOT describe tools, tool usage, or execution logic — the Main Agent already has those."
                }
              />
              <p className="mt-1 text-[10px] text-[var(--subtle)]">
                Applied on top of the Main Agent's own system prompt. Describe the role and behavior
                only — the agent keeps its existing tools, reasoning, and execution abilities.
              </p>
            </Field>
            <div className="flex items-center gap-2">
              <Toggle checked={draft.enabled} onChange={(v) => setDraft({ ...draft, enabled: v })} />
              <span className="text-sm text-[var(--muted)]">Select this role (apply to the Main Agent)</span>
            </div>
            {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
