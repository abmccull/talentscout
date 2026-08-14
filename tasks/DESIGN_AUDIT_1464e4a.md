# Design re-audit — SHA `1464e4a`

**Date:** 2026-08-14  
**Source:** workflow `design-audit-3` (source-only; stale screenshots excluded)  
**Candidate:** `1464e4a` on `integration/canonical`

## Verdict

**5.6 / 10** (base 5.9 · cohesion 5.2)

Previous first-hour audit: **4.7 / 10** (cohesion 4.3).

The 4.7 failure modes are no longer true as stated. The hour is still a first-hour *gate*, not a first-hour *product*. Rooms still disagree about hue, density, and what the figure is.

This is not a Steam launch certification. No packaged/human attestations were invented.

## What actually moved

| Old 4.7 claim | On `1464e4a` |
|---|---|
| Watch is an FM tactics board | Portraits on a stadium photo; rail hidden |
| Inbox leaks in the first hour | Bell / Inbox held until a day is booked |
| Hue is Tailwind-only | `--signal-*` + word/shape dual-code for lenses |
| Opening report is a CRM form | Navigator hidden; dark notebook sleeve |

Those are policy wins. They raised the floor. They did not make the rooms one system.

## Scorecard

| Dimension | Score |
|---|---|
| Visual hierarchy | 6.0 |
| Layout and spacing | 5.5 |
| Typography | 5.3 |
| Color and contrast | 5.9 |
| Components and states | 6.0 |
| Interaction and feedback | 6.0 |
| IA and navigation | 6.0 |
| Conversion / task flow | 5.5 |
| Accessibility | 6.0 |
| Imagery | 5.8 |
| Brand visual system | 6.0 |
| Emotional trust and polish | 6.3 |

## Diagnosis

`youthFirstHour.ts` holds Inbox and toasts. Watch hides the rail. The opening report sleeves notebook paper. Lenses are dual-coded.

The rooms still present mid-career software:

- Watch stacks a session HUD on a 44px face and parks notes on the lead.
- “Write the name down” is a cinematic stance screen *plus* a five-decision assessment card.
- Desk / Planner / Prospects / Reports stay career dashboards.
- Filing books a follow-up, lands on Planner, and immediately ends first-hour chrome. Mentor then asks to open Planner while already on it.

One contract. Four products.

## Ranked leftovers that would move the score

1. **Collapse Watch** to one stage: named lead ≥64px, name visible at 360px, one flag. No session-state badge, clarity meter, or notes overlay on the kid.
2. **One notebook control** for the name: handwritten name + ≤1 stance. Do not mount `InitialAssessmentBuilder` on the opening file.
3. **One primary per rail room:** opening kid + one next-verb. Hide KPI boards, Weekly command, marketplace, and “Open planner” while the opening case has no booked day.
4. **Hold first-hour chrome through the Planner receipt.** Do not flip `isYouthFirstHour` on the booking frame. Pulse the booked cell with the kid’s name. Complete `openedCalendar` inside report submit.
5. **One accent:** `--primary` for choice / nav / booked. Kill emerald command chrome and `#0c0c0c` Watch hex during the hour.
6. **Face continuity** on Desk, Setup, Watch, Discovery, Report, and Planner. Name the kid in alt and follow-up copy.
7. **Journey bugs:** Discovery Back/Escape; Desk CTA → Watch or Write; ChoiceCard `value` + card-level `:focus-visible`; live-watch safe-area; do not steal focus into a modal when selecting a face.
8. **Stop teaching marketplace** (`checkedInbox`) and extra scheduling after the second look is already booked.

## What this audit did not do

- No live play. Source-only.
- No NVDA / VoiceOver / usability / packaged runtime.
- No push. Tree is 6 commits ahead of origin.
