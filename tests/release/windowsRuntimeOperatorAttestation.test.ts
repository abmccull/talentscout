import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  evaluateWindowsRuntimeCertification,
  evaluateWindowsSignerBinding,
  inspectWindowsPackageManifestBinding,
  mergeWindowsRuntimeOperatorControls,
  operatorAttestableWindowsRuntimeControls,
  requiredWindowsRuntimeControls,
  validateWindowsRuntimeOperatorAttestation,
  windowsRuntimeOperatorAttestationPolicy,
} from "../../scripts/windows-runtime-operator-attestation.mjs";

const roots: string[] = [];
const NOW = new Date("2026-07-16T18:00:00.000Z");
const MANUAL_CONTROLS = [
  "cleanStandardUserInstalledRuntime",
  "networkLossDuringSave",
  "interruptedWriteAtConfirmedTransactionBoundary",
  "legacyGoldenSaveMigration",
  "liveSteamCloudConflictAndReconnect",
  "offlineReconnectNoDuplicateEffects",
  "permissionDeniedAndDiskFull",
  "suspendRebootDuringRollover",
];

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "talentscout-windows-attestation-"));
  roots.push(root);
  const candidateCommitSha = "a".repeat(40);
  const candidateTreeSha = "b".repeat(40);
  const candidateTag = "v1.0.0-rc.1";
  const productVersion = "1.0.0";
  const workflowRunId = "123456789";
  const signerCertificateSha256 = "c".repeat(64);
  const certificationBundleRoot =
    "artifacts/release/generated/certifications/windows-runtime";
  const certificationBundlePath = `${certificationBundleRoot}/${candidateCommitSha}`;
  const certificationDirectory = join(
    root,
    ...certificationBundlePath.split("/"),
  );
  mkdirSync(certificationDirectory, { recursive: true });

  const installer = Buffer.from("exact signed Windows installer bytes");
  const installerSha256 = sha256(installer);
  const packageManifestPath = join(root, "candidate-package-manifest.json");
  const packageManifestGeneratedAt = "2026-07-15T12:00:00.000Z";
  writeFileSync(packageManifestPath, JSON.stringify({
    schemaVersion: 2,
    generatedAt: packageManifestGeneratedAt,
    candidateCommitSha,
    candidateTag,
    productVersion,
    workflowRunId,
    packages: [{
      kind: "windows-installer",
      path: "dist/TalentScout-Setup-1.0.0.exe",
      bytes: installer.length,
      sha256: installerSha256,
    }],
  }));

  const schemaPath = join(
    root,
    "docs",
    "release",
    "windows-runtime-operator-attestation.schema.json",
  );
  mkdirSync(join(root, "docs", "release"), { recursive: true });
  writeFileSync(schemaPath, readFileSync(join(
    process.cwd(),
    "docs",
    "release",
    "windows-runtime-operator-attestation.schema.json",
  )));

  const evidenceRelativePath = `${certificationBundlePath}/windows-session.txt`;
  const evidencePath = join(root, ...evidenceRelativePath.split("/"));
  const evidenceContents = "timestamped Windows runtime protocol evidence";
  writeFileSync(evidencePath, evidenceContents);
  const attestationPath = join(certificationDirectory, "windows-operator.json");
  const requiredControls = [
    "packageArchiveIntegrity",
    ...MANUAL_CONTROLS,
  ];
  const attestation = {
    schemaVersion: 1,
    evidenceKind: "windows-packaged-runtime-operator-attestation",
    status: "Passed",
    candidateCommitSha,
    candidateTreeSha,
    candidateTag,
    productVersion,
    workflowRunId,
    signerCertificateSha256,
    packageManifestSha256: sha256(readFileSync(packageManifestPath)),
    packageHashes: { "windows-installer": installerSha256 },
    certificationBundlePath,
    tester: { name: "Release Tester", role: "Windows certification operator" },
    completedAt: "2026-07-16T17:00:00.000Z",
    environments: [{
      id: "win-physical-primary",
      hostType: "physical",
      osEdition: "Windows 11 Pro",
      osVersion: "24H2 build 26100",
      architecture: "x64",
      accountType: "standard user; elevated installer token recorded separately",
      filesystem: "NTFS",
      hardware: "8 GB RAM, 4-core CPU, integrated graphics",
      networkContext: "Ethernet disconnect/reconnect and live Steam account",
    }],
    evidence: [{
      id: "windows-session",
      path: evidenceRelativePath,
      sha256: sha256(evidenceContents),
      description: "Timestamped outputs for all manual Windows certification protocols",
      type: "test-log",
      capturedAt: "2026-07-16T16:30:00.000Z",
      controlIds: MANUAL_CONTROLS,
    }],
    claims: MANUAL_CONTROLS.map((controlId) => ({
      controlId,
      status: "Passed",
      testedAt: "2026-07-16T16:30:00.000Z",
      environmentIds: ["win-physical-primary"],
      evidenceIds: ["windows-session"],
    })),
  };

  return {
    root,
    attestationPath,
    attestation,
    candidateCommitSha,
    candidateTreeSha,
    candidateTag,
    productVersion,
    workflowRunId,
    signerCertificateSha256,
    packageManifestPath,
    packageManifestGeneratedAt,
    installerSha256,
    installerBytes: installer.length,
    requiredControls,
    evidencePath,
    schemaPath,
    certificationBundleRoot,
  };
}

async function validate(
  context: ReturnType<typeof fixture>,
  attestation = context.attestation,
) {
  writeFileSync(context.attestationPath, `${JSON.stringify(attestation, null, 2)}\n`);
  return validateWindowsRuntimeOperatorAttestation({
    root: context.root,
    attestationPath: context.attestationPath,
    candidateCommitSha: context.candidateCommitSha,
    candidateTreeSha: context.candidateTreeSha,
    candidateTag: context.candidateTag,
    productVersion: context.productVersion,
    workflowRunId: context.workflowRunId,
    signerCertificateSha256: context.signerCertificateSha256,
    packageManifestPath: context.packageManifestPath,
    packageManifestGeneratedAt: context.packageManifestGeneratedAt,
    installerSha256: context.installerSha256,
    requiredControls: context.requiredControls,
    operatorAttestableControls: MANUAL_CONTROLS,
    schemaPath: context.schemaPath,
    certificationBundleRoot: context.certificationBundleRoot,
    now: NOW,
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Windows packaged-runtime operator attestation", () => {
  it("reads the executable required-control policy and rejects duplicate policy IDs", () => {
    const status = {
      gates: {
        packagedWindows: {
          generatedEvidence: {
            kind: "windows-packaged-runtime",
            requiredControls: ["packageArchiveIntegrity", "networkLossDuringSave"],
            operatorAttestation: {
              kind: "windows-packaged-runtime-operator-attestation",
              schema: "docs/release/windows-runtime-operator-attestation.schema.json",
              certificationBundleRoot:
                "artifacts/release/generated/certifications/windows-runtime",
              attestableControls: ["networkLossDuringSave"],
            },
          },
        },
      },
    };
    expect(requiredWindowsRuntimeControls(status)).toEqual([
      "packageArchiveIntegrity",
      "networkLossDuringSave",
    ]);
    expect(operatorAttestableWindowsRuntimeControls(status)).toEqual([
      "networkLossDuringSave",
    ]);
    expect(windowsRuntimeOperatorAttestationPolicy(status)).toMatchObject({
      schemaPath: "docs/release/windows-runtime-operator-attestation.schema.json",
      certificationBundleRoot:
        "artifacts/release/generated/certifications/windows-runtime",
    });
    status.gates.packagedWindows.generatedEvidence.requiredControls.push("networkLossDuringSave");
    expect(() => requiredWindowsRuntimeControls(status)).toThrow(/contains duplicates/);
  });

  it("merges exact, hash-verified manual claims and reaches a certifying pass", async () => {
    const context = fixture();
    const validation = await validate(context);
    expect(validation).toMatchObject({ accepted: true, failures: [] });

    const automatedControl = { status: "Passed", evidence: "automation-owned" };
    const controls = Object.fromEntries([
      ["packageArchiveIntegrity", automatedControl],
      ...MANUAL_CONTROLS.map((controlId) => [
        controlId,
        { status: "Unverified", evidence: "requires a physical protocol" },
      ]),
    ]);
    const merged = mergeWindowsRuntimeOperatorControls(controls, validation);

    expect(merged.failures).toEqual([]);
    expect(merged.controls.packageArchiveIntegrity).toEqual(automatedControl);
    expect(merged.controls.networkLossDuringSave).toMatchObject({
      status: "Passed",
      evidence: {
        source: "operator-attestation",
        tester: { name: "Release Tester" },
        evidenceIds: ["windows-session"],
      },
    });
    expect(evaluateWindowsRuntimeCertification({
      controls: merged.controls,
      requiredControls: context.requiredControls,
      candidateBound: true,
    })).toMatchObject({
      certificationPassed: true,
      result: "certifying_pass",
      nonPassingRequiredControls: [],
    });
  });

  it("keeps strict certification incomplete while a required control is not Passed", () => {
    const context = fixture();
    const controls = Object.fromEntries([
      ["packageArchiveIntegrity", { status: "Passed" }],
      ...MANUAL_CONTROLS.map((controlId) => [
        controlId,
        { status: "Unverified" },
      ]),
    ]);
    const evaluation = evaluateWindowsRuntimeCertification({
      controls,
      requiredControls: context.requiredControls,
      candidateBound: true,
    });
    expect(evaluation.certificationPassed).toBe(false);
    expect(evaluation.result).toBe("supporting_incomplete");
    expect(evaluation.nonPassingRequiredControls).toHaveLength(8);

    for (const controlId of MANUAL_CONTROLS) {
      controls[controlId] = { status: "Passed" };
    }
    expect(evaluateWindowsRuntimeCertification({
      controls,
      requiredControls: context.requiredControls,
      candidateBound: false,
    })).toMatchObject({
      certificationPassed: false,
      result: "supporting_incomplete",
    });
  });

  it.each([
    ["wrong candidate commit", (value: any) => { value.candidateCommitSha = "c".repeat(40); }, /exact candidate commit/],
    ["wrong candidate tree", (value: any) => { value.candidateTreeSha = "d".repeat(40); }, /exact candidate tree/],
    ["wrong product version", (value: any) => { value.productVersion = "1.0.1"; }, /exact product version/],
    ["wrong workflow run", (value: any) => { value.workflowRunId = "987654321"; }, /exact workflow run/],
    ["wrong signer certificate", (value: any) => { value.signerCertificateSha256 = "d".repeat(64); }, /release signer certificate/],
    ["wrong manifest hash", (value: any) => { value.packageManifestSha256 = "e".repeat(64); }, /exact package manifest/],
    ["wrong installer hash", (value: any) => { value.packageHashes["windows-installer"] = "f".repeat(64); }, /exact Windows installer/],
    ["stale completion", (value: any) => { value.completedAt = "2026-01-01T00:00:00.000Z"; }, /predates the candidate package manifest|stale/],
    ["duplicate control claim", (value: any) => { value.claims.push(structuredClone(value.claims[0])); }, /duplicate control claims/],
    ["unknown control claim", (value: any) => { value.claims[0].controlId = "unknownRuntimeClaim"; }, /unknown to the packaged Windows policy/],
    ["automation-owned claim", (value: any) => { value.claims[0].controlId = "packageArchiveIntegrity"; }, /owned by automation/],
    ["unknown evidence reference", (value: any) => { value.claims[0].evidenceIds = ["missing-evidence"]; }, /unknown evidence/],
    ["duplicate environment", (value: any) => { value.environments.push(structuredClone(value.environments[0])); }, /duplicate environment IDs/],
    ["unknown top-level property", (value: any) => { value.unreviewed = true; }, /not allowed by the schema/],
    ["unknown nested property", (value: any) => { value.evidence[0].unreviewed = true; }, /not allowed by the schema/],
    ["missing evidence description", (value: any) => { delete value.evidence[0].description; }, /description is required by the schema/],
    ["unsupported evidence type", (value: any) => { value.evidence[0].type = "misc"; }, /schema enum values|type is not permitted/],
    ["evidence before manifest", (value: any) => { value.evidence[0].capturedAt = "2026-07-01T00:00:00.000Z"; }, /predates the candidate package manifest/],
    ["incomplete control coverage", (value: any) => { value.claims.pop(); }, /missing required manual control claims/],
    ["false evidence coverage", (value: any) => { value.evidence[0].controlIds.pop(); }, /does not declare coverage|exactly match/],
  ])("rejects %s", async (_label, mutate, expectedFailure) => {
    const context = fixture();
    const attestation = structuredClone(context.attestation);
    mutate(attestation);
    const result = await validate(context, attestation);
    expect(result.accepted).toBe(false);
    expect(result.failures.join("\n")).toMatch(expectedFailure);
  });

  it("rejects hash-valid evidence outside the designated certification bundle", async () => {
    const context = fixture();
    const attestation = structuredClone(context.attestation);
    const outsidePath = join(context.root, "outside-session.txt");
    const outsideContents = "valid hash, invalid evidence boundary";
    writeFileSync(outsidePath, outsideContents);
    attestation.evidence[0].path = "outside-session.txt";
    attestation.evidence[0].sha256 = sha256(outsideContents);
    const result = await validate(context, attestation);
    expect(result.accepted).toBe(false);
    expect(result.failures.join("\n")).toMatch(/outside the designated certification bundle/);
  });

  it("requires a canonical manifest, compatible tag at HEAD, version, and workflow binding", async () => {
    const context = fixture();
    const valid = await inspectWindowsPackageManifestBinding({
      root: context.root,
      manifestPath: context.packageManifestPath,
      candidateCommitSha: context.candidateCommitSha,
      installerArtifact: {
        kind: "windows-installer",
        path: "dist/TalentScout-Setup-1.0.0.exe",
        bytes: context.installerBytes,
        sha256: context.installerSha256.toUpperCase(),
      },
      productVersion: context.productVersion,
      expectedWorkflowRunId: context.workflowRunId,
      resolveTagCommit: async () => context.candidateCommitSha,
    });
    expect(valid).toMatchObject({
      available: true,
      passed: true,
      productVersion: "1.0.0",
      workflowRunId: "123456789",
    });

    const wrongTag = await inspectWindowsPackageManifestBinding({
      root: context.root,
      manifestPath: context.packageManifestPath,
      candidateCommitSha: context.candidateCommitSha,
      installerArtifact: {
        path: "dist/TalentScout-Setup-1.0.0.exe",
        bytes: context.installerBytes,
        sha256: context.installerSha256.toUpperCase(),
      },
      productVersion: context.productVersion,
      expectedWorkflowRunId: "111111",
      resolveTagCommit: async () => "f".repeat(40),
    });
    expect(wrongTag.passed).toBe(false);
    expect(wrongTag.failures.join("\n")).toMatch(/workflowRunId does not match|does not resolve to HEAD/);

    const outside = await inspectWindowsPackageManifestBinding({
      root: join(context.root, "artifacts"),
      manifestPath: context.packageManifestPath,
      candidateCommitSha: context.candidateCommitSha,
      installerArtifact: {},
      productVersion: context.productVersion,
      expectedWorkflowRunId: context.workflowRunId,
      resolveTagCommit: async () => context.candidateCommitSha,
    });
    expect(outside).toMatchObject({ available: false, passed: false });
    expect(outside.failures.join("\n")).toMatch(/inside the repository/);
  });

  it("pins both Authenticode surfaces to the protected signer certificate", () => {
    const expected = "a".repeat(64);
    const signature = { Status: "Valid", SignerCertificateSha256: expected };
    expect(evaluateWindowsSignerBinding({
      installerSignature: signature,
      executableSignature: signature,
      expectedSignerCertificateSha256: expected,
    })).toMatchObject({ passed: true, failures: [] });
    expect(evaluateWindowsSignerBinding({
      installerSignature: signature,
      executableSignature: { Status: "Valid", SignerCertificateSha256: "b".repeat(64) },
      expectedSignerCertificateSha256: expected,
    })).toMatchObject({ passed: false });
    expect(evaluateWindowsSignerBinding({
      installerSignature: signature,
      executableSignature: signature,
      expectedSignerCertificateSha256: "",
    }).failures.join("\n")).toMatch(/WINDOWS_RELEASE_SIGNER_SHA256/);
  });

  it("rejects evidence tampering after attestation creation", async () => {
    const context = fixture();
    writeFileSync(context.evidencePath, "tampered after the hash was recorded");
    const result = await validate(context);
    expect(result.accepted).toBe(false);
    expect(result.failures).toEqual(expect.arrayContaining([
      expect.stringContaining("hash does not match"),
    ]));
  });

  it("never lets operator evidence override a Failed harness result", async () => {
    const context = fixture();
    const validation = await validate(context);
    expect(validation.accepted).toBe(true);
    const controls = Object.fromEntries(
      MANUAL_CONTROLS.map((controlId) => [
        controlId,
        { status: controlId === "networkLossDuringSave" ? "Failed" : "Unverified" },
      ]),
    );
    const merged = mergeWindowsRuntimeOperatorControls(controls, validation);
    expect(merged.failures).toEqual([
      "operator attestation cannot override failed control networkLossDuringSave",
    ]);
    expect(merged.controls).toBe(controls);
    expect(merged.controls.networkLossDuringSave.status).toBe("Failed");
  });

  it("keeps the checked-in schema control enum aligned with runtime policy", () => {
    const status = JSON.parse(readFileSync(join(
      process.cwd(),
      "docs",
      "release",
      "release-evidence-status.json",
    ), "utf8"));
    const schema = JSON.parse(readFileSync(join(
      process.cwd(),
      "docs",
      "release",
      "windows-runtime-operator-attestation.schema.json",
    ), "utf8"));
    expect(schema.properties.claims.items.properties.controlId.enum).toEqual(
      MANUAL_CONTROLS,
    );
    expect(operatorAttestableWindowsRuntimeControls(status)).toEqual(MANUAL_CONTROLS);
  });
});
