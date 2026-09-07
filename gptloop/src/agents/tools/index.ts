import { ToolRegistry } from "./registry.js";
import { fileReadTool } from "./fileRead.js";
import { fileWriteTool } from "./fileWrite.js";
import { fileListTool } from "./fileList.js";
import { strReplaceTool } from "./strReplace.js";
import { applyMultipleEditsTool } from "./applyMultipleEdits.js";
import { shellTool } from "./shell.js";
import { shellViewTool } from "./shellView.js";
import { bashWriteToProcessTool } from "./bashWriteToProcess.js";
import { webSearchTool } from "./webSearch.js";
import { imageSearchTool } from "./imagesearch.js";
import { fetchWebUrlsTool } from "./fetchWebUrls.js";
import { readImageTool } from "./readImage.js";
import { callSubAgentTool } from "./call_sub_agent.js";
import { callMultipleSubAgentsTool } from "./call_multiple_sub_agents.js";
import { listSubAgentsTool } from "./list_sub_agents.js";
import { listSkillsTool } from "./list_skills.js";
import { skillInitializeTool } from "./skill_initialize.js";
import { submitPlanTool } from "./submit_plan.js";
import { askUserTool } from "./askuser.js";
import { buildSubAgentTool } from "./buildsubagent.js";
import { createSkillTool } from "./createskill.js";
import { todoWriteTool } from "./todowrite.js";
import { readTodosTool } from "./todoread.js";
import { memoryListTool } from "./memory_list.js";
import { memorySearchTool } from "./memory_search.js";
import { memoryReadTool } from "./memory_read.js";
import { memoryWriteTool } from "./memory_write.js";
import { memoryEditTool } from "./memory_edit.js";
import { memoryDeleteTool } from "./memory_delete.js";
import { knowledgeListTool } from "./knowledge_list.js";
import { knowledgeSearchTool } from "./knowledge_search.js";
import { knowledgeReadTool } from "./knowledge_read.js";
import { knowledgeCreateTool } from "./knowledge_create.js";
import { knowledgeEditTool } from "./knowledge_edit.js";
import { knowledgeDeleteTool } from "./knowledge_delete.js";
import { embedUrlTool } from "./embedUrl.js";
import { attachFilesTool } from "./attachFiles.js";
import { waitTool } from "./wait.js";
import { deleteSubAgentTool } from "./delete_sub_agent.js";
import { listSubAgentSessionsTool } from "./list_sub_agent_sessions.js";
import { reuseSameSubAgentSessionTool } from "./reuse_same_sub_agent_session.js";
import { deleteSkillTool } from "./delete_skill.js";
import { delegateTaskOrSendMessageTool } from "./delegate_task_or_send_message.js";
import { getTeamMembersStatusTool } from "./get_team_members_status.js";
import { sendMessageToTeamTool } from "./send_message_to_team.js";
import { listAgentTeamMembersTool } from "./list_agent_team_members.js";
import { messageTeamLeaderTool } from "./message_team_leader.js";

export { ToolRegistry } from "./registry.js";
export type {
  Tool,
  ToolContext,
  ToolResult,
  WebToolsConfig,
  SearchProvider,
  SubAgentDefinition,
  SubAgentRuntime,
  SkillDefinition,
  SkillFileDefinition,
  SkillRuntime,
  TodoItem,
  TodoRuntime,
  MemoryFile,
  MemoryRuntime,
  KnowledgeFile,
  KnowledgeRuntime,
  KnowledgeReadOptions,
} from "./types.js";
export { defineTool } from "./types.js";
export { webSearchTool, SEARCH_PROVIDERS } from "./webSearch.js";
export {
  imageSearchTool,
  IMAGE_SEARCH_PROVIDERS,
  IMAGE_SEARCH_PROVIDER_DUCKDUCKGO,
  IMAGE_SEARCH_PROVIDER_TAVILY,
  IMAGE_SEARCH_PROVIDER_EXA,
  IMAGE_SEARCH_PROVIDER_SERPAPI,
} from "./imagesearch.js";
export { fetchWebUrlsTool } from "./fetchWebUrls.js";
export { applyMultipleEditsTool } from "./applyMultipleEdits.js";
export { readImageTool, SUPPORTED_IMAGE_EXTENSIONS } from "./readImage.js";
export { callSubAgentTool } from "./call_sub_agent.js";
export { callMultipleSubAgentsTool } from "./call_multiple_sub_agents.js";
export { listSubAgentsTool } from "./list_sub_agents.js";
export { listSkillsTool } from "./list_skills.js";
export { skillInitializeTool } from "./skill_initialize.js";
export { buildSubAgentTool } from "./buildsubagent.js";
export { createSkillTool } from "./createskill.js";
export { todoWriteTool } from "./todowrite.js";
export { readTodosTool } from "./todoread.js";
export { memoryListTool, requireMemory, memoryFailure } from "./memory_list.js";
export { memorySearchTool } from "./memory_search.js";
export { memoryReadTool } from "./memory_read.js";
export { memoryWriteTool } from "./memory_write.js";
export { memoryEditTool } from "./memory_edit.js";
export { memoryDeleteTool } from "./memory_delete.js";
export { knowledgeListTool } from "./knowledge_list.js";
export { knowledgeSearchTool } from "./knowledge_search.js";
export { knowledgeReadTool } from "./knowledge_read.js";
export { knowledgeCreateTool } from "./knowledge_create.js";
export { knowledgeEditTool } from "./knowledge_edit.js";
export { knowledgeDeleteTool } from "./knowledge_delete.js";
export { submitPlanTool } from "./submit_plan.js";
export { askUserTool, ASK_ANSWERED, ASK_TIMEOUT } from "./askuser.js";
export { embedUrlTool } from "./embedUrl.js";
export { attachFilesTool, formatFileSizeLabel } from "./attachFiles.js";
export { waitTool, WAIT_MIN_SECONDS, WAIT_MAX_SECONDS } from "./wait.js";
export { deleteSubAgentTool, DELETE_DEFAULT_SUB_AGENT_ERROR } from "./delete_sub_agent.js";
export { listSubAgentSessionsTool } from "./list_sub_agent_sessions.js";
export { reuseSameSubAgentSessionTool } from "./reuse_same_sub_agent_session.js";
export { deleteSkillTool, DELETE_DEFAULT_SKILL_ERROR } from "./delete_skill.js";
export { delegateTaskOrSendMessageTool } from "./delegate_task_or_send_message.js";
export { getTeamMembersStatusTool } from "./get_team_members_status.js";
export { sendMessageToTeamTool } from "./send_message_to_team.js";
export { listAgentTeamMembersTool } from "./list_agent_team_members.js";
export { messageTeamLeaderTool } from "./message_team_leader.js";
export {
  TEAM_TOOL_NAMES,
  isTeamTool,
  allowedTeamAgentTools,
  LEADER_TEAM_TOOLS,
  MEMBER_TEAM_TOOLS,
  OPTIONAL_TEAM_TOOL,
} from "./teamTools.js";
export type { AttachedFileInfo, AttachFileFailure } from "./attachFiles.js";
export { shellViewTool } from "./shellView.js";
export { bashWriteToProcessTool } from "./bashWriteToProcess.js";
export {
  shellSessionStore,
  ShellSessionStore,
  MAX_SESSION_BUFFER_CHARS,
} from "./shellSessions.js";
export type { ShellSessionSnapshot, ShellSessionStatus } from "./shellSessions.js";
export type { ProcessWriteResult } from "./shellSessions.js";

/** Build the default registry with the agent's file/web/shell tools plus the sub-agent tools. */
export function createToolRegistry(): ToolRegistry {
  return new ToolRegistry().registerAll([
    fileReadTool,
    fileWriteTool,
    fileListTool,
    strReplaceTool,
    applyMultipleEditsTool,
    shellTool,
    shellViewTool,
    bashWriteToProcessTool,
    webSearchTool,
    imageSearchTool,
    fetchWebUrlsTool,
    readImageTool,
    callSubAgentTool,
    callMultipleSubAgentsTool,
    listSubAgentsTool,
    listSkillsTool,
    skillInitializeTool,
    submitPlanTool,
    askUserTool,
    buildSubAgentTool,
    createSkillTool,
    todoWriteTool,
    readTodosTool,
    memoryListTool,
    memorySearchTool,
    memoryReadTool,
    memoryWriteTool,
    memoryEditTool,
    memoryDeleteTool,
    knowledgeListTool,
    knowledgeSearchTool,
    knowledgeReadTool,
    knowledgeCreateTool,
    knowledgeEditTool,
    knowledgeDeleteTool,
    embedUrlTool,
    attachFilesTool,
    waitTool,
    deleteSubAgentTool,
    listSubAgentSessionsTool,
    reuseSameSubAgentSessionTool,
    deleteSkillTool,
    delegateTaskOrSendMessageTool,
    getTeamMembersStatusTool,
    sendMessageToTeamTool,
    listAgentTeamMembersTool,
    messageTeamLeaderTool,
  ]);
}

export const tools = {
  fileReadTool,
  fileWriteTool,
  fileListTool,
  strReplaceTool,
  applyMultipleEditsTool,
  shellTool,
  shellViewTool,
  bashWriteToProcessTool,
  webSearchTool,
  imageSearchTool,
  fetchWebUrlsTool,
  readImageTool,
  callSubAgentTool,
  callMultipleSubAgentsTool,
  listSubAgentsTool,
  listSkillsTool,
  skillInitializeTool,
  submitPlanTool,
  askUserTool,
  buildSubAgentTool,
  createSkillTool,
  todoWriteTool,
  readTodosTool,
  memoryListTool,
  memorySearchTool,
  memoryReadTool,
  memoryWriteTool,
  memoryEditTool,
  memoryDeleteTool,
  knowledgeListTool,
  knowledgeSearchTool,
  knowledgeReadTool,
  knowledgeCreateTool,
  knowledgeEditTool,
  knowledgeDeleteTool,
  embedUrlTool,
  attachFilesTool,
  waitTool,
  deleteSubAgentTool,
  listSubAgentSessionsTool,
  reuseSameSubAgentSessionTool,
  deleteSkillTool,
  delegateTaskOrSendMessageTool,
  getTeamMembersStatusTool,
  sendMessageToTeamTool,
  listAgentTeamMembersTool,
  messageTeamLeaderTool,
};
