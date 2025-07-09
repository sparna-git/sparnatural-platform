import express from "express";
import axios from "axios";

const router = express.Router();

const SPARQL_ENDPOINT = "https://dbpedia.org/sparql";

// Cache en mémoire : clé = name en minuscule, valeur = résultat
const uriCache: { [key: string]: { results: { uri: string }[] } } = {};

router.get("/", async (req, res) => {
  let { name } = req.query;

  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "Missing or invalid name parameter" });
  }

  name = name.trim();
  const nameKey = name.toLowerCase();

  // Vérifie si la requête est déjà dans le cache
  if (uriCache[nameKey]) {
    console.log(`Cache hit pour name "${name}"`);
    return res.json(uriCache[nameKey]);
  }

  console.log(
    `Cache miss pour name "${name}", exécution de la requête SPARQL...`
  );

  try {
    const escapedname = name.replace(/"/g, '\\"');

    const sparqlQuery = `
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
      PREFIX foaf: <http://xmlns.com/foaf/0.1/>
      PREFIX dct: <http://purl.org/dc/terms/>
      PREFIX dc: <http://purl.org/dc/elements/1.1/>
      PREFIX schema: <http://schema.org/>
      SELECT ?x WHERE {
        ?x rdfs:label|skos:prefLabel|skos:altLabel|skos:notation|foaf:name|dct:title ?literal .
        FILTER(LCASE(STR(?literal)) = LCASE("${escapedname}"))
      }
      LIMIT 15
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
    uriCache[nameKey] = { results };

    return res.json({ results });
  } catch (error) {
    console.error("Erreur lors de la requête SPARQL uriLookup:", error);
    return res.status(500).json({ error: "Erreur interne serveur" });
  }
});

export default router;
