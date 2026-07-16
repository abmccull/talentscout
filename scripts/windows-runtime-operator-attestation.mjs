import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

const HASH_PATTERN = /^[a-f0-9]{64}$/i;
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/i;
const MAX_ATTESTATION_AGE_MS = 90 * 24 * 60 * 60 * 1_000;
const FUTURE_CLOCK_TOLERANCE_MS = 5 * 60 * 1_000;
const PRODUCT_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/;
const WORKFLOW_RUN_ID_PATTERN = /^\d+$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const EVIDENCE_TYPES = new Set([
  "test-log",
  "screenshot",
  "screen-recording",
  "save-envelope",
  "ledger-comparison",
  "system-report",
  "network-trace",
  "filesystem-trace",
  "steam-cloud-record",
]);

function normalizedHash(value) {
  return typeof value === "string" && HASH_PATTERN.test(value)
    ? value.toLowerCase()
    : null;
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function isInside(parentPath, childPath) {
  const relative = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function normalizeRelative(root, filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, "/");
}

function samePath(left, right) {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

async function canonicalRepositoryFile(root, filePath, label) {
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(resolvedRoot, filePath);
  if (!isInside(resolvedRoot, resolvedPath)) {
    throw new Error(`${label} must be inside the repository`);
  }
  const [realRoot, realFile] = await Promise.all([
    realpath(resolvedRoot),
    realpath(resolvedPath),
  ]);
  if (!isInside(realRoot, realFile)) {
    throw new Error(`${label} resolves outside the repository`);
  }
  const [linkDetails, details] = await Promise.all([lstat(resolvedPath), stat(realFile)]);
  if (linkDetails.isSymbolicLink()) throw new Error(`${label} cannot be a symbolic link`);
  if (!details.isFile()) throw new Error(`${label} is not a file`);
  return {
    realRoot,
    realPath: realFile,
    relativePath: normalizeRelative(realRoot, realFile),
  };
}

function schemaTypeMatches(value, type) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  return typeof value === type;
}

function validateJsonSchemaNode(value, schema, location, failures) {
  const acceptedTypes = Array.isArray(schema.type)
    ? schema.type
    : schema.type
      ? [schema.type]
      : null;
  if (acceptedTypes && !acceptedTypes.some((type) => schemaTypeMatches(value, type))) {
    failures.push(`${location} must have type ${acceptedTypes.join(" or ")}`);
    return;
  }
  if (Object.hasOwn(schema, "const") && !Object.is(value, schema.const)) {
    failures.push(`${location} must equal ${JSON.stringify(schema.const)}`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((entry) => Object.is(entry, value))) {
    failures.push(`${location} is not one of the schema enum values`);
  }
  if (typeof value === "string") {
    if (Number.isInteger(schema.minLength) && value.length < schema.minLength) {
      failures.push(`${location} is shorter than minLength ${schema.minLength}`);
    }
    if (schema.pattern && !(new RegExp(schema.pattern)).test(value)) {
      failures.push(`${location} does not match the schema pattern`);
    }
    if (
      schema.format === "date-time"
      && (!ISO_TIMESTAMP_PATTERN.test(value) || !Number.isFinite(Date.parse(value)))
    ) {
      failures.push(`${location} must be a valid date-time`);
    }
  }
  if (Array.isArray(value)) {
    if (Number.isInteger(schema.minItems) && value.length < schema.minItems) {
      failures.push(`${location} has fewer than ${schema.minItems} items`);
    }
    if (schema.uniqueItems === true) {
      const serialized = value.map((entry) => JSON.stringify(entry));
      if (new Set(serialized).size !== serialized.length) {
        failures.push(`${location} must contain unique items`);
      }
    }
    if (schema.items) {
      value.forEach((entry, index) => {
        validateJsonSchemaNode(entry, schema.items, `${location}[${index}]`, failures);
      });
    }
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const properties = schema.properties ?? {};
    for (const requiredProperty of schema.required ?? []) {
      if (!Object.hasOwn(value, requiredProperty)) {
        failures.push(`${location}.${requiredProperty} is required by the schema`);
      }
    }
    if (schema.additionalProperties === false) {
      for (const property of Object.keys(value)) {
        if (!Object.hasOwn(properties, property)) {
          failures.push(`${location}.${property} is not allowed by the schema`);
        }
      }
    }
    for (const [property, propertySchema] of Object.entries(properties)) {
      if (Object.hasOwn(value, property)) {
        validateJsonSchemaNode(value[property], propertySchema, `${location}.${property}`, failures);
      }
    }
  }
}

async function validateAttestationSchema({ root, schemaPath, attestation, failures }) {
  try {
    const schemaFile = await canonicalRepositoryFile(
      root,
      schemaPath,
      "operator attestation schema",
    );
    const schema = JSON.parse(await readFile(schemaFile.realPath, "utf8"));
    validateJsonSchemaNode(attestation, schema, "operator attestation", failures);
    return {
      path: schemaFile.relativePath,
      sha256: await sha256File(schemaFile.realPath),
    };
  } catch (error) {
    failures.push(
      `operator attestation schema cannot be enforced: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function requireNonEmptyString(value, label, failures) {
  if (typeof value !== "string" || !value.trim()) {
    failures.push(`${label} must be a non-empty string`);
    return null;
  }
  return value.trim();
}

function parseTimestamp(value, label, failures) {
  const timestamp = Date.parse(value ?? "");
  if (
    typeof value !== "string"
    || !ISO_TIMESTAMP_PATTERN.test(value)
    || !Number.isFinite(timestamp)
  ) {
    failures.push(`${label} must be a valid ISO timestamp`);
    return null;
  }
  return timestamp;
}

function validateTimestampWindow({ timestamp, label, manifestTimestamp, completedTimestamp, nowMs, failures }) {
  if (timestamp === null) return;
  if (manifestTimestamp !== null && timestamp < manifestTimestamp) {
    failures.push(`${label} predates the candidate package manifest`);
  }
  if (timestamp > nowMs + FUTURE_CLOCK_TOLERANCE_MS) {
    failures.push(`${label} is in the future`);
  }
  if (nowMs - timestamp > MAX_ATTESTATION_AGE_MS) {
    failures.push(`${label} is stale (older than 90 days)`);
  }
  if (completedTimestamp !== null && timestamp > completedTimestamp) {
    failures.push(`${label} is later than completedAt`);
  }
}

export function requiredWindowsRuntimeControls(statusDocument) {
  const generatedEvidence = statusDocument?.gates?.packagedWindows?.generatedEvidence;
  if (generatedEvidence?.kind !== "windows-packaged-runtime") {
    throw new Error("packagedWindows generated evidence kind must be windows-packaged-runtime");
  }
  const controls = generatedEvidence.requiredControls;
  if (!Array.isArray(controls) || controls.length === 0) {
    throw new Error("packagedWindows requiredControls must be a non-empty array");
  }
  if (controls.some((controlId) => typeof controlId !== "string" || !controlId.trim())) {
    throw new Error("packagedWindows requiredControls contains an invalid control ID");
  }
  const normalized = controls.map((controlId) => controlId.trim());
  const duplicates = duplicateValues(normalized);
  if (duplicates.length > 0) {
    throw new Error(`packagedWindows requiredControls contains duplicates: ${duplicates.join(", ")}`);
  }
  return normalized;
}

export function operatorAttestableWindowsRuntimeControls(statusDocument) {
  const generatedEvidence = statusDocument?.gates?.packagedWindows?.generatedEvidence;
  const operatorAttestation = generatedEvidence?.operatorAttestation;
  if (operatorAttestation?.kind !== "windows-packaged-runtime-operator-attestation") {
    throw new Error("packagedWindows operator attestation kind is invalid");
  }
  if (typeof operatorAttestation.schema !== "string" || !operatorAttestation.schema.trim()) {
    throw new Error("packagedWindows operator attestation schema path is missing");
  }
  const controls = operatorAttestation.attestableControls;
  if (!Array.isArray(controls) || controls.length === 0) {
    throw new Error("packagedWindows operator attestableControls must be a non-empty array");
  }
  if (controls.some((controlId) => typeof controlId !== "string" || !controlId.trim())) {
    throw new Error("packagedWindows operator attestableControls contains an invalid control ID");
  }
  const normalized = controls.map((controlId) => controlId.trim());
  const duplicates = duplicateValues(normalized);
  if (duplicates.length > 0) {
    throw new Error(
      `packagedWindows operator attestableControls contains duplicates: ${duplicates.join(", ")}`,
    );
  }
  const requiredControlSet = new Set(requiredWindowsRuntimeControls(statusDocument));
  const unknownControls = normalized.filter((controlId) => !requiredControlSet.has(controlId));
  if (unknownControls.length > 0) {
    throw new Error(
      `packagedWindows operator controls are absent from requiredControls: ${unknownControls.join(", ")}`,
    );
  }
  return normalized;
}

export function windowsRuntimeOperatorAttestationPolicy(statusDocument) {
  const operatorAttestation = statusDocument?.gates?.packagedWindows?.generatedEvidence
    ?.operatorAttestation;
  const schemaPath = typeof operatorAttestation?.schema === "string"
    ? operatorAttestation.schema.trim()
    : "";
  const certificationBundleRoot = typeof operatorAttestation?.certificationBundleRoot === "string"
    ? operatorAttestation.certificationBundleRoot.trim()
    : "";
  if (!schemaPath) throw new Error("packagedWindows operator attestation schema path is missing");
  if (!certificationBundleRoot || path.isAbsolute(certificationBundleRoot)) {
    throw new Error("packagedWindows operator certificationBundleRoot is invalid");
  }
  return {
    schemaPath,
    certificationBundleRoot: certificationBundleRoot.replaceAll("\\", "/").replace(/\/$/, ""),
    attestableControls: operatorAttestableWindowsRuntimeControls(statusDocument),
  };
}

export function evaluateWindowsSignerBinding({
  installerSignature,
  executableSignature,
  expectedSignerCertificateSha256,
}) {
  const failures = [];
  const expectedHash = normalizedHash(expectedSignerCertificateSha256);
  if (!expectedHash) {
    failures.push("WINDOWS_RELEASE_SIGNER_SHA256 must be a 64-character SHA-256 certificate hash");
  }
  for (const [label, signature] of [
    ["installer", installerSignature],
    ["unpacked executable", executableSignature],
  ]) {
    if (signature?.Status !== "Valid") {
      failures.push(`${label} Authenticode status is not Valid`);
      continue;
    }
    const actualHash = normalizedHash(signature?.SignerCertificateSha256);
    if (!actualHash) {
      failures.push(`${label} signer certificate SHA-256 could not be read`);
    } else if (expectedHash && actualHash !== expectedHash) {
      failures.push(`${label} signer certificate does not match WINDOWS_RELEASE_SIGNER_SHA256`);
    }
  }
  const installerHash = normalizedHash(installerSignature?.SignerCertificateSha256);
  const executableHash = normalizedHash(executableSignature?.SignerCertificateSha256);
  if (installerHash && executableHash && installerHash !== executableHash) {
    failures.push("installer and unpacked executable use different signing certificates");
  }
  return {
    passed: failures.length === 0,
    expectedSignerCertificateSha256: expectedHash,
    observedSignerCertificateSha256: installerHash,
    failures,
  };
}

export async function inspectWindowsPackageManifestBinding({
  root,
  manifestPath,
  candidateCommitSha,
  installerArtifact,
  productVersion,
  expectedWorkflowRunId,
  resolveTagCommit,
}) {
  const failures = [];
  const certificationFailures = [];
  let document = null;
  let canonicalManifest = null;
  let manifestSha256 = null;
  try {
    canonicalManifest = await canonicalRepositoryFile(
      root,
      manifestPath,
      "candidate package manifest",
    );
    const raw = await readFile(canonicalManifest.realPath, "utf8");
    manifestSha256 = createHash("sha256").update(raw).digest("hex");
    document = JSON.parse(raw);
  } catch (error) {
    return {
      available: false,
      packagePassed: false,
      passed: false,
      path: null,
      realPath: null,
      sha256: null,
      failures: [error instanceof Error ? error.message : String(error)],
      packageFailures: [error instanceof Error ? error.message : String(error)],
      certificationFailures: [],
      document: null,
    };
  }

  const windowsEntries = Array.isArray(document.packages)
    ? document.packages.filter((entry) => entry?.kind === "windows-installer")
    : [];
  if (document.schemaVersion !== 2) failures.push("manifest schemaVersion is not 2");
  if (String(document.candidateCommitSha ?? "").toLowerCase() !== candidateCommitSha.toLowerCase()) {
    failures.push("manifest candidate SHA does not match HEAD");
  }
  if (!PRODUCT_VERSION_PATTERN.test(productVersion)) {
    failures.push("package.json product version is invalid");
  }
  if (document.productVersion !== productVersion) {
    failures.push("manifest productVersion does not match package.json");
  }
  const workflowRunId = String(document.workflowRunId ?? "").trim();
  const expectedRunId = String(expectedWorkflowRunId ?? "").trim();
  if (!WORKFLOW_RUN_ID_PATTERN.test(expectedRunId)) {
    certificationFailures.push("expected release workflow run ID was not supplied");
  }
  if (!WORKFLOW_RUN_ID_PATTERN.test(workflowRunId)) {
    certificationFailures.push("manifest workflowRunId is missing or invalid");
  } else if (expectedRunId && workflowRunId !== expectedRunId) {
    certificationFailures.push(
      "manifest workflowRunId does not match the certification workflow run",
    );
  }

  const candidateTag = typeof document.candidateTag === "string"
    ? document.candidateTag.trim()
    : "";
  const escapedVersion = productVersion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const compatibleTag = new RegExp(
    `^v${escapedVersion}(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$`,
  );
  if (!candidateTag || !compatibleTag.test(candidateTag)) {
    certificationFailures.push(
      "manifest candidateTag is missing or incompatible with productVersion",
    );
  } else {
    try {
      const tagCommit = await resolveTagCommit(candidateTag);
      if (String(tagCommit ?? "").toLowerCase() !== candidateCommitSha.toLowerCase()) {
        certificationFailures.push("manifest candidateTag does not resolve to HEAD");
      }
    } catch (error) {
      certificationFailures.push(
        `manifest candidateTag cannot be resolved: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (windowsEntries.length !== 1) {
    failures.push("manifest must have exactly one windows-installer entry");
  } else {
    const windowsEntry = windowsEntries[0];
    if (String(windowsEntry.sha256 ?? "").toUpperCase() !== installerArtifact.sha256) {
      failures.push("installer SHA-256 does not match manifest");
    }
    if (windowsEntry.bytes !== installerArtifact.bytes) {
      failures.push("installer byte length does not match manifest");
    }
    if (String(windowsEntry.path ?? "") !== installerArtifact.path) {
      failures.push("installer path does not match manifest");
    }
  }

  return {
    available: true,
    packagePassed: failures.length === 0,
    passed: failures.length === 0 && certificationFailures.length === 0,
    path: canonicalManifest.relativePath,
    realPath: canonicalManifest.realPath,
    sha256: manifestSha256,
    failures: [...failures, ...certificationFailures],
    packageFailures: failures,
    certificationFailures,
    candidateCommitSha: document.candidateCommitSha ?? null,
    candidateTag: document.candidateTag ?? null,
    productVersion: document.productVersion ?? null,
    workflowRunId: document.workflowRunId ?? null,
    generatedAt: document.generatedAt ?? null,
    document,
  };
}

export async function validateWindowsRuntimeOperatorAttestation({
  root,
  attestationPath,
  candidateCommitSha,
  candidateTreeSha,
  candidateTag,
  productVersion,
  workflowRunId,
  signerCertificateSha256,
  packageManifestPath,
  packageManifestGeneratedAt,
  installerSha256,
  requiredControls,
  operatorAttestableControls,
  schemaPath,
  certificationBundleRoot,
  now = new Date(),
}) {
  const failures = [];
  const resolvedRoot = path.resolve(root);
  const resolvedAttestationPath = path.resolve(resolvedRoot, attestationPath);
  let attestation = null;
  let attestationSha256 = null;
  let canonicalAttestation = null;

  try {
    canonicalAttestation = await canonicalRepositoryFile(
      resolvedRoot,
      resolvedAttestationPath,
      "operator attestation",
    );
    const raw = await readFile(canonicalAttestation.realPath, "utf8");
    attestationSha256 = createHash("sha256").update(raw).digest("hex");
    attestation = JSON.parse(raw);
  } catch (error) {
    failures.push(`operator attestation cannot be read: ${error instanceof Error ? error.message : String(error)}`);
    return { accepted: false, failures, attestation: null, attestationSha256: null };
  }

  const schemaValidation = await validateAttestationSchema({
    root: resolvedRoot,
    schemaPath,
    attestation,
    failures,
  });

  if (attestation?.schemaVersion !== 1) {
    failures.push("operator attestation schemaVersion must be 1");
  }
  if (attestation?.evidenceKind !== "windows-packaged-runtime-operator-attestation") {
    failures.push("operator attestation evidenceKind is invalid");
  }
  if (attestation?.status !== "Passed") {
    failures.push("operator attestation status must be Passed");
  }
  if (String(attestation?.candidateCommitSha ?? "").toLowerCase() !== candidateCommitSha.toLowerCase()) {
    failures.push("operator attestation does not describe the exact candidate commit");
  }
  if (String(attestation?.candidateTreeSha ?? "").toLowerCase() !== candidateTreeSha.toLowerCase()) {
    failures.push("operator attestation does not describe the exact candidate tree");
  }
  if ((attestation?.candidateTag ?? null) !== (candidateTag ?? null)) {
    failures.push("operator attestation does not describe the exact candidate tag");
  }
  if (!candidateTag) failures.push("candidate tag is required for operator certification");
  if (attestation?.productVersion !== productVersion) {
    failures.push("operator attestation does not describe the exact product version");
  }
  if (String(attestation?.workflowRunId ?? "") !== String(workflowRunId ?? "")) {
    failures.push("operator attestation does not describe the exact workflow run");
  }
  if (!WORKFLOW_RUN_ID_PATTERN.test(String(workflowRunId ?? ""))) {
    failures.push("certification workflow run ID is missing or invalid");
  }
  if (
    normalizedHash(attestation?.signerCertificateSha256)
    !== normalizedHash(signerCertificateSha256)
  ) {
    failures.push("operator attestation is not bound to the release signer certificate");
  }
  if (!normalizedHash(signerCertificateSha256)) {
    failures.push("release signer certificate SHA-256 is missing or invalid");
  }

  let realCertificationBundle = null;
  const normalizedBundleRoot = typeof certificationBundleRoot === "string"
    ? certificationBundleRoot.replaceAll("\\", "/").replace(/\/$/, "")
    : "";
  const expectedBundleRelativePath = `${normalizedBundleRoot}/${candidateCommitSha.toLowerCase()}`;
  const declaredBundlePath = typeof attestation?.certificationBundlePath === "string"
    ? attestation.certificationBundlePath.trim().replaceAll("\\", "/").replace(/\/$/, "")
    : "";
  if (
    !normalizedBundleRoot
    || path.isAbsolute(normalizedBundleRoot)
    || declaredBundlePath !== expectedBundleRelativePath
  ) {
    failures.push("operator attestation certificationBundlePath is not the designated candidate bundle");
  } else {
    try {
      const [realRoot, expectedBundle] = await Promise.all([
        realpath(resolvedRoot),
        realpath(path.resolve(resolvedRoot, expectedBundleRelativePath)),
      ]);
      const bundleDetails = await stat(expectedBundle);
      if (!bundleDetails.isDirectory()) throw new Error("designated bundle is not a directory");
      if (!isInside(realRoot, expectedBundle)) {
        throw new Error("designated bundle resolves outside the repository");
      }
      if (!isInside(expectedBundle, canonicalAttestation.realPath)) {
        throw new Error("operator attestation is outside the designated candidate bundle");
      }
      realCertificationBundle = expectedBundle;
    } catch (error) {
      failures.push(
        `operator attestation certification bundle is invalid: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  let expectedManifestHash = null;
  try {
    const canonicalManifest = await canonicalRepositoryFile(
      resolvedRoot,
      packageManifestPath,
      "candidate package manifest",
    );
    expectedManifestHash = await sha256File(canonicalManifest.realPath);
  } catch (error) {
    failures.push(`candidate package manifest cannot be hashed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const suppliedManifestHash = normalizedHash(attestation?.packageManifestSha256);
  if (!suppliedManifestHash || suppliedManifestHash !== expectedManifestHash) {
    failures.push("operator attestation is not bound to the exact package manifest");
  }

  const packageHashEntries = Object.entries(attestation?.packageHashes ?? {});
  if (
    packageHashEntries.length !== 1
    || packageHashEntries[0]?.[0] !== "windows-installer"
    || normalizedHash(packageHashEntries[0]?.[1]) !== normalizedHash(installerSha256)
  ) {
    failures.push("operator attestation is not bound to the exact Windows installer");
  }

  requireNonEmptyString(attestation?.tester?.name, "tester.name", failures);
  requireNonEmptyString(attestation?.tester?.role, "tester.role", failures);

  const nowMs = now.getTime();
  const manifestTimestamp = parseTimestamp(
    packageManifestGeneratedAt,
    "candidate package manifest generatedAt",
    failures,
  );
  const completedTimestamp = parseTimestamp(attestation?.completedAt, "completedAt", failures);
  validateTimestampWindow({
    timestamp: completedTimestamp,
    label: "completedAt",
    manifestTimestamp,
    completedTimestamp: null,
    nowMs,
    failures,
  });

  const environments = Array.isArray(attestation?.environments) ? attestation.environments : [];
  if (environments.length === 0) failures.push("operator attestation must name at least one environment");
  const environmentIds = environments.map((environment) => environment?.id);
  const duplicateEnvironmentIds = duplicateValues(environmentIds);
  if (duplicateEnvironmentIds.length > 0) {
    failures.push(`operator attestation has duplicate environment IDs: ${duplicateEnvironmentIds.join(", ")}`);
  }
  for (const [index, environment] of environments.entries()) {
    const label = `environments[${index}]`;
    if (typeof environment?.id !== "string" || !ID_PATTERN.test(environment.id)) {
      failures.push(`${label}.id is invalid`);
    }
    if (environment?.hostType !== "physical") {
      failures.push(`${label}.hostType must be physical`);
    }
    for (const field of [
      "osEdition",
      "osVersion",
      "architecture",
      "accountType",
      "filesystem",
      "hardware",
      "networkContext",
    ]) {
      requireNonEmptyString(environment?.[field], `${label}.${field}`, failures);
    }
  }

  const evidenceEntries = Array.isArray(attestation?.evidence) ? attestation.evidence : [];
  if (evidenceEntries.length === 0) failures.push("operator attestation must reference hashed evidence");
  const requiredControlSet = new Set(requiredControls);
  const operatorControlSet = new Set(operatorAttestableControls);
  const evidenceIds = evidenceEntries.map((entry) => entry?.id);
  const duplicateEvidenceIds = duplicateValues(evidenceIds);
  if (duplicateEvidenceIds.length > 0) {
    failures.push(`operator attestation has duplicate evidence IDs: ${duplicateEvidenceIds.join(", ")}`);
  }
  const evidencePaths = evidenceEntries.map((entry) => entry?.path);
  const duplicateEvidencePaths = duplicateValues(evidencePaths);
  if (duplicateEvidencePaths.length > 0) {
    failures.push(`operator attestation references duplicate evidence paths: ${duplicateEvidencePaths.join(", ")}`);
  }
  const evidenceById = new Map();
  for (const [index, entry] of evidenceEntries.entries()) {
    const label = `evidence[${index}]`;
    if (typeof entry?.id !== "string" || !ID_PATTERN.test(entry.id)) {
      failures.push(`${label}.id is invalid`);
    } else {
      evidenceById.set(entry.id, entry);
    }
    requireNonEmptyString(entry?.description, `${label}.description`, failures);
    if (!EVIDENCE_TYPES.has(entry?.type)) failures.push(`${label}.type is not permitted`);
    const capturedTimestamp = parseTimestamp(entry?.capturedAt, `${label}.capturedAt`, failures);
    validateTimestampWindow({
      timestamp: capturedTimestamp,
      label: `${label}.capturedAt`,
      manifestTimestamp,
      completedTimestamp,
      nowMs,
      failures,
    });
    const declaredControlIds = Array.isArray(entry?.controlIds) ? entry.controlIds : [];
    if (declaredControlIds.length === 0) failures.push(`${label} must declare control coverage`);
    if (duplicateValues(declaredControlIds).length > 0) {
      failures.push(`${label} has duplicate control coverage`);
    }
    for (const controlId of declaredControlIds) {
      if (!operatorControlSet.has(controlId)) {
        failures.push(`${label} declares non-operator control ${String(controlId)}`);
      }
    }
    if (typeof entry?.path !== "string" || !entry.path.trim() || path.isAbsolute(entry.path)) {
      failures.push(`${label}.path must be a repository-relative file`);
      continue;
    }
    const resolvedEvidencePath = path.resolve(resolvedRoot, entry.path);
    if (!isInside(resolvedRoot, resolvedEvidencePath)) {
      failures.push(`${label}.path escapes the repository`);
      continue;
    }
    const expectedHash = normalizedHash(entry.sha256);
    if (!expectedHash) {
      failures.push(`${label}.sha256 is invalid`);
      continue;
    }
    try {
      const canonicalEvidence = await canonicalRepositoryFile(
        resolvedRoot,
        resolvedEvidencePath,
        `${label}.path`,
      );
      if (!realCertificationBundle || !isInside(realCertificationBundle, canonicalEvidence.realPath)) {
        failures.push(`${label}.path is outside the designated certification bundle`);
        continue;
      }
      if (samePath(canonicalEvidence.realPath, canonicalAttestation.realPath)) {
        failures.push(`${label}.path cannot reference the attestation itself`);
        continue;
      }
      const actualHash = await sha256File(canonicalEvidence.realPath);
      if (actualHash !== expectedHash) failures.push(`${label} hash does not match its file`);
    } catch (error) {
      failures.push(`${label} cannot be read: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const claims = Array.isArray(attestation?.claims) ? attestation.claims : [];
  if (claims.length === 0) failures.push("operator attestation must contain at least one control claim");
  const controlIds = claims.map((claim) => claim?.controlId);
  const duplicateControlIds = duplicateValues(controlIds);
  if (duplicateControlIds.length > 0) {
    failures.push(`operator attestation has duplicate control claims: ${duplicateControlIds.join(", ")}`);
  }
  const missingOperatorControls = operatorAttestableControls.filter(
    (controlId) => !controlIds.includes(controlId),
  );
  if (missingOperatorControls.length > 0) {
    failures.push(
      `operator attestation is missing required manual control claims: ${missingOperatorControls.join(", ")}`,
    );
  }
  const environmentIdSet = new Set(environmentIds);
  const evidenceIdSet = new Set(evidenceIds);
  const evidenceControlReferences = new Map(
    evidenceIds.map((evidenceId) => [evidenceId, new Set()]),
  );
  for (const [index, claim] of claims.entries()) {
    const label = `claims[${index}]`;
    if (typeof claim?.controlId !== "string" || !requiredControlSet.has(claim.controlId)) {
      failures.push(`${label}.controlId is unknown to the packaged Windows policy`);
    } else if (!operatorControlSet.has(claim.controlId)) {
      failures.push(`${label}.controlId is owned by automation and cannot be operator-overridden`);
    }
    if (claim?.status !== "Passed") failures.push(`${label}.status must be Passed`);
    const testedTimestamp = parseTimestamp(claim?.testedAt, `${label}.testedAt`, failures);
    validateTimestampWindow({
      timestamp: testedTimestamp,
      label: `${label}.testedAt`,
      manifestTimestamp,
      completedTimestamp,
      nowMs,
      failures,
    });

    const claimEnvironmentIds = Array.isArray(claim?.environmentIds) ? claim.environmentIds : [];
    if (claimEnvironmentIds.length === 0) failures.push(`${label} must reference an environment`);
    const duplicateClaimEnvironmentIds = duplicateValues(claimEnvironmentIds);
    if (duplicateClaimEnvironmentIds.length > 0) {
      failures.push(`${label} has duplicate environment references`);
    }
    for (const environmentId of claimEnvironmentIds) {
      if (!environmentIdSet.has(environmentId)) {
        failures.push(`${label} references unknown environment ${String(environmentId)}`);
      }
    }

    const claimEvidenceIds = Array.isArray(claim?.evidenceIds) ? claim.evidenceIds : [];
    if (claimEvidenceIds.length === 0) failures.push(`${label} must reference evidence`);
    const duplicateClaimEvidenceIds = duplicateValues(claimEvidenceIds);
    if (duplicateClaimEvidenceIds.length > 0) {
      failures.push(`${label} has duplicate evidence references`);
    }
    for (const evidenceId of claimEvidenceIds) {
      if (!evidenceIdSet.has(evidenceId)) {
        failures.push(`${label} references unknown evidence ${String(evidenceId)}`);
      } else {
        evidenceControlReferences.get(evidenceId)?.add(claim.controlId);
        const declaredControls = evidenceById.get(evidenceId)?.controlIds ?? [];
        if (!declaredControls.includes(claim.controlId)) {
          failures.push(
            `${label} references evidence ${evidenceId} that does not declare coverage for ${String(claim.controlId)}`,
          );
        }
      }
    }
  }

  for (const [index, entry] of evidenceEntries.entries()) {
    const actualControls = [...(evidenceControlReferences.get(entry?.id) ?? [])].sort();
    const declaredControls = Array.isArray(entry?.controlIds)
      ? [...entry.controlIds].sort()
      : [];
    if (JSON.stringify(actualControls) !== JSON.stringify(declaredControls)) {
      failures.push(
        `evidence[${index}].controlIds must exactly match the claims that reference it`,
      );
    }
  }

  return {
    accepted: failures.length === 0,
    failures,
    attestation,
    attestationPath: canonicalAttestation.relativePath,
    attestationSha256,
    schema: schemaValidation,
  };
}

export function mergeWindowsRuntimeOperatorControls(controls, validation) {
  if (!validation?.accepted || !validation.attestation) {
    return {
      controls,
      failures: ["operator attestation was not accepted"],
    };
  }

  const claims = validation.attestation.claims;
  const failures = [];
  for (const claim of claims) {
    const currentStatus = controls?.[claim.controlId]?.status;
    if (currentStatus === "Failed") {
      failures.push(`operator attestation cannot override failed control ${claim.controlId}`);
    } else if (currentStatus !== "Unverified") {
      failures.push(
        `operator attestation can only supplement Unverified controls; ${claim.controlId} is ${String(currentStatus ?? "missing")}`,
      );
    }
  }
  if (failures.length > 0) return { controls, failures };

  const merged = structuredClone(controls);
  for (const claim of claims) {
    merged[claim.controlId] = {
      status: "Passed",
      evidence: {
        source: "operator-attestation",
        attestationPath: validation.attestationPath,
        attestationSha256: validation.attestationSha256,
        tester: validation.attestation.tester,
        completedAt: validation.attestation.completedAt,
        testedAt: claim.testedAt,
        environmentIds: claim.environmentIds,
        evidenceIds: claim.evidenceIds,
      },
    };
  }
  return { controls: merged, failures: [] };
}

export function evaluateWindowsRuntimeCertification({ controls, requiredControls, candidateBound }) {
  const requiredControlResults = requiredControls.map((controlId) => ({
    controlId,
    status: controls?.[controlId]?.status ?? "Missing",
  }));
  const nonPassingRequiredControls = requiredControlResults.filter(
    (entry) => entry.status !== "Passed",
  );
  const failedControls = Object.entries(controls ?? {})
    .filter(([, entry]) => entry?.status === "Failed")
    .map(([controlId]) => controlId);
  const certificationPassed = candidateBound === true
    && failedControls.length === 0
    && nonPassingRequiredControls.length === 0;
  return {
    certificationPassed,
    result: failedControls.length > 0
      ? "supporting_fail"
      : certificationPassed
        ? "certifying_pass"
        : "supporting_incomplete",
    failedControls,
    nonPassingRequiredControls,
  };
}
