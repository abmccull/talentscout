import { test, expect } from "../fixtures";

const IS_YOUTH_EARLY_ACCESS = process.env.NEXT_PUBLIC_YOUTH_EARLY_ACCESS !== "false";

test.describe("Player Database Screen", () => {
  test.skip(
    IS_YOUTH_EARLY_ACCESS,
    "Player Database is exercised by the full-game build; Youth EA exposes prospect dossiers instead.",
  );

  test.beforeEach(async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectMidGameState("firstTeam");
  });

  test("player database renders", async ({ gamePage }) => {
    await gamePage.navigateTo("playerDatabase");
    await gamePage.page.waitForTimeout(500);

    const screen = await gamePage.getCurrentScreen();
    expect(screen).toBe("playerDatabase");

    const content = await gamePage.page.innerText("body");
    expect(content.length).toBeGreaterThan(50);

    gamePage.expectNoConsoleErrors();
  });

  test("player database has player entries", async ({ gamePage }) => {
    await gamePage.navigateTo("playerDatabase");
    await gamePage.page.waitForTimeout(500);

    const playerCount = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const state = store?.getState()?.gameState;
      return state?.players ? Object.keys(state.players).length : 0;
    });

    // Game should have generated players
    expect(playerCount).toBeGreaterThan(0);
  });

  test("player profile screen renders when player selected", async ({ gamePage }) => {
    // Select a player via store
    const hasPlayer = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const state = store.getState().gameState;
      if (!state || Object.keys(state.players).length === 0) return false;

      const playerId = Object.keys(state.players)[0];
      store.getState().selectPlayer(playerId);
      store.getState().setScreen("playerProfile");
      return true;
    });

    if (hasPlayer) {
      await gamePage.page.waitForTimeout(500);

      const screen = await gamePage.getCurrentScreen();
      expect(screen).toBe("playerProfile");

      gamePage.expectNoConsoleErrors();
    }
  });
});
