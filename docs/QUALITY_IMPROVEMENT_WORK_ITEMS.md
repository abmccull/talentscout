# Talent Scout quality improvement work cards

Execution tracker for the quality plan. All work remains planned unless the individual status says otherwise; owner-reported work is not final acceptance. W00–W17 are the authoritative IDs.

[Main plan](C:/Users/hands/OneDrive/Pictures/TalentScout/talentscout-visual-overhaul/docs/QUALITY_IMPROVEMENT_PLAN.md)

## W00 — Close the newly reproduced Week 1 Planner failure

**Phase:** 0 · **Priority:** P1 · **Owner:** Current Planner repair task

**Status:** Complete for the focused repair: 28 unit tests and 9 browser checks passed; preview updated; root independently matched declared runtime and normal-export hashes. Full candidate certification remains W12-W17. · **Depends on:** None

**Addresses:** CURRENT-01, D06, D08, Q-GAME

**Planning estimate:** Existing focused repair; finish before other changes

### Actions

- Keep valid engine-gated activity choices reachable from every enabled Choose work action at phone and desktop sizes.
- Make the Week 1 explanation agree with actual availability; distinguish genuinely unavailable work with a visible reason.
- Keep a previously skipped guide disabled when booking youth activities; the owner regression found another onboarding trigger during verification.

### Acceptance

- Actual fresh post-report Week 1 career: choose valid work at 390px and 1280px, book Tuesday/Wednesday, preserve Monday follow-up, verify persisted booking after reload.
- No regression to the guided/unguided opening, existing booking removal, availability gates, or blocked-day behavior.
- Choosing Skip guide remains effective after actual youth activity booking, reload and subsequent week advancement; manual help remains available.

### Evidence to retain

- C:\Users\hands\OneDrive\Pictures\TalentScout\visual-overhaul-20260904\week-one-planner-fix\acceptance.json
- C:\Users\hands\OneDrive\Pictures\TalentScout\quality-plan-20260904\planner-followup-readback.json

## W01 — Preserve and integrate one development baseline

**Phase:** 0 · **Priority:** P1 · **Owner:** Lead engineer

**Status:** Planned · **Depends on:** W00

**Addresses:** R01, Q-SEC

**Planning estimate:** 1-2 engineering days; longer if conflicts reveal divergent work

### Actions

- Preserve both working trees, their uncommitted changes and artifact manifests in recoverable checkpoints.
- Review and integrate the accepted readiness repairs, visual overhaul and Planner correction into the intended canonical development branch without replacing unrelated work.
- Record source commit/tree and a baseline run. Use isolated branches for the next changes; do not call this an accepted final release candidate.

### Acceptance

- Recoverable pre-integration checkpoints exist; reviewed change inventory accounts for every integrated path.
- One unambiguous development commit/tree passes normal and instrumented builds plus core regression checks; normal output has no test bridge.

### Evidence to retain

- Checkpoint refs/patch manifests, reviewed diff, exact commit/tree, baseline test and export records

## W02 — Finish the shared visual and interaction system

**Phase:** 1 · **Priority:** P2 · **Owner:** UI engineer with design review

**Status:** Planned · **Depends on:** W01

**Addresses:** Q-DESIGN, D02, D03, D04, D05, D06, D09, D11, D12, COHESION, F03, F05

**Planning estimate:** 3-5 engineering/design days

### Actions

- Inventory the remaining utility, Reflection, professional report, Settings, sidebar mark and scout-avatar differences; align their typography, spacing, surfaces, status colors and focus treatment with the scouting-journal system.
- Use shared semantic tokens and existing primitives before individual screen overrides. Reduce nested framing where it repeats grouping.
- Replace internal persona/attribute/country labels through display mappings while preserving saved identifiers and perceived-evidence semantics.

### Acceptance

- All named surfaces use the documented grammar; no unexplained competing primary-button, heading, status or form style remains.
- Text contrast, focus, native control semantics, missing/empty/loading/error states and non-color state cues pass checks.
- The Hall label reads Territory Reader; old saves and persona IDs remain unchanged.
- Desktop/phone review includes both normal and reduced motion; fixed/sticky controls remain usable while scrolling.

### Evidence to retain

- Updated design-system inventory and before/after representative captures; semantic/keyboard/Axe checks

## W03 — Make the Desk present one clear next decision

**Phase:** 1 · **Priority:** P2 · **Owner:** UI and gameplay engineer

**Status:** Planned · **Depends on:** W01, W02

**Addresses:** Q-DESIGN, D01, D06, D07, D08, D12, COHESION, F02

**Planning estimate:** 1-3 engineering days

### Actions

- Derive the leading action from current case state: observe, interpret, file, review a booked look, resolve a response, or recover.
- Make the weekly diary add an independent time/conflict decision instead of repeating the active case's objective.
- Preserve access to secondary work through concise disclosure and a predictable return path.
- Deduplicate by objective identity, not merely by destination: different urgent tasks may legitimately share the Planner route.

### Acceptance

- No two visible primary actions ask for the same immediate case step.
- A booked observation is represented accurately; stale or already-completed actions cannot lead the Desk.
- Fresh, blocked, failed, successful, advanced and restored careers all present a meaningful next action and explanation.

### Evidence to retain

- State-based action matrix and rendered checks; uncoached pilot participants identify the next action

## W04 — Reduce comparison and World detail density

**Phase:** 1 · **Priority:** P2 · **Owner:** UI engineer with design review

**Status:** Planned · **Depends on:** W02

**Addresses:** Q-DESIGN, D01, D02, D05, D07, D08, D12, COHESION, F01

**Planning estimate:** 2-4 engineering/design days

### Actions

- Give Report Comparison one leading conclusion, the meaningful evidence differences and the next scouting decision.
- Restructure World Outlook around current pressure/opportunity and its consequence; move reference metrics into optional details.
- Preserve all existing evidence, uncertainty, history and expert detail without repeating the same claim in prose, cards and tables.

### Acceptance

- At the standard phone width the first viewport identifies the decision, relevant difference and next action; detailed evidence remains reachable.
- The same fact is not restated in multiple adjacent presentations without adding information.
- Rich, sparse, legacy, contradictory and missing-data cases retain accurate meaning and keyboard/touch access.
- Proposed fixture target: at 390 x 844 the reviewed rich comparison is at most 1,600px unexpanded, with every unique detail accessible through a named disclosure. This is a fixture budget, not permission to truncate information.

### Evidence to retain

- Rich/sparse before-after captures, information-preservation checks and pilot comprehension notes

## W05 — Expand portrait variety to measured career demand

**Phase:** 2 · **Priority:** P2 · **Owner:** Art reviewer and portrait systems engineer

**Status:** Planned · **Depends on:** W01, W08

**Addresses:** Q-DESIGN, Q-SAVE, D10, D11, D12, COHESION, F04

**Planning estimate:** 1-3 engineering days plus art batches; batch count depends on measured demand and review

### Actions

- Use W08's instrumentation to measure unique domain-visible people, allocation demand, pack exhaustion and retained ownership during representative careers before choosing a new pack size.
- Create reviewed lineages with distinct face, pose, kit/background and believable eight-stage aging; size the eligible pool to maximum measured permanent reservations across the 20 x 30 cohort plus 20% reserve, then validate the final pack in W12.
- Retain the finite offline pack and stable initials beyond coverage. Preserve existing bindings, tombstones, source provenance and missing-image behavior.

### Acceptance

- No eligible person in the declared representative test cohort falls back solely because the pack is exhausted; the cohort and reserve are documented. This is not unlimited photography or proof for unseen seeds.
- No existing or retired person's face is reassigned; age lookup, reload, pruning and pack-revision tests preserve identity.
- Every new asset passes age-set, dimensions, hash, review, provenance and packaging checks; images remain outside the initial JavaScript payload.
- Fallback after deliberately exhausted capacity is coherent and never silently reuses another person's face.

### Evidence to retain

- Demand/allocation report, reviewed contact sheets, new asset manifest, identity/save tests

## W06 — Close automated accessibility and responsive-state gaps

**Phase:** 2 · **Priority:** P1 · **Owner:** QA and UI engineer

**Status:** Planned · **Depends on:** W02, W03, W04

**Addresses:** Q-DESIGN, D02, D04, D05, D06, D07, D08, D09, COHESION

**Planning estimate:** 2-4 QA/engineering days, overlapping UI work

### Actions

- Extend coverage to all shipping routes and critical dialogs, controls, errors, empty/loading states and report/save transitions.
- Test 390, 768, 834, 1366 and 1920px, keyboard-only use, zoom/reflow, and both motion settings.
- Retain true rendered focus, scroll and choice behavior; do not replace failing interactions with forced clicks or state clearing.

### Acceptance

- Zero unresolved blocking accessibility defects; every actionable control has a readable name, reachable focus and meaningful disabled/error behavior.
- No horizontal clipping, lost footer/header/navigation, obscured primary action or lost report choice after resizing on covered states.
- Every uncovered route/state is listed and assigned rather than silently counted as passed.
- Measure body text at least 4.5:1 and large text/control contrast at least 3:1 on actual backgrounds; target authored touch controls at 44 x 44px; verify 320px reflow and 200% text sizing without losing a task.

### Evidence to retain

- Route/state coverage matrix, Axe/keyboard logs, motion/scroll geometry and screenshots

## W07 — Improve career balance, repetition and meaningful consequences

**Phase:** 2 · **Priority:** P1 · **Owner:** Gameplay engineer with game-design review

**Status:** Planned · **Depends on:** W01

**Addresses:** Q-GAME, D08, D12

**Planning estimate:** 3-7 engineering/design days plus pilot feedback; additional tuning depends on findings

### Actions

- Instrument decision density, quiet streaks, report outcomes, finances, relationships, rival pressure, career branching and repeated story text using the existing simulation boundaries.
- Compare ordinary policy-driven strategies and holdout seeds; keep sampled replayability proxies separate from evidence about player choice or optimal strategy.
- Tune only observed weak spots: repetitive unresolved prompts, predictable dominant actions, consequence gaps, recovery dead ends and indistinguishable careers. Preserve uncertainty and scout judgment.

### Acceptance

- Existing numeric replayability, economics, youth-career, determinism and opportunity/consequence gates pass without relaxed thresholds.
- No reproducible unbounded reward, report-sale, budget or relationship exploit; finite budgets and consequences survive reload.
- Documented holdout strategies remain viable without one trivial policy dominating all goals; failures drive specific rule/content changes.
- Human paired-career evidence later confirms differences and meaningful choices; simulation statistics alone do not close engagement.

### Evidence to retain

- Strategy/seed protocol, distributions and counterexamples, scoped regression tests, pilot and final paired-career studies

## W08 — Prove real save recovery and long-career identity retention

**Phase:** 2 · **Priority:** P1 · **Owner:** Persistence and desktop engineer

**Status:** Planned · **Depends on:** W01

**Addresses:** Q-SAVE, Q-GAME, R02, R06

**Planning estimate:** 3-6 engineering/QA days

### Actions

- Add domain-visible portrait exposure, exhaustion and footprint measurements to the existing driver and retention report; use season 1/10/30 checkpoint fixtures for demand and save tests.
- Add real save-provider checkpoints and fresh-process reload to the long-career protocol; keep pure simulation soaks clearly labeled where persistence is mocked.
- Exercise interruption during save, quit failure/timeout/retry, rapid saves, cross-career replacement, corrupted latest slot, migration, quota/disk-full and backup recovery in isolated disposable profiles.
- Extend portrait exposure/ownership assertions across save, load, aging, pruning, career retirement, allocator exhaustion and pack revisions.

### Acceptance

- Recovery yields a complete old or new valid save, never a mixed/rolled-back/cross-career record; errors and recovery choices remain visible.
- No lost portrait ownership, face reassignment, missing historical identity or silent record loss at retained checkpoints.
- Preserve existing 80 MiB maximum serialized size, 64x growth and retention budgets; exact packaged interruption tests close physical-runtime gaps later.
- Unrecoverable injected damage is reported accurately with a tested recovery path; do not promise recovery from total physical loss without a backup.

### Evidence to retain

- Fault matrix, provider read-backs and hashes, clean-process reload records, long-save and portrait invariants

## W09 — Create performance headroom without delaying core actions

**Phase:** 2 · **Priority:** P2 · **Owner:** Performance engineer

**Status:** Planned · **Depends on:** W01

**Addresses:** Q-PERF, D06, R05

**Planning estimate:** 2-4 engineering days; profile before committing to an optimization

### Actions

- Profile the eager game-store/domain dependency graph; screens are already lazily loaded, so do not prescribe redundant route splits.
- Remove unnecessary eager code/data, repeated ledger copies and oversized worker payloads only where measurement identifies a bottleneck.
- Keep image assets lazy/local, preserve portrait ownership, and check ordinary and late-career performance after changes.

### Acceptance

- Existing 1,205,862-byte entry-bundle cap remains unchanged. Proposed first stretch is at least 10% headroom: no more than 1,085,275 gzip bytes; 15% headroom is optional only if runtime stays healthy.
- Current emulated limits remain: cold load 15s, navigation p95 2.5s, ordinary week 6s, rollover 15s, renderer JS heap 536,870,912 bytes, DOM 18,000.
- Repeated uncontended measurements show no material regression; physical total-process and late-save limits are closed by W16.
- Measure cumulative transferred code and latency through the first Watch, report, filing and restart; moving bytes into an unmeasured interaction is not a performance improvement.

### Evidence to retain

- Bundle/module attribution, before-after runtime samples, unchanged guard results and physical device evidence later

## W10 — Harden release evidence transport and refresh security scope

**Phase:** 2 · **Priority:** P1 · **Owner:** Release and security engineer

**Status:** Planned · **Depends on:** W01

**Addresses:** Q-SEC, R01, R02, R03

**Planning estimate:** 2-4 engineering/review days

### Actions

- Round-trip the ordinary 20x30 aggregate, raw shards and candidate-core evidence through Package Accepted Candidate into the strict certification inputs.
- Make the distinction between local validation and tag/publish mutations explicit; the current certification workflow can bind a tag even when publishing flags are false.
- Freeze and bind the release-control workflow revision across package and certification; verify candidate/source/control SHAs independently.
- Refresh stale security/telemetry/dependency documentation from current source and retain the new art's separate provenance. Do not manufacture attestations or extend old exceptions to new candidates.
- Add an enforceable candidate/package-bound real Sentry receipt control to the existing provider requirement; distinguish Steam-native cloud conflict tests from disabled Supabase account cloud features.
- Verify all referenced asset evidence files and hashes, current Steam store/achievement assets, applicable rights review and release/recovery runbooks; retain old attestations as historical.

### Acceptance

- Fixture-based bundle round-trip passes strict validation; missing/duplicate/mismatched source, package, aggregate, shard or workflow identity fails visibly.
- A validation-only path has no tag/upload/publication mutation; promotion paths enumerate exact external changes and authoritative read-backs.
- Scoped Electron isolation, IPC/save boundaries, local portrait paths, disabled online gates and sanitized telemetry checks pass; dependency and asset audits meet existing policy.
- Security and asset statements name the actual reviewed scope and evidence date; real provider receipt remains W14.
- Strict validation rejects missing or wrong-candidate provider receipts; actual Steam cloud conflict tests remain required while disabled optional account features stay off.

### Evidence to retain

- Workflow/script changes and negative contract tests, security review, lockfile audit and provenance read-back

## W11 — Use an early human pilot to drive the last product changes

**Phase:** 3 · **Priority:** P1 · **Owner:** Independent facilitator and design/gameplay reviewers

**Status:** Planned; participants needed · **Depends on:** W03, W04, W06, W07

**Addresses:** Q-GAME, Q-DESIGN, D01, D06, D07, D08, D09, D12, COHESION, R04

**Planning estimate:** 1-2 weeks of recruitment/sessions overlapping engineering; iteration time depends on findings

### Actions

- Proposed formative cohort: 10 first-time and 5 returning players, separate from final certification participants. This is a quality target, not an invented release minimum.
- Run formative uncoached opening, report revision, planning conflict, setback/recovery and paired-career sessions before the final candidate freeze.
- Record confusion, assistance, repeated prompts, weak consequences and emotional attachment by participant segment.
- Fix repeated serious issues and retest with fresh people; reserve a separate independent group for formal certification.

### Acceptance

- Every observed repeated P0/P1 issue is resolved and retested; no developer narration is needed to manufacture comprehension or drama.
- The main decision and its consequence are understood; the two careers create concrete differences people can explain.
- Pilot evidence is explicitly formative and does not substitute for W15's exact-package studies.
- Proposed formative targets: 9 of 10 first-time users finish the opening and identify the next action unaided; 4 of 5 returning players recover their case and explain a past consequence within 2 minutes. Record all contrary feedback.

### Evidence to retain

- Consent-based anonymized session notes, issue/retest log, seed/order records and focused changes

## W12 — Freeze and certify one clean source candidate

**Phase:** 4 · **Priority:** P1 · **Owner:** Lead engineer and CI

**Status:** Planned · **Depends on:** W00, W01, W05, W06, W07, W08, W09, W10, W11

**Addresses:** Q-GAME, Q-SAVE, Q-PERF, Q-SEC, R01, R06

**Planning estimate:** 1-3 coordination/QA days plus measured soak wall time; failures may require another candidate

### Actions

- Commit the complete accepted source and freeze both candidate and release-control revisions. Run the full source workflow on a clean install.
- Execute all 20 unique seeded careers through 30 full canonical seasons, every weekly tick and the final season boundary, with deterministic replay and the added portrait/real-provider checks.
- Preserve raw shards, failures, checkpoints, aggregate and accepted source run identity. Measure a representative diagnostic first to size concurrency and forecast runtime without claiming it as certification.

### Acceptance

- Clean candidate commit/tree and passing accepted source workflow are bound; full units, architecture, coverage, builds, bundle, core/opening/organic/accessibility/performance and asset gates pass.
- All20 unique seeds complete 30 seasons plus final boundary with matching replay and unchanged timing/retention/memory limits; no omitted failed seed or imported historical timing exception.
- Any source fix creates a new candidate and invalidates affected prior certification; completed unrelated diagnostic evidence remains historical.

### Evidence to retain

- Accepted source run, clean commit/tree/control SHA, candidate-core evidence, raw 20 shards, strict aggregate and new persistence/portrait checkpoint records

## W13 — Build signed packages and verify the declared platform matrix

**Phase:** 5 · **Priority:** P1 · **Owner:** Desktop/release engineer and platform testers

**Status:** Planned; signing/platform inputs needed · **Depends on:** W12

**Addresses:** Q-SAVE, Q-SEC, R02

**Planning estimate:** 2-5 engineering/QA days after access is available; certificate/account waits are external

### Actions

- Use Package Accepted Candidate with the accepted source identity and required signing/SDK inputs.
- Verify actual declared Windows/macOS/Linux distributables and architectures, signatures/notarization, slim runtime, install/restart/uninstall/offline and recovery behavior.
- Reuse these exact package bytes for every subsequent hardware, human and provider check.
- Resolve architecture explicitly before store claims: Windows x64 NSIS; macOS arm64 DMG and ZIP, with x64 separately required if declared; Linux x64 AppImage and DEB. A host-default build or depot name does not prove universal binaries.

### Acceptance

- Every required package/sidecar/depot entry has a verified hash and candidate/source/control binding; signatures and notarization pass where required.
- The local platform controls pass, including real save/restart, isolated profile interruption and storage failures; no E2E bridge or development-server dependency. Live Steam matrix controls remain pending W14; R02 closes only after those also pass.
- No test artifact or rebuilt package is substituted for the approved bytes.

### Evidence to retain

- Package manifest and SHA256 inventory, signing/notarization read-backs and exact-platform runtime results

## W14 — Verify real Steam and sanitized crash-provider receipt

**Phase:** 5 · **Priority:** P1 · **Owner:** Release engineer and account owner

**Status:** Planned; real platform/provider access needed · **Depends on:** W13

**Addresses:** Q-SEC, R03, R02

**Planning estimate:** 1-2 engineering/QA days after access; provider configuration can extend elapsed time

### Actions

- Run the documented actual Steam service/achievement/reconnect/offline cases enabled for this release.
- Send the sanctioned nonpersonal crash diagnostic from the exact candidate to its configured project and read back provider acceptance with release/build identity.
- Keep optional account cloud saves and rankings disabled; validate those boundaries without activating future services.
- Exercise Steam-native cloud queue, reconnect and conflicting-device save cases as required by the package protocol; disabled Supabase account features do not waive them.

### Acceptance

- Actual platform outcomes and external identifiers are recorded; simulated unavailable Steam is not counted as a live-service pass.
- Provider receipt is tied to the exact candidate and contains the expected sanitized envelope with no save, personal or secret payload.
- Any required account/configuration problem remains visibly open until authoritative read-back succeeds.

### Evidence to retain

- Steam runtime records and achievement read-backs; actual sanitized provider event/release receipt

## W15 — Complete independent human accessibility and product certification

**Phase:** 5 · **Priority:** P1 · **Owner:** Independent facilitator, assistive-technology users and participants

**Status:** Planned; independent participants needed · **Depends on:** W13

**Addresses:** Q-GAME, Q-DESIGN, D01, D06, D07, D08, D09, D12, COHESION, R04

**Planning estimate:** 2-3 weeks of recruitment and sessions, potentially overlapping W13-W16

### Actions

- Run NVDA/VoiceOver protocols against the exact package, including all required control/task records.
- Run the existing 12-person usability study with 6 genre-experienced and 6 newcomer participants, separate from contributors/coached formative participants.
- Run the separate 6-person paired-career study, counterbalanced across 2 careers on the same package and different seeds. Preserve consent and anonymized evidence.

### Acceptance

- Existing usability gates pass: at least 90% unaided evidence-to-report; separately, at least 85% correct club-response explanation and at least 85% correct delayed-consequence explanation; 10 of 12 discovery stories; median SUS 85; no repeated P0 or repeated P1 after retest.
- At least 5 of 6 paired-career participants describe concrete differences without suggested answers; all required perception prompts are recorded.
- Every required assistive-technology and human attestation control is actually completed and candidate/package-bound. A failed gate triggers repair and a new candidate where needed.
- For a high-score stretch, aim for median SUS 90 and no recurring moderate comprehension issues; these supplement rather than replace existing gates.

### Evidence to retain

- Anonymized raw notes/timings/SUS calculations and retests, seed-order records, AT recordings/notes and independently signed candidate-bound attestations

## W16 — Prove physical minimum-hardware and late-save performance

**Phase:** 5 · **Priority:** P1 · **Owner:** Hardware QA tester

**Status:** Planned; declared physical devices needed · **Depends on:** W13

**Addresses:** Q-PERF, Q-SAVE, R05

**Planning estimate:** 2-4 QA days after devices and final packages are available

### Actions

- Run the declared physical minimum protocols on the exact packages for every shipping platform/architecture, including the 4 GB class and required late-career/30-season archive. Recommended-device testing is optional additional characterization.
- Measure cold load, navigation, normal week, season rollover, save/load, scrolling/input and total application process-tree memory.
- Retain environmental conditions and repeated samples; do not substitute emulation or renderer-only heap for physical results.

### Acceptance

- Every current physical-hardware protocol budget and required device/OS record passes without changed limits.
- No out-of-memory failure, unusable long save, unresponsive primary action or identity corruption on the retained archive.
- Results identify device, OS, package hash, save fixture, timing method and all relevant processes.
- Preserve physical limits: menu p95 12s; new career 15s; current save 8s; 30-season save 15s; actions 500ms; week 5s; rollover 15s; process tree 1.25GiB steady/1.75GiB peak; final-loop growth 20%; sustained 30fps; visible progress for tasks over 5s.

### Evidence to retain

- Physical run logs, package/save hashes, process-tree memory and timing records, hardware attestations

## W17 — Independently rescore and close the release decision

**Phase:** 6 · **Priority:** P1 · **Owner:** Lead reviewer plus independent design/engineering reviewers; release owner

**Status:** Planned · **Depends on:** W12, W13, W14, W15, W16

**Addresses:** Q-GAME, Q-SAVE, Q-DESIGN, Q-PERF, Q-SEC, D01, D02, D03, D04, D05, D06, D07, D08, D09, D10, D11, D12, COHESION, R01, R02, R03, R04, R05, R06

**Planning estimate:** 1-2 review days per accepted candidate; further work depends on findings

### Actions

- Rerun the same weighted rubric and all 12 design dimensions plus cohesion on the exact accepted candidate. Retain reviewer disagreements and evidence limits.
- Run strict artifact and release-evidence validation using actual independent certification records; show each gate individually.
- If any material weakness remains, assign a specific residual work card and repeat only affected work plus required candidate validation. Publication is a separate explicit release-owner action.

### Acceptance

- No score increases merely because work was scheduled, a test was weakened or a missing gate was relabeled. No unresolved P0/P1 or severe design cap remains.
- Aim for every product category and design dimension/cohesion at least 9.5/10 (95+ overall); pursue 10 only when independent evidence/review supports no material remaining weakness in the assessed scope.
- Every mandatory gate is passed against the same candidate/package/control revisions. Reviewers and the release owner can trace each conclusion to actual evidence.
- The final report either justifies 100 or explains the smallest remaining deductions and exact next actions; never force a perfect score.

### Evidence to retain

- Fresh weighted scorecard/design audit, residual-issues register, strict validation output, explicit release-owner decision

## Preservation contracts

| ID | Existing behavior to preserve | Responsible work |
| --- | --- | --- |
| INV-01 | Normal-motion Watch and navigation remain viewport-anchored; no retained transform containing block. | W02, W06, W12 |
| INV-02 | World and Week remain usable at 768/834px; weekly controls stick through initial, middle and end scroll. | W04, W06, W12 |
| INV-03 | Report radio choices, draft and filing survive resizing and navigation; no forced clicks or injected style fixes. | W02, W06, W12 |
| INV-04 | A skipped guide stays off across every automatic trigger; manual help remains available. | W00, W03, W06, W12 |
| INV-05 | Bid acceptance happens exactly once, club budgets stay finite, rewards survive reload, and level-up may correctly leave zero remainder XP. | W07, W08, W12 |
| INV-06 | End-of-season dialogs are handled through visible controls before retirement and legacy assertions; no timeout/threshold weakening. | W07, W12 |
| INV-07 | Save/quit interleavings and exact clean-process restart preserve game data and portrait ownership. | W08, W12, W13 |
| INV-08 | Perceived uncertainty is preserved; hidden true ability is never substituted for evidence in player decisions. | W03, W04, W07, W12 |
| INV-09 | Shipping output contains no test-state bridge; Electron isolation, import boundaries and telemetry sanitation remain enforced. | W01, W10, W12, W13, W14 |
| INV-10 | Optional Supabase account cloud/rankings stay disabled; Steam-native cloud still receives its required package tests. | W10, W13, W14 |
