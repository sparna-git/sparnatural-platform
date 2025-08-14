// utils/logBusiness.ts
import logger from "./logger";
import { appendCSVLog } from "./csvLogger";

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
  const timestamp = new Date().toISOString();

  // Log JSON structuré
  logger.info({ projectKey, ip, endpoint, query }, "SPARQL query executed");

  // Log CSV pour dashboard
  await appendCSVLog(projectKey, "sparql.csv", [
    timestamp,
    ip ?? "unknown",
    endpoint,
    query.replace(/\n/g, " "),
  ]);
}

export async function logTextToQuery({
  projectKey,
  text,
  query,
}: {
  projectKey: string;
  text: string;
  query: any;
}) {
  const timestamp = new Date().toISOString();

  logger.info({ projectKey, text, query }, "Text converted to SPARQL");

  await appendCSVLog(projectKey, "text2query.csv", [
    timestamp,
    text,
    JSON.stringify(query),
  ]);
}

export async function logQueryToText({
  projectKey,
  query,
  text,
}: {
  projectKey: string;
  query: string;
  text: string;
}) {
  const timestamp = new Date().toISOString();

  logger.info({ projectKey, query, text }, "SPARQL converted to text");

  await appendCSVLog(projectKey, "query2text.csv", [timestamp, query, text]);
}
