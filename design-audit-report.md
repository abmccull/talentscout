# TalentScout contextual-depth design audit

**Audit date:** July 15, 2026

**Product:** Youth Scout Early Access football scouting and career simulation

**Viewports:** 1440 x 900 desktop and 390 x 844 mobile

**Overall Design Score:** **9.3/10**

**Base Design Score:** **9.32/10**

**System Cohesion:** **9.6/10**

## Executive summary

TalentScout now presents the added observation, regional, relationship, consequence, and career systems as one scouting career rather than as independent feature panels. The rendered experience has a recognizable rhythm: find an uncertain lead, spend attention to interpret it, commit a professional opinion, expose that opinion to people and institutions, and revisit the result later. Live Observation and the career-moment overlay are the strongest new proof. They turn evidence and consequence into authored-feeling play without taking authority away from the simulation.

The current interface clears the 9+ rendered bar. It has a strong scouting-room visual identity, six understandable workspaces, credible mobile adaptations, and unusually good causal continuity for a simulation. The remaining design ceiling is not missing breadth. It is expert-workflow compression: the report writer, prospect dossier, and some regional intelligence use long vertical documents and compact microcopy. That depth is valuable, but mature players need faster section-level navigation and the accessibility evidence still needs manual NVDA and VoiceOver completion.

**Core diagnosis:** The product's design grammar and gameplay intent now agree; its remaining friction comes from fitting professional-simulation density into mobile and popover formats without weakening the evidence model.

**Redesign thesis:** Future polish should feel like a scout's fast, personal working system: preserve every causal detail, but reveal it through clear summaries, section jumps, contextual drill-ins, and emotionally distinct callbacks.

## Scope and evidence

| Evidence | Details |
|---|---|
| Primary user goal | Discover, evaluate, recommend, and track players while building a scouting career. |
| Primary business goal | Deliver a distinctive, trustworthy Early Access simulation whose depth and replay value justify continued play and recommendation. |
| Current rendered captures | 70 desktop/mobile core-journey images refreshed during this audit in `design-audit-evidence/release-2026-07-13/`, plus 7 targeted contextual-depth captures in `artifacts/design-audit-depth/screenshots/`. |
| Core routes/states | Intro, main menu, four-step onboarding, Desk, Planner, Prospects, Reports, World, Career, dossier, report writer, political outcomes, Inbox decision, rivals, and career story reel. |
| New targeted states | Observation situation setup, live pitch, country dossier with operational presence and trip posture, career-defining moment overlay, and career-moment settings. |
| Automated checks | Repository Playwright rendered journey with Axe; final focused recheck was 3/3 green for desktop/mobile country dossier and mobile Settings; mobile observation setup/live was green. |
| Accessibility result | Zero serious or critical Axe violations on the final targeted states; zero document-level horizontal overflow. Image/SVG/transparent-layer contrast remains an Axe incomplete requiring visual/manual review. |
| Helper limitation | The global capture helper resolved dependencies but its ESM import of the project's CommonJS Playwright package returned no `chromium` export. The maintained repository Playwright evidence journey was used instead. |
| Seeded evidence | Country, career-moment, political, and contradictory-evidence states were created through the existing E2E state-injection contract. They are controlled save states, not claims that a new player naturally reaches them immediately. |
| Not verified here | Manual NVDA/VoiceOver, moderated first-hour usability, physical minimum hardware, and packaged Windows/macOS/Linux behavior. |

Representative evidence:

- `design-audit-evidence/release-2026-07-13/desktop-04-desk.png`
- `design-audit-evidence/release-2026-07-13/mobile-10-special-event-choice.png`
- `design-audit-evidence/release-2026-07-13/desktop-09b-career-track-record.png`
- `design-audit-evidence/release-2026-07-13/mobile-13-report-writer.png`
- `artifacts/design-audit-depth/screenshots/desktop-country-dossier-travel-posture.png`
- `artifacts/design-audit-depth/screenshots/mobile-observation-situation-live.png`
- `artifacts/design-audit-depth/screenshots/mobile-career-moment-overlay.png`
- `artifacts/design-audit-depth/screenshots/mobile-career-moment-settings.png`

## Scorecard

| Dimension | Score | Weight | Evidence-backed reason | Priority |
|---|---:|---:|---|---|
| Visual hierarchy | 9.3 | 12 | Critical states foreground one question, visible stakes, and one next action; overlays and editorial career records are especially clear. | Maintain |
| Layout and spacing | 9.1 | 10 | Six workspaces and targeted states remain bounded at 390 px; long expert documents are the current constraint. | P2 |
| Typography | 9.0 | 8 | Strong display/body hierarchy and consistent labels; dense dossiers still rely heavily on 9-10 px metadata. | P1 |
| Color and contrast | 9.2 | 10 | Semantic emerald, amber, cyan, rose, and violet roles are consistent; final targeted Axe scans have no contrast violation. | Maintain |
| Components and states | 9.4 | 10 | Cards, tabs, dossiers, decisions, dialogs, badges, meters, and empty states share one recognizable grammar. | Maintain |
| Interaction and feedback | 9.6 | 8 | Pitch selection, focus lenses, flagged moments, trip posture, consequence decisions, career callbacks, and archive links visibly return feedback. | Maintain |
| Information architecture and navigation | 9.4 | 10 | Six permanent workspaces remain stable while detail screens drill into the relevant entity or decision. | P2 |
| Conversion or task-flow design | 9.6 | 11 | Find, verify, recommend, and track is explicit from Desk through observation, report, Inbox, and Career. | Maintain |
| Accessibility and inclusive UX | 9.0 provisional | 8 | Responsive overflow, focusable controls, modal semantics, reduced-motion/audio settings, and automated Axe checks are strong; manual screen-reader proof is open. | P0 evidence |
| Imagery and iconography | 9.3 | 5 | Scouting room, match venue, pitch, map, notebook, newspaper, portraits, and role icons reinforce the fantasy rather than decorate it. | Maintain |
| Brand visual system | 9.5 | 7 | Dark professional surfaces, scouting green, restrained data colors, editorial records, and atmospheric photography form a distinct identity. | Maintain |
| Emotional trust and polish | 9.6 | 4 | The moment overlay and permanent story reel convert simulation facts into discovery, tension, failure, comeback, and vindication. | P2 variation |

No score caps apply. Accessibility, hierarchy, component consistency, task flow, and mobile parity all remain above their cap thresholds.

## System cohesion diagnosis

### Cohesion subscores

| Cohesion facet | Score | Diagnosis |
|---|---:|---|
| Visual grammar coherence | 9.5 | Workspace, dossier, live-match, decision, and archival surfaces use one palette and component language. |
| Intent coherence | 9.7 | Visual emphasis consistently points toward gathering evidence, making a call, or living with the outcome. |
| Interaction coherence | 9.5 | Similar actions use consistent buttons, cards, dialogs, radios, and persistent feedback. |
| Journey coherence | 9.7 | Prospects and decisions link forward into reports, people, outcomes, and historical records. |
| Brand-emotion coherence | 9.6 | Quiet professional tension is preserved from the pen-nib intro through the career newspaper callback. |

### Cohesive strengths

1. **One causal scouting loop.** Desk explicitly teaches Find, Verify, Recommend, Track; later screens use the same nouns and entities.
2. **Simulation depth has a visual form.** Uncertainty, conflicting claims, regional access, obligations, and long-term judgment are not hidden behind generic metrics.
3. **Emotional presentation remains text-authoritative.** Career moments add atmosphere and optional audio without hiding the factual consequence or making accessibility depend on motion.

### Remaining cohesion conflicts

1. The report writer and prospect dossier are coherent professional artifacts, but mobile users traverse very long single-column documents with limited section-level wayfinding.
2. Country and evidence surfaces use more 9-10 px metadata than the calmer Desk/Career surfaces, creating a small readability discontinuity.
3. Major moments now receive strong editorial/cinematic treatment, while ordinary weekly messages still share a more uniform card treatment; callback variety can deepen without adding another system.

## Findings by dimension

### Visual hierarchy

The Desk leads with a single weekly question and an explicit loop. Observation setup leads with venue context, then the situation modifiers, then the player pool and Begin action. The live view makes the pitch the dominant object while the desktop evidence feed and focus panel remain clearly secondary. Career moments correctly suppress background detail and focus attention on one causal outcome.

On mobile, Inbox decisions remain especially effective: deadline/default, tradeoffs, and the three choices read in order. The weakest hierarchy is the full report writer, where evidence board, presentation approach, category judgments, conviction, evidence builder, and price estimate all compete across a very long page.

### Layout and spacing

No targeted state produced document-level horizontal overflow at 390 x 844. The country browser now closes when a dossier opens, eliminating the overlapping two-panel state found during the first pass. The dossier becomes one scrollable drill-in; desktop preserves the map as context and mobile preserves the workspace header and bottom navigation.

The remaining issue is vertical, not horizontal. Report and dossier depth can require many viewport heights. This is acceptable for review, but repetitive navigation becomes costly for expert play.

### Typography

Segoe UI Variable Text provides a stable, platform-appropriate body face. Display headings are decisive without feeling like a sports broadcast. Uppercase tracked labels consistently mark metadata and sections.

The ceiling is compact metadata. The country map includes intentionally tiny SVG labels, and dense intelligence cards use many 9-10 px labels. Decision-critical prose is larger, but a design-token ratchet should prevent future systems from using microtype for instructions, tradeoffs, or causes.

### Color and contrast

Color roles are disciplined: emerald for primary/progress, amber for uncertainty and deadlines, violet for career decisions, cyan for operational presence, rose for risk/failure, and blue for selected tactical/regional state. Meaning is generally reinforced by text, icons, borders, or labels rather than hue alone.

The first Settings scan found nine serious contrast nodes and a heading-order issue. Helper text was promoted and card headings were made semantic h2 elements; the final mobile scan reports zero violations. Map/photographic surfaces still generate Axe incomplete contrast checks because the computed background is indeterminate, so visual review and manual high-contrast testing remain necessary.

### Components and states

The system now has credible purpose-built states: live pitch markers, focus tokens, evidence claims, unknowns, recruitment doctrine, regional presence, trip posture, decision defaults, political outcomes, story archives, and cinematic moments. They use the same border, radius, badge, heading, and action conventions.

The country browser/dossier stacking defect found during the audit was fixed. The map legend's labeled plain div was also given a valid group role. No misleading double-modal state remains in the final evidence.

### Interaction and feedback

Live Observation materially changes the character of the game. Players can direct attention on the pitch, choose a lens, spend scarce focus, flag a moment, watch atmosphere change the sample, and advance phases. The screen visually exposes stakes and misleading-sample risk before play begins. On mobile, phase actions stay fixed above the workspace navigation and focus controls use a dedicated sheet.

Regional travel adds an understandable posture choice rather than a single purchase button. Career moments show what happened, why it matters, and where the persistent record lives. The resulting interactions feel like judgment under uncertainty rather than spreadsheet maintenance.

### Information architecture and navigation

Desk, Planner, Prospects, Reports, World, and Career remain a strong permanent model. Inbox is a global action queue; Handbook, Roadmap, and Settings are correctly support destinations. Observation inherits the Planner context, dossiers inherit the relevant entity context, and Career acts as the durable archive.

The next IA improvement should be inside long artifacts, not another top-level workspace: a report/dossier section navigator, completeness summary, and jump-to-error behavior.

### Conversion or task-flow design

The product's conversion is from curiosity to conviction. The main menu states the fantasy, onboarding offers a dynamic prologue, and Desk immediately frames the scout's loop. The observed flow can reach a live venue, produce uncertain evidence, preserve competing claims, write a report for a real need, face an Inbox decision, and later reopen the consequence in Career.

This is much stronger than a dashboard collection because each workspace hands an entity or decision to the next. The controlled late-game evidence confirms the same loop remains legible when politics, travel, and historical callbacks appear.

### Accessibility and inclusive UX

Strengths include 44 px-class targets, visible focus treatment, semantic tabs/radios, explicit button names, focus trapping/restoration in the career-moment overlay, text equivalents for audio and motion, reduced presentation modes, and zero targeted horizontal overflow. Final targeted Axe scans have zero serious or critical violations.

This score remains provisional because automation cannot certify reading order, announcement quality, cognitive load, or real assistive-technology behavior. Complete the documented NVDA and VoiceOver journeys before calling accessibility release-certified.

### Imagery and iconography

Photography creates a consistent working-scout atmosphere: pen, desk, tunnel, stadium, pitch, and map. The stylized observation pitch is functional graphics, not decoration. The newspaper career record is the strongest thematic extension because it converts a database fact into a collectible memory.

Some generated player portraits remain less expressive than the surrounding premium photography. Portrait variation is a polish opportunity, not a comprehension problem.

### Brand visual system

TalentScout no longer looks like a generic dark admin interface. Its green/black scouting-room identity, evidence language, football-world map, live-match view, and archival newspaper make the scout role immediately recognizable. The restraint is important: high drama appears at career-defining moments rather than making every screen feel like broadcast television.

### Emotional trust and polish

The career-moment overlay is an effective bridge between simulation and emotion. It names the category, magnitude, date, causal summary, and connected stakeholders while offering Continue and Open career archive. The persistent story reel then preserves the original evidence gap and later football event. That pairing creates vindication without inventing facts.

Future gains should come from authored variation inside this system: more category-specific art direction, contextual audio cues, stakeholder callbacks, and layouts for failure, betrayal, comeback, promotion, and farewell.

## Prioritized recommendations

| Priority | Recommendation | Why it matters | Impact | Effort | Acceptance criteria |
|---:|---|---|---|---|---|
| 1 | Add expert section navigation to reports and dossiers | Preserves depth while reducing repeat scrolling and recall burden. | High | M | Sticky/compact section index on desktop and mobile; completion/error counts; jump-to-first-required-field; no duplicated state authority. |
| 2 | Ratchet decision-critical typography and contrast tokens | Prevents new depth from being expressed as unreadable microcopy. | High | M | Body/helper copy at least 12 px where it explains cause, tradeoff, or action; metadata at least 10-11 px; automated token lint or visual regression; 4.5:1 text contrast. |
| 3 | Complete manual assistive-technology certification | Automated Axe cannot prove the actual game journey. | High | M | NVDA and VoiceOver users can complete onboarding, schedule, observe, report, resolve a decision, and open Career without pointer input; issues recorded and closed. |
| 4 | Expand career-moment presentation families | Increases replay value and emotional memory without another feature category. | Medium | M | At least five visibly distinct category treatments; each preserves identical text and reduced-motion behavior; no repeated cue within a short callback window. |
| 5 | Moderate the first hour with new and returning simulation players | Confirms the strong designed flow works without developer knowledge. | High | M | Target tasks and thresholds defined before sessions; observe first discovery, report, and callback comprehension; SUS/task completion meet release gate. |

## Implementation acceptance criteria

- All six workspaces and the targeted observation, country, decision, settings, and career-moment states retain zero serious/critical Axe violations at desktop and mobile.
- No document-level horizontal overflow at 390 px; fixed action bars do not obscure the final focusable control.
- Country browsing presents one active drill-in surface at a time and restores focus to the invoking control on close.
- Report and dossier navigation exposes completion, errors, and section jumps without changing simulation state.
- Decision-critical instructions, causes, and tradeoffs never rely on sub-12 px type or color alone.
- Career moments preserve factual title, date, cause, stakeholder links, reduced-motion parity, optional audio, and a direct archive route.
- Manual NVDA and VoiceOver journeys complete without a mouse and with understandable announcements.
- A moderated first-hour study validates that players can explain Find, Verify, Recommend, Track and can identify why their evidence remains uncertain.

## Release interpretation

The rendered product is a **9.3/10 design candidate** and its **9.6/10 System Cohesion** is the key achievement of this tranche. Observation, geography, career consequence, and historical memory now strengthen the same scouting fantasy. This audit does not replace final engineering, packaged-platform, hardware, screen-reader, or moderated-usability gates.
