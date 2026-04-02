import express from "express";
import { EmptyRequestError } from "../errors/emptyRequestError";
import logger from "../utils/logger";
import { AppConfig } from "../config/AppConfig";
const router = express.Router({ mergeParams: true });
router.get("/", async (req: express.Request<{ projectKey: string }>, res) => {
  const { projectKey } = req.params;
  const { text, reconcile } = req.query;

  // Si reconcile=false → on skip la réconciliation
  const skipReconciliation = reconcile === "false";

  const logPayload = {
    endpoint: "text2query",
    method: req.method,
    projectKey,
    text,
    reconcile: !skipReconciliation,
    headers: req.headers,
    ip: req.ip,
  };
  AppConfig.getInstance()
    .getAppLogger()
    .getLogger("text2query")
    .info(logPayload, "API call started: text2query");
  logger.info(logPayload, "API call started: text2query");
  try {
    // utiliser le service text2query du projet
    const project = AppConfig.getInstance().getProject(projectKey);
    const service = project.text2queryService;
    const jsonQuery = await service.generateJson(
      text as string,
      skipReconciliation,
    );
    const parsed =
      typeof jsonQuery === "string" ? JSON.parse(jsonQuery) : jsonQuery;
    // no variables + explanation
    if (parsed.variables?.length === 0 && parsed.metadata?.explanation) {
      return res.status(200).json(parsed);
    }
    logger.info({ projectKey, text, parsed }, "Text converted to query");
    return res.json(parsed);
  } catch (error: any) {
    console.error("Erreur dans text2query:", error?.message);
    if (error instanceof EmptyRequestError) {
      // v13 empty response structure
      return res.status(200).json({
        type: "query",
        subType: "SELECT",
        variables: [],
        solutionModifiers: {},
        where: {
          type: "pattern",
          subType: "bgpSameSubject",
          subject: null,
          predicateObjectPairs: [],
        },
        metadata: {
          explanation: error.message,
        },
      });
    }
    return res.status(500).json({
      message: "Erreur de génération de la requête (" + error?.message + ")",
      error: error,
    });
  }
});
export default router;
