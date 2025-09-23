// src/config/SHACL.ts
import fs from "fs";
import path from "path";
import { Parser } from "n3";
import config from "./config";

// Cache en mémoire pour les configurations SHACL
const SHACL_CACHE: Record<string, Record<string, any>> = {};

export function getSHACLConfig(projectKey: string): Record<string, any> {
  // Si la config est déjà en cache
  if (SHACL_CACHE[projectKey]) {
    console.log(
      `[SHACL] ✅ Configuration chargée depuis le cache pour ${projectKey}`
    );
    return SHACL_CACHE[projectKey];
  }

  // Sinon, on la charge depuis le fichier
  const shaclFilePath = config.projects[projectKey]?.shaclFile;
  if (!shaclFilePath) {
    throw new Error(
      `Aucun fichier SHACL configuré pour le projet ${projectKey}`
    );
  }

  const absolutePath = path.join(__dirname, "../../", shaclFilePath);
  console.log(
    `[SHACL] 📖 Lecture du fichier pour ${projectKey}: ${absolutePath}`
  );

  // Lire et parser le fichier Turtle
  const ttl = fs.readFileSync(absolutePath, "utf8");
  const parser = new Parser();
  const quads = parser.parse(ttl);

  // Transformer les triples en objet
  const SCHACLconfig: Record<string, any> = {};
  for (const quad of quads) {
    const subject = quad.subject.value;
    const predicate = quad.predicate.value;
    const object = quad.object.value;
    if (!SCHACLconfig[subject]) SCHACLconfig[subject] = {};
    SCHACLconfig[subject][predicate] = object;
  }

  // Stocker en cache
  SHACL_CACHE[projectKey] = SCHACLconfig;
  return SCHACLconfig;
}
