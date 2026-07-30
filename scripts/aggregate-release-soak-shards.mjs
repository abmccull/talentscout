import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const seedCount = Number.parseInt(process.env.SOAK_SEEDS ?? "20", 10);
const seasonCount = Number.parseInt(process.env.SOAK_SEASONS ?? "30", 10);
const inputDirectory = resolve(
  process.env.SOAK_SHARD_DIRECTORY
    ?? "artifacts/release/generated/long-career-shards",
);
const outputPath = resolve(
  process.env.SOAK_OUTPUT
    ?? "artifacts/release/generated/long-career-release-summary.json",
);
const repositoryRoot = resolve(".");

if (!Number.isInteger(seedCount) || seedCount <= 0) {
  throw new Error("SOAK_SEEDS must be positive");
}
if (!Number.isInteger(seasonCount) || seasonCount <= 0) {
  throw new Error("SOAK_SEASONS must be positive");
}

function git(...args) {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim().toLowerCase();
}

const candidateCommitSha = git("rev-parse", "HEAD");
const candidateTreeSha = git("rev-parse", "HEAD^{tree}");
if (git("status", "--porcelain", "--untracked-files=all")) {
  throw new Error("Refusing to aggregate release soak evidence from a dirty tree");
}

const files = (await readdir(inputDirectory, { recursive: true }))
  .filter((file) => file.endsWith(".json"))
  .map((file) => resolve(inputDirectory, file));
const shards = await Promise.all(files.map(async (file) => ({
  file,
  document: JSON.parse(await readFile(file, "utf8")),
})));

const expectedSeeds = Array.from(
  { length: seedCount },
  (_, index) => `release-soak-${String(index + 1).padStart(2, "0")}`,
);
const shardBySeed = new Map();
for (const shard of shards) {
  const document = shard.document;
  const run = Array.isArray(document.runs) ? document.runs[0] : undefined;
  const identity = document.checkpoint?.executionIdentity;
  const calculatedIdentityHash = identity
    ? createHash("sha256").update(JSON.stringify(identity)).digest("hex")
    : "";
  if (
    document.schemaVersion !== 3
    || document.evidenceKind !== "long-career-release-soak"
    || document.status !== "Passed"
    || document.candidateBound !== true
    || document.sourceTreeClean !== true
    || document.candidateCommitSha !== candidateCommitSha
    || document.candidateTreeSha !== candidateTreeSha
    || document.profile?.seedCount !== 1
    || document.profile?.seasonCount !== seasonCount
    || document.profile?.processIsolation !== "one-seeded-career-per-process"
    || !run?.seed
    || run.reachedSeason < seasonCount + 1
    || document.checkpoint?.executionIdentityHash !== calculatedIdentityHash
    || identity?.candidateCommitSha !== candidateCommitSha
    || identity?.candidateTreeSha !== candidateTreeSha
  ) {
    throw new Error(`Invalid release soak shard: ${shard.file}`);
  }
  if (shardBySeed.has(run.seed)) {
    throw new Error(`Duplicate release soak shard for ${run.seed}`);
  }
  shardBySeed.set(run.seed, document);
}

for (const seed of expectedSeeds) {
  if (!shardBySeed.has(seed)) throw new Error(`Missing release soak shard for ${seed}`);
}
if (shardBySeed.size !== seedCount) {
  throw new Error(`Expected ${seedCount} release soak shards, received ${shardBySeed.size}`);
}

const orderedShards = expectedSeeds.map((seed) => shardBySeed.get(seed));
const runs = orderedShards.map((document) => document.runs[0]);
const firstShard = orderedShards[0];
if (
  firstShard.checkpoint?.determinismReplayExecuted !== true
  || firstShard.persistenceReplay?.seed !== runs[0].seed
  || firstShard.persistenceReplay?.digest !== runs[0].digest
) {
  throw new Error("Seed one shard is missing a matching fresh deterministic replay");
}

const executionIdentity = {
  protocolVersion: 1,
  candidateCommitSha,
  candidateTreeSha,
  seedCount,
  seedStart: 1,
  seasonCount,
  concurrency: seedCount,
  maxSerializedBytes: firstShard.profile.maxSerializedBytes,
  profileKind: "full-canonical-weekly-career",
  processIsolation: "one-seeded-career-per-process",
  nodeVersion: process.version,
  nodeOptions: process.env.NODE_OPTIONS ?? "",
  platform: process.platform,
  architecture: process.arch,
  executionMode: "github-matrix-shards",
};
const executionIdentityHash = createHash("sha256")
  .update(JSON.stringify(executionIdentity))
  .digest("hex");
const collectionKeys = Object.keys(firstShard.profile.collectionByteBudgets ?? {});
const percentile = (values, fraction) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
};
const round = (value) => Math.round(value * 100) / 100;

const summary = {
  schemaVersion: 3,
  evidenceKind: "long-career-release-soak",
  generatedAt: new Date().toISOString(),
  candidateCommitSha,
  candidateTreeSha,
  candidateBound: true,
  sourceTreeClean: true,
  status: "Passed",
  checkpoint: {
    protocolVersion: 1,
    executionIdentity,
    executionIdentityHash,
    resumeEnabled: false,
    reusedSeedCount: 0,
    executedSeedCount: seedCount,
    determinismReplayExecuted: true,
  },
  profile: {
    ...firstShard.profile,
    seedCount,
    seasonCount,
    concurrency: seedCount,
    processIsolation: "one-seeded-career-per-process",
    deterministicReplaySeed: runs[0].seed,
  },
  aggregate: {
    totalCanonicalTicks: runs.reduce((sum, run) => sum + run.canonicalTicks, 0),
    totalCalendarWeeksSpanned: runs.reduce(
      (sum, run) => sum + run.calendarWeeksSpanned,
      0,
    ),
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
      collectionKeys.map((key) => [
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
  persistenceReplay: firstShard.persistenceReplay,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.info(`LONG_CAREER_RELEASE_AGGREGATE ${JSON.stringify(summary.aggregate)}`);
