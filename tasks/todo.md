# Player Match Rating System (1-10 Scale)

## Phase 1: Types + Rating Engine
- [x] Add new types to `types.ts` (PlayerMatchRating, MatchPlayerStats, MatchFormEntry, SeasonRatingRecord)
- [x] Extend Player with `recentMatchRatings` and `seasonRatings`
- [x] Extend GameState with `matchRatings`
- [x] Create `src/engine/match/ratings.ts`
- [x] Migration in gameStore (loadGame, loadFromSlot)
- [x] Init `matchRatings: {}` in new game
- [x] Build check

## Phase 2: Wire Into Match Flow
- [x] Expand SimulatedFixture with scorers/playerRatings
- [x] In simulateFixture: pick scorers, call generateSimulatedMatchRatings
- [x] In advanceWeek (gameLoop): store ratings, update player form
- [x] In endMatch (gameStore): calc attended ratings, update form, store in lastMatchResult
- [x] Expand lastMatchResult type
- [x] Build check

## Phase 3: Development + Transfer Integration
- [x] Modify computePlayerDevelopment: add form bonus
- [x] Modify generateSeasonSnapshot: use real match data when available
- [x] Build check

## Phase 4: UI
- [x] MatchSummaryScreen: add match ratings section
- [x] PlayerProfile: add form & performance card
- [x] Build check

## Phase 5: Season Consolidation
- [x] In end-of-season: consolidate matchRatings → seasonRatings, wipe matchRatings
- [x] Build check

## Verification
- [x] `npm run build` passes
- [x] Full production build succeeds
