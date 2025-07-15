// src/middleware/checkDomainMiddleware.ts
import { Request, Response, NextFunction } from "express";
import path from "path";
const fs = require("fs");
const yaml = require("js-yaml");

const config = yaml.load(
  fs.readFileSync(path.join(__dirname, "../../config/config.yaml"), "utf8")
);

export function checkDomainMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const referer = req.get("referer");
  const userAgent = req.get("user-agent");
  const projectKey = req.params.projectKey;

  // Autorise toujours les requêtes depuis services.sparnatural.eu
  if (referer && referer.includes("services.sparnatural.eu")) {
    return next();
  }

  // Autorise les requêtes venant d’un navigateur (Mozilla dans User-Agent)
  if (userAgent && userAgent.includes("Mozilla")) {
    return next();
  }

  const project = config.projects?.[projectKey];

  if (!project) {
    console.warn(`[SECURITY] Project '${projectKey}' not found in config`);
    return res.status(500).send("Invalid project");
  }

  const allowedDomains: string[] = project.domains || [];

  if (!referer) {
    console.warn(
      `[SECURITY] Missing Referer header for project '${projectKey}'`
    );
    return res.status(500).send("Invalid incoming domain");
  }

  try {
    const refererDomain = new URL(referer).hostname;

    if (!allowedDomains.includes(refererDomain)) {
      console.warn(
        `[SECURITY] Unauthorized domain '${refererDomain}' for project '${projectKey}'`
      );
      return res.status(500).send("Invalid incoming domain");
    }
  } catch (err) {
    console.error(`[SECURITY] Error parsing Referer '${referer}':`, err);
    return res.status(500).send("Invalid incoming domain");
  }

  next();
}
