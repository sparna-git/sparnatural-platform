import axios from "axios";
import { SparnaturalQuery } from "../../zod/query";
import { z } from "zod";
import { EmptyRequestError } from "../../errors/emptyRequestError";
import { ConfigProvider } from "../../config/ConfigProvider";
import { ReconcileServiceIfc } from "../ReconcileServiceIfc";
import { SparqlReconcileService } from "../SparqlReconcileService";
import { Text2QueryServiceIfc } from "../interfaces/text2QueryServiceIfc";

export class OldText2QueryService implements Text2QueryServiceIfc {
  async generateJson(
    naturalLanguageQuery: string,
    projectKey: string
  ): Promise<z.infer<typeof SparnaturalQuery>> {
    let config = ConfigProvider.getInstance().getConfig();
    const projectConfig = config["projects"]?.[projectKey];

    const agentIdTextToQuery =
      projectConfig?.["endpoints-agents"]?.["MISTRAL_AGENT_ID_text_2_query"];

    if (!agentIdTextToQuery) {
      throw new Error(
        `Agent ID text_2_query non configuré pour le projet ${projectKey}`
      );
    }

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
      const labelsToResolve: Record<string, { query: string; type?: string }> =
        {};
      let idx = 0;

      // Récupérer les labels
      // --- collectLabels adapté au nouveau modèle ---
      function collectLabels(obj: any, parentType?: string) {
        if (Array.isArray(obj)) {
          obj.forEach((item) => collectLabels(item, parentType));
        } else if (obj && typeof obj === "object") {
          // Cas spécifique : LabelledCriteria<RdfTermCriteria>
          if (
            obj.criteria &&
            obj.criteria.rdfTerm &&
            obj.criteria.rdfTerm.type === "uri" &&
            obj.criteria.rdfTerm.value ===
              "https://services.sparnatural.eu/api/v1/URI_NOT_FOUND"
          ) {
            labelsToResolve[`label_${idx++}`] = {
              query: obj.label, // label vient du LabelledCriteria
              type: parentType || undefined,
            };
          }

          // Si c'est un line avec criterias, on les parcourt
          if (obj.line && obj.line.criterias) {
            obj.line.criterias.forEach((c: any) =>
              collectLabels(c, obj.line.oType || obj.line.sType)
            );
          }

          // Parcours récursif des autres champs
          Object.entries(obj).forEach(([key, v]) => {
            if (key !== "criterias") {
              collectLabels(v, parentType);
            }
          });
        }
      }

      collectLabels(parsed);
      console.log(`[getJsonFromAgent] 🏷️ Labels à résoudre :`, labelsToResolve);
      // 3. Appeler la reconciliation si besoin
      if (Object.keys(labelsToResolve).length > 0) {
        console.log(
          `[getJsonFromAgent] 🔎 Reconciliation utilisée pour ${
            Object.keys(labelsToResolve).length
          } label(s):`,
          Object.values(labelsToResolve).map((l) => l.query)
        );

        // 🔄 Direct call au lieu d'un POST HTTP
        const SPARQL_ENDPOINT =
          ConfigProvider.getInstance().getConfig().projects[projectKey]
            ?.sparqlEndpoint;
        if (!SPARQL_ENDPOINT) {
          throw new Error(
            "SPARQL endpoint not configured for project " + projectKey
          );
        }

        const queries = SparqlReconcileService.parseQueries(labelsToResolve);
        let reconcile: ReconcileServiceIfc = new SparqlReconcileService(
          projectKey,
          SPARQL_ENDPOINT
        );
        const uriRes: Record<string, { result: any[] }> =
          await reconcile.reconcileQueries(
            queries,
            false // includeTypes si besoin
          );

        // 4. Remplacer les URI_NOT_FOUND par les URI trouvées
        let resolvedIdx = 0;

        // fonction récursive pour injecter les URIs
        function injectUris(obj: any) {
          if (Array.isArray(obj)) {
            obj.forEach(injectUris);
          } else if (obj && typeof obj === "object") {
            // Cas spécifique : LabelledCriteria<RdfTermCriteria>
            if (
              obj.criteria &&
              obj.criteria.rdfTerm &&
              obj.criteria.rdfTerm.type === "uri" &&
              obj.criteria.rdfTerm.value ===
                "https://services.sparnatural.eu/api/v1/URI_NOT_FOUND"
            ) {
              // we don't necessarily have a best result
              let bestResult = undefined;

              const key = `label_${resolvedIdx++}`;
              const results = uriRes[key]?.result;

              if (results && results.length > 0) {
                // Find the result with the highest score
                bestResult = results?.reduce((best, current) =>
                  current.score > best.score ? current : best
                );
              }

              console.log(
                `[getJsonFromAgent] 🔗 Résolution du label "${obj.label}" vers`,
                bestResult || "Aucune URI trouvée"
              );

              if (bestResult?.id) {
                obj.criteria.rdfTerm.value = bestResult.id;
              }
            }

            Object.values(obj).forEach(injectUris);
          }
        }

        // Injection des URIs
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
      console.log("[getJsonFromAgent] ✅ JSON final généré :", parsed);
      const validated = SparnaturalQuery.parse(parsed);
      return validated;
    } catch (error: any) {
      if (error instanceof EmptyRequestError) throw error;
      console.error("[getJsonFromAgent] ❌ Erreur :", error.message || error);
      throw new Error(
        "Erreur lors de la génération ou validation du JSON : " +
          (error.message || error)
      );
    }
  }
}
