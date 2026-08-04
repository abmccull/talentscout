# TalentScout full game-readiness audit

**Assessment date:** July 28, 2026
**Candidate:** `a99b5849c8fa0d7efa873ef0124e37c109b093bd`
**Branch:** `agent/youth-scout-integrated`
**Product:** TalentScout Youth Scout Early Access
**Runtime:** Next.js static export inside Electron, with local IndexedDB saves, optional Steamworks integration, optional disabled Supabase services, and Windows/macOS/Linux build workflows

## Remediation update — July 29, 2026

The working tree atop `a99b584` fixes and verifies the audit’s reproducible engineering defects:

- `npm audit` now reports zero vulnerabilities; typecheck, lint, 1,314 tests, and the 666-module zero-cycle architecture gate pass.
- Electron now permits only same-package worker sources. A fresh Windows package passes archive, offline career/save/recovery, and packaged worker checks with zero CSP errors.
- The academy case explains how its live brief weights the decision. The desktop/mobile rendered flow passes its Axe and overflow checks.
- Soak failure artifacts now retain the underlying assertion. The discovered failure was an autonomous driver that enrolled in courses but never scheduled Study; it now consumes a real planner slot.
- A one-seed, three-season canonical profile plus a fresh deterministic replay passes 138 canonical weekly ticks. This is supporting remediation evidence, not a substitute for the clean 20x30 release gate.
- The full browser profile passes 60 batches through ten seasons, reaching Season 11 in 41.7 minutes.
- Season rollovers receive a narrow 30-second worker budget while ordinary weeks retain the 8-second fallback. A fresh one-season rollover profile uses the worker for all 6/6 batches.
- The complete initial `/play` script graph is 1,069,796 gzip bytes. The production build now enforces a 1,205,862-byte ceiling; the same payload passed the 4x CPU/1.5 Mbps cold-start budget in 6.66 seconds against a 15-second limit.

The release verdict remains **NOT READY**. The fixes are uncommitted working-tree changes, the clean exact-candidate 20x30 soak has not completed, current GitHub workflows have not rerun on this tree, and exact-tag/signing/platform/Steam/hardware/human certification is still absent. The July 28 baseline below is retained for audit traceability; this remediation update supersedes its resolved dependency, bundle-budget, worker, browser-soak, and academy-case findings.

## Decision

**NOT READY**

The candidate has a strong, playable scout-centered core and unusually broad automated coverage. The critical browser journey, save/load semantics, accessible responsive workspaces, offline Windows package, recovery path, replayability telemetry, static correctness, and 1,314 unit/invariant tests all passed.

Release is blocked by evidence-backed failures:

1. The clean exact-candidate 20-seed x 30-season canonical soak failed its first three isolated careers before any seed completed.
2. Current GitHub CI and desktop-build workflows fail at `npm audit`; the local graph reports 41 vulnerabilities, including 40 high severity, while the production-only scan reports five high-severity vulnerabilities.
3. The packaged Electron CSP blocks the weekly simulation Web Worker, forcing the game onto its slower main-thread fallback.
4. The ten-season every-week browser soak completed zero batches before its 15-minute timeout.
5. Exact tagged-candidate release evidence is incomplete: package manifest, signed installed-runtime proof, macOS/Linux runtime proof, live Steam conflict/reconnect, manual NVDA/VoiceOver, moderated usability/replayability, and physical minimum-hardware evidence are absent.
6. The current academy-case rendered flow fails because the expected brief-weight explanation is not present on the Scouting Desk.

This is not a content-empty or fundamentally broken game. It is a credible Early Access game whose release pipeline and long-horizon/platform proof are not yet reliable enough to ship.

## Smallest path to green

1. Restore green dependency gates and rerun both GitHub workflows on the exact candidate.
2. Fix packaged `worker-src` policy, prove the worker route in the packaged app, and fail the runtime check on unexpected renderer console errors.
3. Diagnose the clean soak failures, preserve the underlying worker assertion in failure artifacts, and complete the full 20x30 gate plus deterministic replay.
4. Make the ten-season browser soak produce progress within its budget and complete.
5. Repair or intentionally revise the academy-case brief-weight contract, then rerun all rendered evidence.
6. Cut a tag and complete exact-SHA package manifests, signatures, install/restart/uninstall, cross-platform, Steam, human, and assistive-technology certifications.

## Release gate scorecard

| Control | Status | Current evidence | Risk | Owner | Next action |
|---|---|---|---|---|---|
| Candidate identity | Passed | Clean detached audit began at `a99b584`; shipping build provenance matched the SHA | Low | Release engineering | Preserve SHA binding through tag and manifests |
| TypeScript | Passed | `npm run typecheck` | Low | Engineering | Keep required |
| Lint | Passed | Zero warnings/errors | Low | Engineering | Migrate from deprecated `next lint` |
| Unit/invariant suite | Passed | 253 files; 1,313/1,313 tests | Low | Engineering | Keep required |
| Architecture | Passed | 665 modules, 3,131 internal edges, zero cycles | Low | Engineering | Watch the 4,548-line core type module |
| Critical coverage | Passed | 85.50% statements, 69.28% branches, 89.93% functions, 86.94% lines | Medium | Engineering | Raise branch coverage around weekly strategy and save boundaries |
| Save-retention coverage | Passed | 19/19; thresholds cleared | Low | Persistence owner | Keep isolated gate |
| Asset provenance | Passed | 135/135 tracked; zero blockers | Low | Content/release | Preserve generated report |
| Youth perk truth | Passed | 8/8 perks have authority, formula, UI explanation, and invariant test | Low | Gameplay | Keep gate |
| Production build | Passed | Static export compiled; provenance matched | Medium | Release engineering | Keep exact-SHA build |
| Bundle budget | Passed with enforced ceiling | `/play` reports 906 kB/1.01 MB; complete initial script graph is 1,069,796 gzip bytes against a 1,205,862-byte build ceiling; throttled cold load is 6.66s against 15s | Medium | Frontend | Keep `test:bundle-budget` in every production build and reduce the ceiling when the state boundary is modularized |
| Dependency/security gate | Passed locally | `npm audit`: zero vulnerabilities | Low | Security/release | Preserve lockfile and rerun CI |
| GitHub CI | Pending rerun | Prior run 30370147440 failed on the now-fixed dependency graph | High | Release engineering | Commit candidate and rerun |
| GitHub desktop build | Pending rerun | Prior run 30370141033 failed on the now-fixed dependency graph | High | Release engineering | Commit candidate and rerun |
| Core gameplay browser suite | Passed | 55/55 with retries disabled; includes organic career through retirement/legacy | Low | Gameplay/QA | Retain as release gate |
| Save/load browser semantics | Passed | Manual slots, autosave isolation, specialization boundary, reload restoration passed | Low | Persistence | Retain regression gate |
| Replayability telemetry | Passed, supporting | 9/9 across 100 seeds x 3 seasons; dirty-tree diagnostic label was correctly applied | Medium | Gameplay analytics | Generate clean exact-candidate artifact in CI |
| Canonical 20x30 soak | Still required | Supporting 1x3 run and fresh deterministic replay pass 138 ticks; clean 20x30 remains absent | Critical | Simulation | Commit, create clean candidate, rerun all seeds and replay |
| Ten-season browser soak | Passed | 60 batches reached Season 11 in 41.7 minutes; two-minute per-batch hang detector retained | Medium | Simulation/performance | Keep isolated long-running gate |
| Low-end emulation | Passed | Core journey and season rollover passed published emulation budgets | Medium | Performance | Confirm on physical minimum hardware |
| Automated accessibility | Passed | 6/6 stories; desktop/mobile core workspaces, dialogs, keyboard/focus, no blocking Axe findings | Low | UI/QA | Keep gate |
| Manual assistive technology | Unverified | NVDA and VoiceOver certification files absent | High under project standard | Accessibility | Complete both critical journeys |
| Core rendered workspaces | Passed | Desktop/mobile Desk, Planner, Reports, Career; no blocking Axe or page overflow | Low | Design | Preserve |
| Scouting ecology rendering | Passed | Inbox pressure, contact thread, rival landscape desktop/mobile | Low | Design/gameplay | Preserve |
| Academy-case rendered flow | Passed | Desktop/mobile Desk, dossier, brief identity, presentation room, Axe, and overflow checks pass | Low | UI/gameplay | Preserve contract |
| Overall rendered design | Ready with conditions | 8.6/10; strong hierarchy and identity, but long mobile density and proof gaps remain | Medium | Design | See `design-audit-report.md` |
| Windows package creation | Passed, supporting | NSIS and unpacked package built; slim ASAR passed; only `steamworks.js` packaged | Medium | Desktop/release | Bind to clean tag and sign |
| Packaged startup/offline/save/recovery | Passed, supporting | Startup, offline career, audio ranges, Steam-unavailable fallback, save/reopen, prior generation, corrupt-head recovery passed | Medium | Desktop/persistence | Promote into exact tagged certification |
| Packaged worker execution | Passed, supporting | Same-package worker active with zero CSP policy errors; rollover probe uses worker for 6/6 batches | Medium | Desktop/security | Promote into exact tagged certification |
| Authenticode/signing | Unverified | Supporting runtime reports `NotSigned` | High | Release engineering | Sign and verify exact installer/binary |
| Installed-app journey | Unverified | Install/restart/uninstall not requested; standard-user journey absent | High | Desktop QA | Run clean installed path |
| macOS/Linux packages | Unverified | Windows host cannot certify them | High | Platform QA | Run native packaged matrices |
| Live Steamworks/cloud | Unverified | SDK absent fallback passed; live two-device conflict/reconnect not tested | High | Steam/platform | Test with provisioned SDK and Steam client |
| Optional cloud saves | N/A for this build | `BETA_CLOUD_SAVES_ENABLED = false` | Low | Product/security | Verify RLS before enabling |
| Global leaderboard | N/A for this build | Client and Edge Function gates are false | Low | Product/security | Add abuse controls and server-authoritative score proof before enabling |
| Online feedback | Externally managed and disabled | Build workflow sets online feedback false | Low | Product/ops | Verify RLS, throttling, retention, alerting before opt-in |
| Crash/error observability | Partially verified | Soak failure artifacts retain the underlying assertion; production Sentry DSN/alerts remain unverified | Medium | Operations | Verify ingestion and alerts |
| Moderated usability | Unverified | Required 12-player/SUS evidence absent | High under project standard | Product research | Run defined study |
| Moderated paired-career replayability | Unverified | Certification absent | High under project standard | Product research | Run paired-career protocol |
| Physical minimum hardware | Unverified | Emulation passed; physical certification absent | High under project standard | QA/performance | Test published minimum machine |
| Release tag/package manifest | Failed | Exact tag and candidate package manifest absent; release checker reports 22 failures | Critical | Release engineering | Cut candidate tag only after blockers clear |
| Rollback/promotion | Unverified | Workflow stages exact artifacts, but production rollback/update signature behavior not exercised | High | Release engineering | Execute rollback drill using promoted artifacts |

## Gameplay and player-experience assessment

### What is ready

- The game has a distinct scout-centered identity. The tested loop is evidence -> judgment -> report -> external response -> consequence, not a generic club-management shell.
- The no-retry browser suite proves onboarding, geography, academy placement, observation, reports, marketplace, rivals, weekly decisions, worker resilience, and save/load.
- The organic journey reaches path choice, leadership, retirement, and inherited legacy through the real UI.
- The Desk clearly prioritizes the next decision and opportunity cost.
- Reports communicate professional accountability rather than acting as a stat export.
- Scouting ecology surfaces recurring contacts, rival counterplay, and pressure.
- Replayability telemetry shows materially divergent simulated outcomes in the supporting 100-seed profile.

### What is not proven

- Ten-season normal-calendar pacing and integrity now complete; physical minimum-hardware feel remains unverified.
- The canonical 30-season weekly simulation gate fails.
- Human players have not yet validated comprehension, repetition, emotional callbacks, or late-career density.
- The packaged worker path is proven in supporting Windows evidence; exact tagged platform certification remains open.
- Populated late-career Reports/Career task timing and physical-machine feel remain unverified.

## Persistence and recovery

Passed evidence includes:

- Independent autosave/manual slots.
- Cross-specialization load rejection without deletion.
- Save envelope/build-version binding.
- Offline save, quit, reopen, and exact-head preservation.
- Previous-generation archive retention.
- Corrupt-newest recovery with player-facing disclosure.
- Remote intent coalescing when Steam is unavailable.
- Bounded and validated native save transfer paths.

Remaining release proof:

- Interrupted process termination inside the packaged IndexedDB commit boundary.
- Disk full and permission denied.
- Network loss during an active save.
- Offline/reconnect duplication audit.
- Golden legacy migration matrix.
- Suspend/reboot during season rollover.
- Live Steam two-device conflict resolution.

## Security assessment

Source-level Electron hardening is strong:

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- guarded navigation and external URLs
- webviews and renderer permissions denied
- narrow frozen preload surface
- bounded UTF-8 save transfers and atomic native export

Release security is still blocked by the missing committed-CI rerun, unsigned supporting Windows artifact, and unverified production Supabase policies before optional features are enabled.

See `security_best_practices_report.md`.

## Performance and capacity

- Low-end Chromium emulation passed the two published scenarios.
- The shipping route is 906 kB with 1.01 MB reported first-load JavaScript; the complete initial HTML script graph is 1,069,796 gzip bytes and passes the enforced 1,205,862-byte production ceiling.
- The ten-season browser career completes 60 batches and reaches Season 11 in 41.7 minutes.
- The supporting canonical remediation profile completes 138 ticks twice, including deterministic replay.
- The rollover worker probe completes 6/6 batches on the worker.

Physical minimum-hardware and clean 20x30 evidence remain required.

## Design summary

**Overall design:** 8.6/10
**Base design:** 8.7/10
**System Cohesion:** 9.1/10

Strengths:

- Clear scout-specific visual identity.
- Strong first-action hierarchy.
- Consistent desktop/mobile component grammar.
- Excellent keyboard and automated accessibility coverage.
- Honest empty states and consequence-oriented copy treatment.

Weaknesses:

- Mobile screens remain long and card-dense.
- Some horizontal rail content is only partially visible by design and increases scanning cost.
- Academy-case explanation contract currently fails.
- Imagery and spatial storytelling remain weaker than the typography/card system.
- Manual screen-reader, human comprehension, audiovisual, and dense late-career proof remain open.

See `design-audit-report.md`.

## Verification ledger

### Passed this audit

- Typecheck
- Lint
- 1,313 unit/invariant tests
- Architecture audit
- Critical coverage
- Retention coverage
- Asset provenance
- Youth perk truth table
- Production build
- 55 no-retry critical browser scenarios
- 6 accessibility scenarios
- 2 low-end emulation scenarios
- Core workspace visual evidence
- Scouting ecology visual evidence
- Windows Electron build and slim package
- Supporting unpacked Windows offline/save/recovery runtime

### Failed this audit

- Full and production dependency audits
- GitHub CI
- GitHub desktop-build workflow
- Clean exact-candidate canonical soak
- Ten-season browser soak
- Packaged Web Worker execution
- Academy-case rendered evidence
- Exact release evidence checker
- Bundle reduction target

### Unverified

- Signed exact-tag installer and standard-user installed path
- macOS and Linux package runtime
- live Steam API/cloud conflicts
- physical minimum hardware
- manual NVDA/VoiceOver
- moderated usability/SUS
- moderated paired-career replayability
- production Sentry alerts
- optional Supabase RLS/abuse/retention controls
- rollback/update drill

## Final release rule

Do not ship from `a99b584`.

Reassess only after:

- dependency and CI gates are green,
- packaged worker execution is proven,
- browser and canonical career gates complete,
- rendered academy-case evidence passes,
- a clean exact tagged package is signed and platform-tested, and
- the project’s explicit human and assistive-technology certifications are complete.
