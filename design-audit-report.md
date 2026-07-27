# TalentScout core-workspace polish design audit

**Audit date:** July 21, 2026

**Scope:** Desk, Planner, Reports, and Career on desktop and mobile. World was regression-checked through the existing six-workspace navigation but was not redesigned in this tranche.

**Overall design score:** **8.7/10**
**System Cohesion:** **9.2/10**

## Verdict

This tranche fixes the clearest routine-workspace weaknesses without adding another game system or top-level screen. Desk now behaves like an active case room, Planner treats the week as one route rather than seven cloned cards, Reports distinguishes the blank professional artifact from its downstream lifecycle, and Career exposes a player-safe career fingerprint that makes the current run legible without leaking hidden truth.

The changes are measurable. Against the previous current-worktree mobile captures, Desk fell from 3,184 to 2,587 pixels, Reports from 2,171 to 1,760, and Career from 3,556 to 2,363. Planner's primary mobile shell remains within its 844-pixel viewport. Those reductions come from removing duplicate explanations, collapsing reference material, hiding repeated mobile metrics, turning empty consequence space into a compact quiet-state rail, and giving passive Planner days ghost treatment.

This is still not honestly a 10/10 interface. The simulation identity and task ownership are strong, but the densest populated states can still overuse dark bordered surfaces, the Desk signal copy wraps tightly on desktop, and static or automated evidence cannot prove that two careers feel different to a person. The revised score is a defensible improvement from 8.4, not a declaration that the remaining human proof is complete.

## Current rendered evidence

The final focused screenshots are under:

`artifacts/release/generated/visual-evidence/head-8c51e872056e__base-tree-549dc94512a3__dirty-4b359de37893/core-workspace-polish/`

The focused evidence journey completed in 20 seconds and captured eight current desktop/mobile images. Every capture passed horizontal-overflow checks and serious/critical Axe screening.

Representative evidence:

- `desktop-desk.png` and `mobile-desk.png`
- `desktop-planner.png` and `mobile-planner.png`
- `desktop-reports.png` and `mobile-reports.png`
- `desktop-career.png` and `mobile-career.png`

The older all-features evidence journey wrote the requested workspace images but exceeded its ten-minute limit later in the political-meeting fixture. Its hidden Career-inventory dependency and release-capture budget have been repaired; the fast focused journey is now the practical regression gate for these four workspaces.

## Scorecard

| Dimension | Score | Evidence-based diagnosis |
|---|---:|---|
| Visual hierarchy | 8.9 | Each workspace exposes one dominant simulation object and one primary action. Quiet state now changes the hierarchy instead of reserving an empty full-size card. |
| Layout and spacing | 8.5 | Mobile pages are substantially shorter and no audited surface overflows horizontally. Desk and Career remain intentionally dense below their command surfaces. |
| Typography | 8.4 | Headline, command, and consequence copy scan well. Tiny uppercase metadata and tightly wrapped Desk signal copy still need a final typography pass. |
| Color and contrast | 8.2 | Workspace accents and surface depth are clear, with zero blocking automated contrast findings. Photographic backgrounds and muted tertiary copy can still compete in dense states. |
| Components and states | 8.6 | Reports now separates artifact from lifecycle, Planner differentiates the first choice from passive days, and Desk distinguishes live fallout from a quiet rail. Dark rounded panels remain the dominant support grammar. |
| Interaction and feedback | 8.8 | Scheduling is a two-action decision with audio routing, a visible and announced receipt, keyboard placement, swipe rails, and arrow-key scrolling. Major consequence/report audio already uses the canonical director. A listening session on packaged builds remains open. |
| Information architecture and navigation | 9.0 | The six permanent workspaces retain clear ownership and mobile parity. No additional workspace is required. |
| Task-flow design | 8.8 | Desk, Planner, Reports, and Career all point toward the next consequential action before reference material. Populated expert states should receive further task-timing observation. |
| Accessibility and inclusive UX | 9.0 | Focus, first-viewport reach, 44-pixel targets, keyboard rails, overflow, and serious/critical Axe checks pass. Manual NVDA and VoiceOver certification is still required. |
| Imagery and iconography | 8.5 | Office, report-room, and career imagery frame distinct places, while icons reinforce state without carrying meaning alone. Some backgrounds can be quieter behind long copy. |
| Brand visual system | 9.0 | The game now reads as a specific scouting career room rather than a generic management dashboard or smaller Football Manager clone. |
| Emotional trust and polish | 8.8 | The UI foregrounds conviction, cash pressure, career identity, rival openings, callbacks, and downstream accountability. Human testing must still prove that these signals create remembered careers. |

System Cohesion is scored separately at **9.2/10**. The new career fingerprint is a derived, player-safe projection over existing authorities; Planner feedback reuses the canonical audio engine; and the UI changes do not create a second simulation or persistence path.

## What this tranche fixed

- Replaced Desk's duplicate loop explanation with one active case board and horizontal, keyboard-accessible evidence/progression rails.
- Replaced an empty full-size consequence card with a compact quiet-state rail while preserving the live queue when fallout exists.
- Made only the first open Planner day the expanded decision; passive days now read as ghost slots on desktop.
- Added canonical `calendar-slide` feedback plus a visible `aria-live` scheduling receipt for schedule, unschedule, and suggestion commits.
- Removed duplicated empty Reports lifecycle content and introduced a distinct blank-artifact prompt with a first-viewport Planner action.
- Preserved populated report comparison and accountability behavior behind the honest empty state.
- Compressed Career mobile, consolidated recurring context, and added a safe fingerprint showing identity, world traits, career thread, territorial posture, and live relationship/rival front.
- Added a fast desktop/mobile visual regression journey with overflow and Axe gates.
- Fixed the new horizontal Desk rails for Safari keyboard access and visible focus.
- Refactored the slow mid-season coherence test so world construction and evidence collection happen outside the timed assertions without weakening its invariants.

## Remaining path to a genuine 10/10

1. Run the moderated paired-career study. Automated trajectory uniqueness does not prove that two people remember different stories.
2. Complete manual NVDA and VoiceOver testing; automated semantics are necessary but not sufficient.
3. Test the sound mix, haptics-equivalent visual receipts, and reduced-motion behavior in packaged builds on physical hardware.
4. Observe populated Reports and multi-season Career sessions with expert players; empty and early states are now strong, but maximum-density task timing needs human evidence.
5. Continue replacing tertiary card stacks with spatial metaphors where evidence supports it, especially the desktop Desk signal area and deep Career archives.
6. Reduce `/play` first-load JavaScript below the current 993 kB without weakening the core-workspace first hour.

No new simulation category is required for this goal. The next design gain should come from human tuning, packaged audiovisual validation, and more authored variation inside the systems already present.
