import express from "express";
import axios from "axios";

const router = express.Router();

const SPARQL_ENDPOINT = "https://dbpedia.org/sparql";

// Cache en mémoire : clé = label en minuscule, valeur = résultat
const uriCache: { [key: string]: { results: { uri: string }[] } } = {};

router.get("/", async (req, res) => {
  let { label } = req.query;

  if (!label || typeof label !== "string") {
    return res
      .status(400)
      .json({ error: "Missing or invalid label parameter" });
  }

  label = label.trim();
  const labelKey = label.toLowerCase();

  // Vérifie si la requête est déjà dans le cache
  if (uriCache[labelKey]) {
    console.log(`Cache hit pour label "${label}"`);
    return res.json(uriCache[labelKey]);
  }

  console.log(
    `Cache miss pour label "${label}", exécution de la requête SPARQL...`
  );

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

    const results = response.data.results.bindings.map(
      (b: { x: { value: any } }) => ({
        uri: b.x.value,
      })
    );

    // Stocke dans le cache
    uriCache[labelKey] = { results };

    return res.json({ results });
  } catch (error) {
    console.error("Erreur lors de la requête SPARQL uriLookup:", error);
    return res.status(500).json({ error: "Erreur interne serveur" });
  }
});

export default router;
