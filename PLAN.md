# Talent Scout visual and gameplay overhaul

## Objective and ownership

Turn the existing Youth Scout experience into a coherent football documentary and scouting dossier, preserving the working simulation and the September 4 reliability repairs. The complete user brief is in `C:/Users/hands/.codex/attachments/e808b4c5-ce71-4aad-97ec-b0dac39e7b48/pasted-text-1.txt`.

Work only in `talentscout-visual-overhaul`, branch `codex/visual-overhaul-20260904`. The parallel production-readiness task owns canonical `talentscout`. Do not share `.next`, `out`, or `out-e2e`. Root is the sole product integrator; reviewers and proposal authors write in `../visual-overhaul-20260904/proposals`.

Baseline: HEAD `8b9ce2eb36ceec270cc50e1a66a576848f40b038` plus existing dirty repairs. Frozen source, tracked patch, file hashes, validated audit graph, before captures, and per-node results live in `../visual-overhaul-20260904`. Baseline source fingerprint is `686562dfc41169ebbd3549565a9d09adfae84db00cf3e811208cd66f0d427cd7`.

## Completion criteria

- [x] Full screen-by-screen rendered audit and 12-dimension plus cohesion score, with unsupported states and coverage limits explicit.
- [x] Unified semantic typography, color, surfaces, spacing, controls, focus, and motion; no arbitrary restyling of each screen.
- [x] Immutable player identity on new and legacy players, maintained through unsigned youth, placement, aging, retirement, and historical display.
- [x] Photographic same-person age states at 15/18/22/27/31/35/39+, with believable teens and mature athletes; no cartoon player avatars in major gameplay.
- [x] One-to-one photographic identity allocation; never disguise a small repeated-face library as a unique population. Finite pack capacity and missing assets remain explicit. Routine rendering and birthdays never generate images.
- [x] Live observation uses visible football atmosphere, non-overlapping portrait subjects, meaningful focus, contextual lenses, and an editorial evidence timeline.
- [x] Profiles provide identity, scout impression, confidence, evidence, projection, and authentic career history.
- [x] Reports read as professional dossiers and comparison resolves unsigned and retired players, highlights evidence quality and differences, and preserves uncertainty.
- [x] Weekly desk has one clear priority, useful next action, and concise secondary information.
- [x] Remaining supported screens follow the same language; tutorial and routine focus interactions avoid unnecessary interruption.
- [x] Desktop, laptop, tablet, and mobile inspection; keyboard focus, readable contrast, reduced motion, and practical touch targets.
- [x] Complete fresh-career observation → reflection → discovery → report → next week journey, plus save/reload and meaningful identity lifecycle tests.
- [x] Before/after captures demonstrate improvement; final score is based on rendered evidence and includes material remaining weaknesses.
- [x] Deliver `docs/VISUAL_GAMEPLAY_AUDIT.md`, `docs/VISUAL_DESIGN_SYSTEM.md`, `docs/PORTRAIT_ART_DIRECTION.md`, `docs/PLAYER_VISUAL_IDENTITY_SYSTEM.md`, and `docs/VISUAL_OVERHAUL_REPORT.md`.

## Phases

1. Rendered baseline complete: 32 allowed routes, 80 named capture scenarios, 320 viewport captures plus 160 full-page images. A real new career reached Week 2 with one report and five observations. All three validated audit nodes reduced successfully; baseline score 49/100.
2. Establish and implement the shared visual system.
3. Integrate persistent identity, migration, age selection, photographic assets and offline production pipeline.
4. Redesign live observation, profile, report, comparison, and weekly desk in that order.
5. Apply shared language to onboarding and remaining supported screens; remove implementation prose from player-facing copy.
6. Responsive, accessibility, motion, failure-state, and full-loop QA; iterate on rendered shortcomings.

## Known constraints and decisions

- The default simulation generates roughly 6,200–7,900 professionals before youth. A small asset catalog cannot represent every person uniquely. Prefer unique allocation to encountered players with permanent bindings and an expandable offline image production pipeline; never recycle a photographed identity while history retains the person. Report coverage honestly.
- The first photographic atlas is an art-direction pilot, not completed population coverage. Inspect facial continuity and realistic aging before accepting each lineage.
- Existing recent readiness repairs must be preserved. Reconcile any later canonical changes after this task's focused implementation is reviewable.
- No new cloud dependency, account requirement, client image-generation key, or production deployment is implied by this local overhaul.

## Final acceptance status

Implementation and source reconciliation are complete in the isolated branch. The 52-person, 416-image photographic pack has 46 lineages eligible for new assignments. One persistent person owns each face permanently; all eight age states are available offline. The finite pack uses editorial initials after exhaustion.

Rendered acceptance includes every allowed route, all four requested viewport sizes, a fresh real opening-to-Week-2 journey, guide opt-out plus manual help, actual save/reload and full Chromium-process restart, report choices across phone/laptop resizing, explicit synthetic aging and retirement, missing-image recovery, and keyboard-operated consequential overlays. The final built Tracker → Profile action and Week-2 Planner have 12 clean viewport captures and six clean Axe scans. The accepted capture passes recorded no changes within their declared source hash scope (src TypeScript/CSS, plus JSON in later passes); the final runtime/asset fingerprint is a separate check.

- [x] Full unit suite: 1,598 tests in 299 files.
- [x] Typecheck and architecture check: 711 modules, 3,339 edges, no cycles.
- [x] Optimized E2E build, static export, asset provenance and unchanged bundle budget: 1,196,620 / 1,205,862 gzip bytes (instrumented); normal export 1,196,567 bytes.
- [x] Browser core: 55 passed, zero retries on the preceding c432 candidate. Final ff3b119 targeted acceptance: 17 plus two weekly scroll cases passed; normal motion verified through real controls and scrolling.
- [x] Complete the final full-season career, leadership, retirement and inherited-legacy regression: passed, zero retries, 4.4 minutes on ff3b119.
- [x] Normal export without E2E bridge: 721 files / 104,556,778 bytes; compile, lint, typecheck, provenance and original bundle budget pass.
- [x] Low-end Chromium emulation: two tests passed in 46.3 seconds without competing builds/reviews; cold 7.36s, navigation p95 0.45s, week 2.07s, rollover 2.57s, heap 29.17MiB and 4,135 DOM nodes, all within original limits.
- [x] Final independent visual score: 82/100, cohesion 8.0/10. All supported families reviewed; final normal-motion delta review covers four screens at five sizes with 20 clean Axe scans and 26 personally reviewed images.
- [x] Independent final source-Electron save/reopen and normal-motion review: 11 native controls, 20 captures and four browser widths passed; source/export unchanged and all 721 export file hashes match.
- [x] Five required documents finalized; exact runtime ff3b1191abd870e43700811e4fad9ace6e3df727e9f2e2bec9ce1f97a56edfe4 and normal export 5f45839e368287ee7171354b791e39fedc9a5f06f6cd670117c8d3ecee6e2a82 bound to the final evidence. Final runtime read-back confirms no drift.

All required local acceptance checks have finished successfully. Preserve failed and superseded evidence explicitly. Canonical production-readiness results are separate and cannot establish acceptance of this visual candidate. No merge, deployment, installer signing or platform release is part of this local overhaul.


## Week 1 Planner follow-up

- [x] Restore actual opening-week work choices from desktop open days and mobile sheet.
- [x] Preserve booked follow-up, scheduling safeguards and autosave; respect guide opt-out when scheduling specialization work.
- [x] Reproduce onboarding leak before the fix; pass 28 focused unit tests and 9 compiled browser tests, including real Week1 booking through Week2 reload.
- [x] Update normal localhost:3105 preview and verify the original Alex Morgan/Daniel Sterling Week1 save with 12 available choices.
- [x] Bind follow-up runtime 1b0f4b179cd73f7e50c23f3f2eaf773994ded2f5f8dc5770e38e2c5094a11597 and preserve prior acceptance scope. See VISUAL_OVERHAUL_REPORT.md follow-up and week-one-planner-fix/acceptance.json.
