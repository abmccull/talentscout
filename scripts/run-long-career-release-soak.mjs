import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { availableParallelism, cpus, totalmem } from "node:os";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

const CHECKPOINT_PROTOCOL_VERSION = 2;
const MAX_WORKER_DIAGNOSTIC_BYTES_PER_STREAM = 32 * 1024;
const WORKER_TERMINATION_GRACE_MS = 2_000;
const WORKER_TERMINATION_FORCE_MS = 1_000;
const RELEASE_PROFILE = Object.freeze({
  seedCount: 20,
  seasonCount: 30,
  concurrency: 3,
  scenarioId: "youth-england-passive-world-v1",
  actionPolicy: "passive-world-no-scout-actions",
  fatiguePolicy: "reset-at-95-to-20-for-world-longevity",
  expectedSeasonLengthWeeks: 46,
  expectedCanonicalTicksPerSeed: 1_380,
  maxSerializedBytes: 80 * 1024 * 1024,
  maxGrowthMultiplier: 64,
  maxHeapUsedBytes: 1536 * 1024 * 1024,
  maxRssBytes: 2 * 1024 * 1024 * 1024,
  maxPostGcHeapGrowthBytes: 1024 * 1024 * 1024,
  scheduledLeagueClubCounts: {
    "league-championship": 24,
    "league-one": 24,
    "league-premier": 20,
    "league-two": 24,
  },
  collectionByteBudgets: {
    players: 32 * 1024 * 1024,
    worldHistory: 24 * 1024 * 1024,
    fixtures: 8 * 1024 * 1024,
    matchRatings: 8 * 1024 * 1024,
    playerMovementHistory: 8 * 1024 * 1024,
    retiredPlayers: 6 * 1024 * 1024,
    retiredPlayerIds: 512 * 1024,
    unsignedYouth: 12 * 1024 * 1024,
  },
});
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
const canonicalOutputPath = resolve(
  "artifacts/release/generated/long-career-release-summary.json",
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
  process.env.SOAK_MAX_SERIALIZED_BYTES ?? String(RELEASE_PROFILE.maxSerializedBytes),
  10,
);
const canonicalWorkerDirectory = resolve(
  "artifacts/release/generated/long-career-workers",
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
if (
  requireCleanCandidate
  && (
    seedCount !== RELEASE_PROFILE.seedCount
    || seasonCount !== RELEASE_PROFILE.seasonCount
    || concurrency !== RELEASE_PROFILE.concurrency
    || maxSerializedBytes !== RELEASE_PROFILE.maxSerializedBytes
    || outputPath !== canonicalOutputPath
    || workerDirectory !== canonicalWorkerDirectory
  )
) {
  throw new Error(
    "Clean-candidate certification requires the committed 20-seed x 30-season, "
      + "concurrency-3, 80 MiB release profile; use a non-certifying supporting run for overrides",
  );
}

function hashFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function repositoryRelative(path) {
  const fromRoot = relative(process.cwd(), path);
  if (
    !fromRoot
    || fromRoot === ".."
    || fromRoot.startsWith(`..${sep}`)
    || isAbsolute(fromRoot)
  ) {
    throw new Error(`Soak evidence path escapes the repository: ${path}`);
  }
  return fromRoot.replaceAll("\\", "/");
}

const executionIdentity = {
  protocolVersion: CHECKPOINT_PROTOCOL_VERSION,
  candidateCommitSha: currentHeadSha,
  candidateTreeSha: currentTreeSha,
  seedCount,
  seasonCount,
  concurrency,
  maxSerializedBytes,
  profileKind: "passive-world-canonical-weekly-career",
  processIsolation: "one-seeded-career-per-process",
  nodeVersion: process.version,
  nodeOptions: process.env.NODE_OPTIONS ?? "",
  platform: process.platform,
  architecture: process.arch,
  availableParallelism: availableParallelism(),
  totalMemoryBytes: totalmem(),
  cpuModel: cpus()[0]?.model ?? "unknown",
  workflowRunId: process.env.GITHUB_RUN_ID?.trim() || null,
  packageLockSha256: hashFile(resolve("package-lock.json")),
  installedPackageLockSha256: hashFile(resolve("node_modules/.package-lock.json")),
};

function hashJson(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function workerEvidencePayload(result) {
  const { checkpoint: _checkpoint, ...evidence } = result;
  return evidence;
}

function workerEvidenceSha256(result) {
  return hashJson(workerEvidencePayload(result));
}

function midseasonSampleWeeks(seasonLength) {
  if (seasonLength < 3) return [];
  return [...new Set([
    Math.max(2, Math.floor((seasonLength + 1) / 3)),
    Math.min(seasonLength - 1, Math.floor((2 * (seasonLength + 1)) / 3)),
  ])].filter((week) => week > 1 && week < seasonLength);
}

const executionIdentityHash = hashJson(executionIdentity);
// A clean Git candidate is the content fingerprint. Supporting dirty-tree runs
// remain useful diagnostics, but their outputs are never resumed or certified.
const resumeEnabled = resumeRequested && sourceTreeClean;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function hasExactKeys(record, expectedKeys) {
  if (!isRecord(record)) return false;
  const actual = Object.keys(record).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
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

function workerEvidenceRecord(seedIndex, suffix, result) {
  const path = workerOutputPath(seedIndex, suffix);
  return {
    seedIndex,
    seed: expectedSeed(seedIndex),
    path: repositoryRelative(path),
    payloadSha256: result.checkpoint.workerEvidenceSha256,
    fileSha256: hashFile(path),
  };
}

function validateWorkerResult(result, seedIndex, requireCheckpoint) {
  const failures = [];
  const seed = expectedSeed(seedIndex);
  if (!isRecord(result) || result.schemaVersion !== 3) {
    return ["worker result schemaVersion must be 3"];
  }
  if (
    !isRecord(result.profile)
    || result.profile.kind !== executionIdentity.profileKind
    || result.profile.seedCount !== 1
    || result.profile.seasonCount !== seasonCount
    || result.profile.maxSerializedBytes !== maxSerializedBytes
    || result.profile.maxGrowthMultiplier !== RELEASE_PROFILE.maxGrowthMultiplier
    || result.profile.maxHeapUsedBytes !== RELEASE_PROFILE.maxHeapUsedBytes
    || result.profile.maxRssBytes !== RELEASE_PROFILE.maxRssBytes
    || result.profile.maxPostGcHeapGrowthBytes !== RELEASE_PROFILE.maxPostGcHeapGrowthBytes
    || result.profile.exactCanonicalTransitionAssertions !== true
    || result.profile.scenarioId !== RELEASE_PROFILE.scenarioId
    || result.profile.actionPolicy !== RELEASE_PROFILE.actionPolicy
    || result.profile.fatiguePolicy !== RELEASE_PROFILE.fatiguePolicy
    || result.profile.expectedSeasonLengthWeeks !== RELEASE_PROFILE.expectedSeasonLengthWeeks
    || result.profile.expectedCanonicalTicksPerSeed
      !== seasonCount * RELEASE_PROFILE.expectedSeasonLengthWeeks
    || JSON.stringify(result.profile.scheduledLeagueClubCounts)
      !== JSON.stringify(RELEASE_PROFILE.scheduledLeagueClubCounts)
    || result.profile.maxMidseasonInvariantSamplesPerSeason !== 2
    || JSON.stringify(result.profile.collectionByteBudgets)
      !== JSON.stringify(RELEASE_PROFILE.collectionByteBudgets)
  ) {
    failures.push("worker profile does not match the requested single-seed release profile");
  }
  if (!Array.isArray(result.runs) || result.runs.length !== 1 || !isRecord(result.runs[0])) {
    failures.push("worker result must contain exactly one run");
    return failures;
  }
  const run = result.runs[0];
  let expectedMidseasonPositions = [];
  const expectedMemoryPositions = [{ season: 1, week: 1, canonicalTick: 0 }];
  if (run.seed !== seed) failures.push(`worker seed must be ${seed}`);
  if (run.reachedSeason !== seasonCount + 1) {
    failures.push(`worker did not cross the season ${seasonCount} boundary`);
  }
  if (!Array.isArray(run.seasonLengths) || run.seasonLengths.length !== seasonCount) {
    failures.push("worker is missing exact per-season calendar lengths");
  } else {
    const invalidSeasonLength = run.seasonLengths.some((entry, index) => (
      !isRecord(entry)
      || entry.season !== index + 1
      || !Number.isInteger(entry.weeks)
      || entry.weeks !== RELEASE_PROFILE.expectedSeasonLengthWeeks
    ));
    const exactExpectedTicks = invalidSeasonLength
      ? -1
      : run.seasonLengths.reduce((sum, entry) => sum + entry.weeks, 0);
    if (
      invalidSeasonLength
      || !Number.isInteger(run.expectedCanonicalTicks)
      || run.expectedCanonicalTicks !== exactExpectedTicks
      || !Number.isInteger(run.canonicalTicks)
      || run.canonicalTicks !== exactExpectedTicks
      || run.calendarWeeksSpanned !== exactExpectedTicks
    ) {
      failures.push("worker did not process the exact canonical weekly timeline");
    }

    const expectedLeagueEntries = Object.entries(RELEASE_PROFILE.scheduledLeagueClubCounts);
    if (
      !Array.isArray(run.seasonCalendarAudits)
      || run.seasonCalendarAudits.length !== seasonCount
      || run.seasonCalendarAudits.some((audit, index) => (
        !isRecord(audit)
        || audit.season !== index + 1
        || audit.seasonLengthWeeks !== RELEASE_PROFILE.expectedSeasonLengthWeeks
        || audit.fixtureCount !== expectedLeagueEntries.reduce(
          (sum, [, clubCount]) => sum + clubCount * (clubCount - 1),
          0,
        )
        || !Array.isArray(audit.leagues)
        || audit.leagues.length !== expectedLeagueEntries.length
        || audit.leagues.some((league, leagueIndex) => {
          const [leagueId, clubCount] = expectedLeagueEntries[leagueIndex] ?? [];
          return !isRecord(league)
            || league.leagueId !== leagueId
            || league.clubCount !== clubCount
            || league.weekCount !== (clubCount - 1) * 2
            || league.fixtureCount !== clubCount * (clubCount - 1)
            || league.uniquePairCount !== (clubCount * (clubCount - 1)) / 2;
        })
      ))
    ) {
      failures.push("worker is missing the independently audited England fixture calendar");
    }

    let elapsedWeeksBeforeSeason = 0;
    expectedMidseasonPositions = invalidSeasonLength
      ? []
      : run.seasonLengths.flatMap((entry) => {
        const samples = midseasonSampleWeeks(entry.weeks).map((week) => ({
          season: entry.season,
          week,
          canonicalTick: elapsedWeeksBeforeSeason + week - 1,
        }));
        elapsedWeeksBeforeSeason += entry.weeks;
        expectedMemoryPositions.push(...samples, {
          season: entry.season + 1,
          week: 1,
          canonicalTick: elapsedWeeksBeforeSeason,
        });
        return samples;
      });
    if (
      !Array.isArray(run.midseasonInvariantSamples)
      || run.midseasonInvariantSamples.length !== expectedMidseasonPositions.length
      || run.midseasonInvariantSamples.some((sample, index) => (
        !isRecord(sample)
        || sample.season !== expectedMidseasonPositions[index]?.season
        || sample.week !== expectedMidseasonPositions[index]?.week
        || sample.canonicalTick !== expectedMidseasonPositions[index]?.canonicalTick
        || !isFiniteNumber(sample.serializedBytes)
        || !isFiniteNumber(sample.heapUsedBytes)
        || !isFiniteNumber(sample.rssBytes)
        || sample.nonFiniteNumbers !== 0
        || sample.referenceViolations !== 0
        || sample.retentionReferenceViolations !== 0
        || sample.economyViolations !== 0
      ))
    ) {
      failures.push("worker is missing valid bounded midseason invariant evidence");
    }
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
  if (
    run.initialBytes <= 0
    || run.finalBytes <= 0
    || run.peakBytes < Math.max(run.initialBytes, run.finalBytes)
    || run.peakBytes > maxSerializedBytes
    || run.finalBytes > run.initialBytes * RELEASE_PROFILE.maxGrowthMultiplier
    || Math.abs(
      run.finalToInitialRatio - Math.round((run.finalBytes / run.initialBytes) * 100) / 100,
    ) > 0.000_001
    || run.worldHistorySeasons !== Math.min(seasonCount, 30)
  ) {
    failures.push("worker save growth, ratio, or world-history evidence exceeds the release profile");
  }
  if (
    !Array.isArray(run.largestCollections)
    || run.largestCollections.length === 0
    || run.largestCollections.length > 12
    || run.largestCollections.some((entry, index) => (
      !isRecord(entry)
      || typeof entry.key !== "string"
      || !isFiniteNumber(entry.bytes)
      || entry.bytes < 0
      || (index > 0 && entry.bytes > run.largestCollections[index - 1]?.bytes)
    ))
  ) {
    failures.push("worker largest-collection evidence is missing or unsorted");
  }
  if (!Array.isArray(run.seasonGrowth) || run.seasonGrowth.length !== seasonCount) {
    failures.push("worker is missing season-boundary growth evidence");
  } else if (run.seasonGrowth.some((sample, index) => (
    !isRecord(sample)
    || sample.season !== index + 2
    || !isFiniteNumber(sample.growthBytes)
    || !hasExactKeys(sample.collectionBytes, Object.keys(result.profile.collectionByteBudgets))
    || !hasExactKeys(
      sample.collectionCompactionDeltas,
      Object.keys(result.profile.collectionByteBudgets),
    )
  ))) {
    failures.push("worker season-boundary growth evidence is invalid");
  } else {
    let previousBytes = run.initialBytes;
    for (const sample of run.seasonGrowth) {
      if (
        !isFiniteNumber(sample.serializedBytes)
        || sample.serializedBytes <= 0
        || sample.serializedBytes > maxSerializedBytes
        || sample.growthBytes !== sample.serializedBytes - previousBytes
        || !isFiniteNumber(sample.compactionRemovedBytes)
        || sample.compactionRemovedBytes < 0
        || !Number.isInteger(sample.compactionEvents)
        || sample.compactionEvents < 0
      ) {
        failures.push(`worker season ${sample.season} growth evidence does not reconcile`);
      }
      for (const [key, budget] of Object.entries(RELEASE_PROFILE.collectionByteBudgets)) {
        if (
          !isFiniteNumber(sample.collectionBytes[key])
          || sample.collectionBytes[key] < 0
          || sample.collectionBytes[key] > budget
          || !isFiniteNumber(sample.collectionCompactionDeltas[key])
        ) {
          failures.push(`worker season ${sample.season} ${key} retention evidence is invalid`);
        }
      }
      previousBytes = sample.serializedBytes;
    }
    if (run.seasonGrowth.at(-1)?.serializedBytes !== run.finalBytes) {
      failures.push("worker final save size does not match its season-boundary evidence");
    }
  }
  const worldHealthFields = [
    "activePlayers",
    "unsignedYouth",
    "freeAgents",
    "activeLoans",
    "reports",
    "observations",
    "inboxMessages",
  ];
  if (
    !Array.isArray(run.worldHealth)
    || run.worldHealth.length !== seasonCount
    || run.worldHealth.some((sample, index) => (
      !isRecord(sample)
      || sample.season !== index + 2
      || worldHealthFields.some((key) => !Number.isInteger(sample[key]) || sample[key] < 0)
      || !(sample.financialBalance === null || isFiniteNumber(sample.financialBalance))
    ))
  ) {
    failures.push("worker is missing season-boundary world-health evidence");
  }
  if (
    !isRecord(run.compaction)
    || !isFiniteNumber(run.compaction.totalRemovedBytes)
    || !hasExactKeys(run.compaction.collectionDeltas, Object.keys(result.profile.collectionByteBudgets))
  ) {
    failures.push("worker compaction evidence is invalid");
  } else {
    const expectedEvents = run.seasonGrowth.reduce(
      (sum, sample) => sum + sample.compactionEvents,
      0,
    );
    const expectedRemovedBytes = run.seasonGrowth.reduce(
      (sum, sample) => sum + sample.compactionRemovedBytes,
      0,
    );
    if (
      run.compaction.events !== expectedEvents
      || run.compaction.totalRemovedBytes !== expectedRemovedBytes
    ) {
      failures.push("worker compaction totals do not reconcile with season evidence");
    }
    for (const key of Object.keys(result.profile.collectionByteBudgets)) {
      const expectedDelta = run.seasonGrowth.reduce(
        (sum, sample) => sum + sample.collectionCompactionDeltas[key],
        0,
      );
      if (
        !isFiniteNumber(run.compaction.collectionDeltas[key])
        || Math.abs(run.compaction.collectionDeltas[key] - expectedDelta) > 0.000_001
      ) {
        failures.push(`worker compaction evidence is missing ${key}`);
      }
    }
  }
  if (
    !isRecord(run.memory)
    || !isFiniteNumber(run.memory.peakHeapUsedBytes)
    || !isFiniteNumber(run.memory.peakRssBytes)
    || !isRecord(run.memory.initial)
    || run.memory.initial.season !== 1
    || run.memory.initial.week !== 1
    || run.memory.initial.canonicalTick !== 0
    || !isRecord(run.memory.final)
    || run.memory.final.season !== seasonCount + 1
    || run.memory.final.week !== 1
    || run.memory.final.canonicalTick !== seasonCount * RELEASE_PROFILE.expectedSeasonLengthWeeks
    || !Array.isArray(run.memory.samples)
    || run.memory.samples.length !== expectedMemoryPositions.length
    || run.memory.samples.some((sample, index) => (
      !isRecord(sample)
      || sample.season !== expectedMemoryPositions[index]?.season
      || sample.week !== expectedMemoryPositions[index]?.week
      || sample.canonicalTick !== expectedMemoryPositions[index]?.canonicalTick
      || !isFiniteNumber(sample.heapUsedBytes)
      || !isFiniteNumber(sample.rssBytes)
    ))
    || run.memory.peakHeapUsedBytes > RELEASE_PROFILE.maxHeapUsedBytes
    || run.memory.peakRssBytes > RELEASE_PROFILE.maxRssBytes
    || run.memory.final.heapUsedBytes - run.memory.initial.heapUsedBytes
      > RELEASE_PROFILE.maxPostGcHeapGrowthBytes
    || run.memory.samples.some((sample) => (
      sample.heapUsedBytes > RELEASE_PROFILE.maxHeapUsedBytes
      || sample.rssBytes > RELEASE_PROFILE.maxRssBytes
    ))
  ) {
    failures.push("worker memory evidence is invalid");
  }
  if (
    !isRecord(run.weeklyLatencyMs)
    || !isFiniteNumber(run.weeklyLatencyMs.p50)
    || !isFiniteNumber(run.weeklyLatencyMs.p95)
    || !isFiniteNumber(run.weeklyLatencyMs.max)
    || !isFiniteNumber(run.weeklyLatencyMs.mean)
    || run.weeklyLatencyMs.p50 < 0
    || run.weeklyLatencyMs.p50 > run.weeklyLatencyMs.p95
    || run.weeklyLatencyMs.p95 > run.weeklyLatencyMs.max
    || run.weeklyLatencyMs.mean < 0
    || run.weeklyLatencyMs.mean > run.weeklyLatencyMs.max
    || run.weeklyLatencyMs.max >= 30_000
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
      || checkpoint.workerEvidenceHashAlgorithm !== "sha256"
      || checkpoint.workerEvidenceSha256 !== workerEvidenceSha256(result)
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
const workerEvidenceRecords = new Array(seedCount);
let profile;
const seedStates = new Map(
  Array.from({ length: seedCount }, (_, index) => [
    index + 1,
    inspections[index].reusable ? "Reused" : "Pending",
  ]),
);
const activeWorkerProcesses = new Map();
const cancelledSeedIndices = new Set();
let abortRequested = false;
let primaryFailure = null;
let primaryFailureError = null;

class SoakWorkerProcessError extends Error {
  constructor(message, diagnostics) {
    super(message);
    this.name = "SoakWorkerProcessError";
    this.diagnostics = diagnostics;
  }
}

class SoakWorkerCancelledError extends Error {
  constructor(seedIndex) {
    super(`Soak worker ${seedIndex} cancelled after another seed failed`);
    this.name = "SoakWorkerCancelledError";
  }
}

function appendDiagnosticTail(current, chunk) {
  const next = Buffer.concat([current, Buffer.from(chunk)]);
  return next.length <= MAX_WORKER_DIAGNOSTIC_BYTES_PER_STREAM
    ? next
    : next.subarray(next.length - MAX_WORKER_DIAGNOSTIC_BYTES_PER_STREAM);
}

function diagnosticEvidence(stdoutTail, stderrTail, stdoutBytes, stderrBytes) {
  return {
    stdout: {
      tail: stdoutTail.toString("utf8"),
      totalBytes: stdoutBytes,
      capturedBytes: stdoutTail.length,
      truncated: stdoutBytes > stdoutTail.length,
    },
    stderr: {
      tail: stderrTail.toString("utf8"),
      totalBytes: stderrBytes,
      capturedBytes: stderrTail.length,
      truncated: stderrBytes > stderrTail.length,
    },
  };
}

function waitForChildExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolveExit) => {
    const timer = setTimeout(done, timeoutMs);
    function done() {
      clearTimeout(timer);
      child.off("close", done);
      child.off("error", done);
      resolveExit();
    }
    child.once("close", done);
    child.once("error", done);
  });
}

async function terminateWorkerProcess(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    await new Promise((resolveTermination) => {
      const killer = spawn(
        "taskkill.exe",
        ["/PID", String(child.pid), "/T", "/F"],
        { stdio: "ignore", windowsHide: true },
      );
      const timer = setTimeout(() => {
        killer.kill();
        resolveTermination();
      }, WORKER_TERMINATION_GRACE_MS);
      const done = () => {
        clearTimeout(timer);
        resolveTermination();
      };
      killer.once("error", done);
      killer.once("close", done);
    });
    if (child.exitCode === null && child.signalCode === null) {
      try {
        child.kill("SIGKILL");
      } catch {
        // taskkill may already have completed the process tree.
      }
    }
    await waitForChildExit(child, WORKER_TERMINATION_FORCE_MS);
    return;
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      return;
    }
  }
  await waitForChildExit(child, WORKER_TERMINATION_GRACE_MS);
  // A detached worker may have exited while a descendant kept the process
  // group alive. Always escalate the group after the grace period.
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    // ESRCH means the complete process group already exited.
  }
  await waitForChildExit(child, WORKER_TERMINATION_FORCE_MS);
}

function teeWorkerStream(stream, destination, onChunk) {
  stream?.on("data", (chunk) => {
    onChunk(chunk);
    if (!destination.write(chunk)) {
      stream.pause();
      destination.once("drain", () => stream.resume());
    }
  });
}

function cancelPeerWorkers(failedSeedIndex) {
  abortRequested = true;
  const terminations = [];
  for (const { seedIndex, child } of activeWorkerProcesses.values()) {
    if (seedIndex === failedSeedIndex) continue;
    cancelledSeedIndices.add(seedIndex);
    terminations.push(terminateWorkerProcess(child));
  }
  return Promise.allSettled(terminations);
}
for (const seedIndex of reusableSeedIndices) {
  const result = inspections[seedIndex - 1].result;
  profile ??= result.profile;
  runs[seedIndex - 1] = result.runs[0];
  workerEvidenceRecords[seedIndex - 1] = workerEvidenceRecord(seedIndex, "run", result);
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
  let stdoutTail = Buffer.alloc(0);
  let stderrTail = Buffer.alloc(0);
  let stdoutBytes = 0;
  let stderrBytes = 0;
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
          detached: process.platform !== "win32",
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      if (child.pid) activeWorkerProcesses.set(child.pid, { seedIndex, suffix, child });
      teeWorkerStream(child.stdout, process.stdout, (chunk) => {
        stdoutBytes += chunk.length;
        stdoutTail = appendDiagnosticTail(stdoutTail, chunk);
      });
      teeWorkerStream(child.stderr, process.stderr, (chunk) => {
        stderrBytes += chunk.length;
        stderrTail = appendDiagnosticTail(stderrTail, chunk);
      });
      child.once("error", (error) => {
        if (child.pid) activeWorkerProcesses.delete(child.pid);
        rejectWorker(error);
      });
      child.once("close", (code, signal) => {
        if (child.pid) activeWorkerProcesses.delete(child.pid);
        if (code === 0) resolveWorker();
        else rejectWorker(new SoakWorkerProcessError(
          `Soak worker ${seedIndex} failed (${signal ?? code})`,
          diagnosticEvidence(stdoutTail, stderrTail, stdoutBytes, stderrBytes),
        ));
      });
    });
    const result = JSON.parse(await readFile(temporaryWorkerOutput, "utf8"));
    const failures = validateWorkerResult(result, seedIndex, false);
    if (failures.length > 0) {
      throw new Error(`Soak worker ${seedIndex} emitted invalid evidence: ${failures.join("; ")}`);
    }
    const evidenceSha256 = workerEvidenceSha256(result);
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
        workerEvidenceHashAlgorithm: "sha256",
        workerEvidenceSha256: evidenceSha256,
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
    if (cancelledSeedIndices.has(seedIndex)) {
      await rm(workerOutput.replace(/\.json$/, "-failure.json"), { force: true });
      throw new SoakWorkerCancelledError(seedIndex);
    }
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
        diagnostics:
          error instanceof SoakWorkerProcessError
            ? error.diagnostics
            : diagnosticEvidence(stdoutTail, stderrTail, stdoutBytes, stderrBytes),
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
        if (abortRequested) return;
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
          workerEvidenceRecords[seedIndex - 1] = workerEvidenceRecord(seedIndex, "run", result);
          seedStates.set(seedIndex, "Completed");
          await writeProgress("InProgress");
        } catch (error) {
          if (error instanceof SoakWorkerCancelledError) {
            seedStates.set(seedIndex, "Pending");
            await writeProgress("Failed", primaryFailure);
            return;
          }
          if (abortRequested) {
            seedStates.set(seedIndex, "Pending");
            await writeProgress("Failed", primaryFailure);
            return;
          }
          primaryFailureError = error instanceof Error ? error : new Error(String(error));
          primaryFailure = primaryFailureError.message;
          seedStates.set(seedIndex, "Failed");
          const peerTermination = cancelPeerWorkers(seedIndex);
          await writeProgress(
            "Failed",
            primaryFailure,
          );
          await peerTermination;
          throw primaryFailureError;
        }
      }
    }),
  );
  if (primaryFailureError) throw primaryFailureError;
  const failedWorker = workerSettlements.find((settlement) => settlement.status === "rejected");
  if (failedWorker?.status === "rejected") throw failedWorker.reason;

  if (runs.some((run) => !run) || !profile) {
    throw new Error("Long-career soak completed without a result for every requested seed");
  }
  // The replay is intentionally fresh even after a resumed run. Reusing it
  // would turn checkpoint presence into a substitute for determinism proof.
  const replayResult = await runWorker(1, "determinism-replay");
  const determinismReplay = replayResult.runs[0];
  if (determinismReplay.digest !== runs[0].digest) {
    throw new Error(
      `Determinism failure for ${runs[0].seed}: ${runs[0].digest} != ${determinismReplay.digest}`,
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
  const workerEvidence = workerEvidenceRecords;
  if (workerEvidence.some((entry) => (
    !entry
    || !/^[a-f0-9]{64}$/.test(entry.payloadSha256 ?? "")
    || !/^[a-f0-9]{64}$/.test(entry.fileSha256 ?? "")
  ))) {
    throw new Error("Long-career soak is missing a worker evidence hash");
  }
  const evidenceManifest = {
    hashAlgorithm: "sha256",
    workerHashPayload: "canonical JSON payload excluding the root checkpoint field plus exact worker file bytes",
    executionIdentitySha256: executionIdentityHash,
    workerEvidence,
    determinismReplayEvidence: {
      ...workerEvidenceRecord(1, "determinism-replay", replayResult),
    },
  };
  const summary = {
    schemaVersion: 4,
    evidenceKind: "long-career-release-soak",
    generatedAt: new Date().toISOString(),
    candidateCommitSha: currentHeadSha,
    candidateTreeSha: currentTreeSha,
    candidateBound: candidateTreeClean,
    sourceTreeClean: candidateTreeClean,
    status: candidateTreeClean ? "Passed" : "Supporting",
    evidenceIntegrity: {
      ...evidenceManifest,
      manifestSha256: hashJson(evidenceManifest),
    },
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
      expectedSeasonLengthWeeks: RELEASE_PROFILE.expectedSeasonLengthWeeks,
      expectedCanonicalTicksPerSeed: RELEASE_PROFILE.expectedCanonicalTicksPerSeed,
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
    determinismReplay,
  };

  await writeJsonAtomic(outputPath, summary);
  await writeProgress("Passed");
  console.info(`LONG_CAREER_RELEASE_GATE ${JSON.stringify(summary.aggregate)}`);
} catch (error) {
  await writeProgress("Failed", error instanceof Error ? error.message : String(error));
  throw error;
}
