import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v3";
import type { ProjectConfigAdapter } from "../utils/projectConfigAdapter";

// This file centralizes registration of all MCP tools for the project.
interface RegisterToolsOptions {
  projectConfigAdapter: ProjectConfigAdapter;
  projectId: string;
}

// Registers the MCP tools used to inspect the schema, reconcile entities, and execute finalized SPARQL queries.
export function registerTools(
  server: McpServer,
  options: RegisterToolsOptions,
): void {
  const { projectConfigAdapter, projectId } = options;

  server.registerTool(
    "healthcheck",
    {
      title: "Healthcheck",
      description:
        "Returns a basic MCP server status for monitoring and debugging.",
      inputSchema: {},
    },
    async () => {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { ok: true, server: "sparnatural-mcp" },
              null,
              2,
            ),
          },
        ],
        structuredContent: {
          ok: true,
          server: "sparnatural-mcp",
        },
      };
    },
  );

  server.registerTool(
    "inspect_schema_shacl",
    {
      title: "Inspect Schema SHACL",
      description: `Step 1 of the query workflow for project '${projectId}'. Returns the full raw SHACL document and must be used first to inspect the complete schema structure, understand how shapes and properties are connected, and identify valid graph paths before any query construction.`,
      inputSchema: {},
    },
    async () => {
      try {
        const shacl = await projectConfigAdapter.readShacl(projectId);

        return {
          content: [
            {
              type: "text",
              text: shacl,
            },
          ],
          structuredContent: {
            projectId,
            shacl,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `inspect_schema_shacl failed: ${message}`,
            },
          ],
          structuredContent: {
            projectId,
            error: message,
          },
        };
      }
    },
  );

  server.registerTool(
    "discover_nodeshapes",
    {
      title: "Discover NodeShapes",
      description: `Step 2 of the query workflow for project '${projectId}'. Use this only after inspect_schema_shacl. Returns the SHACL NodeShapes, their targets, and their declared properties so the model can organize and confirm the relevant classes, entry points, and candidate predicates already identified from the raw SHACL schema.`,
      inputSchema: {},
    },
    async () => {
      try {
        const nodeshapes =
          await projectConfigAdapter.getShaclNodeShapes(projectId);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(nodeshapes, null, 2),
            },
          ],
          structuredContent: {
            projectId,
            nodeshapes,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `discover_nodeshapes failed: ${message}`,
            },
          ],
          structuredContent: {
            projectId,
            error: message,
          },
        };
      }
    },
  );

  server.registerTool(
    "reconcile_entities",
    {
      title: "Reconcile Entity Labels to IRIs",
      description: `Step 3 of the query workflow for project '${projectId}'. Use this only after inspect_schema_shacl and discover_nodeshapes, once the relevant classes, properties, and expected resource types are known. Reconciles user-provided entity labels (e.g. "Victor Hugo", "Paris") to candidate IRIs from the project knowledge graph before writing the final SPARQL query. The resolved IRI must then be injected directly into the SPARQL query produced in step 4 — do not match on rdfs:label once an entity has been reconciled.

How to call it correctly:
  - For EACH entity label the user mentioned, add one entry to 'queries' with BOTH 'query' (the label) AND 'type' (the class IRI of the entity, taken from the targetClass of the matching NodeShape discovered in step 2). Passing 'type' drastically improves precision and is expected whenever a class is known from the schema.
  - Use the 'id' of the top candidate (highest score, match=true) in the final SPARQL query.

CRITICAL — 'type' and 'includeTypes' are two unrelated parameters, do not confuse them:
  - 'type' (INSIDE each query object): a CLASS IRI that filters the reconciliation search to entities of that class. This is the one you should almost always set, based on discover_nodeshapes output.
  - 'includeTypes' (TOP-LEVEL boolean): only controls whether each returned candidate is enriched with its rdf:type metadata in the response. It does NOT filter anything. Leave it false by default; only set it to true if you explicitly need type info on the results themselves.`,
      inputSchema: {
        queries: z
          .record(
            z.object({
              query: z
                .string()
                .min(1)
                .describe(
                  "The entity label / name to reconcile, exactly as the user wrote it (e.g. 'Victor Hugo', 'Paris'). Do not paraphrase or translate.",
                ),
              type: z
                .string()
                .optional()
                .describe(
                  "Class IRI used to constrain the reconciliation search to entities of that class (e.g. 'http://xmlns.com/foaf/0.1/Person'). STRONGLY RECOMMENDED whenever the expected class is known: take it from the targetClass of the NodeShape identified via discover_nodeshapes. This is an INPUT filter on the search, not a flag to enrich the results.",
                ),
            }),
          )
          .describe(
            "A map of reconciliation keys to { query, type? } objects. One entry per label to resolve. Keys are arbitrary identifiers (e.g. 'author', 'city') used to match results back in the response.",
          ),
        includeTypes: z
          .boolean()
          .optional()
          .describe(
            "If true, enriches each returned candidate with its rdf:type metadata (id + name). This does NOT filter the search — use the per-query 'type' field for filtering. Defaults to false; only set to true when type metadata on the results is explicitly needed.",
          ),
      },
    },
    async ({ queries, includeTypes }) => {
      try {
        const result = await projectConfigAdapter.reconcileEntities(
          projectId,
          queries,
          includeTypes ?? false,
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
          structuredContent: {
            projectId,
            result,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `reconcile_entities failed: ${message}`,
            },
          ],
          structuredContent: {
            projectId,
            error: message,
          },
        };
      }
    },
  );

  server.registerTool(
    "execute_final_sparql",
    {
      title: "Execute Final SPARQL",
      description: `Step 4 of the query workflow for project '${projectId}'. Executes a finalized SPARQL query against the configured endpoint. Use this only after inspect_schema_shacl first, discover_nodeshapes second, and reconcile_entities when needed. The query must be schema-aware and grounded in the SHACL structure: prefer explicit rdf:type constraints when they are known from the schema, use DISTINCT when needed to avoid duplicate rows or overcounting, and prefer grouping by resources rather than labels alone when labels may be ambiguous. If an entity has already been reconciled to a specific IRI, use that IRI directly and do not add redundant label-based regex or text filters for the same entity, since this increases query cost without improving the result. Do not use this tool for schema exploration, property guessing, or trial-and-error query construction.`,
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe(
            "A finalized, schema-aware SPARQL query built after SHACL inspection, NodeShape discovery, and entity reconciliation when needed. Prefer explicit rdf:type constraints from the schema, use DISTINCT when appropriate, and avoid redundant regex or label filters when a target entity has already been resolved to an exact IRI.",
          ),
      },
    },
    async ({ query }) => {
      try {
        const result = await projectConfigAdapter.executeSparql(
          projectId,
          query,
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
          structuredContent: {
            projectId,
            result,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `execute_final_sparql failed: ${message}`,
            },
          ],
          structuredContent: {
            projectId,
            error: message,
          },
        };
      }
    },
  );
}
