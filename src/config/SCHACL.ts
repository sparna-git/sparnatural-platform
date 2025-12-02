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
    console.log(`[SHACL] ⚡ Cache hit → ${projectKey}`);
    return SHACL_CACHE[projectKey];
  }

  const shaclFilePath =
    ConfigProvider.getInstance().getConfig().projects[projectKey]?.shaclFile;

  if (!shaclFilePath) {
    throw new Error(
      `Aucun fichier SHACL configuré pour le projet '${projectKey}'`
    );
  }

  const absolutePath = path.join(__dirname, "../../", shaclFilePath);
  console.log(`[SHACL] 📥 Lecture du fichier SHACL : ${absolutePath}`);

  const ttlContent = fs.readFileSync(absolutePath, "utf8");

  // 1) Construire le store RDF (type laissé en ANY)
  const store: any = await new Promise((resolve) => {
    RdfStoreReader.buildStoreFromString(ttlContent, absolutePath, resolve);
  });

  // 2) Skolemisation
  ShaclModel.skolemizeAnonymousPropertyShapes(store);

  // 3) Construire le modèle SHACL
  const shaclModel = new ShaclModel(store as any);

  // 4) Post-processor SPARQL
  const postProcessor = new ShaclSparqlPostProcessor(shaclModel);

  SHACL_CACHE[projectKey] = { model: shaclModel, postProcessor };

  console.log(
    `[SHACL] ✅ Modèle SHACL construit (${store.countQuads(
      null,
      null,
      null,
      null
    )} triples)`
  );

  return SHACL_CACHE[projectKey];
}
