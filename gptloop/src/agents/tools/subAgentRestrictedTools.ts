/**
 * The single canonical list of tools that are RESTRICTED from the sub-agent system.
 *
 * These tools are never available to a sub-agent — no matter how the sub-agent was created
 * (manually by the user in the UI, automatically by the LLM via create_sub_agent, or shipped as a
 * built-in default) and no matter how it is run. They fall into three groups:
 *
 *  - Sub-agent delegation/meta tools (a sub-agent must never spawn or manage other sub-agents):
 *      call_sub_agent, call_multiple_sub_agents, list_sub_agents, delete_sub_agent,
 *      list_sub_agent_sessions, reuse_same_sub_agent_session, create_sub_agent
 *  - Human-in-the-loop tools (only the main agent talks to the user / plans / presents results):
 *      ask_question_to_user, submit_plan, embed_url, attach_files
 *  - Skill deletion + the shared todo list (main-agent-only responsibilities):
 *      delete_skill, TodoWrite, read_todos
 *  - Multi-agent team collaboration tools (only for team agents — head/members):
 *      delegate_task_or_send_message, get_team_members_status, send_message_to_team,
 *      list_agent_team_members, message_team_leader
 *
 * This list is the ONE source of truth. It is reused by:
 *  - subagents.ts (SUB_AGENT_EXCLUDED_TOOLS)         — runtime enforcement for every sub-agent run
 *  - buildsubagent.ts (SUB_AGENT_CREATE_RESTRICTED_TOOLS) — LLM-created sub-agents
 *  - sub-agents/index.ts (DEFAULT_SUB_AGENT_DISALLOWED_TOOLS) — built-in default sub-agents
 *  - api/tools.ts (the /api/tools endpoint)          — the tools the UI offers on manual creation
 *
 * Keep it in exactly one place; do not fork it.
 */
export const SUB_AGENT_RESTRICTED_TOOLS: readonly string[] = [
  "call_sub_agent",
  "call_multiple_sub_agents",
  "list_sub_agents",
  "delete_sub_agent",
  "list_sub_agent_sessions",
  "reuse_same_sub_agent_session",
  "create_sub_agent",
  "delete_skill",
  "submit_plan",
  "ask_question_to_user",
  "embed_url",
  "attach_files",
  "TodoWrite",
  "read_todos",
  // Multi-agent team collaboration tools — only for team agents (head/members), never sub-agents.
  "delegate_task_or_send_message",
  "get_team_members_status",
  "send_message_to_team",
  "list_agent_team_members",
  "message_team_leader",
];

/** Fast membership test for the restricted set. */
const RESTRICTED = new Set(SUB_AGENT_RESTRICTED_TOOLS);

/** True when a tool name is restricted from the sub-agent system. */
export function isSubAgentRestrictedTool(name: string): boolean {
  return RESTRICTED.has(name);
}
