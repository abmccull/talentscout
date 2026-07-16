# Windows packaged-runtime certification

The Windows harness has two evidence sources with separate ownership:

- The executable harness owns package integrity, Authenticode, manifest
  binding, packaged startup, offline persistence, recovery, Steam-unavailable
  behavior, and the exact installer/install/restart/uninstall journey.
- A named operator may supplement only the eight physical or destructive
  scenarios the harness deliberately leaves `Unverified`.

An operator attestation cannot overwrite a harness `Failed` or `Passed`
result. `--strict` succeeds only when the candidate is clean and bound and
every control required by `release-evidence-status.json` is `Passed`.

Certification also pins the release identity. The package manifest must be a
real, non-symlinked file whose canonical path remains inside the repository;
its compatible `v<productVersion>` tag must resolve to `HEAD`; and its
`productVersion` and `workflowRunId` must match `package.json` and the workflow
run supplied to the certification command. Both the installer and packaged
`TalentScout.exe` must have a valid Authenticode signature from the protected
SHA-256 certificate identity supplied as `WINDOWS_RELEASE_SIGNER_SHA256`.

## 1. Capture supporting automation

Build and sign the exact candidate, generate its package manifest, then run the
installed-package journey from an elevated PowerShell:

```powershell
$env:WINDOWS_INSTALL_JOURNEY = "true"
npm run electron:test-windows-runtime
```

An exit code of zero here means the supporting harness completed; it is not a
Windows release certification. The JSON result should be
`supporting_incomplete` while manual controls remain unverified.

## 2. Exercise the manual controls

Run every applicable protocol against the exact manifest package on physical
Windows hosts. Preserve timestamped logs, screenshots, recordings, save
envelopes, ledger comparisons, and environment notes only in the designated
candidate bundle:

```text
artifacts/release/generated/certifications/windows-runtime/<candidate-commit-sha>/
```

The supplemental controls are:

1. `cleanStandardUserInstalledRuntime`
2. `networkLossDuringSave`
3. `interruptedWriteAtConfirmedTransactionBoundary`
4. `legacyGoldenSaveMigration`
5. `liveSteamCloudConflictAndReconnect`
6. `offlineReconnectNoDuplicateEffects`
7. `permissionDeniedAndDiskFull`
8. `suspendRebootDuringRollover`

Create the attestation inside that same bundle and conform it to
`windows-runtime-operator-attestation.schema.json`. The harness executes that
checked-in schema and rejects unknown properties at every object boundary.
Every evidence entry requires a non-empty description, a permitted evidence
type, capture time, SHA-256, repository-relative path within the bundle, and
the exact controls it supports. Those control IDs must match the claims that
reference the file; all eight manual controls must be covered. Every claim
also needs its own test time plus references to one or more named physical
environments. The top-level document names the tester and role and binds the
exact commit, Git tree, candidate tag, product version, workflow run, signer
certificate, package-manifest hash, and Windows-installer hash.

The harness rejects:

- attestations older than 90 days, newer than the current clock, or predating
  the candidate package manifest;
- wrong commit, tree, tag, manifest, or installer hashes;
- missing, duplicate, unknown, or automation-owned control claims;
- virtual or incompletely described environments;
- missing, repository-escaping, symlink-escaping, or hash-mismatched evidence;
- evidence outside the designated candidate bundle, without a declared type,
  description, capture timestamp, or exact control coverage;
- schema-unknown fields, even when the rest of the document is valid;
- attempts to replace any automated `Failed` or already resolved result.

## 3. Run the certifying merge

Keep the installer journey enabled so automated evidence is regenerated rather
than trusted from an earlier run. Supply the independent operator attestation:

```powershell
$env:WINDOWS_INSTALL_JOURNEY = "true"
$env:WINDOWS_RELEASE_WORKFLOW_RUN_ID = "<GitHub workflow run ID that produced the package manifest>"
$env:WINDOWS_RELEASE_SIGNER_SHA256 = "<SHA-256 of the approved Windows signing certificate>"
$sha = git rev-parse HEAD
$attestation = "artifacts/release/generated/certifications/windows-runtime/$sha/windows-runtime-operator-attestation.json"
npm run electron:test-windows-runtime -- --attestation=$attestation --strict
```

The signer value is certificate identity, not the installer file hash. Store
it as a protected release secret and compare it with the value reported by the
signing-certificate owner before certification.

Before any app launch, the harness inventories and hashes the complete unpacked
runtime, copies it and the installer to an isolated package-under-test
directory, and verifies source-before/source-after/staged inventories. All
launch, archive, signature, and install checks use the staged copy. At
completion it re-hashes both the source and staged package, rechecks signatures,
and revalidates the manifest and operator attestation. Any mutation makes the
candidate unbound.

Do not edit the emitted harness file. A successful strict run reports
`certifying_pass`; anything else exits nonzero. Only then copy the unchanged
combined result to the filename consumed by the release gate:

```powershell
$sha = git rev-parse HEAD
Copy-Item `
  "artifacts/release/packages/$sha/windows-x64/supporting-runtime-evidence.json" `
  "artifacts/release/generated/certifications/windows-runtime.json"
npm run test:release-evidence
```

This process certifies only the Windows row. It cannot satisfy macOS, Linux,
NVDA, VoiceOver, usability, or physical minimum-hardware gates.
