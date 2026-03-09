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
  { model: ShaclModel; postProcessor: ShaclSparqlPostProcessor }
> = {};

export async function getSHACLConfig(projectKey: string) {
  if (SHACL_CACHE[projectKey]) {
    return SHACL_CACHE[projectKey];
  }

  const shaclConfig =
    ConfigProvider.getInstance().getConfig().projects[projectKey]?.shacl;

  if (!shaclConfig) {
    throw new Error(
      `Aucun fichier SHACL configuré pour le projet '${projectKey}'`,
    );
  }

  // Support un seul fichier (string) ou plusieurs (array / séparés par des espaces)
  const shaclPaths: string[] = Array.isArray(shaclConfig)
    ? shaclConfig
    : shaclConfig.split(/\s+/).filter(Boolean);

  // Lire et concaténer tous les fichiers
  let ttlContent = "";
  for (const filePath of shaclPaths) {
    const absolutePath = path.join(__dirname, "../../", filePath.trim());
    console.log(`[SHACL] Lecture du fichier SHACL : ${absolutePath}`);
    ttlContent += fs.readFileSync(absolutePath, "utf8") + "\n";
  }

  console.log(`[SHACL] ${shaclPaths.length} fichier(s) SHACL chargé(s)`);

  // 1) Construire le store RDF (type laissé en ANY)
  const store: any = await new Promise((resolve) => {
    RdfStoreReader.buildStoreFromString(ttlContent, shaclPaths[0], resolve);
  });

  // 2) Skolemisation
  ShaclModel.skolemizeAnonymousPropertyShapes(store);

  // 3) Construire le modèle SHACL
  const shaclModel = new ShaclModel(store as any);

  // 4) Post-processor SPARQL
  const postProcessor = new ShaclSparqlPostProcessor(shaclModel);

  SHACL_CACHE[projectKey] = { model: shaclModel, postProcessor };

  console.log(
    `[SHACL] Modèle SHACL construit (${store.countQuads(
      null,
      null,
      null,
      null,
    )} triples)`,
  );

  return SHACL_CACHE[projectKey];
}
