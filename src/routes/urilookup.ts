import express from "express";
import axios from "axios";
import config from "../config/config";

const router = express.Router();
const MAX_RESULTS = 10;
const CACHE_SIZE = 1000;

type QueryInput = { query: string };
type CacheEntry = { results: any[]; lastAccessed: Date };

// Cache en mémoire par projet
const memoryCache: Record<string, Record<string, CacheEntry>> = {};

function getProjectCache(projectKey: string): Record<string, CacheEntry> {
  if (!memoryCache[projectKey]) {
    memoryCache[projectKey] = {};
  }
  return memoryCache[projectKey];
}

async function getEntityTypes(
  uri: string,
  sparqlEndpoint: string
): Promise<Array<{ id: string; name: string }>> {
  try {
    const typesQuery = `
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      SELECT DISTINCT ?type ?label WHERE {
        <${uri}> rdf:type ?type .
        OPTIONAL { ?type rdfs:label ?label . FILTER(LANG(?label) = "en") }
        FILTER(STRSTARTS(STR(?type), "http://dbpedia.org/ontology/"))
      }
      LIMIT 5
    `;

    const url = `${sparqlEndpoint}?query=${encodeURIComponent(
      typesQuery
    )}&format=json`;
    const response = await axios.get(url, {
      timeout: 10000,
      family: 4, // Force IPv4
    });
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

router.post("/", async (req, res) => {
  const projectKey = req.baseUrl.split("/")[3];

  if (!config.projects || !config.projects[projectKey]) {
    return res.status(400).json({ error: `Unknown projectKey: ${projectKey}` });
  }

  const SPARQL_ENDPOINT = config.projects[projectKey].sparqlEndpoint;
  if (!SPARQL_ENDPOINT) {
    return res.status(500).json({ error: "SPARQL endpoint not configured" });
  }

  // Récupérer le cache en mémoire pour ce projet
  const uriCache = getProjectCache(projectKey);

  // Gérer les deux formats : OpenRefine et format direct
  let queries: Record<string, QueryInput>;
  try {
    if (req.body.queries && typeof req.body.queries === "string") {
      // Format OpenRefine
      queries = JSON.parse(req.body.queries);
    } else if (req.body && typeof req.body === "object") {
      // Format direct (Swagger/API)
      queries = req.body;
    } else {
      throw new Error("Invalid format");
    }
  } catch (error) {
    return res.status(400).json({ error: "Invalid queries JSON format" });
  }

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

  // Fonction updateCache locale en mémoire
  function updateCache(name: string, results: any[]) {
    uriCache[name] = {
      results,
      lastAccessed: new Date(),
    };

    // Nettoyage cache LRU
    const keys = Object.keys(uriCache);
    if (keys.length > CACHE_SIZE) {
      const oldestKey = keys.reduce((a, b) =>
        uriCache[a].lastAccessed < uriCache[b].lastAccessed ? a : b
      );
      delete uriCache[oldestKey];
      console.log(`[uriLookup] 🧹 Cache LRU: suppression de "${oldestKey}"`);
    }
  }

  for (const [key, qobj] of Object.entries(queries)) {
    const name = qobj.query.trim();
    const escapedName = name.replace(/"/g, '\\"');

    if (uriCache[name]) {
      console.log(`[uriLookup] ✅ "${name}" récupéré depuis le cache mémoire`);
      uriCache[name].lastAccessed = new Date();

      responsePayload[key] = {
        result: uriCache[name].results.map((r) => ({
          id: r.uri,
          name: name,
          type: r.types || [
            { id: "http://www.w3.org/2002/07/owl#Thing", name: "Thing" },
          ],
          score: 100,
          match: true,
        })),
      };
      continue;
    }

    console.log(
      `[uriLookup] 🔍 "${name}" introuvable en cache – requête SPARQL...`
    );

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

      // Récupérer les types pour chaque résultat
      const resultsWithTypes = await Promise.all(
        results.map(async (r: any) => {
          const types = await getEntityTypes(r.uri, SPARQL_ENDPOINT);
          return {
            ...r,
            types: types,
          };
        })
      );

      updateCache(name, resultsWithTypes);

      console.log(
        `[uriLookup] 🆕 "${name}" ajouté au cache mémoire avec ${resultsWithTypes.length} résultat(s)`
      );

      responsePayload[key] = {
        result: resultsWithTypes.map((r: any) => ({
          id: r.uri,
          name: name,
          type: r.types,
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

router.get("/", (req, res) => {
  const manifest = {
    versions: ["0.2"],
    name: "Reconciliation dbpedia-en",
    identifierSpace: "https://services.sparnatural.eu/projects/dbpedia-en",
    schemaSpace: "https://services.sparnatural.eu/projects/dbpedia-en",
    view: {
      url: "{{id}}",
    },
  };
  res.json(manifest);
});

export default router;
