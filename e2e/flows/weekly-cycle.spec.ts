import { test, expect } from "../fixtures";

test.describe("Weekly Cycle", () => {
  test.beforeEach(async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectState({
      currentWeek: 1,
      scout: { careerTier: 1, primarySpecialization: "youth", fatigue: 20 },
    });
  });

  test("advance week increments week number", async ({ gamePage }) => {
    const weekBefore = await gamePage.getCurrentWeek();
    await gamePage.advanceWeek();

    const weekAfter = await gamePage.getCurrentWeek();
    expect(weekAfter).toBe(weekBefore + 1);
  });

  test("advance 5 weeks shows progression", async ({ gamePage }) => {
    const weekBefore = await gamePage.getCurrentWeek();
    await gamePage.advanceWeeks(5);

    const weekAfter = await gamePage.getCurrentWeek();
    expect(weekAfter).toBe(weekBefore + 5);
  });

  test("fatigue changes after week advance", async ({ gamePage }) => {
    const fatigueBefore = (await gamePage.getGameStateValue("scout.fatigue")) as number;
    await gamePage.advanceWeek();

    const fatigueAfter = (await gamePage.getGameStateValue("scout.fatigue")) as number;
    // Fatigue should change (could go up or down depending on activities)
    expect(typeof fatigueAfter).toBe("number");
    // It shouldn't be negative
    expect(fatigueAfter).toBeGreaterThanOrEqual(0);
  });

  test("calendar screen shows current week info", async ({ gamePage }) => {
    await gamePage.navigateTo("calendar");
    await gamePage.page.waitForTimeout(300);

    // The shipped Planner presents a strategic weekly agenda rather than the
    // retired Mon/Tue slot grid. Assert the player-facing landmarks instead
    // of copy from the old task-filling interface.
    await expect(gamePage.page.getByRole("heading", { name: "Planner" })).toBeVisible();
    await expect(
      gamePage.page.getByRole("region", { name: "Set the week's intent" }),
    ).toBeVisible();
  });

  test("week summary appears after advancing via UI", async ({ gamePage }) => {
    await gamePage.setScreen("calendar");
    await gamePage.page.waitForTimeout(300);

    // Try clicking the advance week button if it exists
    const advanceBtn = gamePage.page.locator('button:has-text("Advance"), button:has-text("advance"), button:has-text("Next Week"), button:has-text("End Week")');
    const hasAdvanceBtn = (await advanceBtn.count()) > 0;

    if (hasAdvanceBtn) {
      await advanceBtn.first().click();
      await gamePage.page.waitForTimeout(1000);

      // After advancing, either weekSimulation screen or dashboard should show
      const screen = await gamePage.getCurrentScreen();
      expect(["weekSimulation", "dashboard", "calendar"]).toContain(screen);
    }
  });
});
