// src/config/config.ts
import fs from "fs";
import yaml from "js-yaml";
import path from "path";

// Lire le chemin du fichier de config depuis les arguments CLI
const configPathFromArg = process.argv.find((arg) =>
  arg.startsWith("--config=")
);
const configPath = configPathFromArg
  ? configPathFromArg.split("=")[1]
  : path.join(__dirname, "../../config/config.yaml"); // chemin par défaut

console.log("📥 Lecture du fichier de config:", configPath);
// Charger le fichier une seule fois
const config = yaml.load(fs.readFileSync(configPath, "utf8")) as any;

export default config;
