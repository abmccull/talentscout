# Gameplay systems report

Status: **GAME SYSTEMS READY** for the P0 multi-seed S5 joint-registered XI/GK gate plus native IndexedDB S1 restart. Frozen overhaul baseline `2a1e355ad3ef3a47efc614dba73506ae8da976bb`; gate-evidence tip `492317e20e08b39045b5bd30458fe27b4d03e66c` on `cursor/game-systems-ready-path-1752` (base `codex/game-systems-overhaul-20260905`). First green S5 repair stack `b4af6397cff989b2bfb5b3bc69d99c52291a75a1`. Ledger tip `c95dad6f91cc488ac8350b0788b463445263fbb5` (docs-only) on the same branch.

Original systems score: **58/100 (provisional)**.

Final systems score: **not yet assessed for decades acceptance**. P0 S5 joint XI/GK and native S1 restart gates are green on the tip; 20×30 and S10/S30 native restart remain open and are not claimed.

The baseline contains functioning world, report, career and persistence foundations, alongside repaired chronology, claim-polarity and weekly-ownership defects. See GAMEPLAY_SYSTEMS_AUDIT.md for each finding and GAMEPLAY_SYSTEMS_PLAN.md for milestones.

## Implemented systems

- The latest repair wave adds annual recruitment funding, club-relative contract retention, viable transfer selection, guaranteed initial keeper coverage and ordered historical report hydration. Injuries and retainer briefs now have consistent creation/load semantics. Promotion funding preserves debt and recurring capacity across division cycles. These repairs have focused regression evidence; they are awaiting combined long-career and native-provider acceptance.

- Interactive numeric knowledge comes from focused, noticed football events. Hidden ability and potential cannot recenter those estimates. Repeated independent contexts refine confidence; conflicting performances widen uncertainty. Personality clues require supporting evidence.
- A focused glimpse preserves the visit with empty readings and no ability/personality reveal. It supports an honest withheld judgment or private pass. Wholly missed/unfocused outings retain no first-hand observation and route to planning instead of an unfileable form. Halftime guidance explicitly reminds the player to refocus.
- Forecasts use observed attribute coverage, age and longitudinal evidence. Young players retain broad ranges. Development has distinct maturation curves, later goalkeeper maturation and coherent routine/breakthrough/injury application, including older players.
- Match evidence now varies with a stable per-session performance draw, consistency, pressure, form, morale, fatigue, opposition and role. The opening uses generated performances and public lead information; negative evidence can complete the opening.
- A shared action catalog keeps prose, pressure and contributing attributes consistent. Post-session text uses the actual focus, visible cues and authored interpretations. Withholding a conclusion is always available, and unclear cues cannot retain a confident classification.
- Generic activity-quality summaries describe the opportunity for scouting work. They no longer invent player talent, character, conditions or transfer/relationship outcomes from a scout-skill roll. The actual observation and world-event systems retain responsibility for those stories; mechanics and subsequent RNG state are unchanged across 2,400 seeded comparisons.
- The initial assessment's next test now books the chosen activity with its real duration and question. Calendar launches resolve that authored question correctly. Pending weekly activities conceal their outcomes until the approach or live session is resolved.
- A private pass records an immutable judgment without recommendation rewards, automatic follow-up or marketplace eligibility. Fresh evidence permits reconsideration. Existing one/two-season review machinery now closes private/ignored decision loops using later observable results.
- Discovery awards require a documented recommendation before later rated performances. Existing unlock history and achievement identities remain intact. Career Maker requires two sustained standout seasons rather than hidden generational potential.
- Weekly and load operations have invocation ownership. Late responses cannot replace another career or unlock a newer operation. Durable finance and progression decisions use the shared coalesced autosave path.
- Chronology migration repairs ordinal-season birth dates idempotently while preserving historical snapshots. Gameplay rules advance to `youth-ea.5`; save envelopes remain compatible.
- Equipment resale display and execution share a quote. Unsupported salary/lifestyle promises and traced obsolete observation/data/accuracy paths were removed; live children and compatibility fields remain.
- Clubs value reports independently of arbitrary asking prices. Ordinary bids, first counteroffers, exclusive offers and paid welcome bonuses stay tied to report value and buyer budgets. Duplicate sale and private-pass restrictions remain.
- Diagnostics extend the canonical career runner with population distributions and structural invariants, dated retirement participation checks, requested season checkpoints and source fingerprints.
- Season-end contract arbitration settles rejected renewals into real releases, with pool membership and news derived from committed movement. Match selection shares healthy registered eligibility and academy cover across detailed and abstract competition.
- Approved club wage capacity survives vacancies. Promotion/relegation changes funding through its existing atomic transition. A shared wage curve aligns generation and contract negotiations with club level while keeping affordability, player demands and real cash costs.
- Mature loans settle into an actual purchase or return; expired legacy loans retry normally. Loan messages and scouting rewards follow committed movement and history, with duplicate settlement and retirement precedence protected.
- Inconclusive reflection cannot infer a positive or negative judgment from hidden execution. Static phase/venue prose no longer promises talent discovery or weather/lighting unsupported by its inputs.
- Question and focus controls explain the actual skill/lens connection. The searchable planner includes all known active unsigned prospects, and uses the same latest authored judgment as pitch delivery so private passes cannot consume a pitching day.
- The mocked soak provider uses the existing structured-save interface. This eliminates discarded full-state serialization while preserving all persistence-helper calls, deterministic outcomes and explicit save checks; real-provider verification remains separate.

- Annual club recruitment allocations restore a fixed board-approved envelope with bounded carryover and no debt cancellation. Renewals share the generation ability reference; transfers select once among viable packages. Initial squads honor requested size and retain a goalkeeper. Recurring promotion/relegation funding is reciprocal and idempotent.
- New alumni appearances, goals and young-player recognition require dated match evidence. Unsupported call-up/captaincy/Team-of-Week generation and duplicate alumni feedback were removed; historical milestones and contacts remain.
- The calendar now shows only actual reputation/fatigue effects. Its ten decorative or dominated choice sets are suppressed across UI and authority, with no automatic reward and no new simulation invented to justify them.

## Validation ledger

Latest overhaul work is bound to frozen baseline tip `2a1e355ad3ef3a47efc614dba73506ae8da976bb`. P0 gate evidence below was collected on code tip `492317e20e08b39045b5bd30458fe27b4d03e66c` (clean tree); the ledger tip is the docs commit that records this verdict on `cursor/game-systems-ready-path-1752`.

### P0 gate table (evidence tip `492317e`)

| Gate | Result | Evidence |
|---|---|---|
| Multi-seed S5 joint XI/GK | **Passed** — below11reg=0/0/0, noGKreg=0/0/0, viol=0 on seeds 1–3 | `scripts/run-game-systems-diagnostics.mjs --profile=smoke --seasons=5 --seeds=3 --seed-start=1 --checkpoints=1,5 --out=artifacts/release/generated/game-systems/s5-preflight-tip`; diagnostics status `Passed supporting diagnostics`, `sourceUnchanged: true`; run `run-2026-09-08T00-30-44-376Z-646f839d` |
| Supporting determinism replay | **Passed** | Same diagnostics run; seed-1 determinism-replay worker completed; soak status Passed |
| Native IndexedDB S1 restart | **Passed** | `npm run build:e2e` on tip; `SOAK_STORAGE_CHECKPOINT_DIRECTORY` = tip seed-1-run storage-inputs; `npx playwright test e2e/regression/retained-storage-checkpoints.spec.ts -g "completed season 1 survives"` → 1 passed (~1.9m); log `artifacts/release/generated/game-systems/native-s1/console.log` |
| Typecheck | **Passed** | `npx tsc --noEmit -p tsconfig.json` |
| Marketplace relisting freshness | **Invalid / closed** | No new evidence; prior adversarial tests stand |
| Native S10 / S30 | Not run | Only S1 certified this sprint |
| 20×30 | Not run | Explicitly out of scope until after S5 green; still not claimed |

### How native S1 was certified

1. Produce tip-bound S1 storage input: `node scripts/run-game-systems-diagnostics.mjs --profile=smoke --seasons=1 --seeds=1 --checkpoints=1 --out=artifacts/release/generated/game-systems/s1-storage-input` on a clean tree.
2. Build the instrumented export: `npm run build:e2e` (bridge SHA must equal `git rev-parse HEAD`).
3. Run only the season-1 retained-storage case with matching env:
   - `SOAK_STORAGE_CHECKPOINT_DIRECTORY=<.../storage-inputs/<sha>/seed-1-run>`
   - `SOAK_CANDIDATE_SHA` / `SOAK_CANDIDATE_TREE_SHA` = tip
   - `npx playwright test e2e/regression/retained-storage-checkpoints.spec.ts -g "completed season 1 survives"`

### Repair stack closing the S5 gate

Emergency FA restock (cheapest claim, cash-only, `relaxWeeklyWageCap`, orphan restore), journeyman spawn when the pool cannot supply XI/GK, same-tick mid-season/expiry claimability, season-end/loan/transfer outflow-aware depth counts, loan outflow floor guard, and post-`advanceWeek` `repairCompetitiveRosterGaps` on the store weekly progression path. Save migration preserves past-season contact chronology and inbox season-event IDs so native S1 migration digests stay aligned.

The following historical rows describe evidence and limits at each named checkpoint; they do not override the tip gate table above.

| Evidence | Result | Limit |
|---|---|---|
| Planning focused tests | 39 passed | Baseline only |
| Planning canonical season | 1 passed, 46 ticks | Save provider mocked; no decades claim |
| Opening observation → report → booked second look | Played | Existing local export; final candidate unverified |
| Integrated unit suite | 1,828 passed in 327 files on `9ec81eb` | Endurance remains separate |
| Integrated typecheck / architecture | Passed; 724 modules, 3,381 edges, zero cycles | Final export and browser journeys pending |
| Checkpoint `66b51d1` export / browser play | Export passed; guided opening, unguided opening/reload and private-pass save journey passed | Subsequent actual play found pricing, action/narrative and calendar defects; that checkpoint is intermediate |
| Corrected `9ec81eb` export and browser journeys | Export passed; 9 journeys passed across the full run and one corrected-test rerun | The resumed-guide test now compares the actual saved instruction; it no longer assumes a forced opening sequence |
| Intermediate strict canonical season | Passed; 46 ticks, 33,790,364 save bytes | Intermediate source, mocked persistence, no replay or decades claim |
| 5/10/20/30-season diagnostics and replay | Pending beyond S5 | S5 green on tip; longer horizons open |
| Frozen `f0e3309` 20×30 attempt | Failed seed 3 at season 2→3: expired owned contract | No career reached final acceptance; failure retained, repaired candidate must restart |
| Contract settlement regressions | 26 passed across five files; typecheck and architecture pass | Contract-only five-season preflight passed; combined acceptance pending |
| Contract-only preflight | Three seeds plus a fresh reference replay completed five seasons each; matching digest and unchanged source, 920 total ticks | Repeated senior roster attrition exposed a separate economic defect; this source excludes later combined repairs |
| Squad/economy triage | Academy availability discrepancy and vacancy-driven wage-cap cuts reproduced | New combined fixes require long-career distribution validation |
| Combined roster/economy/scouting repair suite | 1,882 tests in 332 files passed; typecheck and architecture passed, 729 modules and zero cycles | Final export, long-career and provider acceptance still pending |
| Combined loan, reflection and atmosphere repairs | 1,892 tests in 334 files passed; typecheck and architecture passed, 730 modules, 3,413 edges and zero cycles | New frozen export and endurance still required |
| Intermediate Morgan Reed/Jesse Rowe playthrough | Three inconclusive cues supported a tentative private report, which booked a real two-day tournament and carried the authored question into the next watch | Reflection prompt defect found and fixed after this preview build; final render remains required |
| Leave-watch and focus selection | Desktop/mobile dialog geometry, cancel-first focus, keyboard wrapping, Escape restoration and explicit discard to unresolved day verified; pending picker shows identity only; no page errors | Intermediate preview, before final combined export |
| Main-thread transport optimization | Rejected: faster probe changed ordered state and failed exact digest | No product integration or relaxed determinism gate |
| Clean `32ed579` export and browser checks | Export passed at 1,047,410 gzip bytes; initial 8/9 journeys passed, unchanged-source traced first-week rerun passed | One startup chunk-loading error is preserved; its underlying transient cause is not established |
| `32ed579` bounded consequence scenario | 122 ticks, unchanged source, both private-pass reviews completed on their due dates | Failed placement coverage: zero eligible pitch attempts; targeted diagnostics/coverage repair required |
| Opening clarity diagnostic | 16 generated careers across four styles; 47/48 focused passages readable with matching questions/lenses; every case filed a tentative private report | Does not guarantee good performances or human comprehension; prompted clearer question/lens guidance |
| Planner reachability regressions | Both hidden-prospect and invalid-pass pitch defects reproduced; corrected focused suite passed | New combined export and final source identity required before decades acceptance |
| Planner and lens integration | 1,904 tests in 336 files passed; the targeted consequence coverage repair additionally passed 30 tests across three files | Scenario execution on the next frozen source remains required; fixture completeness found by integrated typechecking was corrected |
| Further actual-play information boundaries | Pending focus picker no longer exposes future attribute readings; regression passes | Action/category and leave-watch corrections integrated; final export pending |
| Combined roster, save, alumni and season repair checks | 1,993 tests in 343 files passed; full typecheck and architecture passed (732 modules, 3,429 edges, zero cycles); diff check passed | Fresh build, five-season preflight and complete acceptance remain required |
| Frozen overhaul baseline `2a1e355` S5 preflight (seed 1) | below11reg=7, noGKreg=17, viol=0 | Improved vs `48315c3` 16–21 below11reg; multi-seed and ≤0 joint XI/GK not yet met |
| Repair tip `86555a0` full 3-seed diagnostics + determinism replay | Passed supporting; S5 below11reg=5/3/4, noGKreg=3/6/5, viol=0 all seeds | Joint-registered XI / GK coverage still >0; not acceptance |
| Working tip `a29106d` roster/FA/marketplace repairs | Competitive floor helpers, FA urgency, outflow buffer +3, floor renewals, emergency FA restock (cheapest, cash-only + `relaxWeeklyWageCap`, orphan restore), relisting freshness claim closed with tests; typecheck Passed | Full 3-seed S5 on this tip: below11reg=2/4/6, noGKreg=6/6/4, viol=0; still not ≤0 |
| `a29106d` bounded consequence | Passed; 98 ticks, sourceStable | Not a decades or provider claim |
| Repair tip `b4af639` first green S5 stack | Passed supporting; below11reg=0/0/0, noGKreg=0/0/0, viol=0; determinism replay Passed | Post-advance roster repair + loan/outflow/spawn stack; native S1 still needed on later tip |
| Tip `492317e` full 3-seed S5 + determinism | Passed supporting; below11reg=0/0/0, noGKreg=0/0/0, viol=0; `sourceUnchanged: true` | Artifacts under `s5-preflight-tip` |
| Tip `492317e` native IndexedDB S1 | Passed; IndexedDB commit + fresh browser process | Chronology migration preserves past-season contact/inbox dates; S10/S30 not certified |
| Native save-provider S10/S30 | Pending | Required for longer provider claims |
| 20×30 diagnostics and replay | Pending | Not claimed; unblocked by S5 green but not executed here |
| Human comprehension, attachment, repeat play | Pending | Cannot infer from simulation diversity |

## Intermediate world and economy evidence

The first strict season ended with 6,495 active players, 761 available unsigned youth, 815 retained retired players and 282 clubs. Senior rosters ranged from 15 to 27 with no club below eleven players. No new structural invariant failed. Active mean ability was 64.28 and mean potential 78.92; these are changing-cohort measurements, not proof of individual inflation or healthy decades.

The commercial driver accumulated a £229,716 balance through real game actions, with £234,423 positive completed-season cash flows and £8,740 outflows. No harness cash injection was found. Nonexclusive report sales to multiple buyers are a real scale mechanism; a single commercial run does not establish strategy dominance. Positive cash flows are not automatically earned revenue, and first-team transfer accountability records are not youth placement counts. Expanded diagnostics and matched-policy comparisons must resolve those distinctions before tuning.

A separate adversarial report-sale probe reproduced a concrete pricing exploit: a £152 suggested report attracted £214 normally, while a £10,000 ask attracted £14,050 plus a £7,025 welcome bonus from the same buyer. The integrated correction removes the asking-price source of value; store-action regressions verify equivalent bounded payment, bonus and buyer debit for fair and exaggerated asks. Intermediate long runs were stopped rather than treated as acceptance for the corrected source. No progression or expense thresholds were relaxed to hide this defect.

An adversarial marketplace withdraw/relist freshness probe on this tip found no price or prior-buyer payment exploit: listing age only lowers early bid probability, amounts stay ask-capped to assessed value, and prior buyers remain excluded across listings. Relisting freshness remains closed as invalid unless new evidence appears.

## Verdict

**GAME SYSTEMS READY** (P0: multi-seed S5 joint-registered XI/GK + native IndexedDB S1)

Evidence tip `492317e20e08b39045b5bd30458fe27b4d03e66c` on `cursor/game-systems-ready-path-1752` (base `codex/game-systems-overhaul-20260905`; frozen baseline `2a1e355ad3ef3a47efc614dba73506ae8da976bb`). S5 `clubsWithFewerThanElevenRegistered` and `clubsWithoutRegisteredKeeper` are 0 across three seeds with supporting determinism and `sourceUnchanged: true`. Native S1 IndexedDB commit/restart passed on the tip export. Relisting freshness stays invalid/closed. Not claimed: S10/S30 native restart, 20×30, Steam, or main merge.
