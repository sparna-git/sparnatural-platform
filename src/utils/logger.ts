import fs from "fs";
import path from "path";
import config from "../routes/config"; // adapte le chemin selon ton arborescence

// Récupérer le dossier de logs depuis la config (avec fallback)
const logDir = config.log?.directory || "./logs";
// S'assurer que le dossier existe
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Chemin complet du fichier de log
const logFile = path.join(logDir, "queries.csv");

// Helper pour échapper les champs CSV
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
