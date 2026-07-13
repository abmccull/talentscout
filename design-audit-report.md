# TalentScout Youth Scout design audit

**Audit date:** July 12, 2026

**Scope:** Youth Scout onboarding, generated veteran openings, and six permanent workspaces, including observation, reporting, international work, relationships and politics, rival operations, career consequences, recruitment identities, and multi-season World history

**Viewports:** 1440 x 900 desktop and 390 x 844 mobile

**Rendered evidence:** 64 refreshed core screenshots (32 desktop and 32 mobile) in `design-audit-evidence/interactivity-2026-07-12`, plus the World Archive and academy-case suites. The first-hour tranche adds rendered quick-start, contact-call, breakthrough, discovery-decision, and compressed Planner evidence in `artifacts/hook-final-01-quick-start-desktop.png` through `artifacts/hook-final-06-planner-mobile.png`. Returning-career selection plus generated setup/decision evidence is in `artifacts/veteran-opening-ux/` at desktop and 390x844 mobile widths.

**Decision:** **Conditional release candidate, but not yet certified against the strict all-dimensions-9 standard.** The current rendered and automated product score is 9.1 overall. Typography and manual assistive-technology validation remain below the strict release bar, and commercial asset provenance still requires owner review.

## Outcome

TalentScout now presents one scouting career rather than a collection of dashboards. The critical scouting moments have distinct, causal interaction models:

- Live Observation uses a graphical pitch with pointer, touch, and keyboard player focus, synchronized with an accessible evidence list.
- Week resolution is a responsive Commitment to Context to Consequence journey rather than a static sequence of day cards.
- The Evidence Board exposes supporting claims, contradictions, unknowns, hypotheses, and source calibration.
- The Report Room turns a written report into a consequential presentation with persisted approach choices.
- Academy briefs and report writing now expose the destination club's recruitment identity, so the player can understand why the same prospect can fit one opportunity and fail another.
- Rival organizations appear as an interactive operations network with pressure, agendas, openings, and organization-level selection.
- International work shows explicit deliverables and only counts destination-linked work.
- Career politics provides native, keyboard-accessible approach choices with person-specific memory, costs, cooldowns, and future directives.
- Consequence Cinema and the Career Story Reel connect recommendations to later placement, development, failure, vindication, and career identity.
- The World Archive makes 30 seasons of champions, movement, managers, club context, and public player outcomes selectable and inspectable without leaking hidden ability.
- Quick Start now reaches the core fantasy immediately: persona choice, a real generated local lead, three uncertain observation beats, a contradiction, and an irreversible disclosure decision.
- The authored teaching case is profile-level and one-time. Returning scouts default to one of ten generated prologue structures, or may explicitly start at the Desk or replay the tutorial.
- Generated prologues vary venue, source, pressure, evidence mode, contradiction, deadline, stakeholder conflict, choice framing, and hidden prospect outcome; recent-template history prevents the last three structures from repeating.
- The Living Casebook connects first evidence, reflections, reports, club decisions, movement, reviews, and later outcomes into one durable career artifact.
- Contacts and rivals expose remembered choices, promises, trust effects, and pending consequence deadlines rather than acting only as meters.
- Tier-4 careers now add a limited-attention leadership portfolio with own, delegate, defer, and reject decisions backed by attributable outcomes.
- The Planner keeps the seven-day attention budget sticky, collapses secondary context, and schedules common work in two interactions or targeted work in three.

The six-workspace information architecture remains intact: Desk, Planner, Prospects, Reports, World, and Career. Responsive shells and safe-area navigation remove the mobile clipping and occlusion found in the earlier audit.

## Scorecard

| Dimension | Score | Evidence-backed assessment |
|---|---:|---|
| Visual hierarchy | 9.1/10 | Quick Start, the discovery reveal, sticky itinerary, selected-only opportunities, report recommendation, and leadership attention all present one dominant decision with visible stakes. |
| Layout and spacing | 9.0/10 | The compressed Planner and opening flow fit desktop and 390x844 mobile without document overflow. Long report evidence remains deliberately scrollable behind progressive disclosure. |
| Typography | 8.9/10 | Opening decisions, relationship history, and Planner costs are highly legible. Compact simulation metadata in the longest dossier, casebook, and archive views remains tiring. |
| Color and contrast | 9.1/10 | Semantic color is consistent, and the rendered suites report no serious or critical Axe issue in the instrumented states. Contrast was hardened in observation, week resolution, rivals, reports, politics, and the archive. |
| Components and states | 9.2/10 | Opening, memory, obligation, pending consequence, delegated responsibility, selected opportunity, contradiction, and case-history states share a consistent semantic vocabulary. |
| Interaction and feedback | 9.3/10 | The first five minutes require focus, evidence classification, hypothesis preservation, and a consequential disclosure choice. Planner, stakeholder, rival, political, reporting, and leadership actions all persist and return feedback. |
| Information architecture and navigation | 9.2/10 | Six stable workspaces now connect directly to a Living Casebook, actor history, leadership portfolio, and the next relevant planning decision. |
| Task-flow design | 9.3/10 | Quick Start removes setup friction; the guided hour continues through observe, flag, reflect, reveal, report, list, plan a second context, and advance into consequences. Planner work is bounded to two or three interactions. |
| Accessibility and inclusive UX | 8.9/10 provisional | Automated keyboard, semantics, focus management, target-size, overflow, and Axe checks pass. The World Archive adds dialog semantics, focus containment, Escape close with focus restoration, a mobile season select, and keyboard-reachable player drill-through. Manual NVDA and VoiceOver journeys remain open. |
| Imagery and iconography | 9.0/10 | The opening uses a venue scene, live pitch, player identity, notebook treatment, and discovery cinema. Deterministic players and club marks recur across core artifacts, though venue variety can still grow. |
| Brand visual system | 9.2/10 | The scouting-room palette, live-match surfaces, handwritten discovery language, professional artifacts, and adaptive audio scenes form a recognizable identity. |
| Emotional trust and polish | 9.3/10 | The opening creates anticipation, doubt, discovery, ownership, and risk; later actor memories and the Living Casebook turn that moment into long-term pride or embarrassment. |
| **System Cohesion** | **9.4/10** | The same player, evidence, decision, actors, promises, report, and later outcome now travel through the entire scouting career. |

**Overall rendered-design score:** **9.1/10**

**Gameplay interactivity score:** **9.3/10**

## Rendered verification

The first-hour candidate passed the following current gates:

- TypeScript and lint: passed with zero warnings or errors.
- Production static build: passed; `/play` is 520 kB route JS and 627 kB first-load JS after lazy-loading the generated prologue catalog.
- Complete unit suite: 65 files, 426/426 tests.
- Focused New Game, authored-opening, and veteran-prologue production suite: 8/8, including double-activation integrity and explicit tutorial replay.
- Generated prologue setup and decision states: zero serious or critical Axe violations; mobile reveal-to-decision spacing is bounded and screenshot-verified.
- Cold-open plus compressed Planner browser suite: 6/6.
- Existing New Game regression suite: 5/5.
- Broad Youth EA run: 44/45 passed immediately; the sole failure was an obsolete assertion that onboarding should land on the Desk. The test was updated to the intentional Live Observation start and passed on rerun, leaving all 45 browser stories green on the same production build.
- The cold-open browser test uses only visible UI from scout creation through the discovery decision, verifies save/reload at the reveal, asserts exactly-once discovery and scheduled consequences, and reports zero serious or critical Axe violations.

The broader baseline also retains these recorded gates; the long soak should be rerun before a release tag because the candidate has changed:

- Core visual suite: **2/2**, producing 64 refreshed screenshots: 32 desktop and 32 mobile.
- Academy placement visual suite: **1/1**, with desktop/mobile recruitment-identity briefing evidence plus Axe, document-overflow, and main-region-overflow assertions.
- World Archive suite: **1/1**, with desktop/mobile renders, Axe, dialog semantics, focus trap, Escape/focus restoration, mobile season selection, player drill-through, and overflow assertions.
- Accessibility suite: **5/5**.
- Cross-screen smoke suite: **4/4**.
- Complete Youth Scout browser story set: **45/45 green** after replacing the obsolete dashboard-start expectation with the new observation-start contract.
- Ten-season every-week browser world-coherence soak: passed in approximately 3.7 minutes.

Representative evidence:

- `desktop-15b-observation-pitch.png` and `mobile-15b-observation-pitch.png`: graphical, synchronized observation gameplay.
- `desktop-18b-week-journey.png` and `mobile-18b-week-journey.png`: responsive weekly Commitment to Context to Consequence presentation.
- `desktop-12b-evidence-board.png` and `mobile-12b-evidence-board.png`: conflicting and calibrated evidence.
- `desktop-13b-report-presentation-room.png` and `mobile-13b-report-presentation-room.png`: consequential report presentation.
- `desktop-11b-rival-operations-network.png` and `mobile-11b-rival-operations-network.png`: interactive rival organization network.
- `desktop-09f-manager-political-meeting.png`, `desktop-09g-board-political-meeting.png`, and their mobile equivalents: persistent stakeholder choices and outcomes.
- `world-archive-desktop.png` and `world-archive-mobile.png`: interactive historical selection and public-outcome drill-through.
- Academy-case desktop/mobile report-writer captures: visible recruitment-identity priorities at the decision point.
- `artifacts/hook-final-01-quick-start-desktop.png` through `hook-final-04-discovery-decision-desktop.png`: the new first-five-minute arc.
- `artifacts/hook-final-05-planner-desktop.png` and `hook-final-06-planner-mobile.png`: sticky itinerary and compact opportunity board.

## Verified design defects closed

1. Mobile Live Observation no longer compresses a desktop two-column layout or hides primary controls.
2. Mobile Week Simulation no longer extends beyond the viewport.
3. Safe-area bottom navigation no longer covers required actions.
4. Observation focus is a real persisted action; the misleading no-effect control was removed.
5. Pitch and synchronized list expose equivalent information and keyboard paths.
6. Career meeting choices use native radio semantics, visible focus, legible tradeoffs, and persisted feedback.
7. International assignment copy describes attainable rewards and displays the deliverables that earn them.
8. Achievement notifications are compact, batched, and non-blocking.
9. Tooltips remain inside the audited viewport instead of creating document or main-region overflow.
10. Club recruitment identity is visible in Desk and report-writing decisions rather than operating as an unexplained modifier.
11. The World Archive is a real modal interaction with accessible close behavior, season selection, and player drill-through rather than a static history dump.
12. First-time players no longer spend the opening minutes allocating points and reading dashboards before scouting; Quick Start goes directly to the core observation loop.
13. The first reveal is not cosmetic: it writes discovery, decision, actor memory, and future case-chain deadlines exactly once and survives reload.
14. Planner opportunity cards no longer all expand into a long wall; one selection exposes its context, tradeoff, and placement action.
15. Tier-4 promotion now changes the weekly job through limited-attention leadership responsibilities rather than only raising numeric capacity.
16. Returning careers no longer silently drop the opening CTA at the Desk; they receive an explicit generated, Desk, or tutorial-replay contract.
17. Analysis and investigation prologues no longer inherit school-match copy or an impossible live-moment flag gate.
18. New Game creation is single-flight in both UI and store, preventing duplicate worlds and duplicate prologue-history writes.
19. Mobile observation context now moves focus into its modal and returns focus on close.
20. Achievement batches wait until after the discovery decision instead of obscuring the mobile aha moment.
21. Veteran-opening microcopy and achievement notification colors meet the automated contrast gate without relying on a transient opacity animation.

## Why the design is not yet a strict all-dimensions 9+

- Long casebooks, dossiers, and archives still need a denser expert typography mode and stronger side-by-side multi-season comparison.
- Agents, families, and journalists still have less recurring visual identity and authored situation variety than contacts, rivals, managers, and employees.
- Complete journeys have not yet been validated manually with NVDA and VoiceOver.
- No moderated study has demonstrated a median SUS of at least 85 across management-sim experts and newcomers.
- Low-end mobile/desktop frame time, broad store-subscription cost, and packaged platform runtime remain only partially evidenced.
- Generated image and audio provenance is explicitly marked `reviewRequired`; commercial rights evidence must be completed before sale.

## Redesign thesis and acceptance criteria

The next pass should make accumulated history and recurring people as easy to compare as current evidence, while compressing expert workflows rather than adding more dashboards.

1. A club, manager, or player can be compared across at least three seasons from every relevant callback, without exposing hidden truth.
2. The remaining actor classes receive recurring identity and at least one compositional case role.
3. Manual NVDA and VoiceOver users can complete onboarding, schedule, observe, report, inspect a consequence, and inspect World history.
4. Twelve moderated participants achieve median SUS of at least 85, with no critical task below 90% completion.
5. Representative low-end hardware meets an agreed interaction-frame budget and the packaged runtime passes save, offline, recovery, and platform-specific checks.
6. Every shipped image and audio group has approved provenance evidence rather than `reviewRequired`.

## Release design gate

The current interface is a 9.1 rendered and automated release candidate, not a certified all-dimensions-9 release. The new hook, Living Casebook, recurring actor memory, case chain, adaptive audio, late-career leadership, and compressed Planner materially increase value without turning the product into a manager simulation. Certification still depends on manual accessibility, moderated usability, asset rights, low-end performance, packaged runtime, and a fresh full-suite/soak run.
