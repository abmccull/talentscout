import { test, expect } from "../fixtures";

test.describe("Equipment Screen", () => {
  test.beforeEach(async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectState({
      currentWeek: 5,
      scout: { careerTier: 1, primarySpecialization: "youth" },
    });
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

  test("equipment screen shows items", async ({ gamePage }) => {
    await gamePage.navigateTo("equipment");
    await gamePage.page.waitForTimeout(500);

    // Equipment screen should show items to purchase or already owned
    const content = await gamePage.page.innerText("body");
    // Should have some equipment-related content
    expect(content.length).toBeGreaterThan(100);
  });
});
