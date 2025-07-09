import axios from "axios";
import { SparnaturalQuery } from "../zod/query";
import { z } from "zod";
import path from "path";
import { BadRequestError } from "../errors/BadRequestError"; // crée ce fichier si pas encore

const fs = require("fs");
const yaml = require("js-yaml");

// import config.yaml to get the Mistral agent IDs
const config = yaml.load(
  fs.readFileSync(path.join(__dirname, "../../config/config.yaml"), "utf8")
);

// Set Mistral agent IDs from config
const agentIdQueryToText =
  config["projects"]["dbpedia-en"]["endpoints-agents"][
    "MISTRAL_AGENT_ID_query_2_text"
  ];
const agentIdTextToQuery =
  config["projects"]["dbpedia-en"]["endpoints-agents"][
    "MISTRAL_AGENT_ID_text_2_query"
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

const tools = [
  {
    type: "function",
    function: {
      name: "uriLookup",
      description: "Resolve a label and type into an RDF URI",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "The label to look up (e.g., 'France')",
          },
        },
        required: ["name"],
      },
    },
  },
];

export async function getJsonFromAgent(
  naturalLanguageQuery: string,
  projectKey: string
): Promise<z.infer<typeof SparnaturalQuery>> {
  const messageContent = `language:\n${naturalLanguageQuery}`;
  const userMessage = { role: "user", content: messageContent };

  function extractJsonFromMarkdown(text: string): string {
    return text.replace(/^```json\s*/, "").replace(/\s*```$/, "");
  }

  console.log("[getJsonFromAgent] Début de la fonction");
  console.log("[getJsonFromAgent] Message utilisateur :", messageContent);

  try {
    console.log("[getJsonFromAgent] 🔁 Envoi de la 1re requête à Mistral");
    const firstResponse = await axios.post(
      "https://api.mistral.ai/v1/agents/completions",
      {
        agent_id: agentIdTextToQuery,
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

    const firstChoice = firstResponse.data.choices?.[0];
    const toolCalls = firstChoice?.message?.tool_calls;

    console.log(
      "[getJsonFromAgent] 🧠 Reçu :",
      JSON.stringify(firstChoice, null, 2)
    );

    if (toolCalls && toolCalls.length > 0) {
      console.log(
        `[getJsonFromAgent] 🛠️ ${toolCalls.length} outil(s) détecté(s)`
      );

      for (const toolCall of toolCalls) {
        console.log(
          "[getJsonFromAgent] ➕ Traitement toolCall :",
          toolCall.function.name
        );

        if (toolCall.function.name === "uriLookup") {
          const args = JSON.parse(toolCall.function.arguments);
          console.log("[getJsonFromAgent] 📤 uriLookup args :", args);

          const uriRes = await axios.get(
            `http://localhost:3000/api/v1/${projectKey}/urilookup`,
            { params: args }
          );

          console.log(
            "[getJsonFromAgent] ✅ Résultat uriLookup :",
            JSON.stringify(uriRes.data, null, 2)
          );

          const toolResponses = [];

          for (const toolCall of toolCalls) {
            console.log(
              "[getJsonFromAgent] ➕ Traitement toolCall :",
              toolCall.function.name
            );

            if (toolCall.function.name === "uriLookup") {
              const args = JSON.parse(toolCall.function.arguments);
              console.log("[getJsonFromAgent] 📤 uriLookup args :", args);

              const uriRes = await axios.get(
                `http://localhost:3000/api/v1/${projectKey}/urilookup`,
                { params: args }
              );

              console.log(
                "[getJsonFromAgent] ✅ Résultat uriLookup :",
                JSON.stringify(uriRes.data, null, 2)
              );

              toolResponses.push({
                role: "tool",
                tool_call_id: toolCall.id,
                name: "uriLookup",
                content: JSON.stringify(uriRes.data),
              });
            }
          }

          const assistantMessage = {
            role: "assistant",
            content: "Résultats des tool calls résolus.",
            tool_calls: toolCalls,
          };

          console.log(
            "[getJsonFromAgent] 🔁 Envoi de la 2e requête à Mistral après tous les uriLookup"
          );

          const secondResponse = await axios.post(
            "https://api.mistral.ai/v1/agents/completions",
            {
              agent_id: agentIdTextToQuery,
              messages: [userMessage, assistantMessage, ...toolResponses],
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
          console.log("[getJsonFromAgent] 📥 Réponse brute 2e appel :", raw);

          if (!raw || raw.trim() === "") {
            throw new Error("Réponse vide après appel outil");
          }

          const rawClean = extractJsonFromMarkdown(raw);
          const parsed = JSON.parse(rawClean);

          if (
            "error" in parsed &&
            (typeof parsed.error === "string" ||
              typeof parsed.error === "object")
          ) {
            console.warn(
              "[getJsonFromAgent] ⚠️ Erreur retournée par l'agent :",
              parsed.error
            );
            throw new BadRequestError(
              typeof parsed.error === "string"
                ? parsed.error
                : parsed.error.message ||
                  "Erreur de génération de la requête JSON"
            );
          }

          const validated = SparnaturalQuery.parse(parsed);

          console.log(
            "[getJsonFromAgent] ✅ JSON validé après outil :",
            validated
          );
          return validated;
        }
      }

      console.warn("[getJsonFromAgent] ❌ Aucun outil reconnu dans toolCalls");
      throw new Error("Aucun outil reconnu dans toolCalls");
    } else {
      console.log("[getJsonFromAgent] ⚠️ Pas de toolCalls – réponse directe");

      const raw = firstChoice?.message?.content;
      console.log("[getJsonFromAgent] 📥 Réponse brute sans outil :", raw);

      if (!raw || raw.trim() === "") {
        throw new Error("Réponse vide sans outil");
      }

      const rawClean = extractJsonFromMarkdown(raw);
      const parsed = JSON.parse(rawClean);

      if (
        "error" in parsed &&
        (typeof parsed.error === "string" || typeof parsed.error === "object")
      ) {
        console.warn(
          "[getJsonFromAgent] ⚠️ Erreur retournée par l'agent :",
          parsed.error
        );
        throw new BadRequestError(
          typeof parsed.error === "string"
            ? parsed.error
            : parsed.error.message || "Erreur de génération de la requête JSON"
        );
      }

      console.log("[getJsonFromAgent] 📦 JSON extrait :", parsed);
      const validated = SparnaturalQuery.parse(parsed);
      console.log("[getJsonFromAgent] ✅ JSON validé sans outil :", validated);
      return validated;
    }
  } catch (error: any) {
    if (error instanceof BadRequestError) {
      // on relaie l'erreur avec le bon code
      throw error;
    }

    if (error?.response?.data) {
      console.error(
        "[getJsonFromAgent] ❌ Erreur axios :",
        JSON.stringify(error.response.data, null, 2)
      );
    } else {
      console.error("[getJsonFromAgent] ❌ Erreur :", error.message || error);
    }

    throw new Error("Erreur lors de la génération ou validation du JSON");
  }
}
