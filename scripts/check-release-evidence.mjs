import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
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
const reportOnly = process.argv.includes("--report-only");
const allowedStatuses = new Set(["Passed", "Failed", "Unverified", "N/A"]);
const hashPattern = /^[a-f0-9]{64}$/i;
const commitPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;
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

const statusDocument = JSON.parse(await readFile(statusPath, "utf8"));
const packageDocument = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
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
if (configuredTag) {
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
const configuredRequiredKinds = statusDocument.candidate?.requiredPackageKinds;
const requiredPackageKinds = Array.isArray(configuredRequiredKinds)
  ? configuredRequiredKinds.filter((kind) => typeof kind === "string" && kind.trim()).map((kind) => kind.trim())
  : [];
if (!Array.isArray(configuredRequiredKinds) || requiredPackageKinds.length !== configuredRequiredKinds.length) {
  failures.push("candidate.requiredPackageKinds must be an array of non-empty strings");
}
if (new Set(requiredPackageKinds).size !== requiredPackageKinds.length) {
  failures.push("candidate.requiredPackageKinds contains duplicates");
}
const packageResults = [];
let packageManifest = null;
let packageManifestPath = null;

if (!configuredManifest) {
  failures.push("no release package manifest is configured");
} else {
  packageManifestPath = resolve(root, configuredManifest);
  try {
    packageManifest = JSON.parse(await readFile(packageManifestPath, "utf8"));
  } catch (error) {
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
  const requiredWorkflowRunId = process.env.RELEASE_WORKFLOW_RUN_ID?.trim();
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

  let evidence;
  try {
    evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  } catch (error) {
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
        expectedManifestHash = await sha256(packageManifestPath);
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
        if (await sha256(absoluteEntryPath) !== expectedHash) {
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
  ) {
    result.failures.push("soak checkpoint identity is missing, inconsistent, or not candidate-bound");
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

const gateResults = [];
for (const [gateId, gate] of Object.entries(statusDocument.gates ?? {})) {
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
  let effectiveStatus = gate.status;
  if (gate.status === "Unverified" && generatedEvidence?.status === "Passed") {
    effectiveStatus = "Passed";
  }
  if (generatedEvidence && generatedEvidence.status !== "Passed") {
    failures.push(`${gateId} generated evidence: ${generatedEvidence.failures.join(", ")}`);
  }
  const effectiveEvidenceCount =
    (gate.evidence?.length ?? 0) + (generatedEvidence?.status === "Passed" ? 1 : 0);
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
  });
}

const report = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  candidate: {
    commitSha: candidateSha,
    shaSource: candidateShaSource,
    currentHeadSha: currentSha,
    currentTreeSha,
    tag: configuredTag ?? null,
    packageManifest: packageManifestPath ? relative(root, packageManifestPath).replaceAll("\\", "/") : null,
  },
  dirty,
  dirtyPaths,
  status: failures.length === 0 ? "Passed" : "Failed",
  packageVerification: {
    requiredKinds: requiredPackageKinds,
    packages: packageResults,
  },
  gateResults,
  failures,
};
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.info(`RELEASE_EVIDENCE_CHECK ${JSON.stringify({ status: report.status, failures: failures.length })}`);
console.info(`Evidence: ${relative(root, outputPath)}`);
if (!reportOnly && failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
}
