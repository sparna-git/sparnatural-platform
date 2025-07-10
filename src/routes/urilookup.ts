import express from "express";
import axios from "axios";

const router = express.Router();

const SPARQL_ENDPOINT = "https://dbpedia.org/sparql";
const MAX_RESULTS = 10;

router.get("/", async (req, res) => {
  let { name } = req.query;

  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "Missing or invalid name parameter" });
  }

  name = name.trim();
  const escapedName = name.replace(/"/g, '\\"');

  console.log(`🔎 Recherche pour le nom : "${name}"`);

  try {
    // 1️⃣ Requête rdfs:label uniquement
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

    // 2️⃣ Si aucun résultat, deuxième requête sans rdfs:label
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
