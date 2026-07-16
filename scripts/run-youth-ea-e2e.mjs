import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const playwrightCli = resolve(root, "node_modules/@playwright/test/cli.js");

const coreFiles = [
  "e2e/flows/new-game.spec.ts",
  "e2e/flows/save-load.spec.ts",
  "e2e/flows/report-writing.spec.ts",
  "e2e/flows/career-paths.spec.ts",
  "e2e/flows/report-marketplace.spec.ts",
  "e2e/flows/youth-early-access.spec.ts",
  "e2e/flows/international-youth.spec.ts",
  "e2e/flows/world-history.spec.ts",
  "e2e/flows/world-history-comparison.spec.ts",
  "e2e/flows/future-roadmap.spec.ts",
  "e2e/flows/academy-placement-case.spec.ts",
  "e2e/flows/observation-interactivity.spec.ts",
  "e2e/screens/rivals.spec.ts",
  "e2e/regression/achievement-toast-clickthrough.spec.ts",
  "e2e/regression/report-validation-delay.spec.ts",
  "e2e/regression/weekly-advancement-equivalence.spec.ts",
  "e2e/regression/week-simulation-interactivity.spec.ts",
  "e2e/regression/quick-interaction-integrity.spec.ts",
];

const groups = [
  { id: "core", files: coreFiles },
  { id: "organic-career", files: ["e2e/flows/organic-career-journey.spec.ts"] },
];

for (const group of groups) {
  console.info(`YOUTH_EA_E2E_GROUP_START ${group.id}`);
  const result = spawnSync(
    process.execPath,
    [
      playwrightCli,
      "test",
      ...group.files,
      "--workers=1",
      "--retries=0",
    ],
    {
      cwd: root,
      stdio: "inherit",
      env: {
        ...process.env,
        PLAYWRIGHT_OUTPUT_DIR: `test-results/youth-ea-${group.id}`,
        PLAYWRIGHT_HTML_OUTPUT_DIR: `playwright-report/youth-ea-${group.id}`,
      },
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.info(`YOUTH_EA_E2E_GROUP_PASS ${group.id}`);
}

console.info("YOUTH_EA_E2E_PASS groups=2 retries=0");
