import type { ShaclModel } from "rdf-shacl-commons";

export interface NodeShapeInfo {
  shapeIri: string;
  label?: string;
  description?: string;
  agentInstruction?: string;
  targetClasses: string[];
  targetSparql?: string[];
  properties: PropertyShapeInfo[];
}

export interface PropertyShapeInfo {
  path?: string;
  name?: string;
  description?: string;
  agentInstruction?: string;
  minCount?: number;
  maxCount?: number;
  classes?: string[];
  datatypes?: string[];
  values?: string[];
}

/**
 * Tries the preferred language first, then iterates over every language
 * present in the model until a non-empty value is found.
 */
function getTooltipWithFallback(
  shape: { getTooltip: (lang: string) => string | undefined },
  preferredLang: string,
  allLangs: string[],
): string | undefined {
  const preferred = shape.getTooltip(preferredLang);
  if (preferred) return preferred;
  for (const lang of allLangs) {
    if (lang === preferredLang) continue;
    const value = shape.getTooltip(lang);
    if (value) return value;
  }
  return undefined;
}

function getAgentInstructionWithFallback(
  shape: { getShAgentInstruction: (lang: string) => string[] | undefined },
  preferredLang: string,
  allLangs: string[],
): string[] | undefined {
  const preferred = shape.getShAgentInstruction(preferredLang);
  if (preferred?.length) return preferred;
  for (const lang of allLangs) {
    if (lang === preferredLang) continue;
    const value = shape.getShAgentInstruction(lang);
    if (value?.length) return value;
  }
  return undefined;
}

function getLabelWithFallback(
  shape: { getLabel: (lang: string) => string | undefined },
  preferredLang: string,
  allLangs: string[],
): string | undefined {
  const preferred = shape.getLabel(preferredLang);
  if (preferred) return preferred;
  for (const lang of allLangs) {
    if (lang === preferredLang) continue;
    const value = shape.getLabel(lang);
    if (value) return value;
  }
  return undefined;
}

/**
 * Parses @prefix declarations from a Turtle string.
 * Returns [uri, "prefix:"] pairs sorted longest-URI first so compact()
 * always matches the most specific prefix.
 */
export function extractPrefixesFromTtl(ttl: string): [string, string][] {
  const map: Record<string, string> = {};
  const regex = /@prefix\s+([\w-]*:)\s*<([^>]+)>/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(ttl)) !== null) {
    map[m[2]] = m[1];
  }
  return Object.entries(map).sort(([a], [b]) => b.length - a.length);
}

function compact(
  iri: string | undefined,
  prefixes: [string, string][],
): string | undefined {
  if (!iri) return undefined;
  for (const [uri, prefix] of prefixes) {
    if (iri.startsWith(uri)) return prefix + iri.slice(uri.length);
  }
  return iri;
}

/**
 * Extract a LLM-friendly JSON representation of all NodeShapes found in the
 * given ShaclModel. Uses rdf-shacl-commons to hide RDF/SHACL plumbing.
 * When prefixes are provided, all IRIs are compacted to their prefixed form.
 */
export function extractNodeShapes(
  model: ShaclModel,
  lang = "fr",
  prefixes: [string, string][] = [],
): NodeShapeInfo[] {
  const c = (iri: string | undefined) =>
    prefixes.length ? compact(iri, prefixes) : iri;

  // Discover every language present in this SHACL file at runtime.
  const allLangs = model.readAllLanguages();

  return model.readAllNodeShapes().map((ns) => {
    const shapeIri = c(ns.getResource().value)!;

    const targetClasses = ns.getTargetClasses().map((r) => c(r.value)!);
    const targetSparql = ns.getShTarget().map((r) => c(r.value)!);

    const nsDescription = getTooltipWithFallback(ns, lang, allLangs);
    const nsAgentInstr = getAgentInstructionWithFallback(ns, lang, allLangs);

    const properties: PropertyShapeInfo[] = ns.getProperties().map((ps) => {
      const path = ps.getShPath();

      const classes = ps.getShClass().map((r) => c(r.value)!);
      const datatypes = ps.getShDatatype().map((d) => c(d.getUri().value)!);

      const shIn = ps.getShIn();
      const values = shIn?.map((t) => c(t.value)!);

      const psDescription = getTooltipWithFallback(ps, lang, allLangs);
      const psAgentInstr = getAgentInstructionWithFallback(ps, lang, allLangs);

      const prop: PropertyShapeInfo = {
        path: c(path?.value),
        name: getLabelWithFallback(ps, lang, allLangs),
      };

      if (psDescription) prop.description = psDescription;
      if (psAgentInstr?.length) prop.agentInstruction = psAgentInstr.join(" ");
      if (ps.getShMinCount() != null) prop.minCount = ps.getShMinCount();
      if (ps.getShMaxCount() != null) prop.maxCount = ps.getShMaxCount();
      if (classes.length) prop.classes = classes;
      if (datatypes.length) prop.datatypes = datatypes;
      if (values?.length) prop.values = values;

      return prop;
    });

    const shape: NodeShapeInfo = {
      shapeIri,
      label: getLabelWithFallback(ns, lang, allLangs),
      targetClasses,
      properties,
    };

    if (nsDescription) shape.description = nsDescription;
    if (nsAgentInstr?.length) shape.agentInstruction = nsAgentInstr.join(" ");
    if (targetSparql.length) shape.targetSparql = targetSparql;

    return shape;
  });
}
