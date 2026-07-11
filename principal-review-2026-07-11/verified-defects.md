# Verified Defects and Structural Risks

This register separates reproduced or directly traced defects from likely risks and design weaknesses. Severity describes player/save impact, not implementation effort.

## Severity model

- **Blocker:** current source cannot produce a playable build or a required release path is impossible.
- **Critical:** can invalidate a save, world history, core scouting truth, or a major competitive outcome.
- **High:** breaks a major system, creates a serious exploit, or makes the interface materially misleading.
- **Medium:** creates wrong feedback, lost work, repetition or localized inconsistency.
- **Low:** polish or terminology defect with limited systemic impact.

## Confirmed defects

### TS-001 — CI is not a merge gate and runs no automated tests

- **Severity:** High / P0
- **Reproduction:** Inspect `.github/workflows/build.yml` triggers and the `quality` job.
- **Observed result:** The workflow runs only for `v*` tags or manual dispatch. Its quality job runs TypeScript and lint but neither `npm run test:unit` nor Playwright. Normal pull requests/main pushes have no repository-defined required test workflow.
- **Relevant code:** `.github/workflows/build.yml:1-48`; `package.json` test scripts; `vitest.config.ts`; `playwright.config.ts`.
- **Root cause:** The desktop packaging workflow is serving as the only quality workflow, and test scripts were never added to its gate or to a separate PR workflow.
- **Player impact:** A regression in season rollover, report rewards, career transitions or save migration can merge and remain undiscovered until a release tag—or indefinitely, because tagged CI also omits tests.
- **Recommended fix:** Add required `pull_request` and main-push workflows with lint, typecheck, unit/property, production build, critical E2E and migration/accessibility smoke; retain the full/soak matrix for main/nightly and upload traces/seeds on failure.
- **Automated test:** The workflow is the control: protect main on all required checks and add a deliberately failing canary in CI validation/documentation to prove the gate cannot be bypassed silently.

### TS-002 — Manual and batch advancement produce different worlds

- **Severity:** Critical / P0
- **Reproduction:** Initialize two states with the same seed and starting state. Advance one eight weeks through the authoritative manual path and the other through `batchAdvance(8)`.
- **Observed result:** Both reached Season 1 Week 9. Manual state had £2,470, 43 rival activities and two performance records. Batch state had £2,000, no rival activities and no performance records.
- **Relevant code:** `src/stores/actions/weeklyActions.ts:898-6528` (`advanceWeek`); `src/stores/actions/weeklyActions.ts:6533-6574` (`batchAdvance`); `src/engine/core/quickScout.ts`.
- **Root cause:** `batchAdvanceWeeks` is a second simulation implementation rather than an input adapter over the same weekly domain transaction.
- **Player impact:** Quick simulation, normal play and long-career tests describe incompatible careers. Players can avoid costs/events or lose expected progression by choosing a speed control.
- **Recommended fix:** Delete the parallel world logic. Make every advancement mode submit the same `AdvanceWeekCommand`; only presentation and decision-default policies may differ. Commit each week atomically and expose a domain-event audit log.
- **Automated test:** Property test across at least 100 seeds asserting canonicalized state equality for manual-with-default-decisions, fast-forward and batch for 1, 8, 38 and 100 weeks.

### TS-003 — Season rollover duplicates fixtures and contaminates the next season

- **Severity:** Critical / P0
- **Reproduction:** Start a generated world, record fixture count, advance across season end, and rebuild Season 2 Week 1 standings.
- **Observed result:** Fixtures increased from 2,036 to 4,072. A lower-league Season 2 table already contained a played match at Week 1.
- **Relevant code:** `src/stores/actions/weeklyActions.ts:5987-6011`; `src/engine/world/fixtures.ts`; `src/engine/core/standings.ts:37-56`; duplicate initialization in `src/stores/gameStore.ts:1751-1804`.
- **Root cause:** New fixtures are spread into the existing global fixture map and standings do not consistently scope results by competition season. Fixture initialization exists in more than one place.
- **Player impact:** Tables, records, loans, awards and histories become invalid after one season; save size grows unnecessarily every rollover.
- **Recommended fix:** Introduce `CompetitionSeason` and `Fixture.seasonId`. Close/archive the prior competition, generate exactly one new fixture set, and query standings only by current `competitionSeasonId`. Make rollover idempotent.
- **Automated test:** Golden two-season test asserting expected fixtures per league, zero Season 2 games before Week 1 processing, unique fixture IDs and stable count after re-running rollover.

### TS-004 — Promotion and relegation do not change league membership

- **Severity:** Critical / P0
- **Reproduction:** Force a tier-one bottom club and tier-two top club, run end-of-season relegation processing, then inspect `league.clubIds` and generated next-season fixtures.
- **Observed result:** Messages and reputation/availability consequences are generated, but club membership remains unchanged and the same clubs receive next-season fixtures in the same leagues.
- **Relevant code:** `src/engine/world/relegation.ts:135-288`, especially `applyRelegationResults`; fixture generation in `src/stores/actions/weeklyActions.ts:5987-6008`.
- **Root cause:** The apply stage treats movement as a cosmetic consequence rather than a structural mutation of league/club membership and history.
- **Player impact:** The football pyramid never evolves. Club status, recruitment needs, player ambition and career stories based on promotion/relegation are false.
- **Recommended fix:** Atomically swap club IDs between paired competitions, write a season history record, recalculate reputation/budgets/needs, and generate fixtures from the new membership.
- **Automated test:** Two-tier invariant test asserting equal league sizes, each club in exactly one league, promoted/relegated club membership changed, and next-season fixtures use the new set.

### TS-005 — Observation counts grow exponentially

- **Severity:** Critical / P0
- **Reproduction:** Observe the same attribute in successive sessions and inspect each new `AttributeReading.observationCount`.
- **Observed result:** Counts progress 1, 2, 4, 8, 16 rather than increasing by one independent reading.
- **Relevant code:** `src/engine/scout/perception.ts:347-354`, storage at `:454-465`; mirrored logic at `:570-576` and `:634-647`.
- **Root cause:** Each new session sums `observationCount` from every prior cumulative reading. Historical cumulative totals are treated as independent increments.
- **Player impact:** Attribute ranges narrow far too quickly; confidence, report quality and progression are invalid; repeated viewing becomes an exploit.
- **Recommended fix:** Store atomic evidence readings or keep one aggregate per player/attribute. Never sum historical aggregates. Add context novelty and independent-source weighting separately from raw sample count.
- **Automated test:** Sequence test asserting N independent observations yield count N, duplicates of the same evidence ID are idempotent, and context diversity affects confidence without changing sample count.

### TS-006 — Duplicate report submission overwrites history while incrementing rewards

- **Severity:** Critical / P0
- **Reproduction:** Submit two reports for the same scout, player, season and week from the manual report writer.
- **Observed result:** Both reports generate the deterministic ID `report_<scout>_<player>_s<season>w<week>`. The map entry is overwritten while report completion statistics/rewards can increment again.
- **Relevant code:** `src/engine/reports/reporting.ts:672-709`; `src/stores/actions/reportActions.ts:42-119` and report/stat mutations around `:303-319` in the reviewed implementation.
- **Root cause:** The report ID encodes a time bucket, not an immutable submission/version, and `submitReport` lacks an idempotency or weekly-work guard.
- **Player impact:** Players can farm reputation/income, lose report versions and corrupt accuracy statistics. Historical accountability disappears.
- **Recommended fix:** Create immutable report version IDs from a deterministic command/event ID; make resubmission an explicit revision linked to the previous report; consume a work slot or assignment capacity; apply rewards once.
- **Automated test:** Submit/retry property test asserting a command resolves once; an intentional revision creates a distinct linked version; career stats equal unique accepted submissions.

### TS-007 — Report preview, stored craft and marketplace price disagree

- **Severity:** High / P1 integrity
- **Reproduction:** Build a report, compare writer craft/price before submission, submit, open Report History, then list it.
- **Observed result:** In the played case, “Recommend” previewed craft 59 and about £736; Report History stored craft 52; the listing suggested about £689. “Note” previewed the higher craft score (63) but a much lower immediate price than “Recommend.”
- **Relevant code:** `src/components/game/ReportWriter.tsx`; `src/stores/actions/reportActions.ts`; `src/engine/reports/reporting.ts`; `src/engine/finance/reportMarketplace.ts`.
- **Root cause:** UI preview, submission craftsmanship and marketplace valuation recompute overlapping concepts through different formulas/inputs. Conviction is also treated as a direct price amplifier rather than a calibrated claim.
- **Player impact:** The player cannot learn the report system and is pushed toward overclaiming for money even when craftsmanship falls.
- **Recommended fix:** Produce one server/domain `ReportEvaluationPreview` and commit exactly that result with a nonce; separate artifact quality, persuasiveness, evidence calibration and sale price.
- **Automated test:** Snapshot the preview, submit with its nonce, and assert stored craft/estimated value/listing base values match; separately test stakeholder-dependent bids.

### TS-008 — Rival counter-bids are cosmetic and ignore money, club and transfer state

- **Severity:** Critical / P0
- **Reproduction:** Trigger a rival poach event while freelance with £2,000 and no employing club; choose Counter-Bid on a high-value player.
- **Observed result:** A £41,276,391 bid succeeded. No money was deducted, no player moved, and the message said the player “will join your club.”
- **Relevant code:** `src/engine/rivals/rivalScouts.ts:752-800`; event creation in `src/stores/actions/weeklyActions.ts:4914-4966`; response in `src/stores/actions/progressionActions.ts:699-741`.
- **Root cause:** `resolvePoachCounterBid` calculates probability/cost, but the store action applies only narrative/stat changes. No mandate, solvency, contract or player lifecycle transaction is invoked.
- **Player impact:** The flagship rival system breaks role fantasy and world credibility; impossible free transactions become a dominant response.
- **Recommended fix:** Replace the choice with role-appropriate actions—alert client, strengthen recommendation, use a contact, concede—then let an authorized club submit an atomic transfer command under budget/contract rules.
- **Automated test:** For each career path, assert unauthorized actions are unavailable; authorized bid success deducts funds once, updates contract/squad/history once, and rival ownership resolves once.

### TS-009 — Non-Ironman firing leaves impossible employment state

- **Severity:** High / P0
- **Reproduction:** Put a club-employed non-Ironman scout below the firing threshold and process the review/tick.
- **Observed result:** The firing outcome is generated, but the scout can retain club, salary and/or club career-path fields.
- **Relevant code:** `src/engine/career/progression.ts:284-398`; application in `src/stores/actions/weeklyActions.ts:5655-5739`.
- **Root cause:** Firing is modeled as an outcome/message without a single employment-state transition that clears all mutually dependent fields.
- **Player impact:** Salary and club access can continue after dismissal; subsequent reviews and offers operate on contradictory state.
- **Recommended fix:** Create an `EndEmployment` domain transaction that clears employer, salary, contract, board/manager context, assignments and path-specific privileges, while preserving career history and applying recovery status.
- **Automated test:** State-machine test for hired→warning→fired→unemployed→rehired, asserting all contract invariants at each transition for Ironman and normal modes.

### TS-010 — Accepting a job can reset lifetime career statistics

- **Severity:** High / P0
- **Reproduction:** Give a freelance scout non-zero lifetime stats, accept a club job, and compare the career counters used by progression/legacy.
- **Observed result:** The job transition initializes club-context statistics in a way that erases or replaces lifetime values.
- **Relevant code:** `src/stores/actions/progressionActions.ts:210-295`; career state types and review context in `src/engine/career/seasonReviewContext.ts`.
- **Root cause:** Lifetime identity metrics and contract/season objectives share overlapping fields and initialization logic.
- **Player impact:** The career forgets prior discoveries/reports, corrupting tiers, achievements, legacy and the central fantasy of a reputation built over time.
- **Recommended fix:** Separate immutable/lifetime `CareerRecord`, per-employment `EmploymentRecord`, and per-season `ReviewRecord`; never zero lifetime counters during a contract transition.
- **Automated test:** Transition matrix across freelance→club→unemployed→agency asserting lifetime counters are monotonic and contract counters reset only where specified.

### TS-011 — Under-18 permanent transfers can disappear from senior simulation

- **Severity:** High / P0
- **Reproduction:** Complete a permanent transfer for a player under 18 and inspect the destination club arrays and subsequent match participant lookup.
- **Observed result:** The player is added to `academyPlayerIds`; match simulation reads `club.playerIds`, so the player is absent from senior match/rating logic.
- **Relevant code:** `src/engine/world/playerLifecycle.ts:142-160`; senior match lookup `src/engine/core/gameLoop.ts:551-565`.
- **Root cause:** Academy registration and contractual ownership are conflated, and match selection has no pathway/eligibility model.
- **Player impact:** A marquee youth signing can vanish from the simulated career, blocking appearances, development evidence and report validation.
- **Recommended fix:** Model registration/ownership separately: one owning club, one squad assignment, eligibility and promotion/loan events. Report outcomes must use the player's actual pathway.
- **Automated test:** Youth-transfer lifecycle test: sign at 16, remain academy-registered but owned, promote/loan at the proper event, and appear only when selected/eligible.

### TS-012 — Every fit senior player participates in every match

- **Severity:** High / P0
- **Reproduction:** Simulate a fixture for a club with more than 11 fit senior players and inspect `playerRatings`/appearance records.
- **Observed result:** All fit IDs in both `club.playerIds` arrays are passed to rating generation and receive match participation data.
- **Relevant code:** `src/engine/core/gameLoop.ts:551-565`; rating/history application around `:2848-2873`.
- **Root cause:** Club roster is used as lineup. There is no XI, bench, substitution, minutes or role selection.
- **Player impact:** Form, development, injuries, value, loans and report outcomes cannot distinguish starters from unused players; the world produces impossible appearance totals.
- **Recommended fix:** Add a deliberately lightweight selection model: XI, bench, substitutions, minutes, role and level. It need not become tactical match control; it must support scouting context.
- **Automated test:** For each fixture, assert exactly 11 starters per eligible side, substitutions within rules, minutes sum within tolerance, and non-participants receive no appearance/rating.

### TS-013 — Form momentum cannot start correctly and is calculated from two ratings

- **Severity:** High / P0
- **Reproduction:** Simulate successive strong matches from `formTrend='stable'`, inspect momentum, and compare the rating used by `computeFormMomentum` with the stored match rating.
- **Observed result:** Stable state assigns `consecutiveHot = 1` each time, so the four-match threshold cannot accumulate. The function generates a fresh Gaussian rating even though the fixture already has a player rating, then later applies actual match ratings elsewhere.
- **Relevant code:** `src/engine/core/gameLoop.ts:638-752`; stored rating application around `:2848-2873`.
- **Root cause:** Streak history is not stored independently and form processing does not consume the authoritative match-performance event.
- **Player impact:** Displayed form and development/scouting context are arbitrary; players cannot explain career arcs.
- **Recommended fix:** Derive form once from actual selected-player performance events and persist a bounded recent-rating sequence or explicit streak counter.
- **Automated test:** Deterministic rating sequences (four hot, four cold, interrupted streak, no appearance, injury) with exact expected trend/momentum/form.

### TS-014 — Hypotheses persist but can never be resolved through gameplay

- **Severity:** High / P1
- **Reproduction:** Add a hypothesis during observation/reflection, complete sessions with relevant evidence, and inspect hypothesis state over subsequent weeks.
- **Observed result:** Text persists, but no engine caller updates evidence or moves it to supported/contradicted/confirmed/debunked states.
- **Relevant code:** serialization in `src/stores/actions/observationActions.ts:46-77`, input at `:582-588`, reflection at `:355-393`; hypothesis functions in `src/engine/observation/session.ts` have no consumer.
- **Root cause:** The durable journal schema was connected, but the evidence-to-hypothesis transition was never integrated with session completion.
- **Player impact:** One of the most distinctive intended scouting mechanics is a notes field disguised as a system.
- **Recommended fix:** Every evidence item may support, contradict or remain irrelevant to a selected hypothesis; require player confirmation of interpretation and preserve revisions.
- **Automated test:** Create hypothesis, observe supporting and contradictory diagnostic contexts, assert evidence links and state transitions, save/reload, and verify history.

### TS-015 — Analysis mode permits repeat IP farming

- **Severity:** High / P1
- **Reproduction:** Enter analysis observation mode and select the same data point repeatedly.
- **Observed result:** The action continues to award IP because selected/consumed data points are not guarded as unique evidence.
- **Relevant code:** `src/stores/actions/observationActions.ts:802-822`; `src/engine/observation/analysis.ts`.
- **Root cause:** Reward is attached to action execution rather than first interpretation of a unique data point.
- **Player impact:** Insight economy and specialization progression can be trivialized.
- **Recommended fix:** Assign immutable evidence IDs and make interpretation idempotent. Reward comparison, contradiction or a correct inference—not repeated selection.
- **Automated test:** Fuzz repeated selection order and assert total reward never exceeds the sum of unique eligible evidence rewards.

### TS-016 — Gossip generator and UI use disconnected state

- **Severity:** High / P1
- **Reproduction:** Generate contact gossip during weekly processing, then call the UI selector/action path for active gossip.
- **Observed result:** Contact generation writes `contact.gossipQueue`, while the action/UI path reads `gossipItems`; generated gossip is not reliably actionable. “Watch” has no stateful follow-up and “act” is largely a bookmark.
- **Relevant code:** `src/engine/network/contacts.ts`; `src/engine/network/gossip.ts`; `src/stores/actions/progressionActions.ts:335-370`.
- **Root cause:** Parallel gossip schemas were introduced without a normalization/migration boundary.
- **Player impact:** Contact intel disappears or appears inert, weakening relationship value and opportunity timing.
- **Recommended fix:** One `IntelLead` entity with source, reliability, expiry, linked player/opportunity and explicit available actions.
- **Automated test:** Generate→list→watch/act/dismiss lifecycle test, including expiry and save/reload.

### TS-017 — International assignments auto-complete without a deliverable

- **Severity:** High / P1
- **Reproduction:** Accept an international assignment, book the trip and advance until return without producing the requested reports/evidence.
- **Observed result:** Assignment rewards/completion are granted when travel ends.
- **Relevant code:** `src/engine/world/international.ts`; `processInternationalTravelLifecycle` call in `src/stores/actions/weeklyActions.ts:5195-5198`; booking in `src/stores/actions/progressionActions.ts:515-603`.
- **Root cause:** Travel completion is used as assignment completion; no brief/deliverable quality state exists.
- **Player impact:** Expensive international work is a timer purchase rather than a high-stakes scouting contract.
- **Recommended fix:** Add assignment brief, required evidence/targets, due date, client quality threshold and review. Travel enables the work; it does not complete it.
- **Automated test:** Return with zero/partial/complete deliverables and assert failure, partial payment or success plus relationship effects.

### TS-018 — Balance changes are not represented in the finance ledger

- **Severity:** High / P0 integrity
- **Reproduction:** Sell/list a report through normal early play, advance, compare `balance` with Financial Dashboard revenue history.
- **Observed result:** Balance rose from £2,000 to £2,600, while the dashboard reported “No income recorded this period.” Revenue history represented placement fees but not the observed report sale.
- **Relevant code:** `src/engine/finance/reportMarketplace.ts`, `placementFees.ts`, `src/engine/finance/index.ts`; finance UI and `src/stores/actions/financeActions.ts`.
- **Root cause:** Subsystems mutate balance directly and only some also append a transaction/history record.
- **Player impact:** The player cannot audit solvency or understand success; money can be created/destroyed without an explainable source.
- **Recommended fix:** Prohibit direct balance mutation. Every movement posts one immutable `FinancialTransaction` with source entity/event and resulting balance; derive dashboard totals from it.
- **Automated test:** Money-conservation invariant: ending cash = opening cash + sum(all posted transactions); every non-zero change has one source event and replay is idempotent.

### TS-019 — Seasonal modifiers are displayed but mostly inert

- **Severity:** High / P1
- **Reproduction:** Choose seasonal events that grant non-reputation/non-fatigue modifiers and compare affected engine calculations before/after.
- **Observed result:** Declared modifiers are stored/displayed, but roughly six categories have no downstream consumer; only a small subset changes outcomes.
- **Relevant code:** `src/engine/core/seasonEvents.ts`; resolution in `src/stores/actions/weeklyActions.ts:888-897` and weekly consumers.
- **Root cause:** The event schema expanded faster than domain calculation hooks.
- **Player impact:** Choices advertise trade-offs that do not exist, teaching the player not to trust event text.
- **Recommended fix:** Create a typed modifier registry where every modifier declares affected calculation, stacking rule, duration and explanation; fail tests/build for unregistered consumers.
- **Automated test:** Table-driven test for every modifier asserting at least one deterministic input changes and expiry restores baseline.

### TS-020 — Agency salaries and analyst quality are exploitable/inert

- **Severity:** High / P1
- **Reproduction:** Hire an employee, set salary to £1, run assignments; compare retention/morale and analyst-quality output with and without the calculated boost.
- **Observed result:** £1 salary carries no morale/retention/performance consequence, and analyst quality improvement is computed but discarded.
- **Relevant code:** employee actions in `src/stores/actions/financeActions.ts:318-429`; `src/engine/finance/agency.ts`; weekly agency processing.
- **Root cause:** Salary is only an expense field and one result path fails to apply its returned quality value.
- **Player impact:** Optimal agency play is absurdly low wages; hiring/skill decisions do not reliably affect work quality.
- **Recommended fix:** Enforce market salary bands, satisfaction/retention and employment contracts; thread analyst modifiers into the report/evidence artifact actually committed.
- **Automated test:** Salary boundary and retention property tests; paired assignment test asserting higher qualified analyst changes committed evidence quality within bounded variance.

### TS-021 — Steam cloud is written but not part of active load/list/delete lifecycle

- **Severity:** High / P0 data integrity
- **Reproduction:** Inspect active provider configuration and persistence paths; save/delete/load with Steam available.
- **Observed result:** `db.saveGame` mirrors a serialized record to Steam when available. `getActiveSaveProvider()` sets `includeSteam:false`; local `listSaves`, `loadGame` and `deleteSave` use Dexie only.
- **Relevant code:** `src/lib/db.ts:113-159`; `src/lib/activeSaveProvider.ts:4-15`; `src/lib/saveProvider.ts` Steam branches.
- **Root cause:** A legacy direct Steam write coexists with a provider abstraction configured to exclude Steam.
- **Player impact:** A player can believe a save is in Steam Cloud but be unable to discover/restore it through the game; deletion and conflict behavior diverge.
- **Recommended fix:** Choose one provider authority. Either remove the mirror and label cloud unavailable, or enable a conflict-aware Steam provider with list/load/save/delete parity and tombstones.
- **Automated test:** Fake Steam adapter contract suite for create/list/load/update/conflict/delete/offline/reconnect; package-level smoke in Electron.

### TS-022 — Legacy completion is circular and ordinary retirement is absent

- **Severity:** High / P1
- **Reproduction:** Start with no legacy profile and inspect advanced scenario unlock/completion conditions. Attempt to complete a normal career.
- **Observed result:** A represented completion requires `the_last_season`; that scenario unlocks only after `bestLegacyScore >= 60`, which requires an already completed career. Ordinary careers have no separate retirement marker.
- **Relevant code:** `src/engine/career/legacy.ts:156-220`; `src/engine/scenarios/scenarioDefinitions.ts:398+`; completion call in `src/stores/gameStore.ts:1914-1940`.
- **Root cause:** The only terminal marker is itself gated by prior terminal history.
- **Player impact:** New Game+/legacy cannot start for a first-time player and a long career has no satisfying, safe ending.
- **Recommended fix:** Add an explicit `CareerRetired` event reachable by player choice after a minimum tenure or by defined scenario/failure rules; calculate legacy from the completed archive, then unlock retirement challenges.
- **Automated test:** Fresh-profile first completion, subsequent New Game+, repeated completion idempotency and legacy-profile migration tests.

### TS-023 — Achievements leak across saves and can unlock at career creation

- **Severity:** High / P1
- **Reproduction:** Unlock achievements in one career, start another, or create a fresh career and observe initial achievement checks.
- **Observed result:** Achievements persist globally in `localStorage`; fresh careers displayed achievements not earned in that save. In observed runs, Specializing appeared immediately, and one development run surfaced travel/network achievements before travel.
- **Relevant code:** `src/stores/achievementStore.ts:21-66,111-170`; `src/lib/achievements.ts`; toast integration.
- **Root cause:** Save-local progress, account/platform achievements and cross-career legacy are represented by one global unlocked set; initialization checks include default/generated starting state.
- **Player impact:** Career identity and challenge integrity are lost; toasts obscure onboarding and communicate false accomplishments.
- **Recommended fix:** Separate save-local milestones, account-wide achievements and Steam unlock state. Record `AchievementUnlock` with career ID and qualifying event; do not infer from default state without an earned transition.
- **Automated test:** Two-save isolation test, new-career zero-transition test, event-qualified unlock test and Steam synchronization idempotency.

### TS-024 — Incompatible 38-week assumptions exist in a variable-length world

- **Severity:** High / P0 simulation
- **Reproduction:** Generate a league whose schedule spans 46 weeks, then inspect free-agent/transfer deadlines, marketplace expiry, board deadlines, economic events and batch projection across Week 38.
- **Observed result:** Multiple systems wrap or clamp at 38 while fixtures continue to 46.
- **Relevant code:** `src/engine/freeAgents/negotiation.ts:35,117-118`; `src/engine/firstTeam/negotiation.ts:42,224-225`; `src/engine/core/quickScout.ts:618-625`; `src/engine/events/economicEvents.ts:142`; `src/engine/finance/reportMarketplace.ts:344`; `src/engine/firstTeam/boardAI.ts:358`; `src/engine/core/seasonEvents.ts:571`.
- **Root cause:** Season time is encoded as `(season, week)` plus scattered constants rather than one calendar/competition clock.
- **Player impact:** Deadlines, loans, listings, events and negotiation windows can expire early, wrap incorrectly or become unreachable.
- **Recommended fix:** Introduce an absolute `WorldDate`/tick and competition-specific calendars. Derive display season/week; never perform domain arithmetic with hard-coded season length.
- **Automated test:** Boundary properties across 38-, 40-, 44- and 46-week calendars for deadline ordering, remaining duration and rollover.

### TS-025 — Loan recall and natural return can resolve in the same tick

- **Severity:** High / P0 state integrity
- **Reproduction:** Schedule a recall in the same week a loan reaches its natural end and process the weekly lifecycle.
- **Observed result:** Both paths can attempt to resolve because they do not share one state-machine/idempotency guard.
- **Relevant code:** `src/engine/world/loans.ts`; `src/engine/firstTeam/loanIntegration.ts`; recall action `src/stores/actions/financeActions.ts:1029+`.
- **Root cause:** Return and recall are parallel event paths over mutable deal flags.
- **Player impact:** Duplicate messages/rewards, invalid squad membership or a player moved twice.
- **Recommended fix:** One `LoanDeal` state machine and one terminal transition selected by event priority; subsequent commands become no-ops with recorded reason.
- **Automated test:** Property test that every loan has exactly one terminal event across recall, expiry, permanent transfer, cancellation and save/reload retries.

### TS-026 — Insight affordability and several activity interfaces are misleading

- **Severity:** Medium / P3
- **Reproduction:** Open Insight with 0 IP; click a 20–30 IP action. Run a Network Meeting. Run Focus Prospect selecting one target.
- **Observed result:** Expensive insight buttons appear enabled and close silently; networking can append unrelated “Cast Wide Net” prose and a Live Session affordance; one chosen focus target resolved as two.
- **Relevant code:** `src/components/game/ObservationScreen.tsx`; `src/stores/actions/observationActions.ts:696-778`; calendar activity UI/resolvers in `src/components/game/calendar/*` and `src/stores/actions/weeklyActions.ts:7026+`.
- **Root cause:** UI enablement, generic activity templates and resolver defaults do not share validated command contracts.
- **Player impact:** Players cannot tell whether actions worked and lose trust in planning choices.
- **Recommended fix:** Every control binds to a validated command preview with cost, eligibility, exact target set and expected category of result; rejected commands return inline reasons.
- **Automated test:** Component/E2E tests for affordability disabled state, exact selected-target propagation, and activity-type-specific copy/action availability.

## Likely technical risks — not claimed as reproduced corruption

| Risk | Evidence | Potential impact | Recommended control |
|---|---|---|---|
| **Versionless full-state saves** | `GameState` is serialized wholesale; Dexie has DB versions, but loaded state uses presence-based `migrateSaveState` and broad casts. | Old saves may silently acquire invalid defaults or fail after field-shape changes. | Add `saveSchemaVersion`, sequential pure migrations, golden save fixtures and rollback backups. |
| **Unbounded save/storage growth** | Full object graph includes fixtures, inbox, reports, histories, events and generated entities; only selected arrays are capped. | IndexedDB/Steam limits, slow serialization, long load times and memory pressure in long careers. | Retention policy, immutable history compaction, size telemetry and 30-season soak budgets. |
| **Non-deterministic identity/order** | 29 reviewed hotspots use `Math.random`, `Date.now` or random UUID-like generation outside the seeded RNG. | Save/reload changes ordering/outcomes; flaky tests and unreplayable bugs. | Inject RNG/clock/ID factory into all domain functions; persist command/event IDs. |
| **Oversized transaction modules** | `weeklyActions.ts` >7,500 lines, `core/types.ts` >4,000, `gameLoop.ts` >3,000, multiple screens >1,500. | Missed consumers, circular behavior, broad rerenders and unsafe refactors. | Extract bounded contexts and typed events after locking behavior with characterization tests. |
| **Broad Zustand subscriptions / large React screens** | UI reads large game-state slices and giant components compose many derived views. | Planner/profile/dashboard rerender cost grows with world size. | Selector audit, memoized entity indexes, virtualized lists and React profiler budgets. |
| **Electron sandbox/CSP** | `contextIsolation:true` and `nodeIntegration:false` are positive; `sandbox:false`, permissive `unsafe-inline`/`https:` CSP remain. | A future renderer injection has a larger blast radius. | Enable sandbox, tighten CSP with nonces and explicit endpoints, retain URL allowlist/preload validation. |
| **Silent cloud failure** | Steam write exceptions are swallowed; Supabase is disabled. | Player believes data is protected when it is only local. | Surface provider status, last successful sync, retry/conflict state and export backup. |
| **OneDrive/source volatility** | During review, `CalendarScreen.tsx` temporarily appeared deleted and the dev server produced source-read failures; the file later reappeared and final typecheck/build passed. | Unreliable local builds, flaky test runs and accidental worktree loss. | Develop from a non-synced working copy or configure OneDrive availability; add clean-clone/repro checks and avoid treating transient absence as a committed deletion. |

## Verified design weaknesses — behavior works, but the decision is weak

| Weakness | Evidence | Product consequence |
|---|---|---|
| **Report lacks a brief and audience** | Writer asks for summary, evidence snippets and conviction only. | “Good player” dominates “right player for this club, role, price and moment.” |
| **Conviction is monetized more than calibrated** | Higher conviction raised price despite lower craft in normal play. | Overclaiming becomes economically rational; professional caution has little identity. |
| **Contacts lack episodic memory** | Trust/access values change, but specific favors, promises and failures are not a durable primary model. | Politics cannot generate long stories or stakeholder conflict. |
| **Progression increases volume** | New activities, tools, territories and employees unlock. | Senior careers add administration instead of shifting to portfolio judgment and organizational accountability. |
| **Geography is mostly pool/access math** | Countries alter players, cost and knowledge more than scouting cultures, documentation, source networks or adaptation questions. | Replays have different names and prices rather than different professional methods. |
| **Notifications substitute for consequence** | Rivals, seasonal events and some narrative chains deliver rich prose without corresponding transactions. | Initial drama converts to disbelief. |
| **Outcome evaluation is truth-centric** | Delayed validation measures estimates versus hidden ability/potential. | A wrong-club signing of a good player is rewarded; good process with injury bad luck is punished. |
