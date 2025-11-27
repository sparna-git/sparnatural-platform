import axios from "axios";
import { getSHACLConfig } from "../config/SCHACL";
import {
  ReconcileOutput,
  ReconcileServiceIfc,
  ReconcileInput,
  ReconcileResult,
  ManifestType,
} from "./ReconcileServiceIfc";
import { inject, injectable } from "tsyringe";
import { SparqlReconcileServiceConfig } from "../config/ProjectConfig";

type CacheEntry = { results: ReconcileResult[]; lastAccessed: Date };


@injectable({token: "DummyReconcileService"})
export class DummyReconcileService implements ReconcileServiceIfc{

  reconcileQueries(queries: ReconcileInput, includeTypes: boolean):Promise<ReconcileOutput> {
    throw new Error("Method not implemented.");
  }

  buildManifest():Promise<ManifestType> {
    throw new Error("Method not implemented.");
  }

}

@injectable({token: "SparqlReconcileService"})
// this indicates it is the default implementation for the ReconcileServiceIfc
@injectable({token: "default:reconciliation"})
export class SparqlReconcileService implements ReconcileServiceIfc {
  public static DEFAULT_MAX_RESULTS = 10;
  public static DEFAULT_CACHE_SIZE = 1000;

  // --- Cache mémoire par projet ---
  private memoryCache: Record<string, CacheEntry> = {};

  private projectId: string;
  private sparqlEndpoint: string;

  private maxResults:number;
  private cacheSize:number;

  constructor(
    @inject("project.id") projectId?:string, 
    @inject("project.sparqlEndpoint")  sparqlEndpoint?:string,
    @inject("reconciliation.config")  reconciliationConfig?:SparqlReconcileServiceConfig
  ) {
    this.projectId = projectId || "";
    this.sparqlEndpoint = sparqlEndpoint || "";

    this.maxResults = reconciliationConfig?.maxResults || SparqlReconcileService.DEFAULT_MAX_RESULTS;
    this.cacheSize = reconciliationConfig?.cacheSize || SparqlReconcileService.DEFAULT_CACHE_SIZE;
  }

  // --- Manifest ---
  buildManifest():Promise<ManifestType> {
    return Promise.resolve({
      versions: ["0.2"],
      name: `Reconciliation ${this.projectId}`,
      identifierSpace: `https://services.sparnatural.eu/projects/${this.projectId}`,
      schemaSpace: `https://services.sparnatural.eu/projects/${this.projectId}`,
      view: { url: "{{id}}" },
      defaultTypes: [],
      types: [],
      features: {
        "property-search": false,
        "type-search": false,
        preview: false,
        suggest: false,
      },
    });
  }

  // --- Reconciliation ---
  reconcileQueries(queries: ReconcileInput, includeTypes: boolean):Promise<ReconcileOutput> {
    const uriCache = this.memoryCache;
    const responsePayload: ReconcileOutput = {};

    const entries = Object.entries(queries);

    // Chaînage des promesses pour traiter les requêtes séquentiellement
    let chain = Promise.resolve();

    entries.forEach(([key, qobj]) => {
      chain = chain.then(() => {
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
          console.log(
            uriCache[cacheKey].results.length > 0
              ? `[reconciliation] 🔎 "${name}" → "${uriCache[cacheKey].results[0].id}"`
              : `[reconciliation] 🔎 "${name}" → aucun résultat`
          );
          return;
        }

        return this.runSparqlSearch(name, qobj.type, includeTypes).then(
          (uris) => {
            if (includeTypes) {
              return this.formatResultsWithTypes(uris, name).then((results) => {
                this.updateCache(cacheKey, results);
                responsePayload[key] = { result: results };
                console.log(
                  results.length > 0
                    ? `[reconciliation] 🔎 "${name}" → "${results[0].id}"`
                    : `[reconciliation] 🔎 "${name}" → aucun résultat`
                );
              });
            } else {
              const results = this.formatResults(uris, name);
              this.updateCache(cacheKey, results);
              responsePayload[key] = { result: results };
              console.log(
                results.length > 0
                  ? `[reconciliation] 🔎 "${name}" → "${results[0].id}"`
                  : `[reconciliation] 🔎 "${name}" → aucun résultat`
              );
            }
          }
        );
      });
    });

    return chain.then(() => responsePayload);
  }

  updateCache(key: string, results: ReconcileResult[]) {
    this.memoryCache[key] = { results, lastAccessed: new Date() };

    const keys = Object.keys(this.memoryCache);
    if (keys.length > this.cacheSize) {
      const oldestKey = keys.reduce((a, b) =>
        this.memoryCache[a].lastAccessed < this.memoryCache[b].lastAccessed
          ? a
          : b
      );
      delete this.memoryCache[oldestKey];
      console.log(`[cache] 🧹 LRU: suppression "${oldestKey}"`);
    }
  }

  static parseQueries(body: any): ReconcileInput {
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

  formatResults(uriList: string[], name: string) {
    const sortedUris = [...uriList].sort((a, b) => a.length - b.length);

    return sortedUris.map((uri, index) => ({
      id: uri,
      name,
      score: index === 0 ? 100 : 99,
      match: true,
    }));
  }

  formatResultsWithTypes(uriList: string[], name: string) {
    const sortedUris = [...uriList].sort((a, b) => a.length - b.length);
    let results: ReconcileResult[] = [];
    let chain = Promise.resolve();

    sortedUris.forEach((uri, i) => {
      chain = chain.then(() =>
        this.getEntityTypes(uri, this.sparqlEndpoint).then((types) => {
          results.push({
            id: uri,
            name,
            type: types,
            score: i === 0 ? 100 : 99,
            match: true,
          });
        })
      );
    });

    return chain.then(() => results);
  }

  runSparqlSearch(
    name: string,
    typeUri?: string,
    includeTypes: boolean = false
  ) {
    console.log(
      `Chargement de la configuration SHACL pour le projet ${this.projectId}`
    );

    // Récupérer la config SHACL (mise en cache automatiquement)
    const SCHACLconfig = getSHACLConfig(this.projectId);
    const escapedName = name.replace(/"/g, '\\"');
    let typeFilter = "";

    if (typeUri) {
      if (includeTypes) {
        // Mode OpenRefine : pas de SHACL, on prend le typeUri tel quel
        typeFilter = `?x a <${typeUri}> .`;
      } else {
        // Mode simple reconciliation : on passe par SCHACLconfig
        const nodeShape = SCHACLconfig[typeUri];
        if (!nodeShape)
          throw new Error(`NodeShape non trouvé pour typeUri=${typeUri}`);
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
        { { ?x rdfs:label "${escapedName}"@en } UNION { ?x rdfs:label "${escapedName}"@fr } }
      }
      LIMIT ${this.maxResults}
    `;

    let bindings: any[] = [];

    return axios
      .get(
        `${this.sparqlEndpoint}?query=${encodeURIComponent(
          query1
        )}&format=json`,
        {
          timeout: 60000,
          family: 4,
        }
      )
      .then((response1) => {
        bindings = response1.data.results.bindings;

        if (bindings.length > 0) return bindings;

        // Query 2: SKOS properties with language tags (nouvelle requête)
        const query2 = `
          PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
          SELECT ?x WHERE {
            {
              { ?x skos:prefLabel|skos:altLabel|skos:notation "${escapedName}"@en }
              UNION
              { ?x skos:prefLabel|skos:altLabel|skos:notation "${escapedName}"@fr }
            }
          }
          LIMIT ${this.maxResults}
        `;

        return axios
          .get(
            `${this.sparqlEndpoint}?query=${encodeURIComponent(
              query2
            )}&format=json`,
            {
              timeout: 60000,
              family: 4,
            }
          )
          .then((response2) => {
            bindings = response2.data.results.bindings;

            if (bindings.length > 0) return bindings;

            // Query 3: Other properties without language tags (ancienne query2 sans SKOS)
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
              LIMIT ${this.maxResults}
            `;

            return axios
              .get(
                `${this.sparqlEndpoint}?query=${encodeURIComponent(
                  query3
                )}&format=json`,
                {
                  timeout: 60000,
                  family: 4,
                }
              )
              .then((response3) => response3.data.results.bindings);
          });
      })
      .then((bindingsFinal) => bindingsFinal.map((b: any) => b.x.value))
      .catch((err) => {
        console.error(`SPARQL request error for "${name}":`, err);
        return [];
      });
  }

  getEntityTypes(uri: string, sparqlEndpoint: string) {
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

    return axios
      .get(url, { timeout: 60000, family: 4 })
      .then((response) => {
        const bindings = response.data.results.bindings;

        if (bindings.length === 0)
          return [{ id: "http://www.w3.org/2002/07/owl#Thing", name: "Thing" }];

        return bindings.map((b: any) => ({
          id: b.type.value,
          name: b.label?.value || b.type.value.split("/").pop() || "Unknown",
        }));
      })
      .catch((err) => {
        console.error(`Error fetching types for ${uri}:`, err);
        return [{ id: "http://www.w3.org/2002/07/owl#Thing", name: "Thing" }];
      });
  }
}
