import type { StoredMessage } from "../../../services/sessionStore.js";
import type {
  KnowledgeFile,
  MemoryFile,
  SkillDefinition,
  SubAgentDefinition,
  TodoItem,
} from "../../tools/types.js";
import type { AgentTeamDefinition } from "../types.js";

/**
 * A full CEO-agent definition: a single top-level CEO plus the agent teams it controls. Authored in
 * the frontend, stored in SQLite (app_state `ceoAgents`), and sent with each turn when the CEO is
 * active. The CEO calls the head/leaders of the teams it controls and gives them tasks; the leaders
 * then break the work down for their own members — exactly like the normal multi-agent system, with
 * the CEO layered on top.
 */
export interface CeoAgentDefinition {
  /** Stable CEO id. */
  id: string;
  /** The CEO's agent id / name (e.g. "Vera"). */
  name: string;
  /** Short description of the CEO's role/specialization. */
  description: string;
  /** The CEO's system prompt. */
  system_prompt: string;
  /** The agent teams this CEO controls (full team definitions — head + members). */
  teams: AgentTeamDefinition[];
}

/**
 * A turn request for a CEO multi-agent system. Mirrors RunTeamRequest's provider + tooling fields,
 * plus the resolved CEO (with its controlled teams) and the send_message_to_team gate.
 */
export interface RunCeoRequest {
  chatId: string;
  userMessage: string;
  /** The active CEO definition (with its controlled teams) for this turn. */
  ceo: CeoAgentDefinition;
  /** Whether the sensitive send_message_to_team tool is enabled (user Settings). */
  sendMessageToTeamEnabled: boolean;

  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  customProvider?: unknown;
  temperature?: number;
  effort?: string;

  // Web tool keys/provider (forwarded to every agent's web tools).
  tavilyApiKey?: string;
  exaApiKey?: string;
  serpapiApiKey?: string;
  searchProvider?: "duckduckgo" | "tavily" | "exa" | "serpapi";
  fetchProvider?: "builtin" | "firecrawl";
  firecrawlApiKey?: string;

  // Shared tooling — every agent (CEO + leaders + members) shares one memory/knowledge/skill/sub-agent surface.
  subAgents?: SubAgentDefinition[];
  skills?: SkillDefinition[];
  todos?: TodoItem[];
  memory?: MemoryFile[];
  knowledge?: KnowledgeFile[];
}

/** Role of an agent inside a CEO multi-agent system. */
export type CeoActorRole = "ceo" | "leader" | "member";

/**
 * The persistent per-agent context inside a CEO session (survives across turns of one chat). Mirrors
 * the team's TeamAgentContext but carries the CEO-aware role and the owning team id (for leaders and
 * members) so message routing stays scoped to the right team.
 */
export interface CeoAgentContext {
  id: string;
  role: CeoActorRole;
  /** Id of the team this agent belongs to (undefined for the CEO). */
  teamId?: string;
  description: string;
  systemPrompt: string;
  /** The agent's full conversation, preserved across turns and re-activations. */
  messages: StoredMessage[];
}
