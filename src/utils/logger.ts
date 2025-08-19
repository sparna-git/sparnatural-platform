import pino from "pino";
import path from "path";
import fs from "fs";
import config from "../config/config";

// Types d'API supportés
type ApiType = "text2query" | "query2text" | "sparql" | "other";

// Répertoire de base pour les logs
const baseLogDir = config.log?.directory || path.join(process.cwd(), "logs");

// Créer le répertoire de base s'il n'existe pas
if (!fs.existsSync(baseLogDir)) {
  fs.mkdirSync(baseLogDir, { recursive: true });
}

// Logger principal pour la console
const consoleLogger = pino({
  level: config.log?.level || "info",
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:dd-mm-yyyy HH:MM:ss",
      ignore: "pid,hostname",
    },
  },
  base: {
    pid: false,
    hostname: false,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Cache des loggers par projet et type d'API
const apiLoggers: Record<string, Record<ApiType, pino.Logger>> = {};

// Registres des entrées de logs pour chaque fichier
const logEntries: Record<string, any[]> = {};

// Fonction pour obtenir un logger spécifique à un projet et un type d'API
function getApiLogger(projectKey: string, apiType: ApiType): pino.Logger {
  if (!apiLoggers[projectKey]) {
    apiLoggers[projectKey] = {} as Record<ApiType, pino.Logger>;
  }

  if (apiLoggers[projectKey][apiType]) {
    return apiLoggers[projectKey][apiType];
  }

  // Créer le répertoire du projet s'il n'existe pas
  const projectLogDir = path.join(baseLogDir, projectKey);
  if (!fs.existsSync(projectLogDir)) {
    fs.mkdirSync(projectLogDir, { recursive: true });
  }

  // Un fichier par type d'API et par jour
  const logFilePath = path.join(
    projectLogDir,
    `${apiType}-${getDateString()}.json`
  );
  const fileKey = `${projectKey}-${apiType}-${getDateString()}`;

  // Initialiser le registre des entrées pour ce fichier
  if (!logEntries[fileKey]) {
    logEntries[fileKey] = [];

    // Si le fichier existe déjà, charger son contenu
    if (fs.existsSync(logFilePath)) {
      try {
        const content = fs.readFileSync(logFilePath, "utf8");
        if (content.trim()) {
          const data = JSON.parse(content);
          if (Array.isArray(data)) {
            logEntries[fileKey] = data;
          }
        }
      } catch (err) {
        console.error(`Error reading log file ${logFilePath}:`, err);
        // En cas d'erreur, continuer avec un tableau vide
      }
    }
  }

  // Ajouter cette configuration pour définir quels champs conserver par type d'API
  const logFieldsConfig: Record<ApiType, string[]> = {
    text2query: ["projectKey", "time", "text", "ip", "parsed"],
    query2text: ["projectKey", "time", "query", "lang", "summary", "ip"],
    sparql: ["projectKey", "time", "endpoint", "query", "ip"],
    other: ["projectKey", "time", "msg", "ip"],
  };

  // Créer un stream personnalisé pour écrire des logs structurés
  const customDestination = {
    write: (obj: any) => {
      // Analyser l'objet de log
      const logObject = typeof obj === "string" ? JSON.parse(obj) : obj;

      // Déterminer le type d'API
      const apiType = getApiTypeFromObject(logObject);

      // Filtrer les champs selon la configuration
      const fieldsToKeep = logFieldsConfig[apiType] || ["time", "msg"];
      const filteredObject: Record<string, any> = {};

      // Ne garder que les champs configurés
      fieldsToKeep.forEach((field) => {
        if (field in logObject) {
          filteredObject[field] = logObject[field];
        }
      });

      // Toujours conserver le message
      if (logObject.msg && !filteredObject.msg) {
        filteredObject.msg = logObject.msg;
      }

      // Ajouter l'entrée filtrée au registre
      logEntries[fileKey].push(filteredObject);

      // Écrire tout le tableau dans le fichier
      try {
        fs.writeFileSync(
          logFilePath,
          JSON.stringify(logEntries[fileKey], null, 2)
        );
      } catch (err) {
        console.error(`Error writing to log file ${logFilePath}:`, err);
      }

      return true;
    },
  };

  // Créer un nouveau logger pour ce projet et ce type d'API
  const apiLogger = pino(
    {
      level: config.log?.level || "info",
      base: {
        pid: false,
        hostname: false,
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    pino.multistream([
      // Sortie formatée dans la console
      {
        stream: pino.transport({
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:dd-mm-yyyy HH:MM:ss",
            ignore: "pid,hostname",
          },
        }),
      },
      // Sortie JSON structurée dans un fichier spécifique au type d'API
      {
        stream: customDestination as any,
      },
    ])
  );

  apiLoggers[projectKey][apiType] = apiLogger;
  return apiLogger;
}

// Helper pour obtenir une chaîne de date au format YYYY-MM-DD
function getDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(now.getDate()).padStart(2, "0")}`;
}

// Détecter le type d'API à partir de l'objet log
function getApiTypeFromObject(obj: any): ApiType {
  if (!obj) return "other";

  // Détection basée sur les propriétés présentes dans l'objet
  if (obj.text && !obj.query) return "text2query";
  if (obj.query && obj.summary) return "query2text";
  if (obj.query && !obj.summary) return "sparql";

  return "other";
}

// Exporter un objet logger avec des méthodes pour logger dans le bon endroit
const logger = {
  info: (obj: object, msg: string) => {
    if ("projectKey" in obj && typeof obj.projectKey === "string") {
      const apiType =
        "apiType" in obj && typeof obj.apiType === "string"
          ? (obj.apiType as ApiType)
          : getApiTypeFromObject(obj);

      getApiLogger(obj.projectKey, apiType).info(obj, msg);
    } else {
      consoleLogger.info(obj, msg);
    }
  },
  error: (obj: object, msg: string) => {
    if ("projectKey" in obj && typeof obj.projectKey === "string") {
      const apiType =
        "apiType" in obj && typeof obj.apiType === "string"
          ? (obj.apiType as ApiType)
          : getApiTypeFromObject(obj);

      getApiLogger(obj.projectKey, apiType).error(obj, msg);
    } else {
      consoleLogger.error(obj, msg);
    }
  },
  warn: (obj: object, msg: string) => {
    if ("projectKey" in obj && typeof obj.projectKey === "string") {
      const apiType =
        "apiType" in obj && typeof obj.apiType === "string"
          ? (obj.apiType as ApiType)
          : getApiTypeFromObject(obj);

      getApiLogger(obj.projectKey, apiType).warn(obj, msg);
    } else {
      consoleLogger.warn(obj, msg);
    }
  },
  debug: (obj: object, msg: string) => {
    if ("projectKey" in obj && typeof obj.projectKey === "string") {
      const apiType =
        "apiType" in obj && typeof obj.apiType === "string"
          ? (obj.apiType as ApiType)
          : getApiTypeFromObject(obj);

      getApiLogger(obj.projectKey, apiType).debug(obj, msg);
    } else {
      consoleLogger.debug(obj, msg);
    }
  },
};

export default logger;
