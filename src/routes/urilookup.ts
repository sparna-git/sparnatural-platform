import express from "express";
import axios from "axios";
import config from "../config/config";

const router = express.Router();
const MAX_RESULTS = 10;
const CACHE_SIZE = 1000;

type QueryInput = { query: string };
type CacheEntry = { results: any[]; lastAccessed: Date };

// --- Cache mémoire par projet ---
const memoryCache: Record<string, Record<string, CacheEntry>> = {};

// --- Helpers cache ---
function getProjectCache(projectKey: string): Record<string, CacheEntry> {
  if (!memoryCache[projectKey]) {
    memoryCache[projectKey] = {};
  }
  return memoryCache[projectKey];
}

function updateCache(
  uriCache: Record<string, CacheEntry>,
  key: string,
  results: any[]
) {
  uriCache[key] = { results, lastAccessed: new Date() };

  const keys = Object.keys(uriCache);
  if (keys.length > CACHE_SIZE) {
    const oldestKey = keys.reduce((a, b) =>
      uriCache[a].lastAccessed < uriCache[b].lastAccessed ? a : b
    );
    delete uriCache[oldestKey];
    console.log(`[cache] 🧹 LRU: suppression "${oldestKey}"`);
  }
}

// --- Helper parser queries ---
function parseQueries(body: any): Record<string, QueryInput> {
  if (!body) throw new Error("Empty body");

  if (body.queries) {
    return typeof body.queries === "string"
      ? JSON.parse(body.queries)
      : body.queries;
  }
  if (typeof body === "object" && !Array.isArray(body)) {
    return body;
  }
  throw new Error("Invalid queries format");
}

// --- Helper format résultats ---
function formatResults(uriList: string[], name: string) {
  return uriList.map((uri) => ({
    id: uri,
    name,
    score: 100,
    match: true,
  }));
}

// --- Requête SPARQL principale ---
async function runSparqlSearch(
  name: string,
  sparqlEndpoint: string
): Promise<string[]> {
  const escapedName = name.replace(/"/g, '\\"');

  const query1 = `
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
    SELECT ?x WHERE {
      ?x rdfs:label ?literal .
      FILTER(LCASE(STR(?literal)) = LCASE("${escapedName}"))
    }
    LIMIT ${MAX_RESULTS}
  `;

  let bindings: any[] = [];
  try {
    const url1 = `${sparqlEndpoint}?query=${encodeURIComponent(
      query1
    )}&format=json`;
    const response1 = await axios.get(url1, { timeout: 60000, family: 4 });
    bindings = response1.data.results.bindings;

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
      const url2 = `${sparqlEndpoint}?query=${encodeURIComponent(
        query2
      )}&format=json`;
      const response2 = await axios.get(url2, { timeout: 60000, family: 4 });
      bindings = response2.data.results.bindings;
    }
  } catch (err) {
    console.error(`SPARQL request error for "${name}":`, err);
    return [];
  }

  return bindings.map((b) => b.x.value);
}

// --- Build manifest ---
async function buildManifest(projectKey: string, sparqlEndpoint: string) {
  return {
    versions: ["0.2"],
    name: `Reconciliation ${projectKey}`,
    identifierSpace: `https://services.sparnatural.eu/projects/${projectKey}`,
    schemaSpace: `https://services.sparnatural.eu/projects/${projectKey}`,
    view: { url: "{{id}}" },
    defaultTypes: [],
    types: [],
    features: {
      "property-search": false,
      "type-search": false,
      preview: false,
      suggest: false,
    },
  };
}

// --- Récupère les types d'une entité ---
async function getEntityTypes(
  uri: string,
  sparqlEndpoint: string
): Promise<Array<{ id: string; name: string }>> {
  try {
    /**/
    const typesQuery = `
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      SELECT DISTINCT ?type ?label WHERE {
        <${uri}> rdf:type ?type .
        OPTIONAL { ?type rdfs:label ?label }
      }
      LIMIT 10
    `;
    const url = `${sparqlEndpoint}?query=${encodeURIComponent(
      typesQuery
    )}&format=json`;
    const response = await axios.get(url, { timeout: 60000, family: 4 });
    const bindings = response.data.results.bindings;
    if (bindings.length === 0) {
      return [{ id: "http://www.w3.org/2002/07/owl#Thing", name: "Thing" }];
    }
    return bindings.map((b: any) => ({
      id: b.type.value,
      name: b.label?.value || b.type.value.split("/").pop() || "Unknown",
    }));
  } catch (error: any) {
    console.error(`Error fetching types for ${uri}:`, error.message || error);
    return [{ id: "http://www.w3.org/2002/07/owl#Thing", name: "Thing" }];
  }
}

// --- Helper format résultats avec types ---
async function formatResultsWithTypes(
  uriList: string[],
  name: string,
  sparqlEndpoint: string
) {
  const results = [];
  for (const uri of uriList) {
    const types = await getEntityTypes(uri, sparqlEndpoint);
    results.push({
      id: uri,
      name,
      type: types,
      score: 100,
      match: true,
    });
  }
  return results;
}

// --- Réconciliation ---
async function reconcileQueries(
  queries: Record<string, QueryInput>,
  sparqlEndpoint: string,
  projectKey: string,
  includeTypes: boolean
) {
  const uriCache = getProjectCache(projectKey);
  const responsePayload: Record<string, { result: any[] }> = {};

  for (const [key, qobj] of Object.entries(queries)) {
    const name = qobj.query.trim();
    const cacheKey = encodeURIComponent(name.toLowerCase());

    if (
      uriCache[cacheKey] &&
      (!includeTypes || uriCache[cacheKey].results[0]?.type)
    ) {
      uriCache[cacheKey].lastAccessed = new Date();
      responsePayload[key] = { result: uriCache[cacheKey].results };
      continue;
    }

    const uris = await runSparqlSearch(name, sparqlEndpoint);

    let results;
    if (includeTypes) {
      results = await formatResultsWithTypes(uris, name, sparqlEndpoint);
    } else {
      results = formatResults(uris, name);
    }

    updateCache(uriCache, cacheKey, results);
    responsePayload[key] = { result: results };
  }

  return responsePayload;
}

// --- POST / ---
router.post("/", async (req, res) => {
  let projectKey: string;
  try {
    projectKey = req.baseUrl.split("/")[3];
    if (!projectKey || !config.projects[projectKey]) {
      return res
        .status(400)
        .json({ error: `Unknown projectKey: ${projectKey}` });
    }
  } catch {
    return res.status(400).json({ error: "Invalid projectKey" });
  }

  const SPARQL_ENDPOINT = config.projects[projectKey].sparqlEndpoint;
  if (!SPARQL_ENDPOINT)
    return res.status(500).json({ error: "SPARQL endpoint not configured" });

  // Parser les queries
  let queries: Record<string, QueryInput>;
  try {
    queries = parseQueries(req.body);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }

  // Vérifie le paramètre includeTypes
  const includeTypes = req.query.includeTypes === "true";

  let responsePayload: Record<string, { result: any[] }> = {};

  try {
    responsePayload = await reconcileQueries(
      queries,
      SPARQL_ENDPOINT,
      projectKey,
      includeTypes
    );
  } catch (err) {
    console.error("Reconciliation error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }

  return res.json(responsePayload);
});
/**/
// --- GET / --- retourne le manifest
router.get("/", async (req, res) => {
  let projectKey: string;
  try {
    projectKey = req.baseUrl.split("/")[3];
    if (!projectKey || !config.projects[projectKey]) {
      return res
        .status(400)
        .json({ error: `Unknown projectKey: ${projectKey}` });
    }
  } catch {
    return res.status(400).json({ error: "Invalid projectKey" });
  }

  const SPARQL_ENDPOINT = config.projects[projectKey].sparqlEndpoint;
  if (!SPARQL_ENDPOINT)
    return res.status(500).json({ error: "SPARQL endpoint not configured" });

  const manifest = await buildManifest(projectKey, SPARQL_ENDPOINT);
  return res.json(manifest);
});

export default router;
