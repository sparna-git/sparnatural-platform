import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v3";
import type { ProjectConfigAdapter } from "../utils/projectConfigAdapter";

// This file centralizes all MCP prompts exposed by the server.
interface RegisterPromptsOptions {
  projectConfigAdapter: ProjectConfigAdapter;
  projectId: string;
}

// Example of a workflow prompt that guides the model through a structured process
export function registerPrompts(
  server: McpServer,
  options: RegisterPromptsOptions,
): void {
  const { projectConfigAdapter, projectId } = options;

  server.registerPrompt(
    "sparql-query-guide",
    {
      title: "SPARQL Query Guide",
      description:
        "Guides the model to answer a user data request by first exploring the SHACL schema, then identifying relevant NodeShapes, classes, and properties, and only finally executing a completed SPARQL query.",
      argsSchema: {
        user_question: z
          .string()
          .min(1)
          .describe(
            "The end-user request that must be answered by exploring the schema first and executing a final SPARQL query only when the query structure is well identified.",
          ),
      },
    },
    async ({ user_question }) => {
      console.error("[MCP] prompt sparql-query-guide called", {
        projectId,
        user_question,
      });

      const { sparqlEndpoint } =
        await projectConfigAdapter.getProjectConfig(projectId);

      return {
        description:
          "A workflow prompt for schema-first SPARQL generation and execution.",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `You are working on project "${projectId}".

              The user request is:
              "${user_question}"

              SPARQL endpoint:
              ${sparqlEndpoint}

              You must follow this workflow strictly:

              Step 1 — Discover the relevant NodeShapes
              Use discover_nodeshapes to retrieve the SHACL NodeShapes, their targets, and their declared properties. Organize and confirm the relevant classes, entry points, and candidate predicates related to the user request.

              Step 2 — Resolve entities to IRIs if needed
              If the user request contains named entities (persons, places, organizations, concepts, resources), use reconcile_entities to resolve them to IRIs. Pass the 'type' from the targetClass of the matching NodeShape discovered in step 1.

              Step 3 — Build and execute the final SPARQL query
              Construct a valid SPARQL query using the schema structure, the confirmed NodeShapes, and the reconciled IRIs when needed.
              Use execute_final_sparql only once the query is complete, valid, and aligned with the schema.

              Important rules:
              - You must start with discover_nodeshapes.
              - Do not guess classes, predicates, or graph paths without checking the schema.
              - Do not use execute_final_sparql for trial-and-error.
              - Use reconcile_entities only after discover_nodeshapes and only when named entities need to be resolved.

              Your goal is to answer the user request with a schema-aware, well-structured, and valid SPARQL query process.`,
            },
          },
        ],
      };
    },
  );
}
