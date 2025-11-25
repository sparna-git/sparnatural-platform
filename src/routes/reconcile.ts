import express from "express";
import logger from "../utils/logger";
import { ConfigProvider } from "../config/ConfigProvider";
import { ReconcileServiceIfc } from "../services/ReconcileServiceIfc";
import { SparqlReconcileService } from "../services/SparqlReconcileService";

const router = express.Router({ mergeParams: true });

// --- POST / ---
router.post("/", async (req: express.Request<{ projectKey: string }>, res) => {
  const { projectKey } = req.params;

  logger.info(
    {
      endpoint: "reconcile",
      method: req.method,
      projectKey,
      query: req.query,
      body: req.body,
      headers: req.headers,
    },
    "API call started: reconciliation"
  );

  let config = ConfigProvider.getInstance().getConfig();

  try {
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
    queries = SparqlReconcileService.parseQueries(req.body);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }

  const includeTypes = req.query.includeTypes === "true";

  try {
    let service: ReconcileServiceIfc = new SparqlReconcileService(
      projectKey,
      SPARQL_ENDPOINT
    );
    const responsePayload = await service.reconcileQueries(
      queries,
      includeTypes
    );
    return res.json(responsePayload);
  } catch (err) {
    console.error("Reconciliation error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// --- GET / --- retourne le manifest
router.get("/", async (req: express.Request<{ projectKey: string }>, res) => {
  const { projectKey } = req.params;

  let config = ConfigProvider.getInstance().getConfig();

  try {
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

  let service: ReconcileServiceIfc = new SparqlReconcileService(
    projectKey,
    SPARQL_ENDPOINT
  );
  const manifest = await service.buildManifest();
  return res.json(manifest);
});

export default router;
