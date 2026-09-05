# Gameplay systems report

Status: implementation in progress. Baseline `5f141698b87f5964c71723f9f32381cda24df587`; work branch `codex/game-systems-overhaul-20260905`.

Original systems score: **58/100 (provisional)**.

Final systems score: **not yet assessed**. Implemented changes, tests, gameplay evidence and remaining deductions must be reviewed before assigning a final score.

The baseline contains functioning world, report, career and persistence foundations, alongside reproduced chronology, claim-polarity and weekly-ownership defects. See GAMEPLAY_SYSTEMS_AUDIT.md for each finding and GAMEPLAY_SYSTEMS_PLAN.md for milestones. The overhaul is now integrated locally; acceptance remains in progress.

## Implemented systems

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
- The mocked soak provider uses the existing structured-save interface. This eliminates discarded full-state serialization while preserving all persistence-helper calls, deterministic outcomes and explicit save checks; real-provider verification remains separate.

## Validation ledger

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
| Actual save-provider endurance/recovery | Pending | Required |
| Human comprehension, attachment, repeat play | Pending | Cannot infer from simulation diversity |

## Intermediate world and economy evidence

The first strict season ended with 6,495 active players, 761 available unsigned youth, 815 retained retired players and 282 clubs. Senior rosters ranged from 15 to 27 with no club below eleven players. No new structural invariant failed. Active mean ability was 64.28 and mean potential 78.92; these are changing-cohort measurements, not proof of individual inflation or healthy decades.

The commercial driver accumulated a £229,716 balance through real game actions, with £234,423 positive completed-season cash flows and £8,740 outflows. No harness cash injection was found. Nonexclusive report sales to multiple buyers are a real scale mechanism; a single commercial run does not establish strategy dominance. Positive cash flows are not automatically earned revenue, and first-team transfer accountability records are not youth placement counts. Expanded diagnostics and matched-policy comparisons must resolve those distinctions before tuning.

A separate adversarial report-sale probe reproduced a concrete pricing exploit: a £152 suggested report attracted £214 normally, while a £10,000 ask attracted £14,050 plus a £7,025 welcome bonus from the same buyer. The integrated correction removes the asking-price source of value; store-action regressions verify equivalent bounded payment, bonus and buyer debit for fair and exaggerated asks. Intermediate long runs were stopped rather than treated as acceptance for the corrected source. No progression or expense thresholds were relaxed to hide this defect.

## Verdict

**GAME SYSTEMS NOT READY**

Blockers: missing final-source long-career distribution and retained-career real-save evidence; missing independent human gameplay validation. No package, online-provider, publication or release-readiness claim is made.
