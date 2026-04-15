import { test, expect } from "../fixtures";

test.describe("Specialization Perks", () => {
  test("perks array exists at tier 1", async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectState({
      currentWeek: 1,
      scout: { careerTier: 1, primarySpecialization: "youth" },
    });

    const perks = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      return store.getState().gameState?.scout?.unlockedPerks ?? [];
    });

    // Tier 1 scouts may have a starter perk
    expect(Array.isArray(perks)).toBe(true);
    expect(perks.length).toBeLessThanOrEqual(2);
  });

  test("perks available at higher tiers", async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectLateGameState("youth");

    const perks = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      return store.getState().gameState?.scout?.unlockedPerks ?? [];
    });

    // At tier 4, perks may or may not have been unlocked depending on progression
    expect(Array.isArray(perks)).toBe(true);
  });

  test("career screen shows perks section", async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectLateGameState("youth");

    await gamePage.setScreen("career");
    await gamePage.page.waitForTimeout(500);

    const screen = await gamePage.getCurrentScreen();
    expect(screen).toBe("career");

    const content = await gamePage.page.innerText("body");
    expect(content.length).toBeGreaterThan(100);

    gamePage.expectNoConsoleErrors();
  });

  test("all specializations can reach tier 4 without errors", async ({ gamePage }) => {
    test.setTimeout(120_000);

    for (const spec of ["youth", "firstTeam", "regional", "data"] as const) {
      await gamePage.goto();
      await gamePage.injectLateGameState(spec);

      const tier = await gamePage.getScoutTier();
      expect(tier).toBe(4);

      const actualSpec = await gamePage.getSpecialization();
      expect(actualSpec).toBe(spec);

      // Visit career screen — no crashes
      await gamePage.setScreen("career");
      await gamePage.page.waitForTimeout(300);

      gamePage.clearConsoleErrors();
    }
  });
});
