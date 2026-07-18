# Youth Scout evidence and reporting UI audit

## Executive summary

The current Youth Scout experience presents one coherent professional-judgment loop: choose a question, observe under limited attention, classify what was actually seen, decide what can be defended, name the remaining risk, and accept delayed accountability. The report writer no longer asks the player to create value through free text, and no competing hypothesis or automatic-report path can award the same outcome.

The rendered experience scores **9.2/10 overall**, with **9.4/10 System Cohesion**. A report task navigator now keeps the six required decisions visible, identifies blockers, and jumps to the next unfinished task on desktop and mobile. In-career navigation is limited to the six workspaces plus Handbook and Settings; product-roadmap language no longer breaks the active career fantasy.

The remaining visual opportunity is art variety, especially player portraits. It is polish work rather than a comprehension, accessibility, or gameplay blocker.

## Product and goal

- Product: single-player football scouting career simulation.
- Primary player goal: turn incomplete observations into defensible recruitment judgments and build a reputation over time.
- Primary design goal: make evidence, uncertainty, skill, and consequence understandable without feeling like a spreadsheet or a writing exercise.
- Target audience: experienced Football Manager players and newcomers to management simulations.

## Current rendered evidence

Captured from the current production-style bundle at 1440x900 desktop and 390x844 mobile widths:

- Main menu, career creation, Desk, Planner, Prospects, Reports, World, Career, weekly strategy, international work, politics, rivals, and special-event decisions.
- Prospect dossier, development environment, conflicting evidence, structured report writer, and report detail.
- Observation setup, live pitch, halftime decision, reflection, completed observation, and week-simulation journey.
- Academy placement case at first viewport and full-page depth.
- Axe serious/critical violation scans, horizontal-overflow checks, modal focus, keyboard operation, and responsive navigation.

Evidence folder:

`artifacts/release/generated/visual-evidence/head-49c4ba29372c__base-tree-43ec01390f14__dirty-9dfcc7f1fc9c`

All three current visual journeys pass after the interactivity fixture was updated to create a real observation, classify structured evidence, choose a halftime approach, and complete reflection through the same authority as normal gameplay.

## Scores

- Overall Design Score: **9.2/10**
- Base Design Score: **9.1/10**
- System Cohesion Score: **9.4/10**
- Caps applied: none

| Dimension | Score | Evidence-based finding |
|---|---:|---|
| Visual hierarchy | 9.2 | Assignment, report readiness, room strategy, judgments, risk, terms, and filing have a clear scan order. |
| Layout and spacing | 9.0 | Desktop grouping is strong; mobile stacks cleanly and uses task navigation to manage the deliberately long formal case. |
| Typography | 8.9 | Headings, labels, verdicts, and supporting language remain legible across dense and narrow states. |
| Color and contrast | 8.9 | Emerald, cyan, amber, and red consistently signal selection, information, uncertainty, and risk with redundant words/icons. |
| Components and states | 9.3 | Task readiness, blockers, claims, unknowns, risk, disabled filing, modal states, and guided locks share one interaction grammar. |
| Interaction and feedback | 9.4 | Every material choice exposes its tradeoff; next-task navigation is explicit; transient feedback never intercepts gameplay. |
| Information architecture and navigation | 9.2 | Six stable workspaces, contextual drill-downs, profile/report return paths, and no in-career product Roadmap keep the career coherent. |
| Conversion or task-flow design | 9.5 | The player is led from evidence to judgment to action with explicit recovery when evidence is insufficient. |
| Accessibility and inclusive UX | 9.3 | Axe gates, modal focus, Escape, focus restoration, keyboard parity, skip link, mobile bottom navigation, and overflow checks pass. |
| Imagery and iconography | 8.1 | Icons and stadium/office imagery support the fantasy; generated player portraits remain the least premium visual element. |
| Brand visual system | 9.0 | Dark scouting-room presentation and restrained football imagery remain consistent across workspaces and consequence states. |
| Emotional trust and polish | 9.1 | The interface admits uncertainty, explains stakes in football language, and preserves the link between what was seen and what is claimed. |

## System cohesion diagnosis

The UI and simulation now describe the same rules. Observation skill, lens, regional familiarity, context, focus, fatigue, conditions, and bounded chance determine cue clarity. The report interface asks the player to interpret only those saved cues. Submitted reports preserve the same claims, unknowns, risks, next test, audience, action, and conviction used by downstream recruitment and accountability systems.

The task navigator improves journey cohesion without becoming a second authority: it reports completion and moves focus, while the underlying structured decisions remain authoritative. The former authoring board, invisible hypothesis rewards, automatic weekly report submission, and in-career Roadmap navigation no longer compete with the professional fantasy.

## Detailed findings

### Hierarchy, layout, and typography

The first viewport answers three questions quickly: whose report this is, what club decision it serves, and what remains unfinished. The task navigator remains visually subordinate to the report title but precedes the long case, which is the right hierarchy for repeat use. Mobile displays readiness, blockers, fresh evidence, and the next task before the full brief.

The complete formal report remains long by design. The navigation rail solves orientation and recovery; usability testing should determine whether repeat players also want optional section collapsing after mastery.

### Components, interaction, and task flow

The core interaction is legible: make a cue-backed claim or leave the area unassessed. A claim must cite saved evidence; risks can be explicitly excluded; confidence is bounded; recommendation language is assembled output rather than a writing minigame. Filing communicates exact blockers and never invents missing work.

The live observation journey requires a halftime approach, any contextual strategic choice, evidence classification, and explicit reflection completion. Tutorial locks and mentor guidance point to required controls while preserving keyboard behavior and a route back after the guided sequence.

### Navigation and information architecture

Reports belong to prospects and return to the player profile. Submitted reports live in Reports. Reference detail is a collapsed scouting dossier. The career sidebar exposes Desk, Planner, Prospects, Reports, World, and Career, then Handbook and Settings; the Future Roadmap remains an entry/support destination outside active-career navigation.

### Accessibility, color, and state communication

Selected, blocked, unknown, and risky states include labels or icons beyond color. Controls have accessible names, dialogs trap and restore focus, Escape works where expected, and the app provides desktop sidebar plus mobile header/bottom navigation without horizontal page overflow. The current dedicated accessibility suite passes all six scenarios across creation, workspaces, dossiers, reports, dialogs, and political choices.

### Imagery, brand, and polish

Stadium and recruitment-room imagery supports the fantasy without competing with controls. The visual system has enough restraint to keep dense simulation information readable. Portrait variety and quality remain the most obvious path to a more premium first impression.

## Redesign thesis

**Scouting is not filling in a form; it is deciding what your reputation can safely stand behind.** Every screen should expose a limited piece of evidence, ask for a football judgment, preserve uncertainty, and create a reason to return with a sharper question.

## Prioritized follow-up recommendations

1. Test optional section collapsing with repeat players; add it only if the current task navigator does not sufficiently reduce report fatigue.
2. Expand player portrait variety and quality while preserving fast loading and the restrained scouting-room direction.
3. Continue the player-facing language guardrail so hidden truth, generated summary, internal phase, game state, and implementation terminology cannot re-enter shipping copy.
4. Validate the complete first season with NVDA and VoiceOver users and with moderated Football Manager/newcomer cohorts before claiming commercial certification.

## Implementation acceptance criteria

- A Youth report cannot begin without at least one classified, reportable cue.
- Observation sessions require the contextual halftime/strategic decisions and evidence classification before completion.
- Scout skill, lens, regional knowledge, context, fatigue, conditions, and bounded chance affect cue clarity without exposing hidden truth.
- Every formal judgment is supported by a saved cue or explicitly left unassessed.
- Repeated unknown statements cannot inflate report craft.
- Submitted reports preserve claims, confidence, unknowns, risks, next test, audience, action, and assembled recommendation.
- Task navigation reports readiness and moves focus but never mutates authoritative decisions.
- Report details open at the top on mobile, scroll independently, close visibly, and lock background scroll.
- Minor unlock feedback never intercepts gameplay controls.
- Desktop and 390px mobile report paths pass Axe and horizontal-overflow assertions.
- Typecheck, lint, 191-file/1,034-test unit suite, 13 critical rendered checks, 53-flow Youth core suite, organic career, ten-season browser soak, production build, Windows package, and supporting packaged-runtime check pass with zero E2E retries.
