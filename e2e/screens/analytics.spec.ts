import { test, expect } from "../fixtures";

test.describe("Analytics Screen", () => {
  test.beforeEach(async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectLateGameState("data"); // Tier 3+ required, data spec fits
  });

  test("analytics renders at tier 3+", async ({ gamePage }) => {
    await gamePage.setScreen("analytics");
    await gamePage.page.waitForTimeout(500);

    const screen = await gamePage.getCurrentScreen();
    expect(screen).toBe("analytics");

    const content = await gamePage.page.innerText("body");
    expect(content.length).toBeGreaterThan(50);
  });

  test("no console errors", async ({ gamePage }) => {
    await gamePage.setScreen("analytics");
    await gamePage.page.waitForTimeout(500);

    gamePage.expectNoConsoleErrors();
  });
});
