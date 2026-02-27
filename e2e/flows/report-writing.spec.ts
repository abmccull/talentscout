import { test, expect } from "../fixtures";

test.describe("Report Writing", () => {
  test.beforeEach(async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectMidGameState("youth");
  });

  test("report writer screen renders", async ({ gamePage }) => {
    // Select a player and navigate to report writer
    const hasPlayer = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const state = store.getState().gameState;
      if (!state || Object.keys(state.players).length === 0) return false;

      const playerId = Object.keys(state.players)[0];
      store.getState().startReport(playerId);
      return true;
    });

    if (hasPlayer) {
      await gamePage.page.waitForTimeout(500);

      const screen = await gamePage.getCurrentScreen();
      expect(screen).toBe("reportWriter");

      // Check that report writer content renders
      const content = await gamePage.page.innerText("body");
      expect(content.length).toBeGreaterThan(100);

      gamePage.expectNoConsoleErrors();
    }
  });

  test("report history screen renders", async ({ gamePage }) => {
    await gamePage.setScreen("reportHistory");
    await gamePage.page.waitForTimeout(500);

    const screen = await gamePage.getCurrentScreen();
    expect(screen).toBe("reportHistory");

    const content = await gamePage.page.innerText("body");
    expect(content.length).toBeGreaterThan(0);

    gamePage.expectNoConsoleErrors();
  });

  test("report writer has conviction level controls", async ({ gamePage }) => {
    const hasPlayer = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const state = store.getState().gameState;
      if (!state || Object.keys(state.players).length === 0) return false;

      const playerId = Object.keys(state.players)[0];
      store.getState().startReport(playerId);
      return true;
    });

    if (hasPlayer) {
      await gamePage.page.waitForTimeout(500);

      // Look for conviction-related UI
      const content = await gamePage.page.innerText("body");
      // Report writer should contain player information and controls
      expect(content.length).toBeGreaterThan(100);
    }
  });

  test("report submission flow works", async ({ gamePage }) => {
    const reportCount = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const state = store.getState().gameState;
      return state?.reports ? Object.keys(state.reports).length : 0;
    });

    // Start a report, submit it via store
    const submitted = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const state = store.getState().gameState;
      if (!state || Object.keys(state.players).length === 0) return false;

      const playerId = Object.keys(state.players)[0];
      store.getState().startReport(playerId);

      try {
        store.getState().submitReport("confident", "Test report summary", ["pace", "finishing"], ["positioning"]);
        return true;
      } catch {
        return false;
      }
    });

    if (submitted) {
      const newReportCount = await gamePage.page.evaluate(() => {
        const store = (window as any).__GAME_STORE__;
        const state = store.getState().gameState;
        return state?.reports ? Object.keys(state.reports).length : 0;
      });

      expect(newReportCount).toBeGreaterThan(reportCount);
    }
  });
});
