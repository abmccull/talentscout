# TalentScout Youth Scout design audit

**Audit date:** July 13, 2026

**Viewports:** 1440 x 900 desktop and 390 x 844 mobile

**Rendered evidence:** 82 current captures, split evenly across desktop and mobile, in `design-audit-evidence/release-2026-07-13/`

**Decision:** TalentScout is now a **9.2/10 rendered and automated release candidate**, with **9.4/10 gameplay interactivity** and **9.5/10 System Cohesion**. Every scored design dimension is at least 9.0 after the final mobile fixes. This is not yet a fully certified commercial release: manual NVDA and VoiceOver journeys, the moderated usability study, physical low-end hardware, macOS/Linux packages, and the complete packaged/cloud conflict matrix remain unverified.

## Outcome

The interface now supports one coherent scouting career rather than a set of adjacent dashboards. The same prospect and judgment can move through discovery, live observation, contradictory evidence, a preserved hypothesis, a professional report, stakeholder persuasion, placement, development, transfer, failure, vindication, and the World Archive.

The strongest current interactions are:

- Live Observation: a selectable pitch, synchronized evidence list, touch and keyboard parity, tactical context, and limited focus.
- Evidence Board: sources, contradictions, unknowns, hypotheses, confidence, and claim construction.
- Report Room: club need, role, audience, price, risk, alternatives, conviction, presentation approach, and delayed accountability.
- Weekly Planner: a seven-day attention budget with strategic intent, travel, follow-up, relationship, delegation, and opportunity-cost choices.
- Consequence Cinema and career callbacks: visually distinct success, failure, rivalry, and reputation consequences that remain attached to the original judgment.
- World and Career: regional knowledge, physical presence, offices, assignments, world conditions, recovery routes, stakeholder memory, and multi-season player/club/manager comparisons.
- First five minutes: a one-time authored teaching case for new players and generated, anti-repeating prologues for returning careers.
- Product roadmap: an honest, build-aware support destination that separates what is available, in validation, planned, and only being explored without adding a seventh gameplay workspace or promising dates.

The six permanent workspaces remain stable: Desk, Planner, Prospects, Reports, World, and Career. Mobile bottom navigation, contextual drill-downs, and lazy-loaded secondary screens retain this structure without exposing unfinished full-game routes.

## Scorecard

| Dimension | Score | Evidence-backed assessment |
|---|---:|---|
| Visual hierarchy | 9.2 | Each critical state presents one dominant question, visible stakes, and a primary action. Event titles now wrap correctly on mobile. |
| Layout and spacing | 9.1 | Desktop and 390 px layouts are bounded across all six workspaces. World controls no longer overlap the mobile assignment card. |
| Typography | 9.0 | Labels, evidence states, and decisions are consistently legible. The full professional report remains intentionally dense and is the current ceiling. |
| Color and contrast | 9.2 | Semantic states are consistent and the final desktop/mobile matrix has zero blocking Axe violations. |
| Components and states | 9.3 | Opportunity, unknown, contradiction, obligation, delegation, consequence, recovery, and archive states share one component grammar. |
| Interaction and feedback | 9.4 | Pitch focus, evidence classification, report presentation, relationship choices, rival operations, recovery, and weekly resolution all mutate persistent state and return causal feedback. |
| Information architecture and navigation | 9.3 | Six stable workspaces connect directly to the relevant dossier, case, actor, comparison, or next decision. The roadmap remains a clearly labeled support destination rather than becoming a seventh gameplay workspace. |
| Task-flow design | 9.4 | The opening reaches uncertain scouting immediately, then teaches observe, preserve a hypothesis, report, plan another context, and live with the result. |
| Accessibility and inclusive UX | 9.0 provisional | Keyboard, focus restoration, dialog semantics, target size, reduced motion, overflow, and automated Axe gates pass. Manual NVDA and VoiceOver proof remains open. |
| Imagery and iconography | 9.1 | Venue scenes, pitch language, newspaper consequences, world geography, portraits, and club marks reinforce the scouting identity. |
| Brand visual system | 9.3 | Scouting-room green, live-match surfaces, notebook evidence, professional reports, and restrained audio cues form a recognizable product. |
| Emotional trust and polish | 9.4 | The game creates discovery, doubt, ownership, risk, embarrassment, comeback, and vindication. Roadmap status language also avoids fake dates and distinguishes product direction from released functionality. |
| **System Cohesion** | **9.5** | Evidence, people, reports, money, geography, careers, and historical outcomes now operate as one causal system. |

**Overall rendered-design score:** **9.2/10**

**Gameplay interactivity score:** **9.4/10**

## Current verification

- TypeScript: passed.
- Lint: passed with zero warnings or errors.
- Unit and invariant suite: **104 files, 626/626 tests passed**.
- Dependency audit: **0 vulnerabilities** at the moderate threshold.
- Architecture: **456 modules, 1,908 internal edges, 0 dependency cycles**.
- Replayability: **100 seeds x 3 seasons, 5/5 telemetry checks passed**; broad event-category repetition was 0.1696, including stages of multi-week chains.
- Gameplay browser suite: **48/48 current scenarios are green**. The integrated run passed 47; its only failure was a stale capitalization assertion against correct +3 reputation copy, and that scenario passed after the assertion was made semantic.
- Current rendered/accessibility/performance/smoke gates: **14/14 passed**: opening hook 1/1, accessibility 6/6, rendered evidence 2/2, cross-screen smoke 4/4, and throttled performance 1/1. All six workspaces have zero blocking Axe violations on desktop and mobile.
- Focused roadmap and recovery disclosure checks: **10/10 unit/invariant checks and 2/2 browser journeys passed**. The full two-journey rendered evidence file also passed after a clean E2E rebuild; roadmap overview and game-mode states have desktop/mobile captures, zero serious or critical Axe violations, keyboard-operable tabs, and no document-level mobile overflow.
- Ten-season browser world-coherence soak: reached Season 11 in 60 bounded batches; **1.3-minute Playwright wall clock and 70.7 seconds of measured simulation**. The slowest eight-week batch was **1.83 seconds**.
- Current isolated long-save diagnostic: **2 seeds x 10 seasons plus deterministic replay** passed; largest save **26.0 MB**, peak heap **460.2 MB**, peak RSS **567.2 MB**, weekly p95 **1.04 seconds**, and compaction removed **49.9 MB**. The stricter 20 x 30 gate remains unverified.
- Throttled Chromium evidence: cold load **5.01 s**, navigation p95 **0.59 s**, one-week advance **3.80 s**, heap **98.1 MB**, and **4,607 DOM nodes**; all published emulation budgets passed.
- Shipping build: `/play` is **560 kB route JS / 667 kB first-load JS** and contains no E2E bridge markers.
- Assets: **135/135 image and audio assets inventoried**, with owner commercial-rights attestation and zero provenance blockers.
- Windows: the **167.0 MB NSIS installer** built from the latest source; the unpacked application stayed alive for 12 seconds without Steam, all security fuses matched policy, and the package allowlist contains only `steamworks.js`. This remains supporting, not complete packaged-runtime certification.

## Material defects closed in the final pass

1. Mobile World controls no longer obscure the assignment status card.
2. Expanded event decision titles wrap instead of truncating.
3. Valid 50+ MB saves cross the Electron/Steam boundary through a bounded chunk protocol rather than failing a 10 MB cap.
4. Steam slot enumeration no longer drops occupied slots when more than two cloud saves exist.
5. Cloud upload queues reference the authoritative local revision instead of duplicating full save payloads.
6. Archive retention is byte-budgeted while preserving verified recovery and conflict copies.
7. The release checker now derives the candidate, requires a clean tree, and recomputes package hashes instead of trusting tracked metadata.
8. Weekly development, loans, standings, transfer context, and regional availability reuse indexed context rather than repeatedly scanning the world.
9. The youth-specialist fallback no longer creates a global youth batch every ordinary week.
10. Unsigned prospects have a four-completed-season ceiling; placed or aged-out players leave the active pool while scout-linked history remains resolvable.
11. The ten-season browser soak now fails on zero progress, persists timing evidence, and uses the real dynamic world-condition opportunity cap.
12. The release-checker integration test has an explicit child-process timeout, eliminating a confirmed busy-host flake.
13. Simulated cards can only affect players who actually participated; off-field players no longer receive match events.
14. Resolved, acknowledged, skipped, or orphaned narrative decisions now clear their action-required pins instead of leaving permanent blockers.
15. Immutable report revisions retain history without multiplying report volume, validation rewards, recovery credit, narrative gates, leadership credit, table-pound allowances, seasonal awards, or career-review denominators.
16. Signing reputation now follows the dated club-decision ledger, so the same signing cannot pay again on consecutive weeks.
17. Future achievements, handbook topics, hints, toasts, progress totals, and Steam unlocks are filtered through one Youth EA scope contract; old routes fall back to the correct current workspace.
18. Career now durably links Network, Alumni, Performance, Achievements, and the distinct finance tools instead of relying on transient notifications.
19. The unreachable 14-file marketing/landing subtree, dead paper-card component, and obsolete fake-MP3 generator were removed; future full-game modules remain explicitly quarantined rather than masquerading as current features.
20. Native save import/export is atomic, bounded, strict UTF-8, and chunked; packaged media supports range streaming; cloud auth and online feedback fail closed until their production policies are verified.
21. Desktop packaging now denies the production dependency tree and explicitly allows only the Steam bridge, reducing `app.asar` to **73.0 MB** and the installer to **167.0 MB**. An automated assertion prevents this bloat from returning.
22. A durable Future Roadmap support screen now explains the path from Youth Scout Early Access to broader specialist modes, systems, and the full-release quality bar. It is available before and during a career, keeps the six-workspace model intact, and explicitly labels uncertainty without fabricated dates.
23. Main-menu Continue and Load flows now disclose verified archive fallback, damaged/unrecoverable saves, and verified remote recovery with accessible status copy; an unavailable newest slot can no longer silently displace a loadable verified save.

## Remaining certification work

These are evidence gates, not hidden claims of completion:

- Complete the documented NVDA journey on Windows.
- Complete the documented VoiceOver journey on macOS.
- Run the 12-person moderated study and meet the defined SUS/task-completion thresholds.
- Profile the minimum supported physical Windows, macOS, and Linux devices; Chromium throttling is only supporting evidence.
- Execute clean-account install, offline save/load, recovery, interrupted-write, update, uninstall, and live cloud-conflict cases on packaged Windows/macOS/Linux builds.
- Run the configured 20-seed x 30-season candidate-bound nightly soak.
- Bind packages and evidence to a clean commit/tag and produce the final candidate manifest.

## Remaining source debt after release blockers

- `src/stores/actions/weeklyActions.ts` is still a **7,965-line orchestration module**. It is covered by invariants and currently cycle-free, but should continue being split behind the existing architecture ratchet after the release candidate is frozen; a large last-minute rewrite would add more risk than value.
- A handful of lower-priority detail/future screens still subscribe to the whole Zustand store. Core workspaces and the highest-traffic detail screens are narrowed, and the throttled runtime budget passes, so the remaining selector work is optimization rather than a correctness blocker.
- `next lint` passes cleanly but is deprecated by Next.js; migrate to the ESLint CLI before a Next 16 upgrade.
- Online feedback, Supabase cloud saves, and any global competitive leaderboard must stay disabled until production RLS, rate limits, retention, conflict policy, and server authority are proven.

## Release design gate

TalentScout now clears the requested **9+ rendered and automated design bar across all scored categories**. Its core differentiation is visible and playable: uncertainty, personal judgment, persuasion, relationships, geography, and long-term consequences are the game - not decoration around a spreadsheet. Final release certification should remain conditional until the human, hardware, packaged-platform, and exact-candidate evidence above is complete.
