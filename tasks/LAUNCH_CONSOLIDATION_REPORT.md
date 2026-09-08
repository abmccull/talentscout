# TalentScout Youth EA — Consolidated Launch Report

**Candidate:** `f82dc6ff` on `integration/canonical` (1 commit ahead of origin)  
**Date:** 2026-08-13  
**Sources:** `ship-gate` · `review-changes` · `design-audit` · `talentscout-game-readiness-2`

## Combined verdict

**Not ready to launch.**

| Review | Verdict | What it actually measured |
|---|---|---|
| ship-gate | **Ready** (14 pass / 0 fail / 12 n_a) | Offline Electron/Steam hygiene: no secrets, fail-closed online, Dexie migrations, CSP, trusted IPC |
| review-changes | **9 confirmed bugs** on `HEAD~1..HEAD` | Persist races, fire-and-forget quit, fail-open retainer validator, planner trap, planner hitch |
| design-audit | **4.7 / 10** (cohesion 4.3) | First-hour rail: dual CTAs, dual desks, FM observation, marketplace gate, six-tab chrome |
| game-readiness-2 | **Not ready** (41 pass / 2 fail / 16 unverified) | TargetPicker + mobile nav missing Tab traps; release evidence not bound to this SHA |

ship-gate Ready and game-readiness Not ready do not contradict. ship-gate is engineering hygiene for a static packaged SPA. Readiness is the product + attestation gate. Design-audit is why a technically green build still fails as a first hour.

## What is already solid

- One local tree on `integration/canonical`. Fake settings are gone. Main-menu Settings is real.
- Opening loop exists: Start → observe → discovery → file → week.
- Youth retainers, save envelope 0→4, quarantined full-game screens, Electron sandbox/fuses, Steam 4455570 scripts.
- Asset commercial rights attested (2026-08-04). Online feedback compiled off.

## Ranked work

### A. Code — must fix before claiming a ship candidate

1. **Persist mutex + awaited quit flush.** `queueGameplayAutosave` and `saveGame()` both write the autosave slot with no lock. An older in-flight write can overwrite a newer quit snapshot. `saveGame()` is fire-and-forget; Electron `before-quit` does not wait. Dual `pagehide` + `visibilitychange` can start two clone+migrate jobs.
2. **Fail-closed youth retainer briefs.** `isValidYouthRetainerBrief()` throws on a missing `targetPositions` / `ageRange`. That runs inside every load/persist migration.
3. **Focus traps that match `aria-modal`.** Planner sheet stays armed when `lg:hidden`. TargetPicker, mobile sidebar, and week-advance confirm have no Tab cycle. Off-screen sidebar stays in the tab order.
4. **Planner persist hitch.** Every schedule/unschedule click queues a full-career serialize after ~2 frames. Coalesce to hundreds of milliseconds; quit still flushes immediately.
5. **Stale autosave banner.** A later successful persist never clears `autosaveError`.

### B. Code — first-hour rail (launch quality, not polish)

6. **One Desk next-move.** Hide Command Center under Active Case Board during the first hour.
7. **One Identity primary.** Instinct cards must not look like they start the career. Footer is the only start.
8. **Four first-hour rooms.** Desk / Planner / Prospects / Reports on week 1 with no reports. World and Career stay in the product, not the first-hour map.
9. **Observation is a watch.** Do not mark Planner current during observation / opening discovery.
10. **Do not gate the week on marketplace.** Opening report lands on Desk. Skip listing unlocks the guided week. Confirm week advance on the opening week.
11. **Mobile Planner shows seven days.** Drop the 176px snap tiles that clip Thu–Sun at 390px.
12. **Readable first-hour chrome.** Mobile nav uses rem, not `text-[9px]`.

### C. Process — cannot be coded; do not invent

These stay **Unverified** until a human or package job produces SHA-bound artifacts:

- NVDA and VoiceOver attestations
- Moderated usability / paired-career replayability
- Physical low-end hardware
- Packaged Windows / macOS / Linux runtime on **this** SHA
- Candidate version tag (`requireVersionTag=true`, tag is null)
- `candidate-package-manifest.json` is still `c6f2ddd` / v1.0.0-rc.6 Windows-only
- Automated core suites / long-save leftovers bind to older SHAs
- CI on `f82dc6f` (commit unpushed)

### D. Deferred (real, not this pass)

- Replace procedural PlayerAvatar with a portrait that can sit next to ScoutAvatar (needs art, not a smiley tweak).
- Observation pitch is still an FM tactics board.
- Mentor overlay / achievement juice on Watch-the-match and discovery choices.
- One selected-state dialect across the whole first hour.
- ScreenBackground high-contrast still does not lift cinematic overlays.

## This pass implemented A + B

Code-side launch fixes are in the working tree on top of `f82dc6f`:

- Shared persist lock + lastSaved generation skip; gameplay queue and quit flush are one pipeline
- Electron `before-quit` asks the renderer to flush and waits up to 2.5s
- Planner writes coalesce for 400ms; quit `flushNow` skips that delay
- `autosaveError` clears on a later success
- Youth retainer validator is fail-closed
- Dialog Tab traps: planner sheet disarms at `lg`, TargetPicker, mobile sidebar (`inert` when closed), week-advance confirm
- First-hour Desk shows only the next-move board
- Identity footer is the only start (`Take the call`); instinct cards are selectors
- World/Career hidden while an opening case is still week 1 with no reports
- Observation no longer paints Planner as current
- Opening report returns to Desk and does not lock the week on marketplace listing
- Opening week always confirms Advance Week
- Mobile Planner is a 7-column week; mobile nav uses rem and 4 columns in the first hour

## Path from 4.7 to 10/10

A 10 is not polish. The audit already wrote the scorecard. One room at a time: name yourself, watch one kid, write the name, see that kid on tomorrow’s itinerary. Chrome, mentor, inbox, and KPI tiles stay backstage until the week has a booked second look.

Done on this pass toward that scorecard:
- Watch is chrome-light (no rail / Inbox / Handbook)
- Mentor no longer covers Watch the match
- First-hour 4-tab rail survives filing until a day is booked
- Mentor after the report points at Planner, not Reports
- Opening discovery locks after click; overlay is darker; back from the opening report returns to discovery
- Brand tokens and wordmark moved to floodlight amber / navy
- Youth avatars cannot grow stubble or grey hair
- Mobile planner scrolls with 44px+ day cells

Still required for a 10 (cannot fake):
1. Observation pitch is still an FM tactics board. Replace it with atmosphere + named faces.
2. Real youth portraits that can sit next to ScoutAvatar. Age-safe SVG is not a portrait.
3. Rem type floor on every first-hour 8–11px label (pitch names, report meta, evidence).
4. One selected / pending / disabled / 3px focus recipe reused everywhere.
5. Mentor overlay is a real dialog, never covering its target.
6. After file, Planner already has that kid on a day. Advance Week is not the hero at 0/7.
7. Colorblind mode remaps the palette. It must not simulate the deficiency.
8. Reports look like a notebook, not a CRM form.

Until 1–2 exist, the audit will not score imagery or brand above the mid 6s. Until 6 exists, conversion stays a 6.

## Still not launch-ready

Process attestations remain unverified. Do not invent them.
