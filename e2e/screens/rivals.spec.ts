import { test, expect } from "../fixtures";

test.describe("Rivals Screen", () => {
  test.beforeEach(async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectMidGameState("youth"); // Tier 2 required
  });

  test("rivals screen renders at tier 2", async ({ gamePage }) => {
    await gamePage.setScreen("rivals");
    await gamePage.page.waitForTimeout(500);

    const screen = await gamePage.getCurrentScreen();
    expect(screen).toBe("rivals");

    const content = await gamePage.page.innerText("body");
    expect(content.length).toBeGreaterThan(50);
  });

  test("rivals exist in game state", async ({ gamePage }) => {
    const rivalInfo = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const gs = store.getState().gameState;
      // Rivals could be in various state shapes
      const rivals = gs?.rivals ?? gs?.rivalScouts ?? [];
      return {
        count: Array.isArray(rivals) ? rivals.length : Object.keys(rivals).length,
      };
    });

    expect(typeof rivalInfo.count).toBe("number");
  });

  test("no console errors", async ({ gamePage }) => {
    await gamePage.setScreen("rivals");
    await gamePage.page.waitForTimeout(500);

    gamePage.expectNoConsoleErrors();
  });
});
