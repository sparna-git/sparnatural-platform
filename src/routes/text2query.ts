import express from "express";
import fs from "fs";
import path from "path";
import { getJsonFromAgent } from "../services/agent";
import { BadRequestError } from "../errors/BadRequestError";
import config from "./config";
const yaml = require("js-yaml");

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

    return res.json(parsed);
  } catch (error: any) {
    console.error("Erreur dans text2query:", error?.message);

    if (error instanceof BadRequestError) {
      return res.status(400).json({ error: error.message });
    }

    return res
      .status(500)
      .json({ error: "Erreur de génération de la requête JSON" });
  }
});

export default router;
