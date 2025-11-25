import { Mistral } from "@mistralai/mistralai";
import { Query2TextServiceIfc } from "../interfaces/query2TextServiceIfc";
import { ConfigProvider } from "../../config/ConfigProvider";

export class MistralQuery2TextService implements Query2TextServiceIfc {
  private mistral = new Mistral({
    apiKey: process.env.MISTRAL_API_KEY!,
  });

  async generateSummary(
    jsonQuery: object,
    lang: string,
    projectKey: string
  ): Promise<string> {
    const config = ConfigProvider.getInstance().getConfig();
    const agentId =
      config.projects?.[projectKey]?.["endpoints-agents"]
        ?.MISTRAL_AGENT_ID_query_2_text;

    if (!agentId) {
      throw new Error(`Agent ID query_2_text manquant pour ${projectKey}`);
    }

    const result = await this.mistral.agents.complete({
      agentId,
      messages: [
        {
          role: "user",
          content:
            `LANGUAGE=${lang}\n` +
            "SUMMARIZE THIS SPARNATURAL QUERY:\n\n" +
            JSON.stringify(jsonQuery, null, 2),
        },
      ],
      responseFormat: { type: "text" },
    });

    const content = result.choices?.[0]?.message?.content;
    console.log("Mistral response content:", content);
    if (typeof content === "string") {
      return content;
    } else if (Array.isArray(content)) {
      return content
        .filter((chunk) => chunk.type === "text")
        .map((chunk) => (chunk as any).text || "")
        .join("");
    }
    return "Réponse vide.";
  }
}
