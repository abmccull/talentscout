# Gameplay systems report

Status: implementation in progress. Frozen overhaul baseline `2a1e355ad3ef3a47efc614dba73506ae8da976bb`; working tip `a29106de7a4dadb45abdccf18dc3c0828f09f517` on `cursor/game-systems-ready-path-1752` (base `codex/game-systems-overhaul-20260905`).

Original systems score: **58/100 (provisional)**.

Final systems score: **not yet assessed**. Five-season preflight improved but is not green (joint XI / GK gaps remain); native IndexedDB restart and 20×30 acceptance are still open.

The baseline contains functioning world, report, career and persistence foundations, alongside reproduced chronology, claim-polarity and weekly-ownership defects. See GAMEPLAY_SYSTEMS_AUDIT.md for each finding and GAMEPLAY_SYSTEMS_PLAN.md for milestones. The source changes, including the additional report-lifecycle and native-order repair in SYS-63, are integrated locally. Combined checks passed: 1,993 tests in 343 files, full typecheck, and architecture validation with 732 modules, 3,429 edges and zero cycles. Final build and career acceptance have not begun for this candidate.

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

Latest overhaul work is bound to frozen baseline tip `2a1e355ad3ef3a47efc614dba73506ae8da976bb` and working PR tip `a29106de7a4dadb45abdccf18dc3c0828f09f517` on `cursor/game-systems-ready-path-1752`. This sprint does not certify READY.

Preflight progress: on `2a1e355` seed 1, S5 below11reg=7 and noGKreg=17 with viol=0 (improved from 16–21 below11reg on prior `48315c3`). On `86555a0`, full three-seed diagnostics plus supporting determinism replay Passed: S5 below11reg=5/3/4, noGKreg=3/6/5, viol=0 on all seeds. On `a29106d`, full three-seed diagnostics plus determinism replay Passed supporting: S5 below11reg=2/4/6, noGKreg=6/6/4, viol=0 on all seeds. Joint-registered XI and GK coverage are still not ≤0.

Fixes in this wave: competitive roster floor helpers, free-agent urgency, outflow buffer +3, floor-preserving renewals, emergency free-agent restock (cheapest claim, cash-only gate, lifecycle `relaxWeeklyWageCap`, no pre-apply signed orphaning), and marketplace relisting freshness closed as invalid with adversarial tests. Bounded consequence Passed (98 ticks, sourceStable) on this tip. Typecheck Passed. Native IndexedDB S1 is not certified this sprint (tooling and S1 soak storage inputs exist; clean export + browser restart evidence was not completed here).

The following historical rows describe evidence and limits at each named checkpoint; they do not certify the new source candidate.

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
| 5/10/20/30-season diagnostics and replay | Pending | Required |
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
| Native IndexedDB S1 / 10 / 30 restart | Not certified this sprint | Tooling exists; S1 soak storage inputs present; clean export + browser restart not completed |
| Native save-provider endurance/recovery | Completed-season 1/10/30 exact commits and whole-browser restarts pending | Required; separate from mocked soak and ordinary save journeys |
| 20×30 diagnostics and replay | Pending | Required; blocked until S5 joint XI/GK gate is green |
| Human comprehension, attachment, repeat play | Pending | Cannot infer from simulation diversity |

## Intermediate world and economy evidence

The first strict season ended with 6,495 active players, 761 available unsigned youth, 815 retained retired players and 282 clubs. Senior rosters ranged from 15 to 27 with no club below eleven players. No new structural invariant failed. Active mean ability was 64.28 and mean potential 78.92; these are changing-cohort measurements, not proof of individual inflation or healthy decades.

The commercial driver accumulated a £229,716 balance through real game actions, with £234,423 positive completed-season cash flows and £8,740 outflows. No harness cash injection was found. Nonexclusive report sales to multiple buyers are a real scale mechanism; a single commercial run does not establish strategy dominance. Positive cash flows are not automatically earned revenue, and first-team transfer accountability records are not youth placement counts. Expanded diagnostics and matched-policy comparisons must resolve those distinctions before tuning.

A separate adversarial report-sale probe reproduced a concrete pricing exploit: a £152 suggested report attracted £214 normally, while a £10,000 ask attracted £14,050 plus a £7,025 welcome bonus from the same buyer. The integrated correction removes the asking-price source of value; store-action regressions verify equivalent bounded payment, bonus and buyer debit for fair and exaggerated asks. Intermediate long runs were stopped rather than treated as acceptance for the corrected source. No progression or expense thresholds were relaxed to hide this defect.

An adversarial marketplace withdraw/relist freshness probe on this tip found no price or prior-buyer payment exploit: listing age only lowers early bid probability, amounts stay ask-capped to assessed value, and prior buyers remain excluded across listings.

## Verdict

**GAME SYSTEMS NOT READY**

Blockers: S5 joint-registered XI / GK coverage is not yet ≤0 across multi-seed on `a29106d` (best seed still 2 clubs below XI; GK gaps remain); native IndexedDB S1/10/30 restart certification is pending; no 20×30 diagnostics or replay acceptance. No package, online-provider, publication or release-readiness claim is made.
