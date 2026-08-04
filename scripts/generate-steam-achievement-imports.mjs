import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  DEFAULT_ROOT,
  STEAM_ACHIEVEMENT_IMPORT_PATHS,
  auditSteamAchievementImports,
} from "./lib/steamAchievementImports.mjs";

const checkOnly = process.argv.includes("--check");
const reportOnly = process.argv.includes("--report");

const report = auditSteamAchievementImports(DEFAULT_ROOT);

if (report.failures.length > 0) {
  console.error(JSON.stringify({
    status: "failed",
    failures: report.failures,
    counts: report.counts,
    missingReservedFromFullGame: report.missingReservedFromFullGame,
  }, null, 2));
  process.exit(1);
}

if (!checkOnly) {
  const outputPath = path.resolve(
    DEFAULT_ROOT,
    STEAM_ACHIEVEMENT_IMPORT_PATHS.youthEarlyAccessImportVdf,
  );
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, report.generatedYouthImportVdf, "utf8");
  console.log(
    `Wrote ${STEAM_ACHIEVEMENT_IMPORT_PATHS.youthEarlyAccessImportVdf} with ${report.counts.youthEarlyAccess} Youth EA achievements.`,
  );
}

if (checkOnly) {
  if (report.currentYouthImportSource === null) {
    console.error(
      `${STEAM_ACHIEVEMENT_IMPORT_PATHS.youthEarlyAccessImportVdf} is missing; run the generator first.`,
    );
    process.exit(1);
  }

  if (report.currentYouthImportSource !== report.generatedYouthImportVdf) {
    console.error(
      `${STEAM_ACHIEVEMENT_IMPORT_PATHS.youthEarlyAccessImportVdf} is out of date; rerun npm run steam:generate-achievement-imports.`,
    );
    process.exit(1);
  }
}

if (reportOnly || checkOnly) {
  console.log(JSON.stringify({
    status: "passed",
    counts: report.counts,
    missingReservedFromFullGame: report.missingReservedFromFullGame,
  }, null, 2));
}
