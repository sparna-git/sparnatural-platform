import express from "express";
import { Parser } from "sparqljs";
import axios from "axios";
import dns from "dns";
import http from "http";
import https from "https";
import config from "../config/config";
import logger from "../utils/logger";

const router = express.Router();
const sparqlParser = new Parser();

// Middleware de log de debug
router.use((req, res, next) => {
  console.log("==== [SPARQL ROUTE] ====");
  console.log(`🔍 HTTP ${req.method} ${req.originalUrl}`);
  console.log("Headers:", req.headers);
  console.log("Query params:", req.query);
  console.log("Body:", req.body);
  next();
});

router.all("/", async (req, res) => {
  const projectId = req.baseUrl.split("/")[3];
  const accept = req.headers.accept;

  // Support GET (query dans URL) et POST (query dans body)
  let query = req.method === "POST" ? req.body.query : req.query.query;
  let method = req.query.method;
  let format = req.method === "POST" ? req.body.format : req.query.format;

  console.log("=== Nouvelle requête SPARQL ===");
  console.log("Project ID:", projectId);
  console.log("Query:", query);
  console.log("Method param:", method);
  console.log("Format param:", format);
  console.log("Accept header:", accept);

  if (!query) {
    console.error("❌ Missing 'query' parameter");
    return res.status(400).json({ error: "Missing 'query'" });
  }

  const projectConfig = config.projects?.[projectId];
  if (!projectConfig) {
    console.error(`❌ Unknown project ID: ${projectId}`);
    return res.status(400).json({ error: `Unknown project ID: ${projectId}` });
  }

  const endpoint = projectConfig.sparqlEndpoint;
  if (!endpoint) {
    console.error(`❌ No SPARQL endpoint configured for ${projectId}`);
    return res.status(500).json({
      error: `No SPARQL endpoint configured for project ${projectId}`,
    });
  }

  console.log("Using endpoint from config:", endpoint);

  query = String(query);

  if (query.includes("bif:") && !query.includes("PREFIX bif:")) {
    query = "PREFIX bif: <bif:>\n" + query;
    console.log("✅ Added PREFIX bif: to query");
  }

  let queryType = "SELECT";
  try {
    const parsed = sparqlParser.parse(query);
    if (parsed && typeof parsed === "object" && "queryType" in parsed) {
      queryType = parsed.queryType.toUpperCase();
    }
    console.log("✅ Parsed query type:", queryType);
  } catch (e) {
    console.error("❌ Error parsing query:", e);
    return res
      .status(400)
      .json({ error: "Invalid SPARQL query", details: (e as Error).message });
  }

  // Déterminer le type de retour avec Express accepts()
  let contentType: string;
  if (format) {
    switch (format) {
      case "json":
        contentType = "application/sparql-results+json";
        break;
      case "xml":
        contentType = "application/sparql-results+xml";
        break;
      case "csv":
        contentType = "text/csv";
        break;
      case "tsv":
        contentType = "text/tab-separated-values";
        break;
      case "turtle":
        contentType = "text/turtle";
        break;
      default:
        contentType = "application/sparql-results+xml";
        break;
    }
  } else {
    const preferred = req.accepts([
      "application/sparql-results+json",
      "application/sparql-results+xml",
      "text/csv",
      "text/tab-separated-values",
      "text/turtle",
    ]);
    contentType = preferred || "application/sparql-results+xml";
  }

  console.log("🧾 Content-Type to return:", contentType);

  res.setHeader("Access-Control-Allow-Origin", "*");

  const forcePost =
    req.method === "POST" || method?.toString().toUpperCase() === "POST";

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
      `🚀 Calling SPARQL endpoint: ${endpoint} with method ${
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

    console.log("✅ SPARQL request succeeded, streaming response");
    res.setHeader("Content-Type", contentType);
    response.data.pipe(res);
  } catch (error: any) {
    console.error("❌ SPARQL request failed:", error.message);
    if (error.response) {
      console.error("↩️ Response code:", error.response.status);
      console.error("↩️ Response data:", await error.response.data?.toString());
    }
    res
      .status(500)
      .json({ error: "SPARQL request failed", details: error.message });
  }

  // Log final (CSV + JSON rotatif)
  const projectKey = projectId;
  const ip = req.ip;

  await logger.info(
    { projectKey, ip, endpoint, query },
    "SPARQL query executed"
  );
});

export default router;
