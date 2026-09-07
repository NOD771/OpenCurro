import express from "express";
import cors from "cors";
import { config, ensureWorkspace } from "./config.js";
import { createProviderRegistry } from "./agents/providers/registry.js";
import { createToolRegistry } from "./agents/tools/index.js";
import { AgentRunner } from "./agents/agent.js";
import { SessionStore } from "./services/sessionStore.js";
import { PlanApprovalStore } from "./services/planApprovalStore.js";
import { QuestionStore } from "./services/questionStore.js";
import { buildChatRouter } from "./api/chat.js";
import { buildProviderRouter } from "./api/providers.js";
import { buildFilesRouter } from "./api/files.js";
import { buildScrapeRouter } from "./api/scrape.js";
import { buildStateRouter, buildSessionsRouter } from "./api/state.js";
import { buildToolsRouter } from "./api/tools.js";
import { buildMemoryAgentRouter } from "./api/memoryagent.js";
import { MemoryAgentService } from "./agents/memoryagent/index.js";
import { MultiAgentRunner } from "./agents/multiagent/index.js";
import { GptLoopDatabase } from "./database/index.js";

function main(): void {
  ensureWorkspace();

  // The SQLite database (workspace/.gptloop/gptloop.db) is created automatically on boot.
  const db = GptLoopDatabase.open(config.workspaceRoot);

  const providers = createProviderRegistry();
  const tools = createToolRegistry();
  const store = new SessionStore();
  const planApprovals = new PlanApprovalStore();
  const askQuestions = new QuestionStore();
  // The background memory agent: runs entirely in the backend, triggered after every
  // completed main-agent turn, persisting everything into the local SQLite database.
  const memoryAgent = new MemoryAgentService(providers, tools, config, db);
  const agent = new AgentRunner(providers, tools, config, planApprovals, askQuestions, memoryAgent);
  // The multi-agent team runner: drives a whole agent team (head + members) for one chat turn,
  // streaming onto the same event buffer the single agent uses.
  const multiAgent = new MultiAgentRunner(providers, tools, config);

  const app = express();
  app.use(
    cors({
      origin: config.corsOrigins === "*" ? true : config.corsOrigins,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "25mb" }));

  app.get("/health", (_req, res) => {
    res.json({
      status: "healthy",
      service: "gptloop",
      workspace: config.workspaceRoot,
      providers: providers.list().map((p) => p.id),
      tools: tools.schemas.map((s) => s.function.name),
      max_iterations: config.maxIterations,
      database: db.path,
      sqlite_version: db.version,
    });
  });

  app.use("/api/providers", buildProviderRouter(providers));
  app.use("/api/tools", buildToolsRouter(tools));
  app.use("/api/chat", buildChatRouter(agent, store, config, planApprovals, askQuestions, db, multiAgent));
  app.use("/api/files", buildFilesRouter(config));
  app.use("/api/scrape", buildScrapeRouter(config));
  app.use("/api/state", buildStateRouter(db));
  app.use("/api/sessions", buildSessionsRouter(db));
  app.use("/api/memory-agent", buildMemoryAgentRouter(memoryAgent));

  const server = app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[gptloop] listening on http://localhost:${config.port}`);
    // eslint-disable-next-line no-console
    console.log(`[gptloop] workspace: ${config.workspaceRoot}`);
  });

  const shutdown = () => {
    // Flush the write queue and checkpoint the WAL before exiting.
    db.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
