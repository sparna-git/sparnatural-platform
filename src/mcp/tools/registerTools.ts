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
  /*
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
  */

  // The following tools require discover_nodeshapes to be called first to inspect the schema and identify relevant NodeShapes, classes, and properties. This is necessary to use them correctly and avoid imprecise results or errors.
  server.registerTool(
    "discover_nodeshapes",
    {
      title: "Discover NodeShapes",
      description: `MANDATORY first step of the query workflow for project '${projectId}'. You MUST call this before reconcile_entities and execute_final_sparql. Returns the SHACL NodeShapes, their targets, and their declared properties.`,
      inputSchema: {},
      outputSchema: {
        projectId: z.string().describe("The project identifier."),
        nodeshapes: z
          .array(
            z.object({
              shapeIri: z.string().describe("IRI of this NodeShape."),
              label: z
                .string()
                .optional()
                .describe("Human-readable label of the shape."),
              description: z
                .string()
                .optional()
                .describe(
                  "Human-readable explanation of what this shape represents.",
                ),
              agentInstruction: z
                .string()
                .optional()
                .describe(
                  "Specific instructions for the agent on how to use this shape in queries.",
                ),
              targetClasses: z
                .array(z.string())
                .describe(
                  "The rdf:type IRIs of instances described by this NodeShape. Use them as rdf:type constraints in SPARQL queries.",
                ),
              targetSparql: z
                .array(z.string())
                .optional()
                .describe("SPARQL-based target definitions, if any."),
              properties: z
                .array(
                  z.object({
                    path: z
                      .string()
                      .optional()
                      .describe("The predicate IRI to use in triple patterns."),
                    name: z
                      .string()
                      .optional()
                      .describe("Human-readable name of the property."),
                    description: z
                      .string()
                      .optional()
                      .describe(
                        "Human-readable explanation of what this property represents.",
                      ),
                    agentInstruction: z
                      .string()
                      .optional()
                      .describe(
                        "Specific instructions for the agent on how to use this property in queries.",
                      ),
                    minCount: z
                      .number()
                      .optional()
                      .describe(
                        "Minimum cardinality. If >= 1 the property is always present on every instance — do NOT use OPTIONAL. If absent or 0, the property may be missing — use OPTIONAL to avoid losing results.",
                      ),
                    maxCount: z
                      .number()
                      .optional()
                      .describe(
                        "Maximum cardinality. If 1, expect a single value per instance.",
                      ),
                    classes: z
                      .array(z.string())
                      .optional()
                      .describe(
                        "When present, this is an object property pointing to instances of these classes. Follow the link to the corresponding NodeShape to discover further predicates.",
                      ),
                    datatypes: z
                      .array(z.string())
                      .optional()
                      .describe(
                        "When present, this is a datatype property holding literal values of this XSD/RDF datatype.",
                      ),
                    values: z
                      .array(z.string())
                      .optional()
                      .describe(
                        "Closed list of allowed values (sh:in). The property can ONLY have one of these values — use them in VALUES or FILTER constraints. Do NOT query for values outside this list.",
                      ),
                  }),
                )
                .describe("The declared properties of this NodeShape."),
            }),
          )
          .describe("The list of all NodeShapes in the schema."),
      },
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

  // reconcile_entities tool used to resolve user-provided labels to IRIs from the knowledge graph.
  server.registerTool(
    "reconcile_entities",
    {
      title: "Reconcile Entity Labels to IRIs",
      description: `Step 2 of the query workflow for project '${projectId}'. REQUIRES discover_nodeshapes first — without it, the 'type' parameter cannot be set correctly and results will be imprecise or wrong. Reconciles user-provided entity labels to candidate IRIs from the project knowledge graph. The resolved IRI must then be injected directly into the SPARQL query produced in step 3 — do not match on rdfs:label once an entity has been reconciled.

      How to call it correctly:
        - For EACH entity label the user mentioned, add one entry to 'queries' with BOTH 'query' (the label) AND 'type' (the class IRI of the entity, taken from the targetClass of the matching NodeShape discovered in step 1). Passing 'type' improves precision and is expected whenever a class is known from the schema.
        - When all returned candidates have match: false, present the full list to the user (name + id) and ask them to choose. Only proceed to the SPARQL query once the user has confirmed their choice.`,
      inputSchema: {
        queries: z
          .record(
            z.object({
              query: z
                .string()
                .min(1)
                .describe(
                  "The entity label / name to reconcile, exactly as the user wrote it. Do not paraphrase or translate.",
                ),
              type: z
                .string()
                .optional()
                .describe(
                  "Class IRI used to constrain the reconciliation search to entities of that class. STRONGLY RECOMMENDED whenever the expected class is known: take it from the targetClass of the NodeShape identified via discover_nodeshapes. This is an INPUT filter on the search, not a flag to enrich the results.",
                ),
            }),
          )
          .describe(
            "A map of reconciliation keys to { query, type? } objects. One entry per label to resolve. Keys are arbitrary identifiers (e.g. 'author', 'city') used to match results back in the response.",
          ),
      },
    },
    async ({ queries }) => {
      try {
        const result = await projectConfigAdapter.reconcileEntities(
          projectId,
          queries,
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

  // execute_final_sparql tool used to execute the finalized SPARQL query after schema inspection and entity reconciliation.
  server.registerTool(
    "execute_final_sparql",
    {
      title: "Execute Final SPARQL",
      description: `Step 3 of the query workflow for project '${projectId}'. REQUIRES discover_nodeshapes first — queries built without inspecting the schema will fail or return incorrect results because class URIs, predicates, and graph paths are not guessable. Executes a finalized SPARQL query against the configured endpoint. The query must be schema-aware and grounded in the SHACL structure: prefer explicit rdf:type constraints when they are known from the schema, use DISTINCT when needed to avoid duplicate rows or overcounting, and prefer grouping by resources rather than labels alone when labels may be ambiguous. If an entity has already been reconciled to a specific IRI, use that IRI directly and do not add redundant label-based regex or text filters for the same entity. Do not use this tool for schema exploration, property guessing, or trial-and-error query construction. Do not add FILTER(lang(...)) constraints unless the user explicitly requests a specific language. Always include a LIMIT clause in the query. Start with LIMIT 20 and present the results to the user. If the user wants more, increase progressively (e.g. 100, 500).`,
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe(
            "A finalized, schema-aware SPARQL query built after NodeShape discovery and entity reconciliation when needed. Prefer explicit rdf:type constraints from the schema, use DISTINCT when appropriate, and avoid redundant regex or label filters when a target entity has already been resolved to an exact IRI.",
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
