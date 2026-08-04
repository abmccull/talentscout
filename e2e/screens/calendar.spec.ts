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
    await expect(gamePage.page.getByRole("button", { name: /open day/i })).toHaveCount(7);
  });

  test("Planner puts the itinerary before the collapsed desk policy", async ({ gamePage }) => {
    await gamePage.navigateTo("calendar");

    const itinerary = gamePage.page.locator('[data-tutorial-id="calendar-grid"]');
    const policyPanel = gamePage.page.getByTestId("weekly-strategy-panel");
    const stanceCard = gamePage.page.getByTestId("weekly-stance-card");
    await expect(itinerary).toBeVisible();
    await expect(stanceCard).toBeVisible();
    await expect(policyPanel).toBeVisible();
    const careerPressure = stanceCard.getByTestId("planner-career-pressure");
    await expect(careerPressure).toBeVisible();
    await expect(careerPressure).toContainText(/this week's pressure/i);
    await expect(careerPressure).toHaveAttribute("data-career-fingerprint", /.+/);

    const itineraryComesFirst = await itinerary.evaluate((element, policyTestId) => {
      const policy = document.querySelector(`[data-testid="${policyTestId}"]`);
      return !!policy && !!(element.compareDocumentPosition(policy) & Node.DOCUMENT_POSITION_FOLLOWING);
    }, "weekly-strategy-panel");
    expect(itineraryComesFirst).toBe(true);

    const policyControl = policyPanel.locator("summary");
    await expect(policyControl).toContainText("Change desk policy");
    await expect(policyControl).toContainText(/how your desk prioritizes work/i);
    await expect(policyPanel.getByRole("radio", { name: /Chase an edge/i })).toBeHidden();

    await policyControl.focus();
    await gamePage.page.keyboard.press("Enter");
    await expect(policyPanel).toHaveAttribute("open", "");
    await expect(policyPanel.getByRole("radio", { name: /Chase an edge/i })).toBeVisible();
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

    await expect(gamePage.page.getByTestId("planner-compare-tray")).toContainText("School Match");
    await expect(schoolMatch.getByText("What this context reveals")).toBeVisible();
    await expect(schoolMatch.getByText(/^Tradeoff:/)).toBeVisible();
    await expect(gamePage.page.locator('article button[aria-expanded="true"]')).toHaveCount(1);

    await gamePage.page.getByRole("button", { name: "Place School Match on mon" }).click();

    await expect(itinerary.getByRole("status")).toContainText(/School Match scheduled for/i);

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

    const itinerary = gamePage.page.locator('[data-tutorial-id="calendar-grid"]');
    await expect(itinerary).toBeVisible();
    await expect(itinerary.getByRole("button", { name: /mon open day/i })).toBeVisible();

    const mobileTrigger = gamePage.page.getByTestId("planner-mobile-opportunities-trigger");
    await expect(mobileTrigger).toBeVisible();
    await expect(mobileTrigger).toContainText("Choose the next live call");

    await mobileTrigger.click();
    const mobileSheet = gamePage.page.getByRole("dialog", {
      name: "Select one live opportunity, then place it on the strip",
    });
    await expect(mobileSheet).toBeVisible();

    const mobileSchoolMatch = mobileSheet.locator("article").filter({
      has: gamePage.page.getByRole("heading", { name: "School Match", exact: true }),
    }).first();
    await mobileSchoolMatch.getByRole("button", { name: /^Choose Day for School Match$/ }).click();
    await expect(mobileSheet).toBeHidden();
    await expect(gamePage.page.getByTestId("planner-compare-tray")).toContainText("School Match");
    await expect(gamePage.page.getByRole("button", { name: "Place School Match on mon" })).toBeVisible();

    const plannerScrollRegion = gamePage.page.getByTestId("planner-scroll-region");
    await plannerScrollRegion.evaluate((element) => {
      const itinerary = element.querySelector<HTMLElement>(
        '[data-tutorial-id="calendar-grid"]',
      );
      if (!itinerary) throw new Error("Planner itinerary was not rendered");
      const itineraryContentTop = itinerary.getBoundingClientRect().top
        - element.getBoundingClientRect().top
        + element.scrollTop;
      element.scrollTop = itineraryContentTop + 100;
    });
    const stickyTop = await itinerary.evaluate((element) => element.getBoundingClientRect().top);
    expect(stickyTop).toBeGreaterThanOrEqual(50);
    expect(stickyTop).toBeLessThanOrEqual(62);

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
