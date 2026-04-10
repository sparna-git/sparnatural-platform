import type { ShaclModel } from "rdf-shacl-commons";

export interface NodeShapeInfo {
  shapeIri: string;
  label?: string;
  targetClasses: string[];
  targetSparql?: string[];
  properties: PropertyShapeInfo[];
}

export interface PropertyShapeInfo {
  path?: string;
  name?: string;
  classes: string[];
  datatypes: string[];
}

/**
 * Extract a LLM-friendly JSON representation of all NodeShapes found in the
 * given ShaclModel. Uses rdf-shacl-commons to hide RDF/SHACL plumbing.
 */
export function extractNodeShapes(
  model: ShaclModel,
  lang = "en",
): NodeShapeInfo[] {
  return model.readAllNodeShapes().map((ns) => {
    const shapeIri = ns.getResource().value;

    const targetClasses = ns.getTargetClasses().map((r) => r.value);
    const targetSparql = ns.getShTarget().map((r) => r.value);

    const properties: PropertyShapeInfo[] = ns.getProperties().map((ps) => {
      const path = ps.getShPath();
      return {
        path: path?.value,
        name: ps.getLabel(lang),
        classes: ps.getShClass().map((r) => r.value),
        // DatatypeIfc has various shapes; coerce via toString fallback.
        datatypes: ps.getShDatatype().map((d: unknown) => {
          const anyD = d as { getUri?: () => string; value?: string };
          return anyD.getUri?.() ?? anyD.value ?? String(d);
        }),
      };
    });

    return {
      shapeIri,
      label: ns.getLabel(lang),
      targetClasses,
      targetSparql: targetSparql.length ? targetSparql : undefined,
      properties,
    };
  });
}
