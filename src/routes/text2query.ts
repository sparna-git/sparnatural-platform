import express from "express";
import { EmptyRequestError } from "../errors/emptyRequestError";
import logger from "../utils/logger";
import { ConfigProvider } from "../config/ConfigProvider";
import { MistralText2QueryService } from "../services/impl/mistralText2QueryService";

const router = express.Router({ mergeParams: true });

router.get("/", async (req: express.Request<{ projectKey: string }>, res) => {
  const { projectKey } = req.params;
  const { text } = req.query;

  // Log au début de l'appel API
  logger.info(
    {
      endpoint: "text2query",
      method: req.method,
      projectKey,
      text,
      headers: req.headers,
      ip: req.ip,
    },
    "API call started: text2query"
  );

  let config = ConfigProvider.getInstance().getConfig();

  if (!config.projects[projectKey]) {
    return res.status(404).json({ error: "Unknown project key" });
  }

  try {
    // utiliser le service via la fabrique
    const service = new MistralText2QueryService();
    const jsonQuery = await service.generateJson(text as string, projectKey);
    const parsed =
      typeof jsonQuery === "string" ? JSON.parse(jsonQuery) : jsonQuery;

    if (
      parsed.variables?.length === 0 &&
      parsed.branches?.length === 0 &&
      parsed.metadata?.explanation
    ) {
      return res.status(204).json(parsed); // <-- ici 204 avec corps
    } else {
      logger.info({ projectKey, text, parsed }, "Text converted to SPARQL");

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

    return res.status(500).json({
      message: "Erreur de génération de la requête (" + error?.message + ")",
      error: error,
    });
  }
});

export default router;
