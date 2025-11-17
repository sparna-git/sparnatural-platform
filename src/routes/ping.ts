import express from "express";
import { ConfigProvider } from "../config/ConfigProvider";

const router = express.Router({ mergeParams: true });

router.get("/", async (req: express.Request<{ projectKey: string }>, res) => {
  const { projectKey } = req.params;

  let config = ConfigProvider.getInstance().getConfig();

  if (!config.projects[projectKey]) {
    return res.status(404).json({ error: "Unknown project key" });
  }

  return res.json("Project " + projectKey + " is reachable.");
});

export default router;
