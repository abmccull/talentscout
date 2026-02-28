/**
 * Full Season Playthrough E2E Tests
 *
 * Validates that each specialization can complete an entire 38-week season
 * without crashes, state corruption, or console errors. Also verifies that
 * the hard difficulty's starter stipend keeps the scout solvent through the
 * early game even with zero player actions.
 *
 * Strategy:
 *   - Advance in segments (5, 5, 10, 10, 8+) using batchAdvance
 *   - At each milestone checkpoint, assert game state consistency
 *   - After season-end, navigate to 10 key screens to catch rendering bugs
 *   - batchAdvance stops early on season transition or fatigue >= 100,
 *     so we loop until the season actually advances
 */

import { test, expect } from "../fixtures";
import { SPECIALIZATIONS } from "../helpers/selectors";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Milestone checkpoints within a season (week numbers to pause and verify). */
const MILESTONES = [5, 10, 20, 30, 38] as const;

/**
 * Advance weeks via batchAdvance, handling the early-exit-on-season-end
 * and early-exit-on-fatigue behaviors.
 *
 * batchAdvance stops when: (a) season transitions, (b) fatigue >= 100,
 * or (c) requested weeks are exhausted. To reach a target week reliably,
 * we loop: advance, reset fatigue if the engine stalled on it, repeat.
 */
async function advanceToWeek(
  page: import("@playwright/test").Page,
  targetWeek: number,
): Promise<{ currentWeek: number; currentSeason: number; transitioned: boolean }> {
  const MAX_LOOPS = 20; // Safety valve to prevent infinite loops

  const result = await page.evaluate(
    ({ target, maxLoops }) => {
      const store = (window as any).__GAME_STORE__;
      if (!store) throw new Error("__GAME_STORE__ not found");

      const stateBefore = store.getState().gameState;
      if (!stateBefore) throw new Error("gameState is null");
      const startSeason = stateBefore.currentSeason;

      for (let loop = 0; loop < maxLoops; loop++) {
        const gs = store.getState().gameState;
        if (!gs) break;

        // Season already transitioned — stop
        if (gs.currentSeason > startSeason) {
          return {
            currentWeek: gs.currentWeek,
            currentSeason: gs.currentSeason,
            transitioned: true,
          };
        }

        // Reached or passed the target week — stop
        if (gs.currentWeek >= target) {
          return {
            currentWeek: gs.currentWeek,
            currentSeason: gs.currentSeason,
            transitioned: false,
          };
        }

        // If fatigue is maxed, reset it so batchAdvance can proceed.
        // This simulates the player resting between work sprints.
        if (gs.scout.fatigue >= 95) {
          store.getState().loadGame({
            ...gs,
            scout: { ...gs.scout, fatigue: 20 },
          });
        }

        const remaining = target - store.getState().gameState.currentWeek;
        if (remaining <= 0) break;
        store.getState().batchAdvance(remaining);
      }

      const after = store.getState().gameState;
      return {
        currentWeek: after.currentWeek,
        currentSeason: after.currentSeason,
        transitioned: after.currentSeason > startSeason,
      };
    },
    { target: targetWeek, maxLoops: MAX_LOOPS },
  );

  // Brief wait for React to settle after state change
  await page.waitForTimeout(300);
  return result;
}

/**
 * Keep calling batchAdvance until a season transition occurs.
 * Handles both the fatigue gate and the dynamic season length
 * (season may be > 38 weeks depending on fixture schedule).
 */
async function advanceUntilSeasonEnd(
  page: import("@playwright/test").Page,
): Promise<{ currentWeek: number; currentSeason: number }> {
  // Advance to a very high week number — advanceToWeek will stop
  // as soon as a season transition occurs.
  const result = await advanceToWeek(page, 60);
  return { currentWeek: result.currentWeek, currentSeason: result.currentSeason };
}

/**
 * Read a snapshot of key game state values for assertion.
 */
async function getStateSnapshot(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const store = (window as any).__GAME_STORE__;
    const gs = store?.getState()?.gameState;
    if (!gs) return null;
    return {
      currentWeek: gs.currentWeek,
      currentSeason: gs.currentSeason,
      totalWeeksPlayed: gs.totalWeeksPlayed,
      scoutTier: gs.scout?.careerTier,
      specialization: gs.scout?.primarySpecialization,
      reputation: gs.scout?.reputation,
      fatigue: gs.scout?.fatigue,
      financesBalance: gs.finances?.balance ?? null,
      playerCount: gs.players ? Object.keys(gs.players).length : 0,
      clubCount: gs.clubs ? Object.keys(gs.clubs).length : 0,
    };
  });
}

// ─── Key screens to verify after season end ──────────────────────────────────

const POST_SEASON_SCREENS = [
  "dashboard",
  "calendar",
  "playerDatabase",
  "reportHistory",
  "career",
  "inbox",
  "network",
  "settings",
  "finances",
  "achievements",
] as const;

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe("Full Season Playthrough", () => {
  // These tests advance through an entire season — give them extra time.
  test.setTimeout(120_000);

  for (const spec of SPECIALIZATIONS) {
    test(`complete season 1 as ${spec} specialist`, async ({ gamePage }) => {
      await gamePage.goto();

      // Start a fresh game with the given specialization
      await gamePage.injectState({
        currentWeek: 1,
        currentSeason: 1,
        scout: {
          careerTier: 1,
          primarySpecialization: spec,
          firstName: "Season",
          lastName: "Test",
          fatigue: 10,
        },
      });

      // Verify initial state
      const initial = await getStateSnapshot(gamePage.page);
      expect(initial).not.toBeNull();
      expect(initial!.currentWeek).toBe(1);
      expect(initial!.currentSeason).toBe(1);
      expect(initial!.specialization).toBe(spec);

      // ── Advance through milestones ──────────────────────────────────────
      let seasonTransitioned = false;
      const startSeason = 1;

      for (const milestone of MILESTONES) {
        if (seasonTransitioned) break;

        const result = await advanceToWeek(gamePage.page, milestone);

        if (result.transitioned) {
          seasonTransitioned = true;

          // Season-end assertions
          expect(result.currentSeason).toBe(startSeason + 1);
          expect(result.currentWeek).toBeGreaterThanOrEqual(1);
          expect(result.currentWeek).toBeLessThanOrEqual(5); // Reset to 1, maybe 2 if extra advance
        } else {
          // Mid-season milestone assertions
          expect(result.currentWeek).toBeGreaterThanOrEqual(milestone);
          expect(result.currentSeason).toBe(startSeason);
        }

        // Snapshot state at this checkpoint
        const snapshot = await getStateSnapshot(gamePage.page);
        expect(snapshot).not.toBeNull();

        // Core invariants that must hold at every checkpoint:
        // - Player database should not be empty (world was generated)
        expect(snapshot!.playerCount).toBeGreaterThan(0);
        // - Club database should not be empty
        expect(snapshot!.clubCount).toBeGreaterThan(0);
        // - Scout reputation should be a valid number in [0, 100]
        expect(snapshot!.reputation).toBeGreaterThanOrEqual(0);
        expect(snapshot!.reputation).toBeLessThanOrEqual(100);
        // - Fatigue should be a valid number in [0, 100]
        expect(snapshot!.fatigue).toBeGreaterThanOrEqual(0);
        expect(snapshot!.fatigue).toBeLessThanOrEqual(100);

        // Assert no console errors accumulated up to this milestone
        const errors = gamePage.getConsoleErrors();
        expect(
          errors,
          `Console errors at milestone week ${milestone} (${spec})`,
        ).toEqual([]);
      }

      // If season did not transition during milestones, push through to end
      if (!seasonTransitioned) {
        const endResult = await advanceUntilSeasonEnd(gamePage.page);
        expect(endResult.currentSeason).toBe(startSeason + 1);
        seasonTransitioned = true;
      }

      // ── Post-season screen navigation ───────────────────────────────────
      // The scout is now in season 2, week 1. Tier is still 1, so some
      // screens may not be visible yet. We use setScreen (store injection)
      // which bypasses visibility gates, testing only that the screen
      // component renders without throwing.

      for (const screen of POST_SEASON_SCREENS) {
        await gamePage.setScreen(screen);
        await gamePage.page.waitForTimeout(300);

        const current = await gamePage.getCurrentScreen();
        expect(current).toBe(screen);

        // Verify screen rendered some content (not a blank page)
        const bodyText = await gamePage.page.innerText("body");
        expect(bodyText.length).toBeGreaterThan(0);
      }

      // Final console error check — covers the entire test run
      gamePage.expectNoConsoleErrors();
    });
  }

  // ─── Hard Difficulty Balance Test ─────────────────────────────────────────

  test("hard difficulty survives 8 weeks without bankruptcy", async ({ gamePage }) => {
    await gamePage.goto();

    // Start a hard-difficulty game directly via the store, since
    // injectGameState hardcodes difficulty to "normal".
    await gamePage.page.evaluate(() => {
      const tutorialStore = (window as any).__TUTORIAL_STORE__;
      if (tutorialStore) tutorialStore.getState().dismissForever();
    });

    await gamePage.page.evaluate(async () => {
      const store = (window as any).__GAME_STORE__;
      if (!store) throw new Error("__GAME_STORE__ not found");

      await store.getState().startNewGame({
        scoutFirstName: "Hard",
        scoutLastName: "Mode",
        scoutAge: 28,
        specialization: "youth",
        difficulty: "hard",
        worldSeed: "e2e-hard-42",
        selectedCountries: ["england"],
        nationality: "English",
        avatarId: 1,
      });
    });

    // Wait for game to initialize
    await gamePage.waitForScreen("dashboard", 30_000);

    // Verify difficulty and initial financial state
    const initialState = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const gs = store?.getState()?.gameState;
      if (!gs) return null;
      return {
        difficulty: gs.difficulty,
        balance: gs.finances?.balance ?? null,
        currentWeek: gs.currentWeek,
      };
    });

    expect(initialState).not.toBeNull();
    expect(initialState!.difficulty).toBe("hard");
    expect(initialState!.balance).not.toBeNull();

    const startBalance = initialState!.balance!;
    // Hard mode starts with 2000 cash — it should be positive
    expect(startBalance).toBeGreaterThan(0);

    // Advance 8 weeks with zero player actions (auto-schedule only via batchAdvance)
    await gamePage.advanceWeeks(8);

    // After 8 weeks with the starter stipend (200/week on hard),
    // the balance should still be positive.
    const afterState = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const gs = store?.getState()?.gameState;
      if (!gs) return null;
      return {
        balance: gs.finances?.balance ?? null,
        currentWeek: gs.currentWeek,
        fatigue: gs.scout?.fatigue,
      };
    });

    expect(afterState).not.toBeNull();
    expect(afterState!.currentWeek).toBeGreaterThan(1);
    // The critical assertion: balance must remain positive.
    // The starter stipend should keep the scout afloat even with no income from reports.
    expect(afterState!.balance).toBeGreaterThan(0);

    gamePage.expectNoConsoleErrors();
  });
});
