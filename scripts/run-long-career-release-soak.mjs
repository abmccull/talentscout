import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { availableParallelism, cpus, totalmem } from "node:os";
import { dirname, resolve } from "node:path";

const CHECKPOINT_PROTOCOL_VERSION = 1;
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
const checkpointPath = resolve(workerDirectory, "checkpoint.json");
const vitestEntry = resolve("node_modules/vitest/vitest.mjs");
const planOnly = process.env.SOAK_PLAN_ONLY === "true";
const resumeRequested = process.env.SOAK_RESUME !== "false";
const maxSerializedBytes = Number.parseInt(
  process.env.SOAK_MAX_SERIALIZED_BYTES ?? String(80 * 1024 * 1024),
  10,
);

if (!Number.isInteger(seedCount) || seedCount <= 0) throw new Error("SOAK_SEEDS must be positive");
if (!Number.isInteger(seasonCount) || seasonCount <= 0) throw new Error("SOAK_SEASONS must be positive");
if (!Number.isInteger(concurrency) || concurrency <= 0 || concurrency > seedCount) {
  throw new Error("SOAK_CONCURRENCY must be positive and no greater than SOAK_SEEDS");
}
if (concurrency > 8) {
  throw new Error("SOAK_CONCURRENCY cannot exceed 8; each isolated career has a large memory budget");
}
if (!Number.isInteger(maxSerializedBytes) || maxSerializedBytes <= 0) {
  throw new Error("SOAK_MAX_SERIALIZED_BYTES must be positive");
}

function git(...args) {
  return execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim();
}

const currentHeadSha = git("rev-parse", "HEAD").toLowerCase();
const currentTreeSha = git("rev-parse", "HEAD^{tree}").toLowerCase();
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
const worktreeStatus = git("status", "--porcelain", "--untracked-files=all");
const sourceTreeClean = worktreeStatus.length === 0;
const requireCleanCandidate = process.env.SOAK_REQUIRE_CLEAN_CANDIDATE === "true";
if (requireCleanCandidate && !sourceTreeClean) {
  throw new Error("Refusing to certify a long-career soak from a dirty working tree");
}

const executionIdentity = {
  protocolVersion: CHECKPOINT_PROTOCOL_VERSION,
  candidateCommitSha: currentHeadSha,
  candidateTreeSha: currentTreeSha,
  seedCount,
  seasonCount,
  concurrency,
  maxSerializedBytes,
  profileKind: "full-canonical-weekly-career",
  processIsolation: "one-seeded-career-per-process",
  nodeVersion: process.version,
  nodeOptions: process.env.NODE_OPTIONS ?? "",
  platform: process.platform,
  architecture: process.arch,
  availableParallelism: availableParallelism(),
  totalMemoryBytes: totalmem(),
  cpuModel: cpus()[0]?.model ?? "unknown",
};
const executionIdentityHash = createHash("sha256")
  .update(JSON.stringify(executionIdentity))
  .digest("hex");
// A clean Git candidate is the content fingerprint. Supporting dirty-tree runs
// remain useful diagnostics, but their outputs are never resumed or certified.
const resumeEnabled = resumeRequested && sourceTreeClean;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function expectedSeed(seedIndex) {
  return `release-soak-${String(seedIndex).padStart(2, "0")}`;
}

function workerOutputPath(seedIndex, suffix = "run") {
  return resolve(
    workerDirectory,
    `seed-${String(seedIndex).padStart(2, "0")}-${suffix}.json`,
  );
}

function validateWorkerResult(result, seedIndex, requireCheckpoint) {
  const failures = [];
  const seed = expectedSeed(seedIndex);
  if (!isRecord(result) || result.schemaVersion !== 2) {
    return ["worker result schemaVersion must be 2"];
  }
  if (
    !isRecord(result.profile)
    || result.profile.kind !== executionIdentity.profileKind
    || result.profile.seedCount !== 1
    || result.profile.seasonCount !== seasonCount
    || result.profile.maxSerializedBytes !== maxSerializedBytes
    || !isRecord(result.profile.collectionByteBudgets)
  ) {
    failures.push("worker profile does not match the requested single-seed release profile");
  }
  if (!Array.isArray(result.runs) || result.runs.length !== 1 || !isRecord(result.runs[0])) {
    failures.push("worker result must contain exactly one run");
    return failures;
  }
  const run = result.runs[0];
  if (run.seed !== seed) failures.push(`worker seed must be ${seed}`);
  if (run.reachedSeason !== seasonCount + 1) {
    failures.push(`worker did not cross the season ${seasonCount} boundary`);
  }
  if (
    !Number.isInteger(run.canonicalTicks)
    || run.canonicalTicks !== run.calendarWeeksSpanned
    || run.canonicalTicks < seasonCount * 30
  ) {
    failures.push("worker did not process a complete canonical weekly timeline");
  }
  for (const key of [
    "initialBytes",
    "finalBytes",
    "peakBytes",
    "finalToInitialRatio",
    "worldHistorySeasons",
    "worldHistoryBytes",
  ]) {
    if (!isFiniteNumber(run[key])) failures.push(`worker run ${key} is invalid`);
  }
  if (!Array.isArray(run.seasonGrowth) || run.seasonGrowth.length !== seasonCount) {
    failures.push("worker is missing season-boundary growth evidence");
  } else if (run.seasonGrowth.some((sample) => (
    !isRecord(sample)
    || !isFiniteNumber(sample.growthBytes)
    || !isRecord(sample.collectionBytes)
    || !isRecord(sample.collectionCompactionDeltas)
  ))) {
    failures.push("worker season-boundary growth evidence is invalid");
  }
  if (!Array.isArray(run.worldHealth) || run.worldHealth.length !== seasonCount) {
    failures.push("worker is missing season-boundary world-health evidence");
  }
  if (
    !isRecord(run.compaction)
    || !isFiniteNumber(run.compaction.totalRemovedBytes)
    || !isRecord(run.compaction.collectionDeltas)
  ) {
    failures.push("worker compaction evidence is invalid");
  } else {
    for (const key of Object.keys(result.profile.collectionByteBudgets)) {
      if (!isFiniteNumber(run.compaction.collectionDeltas[key])) {
        failures.push(`worker compaction evidence is missing ${key}`);
      }
    }
  }
  if (
    !isRecord(run.memory)
    || !isFiniteNumber(run.memory.peakHeapUsedBytes)
    || !isFiniteNumber(run.memory.peakRssBytes)
  ) {
    failures.push("worker memory evidence is invalid");
  }
  if (
    !isRecord(run.weeklyLatencyMs)
    || !isFiniteNumber(run.weeklyLatencyMs.p50)
    || !isFiniteNumber(run.weeklyLatencyMs.p95)
    || !isFiniteNumber(run.weeklyLatencyMs.max)
  ) {
    failures.push("worker latency evidence is invalid");
  }
  if (typeof run.digest !== "string" || !/^[a-f0-9]{64}$/.test(run.digest)) {
    failures.push("worker deterministic digest is invalid");
  }
  if (requireCheckpoint) {
    const checkpoint = result.checkpoint;
    if (
      !isRecord(checkpoint)
      || checkpoint.protocolVersion !== CHECKPOINT_PROTOCOL_VERSION
      || checkpoint.executionIdentityHash !== executionIdentityHash
      || checkpoint.candidateCommitSha !== currentHeadSha
      || checkpoint.candidateTreeSha !== currentTreeSha
      || checkpoint.seedIndex !== seedIndex
      || checkpoint.seed !== seed
      || checkpoint.seasonCount !== seasonCount
    ) {
      failures.push("worker checkpoint belongs to another candidate, runtime, or soak profile");
    }
  }
  return failures;
}

async function readReusableWorker(seedIndex) {
  if (!resumeEnabled) {
    return {
      reusable: false,
      reason: resumeRequested
        ? "source tree is dirty; supporting runs cannot reuse checkpoints"
        : "resume disabled by SOAK_RESUME=false",
    };
  }
  const path = workerOutputPath(seedIndex);
  let result;
  try {
    result = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    return {
      reusable: false,
      reason: error && error.code === "ENOENT"
        ? "no checkpoint"
        : "checkpoint is unreadable or incomplete",
    };
  }
  const failures = validateWorkerResult(result, seedIndex, true);
  return failures.length === 0
    ? { reusable: true, result }
    : { reusable: false, reason: failures.join("; ") };
}

async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.partial-${process.pid}-${randomUUID()}`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  try {
    await rename(temporaryPath, path);
  } catch (error) {
    if (!error || !["EEXIST", "EPERM"].includes(error.code)) throw error;
    await rm(path, { force: true });
    await rename(temporaryPath, path);
  }
}

const inspections = await Promise.all(
  Array.from({ length: seedCount }, (_, index) => readReusableWorker(index + 1)),
);
const reusableSeedIndices = inspections
  .map((inspection, index) => inspection.reusable ? index + 1 : null)
  .filter((seedIndex) => seedIndex !== null);
const pendingSeedIndices = inspections
  .map((inspection, index) => inspection.reusable ? null : index + 1)
  .filter((seedIndex) => seedIndex !== null);
const rejectedCheckpoints = inspections
  .map((inspection, index) => inspection.reusable || inspection.reason === "no checkpoint"
    ? null
    : { seedIndex: index + 1, reason: inspection.reason })
  .filter((entry) => entry !== null);
const plan = {
  schemaVersion: 1,
  evidenceKind: "long-career-release-soak-plan",
  executionIdentity,
  executionIdentityHash,
  sourceTreeClean,
  resumeRequested,
  resumeEnabled,
  concurrency,
  reusableSeedIndices,
  pendingSeedIndices,
  rejectedCheckpoints,
  determinismReplayRequired: true,
};

if (planOnly) {
  console.info(`SOAK_RELEASE_PLAN ${JSON.stringify(plan)}`);
  process.exit(0);
}

await mkdir(workerDirectory, { recursive: true });
console.info(`SOAK_RELEASE_PLAN ${JSON.stringify(plan)}`);

const runs = new Array(seedCount);
let profile;
const seedStates = new Map(
  Array.from({ length: seedCount }, (_, index) => [
    index + 1,
    inspections[index].reusable ? "Reused" : "Pending",
  ]),
);
for (const seedIndex of reusableSeedIndices) {
  const result = inspections[seedIndex - 1].result;
  profile ??= result.profile;
  runs[seedIndex - 1] = result.runs[0];
}

let checkpointWrite = Promise.resolve();
function writeProgress(status, failure = null) {
  const snapshot = {
    schemaVersion: 1,
    evidenceKind: "long-career-release-soak-checkpoint",
    generatedAt: new Date().toISOString(),
    status,
    candidateCommitSha: currentHeadSha,
    candidateTreeSha: currentTreeSha,
    executionIdentity,
    executionIdentityHash,
    sourceTreeCleanAtStart: sourceTreeClean,
    resumable: resumeEnabled,
    completedSeedIndices: [...seedStates]
      .filter(([, state]) => state === "Completed" || state === "Reused")
      .map(([seedIndex]) => seedIndex),
    activeSeedIndices: [...seedStates]
      .filter(([, state]) => state === "Active")
      .map(([seedIndex]) => seedIndex),
    pendingSeedIndices: [...seedStates]
      .filter(([, state]) => state === "Pending")
      .map(([seedIndex]) => seedIndex),
    failedSeedIndices: [...seedStates]
      .filter(([, state]) => state === "Failed")
      .map(([seedIndex]) => seedIndex),
    failure,
  };
  checkpointWrite = checkpointWrite.then(() => writeJsonAtomic(checkpointPath, snapshot));
  return checkpointWrite;
}

function assertCandidateUnchanged() {
  const head = git("rev-parse", "HEAD").toLowerCase();
  const tree = git("rev-parse", "HEAD^{tree}").toLowerCase();
  const status = git("status", "--porcelain", "--untracked-files=all");
  if (head !== currentHeadSha || tree !== currentTreeSha || (sourceTreeClean && status.length > 0)) {
    throw new Error("Long-career soak candidate changed while workers were running");
  }
}

async function runWorker(seedIndex, suffix = "run") {
  assertCandidateUnchanged();
  const workerOutput = workerOutputPath(seedIndex, suffix);
  const temporaryWorkerOutput = `${workerOutput}.partial-${process.pid}-${randomUUID()}.json`;
  const startedAt = Date.now();
  console.info(
    `SOAK_WORKER_START seed=${seedIndex}/${seedCount} suffix=${suffix} active=${[
      ...seedStates.values(),
    ].filter((state) => state === "Active").length}`,
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
            SOAK_OUTPUT: temporaryWorkerOutput,
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
    const result = JSON.parse(await readFile(temporaryWorkerOutput, "utf8"));
    const failures = validateWorkerResult(result, seedIndex, false);
    if (failures.length > 0) {
      throw new Error(`Soak worker ${seedIndex} emitted invalid evidence: ${failures.join("; ")}`);
    }
    const completedResult = {
      ...result,
      checkpoint: {
        protocolVersion: CHECKPOINT_PROTOCOL_VERSION,
        executionIdentityHash,
        candidateCommitSha: currentHeadSha,
        candidateTreeSha: currentTreeSha,
        seedIndex,
        seed: expectedSeed(seedIndex),
        seasonCount,
        completedAt: new Date().toISOString(),
        elapsedMs: Date.now() - startedAt,
      },
    };
    await writeJsonAtomic(workerOutput, completedResult);
    await rm(workerOutput.replace(/\.json$/, "-failure.json"), { force: true });
    console.info(
      `SOAK_WORKER_COMPLETE seed=${seedIndex}/${seedCount} suffix=${suffix} elapsedMinutes=${(
        (Date.now() - startedAt) / 60_000
      ).toFixed(2)}`,
    );
    return completedResult;
  } catch (error) {
    await writeJsonAtomic(
      workerOutput.replace(/\.json$/, "-failure.json"),
      {
        schemaVersion: 2,
        evidenceKind: "long-career-worker-failure",
        generatedAt: new Date().toISOString(),
        candidateCommitSha: currentHeadSha,
        candidateTreeSha: currentTreeSha,
        executionIdentityHash,
        seedIndex,
        seed: expectedSeed(seedIndex),
        seasonCount,
        message: error instanceof Error ? error.message : String(error),
      },
    );
    throw error;
  } finally {
    await rm(temporaryWorkerOutput, { force: true });
  }
}

await writeProgress("InProgress");
try {
  let nextPendingIndex = 0;
  const workerSettlements = await Promise.allSettled(
    Array.from({ length: Math.min(concurrency, pendingSeedIndices.length) }, async () => {
      while (true) {
        const pendingIndex = nextPendingIndex;
        nextPendingIndex += 1;
        const seedIndex = pendingSeedIndices[pendingIndex];
        if (seedIndex === undefined) return;
        seedStates.set(seedIndex, "Active");
        await writeProgress("InProgress");
        try {
          const result = await runWorker(seedIndex);
          profile ??= result.profile;
          runs[seedIndex - 1] = result.runs[0];
          seedStates.set(seedIndex, "Completed");
          await writeProgress("InProgress");
        } catch (error) {
          seedStates.set(seedIndex, "Failed");
          await writeProgress(
            "Failed",
            error instanceof Error ? error.message : String(error),
          );
          throw error;
        }
      }
    }),
  );
  const failedWorker = workerSettlements.find((settlement) => settlement.status === "rejected");
  if (failedWorker?.status === "rejected") throw failedWorker.reason;

  if (runs.some((run) => !run) || !profile) {
    throw new Error("Long-career soak completed without a result for every requested seed");
  }
  // The replay is intentionally fresh even after a resumed run. Reusing it
  // would turn checkpoint presence into a substitute for determinism proof.
  const replayResult = await runWorker(1, "determinism-replay");
  const persistenceReplay = replayResult.runs[0];
  if (persistenceReplay.digest !== runs[0].digest) {
    throw new Error(
      `Determinism failure for ${runs[0].seed}: ${runs[0].digest} != ${persistenceReplay.digest}`,
    );
  }
  assertCandidateUnchanged();
  const finalWorktreeStatus = git("status", "--porcelain", "--untracked-files=all");
  const finalHeadSha = git("rev-parse", "HEAD").toLowerCase();
  const finalTreeSha = git("rev-parse", "HEAD^{tree}").toLowerCase();
  const candidateTreeClean = sourceTreeClean
    && finalWorktreeStatus.length === 0
    && finalHeadSha === currentHeadSha
    && finalTreeSha === currentTreeSha;
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
    candidateTreeSha: currentTreeSha,
    candidateBound: candidateTreeClean,
    sourceTreeClean: candidateTreeClean,
    status: candidateTreeClean ? "Passed" : "Supporting",
    checkpoint: {
      protocolVersion: CHECKPOINT_PROTOCOL_VERSION,
      executionIdentity,
      executionIdentityHash,
      resumeEnabled,
      reusedSeedCount: reusableSeedIndices.length,
      executedSeedCount: pendingSeedIndices.length,
      determinismReplayExecuted: true,
    },
    profile: {
      ...profile,
      seedCount,
      seasonCount,
      concurrency,
      processIsolation: executionIdentity.processIsolation,
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

  await writeJsonAtomic(outputPath, summary);
  await writeProgress("Passed");
  console.info(`LONG_CAREER_RELEASE_GATE ${JSON.stringify(summary.aggregate)}`);
} catch (error) {
  await writeProgress("Failed", error instanceof Error ? error.message : String(error));
  throw error;
}
