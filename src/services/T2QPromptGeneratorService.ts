import { T2QPromptGeneratorIfc } from "./T2QPromptGeneratorIfc";
import { inject, injectable } from "tsyringe";
import { PromptGeneratorQ2TConfig } from "../config/ProjectConfig";
import {
  T2Q_STATIC_PART_BEFORE,
  T2Q_STATIC_PART_AFTER,
} from "../utils/T2QPromptParts";
import { getSHACLConfig } from "../config/SCHACL";

import {
  PropertyShape,
  NodeShape,
  SparnaturalNodeShape,
  SparnaturalPropertyShape,
  SparnaturalShaclModel,
  SearchWidgetIfc,
  SPARNATURAL,
  ShaclModel,
  DagNodeIfc,
} from "rdf-shacl-commons";
import { Resource } from "rdf-shacl-commons/dist/rdf/Resource";

@injectable({ token: "T2QPromptGenerator" })
@injectable({ token: "default:t2qPromptGenerator" })
export class T2QPromptGenerator implements T2QPromptGeneratorIfc {
  private config: PromptGeneratorQ2TConfig;

  constructor(
    @inject("t2qPromptGenerator.config") config: PromptGeneratorQ2TConfig,
  ) {
    this.config = config;
  }

  async generatePromptT2Q(projectKey: string): Promise<string> {
    // Utilise getSHACLConfig qui a le cache + skolemization
    const { model } = await getSHACLConfig(projectKey);
    const sparnaturalModel = new SparnaturalShaclModel(model);
    const referenceTable = this.buildReferenceTable(sparnaturalModel, model);
    return T2Q_STATIC_PART_BEFORE + referenceTable + T2Q_STATIC_PART_AFTER;
  }

  /**
   * TODO: Implement the transformation from SHACL model to the reference table format.
   * This will involve:
   * 1) Identifying Category A classes (entry points) and their properties.
   * 2) Identifying Category B classes (non-entry points but valid in traversal) and their properties.
   * 3) Building the property reference table with usage instructions based on widget types.
   * @param shaclModel
   * @returns
   */

  private buildReferenceTable(
    sparnaturalModel: SparnaturalShaclModel,
    shaclModel: ShaclModel,
  ): string {
    // Step 1: Get Category A from the DAG (non-disabled nodes)
    const entryPoints = sparnaturalModel.getEntryPointsNodeShapes("en");
    const entryPointIds = new Set<string>();
    entryPoints.traverseBreadthFirst(
      (node: DagNodeIfc<SparnaturalNodeShape>) => {
        if (!node.disabled) {
          entryPointIds.add(node.payload.getId());
        }
      },
    );
    console.log("Entry point NodeShapes (Category A):", entryPointIds);

    // Step 2: Get ALL NodeShapes, then subtract Cat A → Cat B
    const allNodeShapes = shaclModel
      .readAllNodeShapes()
      .map((ns) => new SparnaturalNodeShape(ns));
    console.log(
      "All NodeShapes in the model:",
      allNodeShapes.map((sns) => sns.getId()),
    );

    const categoryAShapes: SparnaturalNodeShape[] = [];
    entryPoints.traverseBreadthFirst(
      (node: DagNodeIfc<SparnaturalNodeShape>) => {
        if (!node.disabled) {
          categoryAShapes.push(node.payload);
        }
      },
    );

    const categoryBShapes = allNodeShapes.filter(
      (sns) => !entryPointIds.has(sns.getId()),
    );

    // Build category arrays
    const categoryA = categoryAShapes.map((sns) => ({
      id: sns.getId(),
      tooltip:
        sns.getNodeShape().getTooltip("en") ?? "No description available.",
      sparnaturalNodeShape: sns,
    }));

    const categoryB = categoryBShapes.map((sns) => ({
      id: sns.getId(),
      tooltip:
        sns.getNodeShape().getTooltip("en") ?? "No description available.",
      sparnaturalNodeShape: sns,
    }));
    // cat Bsns.getNodeShape().getTooltip("en") etc.
    console.log(
      "Category B NodeShapes:",
      categoryB.map((c) => c.id),
    );
    // Build the reference table
    let finalModel = "\n\n## 8d. SHACL-Derived Reference Table\n\n";

    // Category A
    finalModel +=
      '### CATEGORY A — ROOT SUBJECT classes (can be the root "subject" of the query AND can appear as object variables):\n\n';
    categoryA.forEach((cls) => {
      finalModel += `- ${cls.id} described as "${cls.tooltip}"\n`;
    });

    // Category B — only those with valid properties
    finalModel +=
      '\n### CATEGORY B — NON-ROOT classes (cannot be the root "subject" of the query, but can appear as object variables in traversal paths):\n\n';
    finalModel +=
      "These classes CANNOT be the root subject of the query (where.subject).\n";
    finalModel +=
      "They CAN appear as object variables (rdfType on ObjectCriteria.variable) in nested predicateObjectPairs,\n";
    finalModel +=
      "when the traversal path leads to them through a property declared in the SHACL model.\n\n";

    categoryB.forEach((cls) => {
      finalModel += `- ${cls.id} described as "${cls.tooltip}".\n`;
    });

    // Property Reference Table
    finalModel += "\n### PROPERTY REFERENCE TABLE (for all classes):\n\n";
    finalModel += "**HOW TO READ THIS TABLE:**\n";
    finalModel += "Each property entry follows this format:\n";
    finalModel +=
      "  `<property-shape-URI> | <name> | <range-type> | <usage> | <description>`\n\n";
    finalModel += "**range-type** is one of:\n";
    finalModel +=
      '  - "" (empty) if the property has no range or a complex range not directly filterable\n';
    finalModel +=
      '  - "<ClassName> (Cat.A)" -> IRI pointing to a Category A class; set rdfType on the object variable\n';
    finalModel +=
      '  - "<ClassName> (Cat.B)" -> IRI pointing to a Category B class; continue traversal with nested predicateObjectPairs\n\n';
    finalModel += "**usage** is one or more of:\n";
    finalModel +=
      "  - [values]              -> the user typically names a specific entity; use values[] with URI_NOT_FOUND\n";
    finalModel +=
      "  - [filter:date]         -> the user gives a date range; use a dateFilter in filters[]\n";
    finalModel +=
      "  - [filter:search]       -> the user gives a keyword; use a searchFilter in filters[]\n";
    finalModel +=
      "  - [filter:Number]       -> the user gives a number; use a numberFilter in filters[]\n";
    finalModel +=
      "  - [filter:Map]          -> the user gives coordinates; use mapFilter in filters[]\n";
    finalModel +=
      "  - [predicateObjectPairs] -> this property is used to navigate to a deeper class, not filtered directly\n\n";

    // Build property tables — only for classes that have valid properties
    [...categoryA, ...categoryB].forEach((cls) => {
      const validProps = cls.sparnaturalNodeShape.getValidProperties();
      if (validProps.length === 0) return;

      finalModel += `\n**${cls.id}** described as "${cls.tooltip}"\n`;
      finalModel += this.buildPropertyTable(
        cls.sparnaturalNodeShape,
        entryPointIds,
      );
    });

    return finalModel;
  }

  /**
   * Build the detailed property table for a SparnaturalNodeShape
   */
  private buildPropertyTable(
    sns: SparnaturalNodeShape,
    entryPointIds: Set<string>,
  ): string {
    const validProperties: PropertyShape[] = sns.getValidProperties();
    let table = "";

    validProperties.forEach((propShape: PropertyShape) => {
      const propUri = propShape.resource.value;
      const label = propShape.getLabel("en") ?? "unknown";
      const tooltip = propShape.getTooltip("en") ?? "No description available.";

      const spps = new SparnaturalPropertyShape(propShape);
      const rangeShapes: NodeShape[] = spps.getRangeShapes();

      let rangeType = "";
      const usages: string[] = [];

      if (rangeShapes.length > 1) {
        rangeType = "(multiple ranges)";
        usages.push("[values]");
      } else if (rangeShapes.length === 1 && rangeShapes[0]) {
        const rangeNS = rangeShapes[0];
        const rangeId = rangeNS.resource.value;
        const rangeLabel = rangeNS.getLabel("en") ?? rangeId;
        const category = entryPointIds.has(rangeId) ? "Cat.A" : "Cat.B";
        rangeType = `${rangeLabel} (${category})`;

        // 1) If the range has navigable properties → predicateObjectPairs
        const rangeSnS = new SparnaturalNodeShape(rangeNS);
        //log ranges without valid properties (dead ends)
        /*
        if (rangeSnS.getValidProperties().length === 0) {
          console.warn(
            `Range ${rangeId} of property ${propUri} has no valid properties → dead end in traversal`,
          );
        }
        */

        if (rangeSnS.getValidProperties().length > 0) {
          usages.push("[predicateObjectPairs]");
        }

        //console.log("RangeNs.resource.value:", rangeNS.resource);
        // 2) Check widget → can also offer values/filter
        const widgetUsage = this.getWidgetUsage(propShape, rangeNS.resource);
        console.log(
          `Property ${propUri} with range ${rangeId} checking widget usage:`,
          widgetUsage,
        );
        if (widgetUsage) {
          usages.push(widgetUsage);
        }
      } else {
        // No range → literal property, use widget
        const widgetUsage = this.getWidgetUsage(propShape, undefined);
        console.log(
          `Property ${propUri} has no range shapes, checking widget usage:`,
          widgetUsage,
        );
        if (widgetUsage) {
          usages.push(widgetUsage);
        }
      }

      // Fallback if no usage found
      if (usages.length === 0) {
        usages.push("");
      }

      const usage = usages.join("");
      table += `- ${propUri} | ${label} | ${rangeType} | ${usage} | ${tooltip}\n`;
    });

    return table;
  }

  /**
   * Returns the widget-based usage string, or null if NON_SELECTABLE
   */
  private getWidgetUsage(
    propShape: PropertyShape,
    rangeResource: Resource | undefined,
  ): string | null {
    const searchWidget: SearchWidgetIfc =
      propShape.getSearchWidgetForRange(rangeResource);
    const widgetUri = searchWidget.getResource().value;

    if (widgetUri === SPARNATURAL.NON_SELECTABLE_PROPERTY.value) {
      return null;
    } else if (
      widgetUri === SPARNATURAL.TIME_PROPERTY_DATE.value ||
      widgetUri === SPARNATURAL.TIME_PROPERTY_YEAR.value
    ) {
      return "[filter:date]";
    } else if (
      widgetUri === SPARNATURAL.SEARCH_PROPERTY.value ||
      widgetUri === SPARNATURAL.AUTOCOMPLETE_PROPERTY.value
    ) {
      return "[filter:search]";
    } else if (widgetUri === SPARNATURAL.NUMBER_PROPERTY.value) {
      return "[filter:Number]";
    } else if (widgetUri === SPARNATURAL.MAP_PROPERTY.value) {
      return "[filter:Map]";
    } else {
      return "[values]";
    }
  }
}
