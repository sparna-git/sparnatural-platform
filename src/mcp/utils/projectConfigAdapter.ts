import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import { ConfigProvider } from "../../config/ConfigProvider";
import { AppConfig } from "../../config/AppConfig";

import { getSHACLConfig, loadShaclTtl } from "../../config/SCHACL";
import { extractNodeShapes, type NodeShapeInfo } from "./shaclParser";
import type {
  ReconcileInput,
  ReconcileOutput,
} from "../../services/ReconcileServiceIfc";

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
  readShacl(projectId: string): Promise<string>;
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

  async readShacl(projectId: string): Promise<string> {
    // ensure the project exists (and surfaces a clearer error than loadShaclTtl)
    await this.getProjectConfig(projectId);
    return loadShaclTtl(projectId).ttl;
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
    lang = "en",
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
    const project = AppConfig.getInstance().getProject(projectId);
    return project.reconcileService.reconcileQueries(queries, includeTypes);
  }
}

/**
 * Simple file-based adapter for standalone usage without the full platform config.
 */
export class FileBasedProjectConfigAdapter implements ProjectConfigAdapter {
  constructor(private readonly baseConfigDir: string) {}

  async getProjectConfig(projectId: string): Promise<ProjectConfig> {
    const projectDir = path.join(this.baseConfigDir, projectId);
    const endpointFile = path.join(projectDir, "endpoint.txt");

    let sparqlEndpoint: string;
    try {
      sparqlEndpoint = fs.readFileSync(endpointFile, "utf-8").trim();
    } catch {
      throw new Error(
        `Unable to resolve SPARQL endpoint for project '${projectId}'.`,
      );
    }

    return {
      projectId,
      sparqlEndpoint,
      shaclPath: path.join(projectDir, "shacl.ttl"),
    };
  }

  async readShacl(projectId: string): Promise<string> {
    const config = await this.getProjectConfig(projectId);
    if (!config.shaclPath) {
      throw new Error(`No SHACL path configured for project '${projectId}'.`);
    }
    return fs.readFileSync(config.shaclPath, "utf-8");
  }

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

  async getShaclNodeShapes(
    _projectId: string,
    _lang = "en",
  ): Promise<NodeShapeInfo[]> {
    throw new Error(
      "getShaclNodeShapes is not supported by FileBasedProjectConfigAdapter. Use ConfigBackedProjectConfigAdapter.",
    );
  }

  async reconcileEntities(
    _projectId: string,
    _queries: ReconcileInput,
    _includeTypes = false,
  ): Promise<ReconcileOutput> {
    throw new Error(
      "reconcileEntities is not supported by FileBasedProjectConfigAdapter. Use ConfigBackedProjectConfigAdapter.",
    );
  }
}
