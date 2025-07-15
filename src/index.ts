import express from "express";
import cors from "cors";
import path from "path";
import dotenv from "dotenv";
import fs from "fs";
import yaml from "js-yaml";
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");

import summarizeRoute from "./routes/query2text";
import generateRoute from "./routes/text2query";
import uriLookupRoute from "./routes/urilookup";
import adminRoute from "./routes/admin";
import configRoute from "./routes/config";
import { checkDomainMiddleware } from "./middleware/checkDomainMiddleware";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Swagger doc
const swaggerDocument = YAML.load(path.join(__dirname, "../docs/openapi.yaml"));

// CORS
const corsOptions = {
  origin: "*",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

// Config YAML
const config = yaml.load(
  fs.readFileSync(path.join(__dirname, "../config/config.yaml"), "utf8")
);

// Logs généraux
app.use((req, res, next) => {
  console.log(`🔍 ${req.method} ${req.originalUrl}`);
  next();
});

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static("public"));

// Routes sécurisées
app.use(
  "/api/v1/:projectKey/query2text",
  checkDomainMiddleware,
  summarizeRoute
);
app.use("/api/v1/:projectKey/text2query", checkDomainMiddleware, generateRoute);
app.use("/api/v1/:projectKey/urilookup", checkDomainMiddleware, uriLookupRoute);

// Swagger
app.use("/api/v1", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Admin
app.use("/", adminRoute);

// Start server
app.listen(PORT, () => {
  console.log(`✅ Sparnatural service API listening on port ${PORT}`);
});
