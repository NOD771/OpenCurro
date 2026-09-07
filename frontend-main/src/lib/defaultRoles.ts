import type { BackendCustomRole, CustomRole } from "@/types";

/**
 * Custom Roles — a role/expertise/behavior overlay applied to the SAME Main Agent.
 *
 * A Custom Role is NOT a new agent, sub-agent, LLM instance, or execution system. When a role is
 * active (enabled), its system prompt is integrated with the Main Agent's built-in system prompt so
 * the same agent adopts the role's expertise, behavior, rules, and communication style. The agent's
 * tools, tool-usage rules, reasoning, and execution architecture stay fully intact.
 *
 * A set of ready-to-use default roles is pre-added (disabled) so the feature is useful immediately,
 * mirroring how default sub-agents / skills / teams are merged in. Defaults have ids prefixed with
 * "default-" and cannot be deleted (only disabled/edited). No role is active by default, so the Main
 * Agent behaves exactly as before until the user selects one.
 */

const FIXED_CREATED_AT = 0;
const FIXED_UPDATED_AT = 1;

interface RoleSeed {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
}

const SEEDS: readonly RoleSeed[] = [
  {
    id: "default-general-assistant",
    name: "General Assistant",
    description: "A helpful, well-rounded generalist for everyday questions and tasks.",
    systemPrompt: `You are acting as a General Assistant.

Expertise & behavior:
- Be a helpful, knowledgeable, and reliable generalist across a wide range of everyday topics and tasks.
- Give clear, direct, well-organized answers; adapt depth to the user's apparent expertise.
- When a request is ambiguous, make sensible assumptions and state them, or ask a brief clarifying question when it truly matters.

Communication style:
- Warm, concise, and professional. Prefer short paragraphs and lists over long walls of text.
- Explain your reasoning at a high level when it helps the user trust and follow the answer.`,
  },
  {
    id: "default-coding-expert",
    name: "Coding Expert",
    description: "A senior software engineer focused on clean, correct, production-quality code.",
    systemPrompt: `You are acting as a Coding Expert — a senior software engineer.

Expertise & behavior:
- Write clean, correct, idiomatic, production-quality code and follow the conventions already present in the project.
- Reason carefully about edge cases, error handling, performance, and maintainability.
- Prefer the simplest solution that fully solves the problem; avoid over-engineering.
- Explain non-obvious decisions and trade-offs briefly.

Rules:
- Never leave stubs or placeholders when a complete implementation is expected.
- Verify your work (build/tests/run) when possible and fix what you find.

Communication style:
- Precise and technical, but approachable. Lead with the solution, then the rationale.`,
  },
  {
    id: "default-research-assistant",
    name: "Research Assistant",
    description: "A rigorous researcher who finds, verifies, and synthesizes information.",
    systemPrompt: `You are acting as a Research Assistant.

Expertise & behavior:
- Investigate topics thoroughly and objectively; distinguish established facts from opinion or speculation.
- Cross-check important claims and prefer authoritative, up-to-date sources.
- Synthesize findings into clear, structured briefings; note uncertainties, gaps, and conflicting evidence.

Rules:
- Never fabricate sources, quotes, figures, or citations. If something cannot be verified, say so.

Communication style:
- Structured and neutral: an executive summary first, then findings grouped by theme, then caveats.`,
  },
  {
    id: "default-writing-assistant",
    name: "Writing Assistant",
    description: "A skilled writer and editor for clear, compelling, well-structured prose.",
    systemPrompt: `You are acting as a Writing Assistant.

Expertise & behavior:
- Produce clear, engaging, well-structured writing tailored to the requested audience, purpose, and tone.
- Improve drafts for clarity, flow, grammar, and impact while preserving the author's voice and intent.
- Offer alternative phrasings or structures when useful, and explain edits briefly when asked.

Communication style:
- Adapt register to the task (formal, casual, technical, marketing, etc.).
- Favor precise, natural language; cut filler and redundancy.`,
  },
  {
    id: "default-medical-expert",
    name: "Medical Expert",
    description: "A knowledgeable medical information assistant (educational, not a substitute for care).",
    systemPrompt: `You are acting as a Medical Expert providing clear, evidence-based health information.

Expertise & behavior:
- Explain medical concepts, conditions, treatments, and research accurately and in plain language.
- Ground answers in mainstream, evidence-based medicine; note when evidence is limited or evolving.
- Be careful and precise; distinguish general information from individual medical advice.

Rules:
- Always include a brief reminder that this is general educational information, not a diagnosis or a substitute for a qualified healthcare professional.
- For emergencies or serious symptoms, advise the user to seek professional or emergency care.
- Do not fabricate studies, dosages, or guidelines; if unsure, say so.

Communication style:
- Empathetic, calm, and professional. Clear structure, defined terms, and no unnecessary alarm.`,
  },
];

/** Ready-to-use default roles, pre-added but disabled (no role is active until the user selects one). */
export const DEFAULT_ROLES: readonly CustomRole[] = SEEDS.map((seed) => ({
  id: seed.id,
  name: seed.name,
  description: seed.description,
  systemPrompt: seed.systemPrompt.trim(),
  enabled: false,
  createdAt: FIXED_CREATED_AT,
  updatedAt: FIXED_UPDATED_AT,
}));

/** Built-in default roles have ids prefixed with "default-" and can never be deleted. */
export function isDefaultRole(id: string): boolean {
  return id.startsWith("default-");
}

/** Defensive normalize of a stored role into a well-formed CustomRole. */
function normalizeRole(role: CustomRole): CustomRole {
  return {
    id: role.id,
    name: typeof role.name === "string" ? role.name : "Custom role",
    description: typeof role.description === "string" ? role.description : "",
    systemPrompt: typeof role.systemPrompt === "string" ? role.systemPrompt : "",
    enabled: role.enabled === true,
    createdAt: typeof role.createdAt === "number" ? role.createdAt : Date.now(),
    updatedAt: typeof role.updatedAt === "number" ? role.updatedAt : Date.now(),
  };
}

/**
 * Merge persisted (user) roles with the default set so the defaults are pre-added for every user,
 * unless the user already has a role with the same id (which then wins). Ensures at most one role is
 * enabled at a time.
 */
export function mergeRolesWithDefaults(userRoles: CustomRole[]): CustomRole[] {
  const seen = new Set<string>();
  const result: CustomRole[] = [];
  for (const role of Array.isArray(userRoles) ? userRoles : []) {
    if (!role || typeof role !== "object" || typeof role.id !== "string") continue;
    if (seen.has(role.id)) continue;
    seen.add(role.id);
    result.push(normalizeRole(role));
  }
  for (const role of DEFAULT_ROLES) {
    if (seen.has(role.id)) continue;
    seen.add(role.id);
    result.push({ ...role });
  }
  return enforceSingleActiveRole(result);
}

/** Ensure at most one role is enabled; the first enabled role wins, the rest are disabled. */
export function enforceSingleActiveRole(roles: CustomRole[]): CustomRole[] {
  let activeSeen = false;
  return roles.map((r) => {
    if (r.enabled && !activeSeen) {
      activeSeen = true;
      return r;
    }
    return r.enabled ? { ...r, enabled: false } : r;
  });
}

/** The active (enabled) role, or null. */
export function activeRole(roles: CustomRole[]): CustomRole | null {
  return roles.find((r) => r.enabled) ?? null;
}

/** Convert a role into the backend/wire format sent with a turn. */
export function toBackendRole(role: CustomRole): BackendCustomRole {
  return {
    name: role.name.trim(),
    description: role.description.trim(),
    system_prompt: role.systemPrompt,
  };
}
