import { Parser } from "sparqljs";

/**
 * Result of validating an incoming SPARQL query before execution.
 */
export interface SparqlValidationResult {
  ok: boolean;
  /** Actionable error message intended for the LLM when ok=false. */
  error?: string;
  /**
   * The query to actually execute. May differ from the input when a
   * default LIMIT has been injected.
   */
  query?: string;
}

// SPARQL 1.1 Update keywords we refuse to run on a read-only endpoint.
// Matched as whole words, case-insensitive, anywhere in the query.
const FORBIDDEN_UPDATE_KEYWORDS = [
  "INSERT",
  "DELETE",
  "DROP",
  "CLEAR",
  "CREATE",
  "LOAD",
  "COPY",
  "MOVE",
  "ADD",
];

/**
 * Validates a SPARQL query before sending it to the endpoint:
 *   1. Refuses update operations (defense in depth on a read-only endpoint).
 *   2. Parses with sparqljs to catch syntax errors early, with an error
 *      message more actionable than the raw triplestore response.
 *   3. Injects a default LIMIT if none is present, to protect the context
 *      window from huge result sets.
 */
export function validateAndPrepareSparql(
  rawQuery: string,
  defaultLimit = 100,
): SparqlValidationResult {
  const query = rawQuery.trim();

  if (!query) {
    return { ok: false, error: "Empty SPARQL query." };
  }

  // --- 1. Reject update operations ---
  // Strip comments and string literals first, so a forbidden keyword inside
  // a literal (e.g. ?label = "INSERT mode") does not trigger a false positive.
  const stripped = query
    .replace(/#[^\n]*/g, "") // line comments
    .replace(/"(?:\\.|[^"\\])*"/g, '""') // double-quoted literals
    .replace(/'(?:\\.|[^'\\])*'/g, "''"); // single-quoted literals

  for (const kw of FORBIDDEN_UPDATE_KEYWORDS) {
    const re = new RegExp(`\\b${kw}\\b`, "i");
    if (re.test(stripped)) {
      return {
        ok: false,
        error:
          `Forbidden SPARQL keyword '${kw}' detected. ` +
          `This endpoint only accepts read-only queries ` +
          `(SELECT, ASK, CONSTRUCT, DESCRIBE). ` +
          `Rewrite the query without update operations.`,
      };
    }
  }

  // --- 2. Parse with sparqljs for a meaningful syntax error ---
  const parser = new Parser();
  let parsed: ReturnType<typeof parser.parse>;
  try {
    parsed = parser.parse(query);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error:
        `Invalid SPARQL syntax: ${msg}. ` +
        `Check prefixes, braces, and triple patterns. ` +
        `Every used prefix must be declared with PREFIX at the top of the query.`,
    };
  }

  // sparqljs parses both queries and updates; double-check we got a query.
  if (parsed.type !== "query") {
    return {
      ok: false,
      error:
        `Only SPARQL queries are accepted (SELECT, ASK, CONSTRUCT, DESCRIBE). ` +
        `Received an update operation.`,
    };
  }

  // --- 3. Inject a default LIMIT on SELECT queries when missing ---
  // Only SelectQuery has a `limit` field; narrow the type first.
  // ASK returns a single boolean, CONSTRUCT/DESCRIBE are typically small,
  // so we don't inject a LIMIT on those.
  let finalQuery = query;
  if (parsed.queryType === "SELECT") {
    const hasLimit = typeof parsed.limit === "number";
    if (!hasLimit) {
      finalQuery = `${query.replace(/\s+$/, "")}\nLIMIT ${defaultLimit}`;
    }
  }

  return { ok: true, query: finalQuery };
}
