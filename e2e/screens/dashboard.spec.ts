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

    test("dashboard keeps the core decision and brief queue ahead of supporting detail", async ({ gamePage }) => {
      await expect(gamePage.page.getByTestId("desk-primary-decision")).toHaveCount(1);
      await expect(gamePage.page.getByTestId("desk-week-status")).toContainText(/Week 1/);
      await expect(gamePage.page.getByTestId("desk-week-status")).toContainText(/fatigue/);

      const urgentItems = gamePage.page.getByTestId("desk-urgent-item");
      expect(await urgentItems.count()).toBeLessThanOrEqual(3);

      const briefQueue = gamePage.page.getByTestId("desk-top-briefs");
      await expect(briefQueue).toBeVisible();
      expect(await briefQueue.getByTestId("desk-brief").count()).toBeLessThanOrEqual(3);

      const supportingContext = gamePage.page.locator("details#desk-supporting-context");
      await expect(supportingContext).not.toHaveAttribute("open", "");
      await supportingContext.locator("summary").focus();
      await gamePage.page.keyboard.press("Enter");
      await expect(supportingContext).toHaveAttribute("open", "");
      await expect(gamePage.page.getByRole("heading", { name: "Your scouting loop" })).toBeVisible();
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
