import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  DEFAULT_ROOT,
  STEAM_ACHIEVEMENT_IMPORT_PATHS,
  auditSteamAchievementImports,
} from "./lib/steamAchievementImports.mjs";

const checkOnly = process.argv.includes("--check");
const reportOnly = process.argv.includes("--report");
const normalizeLineEndings = (value) => value.replace(/\r\n?/g, "\n");

const report = auditSteamAchievementImports(DEFAULT_ROOT);

if (report.failures.length > 0) {
  console.error(JSON.stringify({
    status: "failed",
    failures: report.failures,
    counts: report.counts,
    fullGameImportAudit: report.fullGameImportAudit,
    youthImportAudit: report.youthImportAudit,
  }, null, 2));
  process.exit(1);
}

if (!checkOnly) {
  const fullGameOutputPath = path.resolve(
    DEFAULT_ROOT,
    STEAM_ACHIEVEMENT_IMPORT_PATHS.fullGameImportVdf,
  );
  const outputPath = path.resolve(
    DEFAULT_ROOT,
    STEAM_ACHIEVEMENT_IMPORT_PATHS.youthEarlyAccessImportVdf,
  );
  mkdirSync(path.dirname(fullGameOutputPath), { recursive: true });
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(fullGameOutputPath, report.generatedFullGameImportVdf, "utf8");
  writeFileSync(outputPath, report.generatedYouthImportVdf, "utf8");
  console.log(
    `Wrote ${STEAM_ACHIEVEMENT_IMPORT_PATHS.fullGameImportVdf} with ${report.counts.fullGameImportVdf} audited full-game achievements.`,
  );
  console.log(
    `Wrote ${STEAM_ACHIEVEMENT_IMPORT_PATHS.youthEarlyAccessImportVdf} with ${report.counts.youthEarlyAccess} Youth EA achievements.`,
  );
}

if (checkOnly) {
  if (report.currentFullGameImportSource === null) {
    console.error(
      `${STEAM_ACHIEVEMENT_IMPORT_PATHS.fullGameImportVdf} is missing; run the generator first.`,
    );
    process.exit(1);
  }

  if (report.currentYouthImportSource === null) {
    console.error(
      `${STEAM_ACHIEVEMENT_IMPORT_PATHS.youthEarlyAccessImportVdf} is missing; run the generator first.`,
    );
    process.exit(1);
  }

  if (
    normalizeLineEndings(report.currentFullGameImportSource)
    !== normalizeLineEndings(report.generatedFullGameImportVdf)
  ) {
    console.error(
      `${STEAM_ACHIEVEMENT_IMPORT_PATHS.fullGameImportVdf} is out of date; rerun npm run steam:generate-achievement-imports.`,
    );
    process.exit(1);
  }

  if (
    normalizeLineEndings(report.currentYouthImportSource)
    !== normalizeLineEndings(report.generatedYouthImportVdf)
  ) {
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
    fullGameImportAudit: report.fullGameImportAudit,
    youthImportAudit: report.youthImportAudit,
  }, null, 2));
}
