# PA Estimate & System Fit Implementation Plan

## Context
Two equipment bonuses (`paEstimateAccuracy`, `systemFitAccuracy`) couldn't be wired because their underlying features don't exist at runtime. Both systems are ~80% built — engines, types, UI scaffolding — but the orchestration layer that connects them is missing.

---

## Feature 1: PA Estimate System

### Current State
- `formatGutFeelingWithPA()` exists in `gutFeeling.ts` — appends "±5 PA range" to gut feeling narrative — **never called**
- `GutFeelingCandidate` type in `ReflectionScreen.tsx` has no PA field
- `rollGutFeeling()` generates youth gut feelings but doesn't pass PA data through
- `checkGutFeelingTrigger()` in `reflection.ts` generates post-observation gut feelings — no PA either
- Perk "Generational Eye" (level 18 youth spec) with `paEstimate` effect is defined but never checked
- Equipment bonus `paEstimateAccuracy: 0.10` aggregates but is never consumed
- The ±5 margin could be narrowed by equipment bonus (currently hardcoded)

### Implementation Steps

#### 1a. Add PA estimate to GutFeelingCandidate type
**File: `src/engine/observation/reflection.ts`**
- Add optional `paEstimate?: { low: number; high: number }` to `GutFeelingCandidate` interface
- This is the data structure that flows from engine → store → ReflectionScreen

#### 1b. Pass perk modifiers and equipment bonus into gut feeling generation
**File: `src/engine/observation/reflection.ts`** — `checkGutFeelingTrigger()`
- Add optional params: `perkModifiers?: { paEstimate: boolean }`, `paEstimateAccuracyBonus?: number`
- When gut feeling triggers AND subject is a youth player AND `perkModifiers.paEstimate === true`:
  - Look up the youth's true `potentialAbility`
  - Calculate margin: `Math.max(1, Math.round(5 * (1 - paEstimateAccuracyBonus)))` (equipment narrows the ±5 range)
  - Set `paEstimate: { low: Math.max(1, pa - margin), high: pa + margin }` on the candidate
- Need access to players data to look up the player object and their PA

#### 1c. Pass perk + equipment data from gameStore into reflection
**File: `src/stores/gameStore.ts`** — where `checkGutFeelingTrigger()` is called (~line 8048)
- Read the scout's active perks to check for `paEstimate` perk
- Read `equipBonuses.paEstimateAccuracy` from the equipment system
- Pass both into `checkGutFeelingTrigger()`

#### 1d. Also wire `formatGutFeelingWithPA()` for youth-specific gut feelings
**File: `src/stores/gameStore.ts`** — where `rollGutFeeling()` results are processed
- After `rollGutFeeling()` returns a gut feeling for a youth player:
  - If scout has `paEstimate` perk, call `formatGutFeelingWithPA()` to enrich the narrative
  - Pass the equipment bonus to narrow the margin
- This handles the **youth observation** path (distinct from post-observation reflection)

#### 1e. Display PA estimate in ReflectionScreen
**File: `src/components/game/ReflectionScreen.tsx`**
- In the gut feeling display section (~line 260-316):
  - If `gutFeelingCandidate.paEstimate` exists, render a "Potential Estimate" section below the reliability bar
  - Show the range: "Estimated PA: {low} – {high}" with a visual bar
  - Style with subtle "heuristic" feel — dashed border, muted colors — to convey it's an estimate

#### 1f. Wire the `paEstimateAccuracy` equipment bonus
**File: `src/stores/gameStore.ts`**
- At the point where we pass params into reflection/gut feeling (steps 1c/1d), read the bonus:
  ```
  const equipBonuses = getActiveEquipmentBonuses(finances.equipment.loadout);
  const paAccuracy = equipBonuses.paEstimateAccuracy ?? 0;
  ```
- Pass into both `checkGutFeelingTrigger()` and `formatGutFeelingWithPA()`

#### 1g. Update `formatGutFeelingWithPA()` to use equipment bonus
**File: `src/engine/youth/gutFeeling.ts`**
- Add optional `accuracyBonus?: number` parameter (default 0)
- Change margin: `const margin = Math.max(1, Math.round(5 * (1 - accuracyBonus)));`
- At 0.10 bonus → margin becomes 5 (round of 4.5) — no change
- At 0.20 bonus → margin becomes 4 (round of 4.0)
- Consider making base margin configurable or using floor instead of round for earlier effect

---

## Feature 2: System Fit Analysis

### Current State
- `calculateSystemFit()` in `systemFit.ts` — 4D scoring (position 25%, role 30%, tactical 25%, age 20%) — **never called**
- `systemFitCache: Record<string, SystemFitResult>` on GameState — initialized empty, **never populated**
- `ScoutReport.systemFitScore?: number` field exists — **never set**
- `PlayerProfile.tsx` already reads from cache at `systemFitCache[playerId:clubId]` — always gets `undefined`
- Equipment `systemFitAccuracy: 0.15` aggregates — **never consumed**
- "Perfect Fit" insight action generates positional data — **never persisted**
- Club response uses simple `formationFitsPlayer()` check, ignores full system fit

### Implementation Steps

#### 2a. Populate system fit cache during report submission
**File: `src/stores/gameStore.ts`** — `submitReport` action
- For first-team scouts (club path, specialization === "firstTeam"):
  - After report is scored, call `calculateSystemFit(player, club, manager, allPlayers)`
  - Store result in `systemFitCache[playerId:clubId]`
  - Set `report.systemFitScore = result.overallFit`
- Need to look up the club and manager objects from the scout's current club

#### 2b. Apply `systemFitAccuracy` equipment bonus
**File: `src/engine/firstTeam/systemFit.ts`** — `calculateSystemFit()`
- Add optional `accuracyBonus?: number` parameter (default 0)
- Add small random noise to each dimension to simulate imperfect assessment
- Equipment bonus reduces noise: `noise * (1 - accuracyBonus)`
- At 0.15 bonus → 85% of normal noise (more accurate)

#### 2c. Pass equipment bonus from store into calculateSystemFit
**File: `src/stores/gameStore.ts`** — same location as 2a
- Read `equipBonuses.systemFitAccuracy` from equipment loadout
- Pass into `calculateSystemFit()` as the accuracy bonus

#### 2d. Populate cache from "Perfect Fit" insight action
**File: `src/stores/gameStore.ts`** — where insight action results are processed
- When "perfectFit" insight completes with `systemFitData`:
  - Also call full `calculateSystemFit()` to get complete 4D result
  - Store in `systemFitCache[playerId:clubId]`

#### 2e. Verify/enhance PlayerProfile display
**File: `src/components/game/PlayerProfile.tsx`**
- Cache retrieval exists (~line 1050-1054)
- Verify SystemFitCard or equivalent renders when data exists
- If no rendering component, add a section showing:
  - Overall fit as badge/meter (0-100)
  - Four dimension breakdown bars
  - Strengths/weaknesses from result
  - Only for first-team specialization scouts

#### 2f. Include system fit in report draft display
**File: `src/components/game/ReportWriter.tsx`**
- If `systemFitScore` available, show "System Fit: X/100" badge
- Show strengths/weaknesses bullets

#### 2g. Integrate system fit into club response
**File: `src/engine/firstTeam/clubResponse.ts`** — `generateClubResponse()`
- After formationFitsPlayer check passes, use full system fit to weight outcomes:
  - overallFit >= 80: boost positive outcomes
  - overallFit < 40: penalize positive outcomes
- Include fit context in response feedback

---

## Agent Strategy
2 parallel agents, one per feature. Both modify gameStore.ts in different sections (PA in observation/gut feeling flow, system fit in report submission flow).
