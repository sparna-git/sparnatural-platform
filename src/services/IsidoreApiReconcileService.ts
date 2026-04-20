import axios from "axios";

const ISIDORE_RESOURCE_SUGGEST_URL =
  "https://api.isidore.science/resource/suggest";
const ISIDORE_SOURCE_SUGGEST_URL = "https://api.isidore.science/source/suggest";

const ISIDORE_AGENT_PREFIX = "http://isidore.science/a/";
const ISIDORE_SOURCE_PREFIX = "http://isidore.science/source/";

export type IsidoreEntityType = "agent" | "subject" | "source";

export interface IsidoreCandidate {
  uri: string;
  label: string;
}

/**
 * Calls the right ISIDORE suggest endpoint based on the entity type and
 * returns resolved candidates (full URI + label).
 *
 * - agent   -> resource/suggest, picks <replies name="creators">,
 *             prefixes raw key with ISIDORE_AGENT_PREFIX
 * - subject -> resource/suggest, picks <replies name="subjects">,
 *             URI is already a full http:// value — used as-is
 * - source  -> source/suggest, single list,
 *             prefixes raw key with ISIDORE_SOURCE_PREFIX
 */
export async function getIsidoreSuggestCandidates(
  query: string,
  entityType: IsidoreEntityType,
  replies = 15,
): Promise<IsidoreCandidate[]> {
  const isSource = entityType === "source";
  const url = new URL(
    isSource ? ISIDORE_SOURCE_SUGGEST_URL : ISIDORE_RESOURCE_SUGGEST_URL,
  );
  url.searchParams.set("q", query);
  url.searchParams.set("replies", String(replies));

  console.log(`[isidore-api] suggest (${entityType}) -> ${url.toString()}`);

  try {
    const response = await axios.get<string>(url.toString(), {
      timeout: 8000,
      headers: { Accept: "application/xml, text/xml, */*" },
      responseType: "text",
    });

    return parseXml(response.data, entityType);
  } catch (err: any) {
    console.error(
      `[isidore-api] suggest failed for "${query}":`,
      err?.message ?? err,
    );
    return [];
  }
}

function parseXml(xml: string, entityType: string): IsidoreCandidate[] {
  if (entityType === "source") {
    // source/suggest has a flat list, no section filtering needed
    return extractReplies(xml, ISIDORE_SOURCE_PREFIX);
  }

  // resource/suggest → pick the matching <replies name="creators|subjects"> section
  const targetSection = entityType === "agent" ? "creators" : "subjects";
  const repliesRegex =
    /<replies\b[^>]*\bname="([^"]*)"[^>]*>([\s\S]*?)<\/replies>/g;
  let m: RegExpExecArray | null;

  while ((m = repliesRegex.exec(xml)) !== null) {
    if (m[1] !== targetSection) continue;
    const prefix = entityType === "agent" ? ISIDORE_AGENT_PREFIX : undefined;
    return extractReplies(m[2], prefix);
  }

  return [];
}

/**
 * Extracts <reply label="..."> entries from a block of XML.
 * When prefix is provided, it is prepended to raw URI values that don't
 * already start with "http". Otherwise the raw value is used as-is.
 */
function extractReplies(xml: string, prefix?: string): IsidoreCandidate[] {
  const candidates: IsidoreCandidate[] = [];
  const replyRegex = /<reply\b[^>]*\blabel="([^"]*)"[^>]*>([\s\S]*?)<\/reply>/g;
  let m: RegExpExecArray | null;

  while ((m = replyRegex.exec(xml)) !== null) {
    const label = m[1].trim();
    const uriMatch =
      /<option\b[^>]*\bkey="uri"\s+value="([^"]*)"[^>]*\/?>/i.exec(m[2]);
    if (!uriMatch) continue;

    const rawUri = uriMatch[1].trim();
    if (!rawUri || !label) continue;

    const uri = prefix && !rawUri.startsWith("http") ? prefix + rawUri : rawUri;

    candidates.push({ uri, label });
  }

  return candidates;
}

/**
 * Maps a class IRI (from SHACL NodeShape targetClass) to an IsidoreEntityType.
 * Falls back to "subject" when unknown.
 */
export function classIriToIsidoreType(classIri?: string): IsidoreEntityType {
  if (!classIri) return "subject";
  if (classIri === "http://xmlns.com/foaf/0.1/Agent") return "agent";
  if (classIri === "http://isidore.science/class/Source") return "source";
  return "subject";
}
