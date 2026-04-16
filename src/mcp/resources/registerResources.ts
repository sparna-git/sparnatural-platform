import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ProjectConfigAdapter } from "../utils/projectConfigAdapter";

// this file centralize all ressources that will be provided by the mcp server
interface RegisterResourcesOptions {
  projectConfigAdapter: ProjectConfigAdapter;
  projectId: string;
}

export function registerResources(
  server: McpServer,
  options: RegisterResourcesOptions,
): void {
  const { projectConfigAdapter, projectId } = options;

  // expose the shacl file as resource to add it on the conversation context
  /*
  server.registerResource(
    "raw-shacl",
    `shacl://${projectId}/raw`,
    {
      title: "Raw SHACL",
      description: `Raw Turtle SHACL specification for project '${projectId}'.`,
      mimeType: "text/turtle",
    },
    async (uri) => {
      try {
        // projectConfigAdatpter
        const shacl = await projectConfigAdapter.readShacl(projectId);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/turtle",
              text: shacl,
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/plain",
              text: `Failed to read SHACL for project '${projectId}': ${message}`,
            },
          ],
        };
      }
    },
  );*/
}
