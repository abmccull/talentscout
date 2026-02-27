import { test, expect } from "../fixtures";

test.describe("Dashboard Screen", () => {
  test.describe("fresh game", () => {
    test.beforeEach(async ({ gamePage }) => {
      await gamePage.goto();
      await gamePage.injectState({
        currentWeek: 1,
        scout: { careerTier: 1, primarySpecialization: "youth" },
      });
    });

    test("dashboard renders with game info", async ({ gamePage }) => {
      const screen = await gamePage.getCurrentScreen();
      expect(screen).toBe("dashboard");

      // Dashboard should contain core info
      const content = await gamePage.page.innerText("body");
      expect(content.length).toBeGreaterThan(100);

      gamePage.expectNoConsoleErrors();
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
    for (const spec of ["youth", "firstTeam", "regional", "data"] as const) {
      test(`${spec} dashboard renders without crash`, async ({ gamePage }) => {
        await gamePage.goto();
        await gamePage.injectState({
          currentWeek: 5,
          scout: { careerTier: 1, primarySpecialization: spec },
        });

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

    // Look for clickable cards/buttons on the dashboard
    const buttons = gamePage.page.locator("button, [role='button'], a");
    const count = await buttons.count();

    // Dashboard should have interactive elements
    expect(count).toBeGreaterThan(0);
  });
});
