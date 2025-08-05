import fs from "fs";
import path from "path";
import config from "../routes/config"; // adapte le chemin selon ton arborescence

// Récupérer le dossier de logs depuis la config (avec fallback)
const baseLogDir = config.log?.directory || "./logs";

// Helper pour échapper les champs CSV
function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Log a SPARQL query into the per-project file logs/{projectKey}/sparql.csv
 */
export async function logQuery({
  projectKey,
  ip,
  endpoint,
  query,
}: {
  projectKey: string;
  ip?: string;
  endpoint: string;
  query: string;
}) {
  try {
    // Créer le sous-dossier du projet
    const projectLogDir = path.join(baseLogDir, projectKey);
    if (!fs.existsSync(projectLogDir)) {
      fs.mkdirSync(projectLogDir, { recursive: true });
    }

    // Définir le fichier de log
    const logFile = path.join(projectLogDir, "sparql.csv");

    // Construire la ligne de log
    const timestamp = new Date().toISOString();
    const logLine =
      [timestamp, ip ?? "unknown", endpoint, query.replace(/\n/g, " ")]
        .map(escapeCSV)
        .join(",") + "\n";

    // Écrire dans le fichier
    fs.appendFile(logFile, logLine, (err) => {
      if (err) console.error("❌ Error logging query:", err);
    });
  } catch (err) {
    console.error("❌ Unexpected error in logger:", err);
  }
}
