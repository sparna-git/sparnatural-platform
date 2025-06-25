import express from "express";
import cors from "cors";
import summarizeRoute from "./routes/query2text";
import generateRoute from "./routes/text2query"; // 🚀 nouvelle route
import uriLookupRoute from "./routes/urilookup"; // Import de la nouvelle route
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
import path from "path";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Charger la documentation Swagger
const swaggerDocument = YAML.load(path.join(__dirname, "../docs/openapi.yaml"));

// Configuration CORS (à affiner selon production)
const corsOptions = {
  origin: "*",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.use(express.json());

// Servir les fichiers statiques depuis le dossier public
app.use(express.static(path.join(__dirname, "../public")));

// API : Résumé texte d'une requête Sparnatural
app.use("/:projectKey/api/v1/query2text", summarizeRoute);

// API : Génération d'une requête Sparnatural depuis du texte
app.use("/:projectKey/api/v1/text2query", generateRoute); // 🚀 nouvelle route

// API : Recherche d'URI à partir d'un label
app.use("/:projectKey/api/v1/urilookup", uriLookupRoute); // Nouvelle route pour URI lookup

// Documentation Swagger
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Lancer le serveur
app.listen(PORT, () => {
  console.log(`✅ Sparnatural service API listening on port ${PORT}`);
});
