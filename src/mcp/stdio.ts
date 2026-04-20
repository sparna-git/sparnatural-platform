import "reflect-metadata";
import dotenv from "dotenv";
import { startMcpStdio } from "./server";

dotenv.config();

const projectId = process.argv[2];
if (!projectId) {
  console.error("Usage: node dist/mcp/stdio.js <projectId>");
  process.exit(1);
}

startMcpStdio(projectId).catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
