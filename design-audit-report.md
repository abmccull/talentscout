# TalentScout Youth Scout Early Access final design audit

**Audit date:** July 18, 2026
**Product:** Football scouting and career simulation
**Primary goal:** Turn uncertain youth observations into defensible career-shaping decisions
**Viewports:** 1440 x 900 desktop and 390 x 844 mobile

**Overall Design Score:** **9.5/10**
**Base Design Score:** **9.48/10**
**System Cohesion Score:** **9.6/10**

## Executive summary

Youth Scout now reads as one connected scouting career rather than a collection of simulation panels. The core journey is coherent from end to end: choose a real club need, plan limited time, observe with a question, classify evidence, make a bounded recommendation, expose that judgment to people and rivals, and live with the outcome through career, financial, regional, and narrative consequences.

The largest UX problems found during implementation have been resolved. Desk and Planner now foreground one decision. Player profiles open on the next call rather than a wall of data. Reports are a four-step evidence workflow instead of an all-at-once form. Career owns the scout's appointment and progression; World owns geography, conditions, and rival pressure; Agency owns commercial posture. Mobile navigation no longer inherits an old scroll position, report steps fit in one row, and overlapping World controls have been separated.

The rendered product clears a high Early Access bar. It is visually distinctive, understandable to a new simulation player, and deep enough for experienced Football Manager players to inspect the underlying evidence. No design cap applies. The remaining work is release proof and content expansion, not repair of the core interface.

## Evidence captured

The final worktree produced **100 current desktop/mobile screenshots** in:

`artifacts/release/generated/visual-evidence/head-49c4ba29372c__base-tree-43ec01390f14__dirty-ebbf643f6c90/`

Representative evidence:

- `interactivity-audit/desktop-04-desk.png`
- `interactivity-audit/mobile-05-planner.png`
- `interactivity-audit/desktop-08c-world-outlook.png`
- `interactivity-audit/mobile-09a-career-situation.png`
- `interactivity-audit/desktop-11d-agency-strategy-panel.png`
- `interactivity-audit/mobile-12-prospect-dossier.png`
- `interactivity-audit/mobile-16-observation-reflection.png`
- `academy-case/mobile-report-writer.png`
- `academy-case/desktop-report-detail.png`

Rendered verification covered onboarding, all six core workspaces, dialogs, empty and populated states, career recovery, political choices, rivals, Agency, dossiers, reports, live observation, reflection, and week simulation. Automated browser checks found no serious or critical Axe violations in the final tested surfaces and no horizontal overflow at either viewport.

## Scorecard

| Dimension | Score | Final diagnosis |
|---|---:|---|
| Visual hierarchy | 9.5 | Each workspace now leads with one decision, the stakes, and the next action; supporting simulation detail is available without competing for first attention. |
| Layout and spacing | 9.3 | Desktop uses wide simulation space well and mobile collapses predictably. Long dossiers remain intentionally vertical but are divided into task-based views. |
| Typography | 9.2 | Display, body, metadata, and status levels are consistent. Small metadata is now secondary rather than essential, though dense expert surfaces still use compact labels. |
| Color and contrast | 9.5 | Emerald action, amber risk, cyan evidence, violet opportunity, and red danger roles are consistent. The final Agency contrast defect was corrected and Axe is clear. |
| Components and states | 9.5 | Cards, tabs, meters, dialogs, disclosures, step navigation, disabled states, and feedback use one recognizable grammar. |
| Interaction and feedback | 9.6 | Scheduling, observation lenses, halftime approach, evidence classification, report framing, conviction, strategy posture, and rival responses all return visible consequences. |
| Information architecture and navigation | 9.6 | Desk, Planner, Prospects, Reports, World, and Career have distinct ownership. Agency and deeper expert tools appear in their relevant career context. |
| Conversion or task-flow design | 9.7 | The game consistently moves the player from uncertainty to evidence to judgment to consequence, with no free-text shortcut around the simulation. |
| Accessibility and inclusive UX | 9.6 | Keyboard operation, focus traps/restoration, 44px targets, contrast, reduced complexity, semantic labels, mobile parity, and scroll restoration are covered. Manual screen-reader certification remains a release task. |
| Imagery and iconography | 9.1 | Atmospheric scouting rooms, grounds, maps, dossiers, portraits, and restrained icons support the fantasy. Greater portrait and venue variety is the clearest visual-content ceiling. |
| Brand visual system | 9.6 | The dark professional scouting-room identity, restrained green, editorial evidence treatments, and photographic depth feel specific to TalentScout. |
| Emotional trust and polish | 9.5 | The interface communicates uncertainty honestly, avoids invented certainty, and makes career, financial, and reputation stakes feel consequential. |

No score caps apply: hierarchy, accessibility, component consistency, mobile parity, and task flow all remain above the cap thresholds.

## System cohesion diagnosis

| Cohesion facet | Score | Diagnosis |
|---|---:|---|
| Visual grammar coherence | 9.6 | The same spacing, surfaces, semantic colors, and state treatments carry from planning through long-term career screens. |
| Intent coherence | 9.8 | Visual emphasis consistently rewards evidence gathering, calibrated judgment, and accountable follow-through. |
| Interaction coherence | 9.6 | Similar decisions use similar controls and disclose consequences before commitment. |
| Journey coherence | 9.7 | Club briefs, calendar choices, live observations, reports, rivals, geography, finances, and career progression now exchange canonical state. |
| Brand-emotion coherence | 9.5 | Quiet professional tension is maintained without making the game feel like an internal analytics tool. |

System Cohesion is scored separately at **9.6/10**, not averaged from the category table. The score reflects the absence of a major ownership conflict and the strength of the complete evidence-to-consequence journey.

## Implemented redesign thesis

TalentScout should feel like a scout's working life, not a database with a football skin. The implemented interface therefore follows four rules:

1. **One live decision first.** Desk, Planner, Career, and Player Profile reveal the immediate decision before secondary metrics.
2. **Evidence before certainty.** Observation and reports only expose claims the scout can currently support; unknowns remain visible and useful.
3. **Depth by drill-down.** Policy, dossier detail, career metrics, long-term world influences, and operating posture are available without crowding the first viewport.
4. **Consequences return to the same places.** Reports affect briefs, rivals, relationships, finances, geography, callbacks, role security, and promotion instead of disappearing into isolated scores.

## Major implementation outcomes

### Core workspaces

- Desk presents one dominant weekly choice, up to three urgent items, and three live academy briefs; pipeline and expert detail are collapsed.
- Planner puts the seven-day itinerary before desk policy and supports a common scheduling decision in two actions.
- Player Profile uses Decision, Evidence, Development, and History views. Unknown attributes remain unknown rather than appearing as false precision.
- Report Writer uses Brief, Case, Risk, and Review steps with deterministic evidence decisions, club fit, uncertainty, and calibrated conviction.
- Career opens with role title, security, employer or practice need, next milestone, runway, authority, responsibilities, and failure modes.
- World contains regional access, seasonal football conditions, rival pressure, long-term influences, country browsing, and assignments in one coherent geography layer.
- Agency exposes runway, concentration, capacity, delivery debt, reputation exposure, and a once-per-week operating posture with real downstream effects.

### Simulation cohesion

- Observation questions now vary by position, tactical frame, stakes, opposition, scout skill, regional knowledge, prior evidence, and unresolved report questions.
- Sessions can produce clear, weak, or no signal; repeated observations compare independent evidence and changed context.
- Career objectives and promotion requirements derive from the actual club or independent role rather than generic tier counters.
- Rival actions derive from the scout's report stance and can be countered through advocacy, verification, protection, or withdrawal.
- Regional presence includes calendar, rules, language, culture, intelligence freshness, travel burden, and rival pressure.
- Agency strategy changes capacity, quality debt, client acceptance, concentration risk, reputation exposure, and staff pressure.
- Narrative callbacks are low-frequency and receipt-backed, preserving memorable outcomes without turning every week into a scripted event.

## Top remaining recommendations

These are post-implementation release and content priorities, not blockers in the audited core journey.

1. **Complete manual accessibility certification.** Verify NVDA, VoiceOver, 200% zoom, keyboard-only play, and packaged Electron focus behavior. Acceptance: no critical task requires pointer use or unlabeled spatial context.
2. **Expand portrait and venue variety.** Add more age-appropriate prospect faces, scout portraits, academy grounds, and regional visual motifs. Acceptance: a three-season career does not repeatedly show the same visual identity for unrelated people or markets.
3. **Measure first-hour comprehension.** Test five new simulation players and five Football Manager players. Acceptance: at least 8/10 can explain the observation-to-report-to-consequence loop and complete a report without facilitator help.
4. **Protect perceived performance.** The `/play` route remains a large simulation bundle. Acceptance: packaged target hardware reaches the interactive Desk quickly, and loading transitions never look frozen.
5. **Use telemetry before further compression.** Track disclosure use, report-step abandonment, Planner backtracking, and mobile time-to-action. Only compress expert detail when evidence shows it is obstructing play.

## Detailed findings by dimension

### Visual hierarchy

The strongest improvement is the separation between immediate work and strategic depth. Desk's “Build a week that can change a career,” Career's appointment card, and the dossier's “Next scouting decision” all make the next action unmistakable. Report progress remains sticky and now fits entirely on mobile.

### Layout and spacing

Desktop cards use the available width without creating spreadsheet-like density. Mobile cards collapse to a readable single column, persistent navigation remains clear, and screen changes reset both document and workspace scrolling. Agency posture choices are long on mobile, but they are a deliberate optional disclosure rather than mandatory first-viewport content.

### Typography

Headings carry the narrative, body copy explains consequences, and uppercase labels identify professional context. The smallest labels no longer carry required decisions. Continued content work should avoid returning essential rules to 10px metadata.

### Color and contrast

Color has stable semantic meaning and is reinforced with labels, icons, and copy. The rendered audit caught and fixed three low-contrast Agency labels instead of suppressing the rule. Final tested screens have no serious or critical Axe findings.

### Components and states

The design system now handles default, hover, focus, selected, disabled, warning, complete, empty, and collapsed states consistently. Dialogs own focus, close with Escape, and restore the originating control. World Outlook and World Archive no longer overlap.

### Interaction and feedback

The strongest interactions change the quality or meaning of a future decision: observation focus, halftime approach, evidence classification, report framing, conviction, counterplay, and agency posture. Feedback communicates tradeoffs before commitment and receipts afterward.

### Information architecture and navigation

The six-workspace Youth Scout navigation is appropriate for Early Access. Career no longer duplicates World simulation state, and World does not absorb the scout's employment story. Agency depth is reachable without becoming a seventh permanent novice-facing workspace.

### Task-flow design

The player cannot skip from a raw sighting to an authoritative report. Evidence must be observed, classified, framed against a real need, tested for risk, and filed with conviction. The loop is deterministic enough for the simulation while retaining uncertainty, skill, and chance.

### Accessibility and inclusive UX

The final browser matrix covers desktop/mobile Axe scans, keyboard controls, modal focus traps, focus restoration, responsive overflow, and mobile navigation. The new screen-change scroll assertion prevents users from landing midway through an unfamiliar screen. Manual assistive-technology validation is still required before claiming certification.

### Imagery and iconography

Imagery creates atmosphere without obscuring controls, and icons reinforce labels rather than replacing them. The remaining gap is content repetition over a long career, not incoherent art direction.

### Brand visual system

TalentScout now has a recognizable visual language: quiet, professional, evidence-led, and slightly cinematic. It avoids the generic bright-dashboard look common to management tools while remaining legible.

### Emotional trust and polish

Unknowns, uncertainty, risk, and tradeoffs are presented honestly. The game does not call attention to itself as “the game,” expose seed/fingerprint language, or imply certainty it has not simulated. This preserves the fourth wall and makes later vindication or failure credible.

## Implementation acceptance criteria

| Criterion | Result |
|---|---|
| One primary decision appears before supporting metrics on Desk, Planner, Career, and Player Profile | Pass |
| Report claims require classified evidence and preserve unknowns | Pass |
| Report workflow is fully visible and keyboard operable on mobile | Pass |
| World, Career, and Agency have non-overlapping system ownership | Pass |
| Geography affects access, travel, intelligence, rivals, and assignments | Pass |
| Agency strategy affects capacity, quality, clients, reputation, and staff pressure | Pass |
| Dialogs trap focus, close by keyboard, and restore context | Pass |
| Screen changes open at the top-level context instead of retaining old scroll | Pass |
| Desktop and mobile have no tested horizontal overflow | Pass |
| Final tested surfaces have no serious or critical Axe violations | Pass |
| Integrated browser slice passes | Pass - 39/39 |
| Unit and architecture gates pass | Pass - 1,074/1,074 and zero cycles |

## Final judgment

The implemented Youth Scout experience is cohesive, deep, and release-worthy from a design-system perspective. It does not need another structural redesign before Early Access. The next value comes from content breadth, packaged-performance proof, manual accessibility certification, and player telemetry—not from adding more screens or exposing more simulation numbers.
