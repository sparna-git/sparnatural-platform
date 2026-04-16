import axios from "axios";
import { ConfigProvider } from "../../config/ConfigProvider";
import { AppConfig } from "../../config/AppConfig";

import { getSHACLConfig, loadShaclTtl } from "../../config/SCHACL";
import { extractNodeShapes, type NodeShapeInfo } from "./shaclParser";
import type {
  ReconcileInput,
  ReconcileOutput,
} from "../../services/ReconcileServiceIfc";
import { getIsidoreSuggestLabels } from "../../services/IsidoreApiReconcileService";

export interface ProjectConfig {
  projectId: string;
  sparqlEndpoint: string;
  shaclPath?: string;
}

/**
 * Adapter contract used by the MCP layer.
 */
export interface ProjectConfigAdapter {
  getProjectConfig(projectId: string): Promise<ProjectConfig>;
  executeSparql(projectId: string, query: string): Promise<unknown>;
  getShaclNodeShapes(
    projectId: string,
    lang?: string,
  ): Promise<NodeShapeInfo[]>;
  reconcileEntities(
    projectId: string,
    queries: ReconcileInput,
    includeTypes?: boolean,
  ): Promise<ReconcileOutput>;
}

/**
 * Adapter that reads project configuration from the existing
 * ConfigProvider (YAML-based) used by the rest of sparnatural-platform.
 */
export class ConfigBackedProjectConfigAdapter implements ProjectConfigAdapter {
  async getProjectConfig(projectId: string): Promise<ProjectConfig> {
    const config = ConfigProvider.getInstance().getConfig();
    const projectConfig = config.projects?.[projectId];

    if (!projectConfig) {
      throw new Error(
        `Unknown project '${projectId}'. Available projects: ${Object.keys(config.projects ?? {}).join(", ")}`,
      );
    }

    if (!projectConfig.sparqlEndpoint) {
      throw new Error(
        `No sparqlEndpoint configured for project '${projectId}'.`,
      );
    }

    return {
      projectId,
      sparqlEndpoint: projectConfig.sparqlEndpoint,
      shaclPath: projectConfig.shacl,
    };
  }

  // For simplicity, this method directly executes the SPARQL query against the endpoint.
  async executeSparql(projectId: string, query: string): Promise<unknown> {
    const config = await this.getProjectConfig(projectId);

    const response = await axios({
      method: "POST",
      url: config.sparqlEndpoint,
      headers: {
        Accept: "application/sparql-results+json, application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      data: new URLSearchParams({ query }),
    });

    return response.data;
  }

  // get NodeShapes from the SHACL file
  async getShaclNodeShapes(
    projectId: string,
    lang = "fr",
  ): Promise<NodeShapeInfo[]> {
    // ensure project exists
    await this.getProjectConfig(projectId);
    const { model } = await getSHACLConfig(projectId);
    return extractNodeShapes(model, lang);
  }

  // Reconcile entity labels to IRIs using the project's configured reconcile service.
  async reconcileEntities(
    projectId: string,
    queries: ReconcileInput,
    includeTypes = false,
  ): Promise<ReconcileOutput> {
    // ensure project exists
    await this.getProjectConfig(projectId);

    // For the isidore project, try the ISIDORE suggest API first (faster,
    // handles accents/case). Fall back to SPARQL reconciliation per query
    // if the API returns no candidates.
    if (projectId === "isidore") {
      return this._reconcileViaIsidoreApi(projectId, queries, includeTypes);
    }

    const project = AppConfig.getInstance().getProject(projectId);
    return project.reconcileService.reconcileQueries(queries, includeTypes);
  }

  private async _reconcileViaIsidoreApi(
    projectId: string,
    queries: ReconcileInput,
    includeTypes: boolean,
  ): Promise<ReconcileOutput> {
    const responsePayload: ReconcileOutput = {};
    const project = AppConfig.getInstance().getProject(projectId);

    for (const [key, qobj] of Object.entries(queries)) {
      // --- Step 1: ask ISIDORE suggest for normalized label candidates ---
      // ISIDORE handles accents (é, è…) and case insensitivity natively.
      const labels = await getIsidoreSuggestLabels(qobj.query);

      if (labels.length === 0) {
        // ISIDORE returned nothing → fall back to the existing SPARQL service
        console.log(
          `[isidore-api] No suggestions for "${qobj.query}", falling back to SPARQL.`,
        );
        const fallback = await project.reconcileService.reconcileQueries(
          { [key]: qobj },
          includeTypes,
        );
        responsePayload[key] = fallback[key] ?? { result: [] };
        continue;
      }

      // --- Step 2: resolve each normalized label to a URI via SPARQL ---
      // We pass the exact label strings (correctly cased / accented) to the
      // existing SPARQL reconcile service, which does an exact-match lookup.
      // This is much more reliable than the original fuzzy LCASE() approach.
      const labelQueries: ReconcileInput = {};
      labels.forEach((label, i) => {
        labelQueries[`${key}_${i}`] = { query: label, type: qobj.type };
      });

      const sparqlResults = await project.reconcileService.reconcileQueries(
        labelQueries,
        includeTypes,
      );

      // Collect unique URIs (different labels may resolve to the same entity)
      const seen = new Set<string>();
      const allResults = Object.values(sparqlResults)
        .flatMap((r) => r.result)
        .filter((r) => {
          if (seen.has(r.id)) return false;
          seen.add(r.id);
          return true;
        });

      if (allResults.length === 0) {
        // ISIDORE gave labels but none resolved to a URI in the SPARQL endpoint
        // → fall back to the original SPARQL query on the raw user input
        console.log(
          `[isidore-api] Labels found by ISIDORE but no SPARQL match — falling back.`,
        );
        const fallback = await project.reconcileService.reconcileQueries(
          { [key]: qobj },
          includeTypes,
        );
        responsePayload[key] = fallback[key] ?? { result: [] };
      } else if (allResults.length === 1) {
        // Unambiguous: single URI found
        responsePayload[key] = {
          result: [{ ...allResults[0], score: 100, match: true }],
        };
      } else {
        // Ambiguous: multiple URIs — return all with match:false so the LLM
        // presents the options to the user and waits for their choice.
        responsePayload[key] = {
          result: allResults.map((r, i) => ({
            ...r,
            score: 90 - i,
            match: false,
          })),
        };
      }
    }

    return responsePayload;
  }
}
