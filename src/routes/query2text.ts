import express from "express";
import { getSummaryFromAgent } from "../services/agent";
import config from "../config/config";
import { logQueryToText } from "../utils/logBusiness"; // <-- on utilise la nouvelle fonction unifiée

const router = express.Router({ mergeParams: true });

router.get("/", async (req: express.Request<{ projectKey: string }>, res) => {
  const { projectKey } = req.params;
  const { query, lang } = req.query;

  if (!config.projects[projectKey]) {
    return res.status(404).json({ error: "Unknown project key" });
  }

  let summary = "Résumé simulé pour développement.";
  try {
    const jsonQuery = JSON.parse(query as string);
    summary = await getSummaryFromAgent(jsonQuery, lang as string);
    await logQueryToText({
      projectKey,
      query: JSON.stringify(jsonQuery),
      text: summary,
    });
  } catch (e) {
    summary = "Erreur de parsing ou d’appel à l’agent.";
  }

  return res.json({
    text: summary,
  });
});

export default router;
