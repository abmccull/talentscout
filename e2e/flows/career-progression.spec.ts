import { test, expect } from "../fixtures";

test.describe("Career Progression", () => {
  test("tier 1 scout shows correct tier", async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectState({
      currentWeek: 5,
      scout: { careerTier: 1, primarySpecialization: "youth" },
    });

    const tier = await gamePage.getScoutTier();
    expect(tier).toBe(1);

    // Career screen should show tier info
    await gamePage.navigateTo("career");
    const content = await gamePage.page.innerText("body");
    expect(content).toContain("Tier");
  });

  test("tier 2 scout has expanded nav", async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectMidGameState("youth");

    const tier = await gamePage.getScoutTier();
    expect(tier).toBe(2);

    // Network and Rivals should be visible at tier 2
    await expect(gamePage.page.locator('[data-tutorial-id="nav-network"]')).toBeVisible();
    await expect(gamePage.page.locator('[data-tutorial-id="nav-rivals"]')).toBeVisible();
  });

  test("tier 4 scout has full feature set", async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectLateGameState("youth");

    const tier = await gamePage.getScoutTier();
    expect(tier).toBe(4);

    // NPC management should be visible at tier 4
    await expect(gamePage.page.locator('[data-tutorial-id="nav-npcManagement"]')).toBeVisible();
  });

  test("career screen renders for each tier", async ({ gamePage }) => {
    test.setTimeout(120_000); // 4 sequential goto() + inject cycles
    for (const tierLevel of [1, 2, 3, 4]) {
      await gamePage.goto();
      await gamePage.injectState({
        currentWeek: 10,
        scout: { careerTier: tierLevel, primarySpecialization: "youth" },
      });

      await gamePage.setScreen("career");
      await gamePage.page.waitForTimeout(500);

      const screen = await gamePage.getCurrentScreen();
      expect(screen).toBe("career");

      gamePage.expectNoConsoleErrors();
      gamePage.clearConsoleErrors();
    }
  });
});
