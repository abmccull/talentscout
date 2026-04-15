import { test, expect } from "../fixtures";

/**
 * Regression: verify all 4 specializations × 2 career paths
 * can survive 10 weeks of advancement without crashes.
 */
test.describe("Career Path Matrix Regression", () => {
  const specs = ["youth", "firstTeam", "regional", "data"] as const;

  for (const spec of specs) {
    test(`${spec} / club path survives 10 weeks`, async ({ gamePage }) => {
      test.setTimeout(90_000);

      await gamePage.goto();
      await gamePage.injectState({
        currentWeek: 10,
        currentSeason: 1,
        scout: {
          careerTier: 2,
          primarySpecialization: spec,
          careerPath: "club",
          reputation: 35,
          fatigue: 20,
        },
      });

      const weekBefore = await gamePage.getCurrentWeek();

      await gamePage.advanceWeeks(10);

      const weekAfter = await gamePage.getCurrentWeek();
      // batchAdvance may not advance exactly N weeks due to season boundaries
      expect(weekAfter).toBeGreaterThan(weekBefore);

      // Visit a few screens to verify no rendering crashes
      for (const screen of ["dashboard", "calendar", "career"]) {
        await gamePage.setScreen(screen);
        await gamePage.page.waitForTimeout(200);
      }

      gamePage.expectNoConsoleErrors();
    });
  }

  for (const spec of specs) {
    test(`${spec} / independent path survives 10 weeks`, async ({ gamePage }) => {
      test.setTimeout(90_000);

      await gamePage.goto();
      await gamePage.injectState({
        currentWeek: 10,
        currentSeason: 1,
        scout: {
          careerTier: 2,
          primarySpecialization: spec,
          careerPath: "independent",
          reputation: 35,
          fatigue: 20,
        },
      });

      const weekBefore = await gamePage.getCurrentWeek();

      await gamePage.advanceWeeks(10);

      const weekAfter = await gamePage.getCurrentWeek();
      expect(weekAfter).toBeGreaterThan(weekBefore);

      for (const screen of ["dashboard", "calendar", "agency"]) {
        await gamePage.setScreen(screen);
        await gamePage.page.waitForTimeout(200);
      }

      gamePage.expectNoConsoleErrors();
    });
  }
});
