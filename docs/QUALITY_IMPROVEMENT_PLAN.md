# Talent Scout quality improvement plan

Prepared September 4, 2026 (America/Denver). **Implementation active in the integrated quality checkout; final certification remains open.**

## Outcome and honest scoring

Bring the assessed offline Youth Scout product to **at least 95/100**, then address the remaining justified deductions toward 100. Preserve scouting judgment, uncertainty, relationships, rivals and long-term consequences. This is a finish-and-prove plan for the existing visual overhaul, rather than a proposal for another aesthetic direction.

The verified assessment including the overhaul scored **84.71875 → 85/100 overall** and **81.5625 → 82/100 design**. Those are historical ratings for runtime `ff3b1191abd870e43700811e4fad9ace6e3df727e9f2e2bec9ce1f97a56edfe4`. **W00 is now complete for the focused Planner/guide repair:** the owner recorded 28 passing unit tests, all nine browser checks passing and the updated normal preview, including booking, saving and reaching Week 2. Root read the receipt/logs and independently matched all 1,355 declared runtime files and 721 normal-export files. The updated runtime is `1b0f4b179cd73f7e50c23f3f2eaf773994ded2f5f8dc5770e38e2c5094a11597`; [follow-up verification](C:/Users/hands/OneDrive/Pictures/TalentScout/quality-plan-20260904/planner-followup-readback.json) records the exact scope. These focused checks do not rescore the changed tree or replace full candidate certification. The older 78 was a heuristic without comparable weights.

Source: [full assessment](C:/Users/hands/OneDrive/Pictures/TalentScout/readiness-visual-20260904/ASSESSMENT.md) and [original scorecard](C:/Users/hands/OneDrive/Pictures/TalentScout/readiness-visual-20260904/scorecard.json). The planning review used the frozen assessed source because another task was changing the live checkout. It did not run a new product test suite or certify any package.

| Category | Weight | Baseline | Points still available | Principal work |
| --- | ---: | ---: | ---: | --- |
| Gameplay correctness and depth | 25% | 8.50/10 | 3.75 | W00, W07, W11, W12, W15 |
| Persistence and recovery | 25% | 9.00/10 | 2.50 | W05, W08, W12, W13, W16 |
| Visual design, usability and accessibility | 30% | 8.16/10 | 5.53 | W02, W03, W04, W05, W06, W11, W15 |
| Performance | 10% | 8.00/10 | 2.00 | W09, W12, W16 |
| Security and build quality | 10% | 8.50/10 | 1.50 | W01, W10, W12, W13, W14 |
| **Total** | **100%** | **84.71875/100** | **15.28125** | W00–W17 |

Keep the original formula: sum each category's weight × rating ÷ 10. Design remains 75% of the twelve-dimension mean plus 25% System Cohesion, with the original severe-issue caps. A 9.5 rating in every category and design dimension yields 95 overall. These are review targets, not automatic points for completing tickets. Release remains a separate pass/fail decision.

The design review's first improvement scenario is 94.375/100 design, with navigation and accessibility at 9.0 pending stronger human results. That scenario is neither a promised score nor a ceiling. Iterate on the resulting evidence until those weak spots reach the same 9.5+ standard. A 100 requires the top rubric anchors throughout the assessed scope; it cannot promise no unknown defects or universal enjoyment.

## Work order and ownership

The [18 detailed work cards](C:/Users/hands/OneDrive/Pictures/TalentScout/talentscout-quality/docs/QUALITY_IMPROVEMENT_WORK_ITEMS.md) contain actions, acceptance criteria, evidence, owners, dependencies and effort for every item. The [structured backlog](C:/Users/hands/OneDrive/Pictures/TalentScout/talentscout-quality/docs/quality-improvement-backlog.json) preserves the same content for future tasks.

| Phase | Work | Exit condition |
| --- | --- | --- |
| 0. Establish the baseline | **W00 completed:** focused Week 1/guide repair. **W01 completed:** both checkouts preserved and integrated at a246a48. | W00 phone/desktop booking and persistence pass. W01 checkpoints, both builds, 59 core browser checks and the organic career journey passed. See QUALITY_IMPLEMENTATION.md for current changes and scoped evidence. |
| 1. Finish the visible experience | **W02** shared visual system; **W03** one clear Desk objective; **W04** simpler comparison and World detail. | Consistent main/secondary routes; correct next actions; all useful detail remains available. |
| 2. Strengthen the systems | **W06** accessibility/responsive states; **W07** balance and consequences; **W08** real-save/endurance instrumentation; **W09** measured performance; **W10** release/security evidence. **W05** portrait expansion follows measured demand from W08. | Scoped regression checks pass, failures are explained, and no serious known issue remains in the covered scope. |
| 3. Learn from people | **W11** formative pilot and targeted refinements. | Repeated serious comprehension or gameplay issues are repaired and retested before candidate freeze. |
| 4. Freeze source | **W12** clean candidate, full source checks and the complete 20-seed × 30-season certification. | One accepted source commit/tree/control revision; all required raw results and aggregate preserved. |
| 5. Prove the deliverable | **W13** signed packages and local platform controls, then **W14** live-service matrix controls, **W15** independent human certification and **W16** physical hardware. | The same exact package bytes satisfy all applicable protocols; W14 completes the live Steam portion of R02. |
| 6. Decide | **W17** independent rescore and strict release verdict. | 95+ is supported, remaining deductions are assigned, and every mandatory release gate passes before publication is considered. |

The critical path is baseline → product refinements/pilot → frozen source/endurance → exact packages → hardware/human/provider evidence → final review. Systems and release analysis can overlap UI work; W05 must wait for portrait-demand measurements. Use one integrator for repository writes, or isolated branches followed by serial integration. Shared theme, store, browser and build-output changes need coordination even when the reasoning is independent.

Rough task effort is recorded per card, not an elapsed-time promise. Most focused engineering cards are 1–7 workdays. Human recruitment takes roughly 1–3 weeks per phase and can overlap preparation; art volume depends on measured demand. Forecast endurance wall time after one diagnostic 30-season seed: approximately 21 × measured seed time ÷ effective concurrency, allowing for resource contention and failures. Re-estimate after W01, the first W08 diagnostic and W11. Do not buy art capacity or promise a release date before those measurements.

## Complete design coverage

The target is **9.5+ for every row**, followed by evidence-led refinement toward 10. W17 independently reviews all rows; implementation ownership below excludes that final review.

| Dimension | Baseline /10 | Work | Evidence needed |
| --- | ---: | --- | --- |
| D01: Visual hierarchy | 8.5 | W03, W04, W11, W15 | One leading objective; decision, reason and next action understandable without prompting. |
| D02: Layout and spacing | 8.0 | W02, W04, W06 | No clipping or occlusion across the route/state matrix; comparison details use progressive disclosure. |
| D03: Typography | 8.0 | W02 | One readable type scale across main and utility routes, long names and large text. |
| D04: Color and contrast | 8.5 | W02, W06 | Measured text/control contrast in selected, focus and error states; meaning also expressed without color. |
| D05: Components and states | 8.0 | W02, W04, W06 | Shared controls with correct empty, loading, success, failure and disabled behavior. |
| D06: Interaction and feedback | 8.0 | W00, W02, W03, W06, W09, W11, W15 | Every enabled action works and explains the outcome; keyboard, touch and both motion settings verified. |
| D07: Information architecture and navigation | 8.0 | W03, W04, W06, W11, W15 | Players find secondary work and return to the same person/case without losing context. |
| D08: Task-flow design | 8.5 | W00, W03, W04, W06, W07, W11, W15 | Observe, interpret, file, book, advance, recover and return work through actual controls. |
| D09: Accessibility and inclusive UX | 8.0 | W02, W06, W11, W15 | Automated coverage plus successful human NVDA/VoiceOver, reflow, text sizing and input sessions. |
| D10: Imagery and iconography | 8.5 | W05 | Reviewed varied people and believable aging; measured pack coverage and truthful stable fallback. |
| D11: Brand visual system | 8.5 | W02, W05 | The scouting journal vocabulary extends to reports, Settings, sidebar and scout identity. |
| D12: Emotional trust and polish | 8.0 | W02, W03, W04, W05, W07, W11, W15 | Players understand uncertainty and consequences; people remain recognizable and labels are human-readable. |
| COHESION: System Cohesion | 8.0 | W02, W03, W04, W05, W06, W11, W15 | A complete journey feels consistent in visual language, actions, narrative and brand. |

The five observed visual findings map directly: **F01** comparison/World density → W04; **F02** repeated Desk priorities → W03; **F03** secondary component inconsistency → W02; **F04** portrait variety/capacity → W05/W08; **F05** the Hall persona label → W02. “Territory Reader” is a display mapping; saved persona IDs remain intact.

Keep one objective primary on the Desk, but deduplicate by objective identity rather than merely by destination. Two distinct urgent tasks may both belong in the Planner. Comparison should lead with the meaningful difference and next scouting decision; disclose reference detail without hiding uncertainty or deleting expert information. Proposed rich-fixture budget: no more than 1,600px unexpanded at 390 × 844, retaining every unique fact behind named disclosures.

Use 390, 768, 834, 1366 and 1920px with normal/reduced motion, plus 320px reflow and 200% text sizing. Cover all shipping routes and critical forms, dialogs, empty/loading/error states, saves and report transitions. Measure contrast on actual backgrounds and retain native control semantics, visible focus and useful disabled explanations. Automated scans supplement human assistive-technology work.

Portraits are currently a finite pack: 52 authored lineages, 46 newly allocatable identities per career, with eight age states. W08 measures visible demand, permanent reservations, exhaustion and retention across the representative cohort. W05 sizes the eligible pool to the measured maximum plus a proposed 20% reserve; W12 validates the final pack. Preserve ownership, retirement tombstones and stable initials beyond capacity. Every new lineage needs all eight age states, reviewed variation, asset hashes and provenance. This does not claim unlimited unique faces across unseen careers.

## Gameplay, saves and performance

**Gameplay:** measure choice density, repetition, resource pressure, recovery, relationship/rival consequences and strategy outcomes before tuning. Retain existing replayability and economic thresholds; do not equate simulation diversity with human enjoyment. Use holdout seeds and contrasting ordinary strategies to expose dominant exploits. A proposed 12-seed × 3-strategy × 6-season diagnostic informs tuning; it does not prove optimal play or impose equal outcomes. Formal paired-career evidence closes the human side.

**Persistence:** the existing long-career harness mocks the save provider. JSON round trips therefore cannot establish real IndexedDB or packaged-file recovery. Add season 1/10/30 real-provider checkpoints, clean-process reload and explicit portrait allocation/ownership/footprint assertions. Inject failures at confirmed write boundaries in disposable profiles: interrupted save, quit timeout/retry, rapid saves, corrupt latest generation, old-save migration, quota/disk-full and recovery. A successful recovery yields one complete valid generation, never mixed or cross-career data. Preserve the current 80 MiB serialized-save cap, 64× growth cap and collection limits.

**Endurance:** retain all 20 unique seeds, 30 full canonical seasons including the final boundary, deterministic replay and all failure records. The current policy's CPU, wall-time, retention, heap and worker-memory limits remain unchanged. The historical July timing exception cannot certify this candidate. Add the real-provider and portrait checks without relabeling a mocked simulation as physical storage evidence.

**Performance:** the assessed entry bundle is 1,196,567 gzip bytes against a 1,205,862-byte limit: only 9,295 bytes of headroom. Profile the eager store/domain graph; screens are already lazy. A proposed improvement target is at least 10% headroom (≤1,085,275 bytes); 15% is optional. Measure the whole first Watch/report/file/restart journey so lazy loading does not merely relocate waiting. Keep existing emulated guards, then prove the declared physical minimum.

Physical protocol limits include menu p95 ≤12s, new career ≤15s, current save ≤8s, 30-season save ≤15s, action latency ≤500ms, week ≤5s, rollover ≤15s, total process tree ≤1.25 GiB steady/1.75 GiB peak, sustained ≥30fps and visible progress for tasks over five seconds. Preserve the full protocol's repeated samples and late-save loops. Chromium throttling and renderer-only heap cannot close this gate. Do not raise the advertised minimum to manufacture a pass.

## Release gates and evidence prerequisites

All six mandatory gates were open at the assessed baseline. The planning task has not closed them.

| Gate | Work | Required proof |
| --- | --- | --- |
| R01: Immutable candidate and accepted CI | W01, W10, W12 | Reviewed clean source commit/tree, frozen release-control revision, accepted source workflow and complete ordinary evidence bundle. |
| R02: Signed packages and platforms | W08, W10, W13, W14 | Exact package/sidecar/depot hashes; applicable signature/notarization read-backs; real install, offline, restart, interruption, recovery and uninstall results, plus W14's live Steam matrix controls. |
| R03: Real Steam and crash receipt | W10, W14 | Actual service/achievement/cloud-conflict results and a sanitized Sentry event read back with candidate/package identity. |
| R04: Human accessibility and playtests | W11, W15 | Independent NVDA/VoiceOver, usability and paired-career records bound to the final package. |
| R05: Physical minimum hardware | W09, W16 | Actual declared device/OS results, late-save timings and total application memory. |
| R06: Combined long career | W08, W12 | All 20 raw 30-season shards, replay, retention/portrait/storage checks and a validated aggregate for this candidate. |

Before spending time on final certification, W10 must repair and fixture-test the ordinary evidence path. Static review found that Package Accepted Candidate stages raw soak shards but does not transport/reconstruct the required ordinary aggregate into the strict certification inputs. A positive bundle round trip and negative missing, duplicate, tampered and wrong-candidate cases must pass first. This is a source finding, not a claimed executed workflow failure.

The current certification workflow can create a release tag even with both publication flags false. Use the local strict validator for read-only validation; any future workflow dispatch must account for its actual mutations. Freeze the control-workflow revision across packaging and certification, preserve artifacts before retention expires, and bind independent attestations separately to the source and package hashes. Never create fictional human/provider/signing attestations or reuse an exception from another candidate.

Resolve the declared architecture matrix explicitly: Windows x64 NSIS; macOS arm64 DMG/ZIP with x64 additionally tested if declared; Linux x64 AppImage/DEB. Verify signatures and notarization where applicable; a host-default macOS build does not prove universal support. Use the exact accepted package bytes for all later tests, including the documented OS minima.

Keep optional **Supabase account cloud saves and rankings disabled** and outside this offline scope. **Steam-native cloud remains part of the package protocol**, including queue/reconnect/conflict behavior. Add a machine-checked candidate/package-bound Sentry receipt control to enforce the existing assessment requirement. Refresh stale security/telemetry runbooks and verify the new art's own provenance and file hashes; preserve historical attestations as historical.

A scoped security review should cover Electron/IPC sender and path boundaries, malformed imports, limits, external URL protocols, packaged isolation, disabled-online paths, telemetry sanitation and current lockfile advisories. Optional CSP inline-script hardening is a later improvement only if measured risk and compatibility justify it; it is not a newly invented release requirement.

## Human work and external dependencies

Proposed formative pilot W11: 10 first-time and five returning players, targeting 9/10 successful unaided openings/next-action identification and 4/5 returning case/consequence recovery within two minutes. Record all failures, repair repeated serious issues and retest. This cohort is an improvement target, separate from the established certification minimums.

Final W15 follows the existing protocols: 12 independent usability participants (six genre-experienced, six newcomers), at least 90% unaided evidence-to-report, separately at least 85% correct club-response explanation and at least 85% correct delayed-consequence explanation (each threshold requires at least 11/12), 10/12 discovery stories, median SUS ≥85, and no repeated P0/P1 after retest. A separate six-person paired-career study (three experienced/three new), counterbalanced across two careers, needs at least five participants to describe concrete differences. Complete the required NVDA/VoiceOver controls. Median SUS ≥90 and no recurring moderate confusion are proposed high-score improvements, not substitutes for the existing gates.

External inputs needed later: signing accounts/certificates; licensed Steam test accounts, two-device access and private SDK configuration; a configured Sentry project; physical hardware for every declared minimum platform/architecture; independent participants/facilitation; and any reviewed art/recruitment spending. Recommended-device characterization is optional. Prepare exact artifacts and protocols before requesting any missing access or purchase. This plan sends no external messages, spends no money and publishes nothing. No database migration or new online feature is proposed.

## Preservation, review and completion

Keep the repaired normal-motion fixed controls, Week scrolling, tablet World layout, report state across resizing, skipped-guide behavior, finite/exact-once economic outcomes, save/quit safeguards and perceived-evidence boundaries. The work cards include ten explicit preservation contracts. Tests must use valid rendered actions; do not force clicks, erase obstructing state or loosen limits to pass.

At each work-card exit, record exact source identity, changed files, executed checks, failures/retries and remaining uncertainty. At W12 freeze everything affecting the product and certification control. Source or package fixes after freeze require a new candidate and the prescribed revalidation; historical diagnostics remain available but do not certify changed bytes.

W17 uses fresh design/engineering review and the unchanged rubric. Publish category/dimension scores, rationale, severe caps, raw anchors, reviewer disagreements and every gate status. For each remaining deduction, name the smallest actionable repair and evidence needed, then iterate. Stop claiming progress at the limit of evidence: a completed plan earns zero product points, passing automation does not establish enjoyment, and even 100 product points cannot waive a release gate. Actual publication is a separate release-owner action after the concrete candidate is reviewable.

Detailed source ownership, existing commands, numerical guards and protocols are in the reviewed [design appendix](C:/Users/hands/OneDrive/Pictures/TalentScout/quality-plan-20260904/results/design/plan.md), [gameplay/save/performance appendix](C:/Users/hands/OneDrive/Pictures/TalentScout/quality-plan-20260904/results/systems/plan.md) and [release/security appendix](C:/Users/hands/OneDrive/Pictures/TalentScout/quality-plan-20260904/results/release/plan.md). Appendix-local D/R/Q card names are historical reviewer labels; **W00–W17 in this plan and backlog are the authoritative work IDs**. [Planning graph result](C:/Users/hands/OneDrive/Pictures/TalentScout/quality-plan-20260904/graph-summary.json) records three completed bounded reviews. [Plan verification](C:/Users/hands/OneDrive/Pictures/TalentScout/quality-plan-20260904/plan-verification.json) checks coverage, dependencies, score arithmetic and evidence hashes; it is not a new product acceptance run.
