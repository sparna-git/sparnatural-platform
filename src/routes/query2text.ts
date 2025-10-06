import express from "express";
import { getSummaryFromAgent } from "../services/agent";
import config from "../config/config";
import logger from "../utils/logger";

const router = express.Router({ mergeParams: true });

router.get("/", async (req: express.Request<{ projectKey: string }>, res) => {
  const { projectKey } = req.params;
  const { query, lang } = req.query;

  logger.info(
    {
      endpoint: "query2text",
      method: req.method,
      projectKey,
      query,
      headers: req.headers,
    },
    "API call started: query2text"
  );

  if (!config.projects[projectKey]) {
    return res.status(404).json({ error: "Unknown project key" });
  }

  let summary = "Résumé simulé pour développement.";
  try {
    const jsonQuery = JSON.parse(query as string);
    summary = await getSummaryFromAgent(jsonQuery, lang as string, projectKey);
    logger.info({ projectKey, query, summary }, "SPARQL converted to text");
  } catch (e) {
    summary = "Erreur de parsing ou d’appel à l’agent.";
  }

  return res.json({
    text: summary,
  });
});

export default router;
