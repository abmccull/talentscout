# TalentScout Codebase Review

**Date:** 2026-02-22
**Scope:** Full codebase — 136 TypeScript/TSX files, ~12,600 LOC
**Stack:** Next.js 15 / React 19 / TypeScript 5 / Zustand / Dexie (IndexedDB) / Supabase

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Core Gameplay Loop Issues](#2-core-gameplay-loop-issues)
3. [Screen & UI Component Issues](#3-screen--ui-component-issues)
4. [Core Function & Logic Issues](#4-core-function--logic-issues)
5. [Security Findings](#5-security-findings)
6. [Full Issue Index](#6-full-issue-index)

---

## 1. Executive Summary

TalentScout is a well-architected, offline-first football scout career simulator with clean separation of concerns (engine / stores / components / data), full TypeScript strict mode, and a deterministic simulation engine. The codebase is impressive in scope and the foundational design is sound.

That said, the review uncovered **88 distinct issues** spanning gameplay logic, UI, state management, and security. The breakdown by severity:

| Severity | Count | Description |
|----------|-------|-------------|
| **Critical** | 6 | Data loss, crashes, fundamentally broken subsystems |
| **High** | 25 | Incorrect game logic, security gaps, state corruption |
| **Medium** | 32 | Edge cases, missing validation, balance issues |
| **Low** | 25 | Code quality, naming, minor UX issues |

The most impactful systemic issues are:

- **Player development growth formula is inverted** — younger players grow slower instead of faster
- **NPC scout territory system is non-functional** — club IDs compared against league IDs
- **`saveGame()` does not persist to disk** — only updates in-memory timestamp
- **No Content-Security-Policy header** — the most important missing security control
- **Client-side leaderboard scores are trivially manipulable**
- **Multi-word country names never match in neighbor lookups** — slug-case mismatch
- **Season events are not regenerated on season rollover** — stale events persist

---

## 2. Core Gameplay Loop Issues

### 2.1 Weekly Tick & Player Development

#### CRITICAL: Pre-peak growth formula is inverted (`gameLoop.ts:431-434`)

```typescript
if (yearsFromPeak < 0) {
  base = Math.max(0, 1 - yearsFromPeak * yearsFromPeak * 0.01);
}
```

`yearsFromPeak` is negative pre-peak, so squaring it produces a positive number. A 15-year-old steadyGrower (peak=26) has `yearsFromPeak = -11`, yielding `base = max(0, 1 - 1.21) = 0`. **Very young players get zero growth**, which is the opposite of the intended model. Younger players should grow faster.

#### HIGH: `clubAverageAbility` deflates average with dangling player refs (`gameLoop.ts:204-209`)

When `players[pid]` is undefined (e.g., after a transfer), the player contributes 0 to the sum but still counts in the divisor `club.playerIds.length`. This silently deflates club averages, affecting fixture simulation, transfer logic, and standings.

#### HIGH: Youth aging results not applied mid-season (`gameLoop.ts:1376-1462`)

`tickResult.youthAgingResult.updatedUnsignedYouth` is only applied inside the end-of-season branch. During regular weeks, auto-signed and retired youth persist in the `unsignedYouth` pool until season end.

#### HIGH: Season events not regenerated on rollover (`gameLoop.ts:1470-1494`)

The end-of-season branch updates leagues and fixtures but never calls `generateSeasonEvents(nextSeason)`. Stale events from the previous season persist into the new one, including wrong transfer window dates and review timings.

#### MEDIUM: Reputation change misses cross-season boundary (`gameLoop.ts:930-934`)

`computeReputationChange` filters reports by `submittedWeek === currentWeek - 1 && submittedSeason === currentSeason`. At week 1, this looks for week 0 (which doesn't exist). Reports from the last week of the previous season are missed.

#### MEDIUM: `processPlayerDevelopment` has no age filter (`gameLoop.ts:522-545`)

Comment says "only processes young players (under 32)" but the code iterates ALL players with no age check, wasting RNG calls on older players and potentially producing unexpected attribute changes.

#### MEDIUM: `lateBloomer` modifier uses hardcoded age 26 instead of peak age (`gameLoop.ts:449-451`)

The condition `age < 26` should be `age < peak` (which is 29 for lateBloomer). Players aged 27-28 who should be in their growth phase get a reduced growth multiplier.

#### LOW: Same-tick injury + transfer race condition (`gameLoop.ts:1287-1334`)

A player can be injured and transferred in the same tick since both operate on the original pre-tick state. The transfer eligibility check uses pre-injury state.

---

### 2.2 Calendar & Activities

#### HIGH: `removeActivity` identity comparison breaks after save/load (`calendar.ts:358-360`)

Uses `===` (referential identity) to find multi-slot activities. After serialization/deserialization (save/load), each slot has a new object reference, so removing a multi-slot activity only clears the clicked slot, leaving orphaned references.

#### MEDIUM: `processCompletedWeek` has no double-processing guard (`calendar.ts:714`)

Does not check `schedule.completed` before processing. If called on an already-completed schedule, all activities are re-processed, double-counting XP and fatigue.

#### MEDIUM: Fatigue penalty applied on projected fatigue, not initial (`calendar.ts:898-907`)

XP penalty is based on end-of-week fatigue, not starting fatigue. A well-rested scout doing a massive workload gets penalized on ALL activities retroactively, while a high-fatigue scout doing one rest avoids the penalty entirely.

#### MEDIUM: `PRIMARY_SKILL_MAP` only covers 8 of 35+ activity types (`activityQuality.ts:58-67`)

Activities like `reserveMatch`, `scoutingMission`, `oppositionAnalysis`, `deepVideoAnalysis`, `databaseQuery`, etc., all fall back to a default skill level of 10, meaning scout expertise has no effect on these activities.

---

### 2.3 Match Simulation

#### MEDIUM: `sampleGoals` uses Gaussian instead of Poisson distribution (`phases.ts:401-403`)

Football goals follow a Poisson distribution. The Gaussian approximation produces negative values (clamped to 0), over-representing 0-goal outcomes, especially for low expected-goal values.

#### MEDIUM: Phase start minutes pile up at minute 89 (`phases.ts:296-301`)

With 18 phases, later phases have base minutes exceeding 89 and are clamped, causing multiple phases to start at minute 89 with `endMinute` before `startMinute` (patched by `Math.max(1, ...)` but producing nonsensical time relationships).

#### LOW: `pickScorers` potential infinite loop (`phases.ts:420-421`)

The do/while loop searches for unique minutes in [1, 90]. If goals ever exceeded 90 (currently capped at 12), this would loop forever.

---

### 2.4 Scout Perception & Star Ratings

#### HIGH: `contextDiversity` measures count, not diversity (`perception.ts:241,354`)

Despite the name, it counts total observations for a player, not distinct observation contexts. Observing a player 10 times via `liveMatch` alone gives maximum "diversity." The formula should count distinct `context` values.

#### HIGH: Scout fatigue has zero effect on perception accuracy (`perception.ts`)

The `Scout.fatigue` field (documented as "high fatigue reduces observation accuracy") is never consulted anywhere in the perception pipeline. A scout at 100 fatigue produces identically accurate observations as one at 0.

#### MEDIUM: PA range can collapse to zero-width interval (`starRating.ts:238-239`)

When perceived CA exceeds raw PA estimates, both `paLow` and `paHigh` clamp to the same value, giving an artificially precise PA estimate.

#### MEDIUM: Star rating comment documentation is wrong (`starRating.ts:32-38`)

Comment claims CA 1-20 maps to 0.5 stars, but the actual formula boundary is at CA ~12-13 due to rounding.

---

### 2.5 Career Progression

#### CRITICAL: `acceptJobOffer` uses `specializationLevel` as season proxy (`progression.ts:692`)

```typescript
contractEndSeason: (scout.specializationLevel + offer.contractLength)
```

`specializationLevel` is a 1-20 skill depth rating, not the current season. This produces wildly incorrect contract end dates.

#### HIGH: `generateJobOffers` crashes when reputation is 0 (`progression.ts:597`)

`rng.nextInt(1, Math.min(3, Math.ceil(0/30)))` calls `nextInt(1, 0)` with min > max, which is undefined behavior.

#### HIGH: `generateManagerDirective` records meeting count as week number (`management.ts:253`)

The `issuedWeek` parameter receives `meetingsThisSeason` (e.g., 3) instead of the actual game week (e.g., 15), breaking any logic that checks directive timing.

---

### 2.6 World Simulation

#### CRITICAL: NPC scout territory filtering is non-functional (`npcScouts.ts:283-298`)

```typescript
const eligiblePlayers = Object.values(players).filter(
  (p) => territoryLeagueSet.has(p.clubId) // compares clubId against leagueIds!
);
```

`clubId` (e.g., `"man_city"`) is checked against `territory.leagueIds` (e.g., `"premier_league"`). These are different ID namespaces, so the check ALWAYS fails. NPC scouts effectively scout random players worldwide, ignoring territory assignments entirely.

#### HIGH: Country name casing inconsistency across modules

The transfer flow matrix (`transfers.ts`) uses capitalized names (`"England"`, `"Brazil"`), while `travel.ts` and `international.ts` use lowercase keys (`"england"`, `"brazil"`). Cross-module lookups silently fail, causing the transfer flow system to fall back to `DEFAULT_FLOW (0.02)` for all countries.

#### HIGH: Multi-word country names never match in neighbor map (`homeAdvantage.ts:27-57`)

`NEIGHBOR_MAP` uses slug keys (`"ivorycoast"`, `"southkorea"`) but the normalization uses `.toLowerCase()` which produces `"ivory coast"` (with space). All multi-word country travel/neighbor lookups silently fail.

#### HIGH: `isHomeCountry` uses `.includes()` for nationality check (`homeAdvantage.ts:89`)

Substring matching means `"iran"` matches any nationality containing those letters, and `"an"` would match `"england"`, `"germany"`, `"ghana"`, etc. Should use exact equality.

#### HIGH: `processInternationalWeek` always returns empty `expiredAssignmentIds` (`international.ts:657`)

The function signature promises expired assignment IDs but always returns `[]` with a comment saying "caller should filter." Any caller relying on this to clean up stale assignments gets nothing.

#### MEDIUM: Weather system hardcoded to English season (`fixtures.ts:112-118`)

All leagues (including Brazilian, Argentine, etc.) get August-May weather patterns. Southern hemisphere leagues get inverted weather (winter in December instead of summer).

#### MEDIUM: Youth tournaments have permanently empty `playerIds` (`international.ts:439`)

`YouthTournament.playerIds` is always `[]`. The comment says "populated externally" but no code ever populates it.

#### MEDIUM: Duplicate countries in `allCountryKeys` (`init.ts:198`)

If a country appears in both `countries` and `secondaryKeys`, it is processed twice, generating duplicate leagues, clubs, and players with potentially colliding IDs.

---

### 2.7 Reports & Contacts

#### HIGH: Division by zero in `mergeReadingsIntoAssessments` (`reporting.ts:476-479`)

If all confidence values are 0, `totalWeight = 0` and the division produces `NaN`, which propagates through `clamp(NaN, 1, 20)` (returns `NaN`), creating an `AttributeAssessment` with `estimatedValue: NaN`.

#### HIGH: `getRelevantAttributes` returns duplicates (`reporting.ts:660-677`)

GK position-specific attributes overlap with base attributes. The concatenation produces duplicates, inflating the denominator in coverage calculations and unfairly penalizing report quality scores.

#### HIGH: Data scout starting contacts missing 1 agent (`contacts.ts:365-367`)

Doc comment says "2 journalists + 1 agent" but code only creates 2 journalists.

#### MEDIUM: Contact relationship decay uses absolute week comparison (`contacts.ts:669`)

If `currentWeek` resets each season, `currentWeek - lastInteractionWeek` can be negative, bypassing the decay check entirely.

---

### 2.8 Youth Scouting & Placement

#### MEDIUM: Unsafe `ObservationContext` cast to `YouthVenueType` (`venues.ts:228-240`)

Values like `"liveMatch"` (valid `ObservationContext` but NOT a valid `YouthVenueType`) can be injected into the `venueAppearances` array via an unsafe `as` cast.

#### MEDIUM: `formatGutFeelingWithPA` can produce negative PA values (`gutFeeling.ts:320-321`)

For a player with PA=2, `low = -3`, producing text like "between -3 and 7 potential ability." Should clamp to [1, 200].

#### MEDIUM: `loanSigned` outcome is unreachable (`clubResponse.ts:280-283`)

Defined in weight tables but never included in `liveOutcomes`. The loan signing feature is dead code.

#### MEDIUM: Budget over-allocation with same-priority gaps (`directives.ts:273-315`)

If two position gaps are both "critical," each gets 40% of budget (80% total). Budget shares assume all four tiers are represented.

---

### 2.9 Finance & Equipment

#### MEDIUM: Dual equipment systems coexist (`expenses.ts`)

Legacy `equipmentLevel` system (with `EQUIPMENT_UPGRADE_COSTS`, `EQUIPMENT_SUBSCRIPTION_COST`) coexists with the new slot-based `EquipmentInventory` system. No migration path between them.

#### MEDIUM: Financial processing fires on week 0 (`expenses.ts:205`)

`0 % 4 === 0` triggers a pay cycle on the very first week before any work is done.

#### LOW: Transaction history grows unboundedly (`expenses.ts:233`)

Two transactions appended every 4 weeks with no pruning. Over 20+ seasons, this array becomes a performance concern.

---

## 3. Screen & UI Component Issues

### 3.1 State Management Bugs

#### HIGH: `MainMenu.tsx` mutates Zustand state array (line 35)

`saveSlots.sort(...)` mutates the store's array in place. Should be `[...saveSlots].sort(...)`.

#### HIGH: `gameStore.ts` — `saveGame()` does not persist to disk (lines 588-594)

The `saveGame` method only updates the in-memory `lastSaved` timestamp. It does NOT write to IndexedDB. A browser crash after calling `saveGame()` loses all progress since the last autosave.

#### HIGH: `advanceWeek` race condition with autosave (lines 2553-2560)

Rapid "Advance Week" clicks can interleave IndexedDB writes. The autosave always writes state from the previous `set()` call, potentially one week behind.

#### HIGH: `loadGame` mutates its argument directly (lines 575-586)

Directly sets `state.scout.skills.playerJudgment = 5` and `state.finances.equipment = ...` on the incoming object, violating immutability.

#### MEDIUM: Season transition destroys all historical fixtures (line 2337)

`newState.fixtures = newFixtures` replaces the entire dictionary. Historical league tables become uncomputable.

#### MEDIUM: Inbox pruning deletes unread action-required messages (lines 2514-2516)

`.slice(-200)` can silently drop job offers or assignment notifications if inbox exceeds 200 messages.

#### MEDIUM: `advancePhase` allows phase index out of bounds (line 2605)

Can advance `currentPhase` to `phases.length`, causing `phases[currentPhase]` to return `undefined`.

#### MEDIUM: `setFocus` appends duplicate phase indices (lines 2614-2641)

Clicking the same player multiple times during one phase appends the same phase index repeatedly, inflating observation calculations.

### 3.2 UI Bugs

#### HIGH: PlayerDatabase — League sort key is duplicate of Club (`PlayerDatabase.tsx`)

Both "Club" and "League" columns use `"club"` as their sort key. Clicking "League" header sorts by club. League sorting is completely broken.

#### MEDIUM: Dashboard ordinal suffix wrong for 11th/12th/13th (`Dashboard.tsx:523`)

`homePos === 1 ? "st" : homePos === 2 ? "nd" : homePos === 3 ? "rd" : "th"` produces "11st", "12nd", "13rd".

#### MEDIUM: EquipmentSlotBrowser monthly cost delta shows 0 for empty slots (`EquipmentSlotBrowser.tsx:73-76`)

When equipping into an empty slot (no current item), `monthlyDelta` defaults to 0 instead of showing the full cost.

#### MEDIUM: LeaderboardScreen submit handler has no catch block (lines 228-253)

Errors from `submitToLeaderboard()` are silently swallowed. User thinks submission succeeded.

#### MEDIUM: NetworkScreen — schedule meeting silently fails when full (lines 158-172)

No user feedback when the schedule has no free slots.

#### MEDIUM: MainMenu + SettingsScreen — save deletion has no confirmation dialog

A single misclick permanently deletes a save file.

### 3.3 Performance Concerns

#### MEDIUM: Dashboard.tsx at 1195 lines with no memoization

Every state change re-renders the entire dashboard including fixtures, inbox, watchlist, finances, and specialization widgets. `getLeagueStandings()` called per fixture in render loop.

#### LOW: PlayerDatabase has no list virtualization

Hundreds of players rendered simultaneously with no `react-window` or similar.

#### LOW: MatchSummaryScreen computes grouped readings inside JSX IIFE

Complex computation on every render when a player panel is expanded.

### 3.4 Accessibility

#### LOW: CalendarScreen week summary modal missing all ARIA dialog semantics

No `role="dialog"`, `aria-modal`, focus trap, or Escape key handler.

#### LOW: YouthScoutingScreen tab container missing `role="tablist"`

Individual tab buttons have `role="tab"` but parent container lacks the required role.

---

## 4. Core Function & Logic Issues

### 4.1 RNG & Determinism

#### MEDIUM: No RNG state serialization (`rng/index.ts`)

The RNG class has no `getState()`/`setState()` methods. After save/load, the RNG must be reconstructed by replaying from seed, which diverges from the original sequence if any game logic changed.

#### LOW: Empty-string seed produces constant sequence (`rng/index.ts:22-30`)

All empty-string seeds produce hash `0x12345678`, yielding identical game worlds.

### 4.2 Player Generation

#### HIGH: Squad size capped at 25 despite intended max of 28 (`generation.ts:359-371`)

`buildPositionSlots` creates exactly 25 slots. `squadSize` ranges 22-28, but `slots.slice(0, size)` can only return up to 25. Squads of 26-28 are impossible.

#### MEDIUM: Birth year hardcoded to 2024 (`generation.ts:325`)

`birthYear = 2024 - age` is disconnected from the abstract season system.

#### MEDIUM: Position weights cause extreme clamping for high-CA players (`generation.ts:160-181`)

A ST with CA=200 has shooting center at `20 * 1.8 = 36`, clamped to 20. All variance eliminated at the extremes.

#### LOW: `generatePotentialAbility` negative offset is dead logic for age 29+ (line 184)

`Math.max(ca, ca + rng.nextInt(-5, 10))` absorbs all negative values, making the -5 range pointless.

### 4.3 Scout Creation

#### MEDIUM: `STARTING_PERKS` shared mutable array reference (`creation.ts:239`)

`unlockedPerks: STARTING_PERKS[specialization]` is a direct reference to the constant. Any mutation corrupts the shared constant.

#### MEDIUM: Skill allocation validates `> BONUS_POINTS` but doc says "must equal" (`creation.ts:345`)

Under-spending bonus points is silently allowed despite the documentation.

#### LOW: Duplicate position affinities possible (`creation.ts:295-297`)

Youth specialization can pick `"CAM"` from both attacking and midfield pools.

### 4.4 Transfer Window

#### MEDIUM: No function to evaluate expired urgent assessments (`transferWindow.ts`)

Urgent assessments are generated but never checked for expiry. No reputation penalty for missed deadlines.

#### LOW: `DEADLINE_DAY_FINAL_WEEK_OFFSET = 0` makes the constant meaningless (`transferWindow.ts:305`)

### 4.5 Type System Issues

#### MEDIUM: `ScoutingDirective` type defined but never used in `GameState` (`types.ts`)

`ManagerDirective` is used instead. `ScoutingDirective` appears to be dead code.

#### LOW: `InboxMessage.relatedEntityType` never set by message generators

All messages in `gameLoop.ts` omit this field, making it impossible for UI code to know what `relatedId` refers to.

#### LOW: `ScoutReport.qualityScore` vs `NPCScoutReport.quality` — inconsistent naming

Both represent the same concept (0-100 quality).

### 4.6 Barrel Export Gaps

#### LOW: Core `index.ts` missing exports for calendar, transferWindow, and ~30 types

Consumers must reach into sub-modules directly, defeating the barrel file's purpose.

---

## 5. Security Findings

### 5.1 Critical & High Severity

#### CRITICAL: No Content-Security-Policy (CSP) header (`next.config.ts:5-14`)

The most impactful missing security control. Without CSP, the application is vulnerable to XSS attacks where injected scripts could execute freely. Recommend at minimum:
```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co
```

#### HIGH: Client-side leaderboard scores with no server-side verification (`supabaseLeaderboard.ts:58-74`)

Scores are computed entirely client-side and inserted directly into Supabase. Any authenticated user can submit fabricated scores via direct API calls. The score formula is:
```typescript
score = reputation * 2 + totalDiscoveries * 5 + predictionAccuracy * 1.5
```
This must be moved to a Supabase Edge Function or database trigger.

#### HIGH: RLS dependency without verification (`supabaseCloudSave.ts:22-23`)

The code comments say RLS "should" enforce user isolation, but nothing in the codebase verifies RLS policies are correctly configured. If RLS is disabled or misconfigured, any authenticated user can access other users' saves.

#### HIGH: `downloadSave` does not run migration (`supabaseCloudSave.ts:107-119`)

Unlike the local IndexedDB path (which has `migrateSaveState`), cloud downloads cast directly to `GameState` with no migration. Schema evolution between saves will cause runtime crashes.

#### HIGH: 13 high-severity npm vulnerabilities in dependency tree

All from `minimatch < 10.2.1` (ReDoS via `GHSA-3ppc-4f35-3m26`), affecting ESLint and related devDependencies.

### 5.2 Medium Severity

#### MEDIUM: No Strict-Transport-Security (HSTS) header (`next.config.ts`)

Should be explicitly configured regardless of hosting platform.

#### MEDIUM: Environment variables use non-null assertion without runtime validation (`supabase.ts:15-16`)

If `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` is unset, the app crashes with an unhelpful error.

#### MEDIUM: `userId` not derived from session (`supabaseCloudSave.ts:62`)

Constructor accepts a string `userId` rather than deriving it from `supabase.auth.getUser()`. If caller passes wrong ID, RLS is the only defense.

#### MEDIUM: No rate limiting on login attempts (`authStore.ts:242-248`)

`signInWithEmail` makes direct calls with no client-side rate limiting or exponential backoff.

#### MEDIUM: Minimum password length only 6 characters (`AuthModal.tsx:71`)

NIST recommends at least 8; many services now require 10-12.

#### MEDIUM: Minimal ESLint configuration with no security rules (`.eslintrc.json`)

Only extends `next/core-web-vitals`. No `eslint-plugin-security`, `no-unsanitized`, or `@typescript-eslint/no-explicit-any`.

#### MEDIUM: No `npm audit` step in CI pipeline (`.github/workflows/ci.yml`)

Vulnerable dependencies don't fail the build.

#### MEDIUM: No Dependabot or Renovate configuration

Dependencies are not automatically monitored for security updates.

#### MEDIUM: `checkConflict` swallows errors and reports "no conflict" (`supabaseCloudSave.ts:178`)

Database errors cause `{ hasConflict: false }`, potentially leading to silent data overwrites.

#### MEDIUM: `authStore.initialize` has no `.catch()` on `getSession()` (`authStore.ts:217-219`)

Network failures leave `isLoading: true` forever — permanent loading spinner.

### 5.3 Low Severity

#### LOW: `_applySession` publicly exposed on store (`authStore.ts:165`)

Any code can call it with an arbitrary session object. RLS protects server-side data, but client-side auth state can be spoofed.

#### LOW: `scoutName` not sanitized before leaderboard insertion (`supabaseLeaderboard.ts:65`)

Supabase uses parameterized queries (preventing SQL injection), but the name could contain XSS payloads if the leaderboard is rendered without escaping.

#### LOW: `getCloudLeaderboard` accepts unbounded `limit` parameter (`supabaseLeaderboard.ts:88`)

A caller could pass `limit = 1000000` and pull the entire table.

#### LOW: `crypto.randomUUID()` not available in all environments (`leaderboard.ts:61`)

Throws `TypeError` in non-secure HTTP contexts or older browsers. No polyfill.

### 5.4 Positive Security Findings

- No hardcoded secrets, API keys, or credentials anywhere in source
- No uses of `eval()`, `innerHTML`, or `dangerouslySetInnerHTML`
- No raw `fetch()` calls — all via Supabase client
- No explicit `any` types in the codebase
- `.env` files properly gitignored
- `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy` headers present
- React's automatic JSX escaping prevents XSS in rendered content

---

## 6. Full Issue Index

### Critical (6)

| # | Location | Issue |
|---|----------|-------|
| 1 | `gameLoop.ts:431-434` | Pre-peak growth formula inverted — younger players get zero growth |
| 2 | `npcScouts.ts:283-298` | Territory filtering compares clubId vs leagueId — always fails |
| 3 | `progression.ts:692` | `acceptJobOffer` uses `specializationLevel` as season proxy |
| 4 | `gameStore.ts:588-594` | `saveGame()` does not persist to IndexedDB — data loss risk |
| 5 | `next.config.ts` | No Content-Security-Policy header |
| 6 | `supabaseLeaderboard.ts:58-74` | Client-side scores trivially manipulable |

### High (25)

| # | Location | Issue |
|---|----------|-------|
| 7 | `gameLoop.ts:204-209` | `clubAverageAbility` deflated by dangling player refs |
| 8 | `gameLoop.ts:1376-1462` | Youth aging results not applied mid-season |
| 9 | `gameLoop.ts:1470-1494` | Season events not regenerated on rollover |
| 10 | `calendar.ts:358-360` | `removeActivity` identity check breaks after save/load |
| 11 | `perception.ts:241,354` | `contextDiversity` counts observations, not distinct contexts |
| 12 | `perception.ts` | Scout fatigue has zero effect on perception accuracy |
| 13 | `progression.ts:597` | `generateJobOffers` crashes at reputation 0 |
| 14 | `management.ts:253` | Manager directive records meeting count as week number |
| 15 | `homeAdvantage.ts:27-57` | Multi-word country names never match neighbor map |
| 16 | `homeAdvantage.ts:89` | `.includes()` nationality check causes false positives |
| 17 | `international.ts:657` | `expiredAssignmentIds` always empty |
| 18 | `reporting.ts:476-479` | Division by zero when all confidences are 0 → NaN |
| 19 | `reporting.ts:660-677` | Duplicate attributes deflate report quality scores |
| 20 | `contacts.ts:365-367` | Data scout missing 1 starting agent contact |
| 21 | `generation.ts:359-371` | Squad size capped at 25, intended max is 28 |
| 22 | `transfers.ts` | Country casing mismatch across modules |
| 23 | `gameStore.ts:575-586` | `loadGame` mutates input argument |
| 24 | `gameStore.ts:2553-2560` | Autosave race condition on rapid advance |
| 25 | `supabaseCloudSave.ts:22-23` | RLS assumed but never verified |
| 26 | `supabaseCloudSave.ts:107-119` | Cloud download skips migration |
| 27 | `MainMenu.tsx:35` | `.sort()` mutates Zustand state array |
| 28 | `PlayerDatabase.tsx` | League sort key duplicates Club sort key |
| 29 | `package.json` | 13 high-severity npm audit vulnerabilities |
| 30 | `authStore.ts:217-219` | `getSession()` no catch → permanent loading spinner |
| 31 | `venues.ts:228-240` | Unsafe cast injects invalid values into venueAppearances |

### Medium (32)

| # | Location | Issue |
|---|----------|-------|
| 32 | `gameLoop.ts:930-934` | Reputation change misses cross-season boundary |
| 33 | `gameLoop.ts:522-545` | No age filter in player development |
| 34 | `gameLoop.ts:449-451` | `lateBloomer` hardcodes age 26 instead of peak |
| 35 | `calendar.ts:714` | No double-processing guard |
| 36 | `calendar.ts:898-907` | Fatigue penalty on projected, not initial fatigue |
| 37 | `activityQuality.ts:58-67` | `PRIMARY_SKILL_MAP` covers only 8/35+ activities |
| 38 | `phases.ts:401-403` | Gaussian instead of Poisson for goals |
| 39 | `phases.ts:296-301` | Phase minutes pile up at 89 |
| 40 | `starRating.ts:238-239` | PA range collapses to zero width |
| 41 | `fixtures.ts:112-118` | Weather hardcoded to English season |
| 42 | `international.ts:439` | Youth tournament `playerIds` always empty |
| 43 | `init.ts:198` | Duplicate country processing possible |
| 44 | `contacts.ts:669` | Absolute week comparison may go negative |
| 45 | `clubResponse.ts:280-283` | `loanSigned` outcome unreachable |
| 46 | `directives.ts:273-315` | Budget over-allocation with same-priority gaps |
| 47 | `transferTracker.ts:252` | Snapshot uses original club, not current |
| 48 | `gutFeeling.ts:320-321` | Negative PA values for low-PA players |
| 49 | `expenses.ts` | Dual equipment systems, no migration |
| 50 | `expenses.ts:205` | Financial processing fires on week 0 |
| 51 | `creation.ts:239` | Shared mutable array for `unlockedPerks` |
| 52 | `creation.ts:345` | Under-spending bonus points silently allowed |
| 53 | `rng/index.ts` | No RNG state serialization |
| 54 | `generation.ts:325` | Hardcoded birth year 2024 |
| 55 | `generation.ts:160-181` | Extreme clamping eliminates attribute variance |
| 56 | `gameStore.ts:2337` | Season transition destroys historical fixtures |
| 57 | `gameStore.ts:2514-2516` | Inbox pruning deletes unread action-required messages |
| 58 | `gameStore.ts:2605` | `advancePhase` allows out-of-bounds index |
| 59 | `gameStore.ts:2614-2641` | `setFocus` appends duplicate phase indices |
| 60 | `Dashboard.tsx:523` | Ordinal suffix wrong for 11th/12th/13th |
| 61 | `EquipmentSlotBrowser.tsx:73-76` | Monthly cost delta shows 0 for empty slots |
| 62 | `LeaderboardScreen.tsx:228-253` | Submit handler has no catch block |
| 63 | `supabase.ts:15-16` | Env vars use non-null assertion, no runtime check |

### Low (25)

| # | Location | Issue |
|---|----------|-------|
| 64 | `gameLoop.ts:1287-1334` | Same-tick injury + transfer race |
| 65 | `seasonEvents.ts:32-89` | Events hardcoded to 38-week season |
| 66 | `transferWindow.ts:305` | `DEADLINE_DAY_FINAL_WEEK_OFFSET = 0` meaningless |
| 67 | `starRating.ts:32-38` | Comment docs wrong for star boundaries |
| 68 | `types.ts` | `ScoutingDirective` type unused |
| 69 | `types.ts` | `relatedEntityType` never set on inbox messages |
| 70 | `types.ts` | `qualityScore` vs `quality` naming inconsistency |
| 71 | `core/index.ts` | Many types and modules not re-exported |
| 72 | `phases.ts:420-421` | Potential infinite loop in `pickScorers` |
| 73 | `generation.ts:184` | Dead negative offset in PA generation |
| 74 | `creation.ts:295-297` | Duplicate position affinities |
| 75 | `rng/index.ts:22-30` | Empty-string seed constant |
| 76 | `contacts.ts:22` | RNG value import instead of type import |
| 77 | `expenses.ts:233` | Unbounded transaction history |
| 78 | `Dashboard.tsx` | 1195 lines, no memoization, standings in render loop |
| 79 | `PlayerDatabase.tsx` | No list virtualization |
| 80 | `CalendarScreen.tsx:231-355` | Modal missing ARIA dialog semantics |
| 81 | `YouthScoutingScreen.tsx:523` | Tab container missing `role="tablist"` |
| 82 | `NetworkScreen.tsx:158-172` | Meeting schedule silently fails when full |
| 83 | `MainMenu.tsx:46-48` | Save deletion with no confirmation |
| 84 | `authStore.ts:165` | `_applySession` publicly exposed |
| 85 | `supabaseLeaderboard.ts:65` | `scoutName` not sanitized |
| 86 | `supabaseLeaderboard.ts:88` | Unbounded `limit` parameter |
| 87 | `leaderboard.ts:61` | `crypto.randomUUID()` availability |
| 88 | `.eslintrc.json` | No security ESLint rules |

---

*End of review.*
