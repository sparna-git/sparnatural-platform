import axios from "axios";
import { getSHACLConfig } from "../config/SCHACL";

const MAX_RESULTS = 10;
const CACHE_SIZE = 1000;

export type QueryInput = { query: string; type?: string };
type CacheEntry = { results: any[]; lastAccessed: Date };

// --- Cache mémoire par projet ---
const memoryCache: Record<string, Record<string, CacheEntry>> = {};

export function getProjectCache(
  projectKey: string
): Record<string, CacheEntry> {
  if (!memoryCache[projectKey]) {
    memoryCache[projectKey] = {};
  }
  return memoryCache[projectKey];
}

export function updateCache(
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

export function parseQueries(body: any): Record<string, QueryInput> {
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

export function formatResults(uriList: string[], name: string) {
  // Sort URIs by length (shortest first)
  const sortedUris = [...uriList].sort((a, b) => a.length - b.length);

  return sortedUris.map((uri, index) => ({
    id: uri,
    name,
    score: index === 0 ? 100 : 99, // 100 for shortest URI, 99 for others
    match: true,
  }));
}

export async function formatResultsWithTypes(
  uriList: string[],
  name: string,
  sparqlEndpoint: string
) {
  // Sort URIs by length (shortest first)
  const sortedUris = [...uriList].sort((a, b) => a.length - b.length);

  const results = [];
  for (let i = 0; i < sortedUris.length; i++) {
    const uri = sortedUris[i];
    const types = await getEntityTypes(uri, sparqlEndpoint);
    results.push({
      id: uri,
      name,
      type: types,
      score: i === 0 ? 100 : 99, // 100 for shortest URI, 99 for others
      match: true,
    });
  }
  return results;
}

export async function runSparqlSearch(
  name: string,
  sparqlEndpoint: string,
  typeUri?: string,
  includeTypes: boolean = false,
  projectKey?: string | undefined
): Promise<string[]> {
  if (!projectKey) {
    throw new Error("projectKey is required for SHACL config loading.");
  }
  console.log(
    `Chargement de la configuration SHACL pour le projet ${projectKey}`
  );
  // Récupérer la config SHACL (mise en cache automatiquement)
  const SCHACLconfig = getSHACLConfig(projectKey);
  const escapedName = name.replace(/"/g, '\\"');
  let typeFilter = "";

  if (typeUri) {
    if (includeTypes) {
      // Mode OpenRefine → pas de SHACL, on prend le typeUri tel quel
      typeFilter = `?x a <${typeUri}> .`;
    } else {
      // Mode simple reconciliation → on passe par SCHACLconfig
      const nodeShape = SCHACLconfig[typeUri];
      if (!nodeShape) {
        throw new Error(`NodeShape non trouvé pour typeUri=${typeUri}`);
      }

      const targetClass = nodeShape["http://www.w3.org/ns/shacl#targetClass"];
      console.log("Target class:", targetClass);

      if (targetClass) {
        typeFilter = `?x a <${targetClass}> .`;
      }
    }
  }

  // Query 1: rdfs:label with language tags
  const query1 = `
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
    SELECT ?x WHERE {
      {
        { ?x rdfs:label "${escapedName}"@en . }
        UNION
        { ?x rdfs:label "${escapedName}"@fr . }
      }
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

    // Query 2: SKOS properties with language tags (nouvelle requête)
    if (bindings.length === 0) {
      const query2 = `
        PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
        SELECT ?x WHERE {
          {
            { ?x skos:prefLabel|skos:altLabel|skos:notation "${escapedName}"@en . }
            UNION
            { ?x skos:prefLabel|skos:altLabel|skos:notation "${escapedName}"@fr . }
          }
        }
        LIMIT ${MAX_RESULTS}
      `;
      const url2 = `${sparqlEndpoint}?query=${encodeURIComponent(
        query2
      )}&format=json`;
      const response2 = await axios.get(url2, { timeout: 60000, family: 4 });
      bindings = response2.data.results.bindings;
    }

    // Query 3: Other properties without language tags (ancienne query2 sans SKOS)
    if (bindings.length === 0) {
      const query3 = `
        PREFIX foaf: <http://xmlns.com/foaf/0.1/>
        PREFIX dct: <http://purl.org/dc/terms/>
        PREFIX dc: <http://purl.org/dc/elements/1.1/>
        PREFIX schema: <http://schema.org/>
        SELECT ?x WHERE {
          ${typeFilter}
          ?x foaf:name|dct:title|dc:title|dct:identifier|dc:identifier|schema:name ?literal .
          FILTER(LCASE(STR(?literal)) = LCASE("${escapedName}"))
        }
        LIMIT ${MAX_RESULTS}
      `;
      const url3 = `${sparqlEndpoint}?query=${encodeURIComponent(
        query3
      )}&format=json`;
      const response3 = await axios.get(url3, { timeout: 60000, family: 4 });
      bindings = response3.data.results.bindings;
    }
  } catch (err) {
    console.error(`SPARQL request error for "${name}":`, err);
    return [];
  }

  return bindings.map((b) => b.x.value);
}

export async function buildManifest(
  projectKey: string,
  sparqlEndpoint: string
) {
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

export async function getEntityTypes(
  uri: string,
  sparqlEndpoint: string
): Promise<Array<{ id: string; name: string }>> {
  try {
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

export async function reconcileQueries(
  queries: Record<string, QueryInput>,
  sparqlEndpoint: string,
  projectKey: string,
  includeTypes: boolean
) {
  const uriCache = getProjectCache(projectKey);
  const responsePayload: Record<string, { result: any[] }> = {};

  for (const [key, qobj] of Object.entries(queries)) {
    const name = qobj.query.trim();
    const cacheKey = encodeURIComponent(
      name.toLowerCase() +
        (qobj.type ? `|${qobj.type}` : "") +
        (includeTypes ? "|openrefine" : "|simple")
    );

    if (
      uriCache[cacheKey] &&
      (!includeTypes || uriCache[cacheKey].results[0]?.type)
    ) {
      uriCache[cacheKey].lastAccessed = new Date();
      responsePayload[key] = { result: uriCache[cacheKey].results };
      if (uriCache[cacheKey].results.length > 0) {
        console.log(
          `[reconciliation] 🔎 "${name}" → "${uriCache[cacheKey].results[0].id}"`
        );
      } else {
        console.log(`[reconciliation] 🔎 "${name}" → aucun résultat`);
      }
      continue;
    }

    const uris = await runSparqlSearch(
      name,
      sparqlEndpoint,
      qobj.type,
      includeTypes,
      projectKey
    );

    let results;
    if (includeTypes) {
      results = await formatResultsWithTypes(uris, name, sparqlEndpoint);
    } else {
      results = formatResults(uris, name);
    }

    updateCache(uriCache, cacheKey, results);
    responsePayload[key] = { result: results };

    if (results.length > 0) {
      console.log(`[reconciliation] 🔎 "${name}" → "${results[0].id}"`);
    } else {
      console.log(`[reconciliation] 🔎 "${name}" → aucun résultat`);
    }
  }

  return responsePayload;
}
