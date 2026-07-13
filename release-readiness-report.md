# TalentScout release-readiness report

**Assessment date:** July 12, 2026

**Candidate:** Local, uncommitted Youth Scout worktree

**Standard:** 9.0 or higher in every product and rendered-design category, with packaged and human verification

**Verdict:** **HOLD**

## Bottom line

This candidate now clears the 9.0 product bar for world credibility, scouting depth, decision quality, and replayability. The durable World Archive, club and regional recruitment identities, actor-specific consequence memory, deterministic deadline defaults, and event-director tuning materially improve long-term credibility and run divergence. System Cohesion is 9.2, and the core scouting journey remains coherent across desktop and mobile.

It is not yet valid to call TalentScout a strict 9+ release. Four product categories remain at 8.9, several rendered-design dimensions remain below 9, gameplay interactivity is 8.9, and the required human usability, manual assistive-technology, low-end performance, and packaged cross-platform/recovery gates are not complete.

## Current scores

| Product category | Score | Status |
|---|---:|---|
| World credibility | 9.0 | Pass |
| Scouting depth | 9.0 | Pass |
| Decision quality | 9.0 | Pass |
| Career progression | 8.9 | Below gate |
| Relationships and politics | 8.9 | Below gate |
| Information design and usability | 8.9 | Below gate |
| Replayability | 9.2 | Pass |
| Emotional engagement | 8.9 | Below gate |

| Design measure | Score | Status |
|---|---:|---|
| Overall rendered design | 8.9 | Below gate |
| System Cohesion | 9.2 | Pass |
| Gameplay interactivity | 8.9 | Below gate |
| Lowest individual design dimension: imagery and iconography | 8.7 | Below gate |
| Accessibility | 8.9 provisional | Manual validation open |

## Verified exact-candidate evidence

| Gate | Evidence | Result |
|---|---|---|
| Static correctness | TypeScript, lint with zero warnings, and scoped diff-whitespace check | Pass |
| Unit and invariant coverage | 56 files; 382/382 tests | Pass |
| Youth browser suite | 45/45 gameplay stories on the first attempt with retries disabled; 5.3 minutes | Pass |
| Automated accessibility | 5/5 stories; no serious or critical Axe violations in the audited states | Pass |
| Cross-screen browser smoke | 4/4 stories | Pass |
| Rendered interaction audit | 2/2 core visual stories plus targeted Academy Placement and World Archive desktop/mobile audits | Pass |
| Shipping bundle | `/play` first-load JavaScript 614 kB against a 650 kB gate | Pass |
| Every-week browser career | Ten-season world-coherence soak; 3.7 minutes | Pass |
| Accelerated isolated long-horizon integrity | 20 seeds x 30 seasons; deterministic replay; all archives retained 30 seasons | Pass for this harness |
| Full packaged-runtime matrix | Windows/macOS/Linux package, Steam unavailable mode, save/offline/recovery, interrupted writes, and cloud conflict | Not verified on this exact candidate |
| Human usability | 12-player study and SUS threshold | Not verified |
| Manual assistive technology | NVDA and VoiceOver full journey | Not verified |

## Long-horizon simulation evidence

The 20-seed x 30-season isolated harness passed deterministically, spanning 1,200 authoritative simulation ticks and 27,600 calendar weeks. It uses two authoritative accelerated ticks per season; it is not equivalent to processing every intervening week in the browser. The separate ten-season browser soak processes every week.

Measured accelerated-harness results:

- All 20 careers retained exactly 30 World Archive seasons.
- Largest serialized save: 57,764,170 bytes (55.09 MiB).
- Largest save-growth ratio: 4.63.
- Peak JavaScript heap: 760,949,888 bytes (725.70 MiB).
- Peak RSS: 972,283,904 bytes (927.24 MiB).
- Tick latency: p50 809.06 ms, p95 1,681.18 ms, maximum 1,874.86 ms.
- Same-seed replay remained deterministic.

This is meaningful integrity evidence, but the absolute memory and save-size results reinforce the need for low-end profiling, save compaction, and a broader every-week packaged-runtime matrix before release.

## Replayability telemetry, schema 2

### Release telemetry: 100 seeds x 3 seasons

- Passes same-seed determinism.
- 95.22% average semantic distance and 4.78% overlap.
- 82.0% special-trajectory uniqueness.
- 0% semantic adjacent repeats; 16.73% broad event-type adjacent repeats.
- 0% long maximum-tension runs.
- 0% dead states.

### Nightly telemetry: 1,000 seeds x 10 seasons

- 96.12% average semantic distance and 3.88% overlap.
- 99.9% special-trajectory uniqueness.
- 0% semantic adjacent repeats; 16.53% broad event-type adjacent repeats.
- 2.9% long maximum-tension runs.
- 0.03% dead-state rate; 0.3% dead-run rate.
- 0% runaway-state rate.

Schema 2 distinguishes semantic event repetition from intentional reuse of a broad event category by linked chains. The divergence projection excludes seeds, run identifiers, names, timestamps, and generated identifiers, so the reported distance reflects material state differences rather than cosmetic uniqueness.

## Major blockers completed in this tranche

### Durable living-world history

- A bounded 30-season World Archive now persists final standings, movement, champions, managers, club philosophy/budget/tactical context, and public player career information.
- Archive records survive serialization without leaking hidden current or potential ability.
- Final-round promotion and relegation include the current week's fixtures.
- The World workspace provides desktop and mobile archive browsing, season selection, player drill-through, accessible dialog behavior, and focus restoration.

### Active recruitment identities

- Clubs and regions now receive deterministic, legible recruitment identities.
- Identity fit changes academy opportunity scoring and the reasons attached to placement outcomes.
- The Desk and Report Writer expose the active brief's recruitment priorities, so the same authored evidence can lead to explainably different club decisions.

### Event balance and consequence integrity

- The event director suppresses immediate semantic repetition, limits special-event frequency, creates pressure-release behavior, and prioritizes mature confidentiality dilemmas.
- Special choices bind to appropriate agents, journalists, family, rivals, contacts, or boards and create actor-specific delayed memories.
- Deadline defaults now run the same authoritative consequence projections as manual narrative choices exactly once.
- Confidentiality promises become actual future dilemmas instead of flavor-only obligations.
- Release and nightly replayability thresholds now pass, including 0% semantic adjacent repetition and long-tension rates below 5%.

## Why release remains on hold

### Product and presentation gaps

1. Career progression needs more proven late-career leadership pressure, financial risk, delegation tradeoffs, and failure/recovery variety in normal play.
2. Relationship ecology must broaden persistent goals and conflicting obligations across agents, families, journalists, employees, and individual rivals beyond the current authored cases.
3. Information design and gameplay interactivity need moderated proof and more non-tabular, decision-bearing treatments for secondary outcomes.
4. Emotional callbacks need greater authored and systemic presentation breadth across discovery, loss, rivalry, vindication, and retirement.
5. World history, recruitment identities, and the event director now meet their core gates, but their content breadth should continue expanding without weakening deterministic or save-size constraints.

### Proof and platform gaps

1. Profile the 55.09 MiB save and 725.70 MiB peak heap on representative low-end hardware; compact retained records and narrow remaining broad subscriptions where measurements justify it.
2. Extend the passing browser evidence to release-equivalent Windows, macOS, and Linux packages, including save/load, offline/online transitions, Steam-unavailable mode, local/cloud conflicts, corrupt-envelope recovery, and interrupted writes.
3. Complete a 12-player moderated study with median SUS at least 85 and the defined task-completion and explanation-comprehension thresholds.
4. Complete the critical journey manually with NVDA and VoiceOver.
5. Add a larger every-week long-horizon run or prove accelerated/manual equivalence across every authoritative seasonal subsystem; do not treat the two-tick-per-season harness as identical to normal calendar play.

## Release decision rule

Do not convert this HOLD to PASS because the average exceeds 9 or because automated suites are green. Release becomes eligible only after every product and rendered-design category is at least 9.0, all P0/P1 integrity gates pass on the exact candidate, release-equivalent packaged and recovery tests pass, and human usability/accessibility evidence is complete.

The remaining sequence and acceptance criteria are defined in `release-9-plus-plan.md`. The machine-readable state is in `release-readiness-scorecard.json`.
