import express from "express";
import axios from "axios";
import config from "./config"; // ton fichier config.ts exportant la config YAML

const router = express.Router();

const MAX_RESULTS = 10;

router.get("/", async (req, res) => {
  const projectKey = req.baseUrl.split("/")[3];
  let { name } = req.query;

  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "Missing or invalid name parameter" });
  }

  // Vérifier que le projectKey existe dans la config
  if (!config.projects || !config.projects[projectKey]) {
    return res.status(400).json({ error: `Unknown projectKey: ${projectKey}` });
  }

  // Récupérer dynamiquement le endpoint SPARQL
  const SPARQL_ENDPOINT = config.projects[projectKey].sparqlEndpoint;
  if (!SPARQL_ENDPOINT) {
    return res.status(500).json({ error: "SPARQL endpoint not configured" });
  }

  name = name.trim();
  const escapedName = name.replace(/"/g, '\\"');

  console.log(
    `🔎 Recherche pour le nom : "${name}" sur endpoint ${SPARQL_ENDPOINT}`
  );

  try {
    // Première requête
    const query1 = `
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      SELECT ?x WHERE {
        ?x rdfs:label ?literal .
        FILTER(LCASE(STR(?literal)) = LCASE("${escapedName}"))
      }
      LIMIT ${MAX_RESULTS}
    `;

    const url1 = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(
      query1
    )}&format=json`;
    const response1 = await axios.get(url1, { timeout: 60000, family: 4 });
    const bindings1 = response1.data.results.bindings;

    if (bindings1.length > 0) {
      console.log(`✅ Résultats trouvés avec rdfs:label`);
      const results = bindings1.map((b: { x: { value: string } }) => ({
        uri: b.x.value,
      }));
      return res.json({ results });
    }

    // Deuxième requête si pas de résultats
    console.log(
      `🔁 Aucun résultat avec rdfs:label, tentative avec autres prédicats...`
    );

    const query2 = `
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
      PREFIX foaf: <http://xmlns.com/foaf/0.1/>
      PREFIX dct: <http://purl.org/dc/terms/>
      PREFIX dc: <http://purl.org/dc/elements/1.1/>
      PREFIX schema: <http://schema.org/>
      SELECT ?x WHERE {
        ?x skos:prefLabel|skos:altLabel|skos:notation|foaf:name|dct:title ?literal .
        FILTER(LCASE(STR(?literal)) = LCASE("${escapedName}"))
      }
      LIMIT ${MAX_RESULTS}
    `;

    const url2 = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(
      query2
    )}&format=json`;
    const response2 = await axios.get(url2, { timeout: 60000, family: 4 });
    const bindings2 = response2.data.results.bindings;

    const results = bindings2.map((b: { x: { value: string } }) => ({
      uri: b.x.value,
    }));

    return res.json({ results });
  } catch (error) {
    console.error("❌ Erreur lors de la requête SPARQL uriLookup:", error);
    return res.status(500).json({ error: "Erreur interne serveur" });
  }
});

export default router;
