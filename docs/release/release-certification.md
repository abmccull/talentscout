# Two-stage release certification

TalentScout separates candidate construction from certification and promotion.
Human and platform testing necessarily happens after packages exist. If those
results are committed back into the candidate, the SHA changes and the packages
are no longer the same build you tested. This process keeps the source
candidate immutable and later reuses the original workflow artifacts
byte-for-byte.

## Stage 1: Construct an immutable candidate

1. Commit a clean candidate and create a compatible tag such as
   `v1.0.0-rc.1`.
2. The `Build Desktop App` workflow runs candidate-bound core suites and the
   isolated 20 x 30 soak, builds native packages, hashes all five
   distributables, and uploads:
   - `windows-build`
   - `macos-build`
   - `linux-build`
   - `steam-windows`
   - `steam-macos`
   - `steam-linux`
   - `candidate-build-evidence`
3. When signing secrets are present, those candidate packages are the
   production-signed artifacts later reused for promotion.
4. When signing secrets are intentionally absent, the run is verification-only
   and is not eligible for GitHub or Steam promotion.
5. Record the workflow run ID. Nothing in this workflow publishes a GitHub
   release or uploads to Steam, including RC tags and final tags.

Record these provenance fields together and never mix them across runs:

- candidate tag
- candidate commit SHA
- candidate source tree
- original workflow run ID
- package manifest SHA-256

Artifact retention is 90 days. Rebuild rather than certifying expired or
partially missing candidates.

## Stage 2: Supply independent evidence

Perform NVDA, VoiceOver, moderated usability, moderated paired-career
replayability, physical minimum-hardware, and packaged Windows/macOS/Linux
protocols against the packages from that exact run.

Store the compact machine-readable bundle on an independent branch or commit in:

```text
release-certifications/<candidate-tag>/
```

The directory must contain the filenames declared in
`release-evidence-status.json`. Large recordings may remain in controlled
storage, but the bundle must contain a local result document whose hash is
listed by the attestation. Never include personal participant information.

For Windows, copy the harness output to `windows-runtime.json`. It is accepted
only when the installed-package journey passed, the source and package manifest
match exactly, Authenticode is valid, the installer hash and length match, and
no control is failed.

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
  "evidence": [
    {
      "path": "artifacts/release/generated/certifications/nvda-session.txt",
      "sha256": "<SHA-256 after certification copy>"
    }
  ]
}
```

Evidence paths are written for their final location under
`artifacts/release/generated/certifications/`. The checker rejects missing,
tampered, non-passing, wrong-gate, wrong-tag, wrong-candidate, wrong-package,
or wrong-manifest attestations.

## Certify and promote

Run `Certify and Promote Existing Candidate` manually with:

- the original candidate workflow run ID
- the candidate tag
- the independent certification ref
- explicit GitHub and/or Steam publication choices

The workflow checks out the immutable candidate, downloads artifacts from the
specified original run, copies only the certification directory into an ignored
evidence path, removes the independent checkout, and runs the strict gate. It
does not rebuild.

Keep these identities separate:

- the candidate commit SHA identifies the exact source commit
- the candidate source tree identifies the exact repository content that was
  packaged by the original run
- the original workflow run ID identifies the one and only artifact set that
  certification is allowed to reuse

If any one of those changes, the candidate changed and certification must start
over.

Both certification and publication jobs use GitHub environments:

- `release-certification` gates evidence validation and any reviewer approval
  required before promotion can continue
- `production-release` gates publication approval for draft GitHub release
  creation and any final Steam upload

GitHub publication creates a draft only. Steam publication is impossible for a
tag containing a prerelease suffix, even when requested. Only an explicitly
dispatched, fully certified final tag can upload depots.

## External/manual gates

These gates stay outside source packaging and must be completed against the
exact candidate artifacts:

- NVDA verification
- VoiceOver verification
- moderated usability
- paired-career replayability or other human long-session validation
- packaged Windows protocol checks
- packaged macOS protocol checks
- packaged Linux protocol checks
- minimum-hardware validation
- store page, pricing, and content-survey completion
- final operator or reviewer approval

## Failure rules

- Never replace a missing original artifact with a rebuild under the same
  certification record.
- Never retag a different commit after testing.
- A changed package hash, manifest hash, candidate SHA, candidate source tree,
  workflow run ID, or evidence file hash requires a new
  candidate/certification cycle.
- A certification branch may evolve without changing the candidate, but every
  promotion run records the exact ref and validates all hashes again.
