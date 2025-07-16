import fs from "fs";
import path from "path";

const logFile = path.join(__dirname, "../../queries.csv");

// Helper to safely escape CSV fields
function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function logQuery({
  ip,
  endpoint,
  query,
}: {
  ip?: string;
  endpoint: string;
  query: string;
}) {
  const timestamp = new Date().toISOString();
  const logLine =
    [timestamp, ip ?? "unknown", endpoint, query.replace(/\n/g, " ")]
      .map(escapeCSV)
      .join(",") + "\n";

  fs.appendFile(logFile, logLine, (err) => {
    if (err) console.error("Error logging query:", err);
  });
}
