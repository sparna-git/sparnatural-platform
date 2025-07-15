import express from "express";
import cors from "cors";
import summarizeRoute from "./routes/query2text";
import generateRoute from "./routes/text2query";
import uriLookupRoute from "./routes/urilookup"; // Import de la nouvelle route
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
import path from "path";
import dotenv from "dotenv";
import adminRoute from "./routes/admin";
import { checkDomainMiddleware } from "./middleware/checkDomainMiddleware";

const fs = require("fs");
const yaml = require("js-yaml");

import configRoute from "./routes/config";

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

// import config.yaml to get the Mistral agent IDs
const config = yaml.load(
  fs.readFileSync(path.join(__dirname, "../config/config.yaml"), "utf8")
);

app.use(cors(corsOptions));
app.use(express.json());

app.use(express.static("public"));

// config.yaml
//app.use("/config", configRoute);

// Route d'administration
//app.use("/admin", adminRoute);

// API : Résumé texte d'une requête Sparnatural
app.use(
  "/api/v1/:projectKey/query2text",
  checkDomainMiddleware,
  summarizeRoute
);

// API : Génération d'une requête Sparnatural depuis du texte
app.use("/api/v1/:projectKey/text2query", checkDomainMiddleware, generateRoute);

// API : Recherche d'URI à partir d'un label
app.use("/api/v1/:projectKey/urilookup", checkDomainMiddleware, uriLookupRoute);

// Documentation Swagger
app.use("/api/v1", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.use("/", adminRoute);

// Lancer le serveur
app.listen(PORT, () => {
  console.log(`✅ Sparnatural service API listening on port ${PORT}`);
});
