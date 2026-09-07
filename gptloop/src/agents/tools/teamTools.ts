/**
 * The single canonical list of the multi-agent collaboration tools.
 *
 * These five tools exist ONLY for agents that are part of an active agent team (a head/leader and
 * its members). They are never exposed to the normal single agent or to sub-agents — the normal
 * agent registry filters them out (see agent.ts), and each team agent is shown only the subset
 * appropriate for its role (see the multiagent runtime). Keep this list as the one source of truth.
 *
 *  - delegate_task_or_send_message — LEADER ONLY: assign tasks to / message one or more members.
 *  - get_team_members_status       — LEADER ONLY: inspect member statuses (idle/working/queued/...).
 *  - send_message_to_team          — LEADER + MEMBERS (sensitive; disabled by default): free-form
 *                                    agent-to-agent messaging between any team members.
 *  - list_agent_team_members       — LEADER + MEMBERS: list the team members (name + description).
 *  - message_team_leader           — MEMBERS ONLY: report to / message the head/leader.
 */
export const TEAM_TOOL_NAMES = [
  "delegate_task_or_send_message",
  "get_team_members_status",
  "send_message_to_team",
  "list_agent_team_members",
  "message_team_leader",
] as const;

export type TeamToolName = (typeof TEAM_TOOL_NAMES)[number];

/** Fast membership test for the team tool set. */
const TEAM_TOOL_SET = new Set<string>(TEAM_TOOL_NAMES);

/** True when a tool name is one of the five multi-agent collaboration tools. */
export function isTeamTool(name: string): boolean {
  return TEAM_TOOL_SET.has(name);
}

/** Team tools available to the head/leader (delegation, status, listing). */
export const LEADER_TEAM_TOOLS: readonly string[] = [
  "delegate_task_or_send_message",
  "get_team_members_status",
  "list_agent_team_members",
];

/** Team tools available to a member (reporting to the leader, listing). */
export const MEMBER_TEAM_TOOLS: readonly string[] = ["message_team_leader", "list_agent_team_members"];

/** The sensitive tool that is only added (for BOTH roles) when the user has enabled it in Settings. */
export const OPTIONAL_TEAM_TOOL = "send_message_to_team";

/**
 * The tools a team agent (head or member) may NEVER use, on top of the team tools it is not granted
 * for its role. The human-in-the-loop tools are excluded because several team agents run
 * concurrently and a blocking user prompt from a background agent would be confusing/deadlock-prone;
 * only the head reports to the user in natural language. The sub-agent session-reuse tools are
 * gated exactly like they are for the single agent.
 */
export const TEAM_AGENT_BASE_EXCLUDED_TOOLS: readonly string[] = [
  "submit_plan",
  "ask_question_to_user",
  "list_sub_agent_sessions",
  "reuse_same_sub_agent_session",
];

/**
 * Compute the tool names a team agent is allowed to use, given the full registry names, the agent's
 * role, and whether the sensitive send_message_to_team tool is enabled. All non-team tools stay
 * available (files, shell, web, memory, knowledge, skills, sub-agents, todos, wait, ...) except the
 * base-excluded set; the role's team tools are added on top.
 */
export function allowedTeamAgentTools(
  registryNames: readonly string[],
  role: "leader" | "member",
  sendMessageEnabled: boolean,
): string[] {
  const excluded = new Set<string>(TEAM_AGENT_BASE_EXCLUDED_TOOLS);
  // Strip ALL team tools first; the role-appropriate ones are added back below.
  for (const name of TEAM_TOOL_NAMES) excluded.add(name);

  const allowed = registryNames.filter((name) => !excluded.has(name));

  const roleTools = role === "leader" ? LEADER_TEAM_TOOLS : MEMBER_TEAM_TOOLS;
  for (const name of roleTools) {
    if (registryNames.includes(name)) allowed.push(name);
  }
  if (sendMessageEnabled && registryNames.includes(OPTIONAL_TEAM_TOOL)) {
    allowed.push(OPTIONAL_TEAM_TOOL);
  }
  return allowed;
}
