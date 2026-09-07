import { Router, type Request, type Response } from "express";
import type { ToolRegistry } from "../agents/tools/registry.js";
import { isSubAgentRestrictedTool } from "../agents/tools/subAgentRestrictedTools.js";

/** One tool entry advertised to the frontend for sub-agent creation. */
export interface SubAgentToolInfo {
  name: string;
  description: string;
}

/**
 * Tools API — exposes the catalog of tools that can be granted to a sub-agent. The frontend's
 * sub-agent creation popup fetches this list (instead of hardcoding it) so it always mirrors the
 * backend's real tool registry. The restricted sub-agent tools (SUB_AGENT_RESTRICTED_TOOLS) are
 * filtered out here, so the response is exactly the set a sub-agent is allowed to use.
 */
export function buildToolsRouter(tools: ToolRegistry): Router {
  const router = Router();

  router.get("/", (_req: Request, res: Response) => {
    const all: SubAgentToolInfo[] = tools.schemas.map((schema) => ({
      name: schema.function.name,
      description: schema.function.description,
    }));

    // Only the tools a sub-agent is actually allowed to use — the restricted set is removed.
    const subAgentTools = all.filter((tool) => !isSubAgentRestrictedTool(tool.name));

    res.json({
      total: all.length,
      restricted: all.length - subAgentTools.length,
      count: subAgentTools.length,
      tools: subAgentTools,
    });
  });

  return router;
}
