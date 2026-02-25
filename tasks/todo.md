# Fix Core Game Loop: Youth Discovery + Assignment Filtering

## Bug 1: Youth scouting activities discover zero players
- [x] Root cause: `generateRegionalYouth()` only called at game init + season start, never during weekly gameplay
- [x] Fix: Add weekly youth generation in `startWeekSimulation()` before venue pool processing
- [x] Fix: Add weekly youth generation in fallback `advanceWeek()` path too
- [ ] Verify: Pool populated, discoveries shown in simulation

## Bug 2: Youth scouts get first-team urgent assessments
- [x] Root cause: Youth scouts shouldn't assess signed club players at all — they discover unsigned youth organically
- [x] Fix: Skip urgent assessment generation for youth scouts in gameStore.ts (line 2936)
- [x] Fix: Skip maybeGenerateAssignment for youth scouts in gameLoop.ts (line 726)
- [x] Fix: Skip processDailyTick urgent assessment for youth scouts in transferWindow.ts (line 453)
- [ ] Verify: No more "Urgent Assessment Request" messages for youth scouts

## Verification
- [x] Build succeeds
- [ ] Package Electron app
- [ ] Test: youth scout schedules school matches → discovers youth players
- [ ] Test: youth scout inbox has no first-team urgent assessments
