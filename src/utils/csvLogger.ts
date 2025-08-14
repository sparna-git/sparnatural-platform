// utils/csvLogger.ts
import fs from "fs";
import path from "path";
import config from "../config/config";

const baseLogDir = config.log?.directory || "./logs";

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function appendCSVLog(
  projectKey: string,
  fileName: string,
  row: string[]
) {
  try {
    const projectLogDir = path.join(baseLogDir, projectKey);
    if (!fs.existsSync(projectLogDir)) {
      fs.mkdirSync(projectLogDir, { recursive: true });
    }

    const logFile = path.join(projectLogDir, fileName);
    const logLine = row.map(escapeCSV).join(",") + "\n";
    fs.appendFile(logFile, logLine, (err) => {
      if (err) {
        console.error("❌ Error writing CSV log:", err);
      }
    });
  } catch (err) {
    console.error("❌ Unexpected error in appendCSVLog:", err);
  }
}
