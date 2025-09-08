import express from "express";
import config from "../config/config";
import {
  reconcileQueries,
  buildManifest,
  parseQueries,
} from "../services/reconciliation";

const router = express.Router();

// --- POST / ---
router.post("/", async (req, res) => {
  let projectKey: string;
  try {
    projectKey = req.baseUrl.split("/")[3];
    if (!projectKey || !config.projects[projectKey]) {
      return res
        .status(400)
        .json({ error: `Unknown projectKey: ${projectKey}` });
    }
  } catch {
    return res.status(400).json({ error: "Invalid projectKey" });
  }

  const SPARQL_ENDPOINT = config.projects[projectKey].sparqlEndpoint;
  if (!SPARQL_ENDPOINT)
    return res.status(500).json({ error: "SPARQL endpoint not configured" });

  let queries;
  try {
    queries = parseQueries(req.body);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }

  const includeTypes = req.query.includeTypes === "true";

  try {
    const responsePayload = await reconcileQueries(
      queries,
      SPARQL_ENDPOINT,
      projectKey,
      includeTypes
    );
    return res.json(responsePayload);
  } catch (err) {
    console.error("Reconciliation error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// --- GET / --- retourne le manifest
router.get("/", async (req, res) => {
  let projectKey: string;
  try {
    projectKey = req.baseUrl.split("/")[3];
    if (!projectKey || !config.projects[projectKey]) {
      return res
        .status(400)
        .json({ error: `Unknown projectKey: ${projectKey}` });
    }
  } catch {
    return res.status(400).json({ error: "Invalid projectKey" });
  }

  const SPARQL_ENDPOINT = config.projects[projectKey].sparqlEndpoint;
  if (!SPARQL_ENDPOINT)
    return res.status(500).json({ error: "SPARQL endpoint not configured" });

  const manifest = await buildManifest(projectKey, SPARQL_ENDPOINT);
  return res.json(manifest);
});

export default router;
