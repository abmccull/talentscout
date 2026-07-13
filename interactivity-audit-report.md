# TalentScout interactivity audit

**Audit date:** July 12, 2026

**Scope:** Youth Scout release candidate at 1440 x 900 and 390 x 844

**Evidence:** 64 refreshed core screenshots (32 desktop and 32 mobile), two dedicated World Archive renders, and supplemental desktop/mobile academy-case captures with recruitment identity

**Current score:** **8.9/10 gameplay interactivity**

**Decision:** **Hold for the strict all-9 release standard.** The candidate is genuinely game-like, but some interaction, presentation, accessibility, usability, and platform categories remain below verified 9.0.

## Executive assessment

TalentScout is no longer primarily a collection of scouting spreadsheets. The player manipulates attention on a pitch, compares contradictory evidence, chooses how to present a report, reads destination-club recruitment priorities, navigates rival pressure, makes political approaches, and watches recommendations return as multi-season career consequences.

The World Archive adds a useful new interaction layer: players can select seasons, inspect champions and movement, drill into public player outcomes, and move between desktop rail and mobile select patterns without leaving the World workspace. It is interactive and accessible, but still limited compared with the comparison and timeline tools a world-class long-career simulation needs.

The product correctly keeps the player in the scout role. There is no tactical or match-control minigame. Interactivity is built around attention, uncertainty, access, persuasion, commitment, accountability, and historical interpretation.

## Interaction scorecard

| Quality | Score | Current evidence |
|---|---:|---|
| Direct manipulation | 8.7/10 | Planner scheduling, pitch focus, evidence inspection, World selection, rival-network selection, and archive season/player drill-through make state spatial and manipulable. Evidence composition still relies more on structured controls than free arrangement. |
| Agency per minute | 8.9/10 | Observation lenses, report conviction and approach, recruitment fit, international allocation, stakeholder politics, and special events expose costs and delayed consequences. Some authored choices still use equivalent structures. |
| Spatial and visual simulation | 8.8/10 | Observation Pitch, World map, Rival Operations Network, Week Journey, and World Archive turn key systems into visual places. Club, manager, and player history comparison remains document-led. |
| Feedback and game feel | 8.9/10 | Focus locking, conflict markers, source calibration, recruitment priorities, journey beats, persisted reactions, compact toasts, constrained tooltips, and consequence presentations make state changes legible. Audio and motion coverage is uneven. |
| Interaction variety | 8.8/10 | The six workspaces use different interaction grammars for planning, observation, evidence, reporting, travel, politics, and review. Recurring actors and authored events need more compositional structures. |
| Embodied scouting fantasy | 9.0/10 | The player watches, forms and revises a judgment, tests club fit, takes a position, persuades a stakeholder, and lives with the result over multiple seasons. |
| Spectacle and emotional payoff | 8.9/10 | Consequence Cinema, the Story Reel, political outcomes, source disagreement, placement response, and World history make important moments distinct. Secondary events still lack sufficient visual and audio variation. |
| Mobile and touch playability | 9.0/10 | Audited active states fit at 390 x 844, preserve primary controls and touch targets, use safe-area navigation, and avoid document and main-region horizontal overflow. The archive substitutes a season select for the desktop rail. |

## What changed

### Interactive Observation Pitch

- Pointer, touch, and keyboard selection focus the scout on a real player marker.
- A synchronized list provides an accessible equivalent to the graphical pitch.
- Focus choices spend and lock the authoritative focus resource.
- Standout moments, context, and changing phases are visible without revealing hidden ability.
- Reduced-motion behavior and mobile layout preserve the same decisions.

### Visual Week Journey

- Each day unfolds through Commitment, Context, and Consequence.
- Travel, availability, fatigue, expense, opportunity, and outcome appear when they matter.
- Results remain gated until the underlying choice or simulation resolves.
- Mobile uses a single-column journey rather than a clipped desktop row.

### Evidence Board, recruitment identity, and Report Room

- Observations, hypotheses, contact claims, NPC claims, unknowns, conflicts, and later source calibration appear together.
- Stable scout lenses explain why competent sources disagree.
- Destination-club identity and recruitment priorities are visible in Desk briefs and the report writer.
- Placement evaluation explains authored-evidence fit without leaking current or potential ability.
- Presentation approach is persisted and changes stakeholder evaluation rather than merely changing copy.

### World Archive

- The archive presents a bounded 30-season record of final standings, promotion/relegation movement, managers, club context, and public player outcomes.
- Desktop provides a season rail; mobile provides a labeled season select.
- Player entries support drill-through instead of ending at a history card.
- Dialog semantics, focus containment, Escape close with focus restoration, target size, Axe, and horizontal overflow are verified.
- The current limitation is comparison: the player cannot yet align multiple club, manager, or player timelines side by side.

### Rival, political, and career interaction

- Rival organizations are selectable entities with agendas, pressure, and openings.
- Manager and board meetings offer three distinct approaches with visible costs and personality/preference fit.
- Meeting cooldown, fatigue, memory, and directives prevent free repetition and duplicate weekly costs.
- Special-event choices now leave actor-specific memories and can create delayed obligations.
- Consequence Cinema and the Story Reel reconnect later outcomes to the report and decision that caused them.

### Interaction polish

- Achievement notifications are compact, batched, and non-blocking.
- Tooltips remain inside the viewport and do not expand the document or main region.
- International assignments show explicit observation, report, and local-meeting deliverables; only destination-linked actions count.

## Rendered and automated evidence

Rendered evidence lives in `design-audit-evidence/interactivity-2026-07-12`, `design-audit-evidence/world-history-2026-07-12`, and `design-audit-evidence/academy-case`.

- **64** refreshed core screenshots: 32 desktop and 32 mobile.
- **2** additional World Archive renders: desktop and mobile.
- **2/2** core visual stories passed.
- **1/1** academy-case visual story passed with desktop/mobile recruitment-identity evidence plus Axe, document-overflow, and main-region-overflow checks.
- **1/1** World Archive story passed with Axe, dialog/focus/Escape behavior, mobile season selection, player drill-through, and overflow checks.
- **5/5** accessibility stories passed.
- **382/382** unit tests passed.
- **45/45** Youth Scout gameplay stories passed on the first attempt in approximately 5.3 minutes.
- **4/4** cross-screen smoke stories passed.
- The ten-season every-week browser world-coherence soak passed in approximately 3.7 minutes.
- TypeScript, lint, and scoped diff-whitespace checks passed.
- The shipping production build reports about **614 kB** first-load JavaScript for `/play`, below the 650 kB gate.

The automated accessibility result is strong evidence, not certification. Complete NVDA and VoiceOver journeys remain required.

## Consequence and replayability evidence

The interaction model is supported by seeded, save-stable systems rather than presentation-only randomness. Metric names matter: `adjacentEventRepeatRate` measures repeated semantic beats, while `adjacentEventTypeRepeatRate` is the broader event taxonomy and can repeat when different stages belong to one coherent chain.

| Run | Verified result |
|---|---|
| Release telemetry: 100 seeds x 3 seasons | Passed; 100% composite and event-trajectory uniqueness, 95.22% average semantic distance, 4.78% overlap, 82% special-trajectory uniqueness, 0% semantic adjacent repeats, 16.73% broad event-type repeats, 0% short-window special repeats, 0% long tension-cap runs, and 0 dead/runaway states. |
| Nightly telemetry: 1,000 seeds x 10 seasons | Passed; 100% composite and event-trajectory uniqueness, 96.12% average semantic distance, 3.88% overlap, 99.9% special-trajectory uniqueness, 0% semantic adjacent repeats, 16.53% broad event-type repeats, 0% short-window special repeats, 2.9% long tension-cap runs, 0.03% dead director-season states, and 0 runaway states. |

The broad event-type rate is retained as a tuning observation, not mislabeled as repeated gameplay. Ten-season lifetime special-card reuse is 29.55%; short-window reuse is 0%, which is the meaningful novelty guard for an eight-card deck. The telemetry projection excludes seed IDs, run IDs, names, timestamps, and generated identifiers.

## Long-career evidence

The exact 20-seed x 30-season accelerated boundary soak completed 1,200 canonical boundary ticks spanning 27,600 calendar weeks. It retained 30 World-history seasons per completed career and persisted/reloaded the deterministic replay seed to the same digest.

Measured maxima were:

- Largest serialized save: 57,764,170 bytes (about 55.1 MiB).
- Largest final-to-initial save ratio: 4.63x.
- Peak heap used: 760,949,888 bytes (about 725.7 MiB).
- Peak RSS: 972,283,904 bytes (about 927.2 MiB).
- Boundary-tick latency: 809.06 ms p50, 1,681.18 ms p95, and 1,874.86 ms maximum.

This soak intentionally skips ordinary weeks and uses two authoritative season-boundary ticks per season; it proves boundary rollover, bounded archive retention, save-growth limits, isolated-process memory ceilings, and deterministic persistence across 20 seeds. It does not replace the separate ten-season every-week browser soak or low-end runtime profiling.

## Verified defects closed

1. Mobile observation and week resolution no longer clip or hide required controls.
2. Bottom navigation no longer occludes decision surfaces.
3. The inactive observation focus control that did not affect game state was removed.
4. Quick interactions persist the selected branch, apply bounded asymmetric effects once, and cannot be reward-farmed.
5. Scenario rewards and choice resolution fail closed for invalid or legacy state.
6. Insight actions are gated by their actual resource and state requirements.
7. Youth political meetings are no longer cosmetic or duplicative.
8. Native radio semantics, visible focus, contrast, and accessible target sizes cover political choices.
9. Transfer reviews use persisted fixture participation, ratings, injury, movement, and retirement evidence; unsupported conclusions remain unresolved.
10. International rewards require real destination-linked deliverables and resolve exactly once.
11. Career path choice, club employment, leadership delegation, firing/recovery, retirement, and New Game+ are reachable through authoritative state.
12. Recruitment identity affects academy opportunity scoring and is explained at the decision point.
13. World history is bounded, persisted, selectable, keyboard-operable, and linked to public player outcomes.

## Remaining work to exceed 9

### Interaction depth and workflow density

- Add progressive disclosure to Report and Planner flows so expert detail remains available without forcing long vertical scans.
- Add club, manager, and player timeline comparison across seasons and link it from consequence callbacks.
- Extend recurring memory, obligations, and conflicts to agents, families, journalists, employees, and individual rival scouts.
- Replace remaining equivalent-choice event cards with compositional actor x pressure x opportunity x memory interactions.

### Presentation and usability

- Add venue, portrait, audio, animation, and event-treatment variation, with reduced-motion and mute equivalents.
- Validate complete journeys manually with NVDA and VoiceOver.
- Run moderated testing with 12 players and require median SUS of at least 85.
- Profile low-end mobile/desktop frame time, store-subscription rerenders, and packaged platform runtime.

### Long-term feedback and platform proof

- Add side-by-side histories and comparison filters without leaking hidden player truth.
- Continue tracking save growth beyond the current 30-season accelerated profile and optimize the largest collections where needed.
- Extend packaged-runtime proof to save/offline/recovery, interrupted writes, cloud conflicts, installers, Steam fallback, and supported operating systems.

## Final judgment

The core Youth Scout loop is genuinely interactive and substantially more game-like. **8.9 is the defensible current score.** The path to a verified 9+ is denser workflow design, comparative history, broader persistent human interaction, richer visual/audio variation, manual accessibility, moderated usability, and low-end/platform runtime proof—not a larger match engine.
