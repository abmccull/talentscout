# TalentScout production readiness plan

Created 2026-09-04 after the four-branch initial audit. Objective: a reliable, understandable Youth Scout career with validated local shipping behavior and explicit remaining release gates.

## Authority and integration

The attached user request authorizes local source, configuration, test and documentation repairs. Existing working changes are preserved. Root is the sole integrator of product writes; helpers may prepare isolated patch proposals. No production deployment, account mutation, customer communication, payment, Steam publication or external attestation is authorized by this implementation plan.

Initial baseline patch and per-file fingerprints are preserved in `../readiness-20260904/`. Every integrated patch must preserve unrelated work. The read-only audit graph has completed; sequential local integration and test records track implementation without adding unnecessary graph overhead.

## Milestones and acceptance criteria

1. **Persistence and recovery (SAVE-1..4).** Manual save cannot roll back later play or another career. Old-career queued autosaves cannot replace the active career. Desktop failure/timeout cannot silently discard data. Save UI reports failure and successful retry. Deferred-provider, queue and quit-controller tests pass.
2. **Game integrity (GAME-1..3).** Depleted budgets remain depleted through sale/load; the same buyer cannot repurchase an unchanged report by relisting; restarting an inquiry cannot farm relationship effects. Normal different-buyer/new-report/new-activity play remains valid. Behavioral regressions pass.
3. **Player outcomes and UI (UX-1..4).** Operational mail remains visible, paid revenue uses actual earnings, seasonal reviews retain placed names, and text meets the existing scale. Root inspects desktop/mobile flow and checks accessibility, navigation and state feedback.
4. **Dependencies, observability and operations (SEC-1, OPS-1..4, DOC-1).** Compatible patches clear npm audit at the configured threshold. A clean installation matches the lockfile. Crash capture is initialized and locally verified. Static preview works; CI records fresh evidence. README and environment instructions accurately describe offline and optional services.
5. **Validation and release report.** Run lint, typecheck, full unit suite, architecture and relevant integrity gates, production and E2E builds, key persistence/opening/report/weekly/placement flows, desktop/mobile accessibility and available runtime/performance checks. Exercise clean-start, save/load/refresh, repeated input and recovery through rendered UI. Record actual results, failures and corrections, candidate fingerprint and any missing evidence.
6. **External certification.** Signed exact-candidate package matrix, Steamworks, provider receipt, human assistive-technology/usability, physical minimum hardware and full prescribed long-career certification remain separate acceptance gates. Run locally available portions; do not invent completion or relax gates to manufacture a GO.

## Completion ledger

- [x] Inspect active repository and preserve baseline fingerprint/patch.
- [x] Execute bounded source audits and baseline checks; play new-career opening.
- [x] Reduce four valid audit results with required evidence anchors.
- [x] Write initial audit and ordered plan before product repairs.
- [ ] M1 persistence and recovery.
- [x] M2 game integrity: budget, buyer/report history, and inquiry replay regressions pass.
- [ ] M3 player outcomes and UI.
- [ ] M4 dependencies and operations.
- [ ] M5 fresh validation and final report.
- [ ] M6 exact release certification (external gates must be reported individually).

Walkthrough additions: SAVE-5 delayed-close edits, SAVE-6 snapshot ordering, SAVE-7 observation/guide/reflection refresh, UX-5 mentor overlap, and UX-6 restored opening assessment. These repair the requested core journey and do not add product scope. Final validation must cover the integrated source after these changes. Historical failed/interrupted runs remain in the evidence directory.

## Deferred scope

Keep disabled optional account cloud saves and online rankings disabled. Account-bound cloud queue ownership and server-verifiable scores are prerequisites to enabling them. Do not add game modes, subscriptions, AI services or a server-backed rewrite. Scouting judgment, uncertainty, relationships, rivals and long-term consequences remain the product identity.
