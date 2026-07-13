# Replayability divergence gate

TalentScout's release gate simulates deterministic, lightweight career trajectories with the same engine modules used by a live career. It does not invent labels or replace game probabilities. The harness uses the run manifest, named random streams, world traits, scout origins, flaws and doctrines, rival-organization director, narrative event director, event chains, and scouting special-event deck.

## Commands

- `npm run test:replayability` samples 100 seeds over three 38-week seasons. This is the pull-request and release gate and should remain below ten seconds on CI hardware.
- `npm run test:replayability:nightly` samples 1,000 seeds over ten seasons. It runs with the nightly simulation soak.

Both commands write a deterministic JSON artifact under `artifacts/replayability/`. The artifact contains configuration, thresholds, metrics, catalog distributions, exact failure reasons, and five stable trajectory fingerprints. It deliberately omits wall-clock timestamps so identical code and inputs produce byte-stable evidence.

## Release thresholds

| Signal | Pass threshold | Why it matters |
| --- | ---: | --- |
| Same-seed replay | Exact equality | Save/reload and diagnosis require reproducibility. |
| Manifest uniqueness | 100% | Every sampled root seed must identify a distinct run. |
| Composite trajectory uniqueness | At least 90% | Identity, world, rivals, and event order should not collapse into a small set of runs. |
| World-trait combination coverage | At least 87.5% | A 100-seed sample should cover at least seven of eight three-axis worlds. |
| Origin/flaw/doctrine coverage | 100% each | Every shipped starting identity must appear in the sample. |
| Rival archetype coverage | 100% | Every shipped organization must enter the sampled world. |
| Rival organization-set coverage | At least 65% | Three-organization casts should vary materially between runs. |
| Event trajectory uniqueness | At least 85% | Narrative order and content should diverge. |
| Special-event trajectory uniqueness | At least 55% | Trait-weighted turning-point sequences should not converge. |
| Eligible event catalog coverage | At least 70% | The lightweight mature-career fixture should reach most narrative types. |
| Average composite trajectory distance | At least 50% | Pairwise runs must differ across identity, world, rivals, and ordered events. |
| Average composite overlap | At most 50% | The inverse cap prevents nominally unique but substantially identical runs. |
| Adjacent semantic-beat repeat rate | At most 8% | Novelty pressure must prevent consecutive events within a career from cycling through the same gameplay beat. Special-event definition and multi-week chain stage are part of beat identity. |
| Special-event four-event repeat rate | At most 5% | Rare turning points must not recur inside the deck's novelty window. |
| Mechanically dominant event rate | At most 20% | Choices using the same outcome resource should rarely Pareto-dominate alternatives. |
| Dead/runaway event-director season states | 0% in release sample | Every season needs narrative activity without flooding or invalid pressure state. |
| Runs pinned at maximum tension for more than eight weeks | At most 5% | Pressure must resolve into a turning point or recovery instead of remaining permanently capped. |
| Rival opportunity tradeoff disclosure | 100% | Every generated opening must expose at least two costs before selection. |

“Mechanically dominant” is intentionally narrow: one option must use the same persisted outcome metric and be no worse on success chance, upside, and downside, with at least one strict advantage. The gate does not collapse reputation, club trust, contact trust, fatigue, and specialization standing into a fictional universal utility score.

## Director integrity definitions

A dead season state has no events or a quiet period longer than half a season. A runaway season state has an invalid tension value, event density above 45%, or more than half a season pinned at maximum tension. These season-level rates remain comparable when the sample grows from three to ten seasons. The nightly profile permits no more than 25 dead states and 10 runaway states per 10,000 simulated seasons; it still reports the share of whole careers that encountered one. These are release-integrity bounds, not tuning targets for a specific story count.

The artifact also records non-blocking balance observations. In particular, it reports the share of runs pinned at maximum tension for more than eight weeks, lifetime special-event reuse, semantic adjacent-repeat rates above 15%, and broad event-type reuse above 15%. Event-type reuse remains visible because consecutive stages of one coherent chain can share a taxonomy label; it is not treated as a repeated gameplay beat. Lifetime reuse is informational because ten draws from an eight-card deck must repeat; the blocking metric measures recurrence inside the four-event novelty window.

If this gate fails, inspect the emitted distribution and failure list before changing any probabilities. A failure is balance evidence, not permission to weaken the test or tune a single seed.
