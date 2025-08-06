import express from "express";
import axios from "axios";
import config from "../config/config";
import fs from "fs";
import path from "path";

const router = express.Router();
const MAX_RESULTS = 10;
const CACHE_SIZE = 1000;

type QueryInput = { query: string };
type CacheEntry = { results: any[]; lastAccessed: string };

function loadCache(cacheFilePath: string): Record<string, CacheEntry> {
  if (fs.existsSync(cacheFilePath)) {
    try {
      const raw = fs.readFileSync(cacheFilePath, "utf-8").trim();
      if (!raw) {
        // Fichier vide => retourne cache vide
        return {};
      }
      return JSON.parse(raw);
    } catch (err) {
      console.error("❌ Erreur lecture cache:", err);
      // Si erreur JSON, on réinitialise le cache (évite crash)
      return {};
    }
  }
  return {};
}

// Sauvegarde du cache dans fichier dynamique
function saveCache(
  cacheFilePath: string,
  cacheData: Record<string, CacheEntry>
) {
  fs.mkdirSync(path.dirname(cacheFilePath), { recursive: true });
  fs.writeFileSync(cacheFilePath, JSON.stringify(cacheData, null, 2), "utf-8");
}

router.post("/", async (req, res) => {
  const projectKey = req.baseUrl.split("/")[3];

  if (!config.projects || !config.projects[projectKey]) {
    return res.status(400).json({ error: `Unknown projectKey: ${projectKey}` });
  }

  const SPARQL_ENDPOINT = config.projects[projectKey].sparqlEndpoint;
  if (!SPARQL_ENDPOINT) {
    return res.status(500).json({ error: "SPARQL endpoint not configured" });
  }

  // Construction chemin cache (absolu)
  const cacheRelativePath = config.projects[projectKey].cache?.urilookup;
  const cacheFilePath = path.isAbsolute(cacheRelativePath)
    ? cacheRelativePath
    : path.join(process.cwd(), cacheRelativePath);

  // Charger cache projet spécifique
  let uriCache = loadCache(cacheFilePath);

  const queries: Record<string, QueryInput> = req.body;

  if (
    !queries ||
    typeof queries !== "object" ||
    Array.isArray(queries) ||
    Object.values(queries).some(
      (q) => !q || typeof q.query !== "string" || q.query.trim() === ""
    )
  ) {
    return res.status(400).json({ error: "Invalid input JSON format" });
  }

  const responsePayload: Record<string, { result: any[] }> = {};

  // Fonction updateCache locale avec sauvegarde dans fichier projet
  function updateCache(name: string, results: any[]) {
    uriCache[name] = {
      results,
      lastAccessed: new Date().toISOString(),
    };

    // Nettoyage cache LRU
    const keys = Object.keys(uriCache);
    if (keys.length > CACHE_SIZE) {
      const oldestKey = keys.reduce((a, b) =>
        new Date(uriCache[a].lastAccessed) < new Date(uriCache[b].lastAccessed)
          ? a
          : b
      );
      delete uriCache[oldestKey];
    }

    saveCache(cacheFilePath, uriCache);
  }

  for (const [key, qobj] of Object.entries(queries)) {
    const name = qobj.query.trim();
    const escapedName = name.replace(/"/g, '\\"');

    if (uriCache[name]) {
      uriCache[name].lastAccessed = new Date().toISOString();
      saveCache(cacheFilePath, uriCache);

      responsePayload[key] = {
        result: uriCache[name].results.map((r) => ({
          id: r.uri,
          name,
          score: 100,
          match: true,
        })),
      };
      continue;
    }

    try {
      // Première requête SPARQL
      const query1 = `
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        SELECT ?x WHERE {
          ?x rdfs:label ?literal .
          FILTER(LCASE(STR(?literal)) = LCASE("${escapedName}"))
        }
        LIMIT ${MAX_RESULTS}
      `;

      const url1 = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(
        query1
      )}&format=json`;
      const response1 = await axios.get(url1, { timeout: 60000, family: 4 });
      let bindings = response1.data.results.bindings;

      // Si pas de résultats, deuxième requête SPARQL
      if (bindings.length === 0) {
        const query2 = `
          PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
          PREFIX foaf: <http://xmlns.com/foaf/0.1/>
          PREFIX dct: <http://purl.org/dc/terms/>
          SELECT ?x WHERE {
            ?x skos:prefLabel|skos:altLabel|skos:notation|foaf:name|dct:title ?literal .
            FILTER(LCASE(STR(?literal)) = LCASE("${escapedName}"))
          }
          LIMIT ${MAX_RESULTS}
        `;

        const url2 = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(
          query2
        )}&format=json`;
        const response2 = await axios.get(url2, { timeout: 60000, family: 4 });
        bindings = response2.data.results.bindings;
      }

      const results = bindings.map((b: { x: { value: string } }) => ({
        uri: b.x.value,
      }));

      updateCache(name, results);

      responsePayload[key] = {
        result: results.map((r: any) => ({
          id: r.uri,
          name,
          score: 100,
          match: true,
        })),
      };
    } catch (error) {
      console.error(`SPARQL request error for query "${name}":`, error);
      responsePayload[key] = { result: [] };
    }
  }

  return res.json(responsePayload);
});

export default router;
