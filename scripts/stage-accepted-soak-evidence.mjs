import { loadArtifactProfile, createArtifactContext } from "./release-artifact-io.mjs";
import { execFileSync, spawnSync } from "node:child_process";
import { lstat, mkdir, mkdtemp, realpath, rmdir, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";

const options = new Map();
const accepted = new Set(["candidate-dir", "run", "jobs", "shards", "out", "source-run-id"]);
for (const argument of process.argv.slice(2)) {
  const match = /^--([^=]+)=(.+)$/.exec(argument);
  if (!match || !accepted.has(match[1]) || options.has(match[1])) throw new Error(`Invalid staging option: ${argument}`);
  options.set(match[1], match[2]);
}
for (const name of accepted) if (!options.has(name)) throw new Error(`Missing staging option: ${name}`);
const candidate = resolve(options.get("candidate-dir"));
const runPath = resolve(options.get("run"));
const jobsPath = resolve(options.get("jobs"));
const shards = resolve(options.get("shards"));
const output = resolve(options.get("out"));
const sourceRunId = options.get("source-run-id");
if (!/^[1-9][0-9]*$/.test(sourceRunId)) throw new Error("Source run id must be numeric");

const loadedArtifactProfile = await loadArtifactProfile();
const artifactContext = createArtifactContext({
  loadedProfile: loadedArtifactProfile, domain: "staging", phase: null,
  evidenceClassification: "diagnostic-fixture",
});

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

const failureReceiptPath = artifactFailureReceiptPath(candidate);
function expectedArtifactBinding(executionIdentityHash) {
  return {
    schemaVersion: 1, profileId: loadedArtifactProfile.profile.profileId,
    profileSha256: loadedArtifactProfile.sha256, purpose: loadedArtifactProfile.purpose,
    expectedExecutionIdentityHash: executionIdentityHash,
    expectedCandidateCommitSha: candidateSha, expectedCandidateTreeSha: candidateTree,
    failureReceiptPath,
  };
}
function assertStagingHealthy() {
  artifactContext.assertHealthy();
}
const git = (...args) => execFileSync("git", args, { cwd: candidate, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const candidateSha = git("rev-parse", "HEAD").toLowerCase();
const candidateTree = git("rev-parse", "HEAD^{tree}").toLowerCase();
if (git("status", "--porcelain", "--untracked-files=all")) throw new Error("Accepted soak staging requires a clean candidate");
const runRead = await artifactContext.readJson(runPath, { role: "source-run", expectedSha256: null });
const jobsRead = await artifactContext.readJson(jobsPath, { role: "source-jobs", expectedSha256: null });
const run = runRead.value;
const jobReceipt = jobsRead.value;
const expectedRepository = process.env.GITHUB_REPOSITORY || "abmccull/talentscout";
if (run.repository?.full_name !== expectedRepository) throw new Error("Source run repository does not match the release repository");
if (String(run.id) !== sourceRunId) throw new Error("Source run id does not match the accepted run identity");
if (run.head_sha !== candidateSha) throw new Error("Source run head SHA does not match the candidate");
if (run.status !== "completed") throw new Error("Source run status must be completed");
if (run.conclusion !== "success") throw new Error("Source run must have a successful conclusion");
if (Array.isArray(jobReceipt.jobs)
  && jobReceipt.jobs.length > loadedArtifactProfile.profile.readers.sourceJobRows) {
  throw artifactDomainError("Source job receipt exceeds the selected sourceJobRows admission");
}
if (!Array.isArray(jobReceipt.jobs) || jobReceipt.total_count > jobReceipt.jobs.length) {
  throw new Error("Source job receipt is missing jobs or is truncated");
}
const requiredJobs = ["Release quality gate",
  ...Array.from({ length: 20 }, (_, index) => `Exact candidate seed ${index + 1} x 30 seasons`),
  "Aggregate exact candidate 20x30 soak"];
for (const name of requiredJobs) {
  const jobs = jobReceipt.jobs.filter(job => job.name === name);
  if (jobs.length !== 1) throw new Error(`Source receipt needs exactly one required job: ${name}`);
  const job = jobs[0];
  if (String(job.run_id) !== sourceRunId) throw new Error(`Source job run identity does not match: ${name}`);
  if (job.head_sha !== candidateSha) throw new Error(`Source job head SHA does not match candidate: ${name}`);
  if (job.status !== "completed" || job.conclusion !== "success") throw new Error(`Source job must complete successfully: ${name}`);
}

// Aggregate to a temporary sibling. Invalid receipts/shards cannot replace a
// previously accepted canonical artifact, and the original receipts stay raw.
const parent = dirname(output);
await mkdir(parent, { recursive: true });
const temporary = await mkdtemp(resolve(parent, ".accepted-soak-"));
if (!temporary.startsWith(parent + sep) || !basename(temporary).startsWith(".accepted-soak-")) {
  throw new Error("Invalid staging temporary directory");
}
const staged = resolve(temporary, "long-career-release-summary.json");
const temporaryIdentity = await lstat(temporary, { bigint: true });
async function assertKnownTemporary() {
  const current = await lstat(temporary, { bigint: true });
  if (!current.isDirectory() || current.isSymbolicLink() || await realpath(temporary) !== temporary
    || ["dev", "ino", "mode", "birthtimeNs"].some(key => current[key] !== temporaryIdentity[key])) {
    throw artifactDomainError("Accepted staging temporary directory ownership changed");
  }
}
if (!temporaryIdentity.isDirectory() || temporaryIdentity.isSymbolicLink()
  || await realpath(temporary) !== temporary) {
  throw artifactDomainError("Accepted staging temporary directory is not ordinary");
}
async function assertKnownStagedFile(read) {
  const expected = read.descriptorAndClose.pathAfter;
  const current = await lstat(staged, { bigint: true });
  if (expected === null || !current.isFile() || current.isSymbolicLink()
    || await realpath(staged) !== staged
    || ["dev", "ino", "mode", "nlink", "size", "mtimeNs", "ctimeNs", "birthtimeNs"]
      .some(key => String(current[key]) !== expected[key])) {
    throw artifactDomainError("Accepted staging child body changed before cleanup");
  }
}

{
  const result = spawnSync(process.execPath, [resolve(candidate, "scripts/aggregate-release-soak-shards.mjs")], {
    cwd: candidate, encoding: "utf8", env: { ...process.env,
      SOAK_ARTIFACT_PROFILE_PATH: loadedArtifactProfile.path,
      SOAK_ARTIFACT_PROFILE_SHA256: loadedArtifactProfile.sha256,
      SOAK_ARTIFACT_PROFILE_PURPOSE: loadedArtifactProfile.purpose,
      SOAK_SEEDS: "20", SOAK_SEASONS: "30", SOAK_SHARD_DIRECTORY: shards, SOAK_OUTPUT: staged },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Accepted source shard aggregation failed:\n${result.stderr || result.stdout}`);
  const aggregateRead = await artifactContext.readJson(staged, { role: "campaign", expectedSha256: null });
  const summary = aggregateRead.value;
  if (summary.candidateCommitSha !== candidateSha || summary.candidateTreeSha !== candidateTree
    || summary.status !== "Passed" || summary.profile?.seedCount !== 20 || summary.profile?.seasonCount !== 30
    || summary.runs?.length !== 20 || summary.checkpoint?.determinismReplayExecuted !== true) {
    throw new Error("Staged aggregate did not satisfy the exact candidate 20x30 replay contract");
  }
  const aggregateIdentity = summary.checkpoint?.executionIdentity;
  if (aggregateIdentity?.artifactProfileId !== loadedArtifactProfile.profile.profileId
    || aggregateIdentity?.artifactProfileSha256 !== loadedArtifactProfile.sha256
    || aggregateIdentity?.artifactProfilePurpose !== loadedArtifactProfile.purpose) {
    throw artifactDomainError("Staged aggregate did not use the exact selected artifact profile");
  }
  assertArtifactBinding(summary.artifactIo, expectedArtifactBinding(summary.checkpoint.executionIdentityHash), "Staged aggregate");
  if (aggregateRead.descriptorAndClose.pathAfter === null) {
    throw artifactDomainError("Staged aggregate read has no actual retained path identity");
  }
  await assertKnownTemporary();
  summary.acceptedSourceWorkflow = { runId: sourceRunId, repository: expectedRepository,
    candidateCommitSha: candidateSha, runReceiptSha256: runRead.sha256, jobsReceiptSha256: jobsRead.sha256 };
  const encodedSummary = await artifactContext.encodeJson(summary, {
    role: "campaign-summary", pretty: true, terminalNewline: true,
  });
  assertStagingHealthy();
  const publication = await artifactContext.writeJson(output, encodedSummary, {
    method: "atomic", role: "campaign-summary", assertHealthy: assertStagingHealthy,
  });
  try {
    await assertKnownTemporary();
    await assertKnownStagedFile(aggregateRead);
    await unlink(staged);
    await rmdir(temporary);
  } catch (error) {
    console.error("ACCEPTED_SOAK_POST_COMMIT_CLEANUP " + JSON.stringify({
      committed: { path: publication.path, bytes: publication.bytes, sha256: publication.sha256 },
      childStagedPath: staged, childTemporaryDirectory: temporary,
      rollbackAttempted: false,
    }));
    throw error;
  }
  console.info(`Staged exact accepted-source 20x30 evidence for ${candidateSha}`);
}
