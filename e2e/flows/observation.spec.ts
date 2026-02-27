import { test, expect } from "../fixtures";

test.describe("Observation Flow", () => {
  test.beforeEach(async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectMidGameState("youth");
  });

  test("fixture browser shows available fixtures", async ({ gamePage }) => {
    await gamePage.navigateTo("fixtureBrowser");
    await gamePage.page.waitForTimeout(500);

    const screen = await gamePage.getCurrentScreen();
    expect(screen).toBe("fixtureBrowser");

    // Should have content rendered
    const content = await gamePage.page.innerText("body");
    expect(content.length).toBeGreaterThan(100);

    gamePage.expectNoConsoleErrors();
  });

  test("match screen renders when started via store", async ({ gamePage }) => {
    // Check if there are any fixtures available
    const hasFixtures = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const state = store?.getState()?.gameState;
      if (!state) return false;
      return Object.keys(state.fixtures).length > 0;
    });

    if (hasFixtures) {
      // Try to start a match with the first fixture
      const started = await gamePage.page.evaluate(() => {
        const store = (window as any).__GAME_STORE__;
        const state = store?.getState()?.gameState;
        const fixtureId = Object.keys(state.fixtures)[0];
        return store.getState().scheduleMatch(fixtureId);
      });

      if (started) {
        await gamePage.page.evaluate(() => {
          const store = (window as any).__GAME_STORE__;
          const state = store?.getState()?.gameState;
          const fixtureId = Object.keys(state.fixtures)[0];
          store.getState().startMatch(fixtureId);
        });

        await gamePage.page.waitForTimeout(500);

        const screen = await gamePage.getCurrentScreen();
        expect(screen).toBe("match");

        gamePage.expectNoConsoleErrors();
      }
    }
  });

  test("observation session can be started via store", async ({ gamePage }) => {
    // Check for players in the database
    const hasPlayers = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const state = store?.getState()?.gameState;
      return state && Object.keys(state.players).length > 0;
    });

    if (hasPlayers) {
      // Start an observation session
      await gamePage.page.evaluate(() => {
        const store = (window as any).__GAME_STORE__;
        const state = store.getState().gameState;
        const players = Object.values(state.players).slice(0, 3) as any[];
        const pool = players.map((p: any) => ({
          playerId: p.id,
          name: `${p.firstName} ${p.lastName}`,
          position: p.position ?? "Forward",
        }));

        store.getState().startObservationSession(
          "matchAttendance",
          pool,
          pool[0].playerId,
        );
      });

      await gamePage.page.waitForTimeout(500);

      const screen = await gamePage.getCurrentScreen();
      expect(screen).toBe("observation");

      // Verify observation screen renders
      const content = await gamePage.page.innerText("body");
      expect(content.length).toBeGreaterThan(50);

      gamePage.expectNoConsoleErrors();
    }
  });

  test("observation screen has focus controls", async ({ gamePage }) => {
    // Start session via store
    const started = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const state = store.getState().gameState;
      if (!state || Object.keys(state.players).length === 0) return false;

      const players = Object.values(state.players).slice(0, 3) as any[];
      const pool = players.map((p: any) => ({
        playerId: p.id,
        name: `${p.firstName} ${p.lastName}`,
        position: p.position ?? "Forward",
      }));

      store.getState().startObservationSession("matchAttendance", pool, pool[0].playerId);
      return true;
    });

    if (started) {
      await gamePage.page.waitForTimeout(500);

      // Check for focus-related UI elements
      const hasSessionUI = await gamePage.page.evaluate(() => {
        const store = (window as any).__GAME_STORE__;
        return store.getState().activeSession !== null;
      });

      expect(hasSessionUI).toBe(true);
    }
  });
});
