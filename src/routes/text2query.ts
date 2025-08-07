import express from "express";
import { getJsonFromAgent } from "../services/agent";
import config from "../config/config";
import { logTextToQuery } from "../utils/logger";
import { EmptyRequestError } from "../errors/emptyRequestError";
import e from "express";

const router = express.Router({ mergeParams: true });

router.get("/", async (req: express.Request<{ projectKey: string }>, res) => {
  const { projectKey } = req.params;
  const { text } = req.query;

  if (!config.projects[projectKey]) {
    return res.status(404).json({ error: "Unknown project key" });
  }

  try {
    const jsonQuery = await getJsonFromAgent(text as string, projectKey);
    const parsed =
      typeof jsonQuery === "string" ? JSON.parse(jsonQuery) : jsonQuery;

    if (
      parsed.variables?.length === 0 &&
      parsed.branches?.length === 0 &&
      parsed.metadata?.explanation
    ) {
      return res.status(204).end(); // <-- ici 204 avec corps
    } else {
      await logTextToQuery({
        projectKey,
        text: text as string,
        query: parsed,
      });

      return res.json(parsed);
    }
  } catch (error: any) {
    console.error("Erreur dans text2query:", error?.message);

    if (error instanceof EmptyRequestError) {
      if (error instanceof EmptyRequestError) {
        return res.status(200).json({
          distinct: false,
          variables: [],
          order: null,
          branches: [],
          metadata: {
            explanation: error.message,
          },
        });
      }
    }

    return res
      .status(500)
      .json({ error: "Erreur de génération de la requête" });
  }
});

export default router;
