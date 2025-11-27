import { Text2QueryServiceIfc } from "../interfaces/Text2QueryServiceIfc";
import { z } from "zod";
import { SparnaturalQuery } from "../../zod/query";
import { ReconcileServiceIfc } from "../ReconcileServiceIfc";
import { SparqlReconcileService } from "../SparqlReconcileService";
import { ConfigProvider } from "../../config/ConfigProvider";
import { Mistral } from "@mistralai/mistralai";
import schema from "../../schemas/SparnaturalQuery.schema.json";
import { injectable } from "tsyringe";

@injectable({token: "MistralText2QueryService"})
// this indicates it is the default implementation for this service
@injectable({token: "default:text2query"})
export class MistralText2QueryService implements Text2QueryServiceIfc {
  private mistral = new Mistral({
    apiKey: process.env.MISTRAL_API_KEY!,
  });

  async generateJson(
    naturalLanguageQuery: string,
    projectKey: string
  ): Promise<z.infer<typeof SparnaturalQuery>> {
    const config = ConfigProvider.getInstance().getConfig();
    const agentId =
      config.projects?.[projectKey]?.["endpoints-agents"]
        ?.MISTRAL_AGENT_ID_text_2_query;

    if (!agentId) {
      throw new Error(`Agent ID text_2_query non configuré pour ${projectKey}`);
    }

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
      const endpoint = config.projects?.[projectKey]?.sparqlEndpoint;
      const queries = SparqlReconcileService.parseQueries(labelsToResolve);

      const rec: ReconcileServiceIfc = new SparqlReconcileService(
        projectKey,
        endpoint
      );

      const uriRes = await rec.reconcileQueries(queries, false);

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
