import { test, expect } from "../fixtures";

test.describe("Achievements Screen", () => {
  test.beforeEach(async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectState({
      currentWeek: 5,
      scout: { careerTier: 1, primarySpecialization: "youth" },
    });
  });

  test("achievements screen renders", async ({ gamePage }) => {
    await gamePage.navigateTo("achievements");
    await gamePage.page.waitForTimeout(500);

    const screen = await gamePage.getCurrentScreen();
    expect(screen).toBe("achievements");

    const content = await gamePage.page.innerText("body");
    expect(content.length).toBeGreaterThan(50);

    gamePage.expectNoConsoleErrors();
  });

  test("achievements list has entries", async ({ gamePage }) => {
    await gamePage.navigateTo("achievements");
    await gamePage.page.waitForTimeout(500);

    const content = await gamePage.page.innerText("body");
    // Should show achievement names or categories
    const hasAchievements =
      content.toLowerCase().includes("achievement") ||
      content.toLowerCase().includes("unlock") ||
      content.toLowerCase().includes("earned");
    expect(hasAchievements).toBe(true);
  });
});
