import axios from "axios";

export async function getSummaryFromAgent(
  jsonQuery: object,
  lang: string
): Promise<string> {
  try {
    const response = await axios.post(
      "https://api.mistral.ai/v1/agents/completions",
      {
        agent_id: process.env.MISTRAL_AGENT_ID,
        messages: [
          {
            role: "user",
            content: JSON.stringify(jsonQuery, null, 2),
          },
        ],
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
    console.error("Erreur Mistral :", error?.response?.data || error.message);
    return "Erreur lors de la génération avec Mistral.";
  }
}
