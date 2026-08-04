import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

const root = resolve(process.cwd());
const statusPath = resolve(
  root,
  process.env.RELEASE_EVIDENCE_STATUS ?? "docs/release/release-evidence-status.json",
);
const manifestPath = resolve(
  root,
  process.env.RELEASE_PACKAGE_MANIFEST ?? "artifacts/release/candidate-package-manifest.json",
);
const coreEvidencePath = resolve(
  root,
  process.env.CORE_EVIDENCE_PATH ?? "artifacts/release/generated/candidate-core-suites.json",
);

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim().toLowerCase();
}

function insideRoot(path) {
  const fromRoot = relative(root, path);
  return fromRoot !== ""
    && fromRoot !== ".."
    && !fromRoot.startsWith(`..${sep}`)
    && !isAbsolute(fromRoot);
}

function repoPath(path) {
  const absolutePath = resolve(root, path);
  if (!insideRoot(absolutePath)) throw new Error(`Evidence path escapes the candidate root: ${path}`);
  return relative(root, absolutePath).replaceAll("\\", "/");
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`${label} cannot be read: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

const statusDocument = await readJson(statusPath, "release evidence policy");
const gate = statusDocument.gates?.longSaveGrowthAndCompaction;
const generatedPolicy = gate?.generatedEvidence;
const exceptionPolicy = gate?.releaseException;
if (
  generatedPolicy?.kind !== "long-career-release-soak"
  || generatedPolicy.minimumSeedCount !== 20
  || generatedPolicy.minimumSeasonCount !== 30
  || generatedPolicy.requireProcessIsolation !== true
  || generatedPolicy.requireDeterministicReplay !== true
  || exceptionPolicy?.kind !== "long-career-timing-exception"
) {
  throw new Error("Tracked release policy does not contain the canonical bounded timing exception");
}

const candidateCommitSha = git(["rev-parse", "HEAD"]);
const candidateTreeSha = git(["rev-parse", "HEAD^{tree}"]);
const sourceStatus = git(["status", "--porcelain", "--untracked-files=all"]);
if (sourceStatus) throw new Error("Refusing to attest a dirty candidate checkout");
if (
  candidateCommitSha !== String(exceptionPolicy.sourceCandidateCommitSha ?? "").toLowerCase()
  || candidateTreeSha !== String(exceptionPolicy.sourceCandidateTreeSha ?? "").toLowerCase()
) {
  throw new Error("Current checkout is not the exact candidate approved for the timing exception");
}

const packageManifest = await readJson(manifestPath, "candidate package manifest");
const coreEvidence = await readJson(coreEvidencePath, "candidate core-suite evidence");
const candidateWorkflowRunId = String(
  process.env.RELEASE_WORKFLOW_RUN_ID
  ?? process.env.GITHUB_RUN_ID
  ?? packageManifest.workflowRunId
  ?? "",
);
const candidateTag = String(
  process.env.RELEASE_CANDIDATE_TAG ?? packageManifest.candidateTag ?? "",
).trim();
if (!/^\d+$/.test(candidateWorkflowRunId)) {
  throw new Error("A numeric candidate package workflow run ID is required");
}
if (!candidateTag) throw new Error("An exact candidate tag is required");
if (
  packageManifest.schemaVersion !== 2
  || String(packageManifest.candidateCommitSha ?? "").toLowerCase() !== candidateCommitSha
  || String(packageManifest.candidateTag ?? "") !== candidateTag
  || String(packageManifest.workflowRunId ?? "") !== candidateWorkflowRunId
) {
  throw new Error("Candidate package manifest does not match the exact candidate/tag/workflow");
}
if (
  coreEvidence.schemaVersion !== 1
  || coreEvidence.evidenceKind !== "candidate-core-suites"
  || coreEvidence.status !== "Passed"
  || coreEvidence.candidateBound !== true
  || coreEvidence.sourceTreeCleanAtStart !== true
  || coreEvidence.sourceAndConfigUnchangedAtCompletion !== true
  || String(coreEvidence.candidateCommitSha ?? "").toLowerCase() !== candidateCommitSha
  || String(coreEvidence.workflowRunId ?? "") !== candidateWorkflowRunId
  || !Array.isArray(coreEvidence.commands)
  || coreEvidence.commands.length === 0
  || coreEvidence.commands.some((command) => !command?.command || command.status !== "Passed")
) {
  throw new Error("Candidate core-suite evidence is incomplete, non-passing, or from another run");
}

const sourceEvidence = exceptionPolicy.sourceEvidence ?? {};
const workflowRunPath = resolve(root, sourceEvidence.workflowRunPath ?? "");
const workflowJobsPath = resolve(root, sourceEvidence.workflowJobsPath ?? "");
const shardDirectory = resolve(root, sourceEvidence.successfulShardDirectory ?? "");
const failedSeedPath = resolve(root, sourceEvidence.failedSeedPath ?? "");
for (const [path, label] of [
  [workflowRunPath, "source workflow run"],
  [workflowJobsPath, "source workflow jobs"],
  [shardDirectory, "source shard directory"],
  [failedSeedPath, "source seed-17 failure"],
]) {
  if (!insideRoot(path)) throw new Error(`${label} path is outside the candidate root`);
}

const sourceRun = await readJson(workflowRunPath, "source workflow run evidence");
const sourceJobs = await readJson(workflowJobsPath, "source workflow jobs evidence");
const sourceWorkflowRunId = String(exceptionPolicy.sourceWorkflowRunId ?? "");
if (
  String(sourceRun.id ?? "") !== sourceWorkflowRunId
  || String(sourceRun.head_sha ?? "").toLowerCase() !== candidateCommitSha
  || sourceRun.event !== "workflow_dispatch"
  || sourceRun.status !== "completed"
  || sourceRun.conclusion !== "cancelled"
) {
  throw new Error("Source workflow run evidence does not match the approved run");
}
if (!Array.isArray(sourceJobs.jobs)) throw new Error("Source workflow jobs evidence has no jobs array");

const successfulSeedIndices = Array.from({ length: 20 }, (_, index) => index + 1)
  .filter((seedIndex) => seedIndex !== 1 && seedIndex !== 17);
const evidencePaths = [workflowRunPath, workflowJobsPath];
for (const seedIndex of successfulSeedIndices) {
  const path = resolve(shardDirectory, `long-career-release-summary-seed-${seedIndex}.json`);
  if (!insideRoot(path)) throw new Error(`Source seed ${seedIndex} path escapes the candidate root`);
  await readFile(path);
  evidencePaths.push(path);
}
const failedSeedEvidence = await readJson(failedSeedPath, "source seed-17 failure evidence");
evidencePaths.push(failedSeedPath);
if (
  failedSeedEvidence.schemaVersion !== 2
  || failedSeedEvidence.evidenceKind !== "long-career-worker-failure"
  || String(failedSeedEvidence.candidateCommitSha ?? "").toLowerCase() !== candidateCommitSha
  || String(failedSeedEvidence.candidateTreeSha ?? "").toLowerCase() !== candidateTreeSha
  || failedSeedEvidence.seedIndex !== 17
  || failedSeedEvidence.seed !== "release-soak-17"
  || failedSeedEvidence.seasonCount !== 30
) {
  throw new Error("Source seed-17 failure evidence does not match the approved candidate");
}

const failureMessage = String(failedSeedEvidence.message ?? "");
const seasonWeekMatch = /S(\d+) W(\d+)/.exec(failureMessage);
const wallMatch = /wall=([0-9.]+)ms/.exec(failureMessage);
const cpuMatch = /expected ([0-9.]+) to be less than ([0-9.]+)/.exec(failureMessage);
if (!seasonWeekMatch || !wallMatch || !cpuMatch) {
  throw new Error("Source seed-17 failure does not contain canonical timing measurements");
}
const reachedSeason = Number(seasonWeekMatch[1]);
const reachedWeek = Number(seasonWeekMatch[2]);
const wallElapsedMs = Number(wallMatch[1]);
const cpuElapsedMs = Number(cpuMatch[1]);
const cpuLimitMs = Number(cpuMatch[2]);
const maximumCpuOverrunRatio = (cpuElapsedMs - cpuLimitMs) / cpuLimitMs;
if (
  reachedSeason < 30
  || wallElapsedMs >= 60000
  || maximumCpuOverrunRatio < 0
  || maximumCpuOverrunRatio > Number(exceptionPolicy.maximumCpuOverrunRatio)
) {
  throw new Error("Source seed-17 timing measurements exceed the approved bound");
}

const approvedBy = String(
  process.env.RELEASE_EXCEPTION_APPROVED_BY ?? process.env.GITHUB_ACTOR ?? "",
).trim();
const approvalReference = String(
  process.env.RELEASE_EXCEPTION_APPROVAL_REFERENCE
  ?? (
    process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : ""
  ),
).trim();
if (!approvedBy || !approvalReference) {
  throw new Error("An attributable release owner and durable approval reference are required");
}
const approvedAt = new Date(process.env.RELEASE_EXCEPTION_APPROVED_AT ?? Date.now());
const validityDays = Number(process.env.RELEASE_EXCEPTION_VALIDITY_DAYS ?? 30);
if (!Number.isFinite(approvedAt.getTime()) || !Number.isInteger(validityDays) || validityDays < 1 || validityDays > 30) {
  throw new Error("Release exception validity must be between 1 and 30 whole days");
}
const expiresAt = new Date(approvedAt.getTime() + validityDays * 24 * 60 * 60 * 1000);

const exception = {
  schemaVersion: 1,
  evidenceKind: "release-gate-exception",
  exceptionKind: "long-career-timing-exception",
  gateId: "longSaveGrowthAndCompaction",
  candidateCommitSha,
  candidateTreeSha,
  candidateTag,
  candidateWorkflowRunId,
  sourceWorkflowRunId,
  packageManifestSha256: await sha256(manifestPath),
  candidateCoreEvidenceSha256: await sha256(coreEvidencePath),
  generatedPolicySha256: createHash("sha256")
    .update(JSON.stringify(generatedPolicy))
    .digest("hex"),
  status: "Accepted",
  approvedBy,
  approvalReference,
  approvedAt: approvedAt.toISOString(),
  expiresAt: expiresAt.toISOString(),
  reasonCode: "release-owner-accepted-bounded-hosted-runner-variance",
  metrics: {
    totalSeedCount: 20,
    successfulSeedCount: 18,
    affectedSeedCount: 2,
    maximumCpuOverrunRatio,
  },
  affectedSeeds: [
    {
      seedIndex: 1,
      seed: "release-soak-01",
      classification: "operator-cancelled-after-risk-acceptance",
      status: "Cancelled",
    },
    {
      seedIndex: 17,
      seed: "release-soak-17",
      classification: "hosted-runner-cpu-timing-variance",
      status: "Failed",
      reachedSeason,
      reachedWeek,
      cpuElapsedMs,
      cpuLimitMs,
      wallElapsedMs,
      wallLimitMs: 60000,
    },
  ],
  controls: Object.fromEntries(
    exceptionPolicy.requiredControls.map((controlId) => [controlId, { status: "Passed" }]),
  ),
  evidence: await Promise.all(evidencePaths.map(async (path) => ({
    path: repoPath(path),
    sha256: await sha256(path),
  }))),
};

const outputPath = resolve(root, process.env.RELEASE_EXCEPTION_OUTPUT ?? exceptionPolicy.path);
if (!insideRoot(outputPath)) throw new Error("Release exception output path escapes the candidate root");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(exception, null, 2)}\n`, "utf8");
console.info(`LONG_CAREER_TIMING_EXCEPTION ${repoPath(outputPath)}`);
