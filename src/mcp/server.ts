// MUST be the very first import: redirects console.log/info/warn to stderr
// so stray log messages from other modules don't corrupt the JSON-RPC stdout stream.
import "./stdoutGuard";

import express from "express";
import { randomUUID } from "node:crypto";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import { registerResources } from "./resources/registerResources";
import { registerPrompts } from "./prompts/registerPrompts";
import { registerTools } from "./tools/registerTools";
import {
  ConfigBackedProjectConfigAdapter,
  type ProjectConfigAdapter,
} from "./utils/projectConfigAdapter";

/**
 * One MCP server = one project.
 * In stdio mode: one McpServer instance for the process.
 * In HTTP mode: one McpServer instance per session/transport.
 */
export interface StartMcpServerOptions {
  projectId: string;
  projectConfigAdapter?: ProjectConfigAdapter;
  transport?: "stdio" | "http";
  host?: string;
  port?: number;
}

function buildServer(
  projectId: string,
  projectConfigAdapter: ProjectConfigAdapter,
): McpServer {
  const server = new McpServer({
    name: `sparnatural-mcp-${projectId}`,
    version: "0.1.0",
  });

  registerTools(server, { projectConfigAdapter, projectId });
  registerResources(server, { projectConfigAdapter, projectId });
  registerPrompts(server, { projectConfigAdapter, projectId });

  return server;
}

export async function startMcpServer(
  options: StartMcpServerOptions,
): Promise<void> {
  const { projectId } = options;

  const projectConfigAdapter =
    options.projectConfigAdapter ?? new ConfigBackedProjectConfigAdapter();

  // Validate the project exists at startup so misconfiguration fails fast.
  await projectConfigAdapter.getProjectConfig(projectId);

  if (options.transport === "http") {
    const host = options.host ?? "127.0.0.1";
    const port = options.port ?? 3333;

    const app = express();
    app.disable("x-powered-by");
    app.use(express.json());

    type SessionEntry = {
      server: McpServer;
      transport: StreamableHTTPServerTransport;
    };

    const sessions: Record<string, SessionEntry> = {};

    app.post("/mcp", async (req, res) => {
      try {
        console.error("POST /mcp headers:", req.headers);
        console.error("POST /mcp body:", req.body);

        const sessionId = req.headers["mcp-session-id"] as string | undefined;

        // Existing session
        if (sessionId) {
          const existing = sessions[sessionId];

          if (!existing) {
            res.status(400).json({
              jsonrpc: "2.0",
              error: {
                code: -32000,
                message: "Bad Request: Invalid session ID",
              },
              id: req.body?.id ?? null,
            });
            return;
          }

          await existing.transport.handleRequest(req, res, req.body);
          return;
        }

        // New session must start with initialize
        if (!isInitializeRequest(req.body)) {
          res.status(400).json({
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: "Bad Request: First request must be initialize",
            },
            id: req.body?.id ?? null,
          });
          return;
        }

        // IMPORTANT: create a fresh server per HTTP session
        const sessionServer = buildServer(projectId, projectConfigAdapter);

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          enableJsonResponse: true,
          onsessioninitialized: (sid: string) => {
            sessions[sid] = {
              server: sessionServer,
              transport,
            };
            console.error(`MCP HTTP session initialized: ${sid}`);
          },
        });

        transport.onclose = async () => {
          const sid = transport.sessionId;
          if (sid && sessions[sid]) {
            delete sessions[sid];
            console.error(`MCP HTTP session closed: ${sid}`);
          }
        };

        await sessionServer.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error("POST /mcp error:", error);

        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: "2.0",
            error: {
              code: -32603,
              message: "Internal server error",
            },
            id: req.body?.id ?? null,
          });
        }
      }
    });

    const handleSessionRequest = async (
      req: express.Request,
      res: express.Response,
    ) => {
      try {
        console.error(`${req.method} /mcp headers:`, req.headers);

        const sessionId = req.headers["mcp-session-id"] as string | undefined;

        if (!sessionId || !sessions[sessionId]) {
          res.status(400).send("Invalid or missing session ID");
          return;
        }

        await sessions[sessionId].transport.handleRequest(req, res);
      } catch (error) {
        console.error(`${req.method} /mcp error:`, error);

        if (!res.headersSent) {
          res.status(500).send("Internal server error");
        }
      }
    };

    app.get("/mcp", handleSessionRequest);
    app.delete("/mcp", handleSessionRequest);

    const httpServer = app.listen(port, host, () => {
      console.error(
        `sparnatural-mcp server connected over HTTP (project=${projectId}, url=http://${host}:${port}/mcp)`,
      );
    });

    httpServer.ref();
    return;
  }

  // stdio mode: single server instance is fine
  const server = buildServer(projectId, projectConfigAdapter);
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(
    `sparnatural-mcp server connected over stdio (project=${projectId})`,
  );
}

function resolveProjectIdFromCli(): string {
  const arg = process.argv.find((a) => a.startsWith("--project="));
  if (arg) return arg.split("=")[1];
  if (process.env.MCP_PROJECT) return process.env.MCP_PROJECT;

  throw new Error(
    "Missing project id. Pass --project=<id> on the command line or set MCP_PROJECT env var.",
  );
}

function resolveTransportFromCli(): "stdio" | "http" {
  const arg = process.argv.find((a) => a.startsWith("--transport="));
  const value = arg?.split("=")[1];
  return value === "http" ? "http" : "stdio";
}

function resolveHostFromCli(): string | undefined {
  const arg = process.argv.find((a) => a.startsWith("--host="));
  return arg?.split("=")[1];
}

function resolvePortFromCli(): number | undefined {
  const arg = process.argv.find((a) => a.startsWith("--port="));
  if (!arg) return undefined;

  const parsed = Number(arg.split("=")[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

// Standalone launcher
if (process.argv.includes("--mcp")) {
  try {
    const projectId = resolveProjectIdFromCli();
    const transport = resolveTransportFromCli();
    const host = resolveHostFromCli();
    const port = resolvePortFromCli();

    startMcpServer({ projectId, transport, host, port }).catch((error) => {
      console.error("Failed to start MCP server:", error);
      process.exit(1);
    });
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
}
