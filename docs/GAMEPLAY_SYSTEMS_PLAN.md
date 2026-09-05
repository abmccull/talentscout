# Gameplay systems implementation plan

Approved 2026-09-05. Baseline: `5f141698b87f5964c71723f9f32381cda24df587`, clean quality checkout. Implementation branch: `codex/game-systems-overhaul-20260905`.

Youth Scout and shared-world systems ship in this scope. Audit other modes but retain their deliberate build gates. Preserve local saves and existing player identity. Ordinary weeks target 5–10 minutes with optional depth. No new currency, online service, or parallel simulation pipeline.

## Core loop

Find a lead → choose a question → spend attention → interpret evidence → investigate, pass, or recommend → receive consequences → revisit the player.

Each action must expose the scouting question, its opportunity cost, the evidence gained or missed, and the next consequence. Information is earned through time, context and judgment. A lead is not a guaranteed star.

## Milestones and measurable exits

| ID | Work | Exit | Status |
|---|---|---|---|
| M1 | System ownership/reachability map and audit | Every meaningful subsystem has state/UI/cadence/RNG/status, findings have traceable evidence and classification | Complete source audit; execution evidence tracked separately |
| M2 | Week/load ownership, durable decisions, chronology and coherent development application | Reproduced defects have passing regressions; invalid/repeated effects cannot commit | Implemented; final integrated acceptance pending |
| M3 | Event-derived knowledge, polarity, attention/lenses, personality evidence | No unsupported participant estimate refresh; sign-correct claims; independent evidence drives certainty | Implemented; final integrated acceptance pending |
| M4 | Contextual performances, varied maturation and uncertain forecasts, generated opening | Deterministic context-sensitive events; no forced opening exceptional performance or hidden-PA lead ranking | Implemented; final integrated acceptance pending |
| M5 | Pass decisions, observable outcomes, club response and career memory | Reversible pass plus immutable judgment; delayed observable feedback; no duplicate rewards | Implemented; final integrated acceptance pending |
| M6 | Shared economy calculations and traced dead code | Quote equals execution; unsupported promises removed; live children and compatibility preserved | Implemented; final integrated acceptance pending |
| M7 | Diagnostics and final acceptance | 1/5/10/20/30-season health, real saves, browser journeys, human gameplay evidence and final report | Harness implemented; acceptance in progress |

## Implementation contracts

Keep GameState/Zustand, canonical weekly pipeline/lifecycle resolver, seeded RNG, save envelope/journal and observed-information selectors. Root is sole integrator; independent proposal worktrees are outputs, not competing writes to the product checkout. Reproduce faults before integrating a remedy. Validate each scoped proposal, then combined types/tests/builds.

Extend existing observations/cues with provenance and evidence-derived projections; retain legacy readings without inventing observations. Add `pass` to report actions with corresponding UI/validation/outcomes. Add per-invocation week/load ownership, a shared liquidation quote, and ordered realized development deltas. Version new simulation semantics independently from storage. New additive migrations must be idempotent and preserve authored report/history bytes.

## Validation

Use actual store/headless weeks including seasonal intake. Reuse release-soak and balance infrastructure. Capture age/position/nationality/league/ability/potential cohorts, growth, injury, retirements/intake, roster/contracts/transfers, economy, progression, reward identity, backlog, history, save bytes and timings. Keep failures, source fingerprints and every seed. Short diagnostics never certify long careers or real persistence.

On a frozen final source run 20 seeds × 30 seasons with replay, reporting 1/5/10/20/30 boundaries. Run matched cautious/commercial/aggressive policies separately using only observable evidence; use focused adversarial regressions for exploits (there is no dedicated long-career exploit profile). Keep existing budgets intact. Real IndexedDB/file-provider checkpoints and interrupted recovery are separate from mocked soak saves. The bounded consequence case must deliberately buy earned follow-up observations, file its chosen case and attempt an eligible pitch, recording every preparation predicate. An absence of attempts is a coverage failure, never evidence that recommendations succeed or fail correctly.

Play guided/unguided openings, organic later cases, pass/revisit, negative/contradictory cues, report/club response, time advancement and season reviews at desktop and mobile widths. Score all 12 design dimensions plus cohesion on the affected journey. Human testing must verify comprehension, attachment and desire to repeat; automation cannot substitute for enjoyment.

## Completion rule

All five requested documents record actual status and evidence. Final rubric: core loop 20, scouting 20, world/development 20, consequences/career 15, integrity 15, balance/replayability 10. No source change automatically earns points. GAME SYSTEMS READY requires every integrity/endurance/gameplay gate; otherwise name blockers under GAME SYSTEMS NOT READY. Packaging and publication remain separate.
