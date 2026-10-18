# Talent Scout: rendered visual and gameplay baseline audit

Candidate: `8b9ce2eb36ceec270cc50e1a66a576848f40b038+sha256:686562dfc41169ebbd3549565a9d09adfae84db00cf3e811208cd66f0d427cd7`. Captured 4 September 2026 from the isolated `talentscout-visual-overhaul` checkout at `http://localhost:3105/play`. Frozen source is in `visual-overhaul-20260904/baseline-source`. This is the **before** assessment, not a claim about the implemented overhaul.

## Executive assessment

The game has a coherent scouting loop and several strong atmospheric images. Its presentation does not yet sustain the professional football fantasy. Cartoon face discs undermine the most important human subjects; wide fields, very small text, repeated summaries, multicolored nested cards and oversized empty states compete with decisions. Mobile frequently preserves every desktop explanation and pushes the actual action below the first viewport. Routine focus selection opens a full-screen backdrop, then the mentor can add another dimming layer.

Preserve the useful foundation: dedicated Watch chrome, named sources, evidence before claims, explicit unknowns, report validation, responsive navigation and good main-menu atmosphere. Rework the presentation around a recognizable footballer, a current scouting question, the evidence that changed the opinion, and one next action.

## Evidence and limits

- Four requested viewports: 1920×1080, 1366×900, 834×1112 and 390×844. First viewport at every size; additional full-page desktop/mobile images. `captures/index.json` is the authoritative inventory, with screenshot path, actual screen, dimensions, provenance and overflow result for each capture.
- Final inventory: **320 unique viewport captures across 80 named capture scenarios, all 32 allowed routes, plus 160 full-page images**. Scenario count includes repeat real-career recovery captures; it does not mean 80 unique mechanics. The raw 328-record attempt ledger is preserved in `captures/capture-attempts.json`. No document/main horizontal overflow was detected, but field labels visibly collide on mobile.
- Real UI career: create Maya Reed, take the call, enter the school match, select technical focus, advance, flag a promising moment, choose the halftime approach, observe pressure, classify evidence in reflection, keep the name private, file the initial assessment, resolve a day choice and advance to Week 2. Browser read-back: **Season 1, Week 2, one report and five observations**. See `captures/real-flow-summary.json` and `captures/real-flow-state.json`.
- Other states are explicitly seeded: a fresh Week-12/Tier-2 youth career for route and empty-state breadth; existing repository showcase fixtures for Tier-5 career/world/rival context and a report with classified evidence. Second comparison report is a clone assigned to another unsigned youth solely to exercise rendering; season recap totals are synthetic. Neither proves real season completion, transfers or career outcomes.
- Every currently allowed destination is represented by route captures. Nine future destinations are excluded by the current Youth Early Access scope. Cloud sign-in is disabled by `BETA_CLOUD_SAVES_ENABLED = false`; there is no reachable login to judge in this build. Do not count a redirect, disabled feature or empty state as its future populated experience.
- Core automated accessibility scans are in `captures/axe.json`. Report Comparison has serious contrast failures; the rest of the scanned core states have no serious/critical failures. Axe does not certify usability, full keyboard operation or all conditional modals.
- There are 34 core Axe scans including repeated fresh-career runs. Only the two populated comparison scans have serious violations, each with 42 failing text nodes. Observation lacks a level-one heading and initial report/comparison have heading-order issues, rated moderate by Axe.
- Primary screens were personally inspected from screenshots. A second reviewer inspected all 15 secondary destinations on desktop/mobile plus four full pages; their complete screen notes are appended below and preserved in `secondary-review.md`.
- Screenshots use reduced motion. Normal-motion quality, long-term aging, retired-player comparisons, fully populated alumni, every political-meeting branch, save-corruption recovery, real account/network errors and a genuine season rollover remain outside this baseline's executed evidence. These are visible gaps, not presumed passes.
- One infrastructure restart was required after another task's shared build conflicted with the original server. The isolated checkout solved it. Two old E2E-helper selectors also differed from current UI; both failed attempts remain in `captures/errors.json`, and the actual loop was completed using the observed current controls. These are harness failures, not evidence that the product itself was blocked.
- Separate root-agent journey observation: the root reported that new-career scroll position carried into the first inquiry briefing at 1280×720. This transition mechanism was not independently reproduced in this harness and no root screenshot path was supplied. Treat it as an unconfirmed journey finding pending the root's code/behavior check. The seeded setup's partially scrolled view is related rendered evidence, not proof of the same cause.

## Scorecard

Scores are editorial judgments supported by the following rendered observations, not measurements of test pass rate. All 12 dimensions use equal weight for the base score. Overall uses 75% base plus 25% independently assessed cohesion, rounded to a whole point.

| Dimension | Before /10 | Evidence and practical implication |
|---|---:|---|
| Visual hierarchy | 4.5 | Desk repeats the same planning priority in five places; mobile Planner hides the opportunity selection below repeated framing. |
| Layout and spacing | 5.0 | Stable shell, but very wide text/empty panels on desktop and tall sequences of nested panels on mobile. |
| Typography | 5.5 | Headings are legible; 10–12px labels and notebook script weaken core evidence readability. |
| Color and contrast | 6.0 | Most core screens pass automated contrast; comparison has 42 failing elements per inspected size. Accents change between gold, green, cyan, purple and red without a clear action hierarchy. |
| Components and states | 4.5 | Similar choices use many different cards, tabs, pills and overlays. Disabled actions sometimes dominate mobile footers. |
| Interaction and feedback | 6.0 | Real observation/report/week loop works; feedback exists, but focus and mentor layers interrupt the subject being taught. |
| Information architecture and navigation | 6.0 | Six youth workspaces and Watch separation are sensible; secondary routes have inconsistent return paths. |
| Task-flow design | 5.0 | Evidence gating protects decisions. Routine first report and planning require excessive scrolling and repeated explanation. |
| Accessibility and inclusive UX | 6.0 | Core semantics largely pass; comparison contrast and small metadata remain material. Mobile portrait overlap is visible despite no page-width overflow. |
| Imagery and iconography | 3.0 | Strong environmental photos coexist with childish faces, emoji rewards and unrelated player photographs in report wallpaper. |
| Brand visual system | 4.5 | Office/pitch atmosphere works, but admin metrics, neon-like status accents and collectible achievement styling fight the documentary identity. |
| Emotional trust and polish | 4.5 | Human identity vanishes in comparison; empty legacy pages show zeros before stories; subjects look like cartoons. |

**Base Design Score: 50/100. System Cohesion: 4.5/10. Overall Design Score / before visual quality: 49/100.**

Caps applied: hierarchy below 5 caps overall at 70; component consistency below 5 caps cohesion at 6.5. Both are nonbinding because the uncapped result is already lower. Accessibility is not below 4, so its 65 cap does not apply. Mobile has serious local shortcomings but was not scored at least three points lower across the whole system; the 75 mobile cap therefore does not apply. State usually has words/icons in addition to color, so no blanket color-only cap is asserted. Missing conditional/long-horizon evidence prevents treating this as a comprehensive product-readiness score.

## Cohesion diagnosis and redesign thesis

The same game alternates among documentary photography, a notebook, a bright administrative dashboard and cartoon character tokens. Primary action color varies by destination; almost every fact gets a border or badge. Repeated summaries describe how the interface is supposed to work instead of letting the hierarchy demonstrate it. The main menu already promises an atmospheric career. The transition into the field should retain that promise through believable faces, controlled typography and concise analytical overlays.

Use one restrained charcoal/warm-white/forest/amber system. Treat a player as a persistent person with a photograph, name, age, role and evidence context. Present observation as a timestamped notebook margin over the match, reports as a dossier, comparisons as a decision between named people, and the Desk as this week's one current case plus a compact queue. Preserve the game model's distinction between world truth and scout belief.

## Priority findings and acceptance criteria

1. **P0 for the requested visual mission: persistent human portraits.** Replace face discs on observation/profile/report/discovery surfaces. Resolve the same player identity and current age everywhere, including unsigned and retired entities. Acceptance: cross-screen image identity remains recognizable; adolescence, adulthood and veteran states visibly differ without becoming different people; routine refresh performs no regeneration.
2. **P1: comparison loses player identity.** `rich-reportComparison-desktop.png` displays “Unknown” for a UI-filed report whose player is correctly named Alfie Lampard in `rich-reportHistory-desktop.png`. The second entry is a synthetic cloned report; the first is sufficient to demonstrate the bug. Source: `ReportComparison.tsx` resolves from `state.players` while profile uses shared resolution. Acceptance: unsigned/active/retired names and portraits resolve; reported beliefs and confidence remain intact.
3. **P1: field subjects overlap on mobile.** `04-observation-live-tutorial-mobile.png` and `seed-observation-live-mobile.png` show portrait/name collisions, hiding Glen Watson and other names. No document overflow does not mean no overlap. Acceptance: every subject can be identified and selected at 390px; selected player is visually primary; no overlapping labels; the match remains visible.
4. **P1: nested focus/tutorial overlays.** `05-observation-focus-dialog-desktop.png` shows a near-full-width focus sheet behind a second dimming mentor layer. `11-opening-discovery-desktop.png` dims the player and evidence while highlighting the decision. Acceptance: desktop focus is a contextual panel/dock; mentor hints leave the scene and target readable; Escape and keyboard focus remain correct; mobile sheet stays reachable without covering its own target.
5. **P1: report/weekly hierarchy consumes the action.** Initial report is roughly 3,763px tall at the captured laptop width; mobile Planner cannot show a day/opportunity in its first viewport. Acceptance: keep the immediate question and actionable choice visible; group choices without repeated framed descriptions; provide an honest progress indicator and reachable final action; preserve all evidence/validation logic.
6. **P1: common card and copy repetition.** Desk repeats “7 days ... unallocated” in header signals, priority, next-step panel and weekly panel. Inbox/Network repeat the same entities. Acceptance: one authoritative row/section per item; one primary CTA; statistics and explanations appear only when useful.
7. **P1: comparison contrast.** `captures/axe.json`: 42 nodes per desktop/mobile comparison scan. Typical text `#71717b` on `#11161c` is 3.76:1 at 12px; darker 10px labels are 2.35:1. Acceptance: text reaches at least 4.5:1, chart labels remain legible, and core scans have no serious/critical failures.
8. **P1/P2: empty and return states.** Missing season data yields only “No awards data available.” without navigation; many empty career pages lead with zero metric grids. Acceptance: one useful empty-state explanation and a concrete next action; all reachable pages provide an immediate return route.

## Screen-by-screen primary audit

### Main menu / landing — P2
Purpose: enter or resume a career. Desired emotion: anticipation and professional belonging. Primary action: Start Youth Scout Career or Continue when a save exists. Information: current mode and save availability. Evidence: `01-main-menu-{desktop,mobile}.png`. The office/stadium image, restrained central composition and clear gold start action are strengths. The small description is dense and the wordmark differs from some in-game branding. Preserve the atmosphere, tighten the typographic hierarchy and show the most relevant save when present. Two-second test: passes for new-career action.

### New career / scout identity / onboarding — P1
Purpose: establish the scout and choose the opening approach. Emotion: curiosity and agency. Primary action: Take the call. Information: identity, chosen scouting edge and immediate assignment. Evidence: `02-new-career-*` and full-page variants. Mobile starts with a large identity box followed by another long assignment box; explanatory guide content and choice cards extend the flow considerably. Names/forms work and optional customization is progressively disclosed. Reduce repeated framing, retain compact optional identity details and make the scouting-edge choice read as an immediate approach to a specific football situation. Two-second test: partial; the assignment is understandable but the next meaningful choice is delayed.

### Observation arrival / inquiry selection — P1
Purpose: choose what to learn and begin the watch. Emotion: anticipation with limited certainty. Primary action: choose a scouting question and Watch the match. Information: context, players, question and attention constraints. Evidence: `03-observation-arrival-*`, `seed-observation-setup-laptop.png`. The setup uses a very narrow central context stack, then six heavily framed question cards. Recommended badges can squeeze question text into extremely narrow lines. The same situation clause is repeated across choices. The seeded setup also renders midway down the internal scroller while the outer capture is at the top, corroborating a transition/scroll concern. Use a compact match briefing, concise question choices in practical responsive columns and explicit route scroll restoration. Two-second test: fails when heading/context is scrolled out of view.

### Live observation / player focus / lens / moments — P1
Purpose: direct limited attention, notice actions and form uncertain beliefs. Emotion: being beside the pitch, discovery and doubt. Primary action: watch the chosen player, flag evidence, advance the passage. Information: subject, time, context, focus cost, what was actually observed, confidence. Evidence: `04` through `09`, `seed-observation-live-*`, focus-dialog captures. The football background is substantial and dedicated Watch chrome removes irrelevant navigation. Cartoon floating heads, duplicated subject strip, tiny field labels and full-width feed cards weaken immersion. On mobile the heads/names collide. Focus is hidden in a modal and mentor can dim it again. Replace portraits and field labels; use a restrained subject rail with clear selected subject, compact focus/lens controls and a readable observation timeline. Preserve uncertainty and contextual phrasing. Two-second test: partial on desktop, fails for subject identity on mobile.

### Reflection — P1
Purpose: distinguish the recorded event from the interpretation and retain useful evidence. Emotion: deliberate judgment. Primary action: classify the passage and complete reflection. Information: evidence source, what was learned and what is unknown. Evidence: `10-reflection-*`. The interaction is materially relevant and completed successfully, but mentor framing and another full-screen dark layout break continuity. Present reflection as the final notebook entry beside the observed player's identity; keep evidence and classification visible together. Two-second test: workable, with excessive framing.

### Opening discovery / first recommendation — P1
Purpose: decide who hears a promising name. Emotion: possibility, responsibility and uncertainty. Primary action: protect the lead, call a club or verify with the source. Information: signal, unresolved question and consequences of sharing. Evidence: `11-opening-discovery-*`. These are meaningful, human football choices; “One exceptional action is a lead, not proof” is a strong principle. Huge choice cards, many consequence pills and mentor dimming obscure the player/evidence. Give the player a real portrait and show the three choices as concise editorial options with one tradeoff each. Two-second test: action visible, contextual player identity obscured by tutorial.

### Desk / dashboard — P1
Purpose: identify what matters this week. Emotion: purposeful control. Primary action: resolve the leading case/commit the next day. Information: current assignment, deadline, pending evidence and messages needing an answer. Evidence: `seed-dashboard-*`, `rich-dashboard-decisions-*`. The priority concept is useful. Current presentation repeats the same concern throughout several large cards, labels an unfilled planner “Critical”, and uses both red and gold Open planner actions. Developer-like “authoritative source” and queue descriptions add no gameplay value. Use one leading case, one short explanation, one CTA and compact secondary queue. Two-second test: broad priority understandable, action hierarchy noisy.

### Planner / assignment and fixture selection — P1
Purpose: allocate seven scarce days. Emotion: tradeoff and anticipation. Primary action: choose an opportunity and commit a day. Information: duration, evidence value, travel/fatigue cost and availability. Evidence: `seed-calendar-*`, `recovery-14-first-week-planner-*`. Desktop offers a useful weekly strip, but three layers restate open days and mobile shows headers/stance before slots or opportunities. Many unrelated colored boxes compete. Make the week strip and selected opportunity the first content, then costs and confirmation. Future fixture browser redirects here in this build; do not invent a separate fixture-screen review. Two-second test: fails on mobile because actionable schedule content is too far down.

### Week progression / results — P1
Purpose: resolve planned choices and see consequences. Emotion: a week unfolding with responsibility. Primary action: choose the current approach then advance; view results at completion. Information: day, activity, choice, evidence and final changes. Evidence: `recovery-week-simulation-in-progress-*`, `recovery-15-second-week-planner-*`. The seven-day route and real choice make the week legible. Repeated Commitment/Context framing nests panels, while the current choice can be low in the viewport and a disabled Next Day dominates. Keep the decision beside the current day heading and explicitly pair its completion with the available Next Day action. Actual Week 2 read-back confirms the flow works with the current controls.

### Prospects / shortlist — P1
Purpose: maintain a set of players worth another look. Emotion: curiosity and ownership. Primary action: inspect or follow up the highest-value prospect. Information: identity, age/role, last look, unresolved question and next action. Evidence: `seed-youthScouting-*` and populated detail captures when present. Empty state correctly suggests discovery work, but four zero cards and seven sorting controls precede it. Collapse empty scaffolding; use photographic subject rows/cards with meaningful current questions when populated. Keep watchlist selection attached to the same persistent player. Two-second test: empty purpose clear, needless controls increase load.

Populated evidence: `detail-prospects-populated-desktop.png` shows four organically discovered players after the completed first week. Each repeats the same generic open question/next-test text, while small face discs sit apart from the names across very wide cards. The player-specific evidence should distinguish these subjects before filter controls and buzz bars do.

### Player profile / decision, evidence, development, history — P1
Purpose: assess a specific human prospect and choose the next test. Emotion: curiosity, growing familiarity and calibrated confidence. Primary action: plan the missing evidence or file a supported report. Information: recognizable face, age/role, observation context, claim/uncertainty, development and history. Evidence: `seed-playerProfile-unknown-*`, `rich-playerProfile-observed-*`, profile detail captures. The Decision/Evidence/Development/History structure is useful. The cartoon face is prominent, metadata/pills crowd identity, and repeated brief-fit/risk cards dominate the unknown player's screen. Mobile pins a disabled Build report evidence first button over content while the actually available Plan first observation action sits lower. Use an editorial dossier header, surface the useful current action, make uncertainty legible and preserve separate evidence/development/history views. Two-second test: who is clear by name; what to do is weaker than necessary.

Further observed tabs: `detail-profile-evidence-desktop.png` correctly presents bounded attribute ranges and unknowns rather than exact underlying attributes; retain that strength. Its Current Ability/Potential labels and red confidence dots need clearer “estimated”/confidence wording near the stars. `detail-profile-development-desktop.png` is a sparse early-career state with position/foot/value and buzz/visibility, not a real progression history. In `detail-profile-history-mobile.png`, the persistent identity/action stack consumes almost the entire viewport before History content begins.

### Report writer / initial assessment / professional report — P1
Purpose: make an accountable recommendation from classified evidence. Emotion: thoughtful conviction with acknowledged risk. Primary action: complete the missing judgment and file. Information: subject, evidence, interpretation, unknown, next test, recommendation, confidence and audience. Evidence: `12-initial-report-empty-*`, `recovery-13-initial-report-ready-*`, `rich-reportWriter-*`, `rich-reportWriter-final-*`. The evidence gate and explicit uncertainty are strong. Initial assessment is a very long series of radio-card groups; the professional flow keeps large completed sections above the current step and mixes translucent forms with background football photographs. Shorten the visual scaffold, use a dossier composition and focus each current decision; preserve source citations, validation and all decision consequences. Two-second test: destination clear, immediate unfinished decision can be buried.

### Report history / recommendation follow-up — P1
Purpose: find filed judgments, see club response and manage accountability. Emotion: professional ownership. Primary action: follow up the report requiring attention. Information: named player, recommendation, confidence, current audience/status and next action. Evidence: `seed-reportHistory-*`, `rich-reportHistory-*`. Empty mode is a large tutorial-like artifact panel. Populated mode gives a long paragraph and huge mostly-empty comparison tray equal weight, then repeats the same report in accountability lanes. Names work here, contrasting with comparison. Use a compact report ledger and an expanded dossier for the selected report; show the comparison tray only when selected; keep the next action once. Two-second test: report identity clear, repeated management framing slows the task.

### Report comparison — P1
Purpose: decide which recommendation is better supported for the role. Emotion: clear-headed judgment under uncertainty. Primary action: compare evidence quality, role fit and risk. Information: named subjects, confidence, common/different evidence, unknowns and action. Evidence: `rich-reportComparison-*`, Axe logs. Both unsigned-youth entries show Unknown and no portrait. Tiny gray metadata fails contrast, “Legacy Avg Attr” exposes internal terms, and large equal card summaries resemble a data tool. Fix identity resolution, include persistent portraits, lead with meaningful differences and retain the existing safeguards against comparing incompatible report metrics. Two-second test: fails; player identity is missing.

### World / location / assignments — P1
Purpose: choose a scouting territory or international assignment. Emotion: scope, opportunity and place. Primary action: inspect an available destination/assignment and plan travel. Information: presence/familiarity, access, costs, deadline and deliverables. Evidence: `seed-internationalView-*`, `rich-internationalView-*`. The large map creates scale, but clustered European/African markers overlap, small labels are hard to distinguish and the map lacks a clear immediate target when no assignment exists. Keep map atmosphere with collision-safe markers and a legible country list; show the selected country's opportunity, cost and next action in one panel. Two-second test: location is evident, next decision is not always obvious.

### Finances / resources — P2
Purpose: preserve the ability to keep scouting. Emotion: control with credible financial pressure. Primary action: address short runway or evaluate the cost of planned work. Information: cash, recurring obligations, available income and runway. Evidence: `seed-finances-*`. It is a conventional dashboard: four headline cards, run-rate strip, four agency metrics, two breakdown cards and a twelve-week row. Much is zero in this fixture. Lead with runway and the one practical income/cost decision; show an honest ledger on demand. Keep exact amounts and distinguish recurring/variable income. Two-second test: cash/runway visible, actual next action absent.

### Season recap / end-of-season — P1
Purpose: reflect on how judgments affected careers and continue. Emotion: earned pride, regret and anticipation. Primary action: review meaningful outcomes then continue. Information: players who changed, original vs current view, reputation/economy and next season. Evidence: `rich-seasonAwards-*` is synthetic recap; `seed-seasonAwards-*` is actual no-data route. The atmospheric sunset stadium is strong, but generic metric blocks and empty awards occupy the page; no player relationship is visualized. Empty route has no return control at all. Lead with named player stories and age progression, use statistics second, and always provide a return path. No real season/aging outcome is established by this fixture.

### Demo completion — P2
Purpose: explain the demo limit and next option. Emotion: motivation to continue. Primary action: get Early Access or return. Information: continuation scope. Evidence: `seed-demoEnd-*` is a direct route capture, not an actual completed demo. The page is simple and clear but reads as a feature list without the player's particular journey or discovered people. A concise career highlight and recognizable prospect would make the transition personal; preserve accurate build entitlement text.

### Save/load/recovery and feedback dialogs — P2
Purpose: protect progress or communicate a problem. Emotion: confidence and control. Primary action: select a save action or prepare feedback. Information: slot/time/source/recovery and clear field labels. Evidence: `dialog-manage-saves-*`, `dialog-feedback-*`. These are coherent utility modals with visible close controls. Small slot actions and dim metadata deserve improvement, but their contained nature is justified. Recovery tabs were present; destructive overwrite, corrupt-save recovery and external feedback submission were not exercised. Keep these modals; they differ from routine focus selection in consequence and frequency.

## Secondary screen audit

The complete observed purpose, emotion, primary action, required information, problems, strengths, improvement and priority for Network, Inbox, Scouting Team, Discoveries, Performance, Alumni, Achievements, Hall of Fame, Equipment, Agency, Training, Rivals, Handbook, Settings and Future Roadmap are in [secondary-review.md](../../visual-overhaul-20260904/proposals/rendered-audit/secondary-review.md). This is part of this audit, not an unaudited future-work list.

## Before/after acceptance contract

Use the same viewport set and, where practical, saved `real-flow-state.json` plus the deterministic seeded fixtures. Compare actual subjects and interaction states, not a clean screenshot against an artificially crowded fixture. After implementation, complete one fresh real opening/report/week loop and inspect: identity across observation/profile/report/comparison/history; age checkpoints using controlled persisted identities; first viewport hierarchy; phone field-marker collision; sticky footer occlusion; focus and mentor behavior; report evidence/uncertainty; saved progress; and core Axe. Record remaining conditional/long-horizon gaps explicitly. A shared palette alone is insufficient if major screens retain repeated content or overlapping subjects.

<!-- secondary-audit-embedded -->

# Secondary screens: rendered baseline review

Evidence: `before/seed-{screen}-{desktop,mobile}.png` under `visual-overhaul-20260904`. All 15 screens below were visually inspected at 1920×1080 desktop and 390×844 mobile. Additional desktop full-page screenshots were inspected for Equipment, Hall of Fame, Agency, and Settings. These are synthetic week-12, tier-2 layout/empty-state fixtures, not a genuine played career or verified career outcomes. No interactions or product edits were performed by this reviewer. Screenshot contrast concerns below are visual observations, not measured WCAG ratios.

## Shared findings

- The common mobile navigation is compact and legible, but the fixed lower bar leaves only about 725px for content. Repeated summaries consume that space before decisions appear. The development indicator overlaps the Desk icon in these captures; exclude it from final player-facing captures.
- Global Career remains the selected navigation group for many distinct destinations. Page titles communicate the destination, but screens rarely provide an obvious local return action or next step.
- Busy photographic backgrounds show through fine text and many nested bordered panels. They usually function as wallpaper; they do not identify people, places, or this week's situation. The background ends abruptly on several short pages, leaving a large blue-black remainder.
- Text that explains unavailable content is often the faintest text on screen. A locked action may be subdued; its requirement still needs to be readable.
- Repeated metric cards and section summaries are the most pervasive problem. The same zero values or messages are repeated, while the action that would change them is missing or delayed.

## Network — P1

- Purpose/emotion: maintain sources and address relationship risk; feel connected and aware of fragile access.
- Desired primary action: open the contact whose situation needs attention and decide how to repair or advance the relationship.
- Important information: who, current issue, why it matters this week, relationship history, available response.
- Observed: five contacts exist. Four names appear in a large Active threads section and repeat as detailed contact cards below. Every highlighted thread says the identical “Pressure is building around this relationship.” Green Adversarial badges read like positive statuses; the Threatened lines counter is amber while dormant lines is red even though its value is zero. Desktop exposes four large contact cards below two enormous summaries. Mobile's entire first viewport is the repeated thread list; relationship/trust details are below it.
- Strength: named people, roles, organizations, and relationship/trust measures establish the correct subject matter. The explicit pressure summary is useful if it becomes specific.
- Improvement: make one compact people list with the current concern directly beneath each name, a clearly labeled Open contact action, and a restrained amber/red adversarial status. Put network totals in a secondary strip. Avoid duplicating the same people in two lists.

## Inbox — P1

- Purpose/emotion: respond to football-world developments; feel that messages connect choices to people and consequences.
- Desired primary action: read the highest-priority unread message requiring a decision.
- Important information: sender, subject, time, unread state, whether a response is needed.
- Observed: the two Welcome messages appear three times: Decision queue, Live threads, and the actual inbox list. Neither visible welcome message is a live pressure decision, despite the queue's framing. Desktop has multiple large translucent black boxes over a detailed office photo; body previews in the list have especially weak contrast. Mobile reaches only partway through the second repeated summary section before the lower navigation; filters and canonical message list are below the first viewport.
- Strength: unread count and unread dots make state identifiable without relying exclusively on color. Mobile offers Mark all read near the title.
- Improvement: one message list with concise sender/subject/preview rows; pin only genuinely actionable deadlines in a compact strip. Reading should open a focused conversation view. Remove duplicate summaries when they contain the same messages.

## NPC Scout Management — P2

- Purpose/emotion: understand the future responsibility of running a scouting team; feel aspiration rather than rejection.
- Desired primary action in this fixture: view the route to Head of Scouting or return to the current career objective.
- Important information: Tier 4 unlock, current tier, concrete next progression requirement.
- Observed: this is a locked state, with no scout list. A tiny generic team icon and two faint centered lines sit over an office photo. “NPC” appears in the page title, exposing simulation terminology. There is no contextual action. The photo stops at about 380px desktop / 456px mobile, leaving most of the viewport empty blue-black.
- Strength: required and current tier are explicitly stated.
- Improvement: title it Scouting Team, show a short aspirational description of delegation, present the next achievable prerequisite, and link to Career progression. Use a deliberate full-height atmosphere or a contained illustration rather than a hard image cutoff.

## Discoveries / Career Tracker — P1

- Purpose/emotion: revisit original judgments against later careers; anticipation now, accountability and emotional continuity later.
- Desired primary action in this fixture: open reports or scout a prospect to start a tracked career.
- Important information: how tracking begins and what will be preserved.
- Observed: this is empty: zero tracked careers, zero validated calls, no accuracy. Three large zero/dash cards and three sorting buttons precede the empty panel. Desktop Ask Tommy overlaps the upper-right sorting controls. Mobile spends roughly 500px on title, useless sort controls, and zeros before explaining that a report begins tracking. No direct action accompanies the guidance.
- Strength: “Track your original calls against the careers that followed” is clear and connects to the core scouting promise.
- Improvement: hide sort and summary scaffolding while empty. Lead with the first report action and a compact explanation of the future before/after player timeline. When populated, lead with players and original/current assessments, not abstract counters.

## Scout Performance — P1

- Purpose/emotion: understand judgment quality and choose how to improve; reflective confidence without pretending immature evidence is conclusive.
- Desired primary action in this fixture: file the first supported report; later inspect one meaningful calibration result.
- Important information: evidence maturity, what is and is not yet evaluable, next milestone.
- Observed: mostly empty analytics. Six top metric cards, nested Report Craft and Discovery Stats cards, Financial Performance zeros, empty Quality Trend, empty Industry Comparison, and a long dim Career Milestones checklist compete. Mobile shows six metric cards and empty Report Craft before any calibration context. The desktop explanation “Uses one latest judgment per scouting case...” reads as implementation detail and gets more room than an actual next action.
- Strength: the Judgment Calibration panel explicitly says no professional cases yet, and unresolved careers remain pending. This protects the distinction between evidence and truth.
- Improvement: make the empty screen a brief calibration introduction with one current objective. Show a small tier/reputation summary; hide charts until evidence exists. Later use an editorial accuracy trend and a few case examples, with confidence/maturity near the headline measure.

## Alumni Dashboard — P1

- Purpose/emotion: follow young players the scout helped place; pride, attachment, and long-term consequence.
- Desired primary action in this fixture: discover and recommend the first unsigned youth; later revisit a named player's development.
- Important information: how alumni enter this view and their actual career milestones.
- Observed: this is empty: no youth placed. A Legacy Score container encloses four more metric cards, each zero, with blue/gold/purple/cyan decorative accents. On mobile the entire first viewport is the zero Legacy Score system; even the explanation of how to start is below the fold. Desktop has a huge trophy placeholder and faint empty-state copy.
- Strength: the title and subtitle clearly identify the concept; the empty-state wording explains the required activity.
- Improvement: rename the destination Alumni or Your Players; lead the empty state with Discover youth / Review prospects. Collapse zeros. Once populated, player photographs, discovered age, first placement, and current role should carry the page, with legacy totals secondary.

## Achievements — P2

- Purpose/emotion: recognize milestones and suggest attainable challenges; satisfaction and motivation.
- Desired primary action: inspect the next relevant milestone or return to the activity that advances it.
- Important information: recently earned, nearly earned, and why an achievement matters.
- Observed: fixture shows 7/60 unlocked. Large total progress bar, nine category pills, a four-column card grid, emoji icons, category badges, rarity words, and individual progress bars create a collectible-game vocabulary. Locked tiles are heavily dimmed over a detailed trophy backdrop. Mobile's nine filters use four lines; only two earned achievements fit before the lower navigation. All achievements have near-equal prominence regardless of relevance.
- Strength: earned/unearned is reinforced by trophy/lock icons, and the unlock counts are explicit.
- Improvement: present a restrained honors ledger with Recent recognition and Next milestone before the full catalog. Replace emoji with one consistent line-icon set or documentary award marks. Put category selection in one compact control; ensure locked requirements remain readable.

## Hall of Fame Snapshot — P1

- Purpose/emotion: reflect on a career's identity and legacy; pride and continuity, even during an active career.
- Desired primary action: read the career story and return to the active career.
- Important information: this is a live snapshot, what has shaped this career, key players/outcomes, return control.
- Observed: this fixture has no reports/observations/discoveries and a zero legacy score. Large scout portrait and stadium photo create a stronger ceremonial identity than ordinary screens. However, the initial viewport is dominated by totals; the meaningful “What this career is becoming” story sits after a long zero-filled Legacy Breakdown. Full-page inspection confirms Back to Career and Main Menu exist only at the bottom. Main Menu is bright green while return to the ongoing career is gray. Mobile loses both ordinary navigation bars and has no return control above the fold.
- Strength: clear statement that viewing does not end the save; real visual atmosphere; eventual career-story treatment has useful emotional intent.
- Improvement: put Back to career at the top and make it the primary final action. Lead with career identity and representative players; collapse empty statistical breakdowns. Preserve active-versus-retired context without making it a technical warning paragraph.

## Equipment — P1

- Purpose/emotion: understand scouting tools and choose an upgrade; prepared, practical, competent.
- Desired primary action: inspect a tool's effect and a reachable upgrade.
- Important information: owned item, gameplay benefit, upgrade price/requirement, affordability.
- Observed: five equipped entries are shown, not an empty state. All are flat text tiles: Spiral Notepad, Basic Laptop, Public Transport Pass, Personal Phone, Pen & Paper Stats, with T1 beneath. Full-page inspection confirms the page ends there. The heading promises upgrades, but no visible benefit, purchase, upgrade, or explanation is presented. The inner panel repeats the page title Equipment. Desktop leaves the majority of the screen unused; mobile's two-column tiny metadata fits but gives no clear affordance.
- Strength: five tool categories are understandable and grounded in scouting life.
- Improvement: show compact equipment rows with current benefit and View upgrade. If unavailable here, explicitly link to the actual upgrade destination. Use a few grounded tool images or documentary details only where they add recognition; replace unexplained T1 with a readable equipment grade.

## Agency — P1

- Purpose/emotion: invest in a sustainable scouting practice; control and strategic tradeoffs.
- Desired primary action: compare a useful upgrade against available funds and recurring cost.
- Important information: current funds, one-time price, weekly commitment, actual scouting benefit, unlock conditions.
- Observed: Weekly Infrastructure Cost and Report Quality Bonus appear twice before any purchase. Mobile first viewport contains only roadmap and duplicated summary values; actual upgrade choices occur much later. A huge Current Modifier Ledger section contains mostly explanatory copy and one disclosure. The Data Subscription section adds another nested Live systems callout before three plan tiles. Full page repeats the same large panel treatment for Travel Budget, Office Equipment, and Investment ROI. All upgrade buttons are equally bright gold. Zero infrastructure cost is red, creating false alarm.
- Strength: one-time and weekly costs are presented together, with Cannot afford states and concrete bonuses.
- Improvement: one compact budget/commitment line above an investment list. Put primary benefit, price, recurring cost, and current item together. Move modifier audit details behind a small disclosure below the decision. Use neutral zero cost, clear tier labels, and one selected upgrade action.

## Training & Courses — P1

- Purpose/emotion: improve scouting ability and earn career qualifications; progress and deliberate investment.
- Desired primary action: enroll in the next eligible course after understanding cost and time.
- Important information: available course, prerequisite, weeks, money, benefit, progression unlocked.
- Observed: no completed courses. Desktop allocates a full-height left column to Completed (0), two Not met qualification bars, and blank space. Most catalog courses are dimmed so far that prerequisite explanations are hard to read. The Level 2 prerequisite is printed twice. Mobile shows the empty completion panel first, then the one usable Level 1 enrollment. Small badges and metadata compress the payoff, while the enrollment button is small relative to its container.
- Strength: one eligible course is visually distinguished, and money/duration/benefit are visible. Locked stages explain progression rather than disappearing entirely.
- Improvement: lead with Next qualification and an eligible course row. Move Completed to a collapsible history. Present future courses as a readable progression ladder with short prerequisite text; dim the action, not the explanation.

## Rival Scouts — P1

- Purpose/emotion: understand competitors and anticipate pressure; rivalry and situational awareness.
- Desired primary action: inspect the rival affecting a prospect or source this week.
- Important information: person/organization, current move, target, consequence, actionable opening.
- Observed: three organizations, zero actively scouting. A large node graph occupies most of the desktop feature panel; identical magenta circular building icons, dotted connections, grid lines, and mint crosshair feel like a cyber operations screen. Names in the graph are tiny. Mobile spends its first viewport on multiple headings and the graph; selected actor details are below. Closest rival and actual named scouts occur only after the graph on desktop. The graph's three organization nodes do not visually communicate the difference between Resource 48, Influence 64, Heat 35, or Threat 42.
- Strength: persistent named organizations, agendas, known scouts, last move, and openings provide valuable world continuity. The selected-state ring is clear.
- Improvement: lead with This week's rival move or No active pressure and a brief named-person dossier. Replace the dominant node diagram with a compact relationship sketch or optional intelligence view. Use restrained organization marks and human scout portraits; expose target and consequence before raw resource numbers.

## Scout Handbook — P2

- Purpose/emotion: resolve a specific question and return to play; clarity and confidence.
- Desired primary action: search or open the relevant help article.
- Important information: answer to current question, what is playable now, link back to gameplay.
- Observed: desktop has both a full topic sidebar and 15 same-weight topic cards repeating the same index. A large amber Build-aware handbook callout is more visually prominent than search or Getting Started. Mobile retains an extra hamburger for topics beside search in addition to the app hamburger above; the build callout consumes about 150px, and only the first three topic cards are visible. Coming later systems remain another prominent section on desktop.
- Strength: search is immediately available; topic names and brief descriptions are clear; mobile does remove the always-open second sidebar.
- Improvement: prioritize search, contextual help, and a short Starting your week sequence. Use a compact text topic index; reduce the build note to a brief expandable availability note. Distinguish the two mobile menu controls by labeling the local one Topics.

## Settings — P2

- Purpose/emotion: adjust comfort, manage saves, and return safely; control and trust.
- Desired primary action: adjust the selected setting; make save management readily reachable.
- Important information: current value, immediate effect, persistence, recovery access.
- Observed: Audio tab only reviewed; Graphics/Gameplay/Accessibility contents and interaction behavior are unverified. This is one of the cleanest baseline screens: bounded content width, large switches, values beside slider labels, consistent spacing, and a visible Back to Desk button. Mobile tab buttons wrap intentionally into two columns. The full page confirms Account, Data Mods, Saves, Feedback, and Quit follow the audio section, so save management is buried beneath unrelated content. Slider tracks show thumb position but no distinct filled range; muted secondary text is small. Nested bordered boxes are still used around individual switches.
- Strength: understandable control grouping and readable values. Text says audio cues also appear visually; no behavior verification was performed.
- Improvement: retain the basic settings layout, reduce nested surface borders, add a clear filled slider track, and provide top-level access to Saves and support alongside the main categories. Keep return action consistent with other utility destinations.

## Product Roadmap — P2

- Purpose/emotion: understand current availability and future direction; confidence without confusion about playable scope.
- Desired primary action: continue the career; reading detail is optional.
- Important information: available now, current work, aspirational direction, no promised dates.
- Observed: desktop has a clear heading and a strong gold Continue career action. The hero, long caution callout, tabs, phase cards, and detailed phase cards repeat the hierarchy. Mobile first viewport contains only the large hero and the full caution paragraph; tabs and actual roadmap content begin below it. Engineering terms such as migrations, batch advancement, simulation evidence, and platform certification dominate some descriptions. This is visually closer to a product site than the football-world interface, acceptable for support but overly prominent if treated as a career destination.
- Strength: no fixed dates is explicit and playable content is distinguished from future ambition. Continue career is visible without scrolling on mobile.
- Improvement: keep the return action, shorten introductory material into a compact header, and show Playable now / Next immediately. Use an editorial release notebook with detailed technical work disclosed separately.

## Implementation priorities from this review

1. Remove duplicated Inbox/Network/Agency summaries; put the actual person, message, or investment decision in the first mobile viewport.
2. Create one shared empty-state treatment for Tracker, Performance, and Alumni: purposeful title, short explanation, real next action, no grid of zeros.
3. Replace misleading green adverse-state styling and unreadable locked-state text with consistent semantic treatment.
4. Fix Equipment's missing visible route to upgrades; put eligible courses ahead of empty course history.
5. Move Hall of Fame's story and return action ahead of the zero legacy ledger; shift Rivals from diagram spectacle to current human pressure.
6. Preserve Settings' bounded layout and Handbook's search while simplifying repeated content and utility navigation.

Acceptance checks: all reviewed mobile first viewports should show a relevant action or actionable content; no empty analytics screen should begin with three or more zero cards; negative relationship status must use readable text and an appropriate semantic cue; locked content must keep requirements legible; each utility/retrospective destination should expose a route back without reaching the bottom.



## Implemented resolution and final evidence

The findings above remain the original rendered baseline, scored 49/100. They are preserved so that the before/after comparison stays auditable. The implementation now applies the shared design system across every supported route. Final changes, remaining limits, independent scoring and verification are recorded in [VISUAL_OVERHAUL_REPORT.md](VISUAL_OVERHAUL_REPORT.md).

The flagship Watch, Profile, report, Comparison and Desk flows were redesigned and recaptured repeatedly at 1920×1080, 1366×900, 834×1112 and 390×844. Later review also addressed Rivals, Career Tracker, Alumni, season recognition, demo completion, consequential overlays, Handbook, Settings, Finances and Roadmap. Empty states lead with their purpose and useful next action; retained game records determine career history, rather than invented milestones or hidden ability values.

The final capture sets distinguish actual careers and control interactions from explicitly injected late-career scenarios. Save/restart, age changes, pruning and exact asset failure each have separate evidence. Login/cloud accounts and future routes remain unavailable under the current Youth Early Access configuration, rather than being counted as tested playable screens. Consult the final report for precise coverage and limits.
