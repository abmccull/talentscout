import { test, expect } from "../fixtures";

test.describe("Smoke Test", () => {
  test("new game → advance 5 weeks → visit 10 screens → no crashes", async ({ gamePage }) => {
    test.setTimeout(60_000); // Allow more time for this comprehensive test

    await gamePage.goto();

    // 1. Start a new game via state injection (fast)
    await gamePage.injectState({
      currentWeek: 1,
      scout: {
        careerTier: 1,
        primarySpecialization: "youth",
        firstName: "Smoke",
        lastName: "Tester",
      },
    });

    // Verify we're on the dashboard
    const initialScreen = await gamePage.getCurrentScreen();
    expect(initialScreen).toBe("dashboard");

    // 2. Advance 5 weeks
    const weekBefore = await gamePage.getCurrentWeek();
    await gamePage.advanceWeeks(5);

    const weekAfter = await gamePage.getCurrentWeek();
    expect(weekAfter).toBeGreaterThan(weekBefore);

    // 3. Exercise key Early Access destinations and the intentional fallback
    // for a legacy link whose standalone screen is reserved for the full game.
    const navigationCases = [
      { requested: "dashboard", expected: "dashboard" },
      { requested: "calendar", expected: "calendar" },
      { requested: "fixtureBrowser", expected: "calendar" },
      { requested: "finances", expected: "finances" },
      { requested: "achievements", expected: "achievements" },
      { requested: "handbook", expected: "handbook" },
      { requested: "settings", expected: "settings" },
      { requested: "agency", expected: "agency" },
      { requested: "career", expected: "career" }, // visible after week 3
      { requested: "equipment", expected: "equipment" }, // visible after week 3
    ] as const;

    for (const { requested, expected } of navigationCases) {
      await gamePage.setScreen(requested);
      await gamePage.page.waitForTimeout(200);

      const current = await gamePage.getCurrentScreen();
      expect(current).toBe(expected);

      // Verify screen has content
      const content = await gamePage.page.innerText("body");
      expect(content.length).toBeGreaterThan(0);
    }

    // 4. Assert no console errors throughout
    gamePage.expectNoConsoleErrors();
  });

  test("full new-game wizard smoke test", async ({ gamePage }) => {
    test.setTimeout(60_000);

    await gamePage.goto();

    // Use the full wizard flow
    await gamePage.startNewGame({
      firstName: "Smoke",
      lastName: "Wizard",
      specialization: "youth",
    });

    // Verify landing on dashboard
    const screen = await gamePage.getCurrentScreen();
    expect(screen).toBe("dashboard");

    // Verify game state is initialized
    const spec = await gamePage.getSpecialization();
    expect(spec).toBe("youth");

    const week = await gamePage.getCurrentWeek();
    expect(week).toBe(1);

    gamePage.expectNoConsoleErrors();
  });

  test("late-game state injection smoke test", async ({ gamePage }) => {
    await gamePage.goto();
    // The late-career surface is shipped for Youth Scout. Data Scout is a
    // planned full-game mode and is intentionally rejected at the EA save
    // boundary, so it must not be used as an EA smoke fixture.
    await gamePage.injectLateGameState("youth");

    // Verify tier 4 state
    const tier = await gamePage.getScoutTier();
    expect(tier).toBe(4);

    // Visit tier-gated detail screens and verify the retired standalone
    // analytics route resolves to its supported Career workspace.
    const lateGameNavigationCases = [
      { requested: "npcManagement", expected: "npcManagement" },
      { requested: "discoveries", expected: "discoveries" },
      { requested: "analytics", expected: "career" },
      { requested: "alumniDashboard", expected: "alumniDashboard" },
      { requested: "network", expected: "network" },
      { requested: "rivals", expected: "rivals" },
    ] as const;

    for (const { requested, expected } of lateGameNavigationCases) {
      await gamePage.setScreen(requested);
      await gamePage.page.waitForTimeout(300);

      const current = await gamePage.getCurrentScreen();
      expect(current).toBe(expected);
    }

    gamePage.expectNoConsoleErrors();
  });

  test("the shipped Youth specialization initializes without error", async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectState({
      currentWeek: 1,
      scout: { careerTier: 1, primarySpecialization: "youth" },
    });

    expect(await gamePage.getCurrentScreen()).toBe("dashboard");
    expect(await gamePage.getSpecialization()).toBe("youth");
    gamePage.expectNoConsoleErrors();
  });
});
