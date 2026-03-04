/**
 * This file is responsible for generating the prompt for the query2text agent.
 * It takes a projectKey, reads the SHACL file from the project config,
 * and returns a complete prompt to use in the query2text agent.
 *
 * The prompt is composed of two parts:
 *  1. A STATIC part
 *  2. A DYNAMIC part
 */

import fs from "fs";
import path from "path";
import { ConfigProvider } from "../config/ConfigProvider";
import { inject, injectable } from "tsyringe";
import { Q2TPromptGeneratorIfc } from "./Q2TPromptGeneratorIfc";
import { PromptGeneratorQ2TConfig } from "../config/ProjectConfig";
import {
  Q2T_STATIC_PART_BEFORE,
  Q2T_STATIC_PART_AFTER,
} from "../utils/Q2TPromptParts";

@injectable({ token: "Q2TPromptGenerator" })
@injectable({ token: "default:q2tPromptGenerator" })
export class Q2TPromptGenerator implements Q2TPromptGeneratorIfc {
  private config: PromptGeneratorQ2TConfig;
  // an empty constructor
  constructor(
    @inject("q2tPromptGenerator.config") config: PromptGeneratorQ2TConfig,
  ) {
    this.config = config;
  }

  /**
   * Reads the SHACL file content for a given projectKey from the config.
   *
   * @param projectKey - The project identifier (e.g., "dbpedia-en", "demo-ep").
   * @returns The raw SHACL (Turtle) file content.
   * @throws Error if the project or SHACL file path is not found.
   */
  private readShaclFile(projectKey: string): string {
    const config = ConfigProvider.getInstance().getConfig();
    const projectConfig = config.projects?.[projectKey];

    if (!projectConfig) {
      throw new Error(`Unknown project: '${projectKey}'`);
    }

    const shaclFilePath = projectConfig.shaclFile;
    if (!shaclFilePath) {
      throw new Error(`No SHACL file configured for project '${projectKey}'`);
    }

    const absolutePath = path.join(__dirname, "../../", shaclFilePath);
    console.log(`[PromptGeneratorT2Q] 📥 Reading SHACL file: ${absolutePath}`);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`SHACL file not found at path: ${absolutePath}`);
    }

    return fs.readFileSync(absolutePath, "utf8");
  }

  /**
   * Generates the complete prompt by combining:
   *  - the static instructions (before 8d)
   *  - the dynamic SHACL-derived reference table (section 8d)
   *  - the static rules and notes (after 8d)
   *
   * @param projectKey - The project identifier used to locate the SHACL file in config.
   * @returns The full prompt string ready to be used in the text2query agent.
   */
  async generatePromptQ2T(projectKey: string): Promise<string> {
    const shaclContent = this.readShaclFile(projectKey);

    // TODO: Transform the SHACL content into the section 8d reference table
    const shaclReferenceTable = this.buildReferenceTable(shaclContent);

    return Q2T_STATIC_PART_BEFORE + shaclReferenceTable + Q2T_STATIC_PART_AFTER;
  }

  /**
   * TODO : The Implementation of this methode will use rdf-shacl-communs lib cause we have already functions to parse the shacl
   */

  /**
   * Transforms raw SHACL (Turtle) content into the section 8d reference table.
   * This will produce the categories of classes and the properties-per-class table.
   *
   * TODO: Implement the full SHACL -> reference table transformation.
   *
   * @param shacl - The raw SHACL (Turtle) content.
   * @returns The formatted section 8d string.
   */
  private buildReferenceTable(shacl: string): string {
    // Placeholder — will be implemented with SHACL parsing logic
    return shacl;
  }
}
