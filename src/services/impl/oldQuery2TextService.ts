import axios from "axios";
import { Query2TextServiceIfc } from "../interfaces/query2TextServiceIfc";
import { ConfigProvider } from "../../config/ConfigProvider";

export class OldQuery2TextService implements Query2TextServiceIfc {
  async generateSummary(
    jsonQuery: object,
    lang: string,
    projectKey: string
  ): Promise<string> {
    try {
      let config = ConfigProvider.getInstance().getConfig();
      const projectConfig = config["projects"]?.[projectKey];

      const agentIdQueryToText =
        projectConfig?.["endpoints-agents"]?.["MISTRAL_AGENT_ID_query_2_text"];

      if (!agentIdQueryToText) {
        throw new Error(
          `Agent ID query_2_text non configuré pour le projet ${projectKey}`
        );
      }

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
        "Erreur Mistral (OldQuery2TextService.summarize) :",
        error?.response?.data || error.message
      );
      return "Erreur lors de la génération du résumé avec Mistral.";
    }
  }
}
