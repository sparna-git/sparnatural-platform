/**
 * text2query-test.ts
 *
 * Script de test automatisé pour la route text2query.
 * Lit des sous-dossiers de test, appelle l'API N fois par query,
 * compare la structure JSON retournée avec le expected.json,
 * et génère un rapport Excel + sauvegarde chaque réponse brute.
 *
 * Usage:
 *   npx ts-node src/tests/text2query-test.ts \
 *     --testsDir ./tests/text2query \
 *     --endpoint http://localhost:3000/api/v1/dbpedia-en/text2query \
 *     --runs 3 \
 *     --outputDir ./src/tests/test-report
 */

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT:", err);
  process.exit(1);
});

import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import ExcelJS from "exceljs";
import { Command } from "commander";

// CLI args
interface CliArgs {
  testsDir: string;
  endpoint: string;
  runs: number;
  outputDir: string;
  reportFile: string;
}

// setup de l'environnement
function parseArgs(): CliArgs {
  const program = new Command();
  program
    .name("text2query-test")
    .description(
      "Exécute des tests text2query depuis des sous-dossiers query.txt/expected.json",
    )
    .requiredOption(
      "--testsDir <path>",
      "Dossier racine contenant les tests (lecture récursive)",
    )
    .requiredOption(
      "--endpoint <url>",
      "URL complète de l'endpoint text2query (ex: http://localhost:3000/api/v1/dbpedia-en/text2query)",
    )
    .option("--runs <number>", "Nombre d'exécutions par test", "3")
    .option(
      "--outputDir <path>",
      "Dossier de sortie (miroir des tests + exécutions + rapport)",
      "./src/tests/test-report",
    )
    .option("--reportFile <name>", "Nom du rapport Excel", "test-report.xlsx")
    .addHelpText(
      "after",
      "\nExemple:\n  npx ts-node src/tests/text2query-test.ts --testsDir ./src/tests/text2query --endpoint http://localhost:3000/api/v1/dbpedia-en/text2query --runs 2 --outputDir ./src/tests/test-report",
    )
    .parse(process.argv);

  const opts = program.opts() as {
    testsDir: string;
    endpoint: string;
    runs: string;
    outputDir: string;
    reportFile: string;
  };

  const runs = Number.parseInt(opts.runs, 10);
  if (Number.isNaN(runs) || runs <= 0) {
    console.error("Paramètre invalide: --runs doit être un entier > 0");
    process.exit(1);
  }

  return {
    testsDir: opts.testsDir,
    endpoint: opts.endpoint,
    runs,
    outputDir: opts.outputDir,
    reportFile: opts.reportFile,
  };
}

function listTestCaseDirsRecursively(rootDir: string): string[] {
  const found: string[] = [];

  const walk = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let hasQuery = false;
    let hasExpected = false;

    for (const entry of entries) {
      if (entry.isFile() && entry.name === "query.txt") hasQuery = true;
      if (entry.isFile() && entry.name === "expected.json") hasExpected = true;
    }

    if (hasQuery && hasExpected) {
      found.push(dir);
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name));
      }
    }
  };

  walk(rootDir);
  return found.sort();
}

// ─── Structure comparison ────────────────────────────────────────────

/** Retourne la partie locale d'un URI (après # ou dernier /) pour des diffs lisibles */
function shortUri(uri: string | undefined): string {
  if (!uri) return String(uri);
  const hashIdx = uri.lastIndexOf("#");
  if (hashIdx !== -1) return uri.slice(hashIdx + 1);
  const slashIdx = uri.lastIndexOf("/");
  if (slashIdx !== -1) return uri.slice(slashIdx + 1);
  return uri;
}

interface ComparisonResult {
  match: boolean;
  differences: string[];
}

/**
 * Compare la structure de la réponse API avec le expected.json.
 * On vérifie :
 *  - type, subType (query level)
 *  - where.subject.rdfType
 *  - predicateObjectPairs : prédicats présents/manquants dans les deux sens, object rdfType
 *
 * On ignore :
 *  - les noms de variables (Person_1 vs person_1)
 *  - metadata.explanation
 *  - filtres et valeurs
 *  - l'ordre des predicateObjectPairs (on match par predicate URI)
 */
function compareQueryStructure(actual: any, expected: any): ComparisonResult {
  const diffs: string[] = [];

  // Top-level type/subType
  if (actual?.type !== expected?.type) {
    diffs.push(`type: got "${actual?.type}", expected "${expected?.type}"`);
  }
  if (actual?.subType !== expected?.subType) {
    diffs.push(
      `subType: got "${actual?.subType}", expected "${expected?.subType}"`,
    );
  }

  // Where block — chain vide = niveau racine
  compareWhereBlock(actual?.where, expected?.where, [], diffs);

  return { match: diffs.length === 0, differences: diffs };
}

/** Formate une chaîne de prédicats : ["A", "B"] → "A > B" */
function chainStr(chain: string[], pred?: string): string {
  const parts = pred ? [...chain, pred] : chain;
  return parts.join(" > ");
}

/**
 * Compare deux listes de predicateObjectPairs de manière bidirectionnelle.
 * `chain` contient les prédicats parcourus jusqu'ici pour afficher le chemin complet.
 */
function compareNestedPairs(
  actPairs: any[],
  expPairs: any[],
  chain: string[],
  diffs: string[],
): void {
  // expected → actual : manquants
  for (const expPair of expPairs) {
    const expUri = expPair.predicate?.value;
    if (!expUri) continue;
    const expShort = shortUri(expUri);

    const matchingActual = actPairs.find((a: any) => a.predicate?.value === expUri);

    if (!matchingActual) {
      if (chain.length === 0) {
        diffs.push(`MISSING: ${expShort}`);
      } else {
        diffs.push(`MISSING nested (inside ${chain.join(" > ")}): ${expShort}`);
      }
      const expNested = expPair.object?.predicateObjectPairs || [];
      if (expNested.length > 0) {
        compareNestedPairs([], expNested, [...chain, expShort], diffs);
      }
      continue;
    }

    // Object rdfType
    if (expPair.object?.variable?.rdfType &&
        matchingActual.object?.variable?.rdfType !== expPair.object.variable.rdfType) {
      diffs.push(
        `WRONG TYPE on ${chainStr(chain, expShort)}: got "${shortUri(matchingActual.object?.variable?.rdfType)}", expected "${shortUri(expPair.object.variable.rdfType)}"`,
      );
    }

    // Récursion — le chain porte le type de l'objet courant pour des messages lisibles
    const expNested = expPair.object?.predicateObjectPairs || [];
    const actNested = matchingActual.object?.predicateObjectPairs || [];
    if (expNested.length > 0 || actNested.length > 0) {
      const objType =
        shortUri(expPair.object?.variable?.rdfType) || expShort;
      compareNestedPairs(actNested, expNested, [...chain, objType], diffs);
    }
  }

  // actual → expected : extras
  for (const actPair of actPairs) {
    const actUri = actPair.predicate?.value;
    if (!actUri) continue;
    const actShort = shortUri(actUri);

    const matchingExpected = expPairs.find((e: any) => e.predicate?.value === actUri);

    if (!matchingExpected) {
      if (chain.length === 0) {
        diffs.push(`EXTRA:   ${actShort}`);
      } else {
        diffs.push(`EXTRA nested (inside ${chain.join(" > ")}): ${actShort}`);
      }
      const actNested = actPair.object?.predicateObjectPairs || [];
      if (actNested.length > 0) {
        compareNestedPairs(actNested, [], [...chain, actShort], diffs);
      }
    }
  }
}

function compareWhereBlock(
  actual: any,
  expected: any,
  chain: string[],
  diffs: string[],
): void {
  if (!expected) return;
  if (!actual) {
    diffs.push(`MISSING: where block`);
    return;
  }

  // subject rdfType
  if (expected.subject?.rdfType && actual.subject?.rdfType !== expected.subject.rdfType) {
    diffs.push(
      `WRONG SUBJECT: got "${shortUri(actual.subject?.rdfType)}", expected "${shortUri(expected.subject.rdfType)}"`,
    );
  }

  const expPairs = expected.predicateObjectPairs || [];
  const actPairs = actual.predicateObjectPairs || [];

  // expected → actual : manquants
  for (const expPair of expPairs) {
    const expUri = expPair.predicate?.value;
    if (!expUri) continue;
    const expShort = shortUri(expUri);

    const matchingActual = actPairs.find((a: any) => a.predicate?.value === expUri);

    if (!matchingActual) {
      if (chain.length === 0) {
        diffs.push(`MISSING: ${expShort}`);
      } else {
        diffs.push(`MISSING nested (inside ${chain.join(" > ")}): ${expShort}`);
      }
      const expNestedPairs = expPair.object?.predicateObjectPairs || [];
      if (expNestedPairs.length > 0) {
        compareNestedPairs([], expNestedPairs, [...chain, expShort], diffs);
      }
      continue;
    }

    // Object rdfType
    if (expPair.object?.variable?.rdfType &&
        matchingActual.object?.variable?.rdfType !== expPair.object.variable.rdfType) {
      diffs.push(
        `WRONG TYPE on ${chainStr(chain, expShort)}: got "${shortUri(matchingActual.object?.variable?.rdfType)}", expected "${shortUri(expPair.object.variable.rdfType)}"`,
      );
    }

    // Nested predicateObjectPairs — le chain porte le type de l'objet courant
    const expNestedPairs = expPair.object?.predicateObjectPairs || [];
    const actNestedPairs = matchingActual.object?.predicateObjectPairs || [];
    if (expNestedPairs.length > 0 || actNestedPairs.length > 0) {
      const objType =
        shortUri(expPair.object?.variable?.rdfType) || expShort;
      compareNestedPairs(actNestedPairs, expNestedPairs, [...chain, objType], diffs);
    }

    // Nested where
    if (expPair.object?.where) {
      compareWhereBlock(matchingActual.object?.where, expPair.object.where, [...chain, expShort], diffs);
    }

    // Children pattern
    if (expPair.object?.children) {
      compareWhereBlock(matchingActual.object?.children, expPair.object.children, [...chain, expShort], diffs);
    }
  }

  // actual → expected : extras
  for (const actPair of actPairs) {
    const actUri = actPair.predicate?.value;
    if (!actUri) continue;
    const actShort = shortUri(actUri);

    const matchingExpected = expPairs.find((e: any) => e.predicate?.value === actUri);

    if (!matchingExpected) {
      if (chain.length === 0) {
        diffs.push(`EXTRA:   ${actShort}`);
      } else {
        diffs.push(`EXTRA nested (inside ${chain.join(" > ")}): ${actShort}`);
      }
      const actNestedPairs = actPair.object?.predicateObjectPairs || [];
      if (actNestedPairs.length > 0) {
        compareNestedPairs(actNestedPairs, [], [...chain, actShort], diffs);
      }
    }
  }
}

// Test runner

interface TestCaseResult {
  testName: string;
  query: string;
  runIndex: number;
  status: "OK" | "KO" | "ERROR";
  differences: string;
  reasoning: string;
  responseTime: number;
  responseFile: string;
}

async function callText2Query(
  endpoint: string,
  queryText: string,
): Promise<{ data: any; responseTime: number }> {
  const start = Date.now();

  const response = await axios.get(endpoint, {
    params: {
      text: queryText,
      reconcile: "false", // for testing the skip of reconciliation
    },
    timeout: 140000,
  });

  return {
    data: response.data,
    responseTime: Date.now() - start,
  };
}

async function runTests(config: CliArgs): Promise<TestCaseResult[]> {
  const results: TestCaseResult[] = [];
  const testsDir = path.resolve(config.testsDir);
  const outputRoot = path.resolve(config.outputDir);

  if (!fs.existsSync(testsDir)) {
    console.error(`Dossier de tests introuvable : ${testsDir}`);
    process.exit(1);
  }

  if (!fs.existsSync(outputRoot)) {
    fs.mkdirSync(outputRoot, { recursive: true });
  }

  // Lister récursivement les dossiers de test qui contiennent query.txt + expected.json
  const testDirs = listTestCaseDirsRecursively(testsDir);

  console.log(`\n${testDirs.length} test(s) trouvé(s) dans ${testsDir}\n`);

  for (const testPath of testDirs) {
    const testName =
      path.relative(testsDir, testPath) || path.basename(testPath);
    const queryFile = path.join(testPath, "query.txt");
    const expectedFile = path.join(testPath, "expected.json");
    const testOutputDir = path.join(outputRoot, testName);
    const executionDir = path.join(testOutputDir, "output");

    fs.mkdirSync(executionDir, { recursive: true });

    // Copier les fichiers de référence pour conserver l'arborescence complète
    fs.copyFileSync(queryFile, path.join(testOutputDir, "query.txt"));
    fs.copyFileSync(expectedFile, path.join(testOutputDir, "expected.json"));

    // Vérifier que les fichiers existent
    if (!fs.existsSync(queryFile)) {
      console.warn(`⚠️  ${testName}: query.txt manquant, skip`);
      continue;
    }
    if (!fs.existsSync(expectedFile)) {
      console.warn(`⚠️  ${testName}: expected.json manquant, skip`);
      continue;
    }

    const queryText = fs.readFileSync(queryFile, "utf-8").trim();
    const expectedJson = JSON.parse(fs.readFileSync(expectedFile, "utf-8"));

    // Support pour expected.json contenant un tableau de variantes
    const expectedVariants: any[] = Array.isArray(expectedJson)
      ? expectedJson
      : [expectedJson];

    console.log(`${testName}: "${queryText}" (${config.runs} run(s))`);

    for (let run = 1; run <= config.runs; run++) {
      const baseRunName = `run${run}`;
      const responseFileName = `${baseRunName}-response.json`;
      const errorFileName = `${baseRunName}-error.json`;
      const responseFilePath = path.join(executionDir, responseFileName);
      const errorFilePath = path.join(executionDir, errorFileName);

      try {
        const { data, responseTime } = await callText2Query(
          config.endpoint,
          queryText,
        );

        // Sauvegarder la réponse brute
        fs.writeFileSync(responseFilePath, JSON.stringify(data, null, 2));

        // Comparer avec chaque variante expected — prendre le meilleur match
        let bestResult: ComparisonResult = {
          match: false,
          differences: ["No expected variant matched"],
        };

        for (const expected of expectedVariants) {
          const result = compareQueryStructure(data, expected);
          if (result.match) {
            bestResult = result;
            break;
          }
          // Garder le résultat avec le moins de différences
          if (
            result.differences.length < bestResult.differences.length ||
            bestResult.differences[0] === "No expected variant matched"
          ) {
            bestResult = result;
          }
        }

        const status = bestResult.match ? "OK" : "KO";
        console.log(
          ` Run ${run}: ${status} (${responseTime}ms)${
            bestResult.differences.length > 0
              ? " — " + bestResult.differences[0]
              : ""
          }`,
        );

        results.push({
          testName,
          query: queryText,
          runIndex: run,
          status,
          differences: bestResult.differences.join(" | "),
          reasoning: Array.isArray(data?.metadata?.reasoning)
            ? data.metadata.reasoning.join(" → ")
            : data?.metadata?.reasoning || "",
          responseTime,
          responseFile: path.relative(outputRoot, responseFilePath),
        });
      } catch (error: any) {
        const errMsg =
          error.response?.data?.message || error.message || "Unknown error";
        console.log(` Run ${run}: ERROR — ${errMsg}`);

        // Sauvegarder l'erreur
        fs.writeFileSync(
          errorFilePath,
          JSON.stringify(
            {
              error: errMsg,
              status: error.response?.status,
              data: error.response?.data,
            },
            null,
            2,
          ),
        );

        results.push({
          testName,
          query: queryText,
          runIndex: run,
          status: "ERROR",
          differences: errMsg,
          reasoning: "",
          responseTime: 0,
          responseFile: path.relative(outputRoot, errorFilePath),
        });
      }

      // Petit délai entre les appels pour pas surcharger l'API
      if (run < config.runs) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    console.log("");
  }

  return results;
}

// Excel report generation

async function generateReport(
  results: TestCaseResult[],
  outputPath: string,
): Promise<void> {
  const wb = new ExcelJS.Workbook();

  // Sheet 1 : Détail de chaque run
  const detailSheet = wb.addWorksheet("Résultats détaillés");

  detailSheet.columns = [
    { header: "Test", key: "testName", width: 25 },
    { header: "Query", key: "query", width: 45 },
    { header: "Run #", key: "runIndex", width: 8 },
    { header: "Status", key: "status", width: 10 },
    { header: "Différences", key: "differences", width: 60 },
    { header: "Reasoning", key: "reasoning", width: 80 },
    { header: "Temps (ms)", key: "responseTime", width: 12 },
    { header: "Fichier réponse", key: "responseFile", width: 30 },
  ];

  // Header style
  detailSheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF2F5496" },
    };
    cell.alignment = { horizontal: "center" };
  });

  // Data rows
  for (const r of results) {
    const row = detailSheet.addRow(r);
    const statusCell = row.getCell("status");

    if (r.status === "OK") {
      statusCell.font = { bold: true, color: { argb: "FF008000" } };
    } else if (r.status === "KO") {
      statusCell.font = { bold: true, color: { argb: "FFFF0000" } };
    } else {
      statusCell.font = { bold: true, color: { argb: "FFFF8C00" } };
    }
  }

  // Auto-filter
  detailSheet.autoFilter = {
    from: "A1",
    to: `H${results.length + 1}`,
  };

  // Sheet 2 : Résumé par test
  const summarySheet = wb.addWorksheet("Résumé");

  summarySheet.columns = [
    { header: "Test", key: "testName", width: 25 },
    { header: "Query", key: "query", width: 45 },
    { header: "Total runs", key: "totalRuns", width: 12 },
    { header: "OK", key: "ok", width: 8 },
    { header: "KO", key: "ko", width: 8 },
    { header: "ERROR", key: "error", width: 8 },
    { header: "Taux réussite", key: "successRate", width: 15 },
    { header: "Temps moyen (ms)", key: "avgTime", width: 18 },
  ];

  summarySheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF2F5496" },
    };
    cell.alignment = { horizontal: "center" };
  });

  // Group by test name
  const grouped = new Map<string, TestCaseResult[]>();
  for (const r of results) {
    if (!grouped.has(r.testName)) grouped.set(r.testName, []);
    grouped.get(r.testName)!.push(r);
  }

  for (const [testName, runs] of grouped) {
    const ok = runs.filter((r) => r.status === "OK").length;
    const ko = runs.filter((r) => r.status === "KO").length;
    const err = runs.filter((r) => r.status === "ERROR").length;
    const avgTime = Math.round(
      runs.reduce((s, r) => s + r.responseTime, 0) / runs.length,
    );
    const successRate = `${Math.round((ok / runs.length) * 100)}%`;

    const row = summarySheet.addRow({
      testName,
      query: runs[0].query,
      totalRuns: runs.length,
      ok,
      ko,
      error: err,
      successRate,
      avgTime,
    });

    // Coloriser le taux de réussite
    const rateCell = row.getCell("successRate");
    if (ok === runs.length) {
      rateCell.font = { bold: true, color: { argb: "FF008000" } };
    } else if (ok === 0) {
      rateCell.font = { bold: true, color: { argb: "FFFF0000" } };
    } else {
      rateCell.font = { bold: true, color: { argb: "FFFF8C00" } };
    }
  }

  summarySheet.autoFilter = {
    from: "A1",
    to: `H${grouped.size + 1}`,
  };

  // Sheet 3 : Stats globales
  const statsSheet = wb.addWorksheet("Stats globales");
  const totalOk = results.filter((r) => r.status === "OK").length;
  const totalKo = results.filter((r) => r.status === "KO").length;
  const totalErr = results.filter((r) => r.status === "ERROR").length;
  const totalRuns = results.length;

  const statsData = [
    ["Métrique", "Valeur"],
    ["Total tests", grouped.size],
    ["Total runs", totalRuns],
    ["OK", totalOk],
    ["KO", totalKo],
    ["ERROR", totalErr],
    ["Taux réussite global", `${Math.round((totalOk / totalRuns) * 100)}%`],
    [
      "Temps moyen (ms)",
      Math.round(results.reduce((s, r) => s + r.responseTime, 0) / totalRuns),
    ],
  ];

  for (const [i, row] of statsData.entries()) {
    statsSheet.addRow(row);
    if (i === 0) {
      statsSheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF2F5496" },
        };
      });
    }
  }
  statsSheet.getColumn(1).width = 25;
  statsSheet.getColumn(2).width = 20;

  // Sauvegarde
  await wb.xlsx.writeFile(outputPath);
  console.log(`Rapport généré : ${outputPath}`);
}

// Main Test Runner

async function main() {
  const config = parseArgs();
  const reportPath = path.join(
    path.resolve(config.outputDir),
    config.reportFile,
  );

  console.log("============================================");
  console.log(" Text2Query Test Runner");
  console.log("============================================");
  console.log(`Tests dir  : ${config.testsDir}`);
  console.log(`Endpoint   : ${config.endpoint}`);
  console.log(`Runs/test  : ${config.runs}`);
  console.log(`Output dir : ${config.outputDir}`);
  console.log(`Report     : ${reportPath}`);
  console.log(`Reconcile  : disabled`);
  console.log("============================================\n");

  const results = await runTests(config);
  fs.mkdirSync(path.resolve(config.outputDir), { recursive: true });
  await generateReport(results, reportPath);

  // Résumé final
  const ok = results.filter((r) => r.status === "OK").length;
  const total = results.length;
  const pct = Math.round((ok / total) * 100);

  console.log(`\n============================================`);
  console.log(`  ${ok}/${total} runs OK (${pct}%)`);

  // Exit code non-zero si pas 100%
  if (ok < total) process.exit(1);
}

main().catch((err) => {
  console.error("Erreur fatale :", err);
  console.error(err.stack);
  process.exit(1);
});

// to test npx ts-node src/tests/text2query-test.ts --testsDir ./src/tests/text2query --endpoint http://localhost:3000/api/v1/dbpedia-en/text2query --runs 2 --outputDir ./src/tests/test-report --reportFile test-report.xlsx

// Object values (URIs)
/*
    const expValues = (expPair.object?.values || [])
      .map((v: any) => v.value)
      .sort();
    const actValues = (matchingActual.object?.values || [])
      .map((v: any) => v.value)
      .sort();

    if (expValues.length > 0) {
      const missingValues = expValues.filter(
        (v: string) => !actValues.includes(v),
      );
      if (missingValues.length > 0) {
        diffs.push(
          `${pathPrefix}.pair[${expPredicateUri}].values: missing URIs: ${missingValues.join(", ")}`,
        );
      }
    }*/
