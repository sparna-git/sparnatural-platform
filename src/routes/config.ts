import express from "express";
import fs from "fs";
import path from "path";
import yaml from "js-yaml";

const router = express.Router();

router.get("/", (req, res) => {
  const filePath = path.resolve(__dirname, "../../config/config.yaml");
  const fileContents = fs.readFileSync(filePath, "utf8");
  const data = yaml.load(fileContents);
  res.json(data);
});

export default router;
