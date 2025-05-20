import express from "express";
import fs from "fs";
import path from "path";
import { getSummaryFromAgent } from "../services/agent";
const yaml = require("js-yaml");

const router = express.Router({ mergeParams: true });

const configPath = path.join(__dirname, "../../config/config.yaml");
const config = yaml.load(fs.readFileSync(configPath, "utf8")) as any;

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
  } catch (e) {
    summary = "Erreur de parsing ou d’appel à l’agent.";
  }

  return res.json({
    text: summary,
  });
});

export default router;
