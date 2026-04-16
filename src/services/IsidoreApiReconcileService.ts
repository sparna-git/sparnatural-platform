import axios from "axios";

/**
 * Calls the ISIDORE suggest API and returns the list of normalized label
 * strings for the given query.
 *
 * @param query   - The raw user input
 * @param replies - Maximum number of suggestions to request (default 15)
 * @param feed    - ISIDORE autocomplete base: "creators" | "subjects".
 *                  Omit to search across all feeds.
 * @returns List of suggested labels, empty array on error / no results.
 */
export async function getIsidoreSuggestLabels(
  query: string,
  replies = 15,
  feed?: "creators" | "subjects",
): Promise<string[]> {
  const url = new URL("https://api.isidore.science/resource/suggest");
  url.searchParams.set("q", query);
  url.searchParams.set("replies", String(replies));
  if (feed) {
    url.searchParams.set("feed", feed);
  }

  console.log(`[isidore-api] suggest -> ${url.toString()}`);

  try {
    const response = await axios.get<string>(url.toString(), {
      timeout: 8000,
      headers: { Accept: "application/xml, text/xml, */*" },
      responseType: "text",
    });

    const xml = response.data;
    const labels: string[] = [];
    const replyRegex = /<reply\b[^>]*\blabel="([^"]*)"[^>]*\/?>/g;
    let match: RegExpExecArray | null;

    while ((match = replyRegex.exec(xml)) !== null) {
      const label = match[1].trim();
      if (label) labels.push(label);
    }

    return labels;
  } catch (err: any) {
    console.error(
      `[isidore-api] suggest failed for "${query}":`,
      err?.message ?? err,
    );
    return [];
  }
}
