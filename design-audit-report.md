# TalentScout rendered design audit

**Audit date:** July 28, 2026
**Candidate:** `a99b5849c8fa0d7efa873ef0124e37c109b093bd`
**Product type:** Scout-centered football career simulation
**Primary player goal:** Turn uncertain evidence into defensible scouting decisions and live with their consequences
**Primary product goal:** Make the first Youth Scout Early Access release understandable, distinctive, trustworthy, and replayable

## Executive summary

TalentScout has a strong, recognizable design system and a clear professional-scout fantasy. The best screens lead with a decision, explain why it matters, expose the authoritative source, and connect the next action to a longer career thread. The interface is substantially more coherent than a generic management dashboard.

Fresh desktop/mobile evidence passed for Desk, Planner, Reports, Career, Inbox pressure, contact threads, rival counterplay, and the connected academy-case journey. Six broader accessibility scenarios also passed with no blocking Axe findings. The academy case now explains how the live brief weights the decision before the report is filed.

The main design limitations are density and proof, not a missing visual identity. Mobile pages remain long; the UI leans heavily on cards and text; partial horizontal rails add scanning cost; imagery carries less meaning than the typographic system; and manual screen-reader, moderated comprehension, audiovisual, physical-device, and populated late-career evidence remain open.

## Scores

**Overall Design Score:** **8.6/10**
**Base Design Score:** **8.7/10**
**System Cohesion Score:** **9.1/10**

No formal cap was applied. Accessibility automation is strong, hierarchy is above the cap threshold, components are consistent, and mobile is not three points weaker than desktop.

## Evidence captured

- Eight fresh core-workspace screenshots:
  - desktop/mobile Desk
  - desktop/mobile Planner
  - desktop/mobile Reports
  - desktop/mobile Career
- Six fresh scouting-ecology screenshots:
  - desktop/mobile Inbox decision queue
  - desktop/mobile contact thread
  - desktop/mobile rival landscape
- Fresh desktop/mobile academy-case evidence across Desk, dossier, and report writer.
- Core workspace rendered gate: 1/1 passed.
- Scouting ecology rendered gate: 1/1 passed.
- Academy case rendered gate: 1/1 passed.
- Automated accessibility: 6/6 passed.
- Low-end browser emulation: 2/2 passed.
- Packaged Windows supporting runtime instantiates the simulation worker with zero CSP errors.

The global capture helper could not launch because its Playwright module loader returned an undefined `chromium` binding. The product-specific Playwright visual suites supplied richer stateful evidence and were used for scoring.

## Scorecard

| Dimension | Score | Evidence-based assessment |
|---|---:|---|
| Visual hierarchy | 9.0 | “What matters now,” severity, opportunity cost, source, and next action create a clear reading order. |
| Layout and spacing | 8.3 | Desktop grouping is strong, but full pages and mobile flows are long; some horizontal rails reveal partial cards and increase scan effort. |
| Typography | 8.7 | Strong scale, labels, and professional tone. Dense supporting text can become tiring in repeated weekly play. |
| Color and contrast | 8.5 | Dark surfaces and green/red/yellow states are legible and text-redundant. Automated blocking checks pass. Manual low-vision proof remains open. |
| Components and states | 8.7 | Cards, badges, panels, buttons, receipts, and empty states share one grammar. The academy-case explanation contract now passes. |
| Interaction and feedback | 8.6 | Clear CTAs, focus behavior, keyboard support, consequence receipts, and verified packaged worker startup. Long rollover status still merits physical-hardware review. |
| Information architecture and navigation | 9.0 | Desk, Planner, Prospects, Reports, World, and Career reflect the scout workflow; bottom navigation is consistent on mobile. |
| Conversion/task-flow design | 8.8 | Empty states lead to the first evidence-producing action and priority cards link to authoritative workspaces. Long mobile paths still impose scrolling cost. |
| Accessibility and inclusive UX | 8.8 | Six Axe/keyboard/focus scenarios pass across core states. NVDA and VoiceOver critical journeys remain unverified. |
| Imagery and iconography | 8.3 | Icons are consistent and imagery establishes atmosphere, but most decision meaning still lives in text/card structures. |
| Brand visual system | 9.0 | Black, emerald, restrained football imagery, uppercase labels, and scout language form a distinctive identity. |
| Emotional trust and polish | 8.7 | The interface is honest about empty states, uncertainty, and consequences. Human proof of callbacks, pacing, and late-career emotional variation is absent. |

## System cohesion diagnosis

The interface works as one design grammar:

- Visual emphasis maps to player intent: decide, investigate, schedule, file, and review.
- Similar actions use similar components and consequence language.
- Navigation matches the work lifecycle.
- Empty states point toward evidence creation instead of hiding incompleteness.
- Scout-specific uncertainty and accountability carry through Desk, Reports, relationships, and Career.

The main cohesion tension is between decision-first intent and accumulated information density. The first card is usually excellent; secondary panels can expand into a long sequence of similarly weighted cards. On mobile, the page stays coherent but becomes physically demanding.

## Key findings

### 1. Decision hierarchy is the strongest design asset

The Desk opens with one top priority, why it matters, what happens if ignored, its source, and a direct action. This materially reduces management-sim ambiguity.

**Acceptance criteria**

- First viewport names one primary decision.
- The decision includes reason, risk, source, and next action.
- Secondary context cannot visually outrank the active decision.

### 2. Mobile is coherent but too long

The mobile Desk preserves hierarchy and bottom navigation, but the complete surface spans several screens. Context, active case, signal rail, progression, and career thread all compete for scroll time.

**Acceptance criteria**

- Primary decision and next action remain in the first two viewports.
- Secondary context is progressively disclosed.
- No essential action depends on discovering a partially visible horizontal card.
- A returning player can reach Planner/Prospects/Reports in one tap.

### 3. Academy-case explanation contract — resolved

The Desk now explains how the linked brief weights the active case. The report flow verifies the recruitment-room identity before moving into “Build the case,” where the presentation room becomes visible.

**Why it matters**

The game’s promise is explainable judgment. If weighting disappears, a club response risks feeling arbitrary.

**Acceptance criteria**

- Active brief shows its weighted priorities before the player files.
- The same priorities appear in report review and club response.
- Desktop and mobile visual evidence passes.

### 4. Cards are coherent but overused

Cards are doing priority, context, evidence, progression, relationships, empty states, and explanation. The visual grammar is consistent, but tertiary information can feel like a document rather than a living workplace.

**Acceptance criteria**

- Reserve strong bordered cards for decisions, warnings, and causal artifacts.
- Use lighter rows, timelines, annotated pitches, and relationship maps for secondary evidence.
- Preserve keyboard order and text alternatives for spatial treatments.

### 5. Packaged performance is part of interaction quality — source defect resolved

The packaged CSP now permits the same-package weekly worker while keeping frames, child contexts, and objects denied. Fresh Windows supporting evidence finds the worker active with no policy errors.

**Acceptance criteria**

- Packaged telemetry reports `route: worker` for weekly simulation.
- Unexpected renderer console errors fail the packaged runtime gate.
- Progress/status remains responsive during season rollover and heavy weeks.

### 6. Accessibility automation is strong; certification is incomplete

Automated coverage includes desktop/mobile workspaces, dialog names, focus traps, keyboard close, focus restoration, political choices, and no blocking Axe findings.

**Acceptance criteria**

- NVDA completes onboarding -> observation -> report -> consequence -> save/load without sighted help.
- VoiceOver completes the same journey on macOS.
- No graphical-only evidence, lost context, or motion/audio-only cue remains.

## Redesign thesis

Keep the current brand and decision-first grammar. The next design improvement should reduce secondary density and turn causal information into more spatial, stateful artifacts:

- one decisive first card,
- one visible career thread,
- one compact evidence surface,
- progressive disclosure for archive/context,
- explicit weights and consequences at every handoff.

Do not add more top-level systems to solve this design problem. Improve the presentation and human validation of the systems already present.

## Prioritized recommendations

1. Shorten mobile Desk/Career/Reports with progressive disclosure.
2. Replace tertiary card stacks with timelines, evidence maps, and relationship/pressure views where they improve comprehension.
3. Complete manual NVDA/VoiceOver and a 12-player moderated study.
4. Validate populated late-career screens, sound mix, reduced motion, and minimum-hardware feel in packaged builds.
7. Reduce `/play` from 906 kB / 1.01 MB first-load JavaScript.

## Final design judgment

TalentScout’s UI is strong enough to support a credible premium Early Access identity. It is not yet design-certified for release under the project’s strict standard because one causal visual journey fails and the required human, assistive-technology, packaged-performance, and late-career-density proof is incomplete.
