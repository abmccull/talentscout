# Scouting Ecology Design Audit

Date: 2026-07-18
Scope: Youth Scout Early Access, six permanent workspaces, first-hour discovery flow, prospect dossier, report writer, Network, Inbox, Rivals, World, and Career
Rendered evidence: `artifacts/release/generated/visual-evidence/head-49c4ba29372c__base-tree-43ec01390f14__dirty-9471cb9dadfb/`

## Verdict

The implemented scouting-ecology tranche scores **9.1/10** for its audited scope. It now presents one coherent scouting career rather than a set of adjacent dashboards: the player discovers a lead, chooses evidence contexts, forms a revisable judgment, files for a real need, accepts relationship and rival pressure, and receives consequences that can return weeks or seasons later.

No score cap applies. The audited build has a clear primary action, consistent navigation, visible focus states, responsive controls, and no serious or critical Axe violations in the automated desktop/mobile scenarios. This is an automated product-quality result, not final release certification: manual NVDA/VoiceOver, moderated first-hour usability, physical minimum-hardware, and packaged-platform testing remain external gates.

## Scorecard

| Dimension | Score | Evidence-based judgment |
| --- | ---: | --- |
| Visual hierarchy | 9.1 | Desk, dossier, report, and Career lead with the current decision; expert detail is subordinate. |
| Layout and spacing | 8.8 | Strong desktop rhythm and safe mobile stacking; Desk remains long and World is dense at phone width. |
| Typography | 9.0 | Clear heading scale, compact metadata, and readable long-form consequence copy. |
| Color and contrast | 9.2 | Status colors remain distinguishable against the dark system; automated Axe pass found no blocking contrast defects. |
| Components and states | 9.2 | Disclosures, tabs, badges, dialogs, cards, and empty/blocked states behave consistently. |
| Interaction and feedback | 9.1 | Scheduling, observation, evidence planning, report revision, rival responses, and relationship meetings expose real state changes. |
| Information architecture and navigation | 9.1 | Six permanent workspaces hold; deeper systems are reached through entity links, tabs, and disclosures instead of new top-level screens. |
| Task-flow design | 9.0 | Planner is itinerary-first, reports are progressive, and the opening report is judgment-first; some long mobile scroll remains. |
| Accessibility and inclusive UX | 9.3 | Semantic tabs/radios, keyboard report revision, focus-managed dialogs, responsive targets, and 6/6 automated accessibility scenarios pass. |
| Imagery and iconography | 8.7 | Strong football/scouting atmosphere and consistent icon language; some data-heavy states rely more on panels than expressive imagery. |
| Brand visual system | 9.2 | The emerald, cyan, amber, and violet system consistently communicates evidence, opportunity, pressure, and ecology. |
| Emotional trust and polish | 9.0 | Hidden truth is protected, exact optimizer advice is reduced, and callbacks name what the scout believed and why. |
| System Cohesion | 9.2 | Career roles, cases, observations, agency pressure, access, regions, rivals, and story cadence share the authoritative weekly path. |

Overall arithmetic mean: **9.07**, reported as **9.1/10**.

## What materially improved

- **Desk:** one dominant weekly decision, three live briefs, a bounded urgent queue, and collapsed reference material. It answers “what should I do now?” before showing the wider system.
- **Planner:** the seven-day itinerary and live opportunities precede persistent strategy controls. Desk policy is an advanced disclosure rather than a weekly form to re-complete.
- **Prospect dossier:** Decision, Evidence, Development, and History tabs turn a player into a continuing professional case. The highest-value evidence is qualitative and tied to the player, role, brief, and unresolved question.
- **Report writer:** four progressive steps, evidence gating, a clear no-observation action, a real final review, and reversible completed tabs. The one-time opening report deliberately starts on current read, key uncertainty, next step, and conviction.
- **Career:** current role, security, next milestone, pressure, and runway come before world detail. Tier/path packages create authority, responsibility, and failure modes that weekly play actually evaluates.
- **Relationships:** recurring people now expose access, obligations, remembered dealings, values, red lines, and authored callbacks rather than only a generic meter.
- **Football Worlds:** territories combine access, intelligence, relationships, logistics, culture, club demand, travel posture, infrastructure, and neglect. World conditions have stakeholder-specific arcs and club philosophies can change over seasons.
- **Rivals:** organizations and named scouts run visible multi-phase campaigns. Openings show a qualitative scout read and known tradeoffs; responses resolve once and leave facts, memories, access, and momentum consequences.
- **Narrative cadence:** one shared director gates world arcs, relationship conflicts, rival activity, agency dilemmas, and non-modal World Pulses. Quiet updates use existing case, territory, and rival facts without exposing hidden ability.

## Rendered findings

### Strongest surfaces

1. **Prospect Decision tab:** the question, action, brief fit, mobility gate, and next evidence are visible together. This is the clearest expression of the game’s unique fantasy.
2. **Career Overview:** role, security, milestone, runway, operating pressure, and rival landscape form an understandable career command surface.
3. **Report states:** the no-evidence state cannot be mistaken for a filable report, while the completed state reaches a dedicated artifact review.
4. **Network contact detail:** remembered events and persistent identity sit beside current access and meeting actions, connecting character to utility.

### Remaining design debt

1. **Desk length:** the top is decisive, but three detailed briefs plus the urgent queue still create a long phone page. A player preference to collapse read briefs after first exposure would improve expert speed.
2. **World at mobile width:** assignment cards are actionable, but map controls, legend, and regional cards compete in a small viewport. A compact “assignment focus” state would reduce visual occlusion without creating another screen.
3. **Early rival history:** the architecture supports lasting scars, but fresh careers necessarily contain several “limited history” cards. Tuning should ensure a memorable named rival develops by the end of season one.
4. **Regional identity presentation:** culture and club-demand differences now affect calculations, but more authored venue, calendar, and contact texture would make two territories feel different before the player reads their modifiers.
5. **Narrative telemetry:** the 100-seed probe reports 17.19% adjacent broad-category repetition and a 15-week maximum in the legacy major-event quiet counter. World Pulses now cover player-facing quiet stretches, but telemetry should add a separate player-facing cadence metric rather than treating only major events as narrative activity.

## Verification evidence

- TypeScript: pass.
- Lint: pass, zero warnings/errors.
- Unit/invariant suite: **193 files, 1,043 tests passed**.
- Critical coverage: pass; 85.44% statements, 86.89% lines.
- Retention coverage: pass; 81.79% lines in save-retention authority.
- Architecture: **575 modules, 0 strongly connected components, 0 modules in cycles**.
- Rendered interactivity evidence: **3/3 scenarios passed** across desktop/mobile and core decision states.
- Accessibility: **6/6 scenarios passed**, including all six core workspaces on desktop/mobile.
- Smoke: **4/4 passed**.
- Youth EA core: **50/52 in the first uninterrupted run; both corrected disclosure-contract cases passed individually with retries disabled**.
- Organic career: **1/1 passed**, covering fresh work through path choice, leadership, retirement, and inherited legacy.
- Replayability: **100 seeds × 3 seasons passed**; 100% composite/event trajectory uniqueness, 95.23% average trajectory distance, no dead/runaway director states.

## Release interpretation

This tranche is suitable to merge as an automated release-candidate improvement. It does not by itself certify a Steam build. Manual assistive-technology testing, moderated first-hour usability, physical minimum-spec profiling, packaged Windows/macOS/Linux install/save/recovery testing, and the exact tagged 20-seed × 30-season soak remain required before declaring the immutable candidate production-ready.
