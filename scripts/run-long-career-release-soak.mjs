import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { availableParallelism, cpus, totalmem } from "node:os";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { createArtifactContext, loadArtifactProfile } from "./release-artifact-io.mjs";
import { createWorkerOutputRelay } from "./relay-child-output.mjs";
import { validateReleaseCalendarReceipt } from "./release-calendar-receipt.mjs";

const CHECKPOINT_PROTOCOL_VERSION = 1;
const maxOutputText = process.env.SOAK_MAX_OUTPUT_BYTES ?? String(64 * 1024 * 1024);
const maxOutputBytes = Number(maxOutputText);
if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes <= 0
  || String(maxOutputBytes) !== maxOutputText) {
  throw new Error("SOAK_MAX_OUTPUT_BYTES must be a canonical positive safe integer");
}
const seedCount = Number.parseInt(process.env.SOAK_SEEDS ?? "20", 10);
const seedStart = Number.parseInt(process.env.SOAK_SEED_START ?? "1", 10);
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
const workerNodeArguments = [
  "--max-old-space-size=1440",
  "--max-semi-space-size=32",
  "--expose-gc",
];
const workerHeapLimitBytes = 1536 * 1024 * 1024;
const planOnly = process.env.SOAK_PLAN_ONLY === "true";
const resumeRequested = process.env.SOAK_RESUME !== "false";
const skipDeterminismReplay = process.env.SOAK_SKIP_DETERMINISM_REPLAY === "true";
const maxSerializedBytes = Number.parseInt(
  process.env.SOAK_MAX_SERIALIZED_BYTES ?? String(80 * 1024 * 1024),
  10,
);

if (!Number.isInteger(seedCount) || seedCount <= 0) throw new Error("SOAK_SEEDS must be positive");
if (!Number.isInteger(seedStart) || seedStart <= 0) throw new Error("SOAK_SEED_START must be positive");
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

const loadedArtifactProfile = await loadArtifactProfile();
const artifactProfile = loadedArtifactProfile.profile;
if (!Number.isSafeInteger(seedCount) || !Number.isSafeInteger(seedStart)
  || !Number.isSafeInteger(seasonCount) || !Number.isSafeInteger(concurrency)
  || !Number.isSafeInteger(seedStart + seedCount - 1)
  || seedCount > artifactProfile.campaign.maxPrimarySeeds
  || seasonCount > artifactProfile.campaign.maxSeasons
  || concurrency > artifactProfile.campaign.maxConcurrency) {
  const error = new Error("Requested soak exceeds the admitted artifact campaign");
  error.code = "ERR_RELEASE_ARTIFACT_DOMAIN";
  throw error;
}
if (!planOnly && (process.env.SOAK_PROFILE_MATRIX_ONLY === "true"
  || process.env.SOAK_DIAGNOSTIC_CHECKPOINT_PATH !== undefined)) {
  throw Object.assign(new Error(
    "Shared diagnostic checkpoints and chooser-only output are unsupported by artifact admission",
  ), { code: "ERR_RELEASE_ARTIFACT_UNSUPPORTED_MODE" });
}
const failureOutput = resolve(process.env.SOAK_ARTIFACT_FAILURE_OUTPUT
  ?? "artifacts/release/generated/long-career-artifact-failure.json");
const failureReceiptPath = relative(process.cwd(), failureOutput).split(sep).join("/");
if (!failureReceiptPath || isAbsolute(failureReceiptPath)
  || failureReceiptPath.split("/").some((part) => !part || part === "." || part === ".."
    || /[:\u0000-\u001f\u007f]/.test(part) || /[. ]$/.test(part))) {
  const error = new Error("SOAK_ARTIFACT_FAILURE_OUTPUT must be a contained canonical file path");
  error.code = "ERR_RELEASE_ARTIFACT_DOMAIN";
  throw error;
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

const requiredCertification = artifactProfile.campaign.requiredCertification;
const evidenceClassification = loadedArtifactProfile.purpose === "canonical" && sourceTreeClean
  && seedCount === requiredCertification.primarySeeds && seedStart === requiredCertification.freshReplaySeed
  && seasonCount === requiredCertification.seasons && concurrency === requiredCertification.concurrency
  && resumeRequested === requiredCertification.resume && !skipDeterminismReplay
  ? "canonical" : "diagnostic-fixture";
const artifactContext = createArtifactContext({
  loadedProfile: loadedArtifactProfile, domain: "driver", phase: null, evidenceClassification,
});

const executionIdentity = {
  protocolVersion: CHECKPOINT_PROTOCOL_VERSION,
  candidateCommitSha: currentHeadSha,
  candidateTreeSha: currentTreeSha,
  seedCount,
  seedStart,
  seasonCount,
  concurrency,
  maxSerializedBytes,
  maxOutputBytes,
  artifactProfileId: artifactProfile.profileId,
  artifactProfileSha256: loadedArtifactProfile.sha256,
  artifactProfilePurpose: loadedArtifactProfile.purpose,
  profileKind: "full-canonical-weekly-career",
  processIsolation: "one-seeded-career-per-process",
  workerNodeArguments,
  workerHeapLimitBytes,
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
const artifactIo = Object.freeze({
  schemaVersion: 1, profileId: artifactProfile.profileId,
  profileSha256: loadedArtifactProfile.sha256, purpose: loadedArtifactProfile.purpose,
  expectedExecutionIdentityHash: executionIdentityHash,
  expectedCandidateCommitSha: currentHeadSha, expectedCandidateTreeSha: currentTreeSha,
  failureReceiptPath,
});
let relay;
let primaryFailure;
let hasPrimaryFailure = false;
const diagnosticFailures = [];
function latchFailure(error) {
  if (!hasPrimaryFailure) { primaryFailure = error; hasPrimaryFailure = true; }
  return primaryFailure;
}
function assertNormalHealthy() {
  if (hasPrimaryFailure) throw primaryFailure;
  try { artifactContext.assertHealthy(); relay?.assertHealthy(); }
  catch (error) { throw latchFailure(error); }
}
let activeWorkerReads = 0;
const workerReadWaiters = [];
async function readWorkerJson(path) {
  while (activeWorkerReads >= artifactProfile.readers.workerReadInflight) {
    await new Promise((resolveRead) => workerReadWaiters.push(resolveRead));
    assertNormalHealthy();
  }
  assertNormalHealthy();
  activeWorkerReads += 1;
  try {
    return await artifactContext.readJson(path, { role: "worker", expectedSha256: null });
  } catch (error) {
    const code = ownData(error, "code");
    if (typeof code === "string" && code.startsWith("ERR_RELEASE_ARTIFACT_")) latchFailure(error);
    throw error;
  } finally {
    activeWorkerReads -= 1;
    for (const resumeRead of workerReadWaiters.splice(0)) resumeRead();
  }
}
function ownData(value, key) {
  if ((typeof value !== "object" || value === null) && typeof value !== "function") return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
  } catch { return undefined; }
}
function boundedText(value, maximum, fallback = "", encodedToken = false) {
  if (typeof value !== "string") {
    if (!encodedToken) return { value: fallback, truncated: false };
    value = fallback;
  }
  let low = 0;
  let high = Math.min(value.length, maximum);
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (Buffer.byteLength(JSON.stringify(value.slice(0, middle)), "utf8") - (encodedToken ? 0 : 2) <= maximum) low = middle;
    else high = middle - 1;
  }
  return { value: value.slice(0, low), truncated: low < value.length };
}
function selectedFailure(error, messageMaximum = artifactProfile.failureReserve.encodedMessagePrefixBytes) {
  const reserve = artifactProfile.failureReserve;
  const message = boundedText(typeof error === "string" ? error : ownData(error, "message"),
    messageMaximum, "Unknown failure", true);
  const stack = boundedText(ownData(error, "stack"), artifactProfile.representation.maxOrdinaryScalarStringUtf8Bytes);
  const name = boundedText(ownData(error, "name"), reserve.nameAndCodeUtf8BytesEach, "Error");
  const code = boundedText(ownData(error, "code"), reserve.nameAndCodeUtf8BytesEach);
  return { name: name.value, code: code.value || null, message: message.value,
    messageTruncated: message.truncated, stack: stack.value || null, stackTruncated: stack.truncated,
    nameTruncated: name.truncated, codeTruncated: code.truncated };
}
function rememberDiagnostic(error) {
  if (diagnosticFailures.length < artifactProfile.failureReserve.cumulativeOperations) {
    const selected = selectedFailure(error, 256);
    diagnosticFailures.push({ name: selected.name, code: selected.code,
      message: selected.message, messageTruncated: selected.messageTruncated });
  }
}
function selectedOutcome(outcome) {
  if (!isRecord(outcome)) return undefined;
  const tails = {};
  for (const channel of ["stdout", "stderr"]) {
    const tail = boundedText(ownData(outcome, channel + "Tail"),
      artifactProfile.failureReserve.encodedTailPrefixBytesEach, "", true);
    tails[channel + "Tail"] = tail.value;
    tails[channel + "TailTruncated"] = tail.truncated;
  }
  const stats = {};
  const actualStats = ownData(outcome, "outputStats");
  for (const channel of ["stdout", "stderr"]) {
    const actual = ownData(actualStats, channel);
    const selected = {};
    for (const field of ["observedBytes", "handledBytes", "uncertainBytes", "droppedBytes"]) {
      const value = ownData(actual, field);
      selected[field] = Number.isSafeInteger(value) && value >= 0 ? value : null;
    }
    const digest = ownData(actual, "observedSha256");
    selected.observedSha256 = typeof digest === "string" && /^[a-f0-9]{64}$/.test(digest) ? digest : null;
    stats[channel] = selected;
  }
  const code = ownData(outcome, "code");
  const signal = boundedText(ownData(outcome, "signal"), artifactProfile.failureReserve.nameAndCodeUtf8BytesEach);
  return { code: Number.isSafeInteger(code) ? code : null, signal: signal.value || null,
    ...tails, outputStats: stats };
}
let campaignFailureWrite;
function publishCampaignFailure() {
  if (campaignFailureWrite) return campaignFailureWrite;
  const actual = artifactContext.snapshot().firstFailure;
  if (!actual || !["encode", "read", "write", "progress"].includes(actual.operation)) {
    return Promise.resolve();
  }
  const selected = selectedFailure(actual,
    Math.min(artifactProfile.failureReserve.encodedMessagePrefixBytes,
      Math.floor(artifactProfile.failureReserve.campaignReceiptBytes / 8)));
  const stack = boundedText(actual.stack,
    Math.min(artifactProfile.representation.maxOrdinaryScalarStringUtf8Bytes,
      Math.floor(artifactProfile.failureReserve.campaignReceiptBytes / 4)));
  const failure = {
    code: selected.code, role: actual.role === null ? null
      : boundedText(actual.role, artifactProfile.failureReserve.nameAndCodeUtf8BytesEach).value,
    operation: actual.operation, name: selected.name, message: selected.message,
    messageTruncated: selected.messageTruncated, stack: stack.value || null,
    stackTruncated: stack.truncated,
  };
  for (const field of ["admittedFileBytes", "observedFileBytes"]) {
    const value = actual[field];
    if (Number.isSafeInteger(value) && value >= 0) failure[field] = value;
  }
  if (typeof actual.observedFileBytesDecimal === "string") {
    failure.observedFileBytesDecimal = boundedText(actual.observedFileBytesDecimal, 128).value;
  }
  campaignFailureWrite = writeJsonAtomic(failureOutput, {
    schemaVersion: 1, evidenceKind: "long-career-artifact-failure", status: "Failed",
    candidateCommitSha: currentHeadSha, candidateTreeSha: currentTreeSha, executionIdentityHash,
    artifactProfileId: artifactProfile.profileId, artifactProfileSha256: loadedArtifactProfile.sha256,
    artifactProfilePurpose: loadedArtifactProfile.purpose, driverPid: process.pid, failure,
  }, "campaign-failure", false);
  campaignFailureWrite.catch(() => {});
  return campaignFailureWrite;
}
function sameArtifactBinding(value) {
  if (!isRecord(value)) return false;
  const keys = Object.keys(artifactIo);
  return Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key) && value[key] === artifactIo[key]);
}
// A clean Git candidate is the content fingerprint. Supporting dirty-tree runs
// remain useful diagnostics, but their outputs are never resumed or certified.
const resumeEnabled = resumeRequested && sourceTreeClean;
const requestedSeedIndices = Array.from(
  { length: seedCount },
  (_, index) => seedStart + index,
);
const seedPosition = new Map(
  requestedSeedIndices.map((seedIndex, position) => [seedIndex, position]),
);

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
  if (isRecord(result) && result.artifactIo !== undefined && !sameArtifactBinding(result.artifactIo)) {
    failures.push("worker artifactIo does not match the actual admitted campaign");
  }
  if (!isRecord(result) || result.schemaVersion !== 2) {
    return ["worker result schemaVersion must be 2"];
  }
  if (
    !isRecord(result.profile)
    || result.profile.kind !== executionIdentity.profileKind
    || result.profile.seedCount !== 1
    || result.profile.seasonCount !== seasonCount
    || result.profile.maxSerializedBytes !== maxSerializedBytes
    || result.profile.v8HeapLimitBytes !== workerHeapLimitBytes
    || !isRecord(result.profile.collectionByteBudgets)
  ) {
    failures.push("worker profile does not match the requested single-seed release profile");
  }
  if (!Array.isArray(result.runs) || result.runs.length !== 1 || !isRecord(result.runs[0])) {
    failures.push("worker result must contain exactly one run");
    return failures;
  }
  const run = result.runs[0];
  failures.push(...validateReleaseCalendarReceipt(run, seasonCount));
  if (result.persistenceReplay !== undefined) {
    failures.push(...validateReleaseCalendarReceipt(result.persistenceReplay, seasonCount)
      .map((failure) => `worker supplied replay ${failure}`));
  }
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
    || !isFiniteNumber(run.memory.peakRuntimeHeapUsedBytes)
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
    assertNormalHealthy();
    result = (await readWorkerJson(path)).value;
    assertNormalHealthy();
  } catch (error) {
    const code = ownData(error, "code");
    if (typeof code === "string" && code.startsWith("ERR_RELEASE_ARTIFACT_")) throw latchFailure(error);
    artifactContext.assertHealthy();
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

async function writeJsonAtomic(path, value, role, normal = true) {
  try {
    if (normal) assertNormalHealthy();
    const encoded = await artifactContext.encodeJson(value, {
      role, pretty: true, terminalNewline: true,
    });
    if (normal) assertNormalHealthy();
    await mkdir(dirname(path), { recursive: true });
    if (normal) assertNormalHealthy();
    const result = await artifactContext.writeJson(path, encoded, {
      method: "atomic", role, ...(normal ? { assertHealthy: assertNormalHealthy } : {}),
    });
    if (normal) assertNormalHealthy();
    return result;
  } catch (error) {
    if (normal) latchFailure(error);
    throw error;
  }
}

const inspections = [];
for (const seedIndex of requestedSeedIndices) {
  inspections.push(await readReusableWorker(seedIndex));
  assertNormalHealthy();
}
const reusableSeedIndices = inspections
  .map((inspection, index) => inspection.reusable ? requestedSeedIndices[index] : null)
  .filter((seedIndex) => seedIndex !== null);
const pendingSeedIndices = inspections
  .map((inspection, index) => inspection.reusable ? null : requestedSeedIndices[index])
  .filter((seedIndex) => seedIndex !== null);
const rejectedCheckpoints = inspections
  .map((inspection, index) => inspection.reusable || inspection.reason === "no checkpoint"
    ? null
    : { seedIndex: requestedSeedIndices[index], reason: inspection.reason })
  .filter((entry) => entry !== null);
const plan = {
  schemaVersion: 1,
  evidenceKind: "long-career-release-soak-plan",
  executionIdentity,
  executionIdentityHash,
  artifactIo,
  sourceTreeClean,
  resumeRequested,
  resumeEnabled,
  concurrency,
  reusableSeedIndices,
  pendingSeedIndices,
  rejectedCheckpoints,
  determinismReplayRequired: !skipDeterminismReplay,
};

relay = createWorkerOutputRelay({
  maxOutputBytes,
  stdout: process.stdout,
  stderr: process.stderr,
  tailCodeUnits: 32_768,
});

async function runRelease() {
if (planOnly) {
  await relay.line("stdout", `SOAK_RELEASE_PLAN ${JSON.stringify(plan)}`);
  await relay.finish();
  return;
}
await mkdir(workerDirectory, { recursive: true });
assertNormalHealthy();
await relay.line("stdout", `SOAK_RELEASE_PLAN ${JSON.stringify(plan)}`);

const runs = new Array(seedCount);
let profile;
const seedStates = new Map(
  requestedSeedIndices.map((seedIndex, index) => [
    seedIndex,
    inspections[index].reusable ? "Reused" : "Pending",
  ]),
);
for (const seedIndex of reusableSeedIndices) {
  const position = seedPosition.get(seedIndex);
  if (position === undefined) throw new Error(`Unknown reusable seed ${seedIndex}`);
  const result = inspections[position].result;
  profile ??= result.profile;
  runs[position] = result.runs[0];
}

let checkpointWrite = Promise.resolve();
let failureCheckpointWrite;
let actualWorkerPhases = 0;
const workerPhaseLimit = Math.min(
  artifactProfile.campaign.maxActualWorkerPhases,
  artifactProfile.writers.workerTemporaryResult.phases,
  artifactProfile.writers.workerCanonicalResult.phases,
  artifactProfile.writers.progress.filesPerCampaign,
);
let replayPhaseClaimed = false;
const primaryPhaseSeeds = new Set();
function writeProgress(status, failure = null) {
  const reserved = status === "Failed";
  if (reserved && failureCheckpointWrite) return failureCheckpointWrite;
  if (!reserved) assertNormalHealthy();
  const selected = reserved ? selectedFailure(failure) : null;
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
    failure: selected?.message ?? null,
    ...(selected ? { failureFacts: { name: selected.name, code: selected.code,
      messageTruncated: selected.messageTruncated, nameTruncated: selected.nameTruncated,
      codeTruncated: selected.codeTruncated } } : {}),
    ...(reserved && diagnosticFailures.length ? { diagnosticFailures: [...diagnosticFailures] } : {}),
  };
  if (reserved) {
    const pendingNormalWrites = checkpointWrite;
    failureCheckpointWrite = (async () => {
      try { await pendingNormalWrites; }
      catch (diagnosticError) { rememberDiagnostic(diagnosticError); }
      return writeJsonAtomic(checkpointPath, snapshot, "checkpoint", false);
    })();
    failureCheckpointWrite.catch(() => {});
    return failureCheckpointWrite;
  }
  checkpointWrite = checkpointWrite.then(() => writeJsonAtomic(checkpointPath, snapshot, "checkpoint"))
    .catch((error) => { throw latchFailure(error); });
  checkpointWrite.catch(() => {});
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
  assertNormalHealthy();
  if (!seedPosition.has(seedIndex) || !["run", "determinism-replay"].includes(suffix)
    || (suffix === "run" && primaryPhaseSeeds.has(seedIndex))
    || (suffix === "determinism-replay" && (seedIndex !== requestedSeedIndices[0] || replayPhaseClaimed))) {
    const error = new Error("Worker phase is not an admitted unique campaign slot");
    error.code = "ERR_RELEASE_ARTIFACT_DOMAIN";
    throw latchFailure(error);
  }
  assertCandidateUnchanged();
  const workerOutput = workerOutputPath(seedIndex, suffix);
  const workerRunId = randomUUID();
  const temporaryWorkerOutput = `${workerOutput}.partial-${process.pid}-${workerRunId}.json`;
  const workerProgressOutput = `${workerOutput}.progress-${workerRunId}.jsonl`;
  const startedAt = Date.now();
  let workerOutcome;
  let ordinaryExitFailure;
  try {
    await relay.line(
      "stdout",
      `SOAK_WORKER_START seed=${seedIndex}/${seedCount} suffix=${suffix} active=${[
        ...seedStates.values(),
      ].filter((state) => state === "Active").length}`,
    );
    assertNormalHealthy();
    if (actualWorkerPhases >= workerPhaseLimit) {
      const error = new Error("Actual worker phase limit exceeded");
      error.code = "ERR_RELEASE_ARTIFACT_DOMAIN";
      throw error;
    }
    if (suffix === "run") primaryPhaseSeeds.add(seedIndex);
    else replayPhaseClaimed = true;
    actualWorkerPhases += 1;
    assertNormalHealthy();
    const child = spawn(
        process.execPath,
        [
          ...workerNodeArguments,
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
            SOAK_WORKER_PROGRESS_RUN_ID: workerRunId,
            SOAK_WORKER_PROGRESS_PHASE: suffix,
            SOAK_WORKER_PROGRESS_OUTPUT: workerOutput,
            SOAK_WORKER_PROGRESS_PATH: workerProgressOutput,
            SOAK_WORKER_PROGRESS_DRIVER_PID: String(process.pid),
            SOAK_ARTIFACT_EXECUTION_IDENTITY_HASH: executionIdentityHash,
            SOAK_ARTIFACT_CANDIDATE_COMMIT_SHA: currentHeadSha,
            SOAK_ARTIFACT_CANDIDATE_TREE_SHA: currentTreeSha,
            SOAK_ARTIFACT_EVIDENCE_CLASSIFICATION: evidenceClassification,
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
    const ticket = relay.watch(child, { onSpawn() {
        const vitestPid = child.pid;
        if (!Number.isSafeInteger(vitestPid) || (vitestPid ?? 0) <= 0) {
          throw new Error("Actual spawned Vitest PID is unavailable");
        }
        return relay.line("stdout", `SOAK_WORKER_PROCESS_IDENTITY ${JSON.stringify({
          schemaVersion: 1,
          evidenceKind: "long-career-release-worker-process-identity-v1",
          workerRunId,
          phase: suffix,
          seedIndex,
          seed: expectedSeed(seedIndex),
          driverPid: process.pid,
          vitestPid,
          canonicalOutput: workerOutput,
          temporaryOutput: temporaryWorkerOutput,
          progressPath: workerProgressOutput,
          spawnedAtUtc: new Date().toISOString(),
        })}`);
    } });
    child.once("error", (error) => { latchFailure(error); });
    child.once("exit", (code, signal) => {
      if (code !== 0 || signal !== null) {
        ordinaryExitFailure = new Error(`Soak worker ${seedIndex} failed (${signal ?? code})`);
        latchFailure(ordinaryExitFailure);
      }
    });
    try {
      workerOutcome = await ticket.done;
    } catch (error) {
      workerOutcome = error.outcome;
      throw error;
    }
    if (workerOutcome.code !== 0 || workerOutcome.signal !== null) {
      const diagnostic = (workerOutcome.stderrTail || workerOutcome.stdoutTail).trim();
      const failure = ordinaryExitFailure ?? new Error("Soak worker failed");
      failure.message = `Soak worker ${seedIndex} failed (${workerOutcome.signal ?? workerOutcome.code})${diagnostic ? `\n${diagnostic}` : ""}`;
      throw failure;
    }
    assertNormalHealthy();
    const result = (await readWorkerJson(temporaryWorkerOutput)).value;
    assertNormalHealthy();
    const failures = validateWorkerResult(result, seedIndex, false);
    if (failures.length > 0) {
      throw new Error(`Soak worker ${seedIndex} emitted invalid evidence: ${failures.join("; ")}`);
    }
    const completedResult = {
      ...result,
      artifactIo,
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
    await writeJsonAtomic(workerOutput, completedResult, "worker-result");
    await rm(workerOutput.replace(/\.json$/, "-failure.json"), { force: true });
    assertNormalHealthy();
    await relay.line(
      "stdout",
      `SOAK_WORKER_COMPLETE seed=${seedIndex}/${seedCount} suffix=${suffix} elapsedMinutes=${(
        (Date.now() - startedAt) / 60_000
      ).toFixed(2)}`,
    );
    assertNormalHealthy();
    await rm(temporaryWorkerOutput, { force: true });
    assertNormalHealthy();
    return completedResult;
  } catch (error) {
    const failure = latchFailure(relay.failure ?? error);
    const selected = selectedFailure(failure);
    const outcome = selectedOutcome(workerOutcome);
    try {
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
          message: selected.message, messageTruncated: selected.messageTruncated,
          failureName: selected.name, failureCode: selected.code,
          stack: selected.stack, stackTruncated: selected.stackTruncated,
          ...(outcome ? { outputOutcome: outcome } : {}),
          ...(diagnosticFailures.length ? { diagnosticFailures: [...diagnosticFailures] } : {}),
        },
        "worker-failure", false,
      );
    } catch (diagnosticError) {
      rememberDiagnostic(diagnosticError);
    }
    throw failure;
  }
}

try {
  await writeProgress("InProgress");
  assertNormalHealthy();
  let nextPendingIndex = 0;
  const workerSettlements = await Promise.allSettled(
    Array.from({ length: Math.min(concurrency, pendingSeedIndices.length) }, async () => {
      while (true) {
        assertNormalHealthy();
        const pendingIndex = nextPendingIndex;
        nextPendingIndex += 1;
        const seedIndex = pendingSeedIndices[pendingIndex];
        if (seedIndex === undefined) return;
        seedStates.set(seedIndex, "Active");
        await writeProgress("InProgress");
        try {
          const result = await runWorker(seedIndex);
          assertNormalHealthy();
          profile ??= result.profile;
          const position = seedPosition.get(seedIndex);
          if (position === undefined) throw new Error(`Unknown completed seed ${seedIndex}`);
          runs[position] = result.runs[0];
          seedStates.set(seedIndex, "Completed");
          await writeProgress("InProgress");
        } catch (error) {
          seedStates.set(seedIndex, "Failed");
          const failure = latchFailure(relay.failure ?? error);
          try { await writeProgress("Failed", failure); }
          catch (diagnosticError) { rememberDiagnostic(diagnosticError); }
          throw failure;
        }
      }
    }),
  );
  assertNormalHealthy();
  const failedWorker = workerSettlements.find((settlement) => settlement.status === "rejected");
  if (failedWorker?.status === "rejected") throw failedWorker.reason;

  if (runs.some((run) => !run) || !profile) {
    throw new Error("Long-career soak completed without a result for every requested seed");
  }
  // The replay is intentionally fresh even after a resumed run. Reusing it
  // would turn checkpoint presence into a substitute for determinism proof.
  const replayResult = skipDeterminismReplay
    ? null
    : await runWorker(requestedSeedIndices[0], "determinism-replay");
  assertNormalHealthy();
  const persistenceReplay = replayResult?.runs[0] ?? runs[0];
  const replayCalendarFailures = validateReleaseCalendarReceipt(persistenceReplay, seasonCount);
  if (replayCalendarFailures.length > 0) {
    throw new Error(`worker persistence replay ${replayCalendarFailures.join("; ")}`);
  }
  if (!skipDeterminismReplay && persistenceReplay.digest !== runs[0].digest) {
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
      determinismReplayExecuted: !skipDeterminismReplay,
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
    artifactIo,
  };

  await relay.line("stdout", `LONG_CAREER_RELEASE_GATE ${JSON.stringify(summary.aggregate)}`);
  await relay.finish();
  assertNormalHealthy();
  await checkpointWrite;
  assertNormalHealthy();
  await writeProgress("Passed");
  await checkpointWrite;
  assertNormalHealthy();
  await writeJsonAtomic(outputPath, summary,
    seedCount === 1 ? "single-seed-summary" : "campaign-summary");
} catch (error) {
  const failure = latchFailure(relay.failure ?? error);
  try { await relay.finish(); }
  catch (diagnosticError) { rememberDiagnostic(diagnosticError); }
  try { await checkpointWrite; }
  catch (diagnosticError) { rememberDiagnostic(diagnosticError); }
  try { await writeProgress("Failed", failure); }
  catch (diagnosticError) { rememberDiagnostic(diagnosticError); }
  try { await publishCampaignFailure(); }
  catch (diagnosticError) { rememberDiagnostic(diagnosticError); }
  throw failure;
}
}

try {
  await runRelease();
} catch (error) {
  const failure = latchFailure(relay.failure ?? error);
  try { await relay.finish(); }
  catch (diagnosticError) { rememberDiagnostic(diagnosticError); }
  try { await publishCampaignFailure(); }
  catch (diagnosticError) { rememberDiagnostic(diagnosticError); }
  throw failure;
}
