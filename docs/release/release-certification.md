# Two-stage release certification

TalentScout separates **candidate construction** from **certification and
promotion**. Human/platform testing necessarily happens after packages exist;
committing its results to the candidate would change the SHA and invalidate the
packages. This process keeps the source tag immutable and later reuses the
original workflow artifacts byte-for-byte.

## Stage 1: construct an immutable candidate

1. Commit a clean candidate and create a compatible tag such as
   `v1.0.0-rc.1`.
2. The `Build Desktop App` workflow runs candidate-bound core suites and the
   isolated 20 x 30 soak, builds/signs native packages, hashes all five
   distributables, and uploads:
   - `windows-build`, `macos-build`, `linux-build`;
   - `steam-windows`, `steam-macos`, `steam-linux`;
   - `candidate-build-evidence` containing the manifest, core evidence, soak
     evidence, and honest pre-certification gate report.
3. Record the workflow run ID. Nothing in this workflow publishes a GitHub
   release or uploads to Steam, including RC tags.

Artifact retention is 90 days. Rebuild rather than certifying expired or
partially missing candidates.

## Stage 2: supply independent evidence

Perform NVDA, VoiceOver, moderated usability, physical minimum-hardware, and
packaged Windows/macOS/Linux protocols against the packages from that run.
Store the compact machine-readable bundle on an independent branch or commit:

`release-certifications/<candidate-tag>/`

The directory must contain the filenames declared in
`release-evidence-status.json`. Large recordings may remain in controlled
storage, but the bundle must contain a local result document whose hash is
listed by the attestation. Never include personal participant information.

For Windows, copy the harness output to `windows-runtime.json`. It is accepted
only when the opt-in installed-package journey passed, the source and package
manifest are exact, Authenticode is Valid, the installer hash/length matches,
and no control is Failed.

Other gate files use this shape:

```json
{
  "schemaVersion": 1,
  "evidenceKind": "release-gate-attestation",
  "gateId": "manualNvda",
  "candidateCommitSha": "<full candidate SHA>",
  "candidateTag": "v1.0.0-rc.1",
  "packageManifestSha256": "<SHA-256 of candidate-package-manifest.json>",
  "packageHashes": {
    "windows-installer": "<manifest package SHA-256>"
  },
  "status": "Passed",
  "operator": "Tester or accountable release owner",
  "completedAt": "2026-07-14T12:00:00.000Z",
  "controls": {
    "criticalJourneyCompleted": { "status": "Passed" },
    "seriousBlockersResolved": { "status": "Passed" }
  },
  "evidence": [{
    "path": "artifacts/release/generated/certifications/nvda-session.txt",
    "sha256": "<SHA-256 after certification copy>"
  }]
}
```

Evidence paths are written for their final location under
`artifacts/release/generated/certifications/`. The checker rejects missing,
tampered, non-passing, wrong-gate, wrong-tag, wrong-candidate, wrong-package, or
wrong-manifest attestations.

## Certify and promote

Run `Certify and Promote Existing Candidate` manually with:

- the original candidate workflow run ID;
- the candidate tag;
- the independent certification ref;
- explicit GitHub and/or Steam publication choices.

The workflow checks out the immutable candidate, downloads artifacts from the
specified original run, copies only the certification directory into an
ignored evidence path, removes the independent checkout, and runs the strict
gate. It does not rebuild.

Both certification and publication jobs use GitHub environments
(`release-certification` and `production-release`) so repository owners can
require reviewers. GitHub publication creates a draft. Steam publication is
impossible for a tag containing a prerelease suffix, even when requested;
only an explicitly dispatched, fully certified final tag can upload depots.

## Failure rules

- Never replace a missing original artifact with a rebuild under the same
  certification record.
- Never retag a different commit after testing.
- A changed package hash, manifest hash, candidate SHA, workflow run ID, or
  evidence-file hash requires a new candidate/certification cycle.
- A certification branch may evolve without changing the candidate, but every
  promotion run records the exact ref and validates all hashes again.
