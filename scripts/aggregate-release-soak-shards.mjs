import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstat, mkdir, opendir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { validateReleaseCalendarReceipt } from "./release-calendar-receipt.mjs";
import { loadArtifactProfile, createArtifactContext } from "./release-artifact-io.mjs";


const loadedArtifactProfile = await loadArtifactProfile();
const artifactContext = createArtifactContext({
  loadedProfile: loadedArtifactProfile, domain: "aggregate", phase: null,
  evidenceClassification: "diagnostic-fixture",
});
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

function artifactDomainError(message) {
  return Object.assign(new Error(message), { code: "ERR_RELEASE_ARTIFACT_DOMAIN" });
}
const artifactIoKeys = Object.freeze([
  "schemaVersion", "profileId", "profileSha256", "purpose",
  "expectedExecutionIdentityHash", "expectedCandidateCommitSha",
  "expectedCandidateTreeSha", "failureReceiptPath",
]);
function artifactFailureReceiptPath(root) {
  const path = resolve(root, process.env.SOAK_ARTIFACT_FAILURE_OUTPUT
    ?? "artifacts/release/generated/long-career-artifact-failure.json");
  const part = relative(root, path);
  if (!part || isAbsolute(part) || part === ".." || part.startsWith(".." + sep)
    || /[\u0000-\u001f\u007f]/.test(path)
    || (process.platform === "win32" && path.split(/[\\/]/).slice(1)
      .some((part) => part.endsWith(" ") || part.endsWith(".") || part.includes(":")))
    || Buffer.byteLength(path, "utf8") > loadedArtifactProfile.profile.representation.maxCanonicalPathUtf8Bytes) {
    throw artifactDomainError("Artifact failure receipt path must be an ordinary repository-contained path");
  }
  return part.split(sep).join("/");
}
function assertArtifactBinding(actual, expected, label) {
  if (actual === null || typeof actual !== "object"
    || Object.getPrototypeOf(actual) !== Object.prototype
    || Object.keys(actual).length !== artifactIoKeys.length
    || artifactIoKeys.some(key => !Object.hasOwn(actual, key) || actual[key] !== expected[key])) {
    throw artifactDomainError(label + " artifactIo does not match the actual profile and campaign context");
  }
}

const failureReceiptPath = artifactFailureReceiptPath(repositoryRoot);
function expectedArtifactBinding(executionIdentityHash) {
  return {
    schemaVersion: 1, profileId: loadedArtifactProfile.profile.profileId,
    profileSha256: loadedArtifactProfile.sha256, purpose: loadedArtifactProfile.purpose,
    expectedExecutionIdentityHash: executionIdentityHash,
    expectedCandidateCommitSha: candidateCommitSha, expectedCandidateTreeSha: candidateTreeSha,
    failureReceiptPath,
  };
}
const certifiedWorkerNodeArguments = [
  "--max-old-space-size=1440",
  "--max-semi-space-size=32",
  "--expose-gc",
];
const certifiedWorkerHeapLimitBytes = 1536 * 1024 * 1024;

if (!Number.isSafeInteger(seedCount) || seedCount <= 0 || seedCount > loadedArtifactProfile.profile.campaign.maxPrimarySeeds) {
  throw new Error("SOAK_SEEDS must be positive");
}
if (!Number.isSafeInteger(seasonCount) || seasonCount <= 0 || seasonCount > loadedArtifactProfile.profile.campaign.maxSeasons) {
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


const traversal = {
  returnedEntries: 0, admittedEntries: 0, directoriesAdmitted: 0,
  directoriesOpened: 0, directoriesClosed: 0, jsonFilesAdmitted: 0,
  maximumAdmittedDepth: 0, closeFailures: [],
};
const ownedDirectories = new Set();
const traversalLimits = loadedArtifactProfile.profile.readers;
let traversalFailure = null;
function assertAggregateHealthy() {
  if (traversalFailure !== null) throw traversalFailure;
  artifactContext.assertHealthy();
}
function enumerationLimit(message) {
  return Object.assign(new Error(message), { code: "ERR_RELEASE_ARTIFACT_ENUMERATION_LIMIT" });
}
function boundedCloseFact(error) {
  return {
    name: typeof error?.name === "string" ? error.name.slice(0, 128) : "Error",
    code: typeof error?.code === "string" ? error.code.slice(0, 128) : null,
    message: typeof error?.message === "string" ? error.message.slice(0, 1024) : "Directory close failed",
  };
}
function guardTraversalPath(path) {
  if (resolve(path) !== path || /[\u0000-\u001f\u007f]/.test(path)
    || Buffer.byteLength(path, "utf8") > loadedArtifactProfile.profile.representation.maxCanonicalPathUtf8Bytes) {
    throw artifactDomainError("Aggregate traversal requires a bounded canonical ordinary path");
  }
}
async function ordinaryTraversalEntry(path) {
  guardTraversalPath(path);
  const identity = await lstat(path, { bigint: true });
  if (identity.isSymbolicLink() || await realpath(path) !== path) {
    throw artifactDomainError("Aggregate traversal refuses an alias: " + path);
  }
  return identity;
}
function sameDirectoryIdentity(left, right) {
  return ["dev", "ino", "mode", "mtimeNs", "ctimeNs", "birthtimeNs"]
    .every(key => left[key] === right[key]);
}
const shards = [];
async function collectShards(directoryPath, depth) {
  if (depth > traversalLimits.directoryDepth) throw enumerationLimit("Aggregate directory depth admission exceeded");
  if (traversal.directoriesAdmitted >= traversalLimits.directoriesIncludingRoot) {
    throw enumerationLimit("Aggregate directory admission exceeded");
  }
  traversal.directoriesAdmitted += 1;
  traversal.maximumAdmittedDepth = Math.max(traversal.maximumAdmittedDepth, depth);
  const before = await ordinaryTraversalEntry(directoryPath);
  if (!before.isDirectory()) throw artifactDomainError("Aggregate root/descent is not an ordinary directory");
  let directory = null;
  let primarySeen = false;
  try {
    directory = await opendir(directoryPath, { bufferSize: 1 });
    ownedDirectories.add(directory);
    traversal.directoriesOpened += 1;
    if (!sameDirectoryIdentity(before, await ordinaryTraversalEntry(directoryPath))) {
      throw Object.assign(new Error("Aggregate directory changed during open"), {
        code: "ERR_RELEASE_ARTIFACT_READ_CONSISTENCY",
      });
    }
    while (true) {
      const entry = await directory.read();
      if (entry === null) break;
      traversal.returnedEntries += 1;
      if (traversal.returnedEntries > traversalLimits.directoryEntriesAllKinds) {
        throw enumerationLimit("Aggregate all-kind directory entry admission exceeded");
      }
      traversal.admittedEntries += 1;
      const path = resolve(directoryPath, entry.name);
      const identity = await ordinaryTraversalEntry(path);
      if (identity.isDirectory()) {
        await collectShards(path, depth + 1);
      } else if (entry.name.endsWith(".json")) {
        if (!identity.isFile()) throw artifactDomainError("Aggregate JSON input is not an ordinary file");
        if (traversal.jsonFilesAdmitted >= traversalLimits.shardJsonFiles) {
          throw enumerationLimit("Aggregate JSON input admission exceeded");
        }
        traversal.jsonFilesAdmitted += 1;
        const read = await artifactContext.readJson(path, { role: "shard", expectedSha256: null });
        shards.push({ file: path, document: read.value });
      }
    }
  } catch (error) {
    primarySeen = true;
    throw error;
  } finally {
    if (directory !== null) {
      try {
        await directory.close();
        ownedDirectories.delete(directory);
        traversal.directoriesClosed += 1;
      } catch (error) {
        traversal.closeFailures.push(boundedCloseFact(error));
        if (!primarySeen) throw error;
      }
    }
  }
  if (!sameDirectoryIdentity(before, await ordinaryTraversalEntry(directoryPath))) {
    throw Object.assign(new Error("Aggregate directory changed during traversal"), {
      code: "ERR_RELEASE_ARTIFACT_READ_CONSISTENCY",
    });
  }
}
try {
  await collectShards(inputDirectory, 0);
} catch (error) {
  traversalFailure = error;
  console.error("RELEASE_ARTIFACT_AGGREGATE_TRAVERSAL " + JSON.stringify({
    traversal, helper: artifactContext.snapshot(),
  }));
  throw error;
}
console.info("RELEASE_ARTIFACT_AGGREGATE_TRAVERSAL " + JSON.stringify({ traversal }));

const expectedSeeds = Array.from(
  { length: seedCount },
  (_, index) => `release-soak-${String(index + 1).padStart(2, "0")}`,
);
const shardBySeed = new Map();
let maxOutputBytes;
for (const shard of shards) {
  const document = shard.document;
  if (!Array.isArray(document.runs) || document.runs.length !== 1) {
    throw new Error(`Release soak shard calendar admission requires exactly one run: ${shard.file}`);
  }
  const run = Array.isArray(document.runs) ? document.runs[0] : undefined;
  const identity = document.checkpoint?.executionIdentity;
  if (!Number.isSafeInteger(identity?.maxOutputBytes) || identity?.maxOutputBytes <= 0) {
    throw new Error(`Invalid release soak shard maxOutputBytes: ${shard.file}`);
  }
  if (maxOutputBytes !== undefined && identity.maxOutputBytes !== maxOutputBytes) {
    throw new Error("Release soak shards must agree on maxOutputBytes");
  }
  maxOutputBytes = identity.maxOutputBytes;
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
    || document.profile?.v8HeapLimitBytes !== certifiedWorkerHeapLimitBytes
    || !run?.seed
    || run.reachedSeason < seasonCount + 1
    || !Number.isFinite(run.memory?.peakRuntimeHeapUsedBytes)
    || !Number.isFinite(run.memory?.peakHeapUsedBytes)
    || document.checkpoint?.executionIdentityHash !== calculatedIdentityHash
    || identity?.candidateCommitSha !== candidateCommitSha
    || identity?.candidateTreeSha !== candidateTreeSha
    || identity?.workerHeapLimitBytes !== certifiedWorkerHeapLimitBytes
    || JSON.stringify(identity?.workerNodeArguments) !== JSON.stringify(certifiedWorkerNodeArguments)
  ) {
    throw new Error(`Invalid release soak shard: ${shard.file}`);
  }
  const calendarFailures = validateReleaseCalendarReceipt(run, seasonCount);
  if (document.persistenceReplay !== undefined) {
    calendarFailures.push(...validateReleaseCalendarReceipt(document.persistenceReplay, seasonCount)
      .map((failure) => `supplied replay ${failure}`));
  }
  if (calendarFailures.length > 0) {
    throw new Error(`Invalid release soak shard ${shard.file}: ${calendarFailures.join("; ")}`);
  }
  if (Object.hasOwn(document, "artifactIo")) {
    assertArtifactBinding(document.artifactIo, expectedArtifactBinding(document.checkpoint.executionIdentityHash), "Release soak shard");
    if (identity.artifactProfileId !== loadedArtifactProfile.profile.profileId
      || identity.artifactProfileSha256 !== loadedArtifactProfile.sha256
      || identity.artifactProfilePurpose !== loadedArtifactProfile.purpose) {
      throw artifactDomainError("Release soak shard execution profile identity does not match the actual selected profile");
    }
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
// Preserve what each source process reported. Same-candidate checkpoint reuse
// remains valid; absent legacy accounting is unknown, never newly executed work.
const shardAccounting = orderedShards.map((document, index) => {
  const checkpoint = document.checkpoint;
  const reused = checkpoint.reusedSeedCount;
  const executed = checkpoint.executedSeedCount;
  for (const value of [reused, executed]) {
    if (value !== undefined && value !== null
      && (!Number.isInteger(value) || value < 0 || value > document.profile.seedCount)) {
      throw new Error(`Invalid release soak checkpoint accounting for ${expectedSeeds[index]}`);
    }
  }
  const accountingKnown = Number.isInteger(reused) && Number.isInteger(executed);
  if (accountingKnown && reused + executed !== document.profile.seedCount) {
    throw new Error(`Inconsistent release soak checkpoint accounting for ${expectedSeeds[index]}`);
  }
  return {
    seed: expectedSeeds[index],
    executionIdentityHash: checkpoint.executionIdentityHash,
    resumeEnabled: typeof checkpoint.resumeEnabled === "boolean" ? checkpoint.resumeEnabled : null,
    accountingKnown,
    reusedSeedCount: Number.isInteger(reused) ? reused : null,
    executedSeedCount: Number.isInteger(executed) ? executed : null,
  };
});
const accountingKnown = shardAccounting.every((shard) => shard.accountingKnown);
const resumeEnabled = shardAccounting.some((shard) => shard.resumeEnabled === true)
  ? true
  : shardAccounting.every((shard) => shard.resumeEnabled === false) ? false : null;
if (
  firstShard.checkpoint?.determinismReplayExecuted !== true
  || firstShard.persistenceReplay?.seed !== runs[0].seed
  || firstShard.persistenceReplay?.digest !== runs[0].digest
) {
  throw new Error("Seed one shard is missing a matching fresh deterministic replay");
}

const executionIdentity = {
  protocolVersion: 1,
  artifactProfileId: loadedArtifactProfile.profile.profileId,
  artifactProfileSha256: loadedArtifactProfile.sha256,
  artifactProfilePurpose: loadedArtifactProfile.purpose,
  candidateCommitSha,
  candidateTreeSha,
  seedCount,
  seedStart: 1,
  seasonCount,
  concurrency: seedCount,
  maxSerializedBytes: firstShard.profile.maxSerializedBytes,
  maxOutputBytes,
  profileKind: "full-canonical-weekly-career",
  processIsolation: "one-seeded-career-per-process",
  workerNodeArguments: certifiedWorkerNodeArguments,
  workerHeapLimitBytes: certifiedWorkerHeapLimitBytes,
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
  artifactIo: expectedArtifactBinding(executionIdentityHash),
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
    resumeEnabled,
    accountingKnown,
    reusedSeedCount: accountingKnown
      ? shardAccounting.reduce((sum, shard) => sum + shard.reusedSeedCount, 0) : null,
    executedSeedCount: accountingKnown
      ? shardAccounting.reduce((sum, shard) => sum + shard.executedSeedCount, 0) : null,
    shardAccounting,
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
    peakRuntimeHeapUsedBytes: Math.max(
      ...runs.map((run) => run.memory.peakRuntimeHeapUsedBytes),
    ),
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

const encodedSummary = await artifactContext.encodeJson(summary, {
  role: "campaign-summary", pretty: true, terminalNewline: true,
});
assertAggregateHealthy();
await mkdir(dirname(outputPath), { recursive: true });
await artifactContext.writeJson(outputPath, encodedSummary, {
  method: "atomic", role: "campaign-summary", assertHealthy: assertAggregateHealthy,
});
console.info(`LONG_CAREER_RELEASE_AGGREGATE ${JSON.stringify(summary.aggregate)}`);
