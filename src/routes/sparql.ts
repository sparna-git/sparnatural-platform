import express from "express";
import { Parser } from "sparqljs";
import axios from "axios";
import { logQuery } from "../utils/logger";
import dns from "dns";
import http from "http";
import https from "https";

// Import ta config chargée dynamiquement via ton fichier config.ts
import config from "./config"; // chemin relatif vers ton fichier config.ts

const router = express.Router();
const sparqlParser = new Parser();

router.get("/", async (req, res) => {
  const projectId = req.baseUrl.split("/")[3];
  let { query, method, format } = req.query;
  const accept = req.headers.accept;

  // Récupérer la config du projet depuis la config importée
  const projectConfig = config.projects?.[projectId];
  if (!projectConfig) {
    return res.status(400).json({ error: `Unknown project ID: ${projectId}` });
  }

  // Récupérer le endpoint SPARQL à partir de la config du projet
  const endpoint = projectConfig.sparqlEndpoint;
  if (!endpoint) {
    return res.status(500).json({
      error: `No SPARQL endpoint configured for project ${projectId}`,
    });
  }

  console.log("=== Nouvelle requête SPARQL ===");
  console.log("Project ID:", projectId);
  console.log("Query param:", query);
  console.log("Method param:", method);
  console.log("Format param:", format);
  console.log("Accept header:", accept);
  console.log("Using endpoint from config:", endpoint);

  if (!query) {
    console.error("Missing 'query' parameter");
    return res.status(400).json({ error: "Missing 'query'" });
  }

  query = String(query);

  if (query.includes("bif:") && !query.includes("PREFIX bif:")) {
    query = "PREFIX bif: <bif:>\n" + query;
    console.log("Added PREFIX bif: to query");
  }

  let queryType = "SELECT";
  try {
    const parsed = sparqlParser.parse(query);
    if (parsed && typeof parsed === "object" && "queryType" in parsed) {
      queryType = parsed.queryType.toUpperCase();
    }
    console.log("Parsed query type:", queryType);
  } catch (e) {
    console.error("Error parsing query:", e);
    return res
      .status(400)
      .json({ error: "Invalid SPARQL query", details: (e as Error).message });
  }

  let contentType = "application/sparql-results+xml";
  if (format) {
    if (format === "json") contentType = "application/sparql-results+json";
  } else if (accept) {
    switch (accept) {
      case "application/json":
      case "application/sparql-results+json":
        contentType = "application/sparql-results+json";
        break;
      case "text/csv":
        contentType = "text/csv";
        break;
      case "text/tab-separated-values":
        contentType = "text/tab-separated-values";
        break;
      case "text/turtle":
        contentType = "text/turtle";
        break;
      default:
        contentType = "application/sparql-results+xml";
        break;
    }
  }
  console.log("Content-Type to return:", contentType);

  res.setHeader("Access-Control-Allow-Origin", "*");

  const forcePost = method?.toString().toUpperCase() === "POST";

  const lookupIPv4 = (
    hostname: string,
    options: dns.LookupOptions,
    callback: (
      err: NodeJS.ErrnoException | null,
      address: string | dns.LookupAddress[],
      family?: number
    ) => void
  ) => {
    dns.lookup(hostname, { ...options, family: 4, all: false }, callback);
  };

  try {
    console.log(
      `Calling SPARQL endpoint: ${endpoint} with method ${
        forcePost ? "POST" : "GET"
      }`
    );
    const response = await axios({
      method: forcePost ? "POST" : "GET",
      url: endpoint,
      headers: { Accept: contentType },
      ...(forcePost
        ? { data: new URLSearchParams({ query }) }
        : { params: { query } }),
      responseType: "stream",
      httpAgent: new http.Agent({ lookup: lookupIPv4 }),
      httpsAgent: new https.Agent({ lookup: lookupIPv4 }),
    });

    console.log("SPARQL request succeeded, streaming response");
    res.setHeader("Content-Type", contentType);
    response.data.pipe(res);
  } catch (error: any) {
    console.error("SPARQL request failed:", error);
    res
      .status(500)
      .json({ error: "SPARQL request failed", details: error.message });
  }

  await logQuery({ ip: req.ip, endpoint, query });
});

export default router;
