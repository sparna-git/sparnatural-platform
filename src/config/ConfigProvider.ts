import fs from "fs";
import yaml from "js-yaml";
import path from "path";

export class ConfigProvider {
  private static instance: ConfigProvider;
  private configPath: string;
  private config: any;

  /**
   * Singleton private constructor
   */
  private constructor() {

    // Lire le chemin du fichier de config depuis les arguments CLI
    const configPathFromArg = process.argv.find((arg) =>
    arg.startsWith("--config=")
    );
    const defaultConfigPath = path.join(__dirname, "../../config.yaml"); // chemin par défaut
    const resolvedConfigPath = configPathFromArg
    ? configPathFromArg.split("=")[1]
    : defaultConfigPath;

    this.configPath = resolvedConfigPath;
    this.config = this.loadConfig();
  }

  static getInstance(): ConfigProvider {
    if (!ConfigProvider.instance) {
      ConfigProvider.instance = new ConfigProvider();
    }
    return ConfigProvider.instance;
  }

  private loadConfig(): any {
    try {
      console.log("Lecture du fichier de config:", this.configPath);
      const content = fs.readFileSync(this.configPath, "utf8");
      return yaml.load(content) as any;
    } catch (err) {
      console.error("Erreur lors du chargement du fichier de config:", err);
      throw err;
    }
  }

  getConfig(): any {
    return this.config;
  }

  refreshConfig(): any {
    this.config = this.loadConfig();
    return this.config;
  }

  getConfigPath(): string {
    return this.configPath;
  }
}
