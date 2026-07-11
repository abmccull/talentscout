# Simulation and Product Testing Strategy

The objective is not maximum line coverage. It is confidence that a ten- or thirty-season career remains causally equivalent, internally valid, migratable and explainable across every way the player advances or saves the game.

## Current test posture

| Check | Review result | What it proves | What it does not prove |
|---|---|---|---|
| `npm run test:unit` | **20/20 passed** in six files | Current transfer tracker, regional knowledge, player lifecycle, loan recommendation, free-agent geography and country-identity invariants pass their narrow cases. | Weekly equivalence, season rollover, observation math, reports, finances, career transitions, migrations, UI or long-run stability. |
| `npm run lint` | **Passed** | Configured lint rules found no violation. | Runtime correctness, unsafe state casts or domain invariants. |
| `npm run typecheck` | **Passed at final verification** in 16.9 seconds | The final observed source satisfies TypeScript checks. | Runtime or simulation correctness. |
| `npm run build` | **Passed at final verification** in 45.3 seconds | Next.js compiled, checked types, generated pages and exported `/play`. | Electron packaging, platform behavior or long-career correctness. |
| Playwright discovery | **235 tests in 48 files listed** | The repository has broad intended UI coverage. | Test existence is not a passing result. |
| Long-career invariant E2E | **Passed in an earlier targeted run** | Its current assertions hold for its seeded scenario. | It uses `batchAdvance`, which is not equivalent to manual simulation; it therefore cannot validate the authoritative world. |
| Full Playwright suite | **Started but failed/stopped before completion** | Eleven distinct tests passed before the stopped run. The mobile dashboard/calendar accessibility case timed out twice at 120 seconds. The freelance career-screen case failed twice because it expects exact standalone text `Freelance Scout`, while the UI renders `Freelance Scout · Independent · Season 1`. A direct rerun reproduced that stale locator. | No pass claim is made for the remaining inventory. An attempted remainder shard exited abnormally after 94 seconds without results. Independent axe capture found no serious mobile dashboard/calendar violation, so its E2E timeout is a harness/flow failure rather than confirmed axe failure. |
| CI workflow | Lint/typecheck only; runs for release tags/manual dispatch, not normal PR/push; no tests | Tagged builds have a minimal compile gate. | Regressions can merge without unit, E2E, simulation, migration or accessibility tests. |
| Coverage | Vitest coverage disabled | Nothing. | Critical branch/invariant blind spots remain unknown. |

## Test architecture prerequisites

Testing will remain fragile until domain execution accepts an explicit context:

```ts
interface SimulationContext {
  rng: SeededRng;
  clock: WorldClock;
  ids: DeterministicIdFactory;
  rulesVersion: string;
}

interface DomainCommand<TPayload> {
  id: string;        // idempotency key
  type: string;
  payload: TPayload;
}

interface CommandResult {
  events: DomainEvent[];
  explanations: OutcomeReason[];
}
```

Tests should compare a **canonical state projection** that removes UI-only/transient ordering but retains all gameplay truth. Every failed deterministic test should print the seed, command sequence, first divergent event and minimal state diff.

## 1. Unit tests

Use table-driven unit tests for pure formulas and validators. These run on every pull request.

### Required formula coverage

- Evidence reliability, independence, context novelty, recency decay and confidence bounds.
- Scout bias application and two-scout disagreement.
- Report craftsmanship, persuasion, conviction calibration and price/value ranges.
- Recommendation-case process and outcome dimensions.
- Club need/candidate-fit scores and budget affordability.
- Reputation vectors, tier gates, job eligibility, review thresholds and recovery.
- Fatigue/recovery, travel duration and workload capacity.
- Salary, recurring expense, debt/interest, report income, placement/sell-on fees and insolvency.
- Player development/decline, injury duration, adaptation and form from authoritative minutes/performance.
- Competition tables, tie-breakers, fixture generation, promotion/relegation pairing and awards.
- Scenario predicates, deadlines, retirement and legacy scoring.
- Every save migration and provider conflict-resolution policy.

### Unit-test quality rules

- Test boundary values and units, not only happy examples.
- Avoid snapshots for numeric rules unless the snapshot is a reviewed distribution/golden model.
- Do not mock a pure dependency that can be called directly.
- Name the business rule in the assertion: `overconfident_low_evidence_report_loses_calibration` is more useful than `returns 42`.

## 2. Property and invariant tests

Use a property-based library such as `fast-check`, with generated states constrained by valid constructors. Failed seeds must be replayable.

### Global state invariants

1. A domain command/event resolves at most once.
2. Every entity ID is unique within its type and every reference resolves or is explicitly tombstoned.
3. No player has incompatible ownership, contract, loan, registration, retired or free-agent states.
4. A player belongs to at most one owning club, at most one temporary loan club and exactly the squads allowed by registration rules.
5. A transfer, loan return, report reward, achievement and scenario outcome can resolve only once.
6. No club belongs to two league seasons of the same competition level at the same time.
7. League membership size is preserved across paired promotion/relegation unless a rule explicitly changes it.
8. Unplayed fixtures do not affect standings, form, awards or history.
9. A match has legal starters, bench, substitutions and minutes; non-participants receive no appearance/rating.
10. The world never produces negative durations, Week 0, expired-but-active contracts or deadlines earlier than creation.

### Money invariants

1. Money cannot be created or destroyed without a recorded transaction source.
2. `endingCash = openingCash + sum(ledgerTransactions)` for scout, agency and every club.
3. One financial event posts once, even after save/reload or command retry.
4. An unaffordable action is rejected before any partial state mutation.
5. Transfer funds paid equal funds received plus explicitly recorded fees/taxes.
6. Salary expense has a matching employee contract and time period.
7. No bid can be made by an actor without authority and a funded account.

### Time and simulation invariants

1. Manual-with-default-decisions, fast-forward and batch advancement yield equivalent canonical state.
2. Advancing N weeks at once equals advancing one week N times.
3. Save/reload between any two commands does not change future results for the same command sequence.
4. A season rollover is idempotent.
5. Every system processes exactly once per world tick, including rivals, finance, contacts, travel, injuries, development, assignments, reports and career reviews.
6. A system scheduled for a future tick never processes early.
7. Competition-specific calendars preserve deadline ordering for 38–46 week schedules.

### Scouting and report invariants

1. N independent atomic readings produce sample count N, never 2N or N².
2. Reapplying the same evidence ID does not change belief/confidence/reward.
3. Confidence is bounded and cannot increase from a strictly less reliable duplicate without a stated contradiction/novelty rule.
4. Hidden truth never appears in player-facing evidence, report preview or explanation.
5. A report can cite only evidence available at its submission tick.
6. A report revision preserves the original artifact and links to it.
7. Report preview values equal committed artifact values for the same nonce/context.
8. Appropriate low confidence cannot be penalized as if it were an inaccurate high-confidence claim.
9. A Recommendation Case links to at most one decision per decision version and preserves rejected/no-action outcomes.
10. Hypothesis transitions require linked evidence and preserve prior text/state.

### Career and relationship invariants

1. Lifetime career totals are monotonic unless a statistic is explicitly reversible.
2. An unemployed scout has no active employer salary, board target or club-only authority.
3. One active employment contract at most; ending it posts salary/access changes once.
4. A promise/favor has one open/fulfilled/broken/expired state.
5. Relationship effects name a source event and stakeholder.
6. A contact memory cannot reference an event from the future or another career.
7. Account-wide achievements and save-local milestones never overwrite each other.

## 3. Model-based state-machine tests

Some systems are better tested as legal transition graphs than as examples.

| State machine | States / transitions to cover |
|---|---|
| Player career | generated→unattached/academy→contracted→loaned→returned→transferred→released→retired; under-18 eligibility and death/tombstone if supported |
| Transfer | interest→offer→negotiation→accepted/rejected/expired→registered; rival and manual commands competing on same player |
| Loan | proposed→active→recalled/expired/bought/cancelled; exactly one terminal event |
| Report | draft→submitted→revised→presented→acted/rejected/expired→checkpoint reviews→closed |
| Employment | freelance→offered→employed→warning/promoted/fired/resigned→unemployed→rehired→retired |
| Relationship promise | proposed→accepted→fulfilled/broken/expired→remembered/decayed |
| Opportunity | discovered→qualified→active→won/lost/expired→outcome; rival heat and access windows |
| Save sync | local-only→dirty→synced→diverged→resolved/deleted; offline/reconnect and tombstone |

Generate command sequences, reject illegal commands with no mutation, and assert invariants after every transition—not only at the end.

## 4. Integration and differential tests

Integration tests should use real reducers/engines and in-memory adapters, not React.

### Canonical weekly pipeline

For a fixed state and command policy:

1. Resolve calendar activities.
2. Commit observation/contact/finance work events.
3. Advance world fixtures, contracts, injuries, development and markets.
4. Process travel, assignments, rivals, narrative chains and relationships.
5. Evaluate reports, career, scenarios and achievements.
6. Run season boundary if due.
7. Post summaries derived from committed events.

Test the phase order explicitly. For example, a transfer accepted this week must not also be processed as an available free agent, and a loan that returns must not be recalled later in the same tick.

### Required differential suites

- Manual default choices vs fast-forward vs N-week batch.
- Fresh run vs save/reload every week vs save/reload at season boundary.
- Browser IndexedDB adapter vs in-memory adapter vs Electron/Steam fake provider.
- Old save migrated once vs migrated, saved and reloaded again.
- Interactive observation vs scheduled abstraction when configured to represent the same work quality.
- Club, freelance, consultant and agency authority applied to the same attempted action.

## 5. Deterministic simulation and golden worlds

Maintain a small versioned corpus of reviewed worlds:

- `tiny-two-league`: fast promotion/transfer invariants.
- `youth-case`: one prospect, multiple observation contexts and a three-year Recommendation Case.
- `rival-race`: two scouts and one closing opportunity.
- `employment-recovery`: hire, failure, firing and rebuilt career.
- `agency-stress`: payroll, employee turnover, delegation and client concentration.
- `international-brief`: travel, access, deliverables and adaptation.
- `legacy-first-career`: retirement and New Game+ transition.

Golden tests should assert selected domain events and invariant summaries, not byte-for-byte full state, so harmless ordering/UI changes do not create noise. Rule changes require an explicit golden-version review and migration note.

## 6. Statistical and balance tests

Determinism does not mean one seed proves balance. Run thousands of seeds headlessly and compare distributions with reviewed bands:

- ability/potential estimation error by scout skill, context count and evidence quality;
- confidence calibration curves: claims at 70% confidence should be correct near 70% over a large sample;
- transfer/loan/free-agent rates by league finances and player age;
- minutes and development by ability, role fit, squad depth and loan level;
- injuries by age/workload/exposure;
- club solvency, wages, fees and free-agent pool size;
- career tier, firing, bankruptcy/recovery and retirement rates;
- rival opportunity win rate and geographic concentration;
- report acceptance/value and stakeholder trust by process quality;
- generated youth quantity/quality by region and season.

Use tolerance bands and distribution tests, not assertions on exact random counts. Store seed samples for every outlier.

## 7. End-to-end player-story tests

E2E tests must prove visible cause and effect through the normal UI. State injection is acceptable to reach a late-game setup, but acceptance must execute the actual player action and inspect resulting persisted state/UI.

### Critical stories

1. **First discovery:** create career→schedule match→choose focus→complete live session→reflect→see exact evidence/note in dossier.
2. **Hypothesis revision:** form a claim→observe in a diagnostic different context→link contradiction→revise opinion→see history preserved.
3. **Professional recommendation:** receive brief→compare candidates→write report→present with conviction→stakeholder acts/rejects→case timeline updates.
4. **Rival race:** both scouts track one player→opportunity clock advances→one wins through real stakeholder/transfer state→loser retains history and relationship effect.
5. **Three-year consequence:** recommended signing experiences minutes, adaptation, injury/development and checkpoint reviews→reputation/trust update with explanation.
6. **Season integrity:** complete a season through normal weekly UI→awards/review→promotion→new table and fixtures→save/reload.
7. **Career setback:** club scout misses targets→warning→firing→loses salary/access→accepts freelance recovery work→later re-enters employment.
8. **Agency delegation:** hire at market salary→assign work→review contradiction/quality→payroll posts→employee develops or leaves.
9. **International assignment:** accept brief→book travel→produce deliverables→return→client review/pay/relationship consequence.
10. **Retirement:** choose to retire→career archive generated→legacy unlock recorded→start second career with selected legal perk.

Run each at desktop and the critical scheduling/reporting steps at 390px mobile. Add keyboard-only variants for planner, report and action inbox.

## 8. Save, migration and provider testing

### Golden migration corpus

Keep anonymized fixtures for every shipped schema version and difficult state:

- mid-week and pre-week checkpoint;
- season boundary;
- active travel/loan/negotiation/employment warning;
- report awaiting validation;
- agency payroll and employee assignment;
- completed/failed scenario;
- old geography/country identifiers;
- duplicate fixtures/reports from known historical defects;
- partially corrupted/truncated record.

For each fixture:

1. Preserve original bytes.
2. Verify checksum/parse or display a recoverable error.
3. Apply each migration exactly once.
4. Assert all invariants.
5. Save/reload the migrated state.
6. Advance at least one week and one boundary event.
7. Record size and load time.

### Provider contract

Run the same CRUD/conflict suite against Dexie, Supabase fake/test project and Steam IPC fake:

- list, create, overwrite, load, rename and delete;
- offline save and retry;
- remote-newer/local-newer conflict;
- corrupt remote record;
- delete tombstone and reconnect;
- quota/full-disk error;
- provider unavailable at launch;
- visible last-sync/error state;
- export/import backup.

Never swallow a failed sync without recording provider status for the player.

## 9. Long-running stability and performance

### Soak lengths

- **1 season:** every PR affecting weekly/season logic.
- **5 seasons:** nightly, all paths and representative league sizes.
- **10 seasons:** nightly invariant and distribution suite.
- **30 seasons:** weekly release candidate soak with save/reload every season and periodic provider conflicts.

### Budgets to establish and enforce

- Week simulation p50/p95/p99 by world size.
- Season rollover time and peak memory.
- Save serialized size, compression ratio, write/load/migration time.
- Player/profile/planner/dashboard render and interaction latency at Years 1, 10 and 30.
- Inbox/history/case query time.
- Entity counts: active players, free agents, retired/tombstoned, fixtures, reports, evidence, memories and transactions.

Fail a soak on:

- any invariant violation;
- NaN/Infinity/negative duration or invalid reference;
- unbounded pool/history growth outside the defined retention model;
- empty required player/club pools;
- runaway balance/reputation/relationship values;
- dead career with no legal action/recovery path;
- p95 regression beyond an agreed threshold;
- save/load semantic difference.

## 10. Accessibility, visual and usability regression

Automate axe and rendered screenshots for:

- main menu and every onboarding step;
- dashboard with/without toast;
- empty, loading, populated and error states;
- planner empty/full/conflicted and mobile;
- observation phases, halftime, reflection and insufficient IP;
- report brief/writer/compare/history;
- player/profile/case timeline;
- inbox action required and background feed;
- save/load/conflict/error;
- career warning/firing/retirement;
- modal, tooltip and keyboard focus states.

Release thresholds:

- zero critical/serious axe violations on critical routes;
- no missing accessible names for interactive controls;
- primary touch targets at least 44×44px or equivalently spaced where WCAG permits;
- full keyboard path with visible focus and correct modal trapping;
- no label/content clipping at 390px, 768px, 1024px and 1440px;
- color-independent status communication and tested color-blind palettes;
- reduced-motion and audio controls honored.

Usability playtests should measure whether a new player can answer:

- What am I deciding this week?
- What remains unknown about this prospect?
- Why did my confidence change?
- What does this client need?
- What will I risk by waiting or recommending?
- Why did the club/player outcome occur?
- Where can I revisit the whole story?

## 11. Electron, packaging and security tests

- Package and launch on Windows, macOS and Linux in the release matrix.
- Verify CSP blocks injected inline/eval/unapproved origins once tightened.
- Verify navigation and external URL allowlists.
- Fuzz preload IPC arguments, paths, key names, achievement IDs and file sizes.
- Enable Electron sandbox and verify all required capabilities still work.
- Simulate Steam unavailable, late initialization, cloud quota and achievement API failure.
- Verify no renderer access to Node, arbitrary filesystem or unrestricted shell.
- Scan artifacts for secrets, placeholder SDK files and source maps that expose sensitive paths.

## 12. CI/CD gate design

### Pull request — required

1. Lockfile install and dependency audit policy.
2. Lint and typecheck.
3. Unit/property/model tests with coverage report.
4. Canonical 1- and 8-week equivalence across a seed shard.
5. Build static app.
6. Targeted Chromium smoke and changed-area E2E.
7. axe on critical routes.
8. Migration fixtures and save roundtrip.

### Main branch — required

- Full 235+ Playwright suite after repair.
- One-season deterministic simulation matrix.
- Visual snapshots at desktop/mobile.
- Electron smoke on at least Windows.
- Upload traces, seed, domain event diff and save fixture on failure.

### Nightly

- 5/10-season multi-seed soaks and statistical bands.
- All desktop platforms.
- Fake Supabase/Steam provider contract.
- Performance and save-size trend report.

### Release candidate

- 30-season soak.
- Full migration corpus from every shipped release.
- Packaged Windows/macOS/Linux install, launch, save, reload and uninstall.
- Real Steam sandbox CRUD/conflict/achievement pass.
- Manual exploratory scripts for first case, season rollover, career setback and retirement.
- No waived P0 invariant failure.

## Coverage policy

Use coverage as a gap detector, not the target. Recommended minimums after refactoring:

- 100% branch coverage for migrations, money posting, idempotency guards and state-machine validators.
- 95%+ branch coverage for calendar arithmetic, competition rollover, evidence aggregation, report commitment and employment transitions.
- 80%+ line/branch coverage for pure engine modules overall.
- UI coverage measured by critical player stories and accessibility states, not component line percentage.

Every production defect in `verified-defects.md` should first receive a failing regression test at the lowest useful layer, then an integration or E2E story where player-facing trust was affected.
