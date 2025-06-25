import axios from "axios";

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
        agent_id: process.env.MISTRAL_AGENT_ID_query_2_text,
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

const tools = [
  {
    type: "function",
    function: {
      name: "uriLookup",
      description: "Resolve a label and type into an RDF URI",
      parameters: {
        type: "object",
        properties: {
          label: {
            type: "string",
            description: "The label to look up (e.g., 'France')",
          },
        },
        required: ["label"],
      },
    },
  },
];

export async function getJsonFromAgent(
  naturalLanguageQuery: string,
  lang: string,
  projectKey: string
): Promise<object> {
  const messageContent = `LANGUAGE: ${lang}\n\nlanguage:\n${naturalLanguageQuery}`;
  const userMessage = { role: "user", content: messageContent };

  console.log("[getJsonFromAgent] Début de la fonction");
  console.log("[getJsonFromAgent] Message utilisateur :", messageContent);

  try {
    // Premier appel à Mistral (agent)
    console.log("[getJsonFromAgent] Envoi premier appel à Mistral avec tools");
    const firstResponse = await axios.post(
      "https://api.mistral.ai/v1/agents/completions",
      {
        agent_id: process.env.MISTRAL_AGENT_ID_text_2_query,
        messages: [userMessage],
        tools,
        tool_choice: "auto",
        response_format: { type: "text" },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(
      "[getJsonFromAgent] Réponse Mistral reçue :",
      JSON.stringify(firstResponse.data, null, 2)
    );

    const firstChoice = firstResponse.data.choices?.[0];
    const toolCalls = firstChoice?.message?.tool_calls;

    if (toolCalls && toolCalls.length > 0) {
      console.log(
        `[getJsonFromAgent] L'agent demande un appel outil (${toolCalls.length} outil(s))`
      );

      for (const toolCall of toolCalls) {
        console.log(
          "[getJsonFromAgent] Traitement du toolCall :",
          toolCall.function.name
        );

        if (toolCall.function.name === "uriLookup") {
          const args = JSON.parse(toolCall.function.arguments);
          console.log("[getJsonFromAgent] Arguments pour uriLookup :", args);

          const uriRes = await axios.get(
            `http://localhost:3000/${projectKey}/api/v1/urilookup`,
            { params: args }
          );

          console.log(
            "[getJsonFromAgent] Résultat de l'API urilookup :",
            JSON.stringify(uriRes.data, null, 2)
          );

          // Construire le message assistant avec tool_call
          const assistantMessage = {
            role: "assistant",
            content: "", // obligatoire même si vide
            tool_calls: [toolCall],
          };

          // Message tool avec la réponse
          const toolResponse = {
            role: "tool",
            tool_call_id: toolCall.id,
            name: "uriLookup",
            content: JSON.stringify(uriRes.data),
          };

          // Deuxième appel à Mistral avec l'historique complet
          console.log(
            "[getJsonFromAgent] Envoi deuxième appel à Mistral avec réponse outil"
          );

          const secondResponse = await axios.post(
            "https://api.mistral.ai/v1/agents/completions",
            {
              agent_id: process.env.MISTRAL_AGENT_ID_text_2_query,
              messages: [userMessage, assistantMessage, toolResponse],
              response_format: { type: "text" },
            },
            {
              headers: {
                Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
                "Content-Type": "application/json",
              },
            }
          );

          const raw = secondResponse.data.choices?.[0]?.message?.content;
          console.log(
            "[getJsonFromAgent] Réponse Mistral après appel outil :",
            raw
          );

          if (!raw || raw.trim() === "") {
            console.warn(
              "[getJsonFromAgent] Mistral a renvoyé une réponse vide après appel outil"
            );
            return {};
          }

          try {
            const parsed = JSON.parse(raw);
            console.log(
              "[getJsonFromAgent] JSON parsé avec succès après outil :",
              parsed
            );
            return parsed;
          } catch (e) {
            console.error(
              "[getJsonFromAgent] ❌ Réponse brute non JSON après outil :",
              raw
            );
            throw new Error(
              "L'agent a répondu par un texte brut après appel outil. Un JSON était attendu."
            );
          }
        }
      }

      console.log("[getJsonFromAgent] Aucun outil reconnu dans toolCalls");
      return {};
    } else {
      // Pas d'appel outil, réponse directe
      const raw = firstChoice?.message?.content;
      console.log("[getJsonFromAgent] Réponse Mistral sans appel outil :", raw);

      if (!raw || raw.trim() === "") {
        console.warn(
          "[getJsonFromAgent] Mistral a renvoyé une réponse vide sans outil"
        );
        return {};
      }

      try {
        const parsed = JSON.parse(raw);
        console.log(
          "[getJsonFromAgent] JSON parsé avec succès sans outil :",
          parsed
        );
        return parsed;
      } catch (e) {
        console.error(
          "[getJsonFromAgent] Réponse brute non JSON sans outil :",
          raw
        );
        throw new Error(
          "L'agent a répondu par un texte brut. Un JSON était attendu."
        );
      }
    }
  } catch (error: any) {
    if (error?.response?.data) {
      console.error(
        "[getJsonFromAgent] Erreur Mistral complète :",
        JSON.stringify(error.response.data, null, 2)
      );
    } else {
      console.error(
        "[getJsonFromAgent] Erreur Mistral :",
        error.message || error
      );
    }
    return {};
  }
}
