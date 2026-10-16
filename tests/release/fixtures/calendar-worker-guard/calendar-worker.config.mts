import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = process.env.CALENDAR_E2E_SOURCE!;
const directory = process.env.CALENDAR_E2E_DIRECTORY!;
for (const path of [source, directory]) assert(path && isAbsolute(path) && resolve(path) === path);
// Import the full current original config; no Source config extraction/copy.
const original = (await import(pathToFileURL(join(source, "vitest.release-soak.config.ts")).href)).default;
assert(original && typeof original === "object" && original.test);
const cacheDir = join(directory, "vite-cache");
const setup = join(here, "calendarFault.setup.ts");
const report = join(directory, "vitest-report.json");
const vitestEntry = join(source, "node_modules/vitest/dist/index.js");
const driverEntry = join(source, "tests/release/autonomousYouthCareerDriver.ts");
const errorReporter = join(here, "calendarErrorWitness.reporter.mjs");
const originalAliases = Array.isArray(original.resolve.alias) ? original.resolve.alias
  : Object.entries(original.resolve.alias).map(([find, replacement]) => ({ find, replacement }));
const facts = { schemaVersion: 1, pid: process.pid, source, directory,
  originalInclude: original.test.include, originalExecArgv: original.test.execArgv,
  originalTestTimeout: original.test.testTimeout, originalHookTimeout: original.test.hookTimeout,
  originalMaxWorkers: original.test.maxWorkers, cacheDir, setup, report, vitestEntry, driverEntry, errorReporter,
  configLoader: "runner" };
const factsPath = join(directory, "config-facts.json");
const raw = JSON.stringify(facts, null, 2) + "\n";
try { writeFileSync(factsPath, raw, { flag: "wx" }); }
catch (error: any) {
  if (error.code !== "EEXIST" || readFileSync(factsPath, "utf8") !== raw) throw error;
}
export default { ...original, root: source, cacheDir,
  resolve: { ...original.resolve, alias: [
    { find: /^vitest$/, replacement: vitestEntry },
    { find: "@calendar-e2e-driver", replacement: driverEntry }, ...originalAliases] },
  server: { ...original.server, fs: { ...original.server?.fs,
    allow: [...(original.server?.fs?.allow ?? []), source, here, directory] } },
  test: { ...original.test, setupFiles: [...(original.test.setupFiles ?? []), setup],
    reporters: ["default", "json", errorReporter], outputFile: { json: report } },
};
