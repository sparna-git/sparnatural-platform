import { Text2QueryServiceIfc } from "../interfaces/Text2QueryServiceIfc";
import { string, z } from "zod";
import { SparnaturalQuery } from "../../zod/query";
import { ReconcileServiceIfc } from "../ReconcileServiceIfc";
import { SparqlReconcileService } from "../SparqlReconcileService";
import { Mistral } from "@mistralai/mistralai";
import schema from "../../schemas/SparnaturalQuery.schema.json";
import { inject, injectable } from "tsyringe";
import { MistralText2QueryServiceConfig } from "../../config/ProjectConfig";

@injectable({ token: "MistralText2QueryService" })
// this indicates it is the default implementation for this service
@injectable({ token: "default:text2query" })
export class MistralText2QueryService implements Text2QueryServiceIfc {
  private mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY! });

  private reconciliation: ReconcileServiceIfc;
  private config: MistralText2QueryServiceConfig;

  constructor(
    @inject("reconciliation") reconciliationServiceIfc?: ReconcileServiceIfc,
    @inject("text2query.config")
    text2queryConfig?: MistralText2QueryServiceConfig
  ) {
    this.reconciliation = reconciliationServiceIfc!;
    this.config = text2queryConfig!;
  }

  async generateJson(
    naturalLanguageQuery: string
  ): Promise<z.infer<typeof SparnaturalQuery>> {
    const agentId = this.config.agentId;
    console.log("Agent ID Text2Query:", agentId);

    // Appel Mistral
    const result = await this.mistral.agents.complete({
      agentId,
      messages: [
        {
          role: "user",
          content: naturalLanguageQuery,
        },
      ],
      responseFormat: {
        type: "json_schema",
        jsonSchema: {
          name: "SparnaturalQuery",
          schemaDefinition: schema,
          strict: true,
        },
      },
    });

    // Extraction contenu
    function normalizeContent(content: any): string {
      if (!content) return "";
      if (typeof content === "string") return content;
      if (Array.isArray(content))
        return content.map((c) => c.text ?? c.output_text ?? "").join("");
      return "";
    }

    const raw = normalizeContent(result.choices?.[0]?.message?.content);

    if (!raw || raw.trim() === "") {
      throw new Error("Réponse vide de l'agent IA");
    }

    // JSON propre
    const parsed = JSON.parse(raw);

    // Reconciliation des URI_NOT_FOUND
    const labelsToResolve: Record<string, { query: string; type?: string }> =
      {};
    let idx = 0;

    function collectLabels(obj: any, parentType?: string) {
      if (Array.isArray(obj))
        return obj.forEach((i) => collectLabels(i, parentType));
      if (!obj || typeof obj !== "object") return;

      if (
        obj.criteria?.rdfTerm?.type === "uri" &&
        obj.criteria.rdfTerm.value ===
          "https://services.sparnatural.eu/api/v1/URI_NOT_FOUND"
      ) {
        labelsToResolve[`label_${idx++}`] = {
          query: obj.label,
          type: parentType,
        };
      }

      if (obj.line?.criterias) {
        obj.line.criterias.forEach((c: any) =>
          collectLabels(c, obj.line.oType || obj.line.sType)
        );
      }

      Object.values(obj).forEach((v) => collectLabels(v, parentType));
    }

    collectLabels(parsed);

    if (Object.keys(labelsToResolve).length > 0) {
      console.log(
        `[getJsonFromAgent] 🔎 Reconciliation utilisée pour ${
          Object.keys(labelsToResolve).length
        } label(s):`,
        Object.values(labelsToResolve).map((l) => l.query)
      );

      const queries = SparqlReconcileService.parseQueries(labelsToResolve);

      const uriRes: Record<string, { result: any[] }> =
        await this.reconciliation.reconcileQueries(queries, false);

      let resolvedIdx = 0;
      function injectUris(obj: any) {
        if (Array.isArray(obj)) return obj.forEach(injectUris);
        if (!obj || typeof obj !== "object") return;

        if (
          obj.criteria?.rdfTerm?.value ===
          "https://services.sparnatural.eu/api/v1/URI_NOT_FOUND"
        ) {
          const key = `label_${resolvedIdx++}`;
          const results = uriRes[key]?.result;

          const best = results?.sort((a, b) => b.score - a.score)[0];
          if (best?.id) obj.criteria.rdfTerm.value = best.id;
        }

        Object.values(obj).forEach(injectUris);
      }

      injectUris(parsed);

      delete parsed.metadata;
    }

    // Validation finale
    return SparnaturalQuery.parse(parsed);
  }
}
