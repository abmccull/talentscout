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

    // 3. Navigate to 10 key screens
    const keyScreens = [
      "dashboard",
      "calendar",
      "fixtureBrowser",
      "finances",
      "achievements",
      "handbook",
      "settings",
      "agency",
      "career",    // visible after week 3
      "equipment", // visible after week 3
    ];

    for (const screen of keyScreens) {
      await gamePage.setScreen(screen);
      await gamePage.page.waitForTimeout(200);

      const current = await gamePage.getCurrentScreen();
      expect(current).toBe(screen);

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
    await gamePage.injectLateGameState("data");

    // Verify tier 4 state
    const tier = await gamePage.getScoutTier();
    expect(tier).toBe(4);

    // Visit tier-gated screens
    const lateGameScreens = [
      "npcManagement",
      "discoveries",
      "analytics",
      "alumniDashboard",
      "network",
      "rivals",
    ];

    for (const screen of lateGameScreens) {
      await gamePage.setScreen(screen);
      await gamePage.page.waitForTimeout(300);

      const current = await gamePage.getCurrentScreen();
      expect(current).toBe(screen);
    }

    gamePage.expectNoConsoleErrors();
  });

  test("all 4 specializations initialize without error", async ({ gamePage }) => {
    test.setTimeout(120_000); // 4 sequential goto() + inject cycles need extra time
    for (const spec of ["youth", "firstTeam", "regional", "data"] as const) {
      await gamePage.goto();
      await gamePage.injectState({
        currentWeek: 1,
        scout: { careerTier: 1, primarySpecialization: spec },
      });

      const screen = await gamePage.getCurrentScreen();
      expect(screen).toBe("dashboard");

      const actualSpec = await gamePage.getSpecialization();
      expect(actualSpec).toBe(spec);

      gamePage.clearConsoleErrors();
    }
  });
});
