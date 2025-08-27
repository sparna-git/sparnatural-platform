// src/config/config.ts
import fs from "fs";
import path from "path";
import { Parser } from "n3";

const SCHACLPath = path.join(__dirname, "../configs/dbpedia/config.ttl"); // chemin par défaut

console.log("Lecture du fichier de config:", SCHACLPath);

// Lire le fichier Turtle
const ttl = fs.readFileSync(SCHACLPath, "utf8");

// Parser le Turtle avec n3
const parser = new Parser();
const quads = parser.parse(ttl);

// Transformer les triples en un objet par NodeShape
const SCHACLconfig: Record<string, any> = {};

for (const quad of quads) {
  const subject = quad.subject.value;
  const predicate = quad.predicate.value;
  const object = quad.object.value;

  if (!SCHACLconfig[subject]) SCHACLconfig[subject] = {};
  SCHACLconfig[subject][predicate] = object;
}

export default SCHACLconfig;
