import { test, expect } from "../fixtures";

const IS_YOUTH_EARLY_ACCESS = process.env.NEXT_PUBLIC_YOUTH_EARLY_ACCESS !== "false";

test.describe("Planned full-game leaderboard", () => {
  test.skip(
    IS_YOUTH_EARLY_ACCESS,
    "Leaderboard is a planned full-game surface; Youth EA retains career records in the Career workspace.",
  );
  test.beforeEach(async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectState({
      currentWeek: 5,
      scout: { careerTier: 1, primarySpecialization: "youth" },
    });
  });

  test("leaderboard renders", async ({ gamePage }) => {
    await gamePage.setScreen("leaderboard");
    await gamePage.page.waitForTimeout(500);

    const screen = await gamePage.getCurrentScreen();
    expect(screen).toBe("leaderboard");

    const content = await gamePage.page.innerText("body");
    expect(content.length).toBeGreaterThan(50);
  });

  test("no console errors", async ({ gamePage }) => {
    await gamePage.setScreen("leaderboard");
    await gamePage.page.waitForTimeout(500);

    gamePage.expectNoConsoleErrors();
  });
});
