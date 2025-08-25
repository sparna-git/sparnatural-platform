import axios from "axios";
import { SparnaturalQuery } from "../zod/query";
import { z } from "zod";
import config from "../config/config";
import { EmptyRequestError } from "../errors/emptyRequestError";

// Set Mistral agent IDs from config
const agentIdQueryToText =
  config["projects"]["dbpedia-en"]["endpoints-agents"][
    "MISTRAL_AGENT_ID_query_2_text"
  ];
const agentIdTextToQuery =
  config["projects"]["dbpedia-en"]["endpoints-agents"][
    "MISTRAL_AGENT_ID_text_2_query_TEST"
  ];

/**
 * Génère un résumé textuel à partir d'une requête Sparnatural JSON.
 * @param jsonQuery - La requête JSON au format SparnaturalQueryIfc
 * @param lang - La langue du résumé attendu (ex : "fr", "en")
 * @returns Un texte résumé généré par l'agent
 */
export async function getSummaryFromAgent(
  jsonQuery: object,
  lang: string
): Promise<string> {
  try {
    const messageContent = `LANGUAGE: ${lang}\n\nQUERY:\n${JSON.stringify(
      jsonQuery,
      null,
      2
    )}`;

    const response = await axios.post(
      "https://api.mistral.ai/v1/agents/completions",
      {
        agent_id: agentIdQueryToText,
        messages: [{ role: "user", content: messageContent }],
        response_format: { type: "text" },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const result = response.data.choices?.[0]?.message?.content;
    return result || "Réponse vide du modèle Mistral.";
  } catch (error: any) {
    console.error(
      "Erreur Mistral (getSummaryFromAgent) :",
      error?.response?.data || error.message
    );
    return "Erreur lors de la génération du résumé avec Mistral.";
  }
}

export async function getJsonFromAgent(
  naturalLanguageQuery: string,
  projectKey: string
): Promise<z.infer<typeof SparnaturalQuery>> {
  const userMessage = { role: "user", content: naturalLanguageQuery };

  function extractJsonFromMarkdown(text: string): string {
    return text.replace(/^```json\s*/, "").replace(/\s*```$/, "");
  }

  try {
    // 1. Appel à l'agent IA (sans tools)
    const response = await axios.post(
      "https://api.mistral.ai/v1/agents/completions",
      {
        agent_id: agentIdTextToQuery,
        messages: [userMessage],
        response_format: { type: "text" },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const raw = response.data.choices?.[0]?.message?.content;
    if (!raw || raw.trim() === "") {
      throw new Error("Réponse vide de l'agent IA");
    }

    const rawClean = extractJsonFromMarkdown(raw);
    const parsed = JSON.parse(rawClean);

    // 2. Chercher les labels avec URI_NOT_FOUND
    const labelsToResolve: Record<string, { query: string }> = {};
    let idx = 0;

    function collectLabels(obj: any) {
      if (Array.isArray(obj)) {
        obj.forEach(collectLabels);
      } else if (obj && typeof obj === "object") {
        if (
          obj.label &&
          obj.rdfTerm &&
          obj.rdfTerm.type === "uri" &&
          obj.rdfTerm.value ===
            "https://services.sparnatural.eu/api/v1/URI_NOT_FOUND"
        ) {
          labelsToResolve[`label_${idx++}`] = { query: obj.label };
        }
        Object.values(obj).forEach(collectLabels);
      }
    }
    collectLabels(parsed);

    // 3. Appeler la reconciliation si besoin
    if (Object.keys(labelsToResolve).length > 0) {
      console.log(
        `[getJsonFromAgent] 🔎 Reconciliation utilisée pour ${
          Object.keys(labelsToResolve).length
        } label(s):`,
        Object.values(labelsToResolve).map((l) => l.query)
      );
      const uriRes = await axios.post(
        `http://localhost:3000/api/v1/${projectKey}/reconciliation`,
        labelsToResolve
      );

      // 4. Remplacer les URI_NOT_FOUND par les URI trouvées
      let resolvedIdx = 0;
      function injectUris(obj: any) {
        if (Array.isArray(obj)) {
          obj.forEach(injectUris);
        } else if (obj && typeof obj === "object") {
          if (
            obj.label &&
            obj.rdfTerm &&
            obj.rdfTerm.type === "uri" &&
            obj.rdfTerm.value ===
              "https://services.sparnatural.eu/api/v1/URI_NOT_FOUND"
          ) {
            const key = `label_${resolvedIdx++}`;
            const foundUri = uriRes.data[key]?.result?.[0]?.id;
            if (foundUri) {
              obj.rdfTerm.value = foundUri;
            }
          }
          Object.values(obj).forEach(injectUris);
        }
      }
      injectUris(parsed);

      // Supprimer metadata si présent
      if ("metadata" in parsed) {
        delete parsed.metadata;
        console.log(
          "[getJsonFromAgent] 🧹 Clé 'metadata' supprimée après reconciliation."
        );
      }
    } else {
      console.log("[getJsonFromAgent] ✅ Pas de reconciliation nécessaire.");
    }

    // 5. Valider et retourner
    const validated = SparnaturalQuery.parse(parsed);
    return validated;
  } catch (error: any) {
    if (error instanceof EmptyRequestError) throw error;
    console.error("[getJsonFromAgent] ❌ Erreur :", error.message || error);
    throw new Error("Erreur lors de la génération ou validation du JSON");
  }
}
