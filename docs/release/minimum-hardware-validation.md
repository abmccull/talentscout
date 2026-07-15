# Physical minimum-hardware validation

Status: **Unverified** until the exact packaged candidate passes on physical
machines at or below every declared minimum. Chromium throttling, a virtual
machine, or a developer workstation is supporting evidence only.

The canonical automated guardrail and the physical certification targets live
in `src/engine/telemetry/performancePolicy.ts`. The looser Chromium values are
deliberately a repeatable regression signal, not a replacement for the
player-facing limits below.

## Declared Steam minimums under test

These values mirror `docs/steam-store-page.md`. If a machine class cannot pass,
raise the published minimum before release; do not weaken this protocol after
seeing results.

| Platform | Operating system | CPU | Memory | Graphics | Storage | Display |
|---|---|---|---:|---|---:|---:|
| Windows x64 | Windows 10 64-bit | Intel Core i3 / AMD Ryzen 3 or equivalent | 4 GB | Integrated | 1 GB free before install | 1280 x 720 |
| macOS | macOS 12 Monterey | Supported 64-bit Intel or Apple Silicon processor for the shipped package | 4 GB | Integrated | 1 GB free before install | 1280 x 720 |
| Linux x64 | Ubuntu 20.04 LTS | Intel Core i3 / AMD Ryzen 3 or equivalent | 4 GB | Integrated | 1 GB free before install | 1280 x 720 |

Test every architecture the store and depot claim to support. A passing Apple
Silicon run does not certify an Intel package, or vice versa.

## Controlled setup

1. Use the signed/notarized package whose SHA-256 appears in the candidate
   package manifest. Record candidate commit, tag, package hash, app version,
   OS build, CPU, GPU, installed RAM, storage medium, display scale, and power
   mode.
2. Use a standard non-administrator account after installation. Disconnect
   development tools and stop unrelated user applications.
3. Install all OS updates, reboot, wait five minutes for background startup
   activity, and record available memory and disk space.
4. Run on AC power with the normal balanced power profile. Record ambient
   temperature. Do not place the device on a cooling pad unless that is its
   ordinary consumer configuration.
5. Record total RSS for the complete TalentScout process tree, not only the
   renderer heap. Record CPU time, long-task count, disk I/O, crashes, and
   renderer/GPU-process exits.

## Exact packaged-candidate journeys

Complete all journeys without a development server, browser fallback, network
dependency, or test-state bridge:

1. **Cold start:** launch after reboot, reach the usable main menu, start a new
   career, complete onboarding, and reach the Desk.
2. **First-hour core loop:** discover a prospect, schedule and perform an
   observation, preserve/revise a hypothesis, write and submit a report,
   advance weeks, and inspect the consequence.
3. **Normal career:** load the standard mid-career fixture, move among all six
   workspaces, filter/compare prospects, plan a full week, advance four weeks,
   save, quit, relaunch, and verify the save.
4. **Thirty-season archive:** load a candidate-produced 30-season fixture,
   inspect player/club/career histories, search and compare records, advance
   through a season rollover, save, relaunch, and verify history and ledger
   continuity. The fixture's digest and originating candidate SHA must be
   recorded.
5. **Offline/recovery:** repeat launch, save/load, interrupted-write recovery,
   and Steam-unavailable journeys from `packaged-runtime-matrix.md`.

## Release thresholds

Measure at least five cold starts and ten repetitions of load, navigation, and
weekly advancement per platform. Report median, p95, and worst case; do not
discard the first or slowest sample.

| Measure | Required result on every minimum machine |
|---|---|
| Cold start to interactive menu | p95 <= 12 seconds; no failed launch |
| New career to interactive Desk after confirmation | p95 <= 15 seconds |
| Load current-season save | p95 <= 8 seconds |
| Load 30-season fixture | p95 <= 15 seconds |
| Workspace navigation/action response | p95 <= 500 ms, excluding intentional simulation |
| Ordinary weekly advancement | p95 <= 5 seconds; visible progress and no input loss |
| Season rollover | p95 <= 15 seconds; no apparent hang or duplicate effect |
| Total TalentScout process-tree memory | <= 1.25 GB steady state and <= 1.75 GB peak |
| Thirty-season save round trip | No corruption, missing history, duplicate reward, or digest-changing no-op load |
| Stability | Zero crash, renderer exit, unrecoverable save error, or OS low-memory termination |

Any sustained interaction below 30 rendered frames per second, task over five
seconds without progress feedback, or control that regularly misses input is a
failure even if the aggregate threshold passes.

## Heat, repetition, and leak controls

- Warm the machine with ten minutes of ordinary play, then repeat the normal
  career journey for 60 minutes.
- Run three complete sessions separated by a full app quit. Include one cold
  reboot session and one 60-minute continuous session.
- Sample process-tree memory every minute. After returning to the same Desk
  state, steady memory must not grow by more than 20% across the final three
  repeated loops.
- Record CPU frequency or the platform's thermal-pressure indicator. If thermal
  throttling occurs, keep the sample and repeat after cooling; both results are
  evidence. A pass requires the warmed run to stay within thresholds.
- Repeat the 30-season save/load/rollover sequence three times and compare
  ledger totals, season number, entity counts, and save-envelope digest.

## Evidence and exit rule

Store evidence at:

`artifacts/release/hardware/<candidate-sha>/<platform>/<machine-id>/`

Include a machine manifest, package hash, raw timestamped measurements, screen
recording, crash/OS logs, save digests, summary JSON, tester, and date. Redact
account names and device serial numbers. The physical-hardware gate passes only
after every declared platform and architecture has a passing folder for the
same candidate SHA. Failures require a fix and exact-package retest, or an
honest increase to the published minimum specifications.

## Machine-readable controls

The candidate attestation must contain every `requiredControls` ID declared for
`physicalLowEndHardware` in `release-evidence-status.json`, each exactly
`Passed`. The controls bind all claimed platforms and architectures, exact
manifest packages, controlled standard-user setup, all five journeys, sample
counts, latency/memory/stability thresholds, warmed leak testing, ledger/save
digest continuity, retained thermal results, and the complete evidence bundle.
Missing or `Unverified` platform results cannot be averaged into a pass.
