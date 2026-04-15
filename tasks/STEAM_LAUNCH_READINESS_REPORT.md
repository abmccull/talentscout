# TalentScout — Steam Launch Readiness Report

**Date:** 2026-03-05
**Version Audited:** 0.1.0
**Steam App ID:** 4455570
**Last Successful Build:** BuildID 22062827 (uploaded 2026-02-23)
**Stack:** Next.js 15 / React 19 / TypeScript 5 (strict) / Zustand / Dexie.js / Electron 40 / steamworks.js

---

## Executive Summary

TalentScout is in **good shape for launch**. The codebase is well-architected with a clean separation between the pure-function simulation engine and the UI layer, full TypeScript strict mode, deterministic seeded RNG, a comprehensive tutorial system, and working Steam integration across all three major features (achievements, cloud saves, rich presence). All six critical bugs identified in the February 2026 code review have been resolved. The Steam build pipeline is functional and a build is already live in your depot.

There are no hard blockers to release, but several medium-priority items should be addressed before or shortly after launch to protect the player experience and your store credibility.

**Overall verdict: 🟡 Launch-ready with caveats. Recommend fixing items in Section 3 before pressing the release button.**

---

## Scorecard

| Area | Status | Notes |
|------|--------|-------|
| Critical bug fixes | ✅ Green | All 6 critical bugs from Feb review resolved |
| Steam achievements | ✅ Green | 45 achievements, VDF ready, achievementMap wired |
| Steam Cloud saves | ✅ Green | Triple-backend save system operational |
| Rich Presence | ✅ Green | 4 status tokens + VDF configured |
| Electron build pipeline | ✅ Green | Win/macOS/Linux depots, build already uploaded |
| Error handling | ✅ Green | Two-tier boundaries + Sentry integration |
| Tutorial / onboarding | ✅ Green | 8 onboarding sequences, aha moments, mentor check-ins |
| Difficulty system | ✅ Green | 4 modes including Ironman permadeath |
| Player development | ✅ Green | Growth formula corrected |
| E2E test coverage | ✅ Green | 42 spec files, 4,600+ lines |
| Store page copy | ✅ Green | Short/long descriptions complete |
| Store page assets | 🟡 Yellow | Capsule + hero exist; gameplay screenshots unclear |
| Unit tests | 🟡 Yellow | E2E only — no engine unit tests |
| Leaderboard integrity | 🟡 Yellow | Client-side scores are manipulable |
| Starting balance | 🟡 Yellow | 500 start; Tier 1 costs reduced but margin is thin |
| Version number | 🟡 Yellow | Still `0.1.0` — should be `1.0.0` for release |
| LICENSE file | 🔴 Red | Missing from repo; installer will have no license |
| Localisation | ⬜ N/A | English only; single `en.json`; not a blocker |

---

## Section 1 — Critical Bug Status (All Fixed ✅)

The February 2026 codebase review identified 6 critical issues. All have been resolved in the current build.

**1.1 Player Development Formula (gameLoop.ts)**
The pre-peak growth multiplier was inverted — younger players were getting near-zero growth. Fixed by replacing the squaring with `Math.min(1.0, 0.4 + Math.abs(yearsFromPeak) * 0.08)`, giving young players the highest growth rates as intended.

**1.2 `removeActivity` Referential Identity (calendar.ts)**
Schedule removal used `===` object identity which broke after save/load deserialization. Fixed by switching to `instanceId`-based comparison, with a legacy fallback for older saves.

**1.3 Season Events Not Regenerating (gameLoop.ts)**
On season rollover, stale events from the previous season were persisting. Fixed — `generateSeasonEvents(nextSeason)` is now called during the rollover path.

**1.4 `acceptJobOffer` Season Proxy (progression.ts)**
Contract end season was incorrectly computed using `specializationLevel` as a proxy. Fixed — now correctly uses `currentSeason + offer.contractLength`.

**1.5 NPC Scout Territory Filtering (npcScouts.ts)**
The original implementation compared club IDs against league IDs, making territory assignment non-functional. Fixed by resolving `player → club → leagueId` and checking against a `Set<string>` of the territory's `leagueIds`. A fallback to the full player pool handles edge cases (empty clubs map, tests).

**1.6 Multi-Word Country Name Slug Mismatch (homeAdvantage.ts)**
Countries like "United States" failed to match `NEIGHBOR_MAP` keys like `"unitedstates"`. Fixed via a `normalizeCountry()` function that lowercases and strips all whitespace before comparison.

---

## Section 2 — Steam Integration

### 2.1 Achievements

45 achievements are defined across 8 categories: Getting Started, Career Milestones, Scouting Excellence, Specialization Mastery, World Explorer, Match & Analysis, Financial, and 5 Hidden achievements. The `achievementMap.ts` maps internal game events to Steam API strings (SCREAMING_SNAKE_CASE), and the `achievements_import.vdf` is ready to paste into the Steamworks portal.

**Verification needed:** Confirm all 45 VDF entries have been imported into the Steamworks partner portal and the achievement icons are uploaded. The store page description references "45 achievements" — this is consistent with the VDF count.

### 2.2 Steam Cloud Saves

The save system uses a triple-backend architecture:

- **Primary:** Dexie/IndexedDB (`db.saves.put(record)`) — always-blocking write
- **Secondary:** Steam Cloud (`steam.setCloudSave(slot, JSON.stringify(record))`) — fire-and-forget
- **Tertiary:** Supabase — fire-and-forget

On load, all 3 backends are queried in parallel and the newest timestamp wins. Conflict detection uses a 60-second threshold. 5 manual slots plus autosave (slot 0) are supported. The earlier bug where `saveGame()` appeared to not persist to disk has been confirmed resolved — `db.saves.put(record)` is awaited.

**One remaining concern:** Steam Cloud quota. The save records contain the full `GameState` object serialized to JSON. GameState in a late-game save (300+ players, 5 seasons of history) could be sizeable. Valve's default per-user quota is 1 GB but the per-file size limit and total file count limit for your app are set in the Steamworks portal under **Steam Cloud → Configure**. Verify these are set appropriately before launch.

### 2.3 Rich Presence

4 display tokens are configured: `#StatusScouting`, `#StatusWatching`, `#StatusReporting`, `#StatusPlaying`. The `rich_presence.vdf` is in the electron directory. Country, fixture, season, and week keys are set dynamically. Players with the same country are grouped in Steam's friend view.

**Action needed:** Confirm the Rich Presence VDF has been uploaded to the Steamworks portal. It won't appear in-game without that step.

### 2.4 Build Pipeline

Three depots (4455571 Windows, 4455572 macOS, 4455573 Linux) match the VDF configuration. `electron-builder.yml` correctly bundles the platform-specific Steamworks native DLLs via `extraFiles`. macOS builds have `hardenedRuntime: true` and a notarization script hook. NSIS Windows installer is configured with `perMachine: true`.

**One note:** The `setlive` field in `app_build_4455570.vdf` is empty — builds are uploaded but not automatically set to the `default` branch. This is intentional for pre-release testing but remember to manually set the branch live from the Steamworks portal when you're ready to release.

---

## Section 3 — Pre-Launch Items

These are not launch-blocking crashes, but they will affect your store reception and player trust if left unaddressed.

### 3.1 Missing LICENSE File 🔴 (Fix Before Launch)

`electron-builder.yml` has the license field commented out with a note: "Add `license: LICENSE` once a LICENSE file is committed." Without this, your Windows NSIS installer will present no license agreement screen, which is unusual and looks unprofessional. More importantly, without a license file in the repo, the legal status of your code is ambiguous.

**Fix:** Decide on your license (MIT, proprietary commercial, etc.), add a `LICENSE` file to the root, and uncomment the `license: LICENSE` line in `electron-builder.yml`.

### 3.2 Version Number 🟡 (Fix Before Launch)

The app version is `0.1.0` in `src/config/version.ts`, `package.json`, and `electron-builder.yml`. Shipping a 1.0 game with a 0.1.0 version number sends mixed signals to players — it looks like an alpha or pre-release build.

**Fix:** Bump to `1.0.0` across `package.json`, `src/config/version.ts`, and anywhere else it's hardcoded. Run a find for `"0.1.0"` to catch all occurrences.

### 3.3 Steam Store Screenshots 🟡 (Verify Before Launch)

Only `steam-capsule.png` and `steam-hero.png` were found in the project. Steam requires at least 5 screenshots for a store page to be accepted for review. It's possible these exist externally and haven't been added to the repo, but this needs verification.

**Action:** Confirm 5+ gameplay screenshots are uploaded in the Steamworks partner portal. Steam rejects pages that are missing them.

### 3.4 Leaderboard Integrity 🟡 (Fix Before or Shortly After Launch)

The Supabase leaderboard accepts scores submitted directly from the client. There is no server-side validation of the score against actual game state. A player who knows the Supabase anon key can submit arbitrary scores.

This is a HIGH severity issue from the original review that remains open. For launch, it mainly affects the "Hall of Fame" feel — padded leaderboards erode trust quickly in a score-based game.

**Options:** (a) Add a Supabase Row-Level Security policy that caps score growth to a plausible range per submission; (b) add a Supabase Edge Function that validates scores against difficulty/season/time constraints before inserting; (c) restrict the global leaderboard to Steam-authenticated players only. Option (b) or (c) are the most robust.

### 3.5 Tier 1 Starting Balance 🟡 (Monitor Post-Launch)

`STARTING_BALANCE = 500` has not changed, but Tier 1 monthly expenses have been meaningfully reduced since the original review: rent 100, travel 50, equipment subscription 50, other misc 35 = **235/month minimum** at Tier 1. With a first-week income from basic observations, the player should be able to survive.

However, this is still very tight for a new player unfamiliar with the income loops. The original review flagged it as a "poverty trap." The reduced costs help, but consider whether Casual difficulty's `incomeMultiplier: 2.0 / expenseMultiplier: 0.5` is communicated clearly enough that struggling players know to try it.

**Recommendation:** Add a one-line financial summary to the Tier 1 onboarding sequence ("Your monthly costs are ~£235. Your first few reports will cover them.") to set expectations.

### 3.6 No Engine Unit Tests 🟡 (Nice-to-Have)

The 42-file E2E suite (4,600 LOC) covers screen navigation, flows, and regression scenarios well. But the simulation engine — `gameLoop.ts`, `calendar.ts`, `expenses.ts`, `npcScouts.ts`, `progression.ts` — has zero unit tests. The recent critical bug fixes (development formula, territory filtering, season rollover) were logic bugs that unit tests would have caught immediately.

This isn't a launch blocker, but one engine regression post-launch that corrupts saves is significantly more damaging than a UI glitch. A targeted set of 20-30 pure-function unit tests around the highest-risk engine functions would be a worthwhile post-launch investment.

---

## Section 4 — Game Engine Assessment

### 4.1 Architecture

The engine design is a genuine strength. All simulation code in `src/engine/**` is pure TypeScript with no React dependencies — functions take state and return new state, enabling deterministic replay and easy testing. The `GameState` type is the single source of truth. Zustand stores orchestrate mutations but don't contain logic.

The seeded Mulberry32 PRNG with djb2-style string hashing ensures identical worlds for identical seeds. This is important for reproducibility and potential seed-sharing features in the future.

### 4.2 Player Development (Now Fixed)

The corrected pre-peak growth formula gives players aged well below peak (e.g., 16-year-old with peak 26) a base growth multiplier around `0.4 + 10 * 0.08 = 1.2`, correctly identifying young players as high-growth. Post-peak decline is handled by `base = -yearsFromPeak * 0.02`. The difficulty `developmentRate` modifier scales this appropriately across the four modes.

### 4.3 Financial System

The expense system is tiered by career level with explicit constants for each tier. Tier 1 `TIER_RENT = 100`, `TIER_TRAVEL_BASE = 50`, `EQUIPMENT_SUBSCRIPTION_COST[1] = 50`, `TIER_1_OTHER_EXPENSE = 35`. The loan system adds `business` (20k, 5%/month, 12 months), `equipment` (10k, 10%/month, 6 months), and `emergency` (2k, 8%/month, 4 months) options, giving players safety valves when finances tighten.

Income is driven by placement fees, report sales, and salary (at contracted tiers). The Casual difficulty income multiplier (2.0) and expense multiplier (0.5) effectively create a 4x financial advantage for struggling players — this is a well-calibrated safety net.

### 4.4 NPC Scout System (Now Fixed)

NPC scouts now correctly filter players to their assigned territory by resolving `player → club → leagueId` and checking against a Set of the territory's league IDs. The fallback to the full player pool prevents crashes during world generation edge cases. Territory creation correctly scales `maxScouts` slots with the number of leagues per country.

### 4.5 Difficulty and Replayability

The four difficulty levels are well-differentiated: Casual doubles income and halves costs; Normal is balanced; Hard cuts income by half and raises costs by 50%; Ironman matches Hard plus permadeath on firing. The `rivalIntelligence` multiplier (0.5–2.0) meaningfully changes late-game challenge. With 4 specializations × 2 career paths × 10 scenarios × 4 difficulty levels, the theoretical playthrough space is large enough to support significant replay.

---

## Section 5 — UI/UX Assessment

### 5.1 Screen Coverage

The game has 50+ distinct screen components covering: main menu, new game wizard, dashboard, match/fixture browsing, observation session, report writing, career progression, financial management, equipment, agency, NPC management, network/contacts, achievements, hall of fame, leaderboard, settings, save/load, and more. Screen navigation is keyboard-navigable (`useKeyboardNav` hook maps all major screens).

### 5.2 Tutorial and Onboarding

The tutorial system is comprehensive and well-designed:
- 8 onboarding sequences branched by specialization × career path (club vs freelance)
- Aha moment sequences triggered contextually for equipment, NPCs, free agents, season awards, etc.
- Mentor check-in messages at weeks 2, 3, and 4
- Per-screen guide panels accessible via help button
- Contextual hint toasts that appear on first encounter of key systems
- Tutorial state is persisted in localStorage — completed sequences aren't repeated

This is a strong onboarding system that significantly reduces the "what do I do?" confusion common in simulation games.

### 5.3 Accessibility

The settings system includes colorblind mode (4 options), reduced motion, font size adjustment, and `autoAdvanceSpeed`/`confirmBeforeAdvance` controls. These are meaningful accessibility provisions. The settings are manually persisted to localStorage with a robust merge-with-defaults on load, so they survive app updates safely.

### 5.4 Form Display

The previous review noted form (player in-form/out-of-form status) was calculated but never shown (Grade: F). This has been resolved — `PlayerProfile.tsx` and `ReportWriter.tsx` both define a `FormDisplay` interface and `FORM_MAP`, and render form ratings to the player.

### 5.5 Audio

The audio system uses Howler.js with per-screen music mapping. The `useScreenMusic` hook covers discoveries, achievements, hall of fame, career, leaderboard, and demoEnd screens with distinct music. In-game sound effects complement the weekly advance and event resolution flows.

### 5.6 Error Boundaries

Two-tier error boundary coverage is in place:
- **Page-level** (`error.tsx`): Shows last autosave timestamp retrieved directly from IndexedDB, "Try Again" button, and dev-mode error message
- **Global** (`global-error.tsx`): Renders outside root layout with full HTML/body shell, shows app version, dev-mode error message
- Both integrate with Sentry (`NEXT_PUBLIC_SENTRY_DSN` must be set in production env for captures to fire)

---

## Section 6 — What's Not In This Game (By Design)

Some things a player coming from Football Manager might expect won't be here — this is worth being explicit about in your store page communication to manage expectations:

- **No tactical management:** You are a scout, not the manager. Matches are observed, not simulated tactically.
- **No transfer market:** You write reports and recommendations. Clubs make decisions.
- **No real player names or real club data:** Procedural generation throughout.
- **No online multiplayer:** Career is single-player; the leaderboard is asynchronous.

The store page copy handles this well ("This isn't Football Manager. You're not the manager.") but it's worth ensuring your screenshots and trailer reinforce this — gameplay screenshots should show the observation session, report writing, and schedule planning, not a match engine.

---

## Section 7 — Pre-Launch Checklist

Use this as a final gate before setting the `default` branch live.

**Must-do before launch:**
- [ ] Add `LICENSE` file and uncomment it in `electron-builder.yml`
- [ ] Bump version to `1.0.0` across `package.json`, `src/config/version.ts`
- [ ] Rebuild and re-upload all 3 depots after the above changes
- [ ] Verify 5+ gameplay screenshots are uploaded to Steamworks store page
- [ ] Set `NEXT_PUBLIC_SENTRY_DSN` in production build environment
- [ ] Confirm achievements VDF is imported in Steamworks portal and all 45 icons are uploaded
- [ ] Upload `rich_presence.vdf` to Steamworks portal
- [ ] Configure Steam Cloud file quota in Steamworks portal
- [ ] Set the uploaded build live on the `default` branch

**Should-do before launch:**
- [ ] Restrict global leaderboard submissions to server-validated scores (Supabase Edge Function or RLS policy)
- [ ] Add financial expectations to Tier 1 onboarding ("your monthly costs are ~£235")
- [ ] Smoke test the retail build from a fresh Steam account with no save data
- [ ] Test save/load across platforms (Windows ↔ macOS via Steam Cloud sync)

**Post-launch backlog:**
- [ ] Add unit tests for core engine functions (gameLoop, calendar, expenses, npcScouts)
- [ ] Investigate adding a second supported language (the `next-intl` infrastructure is already in place)
- [ ] Monitor Sentry for first-week crash patterns
- [ ] Monitor leaderboard for score manipulation attempts

---

## Appendix — Bug Fix Verification

| Bug | File | Original Issue | Fix Confirmed |
|-----|------|---------------|---------------|
| Growth formula inverted | `gameLoop.ts:756-762` | `yearsFromPeak²` gave near-zero for young players | `Math.abs(yearsFromPeak) * 0.08` — ✅ |
| `removeActivity` identity | `calendar.ts:540` | `===` broke post-deserialize | `instanceId` comparison — ✅ |
| Season events stale | `gameLoop.ts:2837` | Events not regenerated on rollover | `generateSeasonEvents(nextSeason)` called — ✅ |
| Contract end season | `progression.ts:692` | Used `specializationLevel` as proxy | `currentSeason + offer.contractLength` — ✅ |
| NPC territory filtering | `npcScouts.ts:288-295` | Club IDs vs league IDs mismatch | `territoryLeagueSet.has(club.leagueId)` — ✅ |
| Multi-word country slugs | `homeAdvantage.ts` | Space-containing names never matched | `normalizeCountry()` strips whitespace — ✅ |
| `saveGame()` disk write | `db.ts:94` | Reviewed and confirmed: `db.saves.put(record)` is awaited — ✅ | N/A (was not broken) |

---

*Report generated 2026-03-05. Based on direct source code inspection of 60+ files across engine, stores, components, Steam integration, build configuration, and test suite.*
