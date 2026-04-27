import fs from "fs";
import path from "path";

import {
  RdfStoreReader,
  ShaclModel,
  ShaclSparqlPostProcessor,
} from "rdf-shacl-commons";

import { ConfigProvider } from "./ConfigProvider";

const SHACL_CACHE: Record<
  string,
  { model: ShaclModel; postProcessor: ShaclSparqlPostProcessor; ttl: string }
> = {};

const SHACL_TTL_CACHE: Record<string, { ttl: string; firstPath: string }> = {};

type ShaclConfigKey = "shacl" | "shaclmcp";

function loadShaclTtlByKey(
  projectKey: string,
  configKey: ShaclConfigKey,
): { ttl: string; firstPath: string } {
  const cacheKey = `${projectKey}:${configKey}`;
  if (SHACL_TTL_CACHE[cacheKey]) {
    return SHACL_TTL_CACHE[cacheKey];
  }

  const shaclConfig =
    ConfigProvider.getInstance().getConfig().projects[projectKey]?.[configKey];

  if (!shaclConfig) {
    throw new Error(
      `Aucun fichier SHACL configuré pour le projet '${projectKey}' (clé '${configKey}')`,
    );
  }

  const shaclPaths: string[] = Array.isArray(shaclConfig)
    ? shaclConfig
    : shaclConfig.split(/\s+/).filter(Boolean);

  let ttl = "";
  for (const filePath of shaclPaths) {
    const absolutePath = path.join(__dirname, "../../", filePath.trim());
    console.log(`[SHACL] Lecture du fichier (${configKey}) : ${absolutePath}`);
    ttl += fs.readFileSync(absolutePath, "utf8") + "\n";
  }

  console.log(
    `[SHACL] ${shaclPaths.length} fichier(s) chargé(s) pour '${configKey}'`,
  );

  const entry = { ttl, firstPath: shaclPaths[0] };
  SHACL_TTL_CACHE[cacheKey] = entry;
  return entry;
}

export function loadShaclTtl(projectKey: string) {
  return loadShaclTtlByKey(projectKey, "shacl");
}

export function loadShaclMcpTtl(projectKey: string) {
  return loadShaclTtlByKey(projectKey, "shaclmcp");
}

export async function getSHACLConfig(
  projectKey: string,
  configKey: ShaclConfigKey = "shacl",
) {
  const cacheKey = `${projectKey}:${configKey}`;
  if (SHACL_CACHE[cacheKey]) {
    return SHACL_CACHE[cacheKey];
  }

  const { ttl: ttlContent, firstPath } = loadShaclTtlByKey(projectKey, configKey);

  const store: any = await new Promise((resolve) => {
    RdfStoreReader.buildStoreFromString(ttlContent, firstPath, resolve);
  });

  ShaclModel.skolemizeAnonymousPropertyShapes(store);

  const shaclModel = new ShaclModel(store as any);
  const postProcessor = new ShaclSparqlPostProcessor(shaclModel);

  SHACL_CACHE[cacheKey] = { model: shaclModel, postProcessor, ttl: ttlContent };

  console.log(
    `[SHACL] Modèle SHACL construit (${configKey}) : ${store.countQuads(null, null, null, null)} triples`,
  );

  return SHACL_CACHE[cacheKey];
}
