import express from "express";
import cors from "cors"; // Importer le middleware CORS
import summarizeRoute from "./routes/query2text";
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
import path from "path";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const swaggerDocument = YAML.load(path.join(__dirname, "../docs/openapi.yaml"));

// Configuration CORS
const corsOptions = {
  origin: "*", // Autorise toutes les origines
  methods: ["GET", "POST"], // Méthodes HTTP autorisées
  allowedHeaders: ["Content-Type", "Authorization"], // En-têtes autorisés
};

app.use(cors(corsOptions)); // Activer CORS avec les options
app.use(express.json());

// CECI permet de servir les fichiers dans ./public
app.use(express.static(path.join(__dirname, "../public")));

app.use("/:projectKey/api/v1/query2text", summarizeRoute);
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.listen(PORT, () => {
  console.log(`Sparnatural service API listening on port ${PORT}`);
});
