# Release evidence workflow

`release-evidence-status.json` is tracked policy and gate-status data. It does not embed its own commit SHA or package hashes: either value would change the commit it claims to identify and make a clean, exact-candidate audit impossible.

## Candidate binding

The checker derives the candidate commit from `RELEASE_CANDIDATE_SHA`, then `GITHUB_SHA`, then the current Git `HEAD`. An environment-provided SHA must exactly match `HEAD`, any configured tag must resolve to that commit, and the working tree must be clean.

Release tags must match the application version (`v1.0.0`) or identify a
prerelease of that version (`v1.0.0-rc.1`). The package manifest records the
exact tag, commit, product version, workflow run, byte length, and SHA-256 of
every distributable.

Generated candidate evidence is intentionally ignored by Git:

- `artifacts/release/candidate-package-manifest.json`
- `artifacts/release/release-evidence-check.json`
- `artifacts/release/generated/long-career-release-summary.json`
- `artifacts/release/generated/long-career-workers/`

The generated check report records the resolved commit, its source, tag, dirty state, package verification, gate evidence, and every blocker.

`npm run build` is also candidate-aware. The cross-platform Node wrapper derives
the full Git `HEAD` when CI has not supplied `NEXT_PUBLIC_BUILD_VERSION`, rejects
short, `development`, or mismatched values, injects the package version into the
UI, and scans the exported shipping JavaScript to prove the exact SHA reached
save-envelope code. Its generated result is written to
`artifacts/release/generated/build-provenance.json`.

## Package integrity

After committing the exact source candidate and building every supported package, generate the manifest from the real distributables:

```powershell
npm run release:package-manifest -- `
  windows-installer=dist/TalentScout-Setup-1.0.0.exe `
  macos-dmg=release-artifacts/TalentScout-1.0.0-arm64.dmg `
  macos-zip=release-artifacts/TalentScout-1.0.0-arm64.zip `
  linux-appimage=release-artifacts/TalentScout-1.0.0-x86_64.AppImage `
  linux-deb=release-artifacts/TalentScout-1.0.0-amd64.deb
```

The generator refuses a dirty tree. The checker then streams every package, recomputes SHA-256 and byte length, rejects missing, empty, duplicate-kind, absolute, repository-escaping, or incorrectly suffixed packages, checks the manifest's candidate SHA, tag, and product version, and requires every package kind declared in the tracked status file.

## Exact-candidate long-save evidence

Run the release profile from a clean candidate:

```powershell
$env:SOAK_CANDIDATE_SHA = (git rev-parse HEAD)
$env:SOAK_REQUIRE_CLEAN_CANDIDATE = "true"
$env:SOAK_SEEDS = "20"
$env:SOAK_SEASONS = "30"
$env:SOAK_CONCURRENCY = "3"
npm run test:release-soak
```

Each seed runs every canonical calendar week in its own process. This is
explicitly a passive-world longevity profile, not a substitute for the active
organic-career browser journey: it schedules no scout actions and relieves
fatigue at the safety threshold so world continuity, retention, and rollover
remain the measured subject. Every season independently proves the complete
England fixture graph (20/24/24/24 clubs, home and away pairings, 46 weeks), so
each career must execute exactly 1,380 transitions. The committed policy owns
the save, growth, heap, RSS, collection, latency, seed, season, and concurrency
budgets; environment overrides can produce supporting diagnostics but cannot
certify a release. The bounded worker pool only overlaps independent careers
and writes results back in seed order. The generated summary is accepted only
when it names the exact commit and tree, records the workflow and installed
lockfile provenance, came from a clean tree, contains exactly 20 ordered
30-season runs, and reproduces seed one deterministically. The tracked gate remains
`Unverified`; the checker computes an effective `Passed` status from this
generated evidence, avoiding any post-commit policy edit.

Completed seed workers are atomic checkpoints. Re-running the same command
from the same clean commit resumes only workers whose commit tree, Node
runtime, hardware profile, concurrency, release budgets, seed count, season
count, and evidence shape match exactly. A dirty tree, changed commit, changed
runtime, partial JSON, or legacy worker file is rejected and recomputed. Seed
one is always executed again after all workers complete, even on a fully
resumed run, so checkpoints cannot substitute for the determinism proof.
The candidate bundle retains every worker JSON plus the replay worker. Promotion
rehashes each exact file and its checkpoint-free payload, reconciles every run
with the summary, rejects conflicting failure artifacts, and verifies the
manifest hash chain before the long-save gate can pass.

Preview the execution plan without starting a worker:

```powershell
$env:SOAK_PLAN_ONLY = "true"
npm run test:release-soak
Remove-Item Env:SOAK_PLAN_ONLY
```

Progress is written to
`artifacts/release/generated/long-career-workers/checkpoint.json`. Interrupting
the job can lose the active seed processes, but completed seeds remain safe to
resume. Mid-seed restoration is intentionally unsupported because restoring a
season snapshot would change the full-career memory baseline and create a
second simulation path.

This is intentionally a multi-hour release job. Do not shorten it by jumping
calendar weeks; use a smaller seed/season profile only for local development
proof, where the resulting evidence remains supporting rather than certifying.

Run the strict gate with:

```powershell
npm run test:release-evidence
```

Use `npm run audit:release-evidence` only for a non-blocking report. It still writes an honest `Failed` report when the candidate, package, human, hardware, or platform evidence is incomplete.

## Windows packaged runtime evidence

Build the exact Windows candidate, create its package manifest, and run the
non-destructive supporting harness:

```powershell
npm run electron:test-windows-runtime
```

This is intentionally non-certifying: a successful supporting run reports
`supporting_incomplete` while required operator controls remain `Unverified`.

For the installer/install/run/restart/uninstall path, use an elevated
PowerShell only after the tree is clean, the manifest is present, and the
installer has its release Authenticode signature:

```powershell
$env:WINDOWS_INSTALL_JOURNEY = "true"
npm run electron:test-windows-runtime
```

The harness leaves physical power interruption, ACL/disk-full behavior, live
Steam conflict/reconnection, clean-account observation, and non-Windows
platform rows Unverified unless those environments are actually exercised.

After the manual Windows protocols are complete, pass the exact-candidate
operator attestation to the harness and rerun with `--strict`. The attestation
may supplement only the eight declared manual controls; hashes, timestamps,
environment and evidence references are validated, and no automated failure
can be overwritten. Strict mode also requires the originating workflow run ID
and approved signing-certificate SHA-256 through
`WINDOWS_RELEASE_WORKFLOW_RUN_ID` and `WINDOWS_RELEASE_SIGNER_SHA256`; the
manifest tag must resolve to `HEAD`. See
`windows-packaged-runtime-attestation.md` for the schema and commands.

Tagged desktop builds enforce the same process in `.github/workflows/build.yml`.
The tag-only `release-soak` job runs the exact profile in parallel with the
three native package jobs. `candidate-bundle` retains the summary, all worker
artifacts, and the exact manifest with the originating workflow run, but never
publishes or uploads to Steam.

Human and native-platform evidence is supplied later without changing the
candidate through the explicit two-stage process in
`docs/release/release-certification.md`. The certification workflow downloads
the original run's artifacts, never rebuilds them, validates every attestation
and hash, and only then enables an explicitly requested draft GitHub release or
final-tag Steam upload.
