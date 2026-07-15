import { test, expect } from "../fixtures";

const IS_YOUTH_EARLY_ACCESS = process.env.NEXT_PUBLIC_YOUTH_EARLY_ACCESS !== "false";

test.describe("Analytics Screen", () => {
  test.skip(
    IS_YOUTH_EARLY_ACCESS,
    "Analytics is exercised by the full-game build; Youth EA routes this legacy screen to Career.",
  );

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
