# Full game audit — TalentScout Youth EA vs FM-class

**Date:** 2026-08-16  
**Tree:** `integration/canonical` (includes first-hour undo + tutorial opt-in)  
**Method:** Source of screens, nav contract, weekly tick, observation/report engines. Not a live 40-hour playthrough. Not a Steam cert. No invented packages, NVDA, or VO.

**Reference:** Football Manager as the best-in-class *scouting career / living-world information game*, not as “does it have tactics boards.” FM’s bar: one language, hidden truth, noisy knowledge, a calendar of football, clubs as actors, kids who grow because of minutes and context.

---

## Headline

**6.1 / 10** as a playable Youth Scout Early Access career.

The **engine** is closer to 7. The **product you play after week 1** is closer to 5.5.

This is not vapor. The week is a real deterministic transaction. Observation has a real three-layer perception model. Club and rival decisions are carefully blinded to true CA/PA. The first assignment is a real Watch → discovery → assessment loop.

It is also not FM-class. FM’s world *is* the product. Here the football world ticks in the basement and mails you. After Advance Week the player is in three loops at once: the kid, the week OS, and the career OS.

---

## Scorecard

| Domain | Score | vs FM |
| --- | ---: | --- |
| Design / visual craft | **5.8** | FM is ugly but one language. We are mixed gold / emerald / CRM / stadium photo. |
| Screens / IA | **5.7** | Six workspace rooms + a Career basement of detail screens. FM is dense; every pane answers the same question. |
| Functionality (does it work) | **6.6** | Tick, persist, observation, reports, placement are real. First-hour e2e does not finish on this machine. Live design audit on this SHA has not been run. |
| Gameplay loop | **5.8** | Hour 1 is one verb. Week 2+ is command center + 7-day journey + optional Watch. |
| Player-facing systems | **5.7** | Planner, fatigue, briefs, placement, travel exist. Too many systems shout into Inbox. |
| Simulation engines | **7.2** | Wide, seeded, often careful. Much of it is invisible or leftover first-team. |
| Information design (the thesis) | **7.1** | Evidence / unknown / next test is the unique win. Then Prospects shows CA/PA stars and buzz bars. |
| **Overall (playable Youth EA)** | **6.1** | Serious EA prototype with a real thesis, not a finished scouting FM. |

### What 10 would mean

A new player can spend a season *only* asking “who is this kid, what do I still not know, who else is coming.” Every screen answers that. The world is felt as matches, clubs, and time — not as mail.

---

## What the player actually does

**Hour 1:** Name + instinct + choose guide or not + Take the call → school Watch (phases, focus, flag, reflection) → who hears the name → five-decision first assessment → Planner receipt → Advance Week.

**Every later week:** Plan 7 days → Week Simulation slideshow (scan / focus / network, *maybe* live Watch) → world tick → Desk command center + Prospects CRM + Reports archive + optional World map + Career sheet.

That is two products bolted at Advance Week.

---

## Simulation (honest)

The week is not fake. `processWeeklyTick` + activity resolution actually run:

- Your 7 planner slots, venue pools, interactive observation
- Fixtures (detailed + abstract leagues), cards, injuries, AI transfers, loans
- Player + unsigned-youth development, rare breakthroughs
- Rival youth pressure/claims on **visible** buzz/visibility (not true PA)
- Academy briefs, placement scoring without hidden ability
- Gossip, contact decay, alumni, season events, regional knowledge, finances

Youth EA **does not skip** that engine. It hides Match, Fixture Browser, Player Database. Football happens off-stage.

**Best bit:** perception is three-layer (visibility, noise, confidence). Parent meetings give noisy bands. Placement and rivals refuse true CA/PA.

**Cheat:** venue pool ranking still weights `potentialAbility`. Better scouts are more likely to *see* high-PA kids. FM hides that behind knowledge, not a sort key.

**Development** is a weekly die + environment multiplier, not minutes/coaching/mentoring.

**Rivals** can claim a kid and kill a placement. They are not clubs with budgets and competing knowledge maps. The Rivals screen is not on the Youth spine.

---

## Screens (honest)

| Room | Role | Grade |
| --- | --- | --- |
| Watch | The actual game | Strongest room. Opening is one language. Later Watch adds chrome, not a second engine. |
| Discovery | One irreversible call | On-loop. Copy still says “Write the name down.” |
| First report | Five evidence decisions | Right product. Formal writer later becomes recruitment CRM. |
| Desk | Home | Case board is right. Command center after any booked day is a second OS *inside week 1*. |
| Planner | Spend the week | Critical. Opening week is a receipt. Later it is staffing software. |
| Prospects | Pipeline | Database: filters, CA/PA stars, buzz, visibility, legacy points. Not a case. |
| Reports | Files + outcomes | Opening path is clean. Room is also marketplace / archive CRM. |
| World | Travel / markets | Real systems. Feels like geopolitics, not “the world answers the first read.” |
| Career | Character sheet | Reputation is on-loop. The screen is RPG + HR. Detail hops to Agency, Network, Equipment, Training, Rivals, Alumni… |
| Inbox | Consequence tray | Opening mail exists. Filters are Jobs / Gossip / Marketplace. |

Handbook still teaches attend-matches / PA ranges. That is lying help for this build.

---

## Design

Previous first-hour design audits: 4.7 then 5.6. Those were *before* we undid the toy hour and put the real systems back. Visual craft did not jump to 8.

What holds:

- School-match plate, signal tokens, ChoiceCard, portraits, rem type
- Watch as a stadium, not an FM tactics board
- One spine: Desk / Planner / Prospects / Reports (+ World / Career from week 2)

What does not:

- Emerald command chrome vs gold first-hour vs zinc CRM
- Prospects and Profile speak “Current Read / Upside Read” stars
- Player Profile is FM density without FM’s one-job clarity
- Imagery ceiling is hashed 18+ busts — accepted, not FM-class faces

---

## Functionality

Works as software: deterministic week, Dexie persist, Electron quit flush, observation state machine, structured reports, placement, travel.

Not proven as a product on this SHA:

- Live first-hour playthrough
- Opening e2e timed out on Take the call (world-gen)
- No SHA-bound packages / NVDA / VO (do not invent them)

Older `YOUTH_EARLY_ACCESS_READINESS.md` and `GAME_REVIEW_REPORT.md` describe a different first week (calendar-first, marketplace-first). Do not treat those as current truth.

---

## Comparison in one paragraph

FM is a 20-year club sim whose scouting layer is: scarce knowledge, a calendar of real matches, staff you send, clubs that bid, kids who grow because they play. TalentScout’s thesis is better in one way: **you watch and construct evidence instead of reading a 50-attribute page after one click.** The rest of the suite still wants to be a full scouting OS — agency, travel, RPG skills, marketplace — and that OS leaks into Youth EA after week 1. Breadth of engine > clarity of play.

---

## What would move this toward 8

1. **Week 2 is still the first case.** Advance Week should put you on the booked second look, not a command-center + journey dump.
2. **Desk CTA → Watch / file, not a 4-tab dossier.**
3. **Prospects is a case list**, not CA/PA + buzz CRM. Kill star ranges and legacy chips on the default card.
4. **Inbox only mails what you can act on** this week. The rest of the tick can stay silent.
5. **Stop sorting venue pools by true PA.**
6. **One accent and one density** from hour 1 through week 4.
7. **Handbook matches the Youth loop.**

Do those and the unique Watch/evidence thesis can sit next to FM instead of underneath a career suite.

---

## What this audit is not

- Not a live season playthrough
- Not accessibility or package certification
- Not a claim that simulation is fake — it is not
- Not a claim that the first hour is 10/10 in the player’s hands — source alignment ≠ played hour
