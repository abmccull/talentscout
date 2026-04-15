import { test, expect } from "../fixtures";

test.describe("Alumni Dashboard Screen", () => {
  test.beforeEach(async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectLateGameState("youth"); // Tier 3+ required
  });

  test("alumni dashboard renders at tier 3+", async ({ gamePage }) => {
    await gamePage.setScreen("alumniDashboard");
    await gamePage.page.waitForTimeout(500);

    const screen = await gamePage.getCurrentScreen();
    expect(screen).toBe("alumniDashboard");

    const content = await gamePage.page.innerText("body");
    expect(content.length).toBeGreaterThan(50);
  });

  test("no console errors", async ({ gamePage }) => {
    await gamePage.setScreen("alumniDashboard");
    await gamePage.page.waitForTimeout(500);

    gamePage.expectNoConsoleErrors();
  });
});
