import express from "express";
import axios from "axios";

const router = express.Router();

const SPARQL_ENDPOINT = "https://dbpedia.org/sparql"; // Adapter si besoin

router.get("/", async (req, res) => {
  const { label } = req.query;

  if (!label || typeof label !== "string") {
    return res
      .status(400)
      .json({ error: "Missing or invalid label parameter" });
  }

  try {
    const escapedLabel = label.replace(/"/g, '\\"');

    const sparqlQuery = `
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
      PREFIX foaf: <http://xmlns.com/foaf/0.1/>
      PREFIX dct: <http://purl.org/dc/terms/>
      PREFIX dc: <http://purl.org/dc/elements/1.1/>
      PREFIX schema: <http://schema.org/>
      SELECT ?x WHERE {
        ?x rdfs:label|skos:prefLabel|skos:altLabel|skos:notation|foaf:name|dct:title ?literal .
        FILTER(LCASE(STR(?literal)) = LCASE("${escapedLabel}"))
      }
      LIMIT 10
    `;

    const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(
      sparqlQuery
    )}&format=json`;

    const response = await axios.get(url, { timeout: 60000, family: 4 });

    if (!response.data.results.bindings.length) {
      return res.json({ results: [] }); // Aucun résultat trouvé
    }

    const results = response.data.results.bindings.map((b: any) => ({
      uri: b.x.value,
    }));

    return res.json({ results });
  } catch (error) {
    console.error("Erreur lors de la requête SPARQL uriLookup:", error);
    return res.status(500).json({ error: "Erreur interne serveur" });
  }
});

export default router;
