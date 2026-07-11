# Youth Scout Early Access implementation report

**Date:** July 10, 2026
**Scope:** One coherent, replayable Youth Scout career mode for local Windows Early Access.
**Decision:** **Pass as an Early Access candidate.** The focused mode, production export, Windows package, and packaged process smoke all pass. Public storefront release still requires production signing and Steamworks-owned configuration.

## What now works as one game

### 1. Observation is the authoritative source of knowledge

- Interactive sessions produce the canonical observations used by reports.
- The fallback weekly simulation is suppressed for an activity completed live, preventing duplicate observations and double rewards.
- Focus is tracked by phase and lens. Spending focus changes what the scout perceives, not what secretly happened on the pitch.
- Match moments are grounded in player attributes, form, morale, composure, and pressure response, with perception noise retained.
- Observations carry their source session and scheduled activity identifiers so provenance survives save/load.
- Halftime clears active focus allocations, and removing focus no longer refunds a spent token.

### 2. Every youth can accumulate a real dossier

- Reflection entries persist flagged moments, hypotheses, supporting/contradicting evidence, notes, and canonical observation links.
- Unresolved hypotheses return in later sessions, creating multi-week investigative threads.
- The player profile now contains an **Evidence Dossier** that gathers the selected player's journal entries and linked family, coach, contact, and inbox intelligence.
- Parent/coach meetings now produce qualitative statements grounded in hidden character attributes, with adjacent-band misreads possible for weaker scouts.
- The dossier never renders true CA, PA, `wonderkidTier`, or engine-only values.

### 3. Reports reward craft now and accuracy later

- Submission quality is now a report-craft score based on observation depth, confidence, conviction fit, detail, scout skill, and equipment.
- Immediate report scoring no longer compares the scout's work to hidden player truth.
- A hidden validation snapshot records only the assessed attributes at submission, preventing two years of normal youth development from being misclassified as an inaccurate original report.
- Accuracy resolves only after at least two seasons and signed, transferred, or alumni career evidence.
- Delayed validation updates the report, scout reputation, accuracy history, inbox feedback, and discovery-career statistics.
- Unsigned-youth IDs now resolve correctly at validation; this previously caused the entire Youth accuracy loop to be silently skipped.
- The visible Career Tracker shows the scout's original star read, public career events, and delayed validated accuracy. Exact CA/PA and immediate wonderkid labels are removed.

### 4. Uncertainty is honest

- Dashboard and Youth Hub rankings use perceived reads and observation depth rather than true potential.
- The immediate “Wonderkid Discovered” celebration was replaced with a prospect-file milestone that explicitly asks for follow-up.
- Wonderkid Radar now reacts to a sufficiently confident perceived upside range, not hidden PA.
- Gut feelings can misclassify adjacent potential tiers according to scout reliability.
- The PA-estimate perk now gives a broad, fallible star range with a hypothesis warning instead of printing a near-exact 1–200 PA range.
- Season awards count evidence-rich high-upside calls rather than secretly confirmed wonderkids.

### 5. Career progression is connected to fieldwork

- Youth-relevant skill XP advances specialization mastery from levels 1–20.
- Correct specialization perks unlock at their intended levels; the invalid `youth_academy_access` starter perk was removed in favor of the real `youth_grassroots_access` perk.
- Level-ups and newly unlocked perks generate visible inbox feedback.
- Regional knowledge now synchronizes into country and sub-region familiarity, allowing gated Street Football and tournament content to become reachable through play.
- Youth scouts can now book international travel from a visible country dossier; the trip spends cash and calendar slots, changes the active youth pool, and develops knowledge in the destination.
- New careers now load actual generated sub-regions instead of starting with an empty sub-region map.
- Moving from independent work into a club correctly exits marketplace/agency obligations while preserving cash and transaction history.

### 6. Season reviews reflect the season that happened

- Countries and regions scouted are derived from that season's reports, observations, youth, placements, and player locations.
- Reviews no longer treat every country in the world as “scouted.”
- Youth reviews include actual discoveries, successful placements, and alumni milestones.
- Regional breadth can offset a purely domestic coverage penalty.
- The same derived coverage powers season awards, keeping review and award logic consistent.

### 7. Long careers preserve world integrity

- Unsigned youth continue developing at a reduced informal-development rate.
- Ability and attributes remain bounded, and current ability cannot exceed potential ability.
- Club academy and senior rosters are separate, deduplicated, reconciled against player ownership, and promoted at age 18.
- Retired/expired players no longer remain as dangling roster references.
- Youth placements and annual academy intake enter the correct roster.
- Free-agent NPC offer probability is clamped; the prior formula could reach 118% and crash a long save.

## Important defects closed

| Defect | Player impact before | Resolution |
|---|---|---|
| Live session plus fallback both wrote observations | Inflated knowledge and rewards | Source IDs and fallback suppression establish one authority |
| Report quality used hidden truth immediately | The game graded the answer instead of the scouting process | Craft now; delayed accuracy later |
| Youth validation looked only in senior players | Youth reports never received retrospective outcomes | Canonical player resolution includes unsigned youth |
| Exact report capped at 67 after the two-season wait | Correct reports were permanently under-scored | Two seasons is now full evidence maturity |
| Discoveries showed exact CA/PA and wonderkid truth | Scouting uncertainty collapsed | Career Tracker uses original reads and public outcomes |
| New games discarded generated sub-regions | Familiarity-gated content could remain unreachable | Generated sub-regions are stored and synchronized |
| Specialization used an invalid starter perk | Youth mastery did not represent real progression | Real perks and XP-driven leveling |
| Independent-to-club switch retained independent obligations | Finances and career identity contradicted each other | Transition synchronizes path-specific state |
| Season review received the world-country list | Reviews credited activity the player never performed | Review context derives actual season coverage |
| Free-agent probability exceeded 1.0 | Multi-season saves crashed | Probability clamped and covered by soak test |

## Verification evidence

| Gate | Result |
|---|---|
| TypeScript | `npm run typecheck` — pass |
| Lint | `npm run lint` — pass, zero warnings/errors |
| Season review unit regression | `npx --yes tsx --test src/engine/career/seasonReviewContext.test.ts` — 1/1 pass |
| Focused delayed validation | `e2e/regression/report-validation-delay.spec.ts` — pass |
| Full Youth Early Access suite | **23/23 pass** serially in 7.3 minutes before the final toast-only patch; affected first-report flow plus toast regression **4/4 post-fix** |
| Long-career soak | Ten seasons; roster, development, geography, and mastery invariants pass |
| Production static export | `npm run build` — pass |
| Windows packaging | `npm run electron:dist` — pass |
| Packaged process smoke | Five Electron processes healthy after eight seconds, then closed cleanly |
| Production dependency audit | No high/critical findings; four moderate Next-bundled PostCSS advisories remain |
| Diff hygiene | `git diff --check` — no content errors |

## Windows artifact

- Installer: `dist/TalentScout-Setup-1.0.0.exe`
- Size: `250,304,197` bytes (`238.71 MiB`)
- SHA-256: `3B39338878C3C109CBB5A2CD56A7B3E2AE4CB1C9AC992621CF5ACFA59A933734`
- Signature: not production-certificate signed

## Remaining work after this Early Access cut

These are depth opportunities rather than blockers for the focused mode:

1. Add more authored venue-specific moment pools, local competitions, family situations, and regional football cultures.
2. Build recurring club/client relationships with preferences, trust, memory, repeat briefs, and consequences for contradictory recommendations.
3. Expand alumni storytelling with debuts, loans, setbacks, role changes, manager quotes, and callbacks to the scout's original notes.
4. Balance the independent economy and content cadence across many seeds using telemetry rather than one deterministic soak.
5. Split the `/play` client bundle, currently about 920 KB first-load JavaScript.
6. Add the club-employed Youth starting path only after it receives the same end-to-end and accessibility coverage.
7. Complete production signing, Steam SDK/depot/cloud/achievement setup, and a clean-machine private-branch smoke before storefront release.

## Release position

The mode now has a coherent loop:

**find a lead → choose where to spend scarce attention → collect imperfect evidence → preserve a dossier → make and sell a call → watch the career unfold → earn or lose trust → unlock better access and judgment → repeat in a changing world.**

That loop is ready for focused Early Access. The next work should deepen content and relationships inside it, not re-open unsupported game modes.
