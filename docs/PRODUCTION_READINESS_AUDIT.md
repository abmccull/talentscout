# TalentScout production readiness audit

Date: 2026-09-04. Initial candidate: `integration/canonical`, HEAD `8b9ce2eb36ceec270cc50e1a66a576848f40b038`, including the pre-existing working changes. Source fingerprint: `sha256:40dde648f8b7fc9a979c09dc0633dd7b927fc3a9fa0df47e2b56cb37753c686c`.

Final local assessment: **78/100 — NO-GO FOR PRODUCTION**. Source repairs and local checks pass; the final status and linked report distinguish the remaining release gates from the historical findings below.

## Initial executive summary

Initial readiness: **55/100**. This is an engineering judgment, not an average of test results. The game has a substantive deterministic simulation, a clear Youth Scout identity, transactional local save journals, renderer isolation, and extensive tests. It is not ready to release: confirmed save-loss races, economic exploits, missing player feedback, stale dependencies and disconnected crash reporting remain. These are targeted repairs; a rewrite would add risk.

The active product is Youth Scout Early Access: spend time, watch prospects, form uncertain judgments, file reports, recommend placements, and live with club/rival/alumni consequences over a career. Desk, Planner, Prospects, Reports, World and Career share the same weekly simulation. First Team, Regional, Data, challenges and competitive leaderboards are deliberately unavailable. This is an offline single-player static Next/React/Zustand application, distributed through Electron; Dexie/IndexedDB owns local saves. Steam is an optional platform adapter. Optional Supabase account cloud saves and online rankings remain disabled. There are no real-money payments or LLM-generated authoritative game decisions in the shipping core.

## Evidence and limits

- Four bounded audit branches completed with source, executed-check and rendered anchors. Manifest, results and deterministic reduction are in `../readiness-20260904/` relative to the repository root.
- Baseline: typecheck passed; lint had one warning; 1,448 unit tests passed and one type-floor invariant failed. Installed packages differ from the lockfile, so these do not certify a fresh installation.
- A fresh real-UI start reached scout creation, the school-match briefing and interactive observation with player selection, evidence, lenses and guidance. Desktop/mobile/tablet captures exist; initial helper captures include intro frames and have limited design value. Full post-fix walkthrough and state-specific responsive captures are required.
- Source inspection is not a human playtest, exact-package test, external service receipt, long-career certification or proof of every possible state. These limits remain explicit throughout the plan.

## Severity

P0 blocks production outright; P1 is a serious risk requiring repair before launch; P2 materially affects quality/reliability; P3 is polish. P1 data-loss and exploit defects are release blockers even without a separate P0.

## Findings before remediation

| ID | Severity | Affected system | Problem, user impact and risk | Recommended repair |
| --- | --- | --- | --- | --- |
| SAVE-1 | P1 | `electron/main.js`, `PersistenceRuntime.tsx` | Quit destroys the renderer after 2.5 seconds even if persistence fails or is still pending. Progress can silently disappear. | Close only after successful flush; on failure/timeout retain the window with retry/cancel and explicit discard. Test the state machine and IPC. |
| SAVE-2 | P1 | `src/stores/gameStore.ts:saveToSlot` | An awaited manual save replaces live state with its old snapshot. Dismissing the modal and continuing can roll back play or restore the wrong career. | Never restore captured gameplay at save completion. Guard metadata updates by snapshot/career identity. Test delayed completion after edits/load. |
| SAVE-3 | P2 | `SaveLoadModal.tsx`, `SettingsScreen.tsx` | Rejected save promises lack persistent visible recovery feedback. | Catch failures, retain intent and show announced error/retry; confirm success only after persistence. |
| SAVE-4 | P1 | `persistGameplayAutosave.ts`, career load/start | Queued autosaves outlive the loaded career and can overwrite its autosave slot. | Fence snapshots by career generation, cancel stale queued work and establish the new snapshot after prior in-flight writes. Test interleaving. |
| GAME-1 | P1 | `reportMarketplace.ts`, `clubEconomics.ts` | Zero and small explicit club budgets are replaced with a minimum/default, regenerating spending capacity including on load. | Preserve finite nonnegative balances; default only missing/invalid legacy data. |
| GAME-2 | P1 | marketplace bid generation/settlement | Withdrawing and relisting the same report permits another payment from the same buyer. | Deduplicate buyer/report-version across listing history at both generation and settlement. Preserve new buyers and genuinely revised reports. |
| GAME-3 | P1 | `observationActions.ts` | Inquiry relationship effects commit before completion; abandoning/reopening the same activity permits repeated gains. | Persist one decision/effect per activity or settle effects once at a defined completion boundary, including save/load. |
| UX-1 | P1 | `youthCaseFocus.ts`, Inbox/HUD | The case-only inbox allowlist hides course completion, retainer losses and financial outcomes. Players cannot explain progression or losses. | Preserve operational outcomes and resolved action history while suppressing ambient unrelated news. |
| UX-2 | P2 | `youthDeskStakes.ts` | Paid uses asking prices of sold listings, omitting nonexclusive sales and negotiated prices. | Use authoritative revenue/accepted payments and placement earnings. |
| UX-3 | P2 | `youthSeasonReview.ts` | The seasonal review reads only open unsigned cases; successful placements can yield a no-named-case season. | Resolve seasonal history through observations, reports, players and alumni, and distinguish completed outcomes. |
| UX-4 | P2 | `YouthDeskDashboard.tsx` | Fixed tiny labels fail the existing type-floor invariant. | Apply shared rem-based text size; inspect rendered result. |
| SEC-1 | P1 | package manifest/lockfile | Five vulnerable packages fail CI: browserslist, fast-uri, nanoid, @humanfs/node, @xmldom/xmldom (three high, two moderate). Primarily tooling exposure; no shipped exploit is asserted. | Install patched compatible resolutions, synchronize the dependency tree, audit and rerun checks. |
| OPS-1 | P1 | Sentry client initialization | The only initialization file is disconnected. Configured captures can silently do nothing. | Wire initialization, bind build release, verify with mocked local transport and document provider verification. |
| OPS-2 | P2 | `.github/workflows/build.yml` | Legacy package compilation omits crash-report DSN. | Align compilation with accepted-candidate configuration. |
| OPS-3 | P2 | package start script/static server | `next start` rejects `output: export`. Production preview command is broken. | Use the existing static server and accurate missing-build guidance. |
| OPS-4 | P2 | `.github/workflows/ci.yml` | CI uploads a historical replayability file instead of the freshly generated result. | Correct path and fail on missing evidence. |
| DOC-1 | P2 | repository root | No top-level README explains setup and supported shipping scope. | Document install, run, test, preview, package, recovery and actual release gates. |
| FUTURE-1 | P2, disabled feature | optional account cloud queue | Upload/delete intents are keyed by backend/slot, not their original account. Enabling account switching could replay another owner's intent. | Keep account cloud saves disabled until account-bound intents and tests are implemented. |
| RELEASE-1 | P1, external evidence | release certification | No newly bound signed/cross-platform packages, human accessibility/usability, hardware, Steam or complete long-career evidence from this run. | Execute available local checks; retain exact external gates without fabricated attestations. |

Exact source locators, producer examples and regression suggestions are in the audit node JSON files. Baseline findings remain historical after repair; final status is recorded below and in the report.

## Area coverage

| Area | Initial assessment |
| --- | --- |
| Gameplay integrity, balancing, progression | Real deterministic rules and evidence gates; budget, duplicate-sale and inquiry exploits need repair. Human fun/pacing and long-horizon balance are unverified. |
| State management, race conditions, concurrency, idempotency | Many transaction and retry guards exist; manual-save, quit and lifecycle gaps are serious. |
| UX, UI, mobile, accessibility | Opening is playable and intent is visible; outcome filtering, financial/history displays and type scale need repair. Final desktop/mobile Axe and walkthrough pending. |
| Frontend architecture | Lazy screens, domain engines, shared scope and worker boundary are appropriate. Large modules warrant targeted edits, not a broad rewrite. |
| Backend and database integrity | Offline journal transactions, archive recovery and migration exist. No server database is required for core play. Live Supabase schema/RLS is not verified and its features remain off. |
| Authentication, authorization, API security | Offline play has no account requirement. Desktop trusted-frame IPC and isolation exist. Competitive server authority is not claimed; disabled score endpoint must stay disabled. |
| Data validation and error handling | Save envelope/version validation exists; asynchronous save failures need usable feedback. Nested malformed-state coverage is not exhaustive. |
| Security, secrets, dependencies | No exposed secret identified in scoped source review; no exhaustive secret-history certification claimed. Five dependency advisories block CI. |
| AI reliability, prompt security, cost controls | No LLM service in shipping gameplay; not applicable. Simulated scouts use deterministic game engines. |
| External integrations | Steam/cloud adapters are bounded; package and provider behavior require separate evidence. Real payments, ads, cron and webhooks are not core game services. |
| Performance | Lazy loading and worker simulation are positive. Fresh production bundle, realistic browser timings and long-career behavior must be measured after repairs. |
| Reliability and testing | 278 test files execute at baseline; one failure. Critical new race/exploit paths need behavioral regressions. |
| Observability and analytics | Crash capture wiring is broken. Existing local telemetry is not proof of external ingestion or product analytics. No unsolicited analytics service will be introduced. |
| Deployment and environment | Static preview is broken; release evidence path is stale. Candidate/package/certification separation exists and must remain intact. |
| Documentation, mocks and TODOs | Missing README; archived/future modes are explicit scope, not promised shipping behavior. Existing release documents must not be treated as current attestations. |

## Final status

Final local readiness is **78/100**, with a **NO-GO FOR PRODUCTION** recommendation because exact-candidate release certification remains open. The audited source defects are repaired and locally verified. The walkthrough exposed additional defects that are included in this mission:

| ID | Severity | Executed evidence and repair |
| --- | --- | --- |
| SAVE-5 | P1 | A delayed close save could miss a later watchlist edit. The close handoff now repeats until the current career and session are stable, and retires superseded retry loops. Deferred-write regressions pass. |
| SAVE-6 | P1 | Wall-clock rollback and raw completed-week timestamps could silently discard newer autosaves. Fresh queued snapshots now receive monotonic ordering within their career generation; explicit stale-snapshot rejection remains. |
| SAVE-7 | P1 | A real refresh after beginning observation restored setup while the guide remembered active play. Observation action persistence and checkpoint-based guide/reflection restoration pass unit and real-browser reload tests. Evidence: `../readiness-20260904/evidence/observation-resume/refresh-repro.json`. |
| SAVE-8 | P1 | Filing the opening report never completed its case stage, so reloading returned to the writer indefinitely. Successful filing now completes the stage; old checkpoints are repaired only when the same scout's actual report for that player exists. |
| UX-5 | P1 | The mentor intercepts the required Promising click at desktop width and covers decision choices on tablet. Shared safe placement and compact guidance pass desktop/phone/tablet acceptance; the regression test intentionally failed before repair. |
| UX-6 | P2 | A restored opening with open club briefs displayed the full professional report while the guide asked for five first-assessment decisions. Opening-case stage now selects the correct first assessment. Formal report navigation also displays the specific current blocker instead of only a remaining count. |
| GAME-4 | P2 | A missed perception remained vague in the evidence panel but the reflection timeline exposed the complete underlying event. Timeline and new journal/observation serialization now use the perceived cue, with a vague legacy fallback. Real cue-generator regressions and both compiled perception cases pass. |
| UX-7 | P2 | A recommended badge reduced mobile question text to a narrow column, and observation prose/briefing chips exposed attribute and country identifiers. Shared choices place the badge below the content row, and briefing/live labels use existing display-name helpers. Final rendered acceptance passes, including the actual mobile controls and saved state. |
| UX-8 | P2 | The first assessment's outer remaining counter stayed at five while inner steps completed. The outer summary now receives the builder's existing completed-step count. Final rendered acceptance passes, including the actual mobile controls and saved state. |
| UX-9 | P2, remaining | Week-two Desk repeats the same priority across summary, main card and next-action panels, with implementation-oriented prose and competing optional guidance. Desktop/phone controls work, but hierarchy remains crowded. A separate user-requested visual overhaul is isolated in another checkout; its changes are not part of this candidate's evidence. |
| UX-10 | P1 | Native Electron acceptance exposed a report card that looked selected while its radio input was unchecked. Both responsive editors remained mounted with identical native group names, allowing the hidden layout to clear the visible input. The six groups now have separate layout identities while sharing one draft. The rebuilt normal Electron diagnostic, browser breakpoint-switch regression and manual checked-state inspection all pass. |
| UX-11 | P1 | A second manual career chose Start without the guide, restored Reflection, filed its assessment and reached week two. Reload had reactivated a legacy first-week task absent from the youth mentor catalog; after the visible Good First Week message closed, navigation remained locked without an actionable guide. The integrated repair persists the career's preference and explicit resume intent, binds guides to careers, and only locks navigation for a real current-catalog task. Ten unit cases, fresh unguided reload acceptance and recovery/save/reload of the original Morgan career pass. |

Final validation confirms **1,557 unit tests**, **55 core browser checks**, the organic career/retirement/legacy journey, **11 distinct opening/save/accessibility checks**, **two perception cases**, **two emulated performance cases**, both final exports and all six normal Electron source-runtime controls. The ten-season diagnostic completed **460 canonical weeks to season 11** with final invariants passing on the preceding radio-repair export; only guide resumption changed afterward. Critical/retention thresholds, clean installation with zero advisories, assets and locally intercepted Sentry privacy pass. No known P0 or unrepaired P1 source defect was identified in the audited shipping scope. The P2 Desk findings and package/provider/human/hardware/full-soak release gates remain explicit in `PRODUCTION_READINESS_REPORT.md`. Historical failed/interrupted runs remain visible and are not counted as passed suites.
