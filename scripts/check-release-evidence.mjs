import { validateSentryProviderReceipt } from "./validate-sentry-provider-receipt.mjs";
import { validateAcceptedFontHandoff } from "./accepted-package-font-handoff.mjs";
import { validateReleaseCalendarReceipt } from "./release-calendar-receipt.mjs";
import { auditAssetProvenance, listShippingFontFiles, readOrdinaryFile, safeRelativePath, writeOwnedReport } from "./audit-asset-provenance.mjs";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, lstat, stat } from "node:fs/promises";
import { loadArtifactProfile, createArtifactContext } from "./release-artifact-io.mjs";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(process.cwd());
const statusPath = resolve(
  root,
  process.env.RELEASE_EVIDENCE_STATUS ?? "docs/release/release-evidence-status.json",
);
const outputPath = resolve(
  root,
  process.env.RELEASE_EVIDENCE_OUTPUT ?? "artifacts/release/release-evidence-check.json",
);
const checkerArguments = process.argv.slice(2);
const reportOnly = checkerArguments.includes("--report-only");
let validationScope = "full-release";
let scopeSelected = false;
let invalidScope = false;
for (let index = 0; index < checkerArguments.length; index += 1) {
  const argument = checkerArguments[index];
  if (argument === "--scope") {
    if (scopeSelected) invalidScope = true;
    scopeSelected = true;
    const selected = checkerArguments[index + 1];
    if (selected !== "full-release" && selected !== "diagnostic") invalidScope = true;
    else validationScope = selected;
    index += 1;
  } else if (argument.startsWith("--scope")) {
    invalidScope = true;
  }
}
if (invalidScope) {
  console.error("release policy scope: invalid scope selection");
  process.exit(1);
}
const fullReleaseGateIds = Object.freeze([
  "automatedCoreSuites",
  "manualNvda",
  "manualVoiceOver",
  "moderatedUsability",
  "moderatedPairedCareerReplayability",
  "physicalLowEndHardware",
  "packagedWindows",
  "packagedMacos",
  "packagedLinux",
  "assetCommercialRights",
  "onlineFeedbackBackend",
  "sentryProviderReceipt",
  "longSaveGrowthAndCompaction",
]);
const fullReleasePackageKinds = Object.freeze([
  "windows-installer",
  "macos-dmg",
  "macos-zip",
  "linux-appimage",
  "linux-deb",
]);
const isOrdinaryPolicyRecord = (value) => value !== null
  && typeof value === "object"
  && Object.getPrototypeOf(value) === Object.prototype;
const allowedStatuses = new Set(["Passed", "Failed", "Unverified", "N/A"]);
const hashPattern = /^[a-f0-9]{64}$/i;
const commitPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;
const certifiedSoakWorkerNodeArguments = [
  "--max-old-space-size=1440",
  "--max-semi-space-size=32",
  "--expose-gc",
];
const certifiedSoakHeapLimitBytes = 1536 * 1024 * 1024;
const packageKindExtensions = new Map([
  ["windows-installer", ".exe"],
  ["macos-dmg", ".dmg"],
  ["macos-zip", ".zip"],
  ["linux-appimage", ".appimage"],
  ["linux-deb", ".deb"],
]);

async function git(args) {
  const { stdout } = await execFileAsync("git", args, { cwd: root });
  return stdout.trim();
}

async function gitRaw(args) {
  const { stdout } = await execFileAsync("git", args, { cwd: root });
  return stdout;
}

function isPathInsideRoot(path) {
  const fromRoot = relative(root, path);
  return (
    fromRoot !== "" &&
    fromRoot !== ".." &&
    !fromRoot.startsWith(`..${sep}`) &&
    !isAbsolute(fromRoot)
  );
}

function parsePorcelainEntries(output) {
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => ({
      status: line.slice(0, 2),
      paths: line
        .slice(3)
        .split(" -> ")
        .map((entryPath) => entryPath.replaceAll("\\", "/")),
    }));
}

async function sha256(path) {
  const hash = createHash("sha256");
  await new Promise((resolveHash, rejectHash) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", rejectHash);
    stream.once("end", resolveHash);
  });
  return hash.digest("hex");
}

const loadedArtifactProfile = await loadArtifactProfile();
const artifactContext = createArtifactContext({
  loadedProfile: loadedArtifactProfile,
  domain: "checker",
  phase: null,
  evidenceClassification: validationScope === "full-release" ? "canonical" : "diagnostic-fixture",
});
const globalArtifactAdmissionFailures = [];

function recordArtifactAdmissionFailure(result, message) {
  const text = String(message);
  if (result) {
    result.artifactAdmissionFailures ??= [];
    result.artifactAdmissionFailures.push(text);
    result.failures.push("artifact admission: " + text);
    result.status = "Failed";
  } else {
    globalArtifactAdmissionFailures.push(text);
    failures.push("artifact admission: " + text);
  }
}

function retainArtifactReadFailure(result, error) {
  const actual = artifactContext.snapshot().firstFailure;
  const typedCode = typeof error?.code === "string"
    && error.code.startsWith("ERR_RELEASE_ARTIFACT_") ? error.code : null;
  if (actual || typedCode) {
    recordArtifactAdmissionFailure(result,
      (actual?.code ?? typedCode ?? "artifact I/O failure")
      + " role=" + (actual?.role ?? "unknown")
      + " operation=" + (actual?.operation ?? "read"));
  }
}

async function readEvidenceJson(path, options, result) {
  try {
    return await artifactContext.readJson(path, options);
  } catch (error) {
    retainArtifactReadFailure(result, error);
    throw error;
  }
}

const artifactAdmissionKeys = Object.freeze([
  "schemaVersion", "profileId", "profileSha256", "purpose",
  "expectedExecutionIdentityHash", "expectedCandidateCommitSha",
  "expectedCandidateTreeSha", "failureReceiptPath",
]);
function validArtifactAdmission(value) {
  return isOrdinaryPolicyRecord(value)
    && Object.keys(value).length === artifactAdmissionKeys.length
    && artifactAdmissionKeys.every((key) => Object.hasOwn(value, key))
    && value.schemaVersion === 1
    && typeof value.profileId === "string" && value.profileId.length > 0
    && Buffer.byteLength(value.profileId, "utf8") <= 128
    && typeof value.profileSha256 === "string" && /^[a-f0-9]{64}$/.test(value.profileSha256)
    && (value.purpose === "canonical" || value.purpose === "diagnostic")
    && typeof value.expectedExecutionIdentityHash === "string" && /^[a-f0-9]{64}$/.test(value.expectedExecutionIdentityHash)
    && typeof value.expectedCandidateCommitSha === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value.expectedCandidateCommitSha)
    && typeof value.expectedCandidateTreeSha === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value.expectedCandidateTreeSha)
    && safeRelativePath(value.failureReceiptPath);
}

async function inspectCurrentArtifactFailure(admission, result) {
  if (admission === undefined) return;
  if (!validArtifactAdmission(admission)
    || admission.expectedCandidateCommitSha !== candidateSha
    || admission.expectedCandidateTreeSha !== currentTreeSha) {
    recordArtifactAdmissionFailure(result, "artifact admission policy is invalid or belongs to another candidate");
    return;
  }
  if (validationScope === "full-release" && (admission.purpose !== "canonical"
    || admission.profileId !== "canonical-career-artifact-io-v1"
    || admission.profileSha256 !== "193f139435344eb680c868385483a62dca0fca27732e206ae93ed50ef94f47e5")) {
    recordArtifactAdmissionFailure(result, "full release artifact policy must bind the reviewed canonical profile");
  }
  const path = resolve(root, admission.failureReceiptPath);
  let receipt;
  try {
    receipt = (await artifactContext.readJson(path, {
      role: "failure-receipt", expectedSha256: null,
    })).value;
  } catch (error) {
    if (error?.code === "ENOENT" && !artifactContext.snapshot().firstFailure) return;
    recordArtifactAdmissionFailure(result, "declared current artifact failure receipt cannot be read");
    retainArtifactReadFailure(result, error);
    return;
  }
  if (!isOrdinaryPolicyRecord(receipt)
    || receipt.schemaVersion !== 1
    || receipt.evidenceKind !== "long-career-artifact-failure"
    || receipt.status !== "Failed"
    || !isOrdinaryPolicyRecord(receipt.failure)
    || !Number.isSafeInteger(receipt.driverPid) || receipt.driverPid <= 0
    || !(receipt.failure.code === null || typeof receipt.failure.code === "string")
    || !(receipt.failure.role === null || typeof receipt.failure.role === "string")
    || typeof receipt.failure.stack !== "string"
    || typeof receipt.candidateCommitSha !== "string" || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(receipt.candidateCommitSha)
    || typeof receipt.candidateTreeSha !== "string" || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(receipt.candidateTreeSha)
    || typeof receipt.executionIdentityHash !== "string" || !/^[a-f0-9]{64}$/.test(receipt.executionIdentityHash)
    || typeof receipt.artifactProfileId !== "string" || receipt.artifactProfileId.length === 0
    || Buffer.byteLength(receipt.artifactProfileId, "utf8") > 128
    || typeof receipt.artifactProfileSha256 !== "string" || !/^[a-f0-9]{64}$/.test(receipt.artifactProfileSha256)
    || (receipt.artifactProfilePurpose !== "canonical" && receipt.artifactProfilePurpose !== "diagnostic")
    || (receipt.failure.code === "ERR_RELEASE_ARTIFACT_READ_SIZE" && receipt.failure.role === "worker"
      && (!Number.isSafeInteger(receipt.failure.admittedFileBytes) || receipt.failure.admittedFileBytes <= 0
        || !Number.isSafeInteger(receipt.failure.observedFileBytes)
        || receipt.failure.observedFileBytes <= receipt.failure.admittedFileBytes))) {
    recordArtifactAdmissionFailure(result, "declared artifact failure receipt has an invalid shape");
    return;
  }
  const current = receipt.candidateCommitSha === admission.expectedCandidateCommitSha
    && receipt.candidateTreeSha === admission.expectedCandidateTreeSha
    && receipt.executionIdentityHash === admission.expectedExecutionIdentityHash
    && receipt.artifactProfileId === admission.profileId
    && receipt.artifactProfileSha256 === admission.profileSha256
    && receipt.artifactProfilePurpose === admission.purpose;
  if (!current) return; // A genuine earlier context cannot become a current cause.
  recordArtifactAdmissionFailure(result, "current campaign artifact failure: "
    + String(receipt.failure.code) + " role=" + String(receipt.failure.role));
}

function validateArtifactBinding(evidence, expected, result) {
  const binding = evidence?.artifactIo;
  if (binding === undefined && expected === undefined && validationScope === "diagnostic") return;
  if (!validArtifactAdmission(binding)) {
    recordArtifactAdmissionFailure(result, "soak evidence has no valid observed artifact I/O binding");
    return;
  }
  if (expected !== undefined && (!validArtifactAdmission(expected)
    || artifactAdmissionKeys.some((key) => binding[key] !== expected[key]))) {
    recordArtifactAdmissionFailure(result, "soak artifact I/O binding does not match the expected campaign");
  }
  const identity = evidence.checkpoint?.executionIdentity;
  if (binding.expectedCandidateCommitSha !== candidateSha
    || binding.expectedCandidateTreeSha !== currentTreeSha
    || binding.expectedExecutionIdentityHash !== evidence.checkpoint?.executionIdentityHash
    || identity?.artifactProfileId !== binding.profileId
    || identity?.artifactProfileSha256 !== binding.profileSha256
    || identity?.artifactProfilePurpose !== binding.purpose) {
    recordArtifactAdmissionFailure(result, "soak artifact profile/context identity is inconsistent");
  }
  if (validationScope === "full-release") {
    const required = loadedArtifactProfile.profile.campaign.requiredCertification;
    if (binding.purpose !== "canonical"
      || binding.profileId !== "canonical-career-artifact-io-v1"
      || binding.profileSha256 !== "193f139435344eb680c868385483a62dca0fca27732e206ae93ed50ef94f47e5"
      || identity?.seedCount !== required.primarySeeds || identity?.seedStart !== required.freshReplaySeed
      || identity?.seasonCount !== required.seasons || identity?.concurrency !== required.concurrency
      || evidence.profile?.concurrency !== required.concurrency
      || evidence.checkpoint?.resumeEnabled !== required.resume
      || evidence.checkpoint?.reusedSeedCount !== 0
      || evidence.checkpoint?.executedSeedCount !== required.primarySeeds
      || evidence.checkpoint?.determinismReplayExecuted !== true
      || evidence.runs?.[0]?.seed !== "release-soak-01"
      || evidence.persistenceReplay?.seed !== "release-soak-01") {
      recordArtifactAdmissionFailure(result, "full release requires the canonical fresh 20x30/c3 campaign and fresh seed-one replay");
    }
  }
}

async function readOrdinaryPolicyJson(path, role, expectedSha256, result) {
  if (!safeRelativePath(path)) throw new Error("Unsafe relative policy JSON path");
  let current = root;
  const parts = path.split("/");
  for (let index = 0; index < parts.length; index += 1) {
    current = resolve(current, parts[index]);
    const metadata = await lstat(current);
    if (metadata.isSymbolicLink()
      || (index < parts.length - 1 ? !metadata.isDirectory() : !metadata.isFile())) {
      throw new Error("Nonordinary policy JSON path: " + path);
    }
  }
  return readEvidenceJson(current, { role, expectedSha256 }, result);
}

const admittedStatus = await artifactContext.readJson(statusPath, { role: "status", expectedSha256: null });
const statusDocument = admittedStatus.value;
const packageDocument = (await artifactContext.readJson(resolve(root, "package.json"), {
  role: "package", expectedSha256: null,
})).value;
const productVersion = String(packageDocument.version ?? "").trim();
const currentSha = (await git(["rev-parse", "HEAD"])).toLowerCase();
const currentTreeSha = (await git(["rev-parse", "HEAD^{tree}"])).toLowerCase();
const treeOutput = await gitRaw(["status", "--porcelain", "--untracked-files=all"]);
const dirty = treeOutput.length > 0;
const dirtyPaths = [
  ...new Set(parsePorcelainEntries(treeOutput).flatMap((entry) => entry.paths)),
];
const configuredSha =
  process.env.RELEASE_CANDIDATE_SHA?.trim() || process.env.GITHUB_SHA?.trim() || currentSha;
const candidateSha = configuredSha.toLowerCase();
const candidateShaSource = process.env.RELEASE_CANDIDATE_SHA?.trim()
  ? "RELEASE_CANDIDATE_SHA"
  : process.env.GITHUB_SHA?.trim()
    ? "GITHUB_SHA"
    : "git HEAD";

const failures = [];
const policyCompletenessFailures = [];
const policyGates = isOrdinaryPolicyRecord(statusDocument.gates) ? statusDocument.gates : {};
if (!isOrdinaryPolicyRecord(statusDocument.gates)) {
  policyCompletenessFailures.push("release policy completeness: gates must be an ordinary object");
}
for (const [gateId, gate] of Object.entries(policyGates)) {
  if (!isOrdinaryPolicyRecord(gate)) {
    policyCompletenessFailures.push("release policy completeness: declared gate " + gateId + " must be an ordinary object");
  }
}
if (validationScope === "full-release") {
  for (const gateId of fullReleaseGateIds) {
    if (!Object.hasOwn(policyGates, gateId)) {
      policyCompletenessFailures.push("release policy completeness: missing gate " + gateId);
    }
  }
  const sentryPolicy = policyGates.sentryProviderReceipt;
  if (sentryPolicy?.status === "N/A" || sentryPolicy?.generatedEvidence?.kind !== "sentry-provider-receipt"
    || !safeRelativePath(sentryPolicy?.generatedEvidence?.path)) {
    policyCompletenessFailures.push("release policy completeness: mandatory Sentry provider receipt policy is missing or weakened");
  }
}
if (statusDocument.schemaVersion !== 2) {
  failures.push(`release evidence status has unsupported schemaVersion ${String(statusDocument.schemaVersion)}`);
}
if (!commitPattern.test(candidateSha)) {
  failures.push(`${candidateShaSource} is not a full Git commit SHA`);
} else if (candidateSha !== currentSha) {
  failures.push(`${candidateShaSource} ${candidateSha} does not match HEAD ${currentSha}`);
}
if (dirty) failures.push("working tree is dirty; evidence cannot describe an exact shipping candidate");

const configuredTag =
  process.env.RELEASE_CANDIDATE_TAG?.trim() || statusDocument.candidate?.tag;
const tagBindingMode = process.env.RELEASE_TAG_BINDING_MODE?.trim().toLowerCase() || "resolved";
const allowedTagBindingModes = new Set(["resolved", "intended"]);
if (!allowedTagBindingModes.has(tagBindingMode)) {
  failures.push(
    `RELEASE_TAG_BINDING_MODE must be one of ${[...allowedTagBindingModes].join(", ")}`,
  );
}
const expectedVersionTag = productVersion ? `v${productVersion}` : null;
const escapedProductVersion = productVersion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const compatibleVersionTagPattern = productVersion
  ? new RegExp(`^v${escapedProductVersion}(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$`)
  : null;
if (statusDocument.candidate?.requireVersionTag === true) {
  if (!configuredTag) {
    failures.push("an exact release tag is required for this candidate");
  } else if (!compatibleVersionTagPattern?.test(configuredTag)) {
    failures.push(
      `candidate tag ${configuredTag} is not ${expectedVersionTag ?? "<missing>"} or a prerelease of it`,
    );
  }
}
if (configuredTag && tagBindingMode === "resolved") {
  try {
    const taggedSha = (await git(["rev-parse", `${configuredTag}^{commit}`])).toLowerCase();
    if (taggedSha !== candidateSha) {
      failures.push(`candidate tag ${configuredTag} resolves to ${taggedSha}, not ${candidateSha}`);
    }
  } catch {
    failures.push(`candidate tag ${configuredTag} cannot be resolved`);
  }
}

const configuredManifest =
  process.env.RELEASE_PACKAGE_MANIFEST?.trim() || statusDocument.candidate?.packageManifest;
const requiredWorkflowRunId = process.env.RELEASE_WORKFLOW_RUN_ID?.trim();
const configuredRequiredKinds = statusDocument.candidate?.requiredPackageKinds;
const requiredPackageKinds = Array.isArray(configuredRequiredKinds)
  ? configuredRequiredKinds.filter((kind) => typeof kind === "string" && kind.trim()).map((kind) => kind.trim())
  : [];
if (!Array.isArray(configuredRequiredKinds) || requiredPackageKinds.length !== configuredRequiredKinds.length) {
  failures.push("candidate.requiredPackageKinds must be an array of non-empty strings");
  policyCompletenessFailures.push("release policy completeness: candidate.requiredPackageKinds must be an array of non-empty strings");
}
if (new Set(requiredPackageKinds).size !== requiredPackageKinds.length) {
  failures.push("candidate.requiredPackageKinds contains duplicates");
  policyCompletenessFailures.push("release policy completeness: candidate.requiredPackageKinds contains duplicates");
}
if (validationScope === "full-release") {
  const ownKindsDeclared = Object.hasOwn(statusDocument, "candidate")
    && isOrdinaryPolicyRecord(statusDocument.candidate)
    && Object.hasOwn(statusDocument.candidate, "requiredPackageKinds");
  for (const kind of fullReleasePackageKinds) {
    if (!ownKindsDeclared || !requiredPackageKinds.includes(kind)) {
      policyCompletenessFailures.push("release policy completeness: missing package kind " + kind);
    }
  }
}
const packageResults = [];
let packageManifest = null;
let packageManifestPath = null;
let packageManifestSha256 = null;

if (!configuredManifest) {
  failures.push("no release package manifest is configured");
} else {
  packageManifestPath = resolve(root, configuredManifest);
  try {
    const admittedManifest = await artifactContext.readJson(packageManifestPath, { role: "manifest", expectedSha256: null });
    packageManifest = admittedManifest.value;
    packageManifestSha256 = admittedManifest.sha256;
  } catch (error) {
    retainArtifactReadFailure(null, error);
    failures.push(
      `release package manifest cannot be read: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

if (packageManifest) {
  if (packageManifest.schemaVersion !== 2) {
    failures.push(`release package manifest has unsupported schemaVersion ${String(packageManifest.schemaVersion)}`);
  }
  const manifestSha = String(packageManifest.candidateCommitSha ?? "").toLowerCase();
  if (manifestSha !== candidateSha) {
    failures.push(
      `release package manifest candidate ${manifestSha || "<missing>"} does not match ${candidateSha}`,
    );
  }
  if (String(packageManifest.productVersion ?? "") !== productVersion) {
    failures.push(
      `release package manifest version ${String(packageManifest.productVersion ?? "<missing>")} does not match package version ${productVersion}`,
    );
  }
  if (configuredTag && String(packageManifest.candidateTag ?? "") !== configuredTag) {
    failures.push(
      `release package manifest tag ${String(packageManifest.candidateTag ?? "<missing>")} does not match ${configuredTag}`,
    );
  }
  if (
    requiredWorkflowRunId
    && String(packageManifest.workflowRunId ?? "") !== requiredWorkflowRunId
  ) {
    failures.push(
      `release package manifest workflow run ${String(packageManifest.workflowRunId ?? "<missing>")} does not match ${requiredWorkflowRunId}`,
    );
  }
  if (!Array.isArray(packageManifest.packages) || packageManifest.packages.length === 0) {
    failures.push("release package manifest contains no packages");
  } else {
    const seenPaths = new Set();
    const presentKinds = new Set();
    for (const entry of packageManifest.packages) {
      const kind = typeof entry?.kind === "string" ? entry.kind.trim() : "";
      const packagePath = typeof entry?.path === "string" ? entry.path.trim() : "";
      const expectedHash = typeof entry?.sha256 === "string" ? entry.sha256.toLowerCase() : "";
      const expectedBytes = entry?.bytes;
      const result = {
        kind,
        path: packagePath,
        expectedSha256: expectedHash,
        actualSha256: null,
        expectedBytes: Number.isInteger(expectedBytes) ? expectedBytes : null,
        actualBytes: null,
        status: "Failed",
        failures: [],
      };
      packageResults.push(result);

      if (!kind) {
        result.failures.push("package kind is missing");
      } else if (presentKinds.has(kind)) {
        result.failures.push("package kind is duplicated in the manifest");
      } else {
        presentKinds.add(kind);
      }
      if (!packagePath) {
        result.failures.push("package path is missing");
      } else if (isAbsolute(packagePath)) {
        result.failures.push("package path must be relative to the repository root");
      } else {
        const expectedExtension = packageKindExtensions.get(kind);
        if (expectedExtension && extname(packagePath).toLowerCase() !== expectedExtension) {
          result.failures.push(`package kind ${kind} requires a ${expectedExtension} file`);
        }
      }
      if (!hashPattern.test(expectedHash)) result.failures.push("sha256 must contain 64 hexadecimal characters");
      if (!Number.isSafeInteger(expectedBytes) || expectedBytes <= 0) {
        result.failures.push("bytes must be a positive integer");
      }

      const absolutePackagePath = packagePath ? resolve(root, packagePath) : root;
      if (packagePath && !isPathInsideRoot(absolutePackagePath)) {
        result.failures.push("package path escapes the repository root");
      }
      const normalizedPath = packagePath ? relative(root, absolutePackagePath).replaceAll("\\", "/") : "";
      if (normalizedPath && seenPaths.has(normalizedPath)) {
        result.failures.push("package path is duplicated in the manifest");
      }
      if (normalizedPath) seenPaths.add(normalizedPath);

      if (result.failures.length === 0) {
        try {
          const packageStat = await stat(absolutePackagePath);
          if (!packageStat.isFile()) {
            result.failures.push("package path is not a file");
          } else {
            result.actualBytes = packageStat.size;
            result.actualSha256 = await sha256(absolutePackagePath);
            if (result.actualBytes !== expectedBytes) result.failures.push("package byte length does not match");
            if (result.actualSha256 !== expectedHash) result.failures.push("package SHA-256 does not match");
          }
        } catch (error) {
          result.failures.push(
            `package cannot be read: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      if (result.failures.length === 0) result.status = "Passed";
      else failures.push(`${kind || packagePath || "package"}: ${result.failures.join(", ")}`);
    }

    for (const requiredKind of requiredPackageKinds) {
      if (!presentKinds.has(requiredKind)) {
        failures.push(`release package manifest is missing required package kind ${requiredKind}`);
      }
    }
  }
}

async function validateGeneratedGateEvidence(gateId, policy) {
  const configuredPath = typeof policy?.path === "string" ? policy.path : "";
  const result = {
    kind: typeof policy?.kind === "string" ? policy.kind : "",
    path: configuredPath.replaceAll("<candidate-sha>", candidateSha),
    status: "Unverified",
    failures: [],
  };
  const supportedKinds = new Set([
    "long-career-release-soak",
    "candidate-core-suites",
    "windows-packaged-runtime",
    "release-gate-attestation",
    "sentry-provider-receipt",
  ]);
  if (!supportedKinds.has(result.kind)) {
    result.failures.push(`unsupported generated evidence kind ${result.kind || "<missing>"}`);
    return result;
  }
  if (!result.path || isAbsolute(result.path)) {
    result.failures.push("generated evidence path must be repository-relative");
    return result;
  }
  const evidencePath = resolve(root, result.path);
  if (!isPathInsideRoot(evidencePath)) {
    result.failures.push("generated evidence path escapes the repository root");
    return result;
  }

  if (result.kind === "long-career-release-soak") {
    await inspectCurrentArtifactFailure(policy.artifactAdmission, result);
  }
  let evidence;
  try {
    const role = result.kind === "long-career-release-soak" ? "campaign"
      : result.kind === "candidate-core-suites" ? "core" : "other-supported-json";
    evidence = (result.kind === "sentry-provider-receipt"
      ? await readOrdinaryPolicyJson(result.path, role, null, result)
      : await artifactContext.readJson(evidencePath, { role, expectedSha256: null })).value;
  } catch (error) {
    retainArtifactReadFailure(result, error);
    if (validationScope === "full-release" && result.kind === "long-career-release-soak") {
      recordArtifactAdmissionFailure(result, "full release cannot verify the actual canonical fresh campaign from missing or unreadable success evidence");
    }
    result.failures.push(
      `generated evidence cannot be read: ${error instanceof Error ? error.message : String(error)}`,
    );
    return result;
  }

  function requiredControls() {
    if (!Array.isArray(policy.requiredControls) || policy.requiredControls.length === 0) {
      result.failures.push("generated evidence policy must declare requiredControls");
      return [];
    }
    const controls = policy.requiredControls
      .filter((controlId) => typeof controlId === "string" && controlId.trim())
      .map((controlId) => controlId.trim());
    if (controls.length !== policy.requiredControls.length) {
      result.failures.push("generated evidence policy has invalid requiredControls entries");
    }
    if (new Set(controls).size !== controls.length) {
      result.failures.push("generated evidence policy has duplicate requiredControls entries");
    }
    return [...new Set(controls)];
  }

  function validateRequiredControls() {
    const controls = requiredControls();
    for (const controlId of controls) {
      const control = evidence.controls?.[controlId];
      if (!control) {
        result.failures.push(`required control ${controlId} is missing`);
      } else if (control.status !== "Passed") {
        result.failures.push(
          `required control ${controlId} is ${String(control.status ?? "missing a status")}`,
        );
      }
    }
  }

  if (result.kind === "sentry-provider-receipt") {
    try {
      result.failures.push(...await validateSentryProviderReceipt({
        evidence, candidateSha, candidateTreeSha: currentTreeSha, candidateTag: configuredTag,
        packageManifest, packageManifestSha256,
        readBoundJson: (path, expectedSha256) => readOrdinaryPolicyJson(path, "other-supported-json", expectedSha256, result),
      }));
    } catch (error) {
      result.failures.push(`Sentry receipt validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    result.status = result.failures.length === 0 ? "Passed" : "Failed";
    return result;
  }

  if (result.kind === "candidate-core-suites") {
    if (evidence.schemaVersion !== 1 || evidence.evidenceKind !== result.kind) {
      result.failures.push("candidate core-suite evidence schema/kind is invalid");
    }
    if (String(evidence.candidateCommitSha ?? "").toLowerCase() !== candidateSha) {
      result.failures.push("candidate core-suite evidence does not describe the exact commit");
    }
    if (
      evidence.status !== "Passed"
      || evidence.candidateBound !== true
      || evidence.sourceTreeCleanAtStart !== true
      || evidence.sourceAndConfigUnchangedAtCompletion !== true
    ) {
      result.failures.push("candidate core suites did not complete from a clean checkout");
    }
    const replayabilityArtifact = typeof policy.replayabilityArtifact === "string"
      ? policy.replayabilityArtifact.trim()
      : "";
    result.replayabilityArtifact = {
      path: replayabilityArtifact,
      status: "Unverified",
      failures: [],
    };
    if (!replayabilityArtifact || isAbsolute(replayabilityArtifact)) {
      result.replayabilityArtifact.failures.push(
        "candidate core-suite policy must name a repository-relative replayability artifact",
      );
    } else {
      const replayabilityPath = resolve(root, replayabilityArtifact);
      if (!isPathInsideRoot(replayabilityPath)) {
        result.replayabilityArtifact.failures.push(
          "replayability artifact path escapes the repository root",
        );
      } else {
        try {
          const replayability = (await readEvidenceJson(replayabilityPath, { role: "replayability", expectedSha256: null }, result)).value;
          const authority = replayability.humanFacingProxies?.authority;
          if (replayability.passed !== true) {
            result.replayabilityArtifact.failures.push(
              "replayability artifact did not pass its simulation thresholds",
            );
          }
          if (String(authority?.sourceHeadSha ?? "").toLowerCase() !== candidateSha) {
            result.replayabilityArtifact.failures.push(
              "replayability artifact does not describe the exact candidate commit",
            );
          }
          if (
            authority?.gitInspectionSucceeded !== true
            || authority?.sourceTreeClean !== true
            || authority?.sourceDirtyEntryCount !== 0
            || authority?.evidenceClass !== "clean_commit_bound"
            || authority?.releaseCertificationEligible !== true
          ) {
            result.replayabilityArtifact.failures.push(
              "replayability artifact is diagnostic-only, not clean commit-bound release evidence",
            );
          }
        } catch (error) {
          result.replayabilityArtifact.failures.push(
            `replayability artifact cannot be read: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
    if (result.replayabilityArtifact.failures.length === 0) {
      result.replayabilityArtifact.status = "Passed";
    } else {
      result.failures.push(...result.replayabilityArtifact.failures);
    }
    const requiredWorkflowRunId = process.env.RELEASE_WORKFLOW_RUN_ID?.trim();
    if (requiredWorkflowRunId && String(evidence.workflowRunId ?? "") !== requiredWorkflowRunId) {
      result.failures.push("candidate core-suite evidence came from another workflow run");
    }
    const commands = Array.isArray(evidence.commands) ? evidence.commands : [];
    if (
      commands.length === 0
      || commands.some((command) => !command?.command || command.status !== "Passed")
    ) {
      result.failures.push("candidate core-suite evidence has missing or non-passing commands");
    }
    if (result.failures.length === 0) result.status = "Passed";
    return result;
  }

  if (result.kind === "windows-packaged-runtime") {
    if (evidence.schemaVersion !== 1) {
      result.failures.push("Windows runtime evidence schemaVersion must be 1");
    }
    if (String(evidence.sourceHead ?? "").toLowerCase() !== candidateSha) {
      result.failures.push("Windows runtime evidence does not describe the exact candidate commit");
    }
    if (evidence.candidateBound !== true || evidence.sourceTreeClean !== true) {
      result.failures.push("Windows runtime evidence is not bound to a clean candidate");
    }
    if (evidence.candidateManifestBinding?.passed !== true) {
      result.failures.push("Windows runtime evidence did not pass candidate-manifest binding");
    }
    if ((evidence.authenticode?.Status ?? evidence.authenticode?.status) !== "Valid") {
      result.failures.push("Windows installer Authenticode status is not Valid");
    }
    if (evidence.exactCandidateInstallJourney?.status !== "Passed") {
      result.failures.push("exact Windows install-save-restart-load-uninstall journey did not pass");
    }
    const contradictoryLimitations = (Array.isArray(evidence.limitations) ? evidence.limitations : [])
      .filter((limitation) => typeof limitation === "string")
      .filter((limitation) =>
        /source tree was dirty|not a pass for the installer|supporting unpacked-runtime evidence only/i
          .test(limitation)
      );
    if (
      evidence.exactCandidateInstallJourney?.status === "Passed"
      && contradictoryLimitations.length > 0
    ) {
      result.failures.push(
        "Windows runtime evidence contradicts its passing exact installed-package journey",
      );
    }
    const failedControls = Object.entries(evidence.controls ?? {})
      .filter(([, control]) => control?.status === "Failed")
      .map(([controlId]) => controlId);
    if (failedControls.length > 0) {
      result.failures.push(`Windows runtime evidence contains failed controls: ${failedControls.join(", ")}`);
    }
    validateRequiredControls();
    const manifestWindows = packageManifest?.packages?.find(
      (entry) => entry?.kind === "windows-installer",
    );
    const evidenceWindows = evidence.artifacts?.find(
      (entry) => entry?.kind === "windows-installer",
    );
    if (
      !manifestWindows
      || !evidenceWindows
      || String(evidenceWindows.sha256 ?? "").toLowerCase()
        !== String(manifestWindows.sha256 ?? "").toLowerCase()
      || evidenceWindows.bytes !== manifestWindows.bytes
    ) {
      result.failures.push("Windows runtime installer hash/length does not match the package manifest");
    }
    if (result.failures.length === 0) result.status = "Passed";
    return result;
  }

  if (result.kind === "release-gate-attestation") {
    if (evidence.schemaVersion !== 1 || evidence.evidenceKind !== result.kind) {
      result.failures.push("release gate attestation schema/kind is invalid");
    }
    if (evidence.gateId !== gateId) {
      result.failures.push(`release gate attestation names ${String(evidence.gateId)}, not ${gateId}`);
    }
    if (String(evidence.candidateCommitSha ?? "").toLowerCase() !== candidateSha) {
      result.failures.push("release gate attestation does not describe the exact candidate commit");
    }
    if (configuredTag && evidence.candidateTag !== configuredTag) {
      result.failures.push("release gate attestation does not describe the exact candidate tag");
    }
    if (evidence.status !== "Passed" || typeof evidence.operator !== "string" || !evidence.operator.trim()) {
      result.failures.push("release gate attestation is not a completed operator-signed pass");
    }
    if (!Number.isFinite(Date.parse(evidence.completedAt ?? ""))) {
      result.failures.push("release gate attestation has no valid completion timestamp");
    }
    let expectedManifestHash = null;
    if (packageManifestPath) {
      try {
        expectedManifestHash = packageManifestSha256;
      } catch {
        // The package-manifest validation above records the actionable failure.
      }
    }
    if (!expectedManifestHash || String(evidence.packageManifestSha256 ?? "").toLowerCase() !== expectedManifestHash) {
      result.failures.push("release gate attestation is not bound to the exact package manifest");
    }
    const controls = Object.entries(evidence.controls ?? {});
    if (controls.length === 0 || controls.some(([, control]) => control?.status !== "Passed")) {
      result.failures.push("release gate attestation has missing or non-passing controls");
    }
    validateRequiredControls();
    const requiredKinds = Array.isArray(policy.requiredPackageKinds)
      ? policy.requiredPackageKinds
      : [];
    for (const kind of requiredKinds) {
      const packageEntry = packageManifest?.packages?.find((entry) => entry?.kind === kind);
      if (
        !packageEntry
        || String(evidence.packageHashes?.[kind] ?? "").toLowerCase()
          !== String(packageEntry.sha256 ?? "").toLowerCase()
      ) {
        result.failures.push(`release gate attestation is not bound to package kind ${kind}`);
      }
    }
    const evidenceFiles = Array.isArray(evidence.evidence) ? evidence.evidence : [];
    if (evidenceFiles.length === 0) {
      result.failures.push("release gate attestation contains no evidence files");
    }
    for (const entry of evidenceFiles) {
      const entryPath = typeof entry?.path === "string" ? entry.path : "";
      const expectedHash = typeof entry?.sha256 === "string" ? entry.sha256.toLowerCase() : "";
      if (!entryPath || isAbsolute(entryPath) || !hashPattern.test(expectedHash)) {
        result.failures.push("release gate attestation has an invalid evidence file entry");
        continue;
      }
      const absoluteEntryPath = resolve(root, entryPath);
      if (!isPathInsideRoot(absoluteEntryPath)) {
        result.failures.push(`release gate evidence path escapes the repository: ${entryPath}`);
        continue;
      }
      try {
        const admittedEntry = extname(entryPath).toLowerCase() === ".json"
          ? await readEvidenceJson(absoluteEntryPath, { role: "other-supported-json", expectedSha256: null }, result)
          : null;
        if ((admittedEntry?.sha256 ?? await sha256(absoluteEntryPath)) !== expectedHash) {
          result.failures.push(`release gate evidence hash does not match: ${entryPath}`);
        }
      } catch (error) {
        result.failures.push(
          `release gate evidence cannot be read: ${entryPath} (${error instanceof Error ? error.message : String(error)})`,
        );
      }
    }
    if (result.failures.length === 0) result.status = "Passed";
    return result;
  }

  validateArtifactBinding(evidence, policy.artifactAdmission, result);
  if (evidence.schemaVersion !== 3) result.failures.push("soak evidence schemaVersion must be 3");
  if (evidence.evidenceKind !== result.kind) result.failures.push("soak evidence kind does not match policy");
  if (String(evidence.candidateCommitSha ?? "").toLowerCase() !== candidateSha) {
    result.failures.push("soak evidence does not describe the exact candidate commit");
  }
  if (String(evidence.candidateTreeSha ?? "").toLowerCase() !== currentTreeSha) {
    result.failures.push("soak evidence does not describe the exact candidate tree");
  }
  if (evidence.status !== "Passed" || evidence.candidateBound !== true || evidence.sourceTreeClean !== true) {
    result.failures.push("soak evidence was not produced from a clean, passing candidate");
  }

  const minimumSeedCount = Number(policy.minimumSeedCount);
  const minimumSeasonCount = Number(policy.minimumSeasonCount);
  const seedCount = evidence.profile?.seedCount;
  const seasonCount = evidence.profile?.seasonCount;
  const checkpoint = evidence.checkpoint;
  const executionIdentity = checkpoint?.executionIdentity;
  if (!Number.isSafeInteger(executionIdentity?.maxOutputBytes)
    || executionIdentity?.maxOutputBytes <= 0) {
    result.failures.push("soak executionIdentity.maxOutputBytes must be a positive safe integer");
  }
  const calculatedIdentityHash = executionIdentity && typeof executionIdentity === "object"
    ? createHash("sha256").update(JSON.stringify(executionIdentity)).digest("hex")
    : null;
  if (
    checkpoint?.protocolVersion !== 1
    || checkpoint?.determinismReplayExecuted !== true
    || !hashPattern.test(String(checkpoint?.executionIdentityHash ?? ""))
    || checkpoint?.executionIdentityHash !== calculatedIdentityHash
    || executionIdentity?.candidateCommitSha !== candidateSha
    || executionIdentity?.candidateTreeSha !== currentTreeSha
    || executionIdentity?.seedCount !== seedCount
    || executionIdentity?.seasonCount !== seasonCount
    || executionIdentity?.profileKind !== "full-canonical-weekly-career"
    || executionIdentity?.processIsolation !== "one-seeded-career-per-process"
    || executionIdentity?.workerHeapLimitBytes !== certifiedSoakHeapLimitBytes
    || JSON.stringify(executionIdentity?.workerNodeArguments)
      !== JSON.stringify(certifiedSoakWorkerNodeArguments)
    || evidence.profile?.v8HeapLimitBytes !== certifiedSoakHeapLimitBytes
  ) {
    result.failures.push(
      "soak checkpoint identity or certified 1.5 GiB heap ceiling is missing, inconsistent, or not candidate-bound",
    );
  }
  if (
    !Number.isInteger(checkpoint?.reusedSeedCount)
    || !Number.isInteger(checkpoint?.executedSeedCount)
    || checkpoint.reusedSeedCount < 0
    || checkpoint.executedSeedCount < 0
    || checkpoint.reusedSeedCount + checkpoint.executedSeedCount !== seedCount
  ) {
    result.failures.push("soak checkpoint accounting does not cover every requested seed");
  }
  if (!Number.isInteger(minimumSeedCount) || minimumSeedCount <= 0) {
    result.failures.push("generated evidence policy has an invalid minimumSeedCount");
  } else if (!Number.isInteger(seedCount) || seedCount < minimumSeedCount) {
    result.failures.push(`soak evidence requires at least ${minimumSeedCount} seeds`);
  }
  if (!Number.isInteger(minimumSeasonCount) || minimumSeasonCount <= 0) {
    result.failures.push("generated evidence policy has an invalid minimumSeasonCount");
  } else if (!Number.isInteger(seasonCount) || seasonCount < minimumSeasonCount) {
    result.failures.push(`soak evidence requires at least ${minimumSeasonCount} seasons`);
  }
  if (
    policy.requireProcessIsolation === true
    && evidence.profile?.processIsolation !== "one-seeded-career-per-process"
  ) {
    result.failures.push("soak evidence does not use one isolated process per seeded career");
  }
  if (
    evidence.profile?.kind !== "full-canonical-weekly-career"
    || evidence.profile?.skippedOrdinaryWeeks !== false
  ) {
    result.failures.push("soak evidence must process every canonical week without skipping ordinary weeks");
  }

  const runs = Array.isArray(evidence.runs) ? evidence.runs : [];
  if (!Number.isInteger(seedCount) || runs.length !== seedCount) {
    result.failures.push("soak evidence run count does not match its profile");
  }
  const uniqueSeeds = new Set(runs.map((run) => run?.seed));
  if (uniqueSeeds.size !== runs.length || uniqueSeeds.has(undefined)) {
    result.failures.push("soak evidence contains missing or duplicate seeds");
  }
  if (
    Number.isInteger(seasonCount)
    && runs.some((run) => !Number.isInteger(run?.reachedSeason) || run.reachedSeason < seasonCount + 1)
  ) {
    result.failures.push("one or more soak careers did not cross the required final season boundary");
  }
  if (
    Number.isInteger(seasonCount)
    && runs.some((run) => (
      !Number.isInteger(run?.canonicalTicks)
      || !Number.isInteger(run?.calendarWeeksSpanned)
      || run.canonicalTicks !== run.calendarWeeksSpanned
      || run.calendarWeeksSpanned < seasonCount * 30
    ))
  ) {
    result.failures.push("one or more soak careers did not process a complete canonical weekly timeline");
  }
  const calendarAdmissionFailures = [];
  for (const run of runs) {
    calendarAdmissionFailures.push(...validateReleaseCalendarReceipt(run, seasonCount)
      .map((failure) => `soak run ${run?.seed ?? "unknown"} ${failure}`));
  }
  calendarAdmissionFailures.push(...validateReleaseCalendarReceipt(evidence.persistenceReplay, seasonCount)
    .map((failure) => `soak persistence replay ${failure}`));
  result.calendarAdmissionFailures = calendarAdmissionFailures;
  result.failures.push(...calendarAdmissionFailures);
  if (policy.requireDeterministicReplay === true) {
    const firstRun = runs[0];
    if (
      !firstRun?.digest
      || evidence.persistenceReplay?.seed !== firstRun.seed
      || evidence.persistenceReplay?.digest !== firstRun.digest
    ) {
      result.failures.push("soak evidence does not contain a matching deterministic replay");
    }
  }
  if (result.failures.length === 0) result.status = "Passed";
  return result;
}

async function validateReleaseException(gateId, gate) {
  const policy = gate?.releaseException;
  if (!policy) return null;

  const configuredPath = typeof policy.path === "string" ? policy.path.trim() : "";
  const result = {
    kind: typeof policy.kind === "string" ? policy.kind : "",
    path: configuredPath.replaceAll("<candidate-sha>", candidateSha),
    status: "Unverified",
    failures: [],
  };

  // This is intentionally not a general waiver facility. The only accepted
  // exception is the release owner's bounded decision for the canonical
  // long-career timing gate.
  if (
    gateId !== "longSaveGrowthAndCompaction"
    || result.kind !== "long-career-timing-exception"
  ) {
    result.failures.push("release exceptions are supported only for the long-career timing gate");
    return result;
  }
  const canonicalRequiredControls = [
    "qualityAndPlatformBuildsPassed",
    "noCorrectnessCrashMemoryOrSaveFailure",
    "timingVarianceBelowHalfPercent",
    "wallGuardRemainedWithinLimit",
    "candidateAndSourceRunMatch",
    "ownerDirectedCancellationRecorded",
    "rollbackAndMonitoringPlanPresent",
  ];
  const canonicalSourceEvidence = {
    workflowRunPath: "artifacts/release/generated/certifications/source-workflow-run.json",
    workflowJobsPath: "artifacts/release/generated/certifications/source-workflow-jobs.json",
    successfulShardDirectory:
      "artifacts/release/generated/certifications/source-long-career-shards",
    failedSeedPath:
      "artifacts/release/generated/certifications/source-long-career-shards/seed-17-run-failure.json",
  };
  if (
    String(policy.sourceWorkflowRunId ?? "") !== "30902995422"
    || policy.maximumValidityDays !== 30
    || policy.requiredSeedCount !== 20
    || policy.minimumSuccessfulSeedCount !== 18
    || policy.maximumAffectedSeedCount !== 2
    || policy.maximumCpuOverrunRatio !== 0.005
    || policy.minimumReachedSeason !== 30
    || JSON.stringify(policy.allowedReasonCodes) !== JSON.stringify([
      "release-owner-accepted-bounded-hosted-runner-variance",
    ])
    || JSON.stringify(policy.expectedAffectedSeeds) !== JSON.stringify([
      {
        seedIndex: 1,
        classification: "operator-cancelled-after-risk-acceptance",
        status: "Cancelled",
      },
      {
        seedIndex: 17,
        classification: "hosted-runner-cpu-timing-variance",
        status: "Failed",
      },
    ])
    || JSON.stringify(policy.requiredControls) !== JSON.stringify(canonicalRequiredControls)
    || JSON.stringify(policy.sourceEvidence) !== JSON.stringify(canonicalSourceEvidence)
  ) {
    result.failures.push("release exception policy differs from the exact approved risk decision");
  }
  if (!result.path || isAbsolute(result.path)) {
    result.failures.push("release exception path must be repository-relative");
    return result;
  }
  const exceptionPath = resolve(root, result.path);
  if (!isPathInsideRoot(exceptionPath)) {
    result.failures.push("release exception path escapes the repository root");
    return result;
  }

  let exception;
  try {
    exception = (await artifactContext.readJson(exceptionPath, { role: "exception", expectedSha256: null })).value;
  } catch (error) {
    retainArtifactReadFailure(result, error);
    result.failures.push(
      `release exception cannot be read: ${error instanceof Error ? error.message : String(error)}`,
    );
    return result;
  }

  if (
    exception.schemaVersion !== 1
    || exception.evidenceKind !== "release-gate-exception"
    || exception.exceptionKind !== result.kind
  ) {
    result.failures.push("release exception schema/kind is invalid");
  }
  if (exception.gateId !== gateId) {
    result.failures.push(`release exception names ${String(exception.gateId)}, not ${gateId}`);
  }
  if (
    String(exception.candidateCommitSha ?? "").toLowerCase() !== candidateSha
    || String(exception.candidateTreeSha ?? "").toLowerCase() !== currentTreeSha
  ) {
    result.failures.push("release exception does not describe the exact candidate commit and tree");
  }
  if (
    String(policy.sourceCandidateCommitSha ?? "").toLowerCase() !== candidateSha
    || String(policy.sourceCandidateTreeSha ?? "").toLowerCase() !== currentTreeSha
  ) {
    result.failures.push("release exception policy is not locked to this exact candidate");
  }
  if ((configuredTag ?? null) !== (exception.candidateTag ?? null)) {
    result.failures.push("release exception does not describe the exact candidate tag");
  }

  const candidateWorkflowRunId = String(
    requiredWorkflowRunId || packageManifest?.workflowRunId || "",
  );
  if (!/^\d+$/.test(candidateWorkflowRunId)) {
    result.failures.push("release exception cannot resolve the candidate package workflow run");
  } else if (String(exception.candidateWorkflowRunId ?? "") !== candidateWorkflowRunId) {
    result.failures.push("release exception came from another candidate package workflow run");
  }
  if (
    !/^\d+$/.test(String(policy.sourceWorkflowRunId ?? ""))
    || String(exception.sourceWorkflowRunId ?? "") !== String(policy.sourceWorkflowRunId)
  ) {
    result.failures.push("release exception is not bound to the approved source workflow run");
  }

  let expectedManifestHash = null;
  if (packageManifestPath) {
    try {
      expectedManifestHash = packageManifestSha256;
    } catch {
      // Package validation above records the primary failure.
    }
  }
  if (
    !expectedManifestHash
    || String(exception.packageManifestSha256 ?? "").toLowerCase() !== expectedManifestHash
  ) {
    result.failures.push("release exception is not bound to the exact package manifest");
  }

  const coreEvidencePath = typeof policy.candidateCoreEvidencePath === "string"
    ? policy.candidateCoreEvidencePath.trim()
    : "";
  if (!coreEvidencePath || isAbsolute(coreEvidencePath)) {
    result.failures.push("release exception policy must name candidate core evidence");
  } else {
    const absoluteCoreEvidencePath = resolve(root, coreEvidencePath);
    if (!isPathInsideRoot(absoluteCoreEvidencePath)) {
      result.failures.push("candidate core evidence path escapes the repository root");
    } else {
      try {
        const admittedCoreEvidence = await readEvidenceJson(absoluteCoreEvidencePath, { role: "core", expectedSha256: null }, result);
        const coreEvidenceHash = admittedCoreEvidence.sha256;
        const coreEvidence = admittedCoreEvidence.value;
        if (
          String(exception.candidateCoreEvidenceSha256 ?? "").toLowerCase()
            !== coreEvidenceHash
        ) {
          result.failures.push("release exception is not bound to the exact candidate core evidence");
        }
        if (
          coreEvidence.evidenceKind !== "candidate-core-suites"
          || coreEvidence.status !== "Passed"
          || String(coreEvidence.candidateCommitSha ?? "").toLowerCase() !== candidateSha
          || coreEvidence.candidateBound !== true
          || coreEvidence.sourceTreeCleanAtStart !== true
          || coreEvidence.sourceAndConfigUnchangedAtCompletion !== true
          || String(coreEvidence.workflowRunId ?? "") !== candidateWorkflowRunId
          || !Array.isArray(coreEvidence.commands)
          || coreEvidence.commands.length === 0
          || coreEvidence.commands.some(
            (command) => !command?.command || command.status !== "Passed",
          )
        ) {
          result.failures.push(
            "release exception references invalid or non-passing candidate core evidence",
          );
        }
      } catch (error) {
        result.failures.push(
          `candidate core evidence cannot be read: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  const generatedPolicy = gate.generatedEvidence ?? {};
  if (
    generatedPolicy.kind !== "long-career-release-soak"
    || generatedPolicy.minimumSeedCount !== 20
    || generatedPolicy.minimumSeasonCount !== 30
    || generatedPolicy.requireProcessIsolation !== true
    || generatedPolicy.requireDeterministicReplay !== true
  ) {
    result.failures.push(
      "release exception requires the canonical 20-seed, 30-season, isolated deterministic soak policy",
    );
  }
  const generatedPolicyHash = createHash("sha256")
    .update(JSON.stringify(generatedPolicy))
    .digest("hex");
  if (String(exception.generatedPolicySha256 ?? "").toLowerCase() !== generatedPolicyHash) {
    result.failures.push("release exception is not bound to the current long-career policy");
  }

  const approvedAt = Date.parse(exception.approvedAt ?? "");
  const expiresAt = Date.parse(exception.expiresAt ?? "");
  const maximumValidityDays = Number(policy.maximumValidityDays);
  if (
    exception.status !== "Accepted"
    || typeof exception.approvedBy !== "string"
    || !exception.approvedBy.trim()
    || typeof exception.approvalReference !== "string"
    || !exception.approvalReference.trim()
  ) {
    result.failures.push("release exception is not an explicit, attributable risk acceptance");
  }
  if (
    !Number.isFinite(approvedAt)
    || !Number.isFinite(expiresAt)
    || !Number.isFinite(maximumValidityDays)
    || maximumValidityDays <= 0
    || expiresAt <= approvedAt
    || expiresAt > approvedAt + maximumValidityDays * 24 * 60 * 60 * 1000
    || expiresAt <= Date.now()
    || approvedAt > Date.now() + 5 * 60 * 1000
  ) {
    result.failures.push("release exception approval window is invalid or expired");
  }
  const allowedReasonCodes = Array.isArray(policy.allowedReasonCodes)
    ? policy.allowedReasonCodes
    : [];
  if (!allowedReasonCodes.includes(exception.reasonCode)) {
    result.failures.push("release exception reason code is not allowed by policy");
  }

  const metrics = exception.metrics ?? {};
  const affectedSeeds = Array.isArray(exception.affectedSeeds) ? exception.affectedSeeds : [];
  const requiredSeedCount = Number(policy.requiredSeedCount);
  const minimumSuccessfulSeedCount = Number(policy.minimumSuccessfulSeedCount);
  const maximumAffectedSeedCount = Number(policy.maximumAffectedSeedCount);
  if (
    !Number.isInteger(metrics.totalSeedCount)
    || metrics.totalSeedCount !== requiredSeedCount
    || !Number.isInteger(metrics.successfulSeedCount)
    || metrics.successfulSeedCount < minimumSuccessfulSeedCount
    || !Number.isInteger(metrics.affectedSeedCount)
    || metrics.affectedSeedCount !== affectedSeeds.length
    || metrics.affectedSeedCount > maximumAffectedSeedCount
    || metrics.successfulSeedCount + metrics.affectedSeedCount !== metrics.totalSeedCount
  ) {
    result.failures.push("release exception seed accounting exceeds its bounded policy");
  }

  const expectedAffectedSeeds = Array.isArray(policy.expectedAffectedSeeds)
    ? policy.expectedAffectedSeeds
    : [];
  const seenSeedIndices = new Set();
  let calculatedMaximumCpuOverrunRatio = 0;
  for (const expected of expectedAffectedSeeds) {
    const affected = affectedSeeds.find((entry) => entry?.seedIndex === expected?.seedIndex);
    if (
      !affected
      || affected.classification !== expected.classification
      || affected.status !== expected.status
    ) {
      result.failures.push(`release exception is missing the approved seed ${String(expected?.seedIndex)} outcome`);
      continue;
    }
    if (seenSeedIndices.has(affected.seedIndex)) {
      result.failures.push("release exception contains duplicate affected seed indices");
    }
    seenSeedIndices.add(affected.seedIndex);
    if (affected.classification === "hosted-runner-cpu-timing-variance") {
      const cpuElapsedMs = Number(affected.cpuElapsedMs);
      const cpuLimitMs = Number(affected.cpuLimitMs);
      const wallElapsedMs = Number(affected.wallElapsedMs);
      const wallLimitMs = Number(affected.wallLimitMs);
      const cpuOverrunRatio = (cpuElapsedMs - cpuLimitMs) / cpuLimitMs;
      calculatedMaximumCpuOverrunRatio = Math.max(
        calculatedMaximumCpuOverrunRatio,
        cpuOverrunRatio,
      );
      if (
        !Number.isFinite(cpuOverrunRatio)
        || cpuOverrunRatio < 0
        || cpuOverrunRatio > Number(policy.maximumCpuOverrunRatio)
        || !Number.isFinite(wallElapsedMs)
        || !Number.isFinite(wallLimitMs)
        || wallElapsedMs >= wallLimitMs
        || Number(affected.reachedSeason) < Number(policy.minimumReachedSeason)
      ) {
        result.failures.push("release exception timing evidence exceeds the approved bounded variance");
      }
    }
  }
  if (
    affectedSeeds.length !== expectedAffectedSeeds.length
    || seenSeedIndices.size !== affectedSeeds.length
  ) {
    result.failures.push("release exception affected-seed set differs from the approved decision");
  }
  if (
    !Number.isFinite(metrics.maximumCpuOverrunRatio)
    || Math.abs(metrics.maximumCpuOverrunRatio - calculatedMaximumCpuOverrunRatio) > 1e-9
  ) {
    result.failures.push("release exception CPU-overrun summary does not match its seed evidence");
  }

  const requiredControls = Array.isArray(policy.requiredControls) ? policy.requiredControls : [];
  if (requiredControls.length === 0) {
    result.failures.push("release exception policy must declare required controls");
  }
  for (const controlId of requiredControls) {
    if (exception.controls?.[controlId]?.status !== "Passed") {
      result.failures.push(`release exception control ${String(controlId)} did not pass`);
    }
  }

  const evidenceFiles = Array.isArray(exception.evidence) ? exception.evidence : [];
  const evidenceHashes = new Map();
  const sourceJsonReads = new Map();
  if (evidenceFiles.length === 0) {
    result.failures.push("release exception contains no hashed source evidence");
  }
  for (const entry of evidenceFiles) {
    const entryPath = typeof entry?.path === "string" ? entry.path : "";
    const expectedHash = typeof entry?.sha256 === "string" ? entry.sha256.toLowerCase() : "";
    if (!entryPath || isAbsolute(entryPath) || !hashPattern.test(expectedHash)) {
      result.failures.push("release exception has an invalid evidence file entry");
      continue;
    }
    if (evidenceHashes.has(entryPath)) {
      result.failures.push(`release exception contains duplicate evidence path: ${entryPath}`);
      continue;
    }
    evidenceHashes.set(entryPath, expectedHash);
    const absoluteEntryPath = resolve(root, entryPath);
    if (!isPathInsideRoot(absoluteEntryPath)) {
      result.failures.push(`release exception evidence path escapes the repository: ${entryPath}`);
      continue;
    }
    try {
      const actualHash = extname(entryPath).toLowerCase() === ".json"
        ? (await readEvidenceJson(absoluteEntryPath, { role: "source-exception", expectedSha256: null }, result))
        : null;
      if (actualHash) sourceJsonReads.set(entryPath, actualHash);
      if ((actualHash?.sha256 ?? await sha256(absoluteEntryPath)) !== expectedHash) {
        result.failures.push(`release exception evidence hash does not match: ${entryPath}`);
      }
    } catch (error) {
      result.failures.push(
        `release exception evidence cannot be read: ${entryPath} (${error instanceof Error ? error.message : String(error)})`,
      );
    }
  }

  const sourceEvidencePolicy = policy.sourceEvidence ?? {};
  async function readBoundSourceJson(configuredPath, label) {
    const sourcePath = typeof configuredPath === "string" ? configuredPath.trim() : "";
    if (!sourcePath || isAbsolute(sourcePath)) {
      result.failures.push(`${label} path must be repository-relative`);
      return null;
    }
    const absoluteSourcePath = resolve(root, sourcePath);
    if (!isPathInsideRoot(absoluteSourcePath)) {
      result.failures.push(`${label} path escapes the repository root`);
      return null;
    }
    if (!evidenceHashes.has(sourcePath)) {
      result.failures.push(`${label} is not hash-bound by the release exception: ${sourcePath}`);
      return null;
    }
    try {
      const admitted = sourceJsonReads.get(sourcePath)
        ?? await readEvidenceJson(absoluteSourcePath, { role: "source-exception", expectedSha256: null }, result);
      if (admitted.sha256 !== evidenceHashes.get(sourcePath)) {
        throw new Error(label + " source JSON hash does not match");
      }
      return admitted.value;
    } catch (error) {
      result.failures.push(
        `${label} cannot be read: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  const sourceRun = await readBoundSourceJson(
    sourceEvidencePolicy.workflowRunPath,
    "source workflow run evidence",
  );
  if (sourceRun && (
    String(sourceRun.id ?? "") !== String(policy.sourceWorkflowRunId)
    || String(sourceRun.head_sha ?? "").toLowerCase() !== candidateSha
    || sourceRun.event !== "workflow_dispatch"
    || sourceRun.status !== "completed"
    || sourceRun.conclusion !== "cancelled"
  )) {
    result.failures.push("source workflow run evidence does not match the accepted candidate run");
  }

  const sourceJobsDocument = await readBoundSourceJson(
    sourceEvidencePolicy.workflowJobsPath,
    "source workflow jobs evidence",
  );
  const sourceJobs = Array.isArray(sourceJobsDocument?.jobs) ? sourceJobsDocument.jobs : [];
  const requiredSuccessfulJobs = ["Release quality gate", "Build Windows", "Build macOS", "Build Linux"];
  for (const jobName of requiredSuccessfulJobs) {
    const matches = sourceJobs.filter((job) => job?.name === jobName);
    if (matches.length !== 1 || matches[0]?.conclusion !== "success") {
      result.failures.push(`source workflow job did not pass exactly once: ${jobName}`);
    }
  }

  const expectedSuccessfulSeedIndices = Array.from(
    { length: Number(policy.requiredSeedCount) },
    (_, index) => index + 1,
  ).filter((seedIndex) => !expectedAffectedSeeds.some((entry) => entry?.seedIndex === seedIndex));
  const seedJobs = new Map();
  for (const job of sourceJobs) {
    const match = /^Exact candidate seed (\d+) x 30 seasons$/.exec(String(job?.name ?? ""));
    if (!match) continue;
    const seedIndex = Number(match[1]);
    if (seedJobs.has(seedIndex)) {
      result.failures.push(`source workflow contains duplicate seed job ${seedIndex}`);
    } else {
      seedJobs.set(seedIndex, job);
    }
  }
  for (const seedIndex of expectedSuccessfulSeedIndices) {
    if (seedJobs.get(seedIndex)?.conclusion !== "success") {
      result.failures.push(`source workflow seed ${seedIndex} did not pass`);
    }
  }
  if (seedJobs.get(1)?.conclusion !== "cancelled") {
    result.failures.push("source workflow seed 1 was not recorded as cancelled");
  }
  if (seedJobs.get(17)?.conclusion !== "failure") {
    result.failures.push("source workflow seed 17 was not recorded as failed");
  }
  if (seedJobs.size !== Number(policy.requiredSeedCount)) {
    result.failures.push("source workflow does not contain the exact 20-seed job set");
  }

  const successfulShardDirectory = typeof sourceEvidencePolicy.successfulShardDirectory === "string"
    ? sourceEvidencePolicy.successfulShardDirectory.replace(/\/$/, "")
    : "";
  for (const seedIndex of expectedSuccessfulSeedIndices) {
    const shardPath = `${successfulShardDirectory}/long-career-release-summary-seed-${seedIndex}.json`;
    const shard = await readBoundSourceJson(shardPath, `source seed ${seedIndex} evidence`);
    const checkpoint = shard?.checkpoint;
    const executionIdentity = shard?.checkpoint?.executionIdentity;
    if (!Number.isSafeInteger(executionIdentity?.maxOutputBytes)
      || executionIdentity?.maxOutputBytes <= 0) {
      result.failures.push(`source seed ${seedIndex} executionIdentity.maxOutputBytes must be a positive safe integer`);
    }
    const calculatedIdentityHash = executionIdentity && typeof executionIdentity === "object"
      ? createHash("sha256").update(JSON.stringify(executionIdentity)).digest("hex")
      : null;
    const run = Array.isArray(shard?.runs) && shard.runs.length === 1 ? shard.runs[0] : null;
    result.failures.push(...validateReleaseCalendarReceipt(run, shard?.profile?.seasonCount)
      .map((failure) => `source seed ${seedIndex} ${failure}`));
    if (shard?.persistenceReplay !== undefined) {
      result.failures.push(...validateReleaseCalendarReceipt(shard.persistenceReplay, shard?.profile?.seasonCount)
        .map((failure) => `source seed ${seedIndex} supplied replay ${failure}`));
    }
    if (shard && (
      shard.schemaVersion !== 3
      || shard.evidenceKind !== "long-career-release-soak"
      || shard.status !== "Passed"
      || String(shard.candidateCommitSha ?? "").toLowerCase() !== candidateSha
      || String(shard.candidateTreeSha ?? "").toLowerCase() !== currentTreeSha
      || shard.candidateBound !== true
      || shard.sourceTreeClean !== true
      || checkpoint?.protocolVersion !== 1
      || checkpoint?.determinismReplayExecuted !== false
      || checkpoint?.executionIdentityHash !== calculatedIdentityHash
      || checkpoint?.reusedSeedCount !== 0
      || checkpoint?.executedSeedCount !== 1
      || shard.profile?.seedCount !== 1
      || shard.profile?.seasonCount !== 30
      || shard.profile?.kind !== "full-canonical-weekly-career"
      || shard.profile?.skippedOrdinaryWeeks !== false
      || shard.profile?.processIsolation !== "one-seeded-career-per-process"
      || shard.profile?.v8HeapLimitBytes !== certifiedSoakHeapLimitBytes
      || executionIdentity?.protocolVersion !== 1
      || String(executionIdentity?.candidateCommitSha ?? "").toLowerCase() !== candidateSha
      || String(executionIdentity?.candidateTreeSha ?? "").toLowerCase() !== currentTreeSha
      || executionIdentity?.seedStart !== seedIndex
      || executionIdentity?.seedCount !== 1
      || executionIdentity?.seasonCount !== 30
      || executionIdentity?.profileKind !== "full-canonical-weekly-career"
      || executionIdentity?.processIsolation !== "one-seeded-career-per-process"
      || executionIdentity?.workerHeapLimitBytes !== certifiedSoakHeapLimitBytes
      || JSON.stringify(executionIdentity?.workerNodeArguments)
        !== JSON.stringify(certifiedSoakWorkerNodeArguments)
      || run?.seed !== `release-soak-${String(seedIndex).padStart(2, "0")}`
      || Number(run?.reachedSeason) < 31
      || !Number.isInteger(run?.canonicalTicks)
      || !Number.isInteger(run?.calendarWeeksSpanned)
      || run.canonicalTicks !== run.calendarWeeksSpanned
      || run.calendarWeeksSpanned < 900
      || !hashPattern.test(String(run?.digest ?? ""))
    )) {
      result.failures.push(`source seed ${seedIndex} evidence is not a passing canonical shard`);
    }
  }

  const failedSeedEvidence = await readBoundSourceJson(
    sourceEvidencePolicy.failedSeedPath,
    "source seed 17 failure evidence",
  );
  const failedMessage = String(failedSeedEvidence?.message ?? "");
  const seasonWeekMatch = /S(\d+) W(\d+)/.exec(failedMessage);
  const wallMatch = /wall=([0-9.]+)ms/.exec(failedMessage);
  const cpuMatch = /expected ([0-9.]+) to be less than ([0-9.]+)/.exec(failedMessage);
  const acceptedSeed17 = affectedSeeds.find((entry) => entry?.seedIndex === 17);
  const timingMatchesException = Boolean(
    seasonWeekMatch
    && wallMatch
    && cpuMatch
    && Number(seasonWeekMatch[1]) === Number(acceptedSeed17?.reachedSeason)
    && Number(seasonWeekMatch[2]) === Number(acceptedSeed17?.reachedWeek)
    && Math.abs(Number(wallMatch[1]) - Number(acceptedSeed17?.wallElapsedMs)) <= 1e-6
    && Math.abs(Number(cpuMatch[1]) - Number(acceptedSeed17?.cpuElapsedMs)) <= 1e-6
    && Math.abs(Number(cpuMatch[2]) - Number(acceptedSeed17?.cpuLimitMs)) <= 1e-6
    && Number(acceptedSeed17?.wallLimitMs) === 60000
  );
  if (failedSeedEvidence && (
    failedSeedEvidence.schemaVersion !== 2
    || failedSeedEvidence.evidenceKind !== "long-career-worker-failure"
    || String(failedSeedEvidence.candidateCommitSha ?? "").toLowerCase() !== candidateSha
    || String(failedSeedEvidence.candidateTreeSha ?? "").toLowerCase() !== currentTreeSha
    || failedSeedEvidence.seedIndex !== 17
    || failedSeedEvidence.seed !== "release-soak-17"
    || failedSeedEvidence.seasonCount !== 30
    || !timingMatchesException
  )) {
    result.failures.push("source seed 17 failure evidence does not match the accepted timing variance");
  }

  if (result.failures.length === 0) result.status = "Accepted";
  return result;
}

async function validateAssetCommercialRights(gate) {
  const result = { status: "Unverified", failures: [], sourceAudit: null, shippingReview: null };
  result.sourceAudit = await auditAssetProvenance(root);
  if (result.sourceAudit.status !== "pass") {
    result.status = "Failed";
    result.failures.push(`source asset audit remains blocked (${result.sourceAudit.summary.blockerCount} blockers)`);
  }
  const policy = gate.shippingAssetReview;
  if (!policy) {
    result.failures.push("shipping asset review is missing; a source inventory cannot clear generated fonts or packages");
    return result;
  }
  try {
    if (!safeRelativePath(policy.path) || !hashPattern.test(String(policy.sha256 ?? ""))) {
      throw new Error("shipping asset review requires an ordinary path and SHA-256");
    }
    const admittedReview = await readOrdinaryPolicyJson(policy.path, "other-supported-json", null, result);
    if (admittedReview.sha256 !== policy.sha256.toLowerCase()) {
      throw new Error("shipping asset review hash changed");
    }
    const review = admittedReview.value;
    result.shippingReview = { path: policy.path, sha256: policy.sha256.toLowerCase(), review };
    if (review.schemaVersion !== 1 || review.evidenceKind !== "shipping-asset-rights-review"
      || review.status !== "Passed" || review.scope !== "source-assets-and-shipping-generated-fonts"
      || review.candidateCommitSha !== candidateSha || review.candidateTreeSha !== currentTreeSha
      || typeof review.reviewer !== "string" || !review.reviewer.trim()
      || !Number.isFinite(Date.parse(review.reviewedAt)) || Date.parse(review.reviewedAt) > Date.now()
      || review.assetProvenanceManifestSha256 !== result.sourceAudit.manifestSha256
      || !packageManifestPath || !packageManifest || packageResults.length === 0
      || packageResults.some((entry) => entry.status !== "Passed")
      || review.packageManifestSha256 !== packageManifestSha256) {
      throw new Error("shipping asset review is not bound to the current candidate, source manifest and verified package hashes");
    }
    const acceptedHandoff = await validateAcceptedFontHandoff(root, {
      candidateSha, candidateTreeSha: currentTreeSha, packageManifestPath, workflowRunId: requiredWorkflowRunId,
    });
    const actualFonts = acceptedHandoff ? acceptedHandoff.fonts : await listShippingFontFiles(root);
    result.shippingReview.fontTransport = acceptedHandoff
      ? { path: acceptedHandoff.path, sha256: acceptedHandoff.sha256, scope: acceptedHandoff.scope, allDistributableContentsBound: true }
      : { scope: "local-nonaccepted-export-supporting-review", allDistributableContentsBound: false };
    if (acceptedHandoff) {
      if (review.fontHandoffSha256 !== acceptedHandoff.sha256 || review.fontInventoryScope !== acceptedHandoff.scope
        || !Array.isArray(review.notices) || review.notices.length !== acceptedHandoff.notices.length) {
        throw new Error("shipping review is not bound to all accepted distributable fonts and notices");
      }
      const noticesSeen = new Set();
      for (const notice of review.notices) {
        const actual = acceptedHandoff.notices.find((entry) => entry.platform === notice.platform && entry.path === notice.path);
        if (!actual || noticesSeen.has(notice.path.toLowerCase()) || notice.sha256 !== actual.sha256
          || notice.bytes !== actual.bytes || notice.memberPath !== actual.memberPath || notice.source !== actual.source) {
          throw new Error("shipping review notice inventory is incomplete or changed");
        }
        noticesSeen.add(notice.path.toLowerCase());
      }
    }
    if (!Array.isArray(review.fonts) || review.fonts.length !== actualFonts.length) {
      throw new Error("shipping asset review font inventory is incomplete");
    }
    const seen = new Set();
    for (const font of review.fonts) {
      if (!safeRelativePath(font?.path) || !hashPattern.test(String(font?.sha256 ?? ""))
        || seen.has(font.path.toLowerCase())) throw new Error("shipping asset review contains an invalid or duplicate font");
      seen.add(font.path.toLowerCase());
      const actual = actualFonts.find((entry) => entry.path === font.path);
      if (!actual || actual.sha256 !== font.sha256.toLowerCase()
        || (acceptedHandoff && (font.platform !== actual.platform || font.bytes !== actual.bytes
          || font.memberPath !== actual.memberPath || font.source !== actual.source))) throw new Error(`shipping font bytes changed: ${font.path}`);
      const license = font.license;
      if (license?.kind !== "fontLicenseNotice" || !safeRelativePath(license?.path)
        || !hashPattern.test(String(license?.sha256 ?? ""))) throw new Error(`font license notice is unsupported: ${font.path}`);
      if (acceptedHandoff && !acceptedHandoff.notices.some((notice) => notice.platform === font.platform
        && notice.path === license.path && notice.sha256 === license.sha256.toLowerCase())) {
        throw new Error(`font license notice was not retained from its accepted platform packages: ${font.path}`);
      }
      if (createHash("sha256").update(await readOrdinaryFile(root, license.path)).digest("hex") !== license.sha256.toLowerCase()) {
        throw new Error(`font license notice changed: ${license.path}`);
      }
    }
    // Complete local structural checks retain their original diagnostics before
    // requiring every actual distributable for commercial-rights acceptance.
    if (!acceptedHandoff) {
      result.failures.push("accepted all-five-package font/notice handoff required; completed local review is supporting evidence only");
    } else if (result.failures.length === 0) result.status = "Passed";
  } catch (error) {
    result.status = "Failed";
    result.failures.push(`shipping asset review: ${error instanceof Error ? error.message : String(error)}`);
  }
  return result;
}

failures.push(...policyCompletenessFailures);
const gateResults = [];
for (const [gateId, gate] of Object.entries(policyGates)) {
  if (!isOrdinaryPolicyRecord(gate)) continue;
  if (!allowedStatuses.has(gate.status)) {
    failures.push(`${gateId} has invalid status ${String(gate.status)}`);
  }
  const missingEvidence = [];
  for (const evidencePath of gate.evidence ?? []) {
    try {
      await access(resolve(root, evidencePath));
    } catch {
      missingEvidence.push(evidencePath);
    }
  }
  const generatedEvidence = gate.generatedEvidence
    ? await validateGeneratedGateEvidence(gateId, gate.generatedEvidence)
    : null;
  const releaseException = generatedEvidence?.status === "Passed"
    ? null
    : await validateReleaseException(gateId, gate);
  const exceptionApplied = releaseException?.status === "Accepted"
    && (generatedEvidence?.calendarAdmissionFailures?.length ?? 0) === 0
    && (generatedEvidence?.artifactAdmissionFailures?.length ?? 0) === 0
    && (releaseException?.artifactAdmissionFailures?.length ?? 0) === 0;
  let effectiveStatus = gate.status;
  if (gate.status === "Unverified" && generatedEvidence?.status === "Passed") {
    effectiveStatus = "Passed";
  } else if (gate.status === "Unverified" && exceptionApplied) {
    effectiveStatus = "Passed";
  }
  if (generatedEvidence && generatedEvidence.status !== "Passed" && !exceptionApplied) {
    failures.push(`${gateId} generated evidence: ${generatedEvidence.failures.join(", ")}`);
  }
  if (releaseException && releaseException.status !== "Accepted") {
    failures.push(`${gateId} release exception: ${releaseException.failures.join(", ")}`);
  }
  const assetReview = gateId === "assetCommercialRights"
    ? await validateAssetCommercialRights(gate)
    : null;
  if (assetReview) {
    effectiveStatus = gate.status === "Passed" && assetReview.status === "Passed"
      ? "Passed"
      : gate.status === "Failed" || assetReview.status === "Failed"
        ? "Failed"
        : "Unverified";
    for (const failure of assetReview.failures) failures.push(`${gateId}: ${failure}`);
  }
  const effectiveEvidenceCount =
    (gate.evidence?.length ?? 0)
    + (generatedEvidence?.status === "Passed" ? 1 : 0)
    + (exceptionApplied ? 1 : 0);
  if (effectiveStatus === "Passed" && effectiveEvidenceCount === 0) {
    failures.push(`${gateId} is Passed without evidence`);
  }
  if (effectiveStatus === "Passed" && missingEvidence.length > 0) {
    failures.push(`${gateId} is Passed with missing evidence: ${missingEvidence.join(", ")}`);
  }
  if (effectiveStatus !== "Passed" && effectiveStatus !== "N/A") {
    failures.push(`${gateId} remains ${effectiveStatus}`);
  }
  gateResults.push({
    gateId,
    configuredStatus: gate.status,
    status: effectiveStatus,
    evidence: gate.evidence ?? [],
    missingEvidence,
    generatedEvidence,
    assetReview,
    resolution: exceptionApplied ? "AcceptedRisk" : effectiveStatus,
    exceptionApplied,
    releaseException,
  });
}

const finalArtifactFailure = artifactContext.snapshot().firstFailure;
if (finalArtifactFailure && globalArtifactAdmissionFailures.length === 0) {
  recordArtifactAdmissionFailure(null, (finalArtifactFailure.code ?? "artifact I/O failure")
    + " role=" + (finalArtifactFailure.role ?? "unknown"));
}
const acceptedRisks = gateResults
  .filter((gate) => gate.exceptionApplied)
  .map((gate) => ({
    gateId: gate.gateId,
    kind: gate.releaseException?.kind,
    path: gate.releaseException?.path,
  }));

const reportStatus = failures.length > 0
  ? "Failed"
  : acceptedRisks.length > 0
    ? "PassedWithAcceptedRisk"
    : "Passed";
const report = {
  schemaVersion: 2,
  validationScope,
  fullReleaseEligible: validationScope === "full-release"
    && policyCompletenessFailures.length === 0
    && (reportStatus === "Passed" || reportStatus === "PassedWithAcceptedRisk"),
  generatedAt: new Date().toISOString(),
  candidate: {
    commitSha: candidateSha,
    shaSource: candidateShaSource,
    currentHeadSha: currentSha,
    currentTreeSha,
    tag: configuredTag ?? null,
    tagBindingMode,
    packageManifest: packageManifestPath ? relative(root, packageManifestPath).replaceAll("\\", "/") : null,
  },
  dirty,
  dirtyPaths,
  status: reportStatus,
  packageVerification: {
    requiredKinds: requiredPackageKinds,
    packages: packageResults,
  },
  gateResults,
  acceptedRisks,
  artifactAdmissionFailures: globalArtifactAdmissionFailures,
  failures,
};
function declaredPolicyInputs(value) {
  if (typeof value === "string") return [value.replaceAll("<candidate-sha>", candidateSha)];
  if (Array.isArray(value)) return value.flatMap(declaredPolicyInputs);
  if (value && typeof value === "object") return Object.values(value).flatMap(declaredPolicyInputs);
  return [];
}
await writeOwnedReport(root, outputPath, report, {
  allowCanonicalRelease: true,
  writeJsonReport: async (path, value) => {
    const encoded = await artifactContext.encodeJson(value, { role: "checker-report", pretty: true, terminalNewline: true });
    const written = await artifactContext.writeJson(path, encoded, { method: "exclusive", role: "checker-report" });
    const readback = await artifactContext.readJson(path, { role: "checker-report", expectedSha256: encoded.sha256 });
    if (written.sha256 !== encoded.sha256 || written.bytes !== encoded.bytes
      || readback.sha256 !== encoded.sha256 || readback.bytes !== encoded.bytes) {
      throw new Error("New report raw bounded readback failed");
    }
  },
  inputPaths: [statusPath, resolve(root, "package.json"), packageManifestPath,
    ...declaredPolicyInputs(statusDocument),
    ...gateResults.flatMap((gate) => gate.assetReview?.sourceAudit?.inputPaths ?? [])],
});
console.info(`RELEASE_EVIDENCE_CHECK ${JSON.stringify({ status: report.status, failures: failures.length })}`);
console.info(`Evidence: ${relative(root, outputPath)}`);
if (!reportOnly && failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
}
