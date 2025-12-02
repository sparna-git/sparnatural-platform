import axios from "axios";
import { SparnaturalQuery } from "../../zod/query";
import { z } from "zod";
import { EmptyRequestError } from "../../errors/emptyRequestError";
import { ReconcileServiceIfc } from "../ReconcileServiceIfc";
import { SparqlReconcileService } from "../SparqlReconcileService";
import { Text2QueryServiceIfc } from "../interfaces/Text2QueryServiceIfc";
import { inject, injectable } from "tsyringe";
import { RestText2QueryServiceConfig } from "../../config/ProjectConfig";

@injectable({ token: "RestText2QueryService" })
export class RestText2QueryService implements Text2QueryServiceIfc {
  private reconciliation: ReconcileServiceIfc;
  private config: RestText2QueryServiceConfig;

  constructor(
    @inject("reconciliation") reconcileServiceIfc?: ReconcileServiceIfc,
    @inject("text2query.config") text2queryConfig?: RestText2QueryServiceConfig
  ) {
    this.reconciliation = reconcileServiceIfc!;
    this.config = text2queryConfig!;
  }

  async generateJson(
    naturalLanguageQuery: string
  ): Promise<z.infer<typeof SparnaturalQuery>> {
    const agentIdTextToQuery = this.config.agentId;

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

      const labelsToResolve: Record<string, { query: string; type?: string }> =
        {};
      let idx = 0;

      // Set pour éviter les doublons
      const seen = new Set<string>();

      function collectLabels(obj: any, parentType?: string) {
        if (Array.isArray(obj)) {
          return obj.forEach((i) => collectLabels(i, parentType));
        }
        if (!obj || typeof obj !== "object") return;

        if (
          obj.criteria?.rdfTerm?.type === "uri" &&
          obj.criteria.rdfTerm.value ===
            "https://services.sparnatural.eu/api/v1/URI_NOT_FOUND"
        ) {
          const label = obj.label?.trim().toLowerCase();

          // ↩️ Déjà vu ? On ignore.
          if (label && !seen.has(label)) {
            seen.add(label);
            labelsToResolve[`label_${idx++}`] = {
              query: obj.label,
              type: parentType,
            };
          }
        }

        // Critères enfant
        if (obj.line?.criterias) {
          obj.line.criterias.forEach((c: any) =>
            collectLabels(c, obj.line.oType || obj.line.sType)
          );
        }

        // Exploration récursive
        Object.values(obj).forEach((v) => collectLabels(v, parentType));
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

        const queries = SparqlReconcileService.parseQueries(labelsToResolve);

        const uriRes: Record<string, { result: any[] }> =
          await this.reconciliation.reconcileQueries(
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
