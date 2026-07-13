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

    const itinerary = gamePage.page.locator('[data-tutorial-id="calendar-grid"]');
    await expect(itinerary).toBeVisible();
    await expect(itinerary.getByRole("button", { name: /open day/i })).toHaveCount(7);
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

  test("Planner keeps one decision expanded and schedules a common activity in two actions", async ({ gamePage }) => {
    await gamePage.navigateTo("calendar");

    const itinerary = gamePage.page.locator('[data-tutorial-id="calendar-grid"]');
    await expect(itinerary).toBeVisible();
    await expect(itinerary).toContainText("Weekly itinerary");

    const schoolMatch = gamePage.page.locator("article").filter({
      has: gamePage.page.getByRole("heading", { name: "School Match", exact: true }),
    }).first();
    await schoolMatch.getByRole("button", { name: /^Choose Day for School Match$/ }).click();

    await expect(schoolMatch.getByText("What this context reveals")).toBeVisible();
    await expect(schoolMatch.getByText(/^Tradeoff:/)).toBeVisible();
    await expect(gamePage.page.locator('article button[aria-expanded="true"]')).toHaveCount(1);

    await gamePage.page.getByRole("button", { name: "Place School Match on mon" }).click();

    const mondayActivity = await gamePage.page.evaluate(() => {
      const state = (window as any).__GAME_STORE__.getState().gameState;
      return state?.schedule.activities[0]?.type ?? null;
    });
    expect(mondayActivity).toBe("schoolMatch");
    await expect(gamePage.page.locator('article button[aria-expanded="true"]')).toHaveCount(0);
  });

  test("Planner exposes compact opportunity categories on mobile", async ({ gamePage }) => {
    await gamePage.page.setViewportSize({ width: 390, height: 844 });
    await gamePage.setScreen("calendar");

    const tabs = gamePage.page.getByRole("tablist", { name: "Opportunity categories" });
    await expect(tabs).toBeVisible();
    await expect(gamePage.page.getByRole("tab", { name: /Scouting/ })).toHaveAttribute("aria-selected", "true");

    const itinerary = gamePage.page.locator('[data-tutorial-id="calendar-grid"]');
    await expect(itinerary).toBeVisible();
    await expect(itinerary.getByRole("button", { name: /mon open day/i })).toBeVisible();

    const plannerScrollRegion = gamePage.page.getByTestId("planner-scroll-region");
    await plannerScrollRegion.evaluate((element) => { element.scrollTop = 600; });
    const stickyTop = await itinerary.evaluate((element) => element.getBoundingClientRect().top);
    expect(stickyTop).toBeGreaterThanOrEqual(55);
    expect(stickyTop).toBeLessThanOrEqual(58);

    const overflow = await gamePage.page.evaluate(() => ({
      document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      main: (() => {
        const main = document.querySelector("#game-main");
        return main ? main.scrollWidth - main.clientWidth : 0;
      })(),
    }));
    expect(overflow.document).toBeLessThanOrEqual(1);
    expect(overflow.main).toBeLessThanOrEqual(1);
  });
});
