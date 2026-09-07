import { Router, type Request, type Response } from "express";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "../config.js";
import { safeResolve, toWorkspaceRelative } from "../utils/paths.js";
import { mimeTypeFromPath } from "../utils/mime.js";

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "dir";
  size?: number | null;
  children?: FileNode[];
}

const IGNORED = new Set([".git", "node_modules", ".next", "dist", ".cache"]);
const MAX_DEPTH = 6;
const MAX_ENTRIES = 2000;

export function buildFilesRouter(config: AppConfig): Router {
  const router = Router();

  // Full (bounded) tree of the workspace for the explorer.
  router.get("/tree", async (req: Request, res: Response) => {
    const requested = typeof req.query.path === "string" && req.query.path.trim() ? req.query.path : ".";
    try {
      const absolute = safeResolve(config.workspaceRoot, requested);
      const counter = { count: 0 };
      const tree = await buildNode(config.workspaceRoot, absolute, 0, counter);
      res.json({ root: toWorkspaceRelative(config.workspaceRoot, absolute), tree });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Read a single file's contents.
  router.get("/read", async (req: Request, res: Response) => {
    const requested = typeof req.query.path === "string" ? req.query.path : "";
    if (!requested) {
      res.status(400).json({ error: "path query parameter is required." });
      return;
    }
    try {
      const absolute = safeResolve(config.workspaceRoot, requested);
      const content = await fsp.readFile(absolute, "utf8");
      res.json({ path: toWorkspaceRelative(config.workspaceRoot, absolute), content });
    } catch (error) {
      res.status(404).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Stream a workspace file's raw bytes for inline preview (images, PDFs, HTML, etc.). The
  // browser renders it in place; the `name` query param only customizes the Content-Disposition.
  router.get("/preview", (req: Request, res: Response) => {
    const requested = typeof req.query.path === "string" ? req.query.path : "";
    if (!requested) {
      res.status(400).json({ error: "path query parameter is required." });
      return;
    }
    try {
      const absolute = safeResolve(config.workspaceRoot, requested);
      sendWorkspaceFile(res, absolute, {
        disposition: "inline",
        contentType: mimeTypeFromPath(absolute),
        fallbackName: path.basename(absolute),
      });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Stream a workspace file with a download attachment disposition so the browser saves it.
  router.get("/download", (req: Request, res: Response) => {
    const requested = typeof req.query.path === "string" ? req.query.path : "";
    if (!requested) {
      res.status(400).json({ error: "path query parameter is required." });
      return;
    }
    try {
      const absolute = safeResolve(config.workspaceRoot, requested);
      sendWorkspaceFile(res, absolute, {
        disposition: "attachment",
        contentType: mimeTypeFromPath(absolute),
        fallbackName: path.basename(absolute),
      });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  return router;
}

/** Open a workspace file and stream its bytes to the response with the requested disposition. */
function sendWorkspaceFile(
  res: Response,
  absolute: string,
  options: { disposition: "inline" | "attachment"; contentType: string; fallbackName: string },
): void {
  if (!fs.existsSync(absolute)) {
    res.status(404).json({ error: `File does not exist: ${absolute}` });
    return;
  }
  const stat = fs.statSync(absolute);
  if (!stat.isFile()) {
    res.status(400).json({ error: `Path is not a regular file: ${absolute}` });
    return;
  }

  const filename = path.basename(absolute) || options.fallbackName;
  res.setHeader(
    "Content-Disposition",
    `${options.disposition}; filename="${filename.replace(/"/g, "")}"`,
  );
  res.setHeader("Content-Type", options.contentType);
  res.setHeader("Content-Length", String(stat.size));

  const stream = fs.createReadStream(absolute);
  stream.on("error", (error) => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  });
  stream.pipe(res);
}

async function buildNode(
  root: string,
  absolute: string,
  depth: number,
  counter: { count: number },
): Promise<FileNode[]> {
  if (depth >= MAX_DEPTH || counter.count >= MAX_ENTRIES) return [];

  let dirents;
  try {
    dirents = await fsp.readdir(absolute, { withFileTypes: true });
  } catch {
    return [];
  }

  const nodes: FileNode[] = [];
  for (const dirent of dirents) {
    if (counter.count >= MAX_ENTRIES) break;
    if (IGNORED.has(dirent.name)) continue;
    counter.count += 1;

    const childAbs = `${absolute}/${dirent.name}`;
    const relPath = toWorkspaceRelative(root, childAbs);

    if (dirent.isDirectory()) {
      nodes.push({
        name: dirent.name,
        path: relPath,
        type: "dir",
        children: await buildNode(root, childAbs, depth + 1, counter),
      });
    } else if (dirent.isFile()) {
      let size: number | null = null;
      try {
        size = (await fsp.stat(childAbs)).size;
      } catch {
        size = null;
      }
      nodes.push({ name: dirent.name, path: relPath, type: "file", size });
    }
  }

  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return nodes;
}
