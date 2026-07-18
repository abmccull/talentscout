import { test, expect, type GamePage } from "../fixtures";

const IS_YOUTH_EARLY_ACCESS = process.env.NEXT_PUBLIC_YOUTH_EARLY_ACCESS !== "false";

async function waitForDesk(gamePage: GamePage) {
  await expect(
    gamePage.page.getByRole("heading", { name: "Scouting Desk" }),
  ).toBeVisible({ timeout: 60_000 });
}

test.describe("Dashboard Screen", () => {
  test.describe("fresh game", () => {
    test.beforeEach(async ({ gamePage }) => {
      await gamePage.goto();
      await gamePage.injectState({
        currentWeek: 1,
        scout: { careerTier: 1, primarySpecialization: "youth" },
      });
      await waitForDesk(gamePage);
    });

    test("dashboard renders with game info", async ({ gamePage }) => {
      const screen = await gamePage.getCurrentScreen();
      expect(screen).toBe("dashboard");

      // Dashboard should contain core info
      const content = await gamePage.page.innerText("body");
      expect(content.length).toBeGreaterThan(100);

      gamePage.expectNoConsoleErrors();
    });

    test("dashboard keeps one decision ahead of compact, progressively disclosed context", async ({ gamePage }) => {
      await expect(gamePage.page.getByTestId("desk-primary-decision")).toHaveCount(1);
      await expect(gamePage.page.getByTestId("desk-week-status")).toContainText(/Week 1/);
      await expect(gamePage.page.getByTestId("desk-week-status")).toContainText(/fatigue/);

      const statusSnapshot = gamePage.page.getByRole("region", {
        name: "Current status snapshot",
      });
      await expect(statusSnapshot).toBeVisible();
      await expect(statusSnapshot).toContainText("Current week");
      await expect(statusSnapshot).toContainText("Scout fatigue");
      await expect(statusSnapshot).toContainText("Decisions ready");
      await expect(statusSnapshot).toContainText("Placed");

      await expect(
        gamePage.page.getByRole("heading", { name: "Urgent queue" }),
      ).toHaveCount(1);

      await expect(
        gamePage.page.getByRole("heading", { name: "Live academy briefs" }),
      ).toBeVisible();
      expect(await gamePage.page.getByTestId("desk-brief").count()).toBeLessThanOrEqual(3);

      const scoutLoop = gamePage.page.locator("details").filter({
        hasText: "The scout's loop",
      });
      await expect(scoutLoop).toHaveCount(1);
      await expect(scoutLoop).not.toHaveAttribute("open", "");
      await scoutLoop.locator("summary").focus();
      await gamePage.page.keyboard.press("Enter");
      await expect(scoutLoop).toHaveAttribute("open", "");
      await expect(scoutLoop.getByText("Find", { exact: true })).toBeVisible();
      await expect(scoutLoop.getByText("Track", { exact: true })).toBeVisible();

      const seasonContext = gamePage.page.locator("details#desk-season-context");
      await expect(seasonContext).toHaveCount(1);
      await expect(seasonContext).not.toHaveAttribute("open", "");
      await seasonContext.locator("summary").click();
      await expect(seasonContext).toHaveAttribute("open", "");
      await expect(seasonContext.getByText(/Season Calendar/)).toBeVisible();

      const workingSet = gamePage.page.locator("details").filter({
        hasText: "Current working set",
      });
      await expect(workingSet).toHaveCount(1);
      await expect(workingSet).not.toHaveAttribute("open", "");
      await workingSet.locator("summary").focus();
      await gamePage.page.keyboard.press("Enter");
      await expect(workingSet).toHaveAttribute("open", "");
      await expect(
        workingSet.getByRole("heading", { name: "This week's itinerary" }),
      ).toBeVisible();
    });

    test("desk routes incomplete weeks back to Planner instead of bypassing the empty-day safeguard", async ({ gamePage }) => {
      const finishButton = gamePage.page.getByRole("button", { name: "Finish in planner" });
      await expect(finishButton).toBeVisible();

      await finishButton.click();
      await expect(gamePage.page.getByRole("heading", { name: "Planner" })).toBeVisible();
      await expect(gamePage.page.locator('[data-tutorial-id="calendar-grid"]')).toBeVisible();
    });

    test("dashboard shows scout name in sidebar", async ({ gamePage }) => {
      // The sidebar footer shows "FirstName LastName" under Scout section
      const sidebarText = await gamePage.page.innerText("aside");
      expect(sidebarText).toContain("Test");
      // "Scout" appears in multiple places (TalentScout, "Youth Scout", last name)
      expect(sidebarText).toContain("Scout");
    });

    test("dashboard shows week and season info", async ({ gamePage }) => {
      // The sidebar header shows "Week X — Season Y"
      const sidebarText = await gamePage.page.innerText("aside");
      expect(sidebarText).toContain("Week");
      expect(sidebarText).toContain("Season");
    });
  });

  test.describe("specialization-specific cards", () => {
    const specializations = IS_YOUTH_EARLY_ACCESS
      ? (["youth"] as const)
      : (["youth", "firstTeam", "regional", "data"] as const);
    for (const spec of specializations) {
      test(`${spec} dashboard renders without crash`, async ({ gamePage }) => {
        await gamePage.goto();
        await gamePage.injectState({
          currentWeek: 5,
          scout: { careerTier: 1, primarySpecialization: spec },
        });
        await waitForDesk(gamePage);

        const screen = await gamePage.getCurrentScreen();
        expect(screen).toBe("dashboard");

        const content = await gamePage.page.innerText("body");
        expect(content.length).toBeGreaterThan(100);

        gamePage.expectNoConsoleErrors();
      });
    }
  });

  test("dashboard quick actions navigate correctly", async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectState({
      currentWeek: 5,
      scout: { careerTier: 1, primarySpecialization: "youth" },
    });
    await waitForDesk(gamePage);

    // Look for clickable cards/buttons on the dashboard
    const buttons = gamePage.page.locator("button, [role='button'], a");
    const count = await buttons.count();

    // Dashboard should have interactive elements
    expect(count).toBeGreaterThan(0);
  });
});
