import { test, expect } from "../fixtures";

test.describe("Financial Systems", () => {
  test.beforeEach(async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectMidGameState("youth");
  });

  test("financial dashboard renders", async ({ gamePage }) => {
    await gamePage.navigateTo("finances");
    await gamePage.page.waitForTimeout(500);

    const screen = await gamePage.getCurrentScreen();
    expect(screen).toBe("finances");

    const content = await gamePage.page.innerText("body");
    expect(content.length).toBeGreaterThan(100);

    gamePage.expectNoConsoleErrors();
  });

  test("equipment screen renders", async ({ gamePage }) => {
    await gamePage.navigateTo("equipment");
    await gamePage.page.waitForTimeout(500);

    const screen = await gamePage.getCurrentScreen();
    expect(screen).toBe("equipment");

    const content = await gamePage.page.innerText("body");
    expect(content.length).toBeGreaterThan(50);

    gamePage.expectNoConsoleErrors();
  });

  test("agency screen renders", async ({ gamePage }) => {
    await gamePage.navigateTo("agency");
    await gamePage.page.waitForTimeout(500);

    const screen = await gamePage.getCurrentScreen();
    expect(screen).toBe("agency");

    const content = await gamePage.page.innerText("body");
    expect(content.length).toBeGreaterThan(50);

    gamePage.expectNoConsoleErrors();
  });

  test("financial data is readable from store", async ({ gamePage }) => {
    const finances = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const state = store?.getState()?.gameState;
      if (!state) return null;
      return {
        hasCash: typeof state.scout?.cash === "number" || typeof state.finances?.cash === "number",
        hasFinancialData: !!state.finances || typeof state.scout?.cash === "number",
      };
    });

    expect(finances).not.toBeNull();
    expect(finances!.hasFinancialData).toBe(true);
  });
});
