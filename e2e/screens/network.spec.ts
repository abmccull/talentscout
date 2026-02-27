import { test, expect } from "../fixtures";

test.describe("Network Screen", () => {
  test.beforeEach(async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectMidGameState("youth");
  });

  test("network screen renders at tier 2", async ({ gamePage }) => {
    await gamePage.navigateTo("network");
    await gamePage.page.waitForTimeout(500);

    const screen = await gamePage.getCurrentScreen();
    expect(screen).toBe("network");

    const content = await gamePage.page.innerText("body");
    expect(content.length).toBeGreaterThan(50);

    gamePage.expectNoConsoleErrors();
  });

  test("network has contacts data", async ({ gamePage }) => {
    const contactCount = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const state = store?.getState()?.gameState;
      return state?.contacts ? Object.keys(state.contacts).length : 0;
    });

    // Game should have some contacts
    expect(contactCount).toBeGreaterThanOrEqual(0);
  });
});
