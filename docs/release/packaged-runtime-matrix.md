# Packaged runtime, persistence, and recovery matrix

Status: **Unverified** until every supported platform row passes on release-equivalent packages from one candidate SHA.

## Windows supporting automation

After building the Windows package, run:

```powershell
npm run electron:test-windows-runtime
```

The harness launches the packaged Electron runtime with an isolated Chromium
profile and an unreachable proxy, then verifies an offline first launch, Youth
career creation, local save and transactional overwrite, exact save/load across
a process restart, corrupt-newest-generation fallback, ranged MP3 delivery,
Steam-client-unavailable queueing, and startup from an isolated package copy
with the Steam native SDK files physically removed. It validates the installer
archive and records package hashes, OS details, renderer errors, save hashes,
journal revisions, recovery copies, and remaining unverified controls under:

`artifacts/release/packages/<candidate-sha>/windows-x64/supporting-runtime-evidence.json`

Transient profiles and package copies are removed after the run and ignored by
Git. This supporting run does **not** pass the Windows row because it does not
install the shipping package or prove a clean standard-user account.

Once a clean, signed package manifest exists, open an elevated PowerShell and
run the opt-in shipping-installer journey:

```powershell
$env:WINDOWS_INSTALL_JOURNEY = "true"
npm run electron:test-windows-runtime
```

That journey fails closed unless the source tree is clean, the installer hash
and length match `artifacts/release/candidate-package-manifest.json`, the
Authenticode signature is valid, and the token can execute the declared
per-machine installer. It installs into an isolated evidence directory, creates
and saves an offline career, restarts and reloads the exact local generation,
then invokes the shipping uninstaller and checks cleanup. It never treats an
unpacked-app launch as installed-app evidence.

This automated run remains `supporting_incomplete` while required physical or
destructive scenarios are `Unverified`; it is not a Windows release pass.
After those scenarios are exercised, supply a separately hashed operator
attestation and rerun the installed-package journey with `--strict` as
documented in `windows-packaged-runtime-attestation.md`. Strict mode fails
unless every required Windows control is `Passed`, the manifest's tag resolves
to `HEAD`, its version and protected workflow-run identity match, and both
Windows executables match the pinned signing-certificate SHA-256.

## Platform matrix

Run on a clean standard user account with no development server or repository dependencies.

| Platform | Package | New game | Save/load | Offline | Recovery | Cloud conflict | Interrupted write | Steam unavailable |
|---|---|---|---|---|---|---|---|---|
| Windows x64 | installer + installed app | Unverified | Unverified | Unverified | Unverified | Unverified | Unverified | Unverified |
| macOS arm64 | signed/notarized app | Unverified | Unverified | Unverified | Unverified | Unverified | Unverified | Unverified |
| macOS x64, if supported | signed/notarized app | Unverified | Unverified | Unverified | Unverified | Unverified | Unverified | Unverified |
| Linux x64 | declared shipping format | Unverified | Unverified | Unverified | Unverified | Unverified | Unverified | Unverified |

## Mandatory fault scenarios

1. First launch offline; create, play, save, quit, reopen, and continue.
2. Lose network during a save; local committed envelope remains valid and retry is explicit.
3. Kill the process during temp-file/envelope write; restart loads the last valid generation, not a partial state.
4. Corrupt the newest envelope; recovery identifies the backup and never silently starts a new career.
5. Load every supported legacy golden save; migration is idempotent and a pre-migration backup exists.
6. Create divergent local and cloud edits; show timestamps/career identity and require an explicit choice. Preserve the losing copy as recoverable conflict evidence.
7. Reconnect after offline advancement; no duplicate money, report, transfer, achievement, obligation, or season reward.
8. Remove or deny the Steam SDK; the game remains fully playable and reports unavailable integration without blocking saves.
9. Fill or permission-deny the save location; present a durable error and keep the in-memory career recoverable.
10. Suspend/reboot during a long week or season rollover; precommitted randomness and exact-once effects survive recovery.

## Evidence and exit rule

Capture package hash, app version, OS build, filesystem, account permissions, network transition, source/destination envelope hashes, before/after ledger totals, logs, and final result. Evidence belongs under `artifacts/release/packages/<candidate-sha>/<platform>/`.

The gate passes only when every supported row completes with no silent data loss, duplicate effect, unexplained conflict choice, or dependency on a development service. A browser build or Windows-only run cannot pass macOS/Linux rows.

## Machine-readable controls

`release-evidence-status.json` is the executable checklist for each platform.
Every ID in a gate's `requiredControls` array must exist in that platform's
attestation with `status: "Passed"`; omitted, failed, or `Unverified` controls
block promotion. Extra diagnostic controls may remain `Unverified` only for the
specialized Windows harness when they are not part of the Windows required list.

The eight manual Windows controls use the supplemental schema in
`windows-runtime-operator-attestation.schema.json`. Claims must bind the exact
commit, Git tree, package manifest, and installer, name the tester and physical
environment, and reference typed, timestamped, described, hash-verified
evidence inside the candidate-specific certification bundle. Evidence must
declare exactly which controls it supports. A claim cannot replace an
automated result.

The Windows list includes the installed signed-package journey plus clean
standard-user execution, network loss during save, confirmed transaction kill,
legacy-save migration, cloud conflict/reconnect exact-once behavior,
permission/disk-full failure, suspend/reboot recovery, corrupt-generation
disclosure, and Steam-unavailable fallback. The macOS and Linux lists cover the
same ten mandatory fault scenarios, package install/removal, standard-user and
offline startup, and platform-specific package verification.
