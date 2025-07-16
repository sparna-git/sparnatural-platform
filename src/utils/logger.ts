import fs from "fs";
import path from "path";

const logFile = path.join(__dirname, "../../queries.log");

export async function logQuery({
  ip,
  endpoint,
  query,
}: {
  ip?: string; // ← ici
  endpoint: string;
  query: string;
}) {
  const timestamp = new Date().toISOString();
  const logLine = `${timestamp} | ${
    ip ?? "unknown"
  } | ${endpoint} | ${query.replace(/\n/g, " ")}\n`;
  fs.appendFile(logFile, logLine, (err) => {
    if (err) console.error("Error logging query:", err);
  });
}
