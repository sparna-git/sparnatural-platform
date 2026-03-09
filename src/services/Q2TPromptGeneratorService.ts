/**
 * This file is responsible for generating the prompt for the query2text agent.
 * It takes a projectKey, reads the SHACL model,
 * and returns a complete prompt to use in the query2text agent.
 *
 * The prompt is composed of two parts:
 *  1. A STATIC part
 *  2. A DYNAMIC part (Class and Property Label Reference)
 */

import { inject, injectable } from "tsyringe";
import { Q2TPromptGeneratorIfc } from "./Q2TPromptGeneratorIfc";
import { PromptGeneratorQ2TConfig } from "../config/ProjectConfig";
import {
  Q2T_STATIC_PART_BEFORE,
  Q2T_STATIC_PART_AFTER,
  Q2T_fewshot_example_dbpedia,
  Q2T_fewshot_example_demo_ep,
} from "../utils/Q2TPromptParts";
import { getSHACLConfig } from "../config/SCHACL";

import {
  PropertyShape,
  SparnaturalNodeShape,
  SparnaturalPropertyShape,
  SparnaturalShaclModel,
  ShaclModel,
} from "rdf-shacl-commons";

@injectable({ token: "Q2TPromptGenerator" })
@injectable({ token: "default:q2tPromptGenerator" })
export class Q2TPromptGenerator implements Q2TPromptGeneratorIfc {
  private config: PromptGeneratorQ2TConfig;

  constructor(
    @inject("q2tPromptGenerator.config") config: PromptGeneratorQ2TConfig,
  ) {
    this.config = config;
  }

  async generatePromptQ2T(projectKey: string): Promise<string> {
    const { model } = await getSHACLConfig(projectKey);
    const sparnaturalModel = new SparnaturalShaclModel(model);
    const referenceTable = this.buildReferenceTable(sparnaturalModel, model);
    let prompt: string;

    if (projectKey === "dbpedia-en") {
      prompt =
        Q2T_STATIC_PART_BEFORE +
        Q2T_fewshot_example_dbpedia +
        referenceTable +
        Q2T_STATIC_PART_AFTER;
    } else if (projectKey === "demo-ep") {
      prompt =
        Q2T_STATIC_PART_BEFORE +
        Q2T_fewshot_example_demo_ep +
        referenceTable +
        Q2T_STATIC_PART_AFTER;
    } else {
      prompt = Q2T_STATIC_PART_BEFORE + referenceTable + Q2T_STATIC_PART_AFTER;
    }
    return prompt;
  }

  private buildReferenceTable(
    sparnaturalModel: SparnaturalShaclModel,
    shaclModel: ShaclModel,
  ): string {
    const allNodeShapes = shaclModel
      .readAllNodeShapes()
      .map((ns) => new SparnaturalNodeShape(ns));

    let result = "\nClass and Property Label Reference:\n\n";
    result +=
      "Use ONLY these labels in the generated sentence. Never use raw URIs or variable names.\n\n";

    // --- Classes ---
    result += "Classes (rdfType URI -> English label / French label):\n\n";
    allNodeShapes.forEach((sns) => {
      const id = sns.getId();
      const labelEn = sns.getNodeShape().getLabel("en") ?? id;
      const labelFr = sns.getNodeShape().getLabel("fr") ?? labelEn;
      const tooltip =
        sns.getNodeShape().getTooltip("en") ?? "No description available.";
      result += `  ${id} -> ${labelEn} / ${labelFr} — ${tooltip}\n`;
    });

    // --- Properties ---
    result +=
      "\nProperties (predicate URI -> English label / French label):\n\n";
    allNodeShapes.forEach((sns) => {
      const validProps: PropertyShape[] = sns.getValidProperties();
      validProps.forEach((propShape) => {
        const propUri = propShape.resource.value;
        const labelEn = propShape.getLabel("en") ?? "unknown";
        const labelFr = propShape.getLabel("fr") ?? labelEn;
        const tooltip =
          propShape.getTooltip("en") ?? "No description available.";
        result += `  ${propUri} -> ${labelEn} / ${labelFr} — ${tooltip}\n`;
      });
    });

    return result;
  }
}
