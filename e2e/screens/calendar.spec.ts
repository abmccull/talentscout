import { test, expect } from "../fixtures";

test.describe("Calendar Screen", () => {
  test.beforeEach(async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectState({
      currentWeek: 5,
      scout: { careerTier: 1, primarySpecialization: "youth" },
    });
  });

  test("calendar renders with weekly schedule", async ({ gamePage }) => {
    await gamePage.navigateTo("calendar");
    await gamePage.page.waitForTimeout(500);

    const screen = await gamePage.getCurrentScreen();
    expect(screen).toBe("calendar");

    const content = await gamePage.page.innerText("body");
    expect(content.length).toBeGreaterThan(50);

    gamePage.expectNoConsoleErrors();
  });

  test("calendar has day slots", async ({ gamePage }) => {
    await gamePage.navigateTo("calendar");
    await gamePage.page.waitForTimeout(500);

    // Calendar should show days of the week or day slots
    const content = await gamePage.page.innerText("body");
    // Look for day-related text (Mon, Tue, etc. or Day 1, Day 2, etc.)
    const hasDays =
      content.includes("Mon") ||
      content.includes("Tue") ||
      content.includes("Day") ||
      content.includes("Rest") ||
      content.includes("Activity");
    expect(hasDays).toBe(true);
  });

  test("advance week button exists on calendar", async ({ gamePage }) => {
    await gamePage.navigateTo("calendar");
    await gamePage.page.waitForTimeout(500);

    // Look for various possible advance button texts
    const advanceBtn = gamePage.page.locator(
      'button:has-text("Advance"), button:has-text("End Week"), button:has-text("Next Week"), button:has-text("Advance Week")',
    );
    const count = await advanceBtn.count();
    expect(count).toBeGreaterThan(0);
  });
});
