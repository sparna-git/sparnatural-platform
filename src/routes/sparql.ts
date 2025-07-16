import express from "express";
import { Parser } from "sparqljs";
import axios from "axios";
import { logQuery } from "../utils/logger";
import dns from "dns";
import http from "http";
import https from "https";

const router = express.Router();
const sparqlParser = new Parser();

router.get("/", async (req, res) => {
  let { query, endpoint, method, format } = req.query;
  const accept = req.headers.accept;

  if (!query || !endpoint) {
    return res.status(400).json({ error: "Missing 'query' or 'endpoint'" });
  }

  query = String(query);
  endpoint = String(endpoint);

  // Ajouter PREFIX bif: si nécessaire
  if (query.includes("bif:") && !query.includes("PREFIX bif:")) {
    query = "PREFIX bif: <bif:>\n" + query;
  }

  // Déterminer le type de requête SPARQL
  let queryType = "SELECT";
  try {
    const parsed = sparqlParser.parse(query);
    if (parsed && typeof parsed === "object" && "queryType" in parsed) {
      queryType = parsed.queryType.toUpperCase();
    }
  } catch (e) {
    return res
      .status(400)
      .json({ error: "Invalid SPARQL query", details: (e as Error).message });
  }

  // Choisir Content-Type à retourner
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

    res.setHeader("Content-Type", contentType);
    response.data.pipe(res);
  } catch (error: any) {
    res
      .status(500)
      .json({ error: "SPARQL request failed", details: error.message });
  }

  await logQuery({ ip: req.ip, endpoint, query });
});

export default router;
