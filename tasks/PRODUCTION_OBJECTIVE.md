# Agent objective: put Youth EA in a production state

**Owner:** any coding agent working in this tree  
**Product:** TalentScout Youth Scout Early Access — Next.js 15 static `/play` SPA inside Electron 43, Steam app **4455570**  
**Canonical tree:** `C:\Users\hands\OneDrive\Pictures\TalentScout\talentscout` on `integration/canonical`  
**Baseline when this was written:** `518ee12` (1 commit ahead of origin). Re-read `git log` and this file before acting.

You are not here to polish the first hour again. You are here to make the **same game** playable from Take the call through week-to-week career, then certify **that** SHA for Steam.

---

## One-sentence goal

Ship a Youth EA build where a new Steam player can take the call, write one name, test that name in week 2, and keep playing one product — then freeze that SHA and produce real packages and human attestations.

---

## What “production state” means

Production is **all three** of these. Gameplay polish alone is not production.

1. **Product:** First hour and week 2–4 feel like one game. The opening kid stays the figure. World/Career do not dump a second OS on Advance Week.
2. **Proven:** Live first-hour playthrough + design-audit on the *current* SHA. Opening e2e matches the short path. Typecheck and targeted tests pass.
3. **Certified:** Two-stage release on that frozen SHA. Packages exist. NVDA, VoiceOver, usability, and packaged runtime are real documents bound to that SHA. Do **not** invent any of those.

If you cannot point at a SHA, a package hash, and a human attestation file, it is not production.

---

## What is already closed (do not reopen)

Treat these as done unless a live audit files a 10/10-test failure:

- One local tree. Old HTML prototype is gone. Settings are real or removed.
- Persist mutex, Electron quit flush, fail-closed retainers.
- First-week HUD: Inbox / World / Career / toasts off in week 1 (`isYouthOpeningShell`). Desk, Planner, Prospects, and Reports stay on — those are the real rooms.
- Opening Watch is the real session: three phases, focus, flag, reflection. Then discovery, then the first report.
- School-match plate, named fallback portraits, split `--signal-*` hues, ChoiceCard value + card focus.
- Mentor does not teach marketplace or extra scheduling after file.
- Week 2 opens World/Career. Do not build a second game, a fake kid room, or a week-2–4 hold.

Do **not** start another persist pass, settings pass, or first-hour rail-gating pass.

---

## Hard constraints

- Chrome means the **in-game HUD**, not a web browser. This is Steam/Electron.
- Do not generate photoreal minors. Youth faces are 16 hashed 18+ academy busts. Imagery ceiling is “named person + fallback,” not a new likeness set.
- Do not invent NVDA, VoiceOver, usability, packages, tags, or store attestations.
- Do not push unless the human asks. Do not tag. Two-stage cert: `docs/release/release-certification.md`.
- Do not mix first-team / PA estimate / system fit leftovers from `tasks/todo.md` into Youth EA production.
- Colorblind remaps tokens. They must not simulate a deficiency.
- One source tree. Do not create parallel copies of the game.

---

## The 10/10 first-hour test (must still hold)

A new player, desktop and 390px:

1. Name + instinct + Take the call. No four-step creator on the default path.
2. Watch one named kid through the real session: phases, focus, flag, reflection.
3. Make the discovery call, then file the first assessment in the real report writer.
4. Week 1 rail is Desk / Planner / Prospects / Reports. Inbox / World / Career wait.
5. Mentor is silent after file except Advance Week if still guided.
6. Keyboard and 44px targets work. Color is not the only meaning.

Adult painted busts and unused type tokens are **accepted ceiling**, not tickets.

---

## The same-game test (week 2–4)

Advance Week must not feel like a sequel.

1. Desk is the same desk. Command center can appear once the first hour is over.
2. Rail is Desk / Planner / Prospects / Reports, plus Inbox / World / Career from week 2.
3. Prospects is the real board, not a fake kid room.
4. Second-look Watch is the same room (school ground, gold, same face), with more tools — not FM tactics chrome.
5. Copy says “same kid, test the first read,” never “welcome to the real game.”

---

## Work order (one program at a time)

### Program A — Freeze the hour

1. Play the real `/play` or Electron first hour on **current HEAD**.
2. Capture desktop + 390px: menu, Take the call, Watch setup, live Watch, notebook, Planner receipt, Desk, week-2 Desk, Prospects, second-look Watch.
3. Run `design-audit` against **those shots + current source**. Ban screenshots under `artifacts/` and `design-audit-evidence/` that predate this SHA.
4. Fix only failures of the 10/10 test or the same-game test.
5. Write `tasks/DESIGN_AUDIT_<fullsha>.md`.
6. **Stop first-hour and week-2 chrome work** unless that audit files a test failure.

### Program B — Week-to-week career (same product)

Do this only after Program A, or if the human says the hour is frozen.

In this order:

1. **Inbox** after week 2 remembers the opening stance (consequence ledger already exists). First messages are about that kid, not generic career mail.
2. **Reports** after week 2 is the archive of that file + optional marketplace. No listing prompt on the opening notebook.
3. **Later Watch** (not opening, not opening-follow-up) may use the full session engine. Keep school-match/gold when the subject is still the opening kid.
4. **Week 5+** World/Career may appear. Introduce them as “the world answers back,” not a new app.
5. Do **not** hide Desk/Prospects/Inbox again for first-hour purity.

Score this as career software. Do not use the first-hour rubric.

### Program C — Certify and ship

Process. No gameplay unless a cert protocol finds a real defect.

1. Human says push. Push `integration/canonical`.
2. Freeze that SHA. No more first-hour commits after freeze.
3. Stage 1: Package Accepted Candidate from `release/youth-ea-rc2` with exact SHA + tree SHA. Bind `artifacts/release/candidate-package-manifest.json` to that SHA. Existing `dist/` is **stale**.
4. Stage 2 on **those** packages: NVDA, VoiceOver, moderated usability, paired-career replayability, min-hardware, packaged Windows/macOS/Linux. Protocols live in `docs/release/`.
5. Store results in `release-certifications/<label>/`. Tag only after Stage 2.

`docs/release/release-evidence-status.json` is Unverified until this happens.

---

## Verification commands

From the talentscout repo (always `Set-Location` first; home has no `package.json`):

```powershell
Set-Location "C:\Users\hands\OneDrive\Pictures\TalentScout\talentscout"
npm run typecheck
npx vitest run tests/ui/youthFirstHour.test.ts tests/ui/firstHourTypeFloor.test.ts tests/ui/lensVisual.test.ts tests/invariants/openingCase.test.ts tests/invariants/openingFollowUp.test.ts
```

After UI loop changes: `e2e/flows/opening-discovery-hook.spec.ts`.

---

## Key files

| Concern | Where |
|---|---|
| Opening / early-career phases | `src/lib/youthFirstHour.ts` |
| Rail / Inbox / accent | `src/components/game/GameLayout.tsx` |
| Desk | `src/components/game/dashboard/YouthDeskDashboard.tsx` |
| Watch / second look | `src/components/game/ObservationScreen.tsx`, `observation/ObservationPitch.tsx` |
| Opening session shape | `src/engine/youth/openingCase.ts` |
| Notebook | `src/components/game/ReportWriter.tsx` |
| New game | `src/components/game/NewGameScreen.tsx` |
| Prospects | `src/components/game/YouthScoutingScreen.tsx` |
| Cert process | `docs/release/release-certification.md` |

---

## Stop rules

| If you notice… | Do this |
|---|---|
| Tempted to re-gate week 1 HUD | Stop. Closed. |
| Tempted to generate youth faces | Stop. Use busts + fallback + name. |
| Tempted to write “NVDA passed” without a file | Stop. Unverified. |
| Audit only nags likeness or unused type tokens | Accept ceiling. Move to Program C. |
| Week 2 feels like a sequel | Program B. Same kid, same gold. |
| Human has not asked to push | Do not push. |

---

## Done when

- Live audit exists for the frozen SHA.
- Same-game test holds through week 4.
- Packages and Stage 2 attestations name that SHA and those package hashes.
- Steam promotion uses those artifacts, not a later uncertified commit.
