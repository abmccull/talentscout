import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const seedCount = Number.parseInt(process.env.SOAK_SEEDS ?? "20", 10);
const seasonCount = Number.parseInt(process.env.SOAK_SEASONS ?? "30", 10);
const outputPath = resolve(
  process.env.SOAK_OUTPUT ?? "artifacts/soak/long-career-release-summary.json",
);
const workerDirectory = resolve("artifacts/soak/workers");
const vitestEntry = resolve("node_modules/vitest/vitest.mjs");

if (!Number.isInteger(seedCount) || seedCount <= 0) throw new Error("SOAK_SEEDS must be positive");
if (!Number.isInteger(seasonCount) || seasonCount <= 0) throw new Error("SOAK_SEASONS must be positive");

await mkdir(workerDirectory, { recursive: true });

async function runWorker(seedIndex, suffix = "run") {
  const workerOutput = resolve(
    workerDirectory,
    `seed-${String(seedIndex).padStart(2, "0")}-${suffix}.json`,
  );
  await new Promise((resolveWorker, rejectWorker) => {
    const child = spawn(
      process.execPath,
      [
        "--expose-gc",
        vitestEntry,
        "run",
        "--config",
        "vitest.release-soak.config.ts",
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          SOAK_SEEDS: "1",
          SOAK_SEED_START: String(seedIndex),
          SOAK_SEASONS: String(seasonCount),
          SOAK_OUTPUT: workerOutput,
          SOAK_WORKER_MODE: "true",
          SOAK_DIAGNOSTIC_ONLY: "false",
        },
        stdio: "inherit",
      },
    );
    child.once("error", rejectWorker);
    child.once("exit", (code, signal) => {
      if (code === 0) resolveWorker();
      else rejectWorker(new Error(`Soak worker ${seedIndex} failed (${signal ?? code})`));
    });
  });
  return JSON.parse(await readFile(workerOutput, "utf8"));
}

const runs = [];
let profile;
for (let seedIndex = 1; seedIndex <= seedCount; seedIndex++) {
  const result = await runWorker(seedIndex);
  profile ??= result.profile;
  runs.push(result.runs[0]);
}
const replayResult = await runWorker(1, "determinism-replay");
const persistenceReplay = replayResult.runs[0];
if (persistenceReplay.digest !== runs[0].digest) {
  throw new Error(
    `Determinism failure for ${runs[0].seed}: ${runs[0].digest} != ${persistenceReplay.digest}`,
  );
}

const percentile = (values, fraction) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
};
const round = (value) => Math.round(value * 100) / 100;
const summary = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  profile: {
    ...profile,
    seedCount,
    seasonCount,
    processIsolation: "one-seeded-career-per-process",
    explicitGcAtSeasonBoundaries: true,
    deterministicReplaySeed: runs[0].seed,
  },
  aggregate: {
    totalCanonicalTicks: runs.reduce((sum, run) => sum + run.canonicalTicks, 0),
    totalCalendarWeeksSpanned: runs.reduce((sum, run) => sum + run.calendarWeeksSpanned, 0),
    largestSaveBytes: Math.max(...runs.map((run) => run.peakBytes)),
    largestFinalToInitialRatio: Math.max(...runs.map((run) => run.finalToInitialRatio)),
    peakHeapUsedBytes: Math.max(...runs.map((run) => run.memory.peakHeapUsedBytes)),
    peakRssBytes: Math.max(...runs.map((run) => run.memory.peakRssBytes)),
    weeklyLatencyMs: {
      p50: round(percentile(runs.map((run) => run.weeklyLatencyMs.p50), 0.5)),
      p95: round(percentile(runs.map((run) => run.weeklyLatencyMs.p95), 0.95)),
      max: round(Math.max(...runs.map((run) => run.weeklyLatencyMs.max))),
    },
  },
  runs,
  persistenceReplay,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.info(`LONG_CAREER_RELEASE_GATE ${JSON.stringify(summary.aggregate)}`);
