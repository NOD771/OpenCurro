import { useEffect, useState } from "react";
import { Check, Pencil, Plug, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useStore } from "@/store/useStore";
import { fetchModels, fetchProviders } from "@/lib/api";
import { FALLBACK_PROVIDERS, isCustomProviderId } from "@/lib/providers";
import { EFFORT_PRESETS, type CustomHeader, type CustomProvider } from "@/types";
import { Modal } from "@/components/ui/Modal";
import { Button, Field, Select, TextInput } from "@/components/ui/primitives";
import { cn } from "@/utils/cn";

export function SettingsModal() {
  const open = useStore((s) => s.settingsOpen);
  const setOpen = useStore((s) => s.setSettingsOpen);
  const providers = useStore((s) => s.providers);
  const models = useStore((s) => s.models);
  const modelsLoading = useStore((s) => s.modelsLoading);
  const settings = useStore((s) => s.settings);
  const customProviders = useStore((s) => s.customProviders);
  const setProviders = useStore((s) => s.setProviders);
  const setModels = useStore((s) => s.setModels);
  const setModelsLoading = useStore((s) => s.setModelsLoading);
  const setSettings = useStore((s) => s.setSettings);
  const setApiKey = useStore((s) => s.setApiKey);
  const setSearchProvider = useStore((s) => s.setSearchProvider);
  const setFetchProvider = useStore((s) => s.setFetchProvider);
  const setSearchApiKey = useStore((s) => s.setSearchApiKey);
  const updateCustomProvider = useStore((s) => s.updateCustomProvider);
  const deleteCustomProvider = useStore((s) => s.deleteCustomProvider);
  const selectCustomProvider = useStore((s) => s.selectCustomProvider);

  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Whether the effort control is in "custom string" mode vs. preset buttons.
  const [effortCustom, setEffortCustom] = useState(false);

  useEffect(() => {
    if (open && providers.length === 0) fetchProviders().then(setProviders).catch(() => {});
  }, [open, providers.length, setProviders]);

  // Defensive fallbacks for settings hydrated before these fields existed.
  const effort = settings.effort ?? "high";
  const temperature = typeof settings.temperature === "number" ? settings.temperature : 0.6;
  const effortIsPreset = (EFFORT_PRESETS as readonly string[]).includes(effort);
  // When the modal opens, reflect the stored effort: custom mode iff it's not a preset.
  useEffect(() => {
    if (open) setEffortCustom(!effortIsPreset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const builtIns = providers.length > 0 ? providers : FALLBACK_PROVIDERS;
  const isCustom = isCustomProviderId(settings.provider);
  const selectedCustom = customProviders.find((p) => p.id === settings.provider);
  const editingProvider = customProviders.find((p) => p.id === editingId);
  const currentKey = isCustom ? (selectedCustom?.apiKey ?? "") : (settings.apiKeys[settings.provider] ?? "");
  const defaultBaseUrl = isCustom ? selectedCustom?.baseUrl : builtIns.find((p) => p.id === settings.provider)?.defaultBaseUrl;
  const modelOptions = isCustom ? (selectedCustom?.models ?? []).filter((m) => m.trim()) : models.map((m) => m.id);

  const handleProvider = (value: string) => {
    setError(null);
    if (isCustomProviderId(value)) {
      selectCustomProvider(value);
      setModels([]);
    } else {
      setSettings({ provider: value, model: "", baseUrl: "" });
      setModels([]);
    }
  };

  const loadModels = async () => {
    if (!currentKey) {
      setError("Enter an API key first.");
      return;
    }
    setError(null);
    setModelsLoading(true);
    try {
      const list = await fetchModels(settings.provider, currentKey, settings.baseUrl || undefined);
      setModels(list);
      if (list.length > 0 && !list.some((m) => m.id === settings.model)) setSettings({ model: list[0].id });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setModels([]);
    } finally {
      setModelsLoading(false);
    }
  };

  const paidSearch = settings.searchProvider !== "duckduckgo";

  return (
    <>
      <Modal
        open={open}
        onClose={() => { setOpen(false); setEditorOpen(false); }}
        title="Settings"
        size="lg"
        footer={<Button onClick={() => { setOpen(false); setEditorOpen(false); }}>Done</Button>}
      >
        <div className="space-y-6 p-5">
          {/* Provider + model */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--subtle)]">Model provider</h3>
            <Field label="Provider">
              <Select value={settings.provider} onChange={(e) => handleProvider(e.target.value)}>
                <optgroup label="Providers">
                  {builtIns.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </optgroup>
                {customProviders.length > 0 && (
                  <optgroup label="Custom providers">
                    {customProviders.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name || p.id}
                      </option>
                    ))}
                  </optgroup>
                )}
              </Select>
            </Field>

            {isCustom ? (
              <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--chip)] p-3">
                <p className="text-xs text-[var(--muted)]">Connected to {selectedCustom?.baseUrl || "no base URL"}</p>
                {modelOptions.length > 0 ? (
                  <>
                    <Select value={settings.model || modelOptions[0]} onChange={(e) => setSettings({ model: e.target.value })}>
                      <option value="" disabled>
                        Select a model…
                      </option>
                      {modelOptions.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </Select>
                    <div className="flex flex-wrap gap-1.5">
                      {modelOptions.map((m) => (
                        <button key={m} onClick={() => setSettings({ model: m })} className={cn("rounded-full border px-2.5 py-1 text-xs", settings.model === m ? "border-[var(--secondary)] bg-[var(--secondary)] text-[var(--secondary-fg)]" : "border-[var(--border)] text-[var(--fg)] hover:border-[var(--secondary)]")}>
                          {m}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <TextInput value={settings.model} onChange={(e) => setSettings({ model: e.target.value })} placeholder="No models yet — add one below" />
                )}
                {selectedCustom && (
                  <button onClick={() => { setEditingId(selectedCustom.id); setEditorOpen(true); }} className="text-xs font-medium text-[var(--secondary)] hover:underline">
                    Edit or add models
                  </button>
                )}
              </div>
            ) : (
              <>
                <Field label={`API key (${settings.provider})`}>
                  <TextInput type="password" value={currentKey} onChange={(e) => setApiKey(settings.provider, e.target.value)} placeholder="sk-…" />
                </Field>
                <Field label="Base URL (optional override)">
                  <TextInput value={settings.baseUrl} onChange={(e) => setSettings({ baseUrl: e.target.value })} placeholder={defaultBaseUrl ? `Default: ${defaultBaseUrl}` : "https://…/v1"} />
                </Field>
                <Field label="Model">
                  <div className="flex gap-2">
                    <Select value={settings.model} onChange={(e) => setSettings({ model: e.target.value })} className="flex-1">
                      {modelOptions.length === 0 ? (
                        <option value={settings.model}>{settings.model || "Load models →"}</option>
                      ) : (
                        modelOptions.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))
                      )}
                    </Select>
                    <Button variant="outline" onClick={loadModels} disabled={modelsLoading}>
                      <RefreshCw className={cn("h-4 w-4", modelsLoading && "animate-spin")} /> Load
                    </Button>
                  </div>
                </Field>
                {settings.model && (
                  <TextInput value={settings.model} onChange={(e) => setSettings({ model: e.target.value })} placeholder="Or type a model id" className="font-mono text-xs" />
                )}
              </>
            )}
          </section>

          {/* Model behavior: reasoning effort + temperature */}
          <section className="space-y-4 border-t border-[var(--border)] pt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--subtle)]">Model behavior</h3>

            {/* Reasoning effort */}
            <Field label="Reasoning effort">
              <div className="flex flex-wrap items-center gap-1.5">
                {EFFORT_PRESETS.map((level) => {
                  const active = !effortCustom && effort === level;
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => { setEffortCustom(false); setSettings({ effort: level }); }}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors",
                        active
                          ? "border-[var(--secondary)] bg-[var(--secondary)] text-[var(--secondary-fg)]"
                          : "border-[var(--border)] text-[var(--fg)] hover:border-[var(--secondary)]",
                      )}
                    >
                      {level}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setEffortCustom(true)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    effortCustom
                      ? "border-[var(--secondary)] bg-[var(--secondary)] text-[var(--secondary-fg)]"
                      : "border-[var(--border)] text-[var(--fg)] hover:border-[var(--secondary)]",
                  )}
                >
                  Custom
                </button>
              </div>
            </Field>
            {effortCustom && (
              <TextInput
                value={effort}
                onChange={(e) => setSettings({ effort: e.target.value })}
                placeholder="Custom effort (e.g. minimal, xhigh) — passed to the model"
                className="font-mono text-xs"
              />
            )}
            <p className="text-xs text-[var(--muted)]">
              Higher effort lets reasoning models think longer before answering. Models without
              reasoning support ignore this and run normally. Default is <strong>high</strong>.
            </p>

            {/* Temperature */}
            <Field label="Temperature" hint={temperature.toFixed(2)}>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  value={settings.temperature}
                  onChange={(e) => setSettings({ temperature: clampTemp(Number(e.target.value)) })}
                  className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-[var(--border)] accent-[var(--secondary)]"
                />
                <input
                  type="number"
                  min={0}
                  max={2}
                  step={0.05}
                  value={settings.temperature}
                  onChange={(e) => setSettings({ temperature: clampTemp(Number(e.target.value)) })}
                  className="w-20 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm text-[var(--fg)] outline-none focus:border-[var(--secondary)]"
                />
              </div>
            </Field>
            <p className="text-xs text-[var(--muted)]">
              Lower values make responses more focused and deterministic; higher values more creative.
              Range 0–2. Models that don't support custom temperatures ignore this.
            </p>
          </section>

          {/* Web search */}
          <section className="space-y-3 border-t border-[var(--border)] pt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--subtle)]">Web search</h3>
            <Field label="Search provider">
              <Select value={settings.searchProvider} onChange={(e) => setSearchProvider(e.target.value as never)}>
                <option value="duckduckgo">DuckDuckGo (free)</option>
                <option value="tavily">Tavily</option>
                <option value="exa">Exa</option>
                <option value="serpapi">SerpAPI</option>
              </Select>
            </Field>
            {paidSearch && (
              <div className="grid gap-3">
                <Field label="Tavily API key">
                  <TextInput type="password" value={settings.tavilyApiKey} onChange={(e) => setSearchApiKey("tavily", e.target.value)} placeholder="tvly-…" />
                </Field>
                <Field label="Exa API key">
                  <TextInput type="password" value={settings.exaApiKey} onChange={(e) => setSearchApiKey("exa", e.target.value)} placeholder="exa-…" />
                </Field>
                <Field label="SerpAPI key">
                  <TextInput type="password" value={settings.serpapiApiKey} onChange={(e) => setSearchApiKey("serpapi", e.target.value)} placeholder="SerpAPI key" />
                </Field>
              </div>
            )}
          </section>

          {/* Web fetch */}
          <section className="space-y-3 border-t border-[var(--border)] pt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--subtle)]">Web fetch</h3>
            <Field label="Fetch provider">
              <Select value={settings.fetchProvider} onChange={(e) => setFetchProvider(e.target.value as never)}>
                <option value="builtin">Built-in scraper (free)</option>
                <option value="firecrawl">Firecrawl</option>
              </Select>
            </Field>
            {settings.fetchProvider === "firecrawl" && (
              <Field label="Firecrawl API key">
                <TextInput type="password" value={settings.firecrawlApiKey} onChange={(e) => setSearchApiKey("firecrawl", e.target.value)} placeholder="fc-…" />
              </Field>
            )}
          </section>

          {/* Sub-agent sessions */}
          <section className="space-y-3 border-t border-[var(--border)] pt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--subtle)]">Sub-agent sessions</h3>
            <Field label="Reuse sub-agent sessions">
              <Select
                value={settings.enableReuseSubAgentSession ?? "no"}
                onChange={(e) => setSettings({ enableReuseSubAgentSession: e.target.value === "yes" ? "yes" : "no" })}
              >
                <option value="no">No — disabled</option>
                <option value="yes">Yes — enabled</option>
              </Select>
            </Field>
            <p className="text-xs text-[var(--muted)]">
              When enabled, the agent can list previously run sub-agent sessions and continue any of
              them with their preserved conversation context (list_sub_agent_sessions /
              reuse_same_sub_agent_session). When disabled, both tools are hidden from the agent.
            </p>
          </section>

          {/* Multi-agent teams */}
          <section className="space-y-3 border-t border-[var(--border)] pt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--subtle)]">Agent teams (multi-agent)</h3>
            <Field label="Enable agent teams">
              <Select
                value={settings.enableAgentTeams ?? "no"}
                onChange={(e) => setSettings({ enableAgentTeams: e.target.value === "yes" ? "yes" : "no" })}
              >
                <option value="no">No — single agent (default)</option>
                <option value="yes">Yes — use the active agent team</option>
              </Select>
            </Field>
            <p className="text-xs text-[var(--muted)]">
              When enabled, your chat goes to the active team's head/leader, who delegates to the
              members and coordinates them. Create and activate teams from the “Agent teams” page in
              the sidebar. When disabled, chat uses the normal single agent.
            </p>
            <Field label="Agent-to-agent messaging (send_message_to_team)">
              <Select
                value={settings.enableSendMessageToTeam ?? "no"}
                onChange={(e) => setSettings({ enableSendMessageToTeam: e.target.value === "yes" ? "yes" : "no" })}
              >
                <option value="no">No — disabled (default)</option>
                <option value="yes">Yes — members can message each other</option>
              </Select>
            </Field>
            <p className="text-xs text-[var(--muted)]">
              This sensitive tool lets any team member message any other member directly for
              peer-to-peer coordination. When disabled, members only report up to the leader
              (message_team_leader) and the tool is hidden entirely.
            </p>
          </section>

          {/* CEO multi-agent system */}
          <section className="space-y-3 border-t border-[var(--border)] pt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--subtle)]">CEO agent (multi-team)</h3>
            <Field label="Enable CEO agent">
              <Select
                value={settings.enableCeoAgents ?? "no"}
                onChange={(e) => setSettings({ enableCeoAgents: e.target.value === "yes" ? "yes" : "no" })}
              >
                <option value="no">No (default)</option>
                <option value="yes">Yes — use the active CEO agent</option>
              </Select>
            </Field>
            <p className="text-xs text-[var(--muted)]">
              When enabled, your chat goes to the active CEO agent, who controls the head/leaders of
              the teams it manages — assigning them tasks, and the leaders then coordinate their own
              members. Create and activate a CEO from the “CEO agents” page in the sidebar. Takes
              precedence over a single agent team when both are active.
            </p>
          </section>

          {/* Custom providers */}
          <section className="space-y-3 border-t border-[var(--border)] pt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--subtle)]">Custom providers</h3>
            {customProviders.length > 0 && (
              <ul className="space-y-2">
                {customProviders.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--fg)]">
                        {p.name || p.id}
                        {settings.provider === p.id && <span className="ml-2 rounded-full bg-[var(--secondary)] px-1.5 py-0.5 text-[10px] text-[var(--secondary-fg)]">Active</span>}
                      </p>
                      <p className="truncate text-xs text-[var(--subtle)]">
                        {p.baseUrl || "no base URL"} · {p.models.filter((m) => m.trim()).length} model(s)
                      </p>
                    </div>
                    <button onClick={() => selectCustomProvider(p.id)} title="Set active" className="grid h-8 w-8 place-items-center rounded-[var(--radius-md)] text-[var(--subtle)] hover:bg-[var(--chip)] hover:text-[var(--fg)]">
                      <Plug className="h-4 w-4" />
                    </button>
                    <button onClick={() => { setEditingId(p.id); setEditorOpen(true); }} title="Edit" className="grid h-8 w-8 place-items-center rounded-[var(--radius-md)] text-[var(--subtle)] hover:bg-[var(--chip)] hover:text-[var(--fg)]">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => deleteCustomProvider(p.id)} title="Delete" className="grid h-8 w-8 place-items-center rounded-[var(--radius-md)] text-[var(--subtle)] hover:text-[var(--danger)]">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Button variant="outline" className="w-full border-dashed" onClick={() => { setEditingId(null); setEditorOpen(true); }}>
              <Plus className="h-4 w-4" /> Add custom provider
            </Button>
          </section>

          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        </div>
      </Modal>

      {editorOpen && (
        <CustomProviderEditor
          existing={editingProvider}
          onClose={() => setEditorOpen(false)}
          onSaved={(created) => {
            selectCustomProvider(created.id);
            updateCustomProvider(created.id, {});
            setEditorOpen(false);
          }}
        />
      )}
    </>
  );
}

/** Clamp an untrusted temperature to the provider-safe 0–2 range (NaN → 0.6 default). */
function clampTemp(value: number): number {
  if (!Number.isFinite(value)) return 0.6;
  return Math.min(2, Math.max(0, Math.round(value * 100) / 100));
}

function CustomProviderEditor({
  existing,
  onClose,
  onSaved,
}: {
  existing?: CustomProvider;
  onClose: () => void;
  onSaved: (created: CustomProvider) => void;
}) {
  const addCustomProvider = useStore((s) => s.addCustomProvider);
  const updateCustomProvider = useStore((s) => s.updateCustomProvider);
  const [name, setName] = useState(existing?.name ?? "");
  const [baseUrl, setBaseUrl] = useState(existing?.baseUrl ?? "");
  const [apiKey, setApiKey] = useState(existing?.apiKey ?? "");
  const [models, setModels] = useState<string[]>(existing?.models.length ? existing.models : [""]);
  const [headers, setHeaders] = useState<CustomHeader[]>(existing?.headers ?? []);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const cleanModels = models.map((m) => m.trim()).filter(Boolean);
    if (!name.trim()) return setError("A provider name is required.");
    if (!baseUrl.trim()) return setError("A base URL is required.");
    if (cleanModels.length === 0) return setError("Add at least one model.");
    const cleanHeaders = headers.filter((h) => h.key.trim()).map((h) => ({ key: h.key.trim(), value: h.value }));
    const url = baseUrl.trim().replace(/\/+$/, "");
    if (existing) {
      updateCustomProvider(existing.id, { name: name.trim(), baseUrl: url, apiKey, models: cleanModels, headers: cleanHeaders });
      onSaved(existing);
    } else {
      const created = addCustomProvider({ name: name.trim(), baseUrl: url, apiKey, models: cleanModels, headers: cleanHeaders });
      onSaved(created);
    }
  };

  return (
    <Modal open onClose={onClose} title={existing ? "Edit custom provider" : "Add custom provider"} size="md" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save}><Check className="h-4 w-4" /> {existing ? "Save & connect" : "Connect"}</Button></>}>
      <div className="space-y-4 p-5">
        <Field label="Provider name *">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="My Provider" />
        </Field>
        <Field label="Base URL *">
          <TextInput value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com/v1" />
        </Field>
        <Field label="API key (optional)">
          <TextInput type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" />
        </Field>
        <div>
          <div className="mb-1.5 text-xs font-medium text-[var(--muted)]">Models *</div>
          <div className="space-y-2">
            {models.map((m, i) => (
              <div key={i} className="flex gap-2">
                <TextInput value={m} onChange={(e) => setModels((ms) => ms.map((x, xi) => (xi === i ? e.target.value : x)))} placeholder="model-id" className="font-mono" />
                <button onClick={() => setModels((ms) => (ms.length > 1 ? ms.filter((_, xi) => xi !== i) : ms))} disabled={models.length <= 1} className="shrink-0 text-[var(--subtle)] hover:text-[var(--danger)] disabled:opacity-30">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <Button variant="ghost" onClick={() => setModels((ms) => [...ms, ""])}>
              <Plus className="h-3.5 w-3.5" /> Add model
            </Button>
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-xs font-medium text-[var(--muted)]">Custom headers (optional)</div>
          <div className="space-y-2">
            {headers.map((h, i) => (
              <div key={i} className="flex gap-2">
                <TextInput value={h.key} onChange={(e) => setHeaders((hs) => hs.map((x, xi) => (xi === i ? { ...x, key: e.target.value } : x)))} placeholder="Header" />
                <TextInput value={h.value} onChange={(e) => setHeaders((hs) => hs.map((x, xi) => (xi === i ? { ...x, value: e.target.value } : x)))} placeholder="Value" />
                <button onClick={() => setHeaders((hs) => hs.filter((_, xi) => xi !== i))} className="shrink-0 text-[var(--subtle)] hover:text-[var(--danger)]">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <Button variant="ghost" onClick={() => setHeaders((hs) => [...hs, { key: "", value: "" }])}>
              <Plus className="h-3.5 w-3.5" /> Add header
            </Button>
          </div>
        </div>
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      </div>
    </Modal>
  );
}
