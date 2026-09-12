import { SYSTEM_SENDER_ID, USER_SENDER_ID } from "../types.js";
import type { AgentTeamDefinition, MailboxMessage } from "../types.js";
import type { CeoAgentDefinition } from "./types.js";

/** A readable roster of every team the CEO controls (each team's leader + members with descriptions). */
function teamsBlock(teams: AgentTeamDefinition[]): string {
  if (teams.length === 0) return "You currently control no teams.";
  const lines: string[] = [];
  for (const team of teams) {
    lines.push(`- Team "${team.name}" — head/leader: "${team.leader_name}"`);
    if (team.members.length === 0) {
      lines.push("    (no specialist members)");
    } else {
      for (const m of team.members) {
        lines.push(`    • member "${m.name}" — ${m.description || "(no description)"}`);
      }
    }
  }
  return lines.join("\n");
}

/** The environment block shared by the CEO (same shared workspace as the teams). */
function environmentBlock(workspaceRoot: string): string {
  return `# Environment
- You run on the user's machine and share ONE workspace with every team you control: ${workspaceRoot}
- The teams' agents work with real files here; files they create persist on disk and are visible to you and to every teammate.
- Use real native tool calls only. Never describe a tool call in prose or invent tools you were not given.`;
}

/**
 * Build the CEO agent's system prompt. The CEO is the top-level coordinator: it receives the user's
 * request, decides which team(s) should handle which parts, assigns tasks to the teams' head/leaders
 * with assign_tasks_to_teams, reviews the leaders' completion reports, and gives the user a clear
 * final answer when the whole goal is achieved.
 */
export function buildCeoSystemPrompt(
  ceo: CeoAgentDefinition,
  teams: AgentTeamDefinition[],
  workspaceRoot: string,
): string {
  const base = (ceo.system_prompt ?? "").trim();
  return `${base}

# Your role
- You are "${ceo.name}", the CEO of a multi-team organization. You control the HEAD/LEADERS of several agent teams. You do NOT talk to individual team members — you direct the team leaders, and each leader breaks your task down for their own members and reports back to you.
- The user talks ONLY to you. Your job: understand the user's goal, decide which team(s) are needed, assign a clear task to each relevant team's leader, review their completion reports, iterate if something is wrong or incomplete, and give the user a clear, complete final answer when the whole goal is done.
- Think at the organizational level: pick the right team(s) for each part of the work, run independent work across teams in parallel, and sequence dependent work.

# The teams you control
${teamsBlock(teams)}

${environmentBlock(workspaceRoot)}

# CEO tools (native function calls)
- list_teams(): List every team you control with its name, its head/leader id, and its members (name + description). Use it to pick the right team(s) and to know the exact team_leader id to assign work to.
- assign_tasks_to_teams(tasks[]): Assign a self-contained task prompt to one or more team leaders in a single call. Each task = { team_leader, prompt }. Include the objective, context, requirements, constraints, and the expected result in each prompt. Independent tasks can be assigned to multiple teams at once for parallel work; do NOT assign dependent tasks together unless the prerequisite results are already available. After you assign, this tool returns immediately and the teams work on their own — you do not block on them.

# How to lead the organization
- When the user asks for something, decide which team(s) should handle it and assign each a clear task with assign_tasks_to_teams. If unsure which teams exist, call list_teams first.
- Assigning does NOT block you: the teams run on their own and their leaders report back with report_task_completion_to_ceo. It is perfectly fine to finish your turn after assigning — the teams keep working and you will be re-activated automatically when a leader reports back, so you can review their work.
- When a team leader reports completion, review it. If it is wrong or incomplete, assign focused follow-up work to that team. If everything the user asked for is done, respond to the user with a clear, complete final summary of what the organization produced (which teams did what, files, outcomes, where to find things).
- Keep your natural-language messages concise; let the teams and the tools do the work.`.trim();
}

/**
 * Frame the CEO's assignment prompt for a team leader. The requirement is that each task the CEO
 * assigns carries an explicit note that it comes from the CEO and that the leader must report
 * completion back to the CEO once its members are done. The user-authored prompt is preserved
 * verbatim and wrapped with that framing.
 */
export function frameCeoTaskPrompt(prompt: string, ceoName: string): string {
  return [
    `This task is assigned to you by the CEO ("${ceoName}").`,
    "",
    prompt.trim(),
    "",
    `When your team members have completed this task and you have reviewed their work, report completion back to the CEO using report_task_completion_to_ceo with a concise summary of the result (what was done, file paths, key outcomes). Do not address the user directly — the CEO owns the conversation with the user.`,
  ].join("\n");
}

/**
 * Combine everything waiting in the CEO's mailbox into a single user message. The turn-starting user
 * message is delivered verbatim; otherwise the batch (completion reports from team leaders, and any
 * automatic system notices) is framed so the CEO can address each one. Mirrors the team's frameMailbox
 * but with CEO-appropriate labels/footer.
 */
export function frameCeoMailbox(batch: MailboxMessage[]): string {
  if (batch.length === 1 && batch[0]!.kind === "user") {
    return batch[0]!.message;
  }
  if (batch.length === 1 && batch[0]!.kind === "system") {
    return batch[0]!.message;
  }

  const parts: string[] = [];
  const header =
    batch.length === 1
      ? "You have a new message from one of your team leaders:"
      : `You have ${batch.length} new messages from your teams (delivered together while you were busy — handle each one):`;
  parts.push(header, "");

  batch.forEach((m, i) => {
    const senderLabel =
      m.from === USER_SENDER_ID
        ? "the user"
        : m.from === SYSTEM_SENDER_ID
          ? "the system"
          : `team leader "${m.from}"`;
    const kindLabel =
      m.kind === "to_leader"
        ? "task completion report / message from a team leader"
        : m.kind === "user"
          ? "message from the user"
          : m.kind === "system"
            ? "automatic coordination notice"
            : "message";
    parts.push(`--- Message ${i + 1} — from ${senderLabel} (${kindLabel}) ---`, m.message, "");
  });

  parts.push(
    "Review these reports/messages. If a team's work is wrong or incomplete, assign focused follow-up work with assign_tasks_to_teams. If everything the user asked for is now done, give the user a clear, complete final answer.",
  );
  return parts.join("\n");
}

/**
 * Build the automatic "you didn't report back to the CEO" nudge. The CEO orchestrator injects this
 * into a team leader's mailbox when the leader finished a run but a task the CEO assigned is still
 * outstanding and the leader never reported to the CEO — the CEO would otherwise wait forever,
 * because a CEO-assigned task is only ever considered done once the leader explicitly reports it. The
 * text is fully self-contained so it can be delivered verbatim.
 */
export function buildCeoReportReminder(leaderName: string, ceoName: string): string {
  return [
    "SYSTEM NOTICE — automatic coordination check (not from a teammate).",
    "",
    `Your last run ended without you reporting back to the CEO ("${ceoName}"), but a task the CEO assigned to your team is still open. The CEO is NOT notified automatically — a CEO-assigned task is only considered complete once you explicitly report it, so the organization is now waiting on you.`,
    "",
    "Take exactly one of these actions now:",
    `1. If your team's task is DONE (members finished and you reviewed their work): call report_task_completion_to_ceo with a concise summary — what your team accomplished, the exact file paths, the key results, and anything the CEO needs to review or hand to the user.`,
    "2. If the task is NOT finished yet: keep coordinating your members (delegate_task_or_send_message / get_team_members_status) until it is genuinely complete, then report to the CEO.",
    "",
    "Do not stay silent and do not end your turn without contacting the CEO — the organization cannot move forward until the CEO hears from you.",
  ].join("\n");
}
