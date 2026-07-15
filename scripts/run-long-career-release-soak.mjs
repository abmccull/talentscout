import { execFileSync, spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { dirname, resolve } from "node:path";

const seedCount = Number.parseInt(process.env.SOAK_SEEDS ?? "20", 10);
const seasonCount = Number.parseInt(process.env.SOAK_SEASONS ?? "30", 10);
const defaultConcurrency = Math.min(3, Math.max(1, availableParallelism() - 1));
const concurrency = Number.parseInt(
  process.env.SOAK_CONCURRENCY ?? String(defaultConcurrency),
  10,
);
const outputPath = resolve(
  process.env.SOAK_OUTPUT
    ?? "artifacts/release/generated/long-career-release-summary.json",
);
const workerDirectory = resolve(
  process.env.SOAK_WORKER_DIRECTORY
    ?? "artifacts/release/generated/long-career-workers",
);
const vitestEntry = resolve("node_modules/vitest/vitest.mjs");

if (!Number.isInteger(seedCount) || seedCount <= 0) throw new Error("SOAK_SEEDS must be positive");
if (!Number.isInteger(seasonCount) || seasonCount <= 0) throw new Error("SOAK_SEASONS must be positive");
if (!Number.isInteger(concurrency) || concurrency <= 0 || concurrency > seedCount) {
  throw new Error("SOAK_CONCURRENCY must be positive and no greater than SOAK_SEEDS");
}
if (concurrency > 8) {
  throw new Error("SOAK_CONCURRENCY cannot exceed 8; each isolated career has a large memory budget");
}

const currentHeadSha = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: process.cwd(),
  encoding: "utf8",
}).trim().toLowerCase();
const configuredCandidateSha = (
  process.env.SOAK_CANDIDATE_SHA
  ?? process.env.RELEASE_CANDIDATE_SHA
  ?? process.env.GITHUB_SHA
  ?? currentHeadSha
).trim().toLowerCase();
if (!/^[a-f0-9]{40,64}$/.test(configuredCandidateSha)) {
  throw new Error("SOAK_CANDIDATE_SHA must be a full Git commit SHA");
}
if (configuredCandidateSha !== currentHeadSha) {
  throw new Error(
    `Soak candidate ${configuredCandidateSha} does not match HEAD ${currentHeadSha}`,
  );
}
const worktreeStatus = execFileSync(
  "git",
  ["status", "--porcelain", "--untracked-files=all"],
  { cwd: process.cwd(), encoding: "utf8" },
).trim();
const sourceTreeClean = worktreeStatus.length === 0;
const requireCleanCandidate = process.env.SOAK_REQUIRE_CLEAN_CANDIDATE === "true";
if (requireCleanCandidate && !sourceTreeClean) {
  throw new Error("Refusing to certify a long-career soak from a dirty working tree");
}

await mkdir(workerDirectory, { recursive: true });

async function runWorker(seedIndex, suffix = "run") {
  const workerOutput = resolve(
    workerDirectory,
    `seed-${String(seedIndex).padStart(2, "0")}-${suffix}.json`,
  );
  try {
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
  } catch (error) {
    await writeFile(
      workerOutput.replace(/\.json$/, "-failure.json"),
      `${JSON.stringify({
        schemaVersion: 1,
        evidenceKind: "long-career-worker-failure",
        generatedAt: new Date().toISOString(),
        candidateCommitSha: currentHeadSha,
        seedIndex,
        seed: `release-soak-${String(seedIndex).padStart(2, "0")}`,
        seasonCount,
        message: error instanceof Error ? error.message : String(error),
      }, null, 2)}\n`,
      "utf8",
    );
    throw error;
  }
  return JSON.parse(await readFile(workerOutput, "utf8"));
}

const runs = new Array(seedCount);
let profile;
let nextSeedIndex = 1;
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (true) {
      const seedIndex = nextSeedIndex;
      nextSeedIndex += 1;
      if (seedIndex > seedCount) return;
      const result = await runWorker(seedIndex);
      profile ??= result.profile;
      // Preserve deterministic seed ordering even though workers finish out of order.
      runs[seedIndex - 1] = result.runs[0];
    }
  }),
);
const replayResult = await runWorker(1, "determinism-replay");
const persistenceReplay = replayResult.runs[0];
if (persistenceReplay.digest !== runs[0].digest) {
  throw new Error(
    `Determinism failure for ${runs[0].seed}: ${runs[0].digest} != ${persistenceReplay.digest}`,
  );
}
const finalWorktreeStatus = execFileSync(
  "git",
  ["status", "--porcelain", "--untracked-files=all"],
  { cwd: process.cwd(), encoding: "utf8" },
).trim();
const candidateTreeClean = sourceTreeClean && finalWorktreeStatus.length === 0;
if (requireCleanCandidate && !candidateTreeClean) {
  throw new Error("Long-career soak mutated the exact candidate working tree");
}

const percentile = (values, fraction) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
};
const round = (value) => Math.round(value * 100) / 100;
const retentionCollectionKeys = Object.keys(profile.collectionByteBudgets ?? {});
const summary = {
  schemaVersion: 3,
  evidenceKind: "long-career-release-soak",
  generatedAt: new Date().toISOString(),
  candidateCommitSha: currentHeadSha,
  candidateBound: candidateTreeClean,
  sourceTreeClean: candidateTreeClean,
  status: candidateTreeClean ? "Passed" : "Supporting",
  profile: {
    ...profile,
    seedCount,
    seasonCount,
    concurrency,
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
    largestSingleSeasonGrowthBytes: Math.max(
      ...runs.flatMap((run) => run.seasonGrowth.map((sample) => sample.growthBytes)),
    ),
    totalCompactionRemovedBytes: runs.reduce(
      (sum, run) => sum + run.compaction.totalRemovedBytes,
      0,
    ),
    compactionCollectionDeltas: Object.fromEntries(
      retentionCollectionKeys.map((key) => [
        key,
        runs.reduce((sum, run) => sum + run.compaction.collectionDeltas[key], 0),
      ]),
    ),
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
