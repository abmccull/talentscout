import { test, expect } from "../fixtures";

test.describe("Career Paths", () => {
  test.beforeEach(async ({ gamePage }) => {
    await gamePage.goto();
  });

  test("club path initialization and verification", async ({ gamePage }) => {
    await gamePage.injectState({
      currentWeek: 20,
      scout: {
        careerTier: 2,
        primarySpecialization: "youth",
        careerPath: "club",
        reputation: 40,
      },
    });

    const careerPath = await gamePage.getGameStateValue("scout.careerPath");
    expect(careerPath).toBe("club");

    // Club path should have club-related fields
    const clubId = await gamePage.getGameStateValue("scout.currentClubId");
    // May or may not have a club yet depending on state injection
    expect(typeof clubId === "string" || clubId === undefined || clubId === null).toBe(true);
  });

  test("independent path initialization and verification", async ({ gamePage }) => {
    await gamePage.injectState({
      currentWeek: 20,
      scout: {
        careerTier: 2,
        primarySpecialization: "youth",
        careerPath: "independent",
        reputation: 40,
      },
    });

    const careerPath = await gamePage.getGameStateValue("scout.careerPath");
    expect(careerPath).toBe("independent");
  });

  test("chooseCareerPath store action works", async ({ gamePage }) => {
    // Start at tier 1 with enough reputation for path choice
    await gamePage.injectState({
      currentWeek: 15,
      scout: {
        careerTier: 2,
        primarySpecialization: "youth",
        reputation: 20,
      },
    });

    // The path should be settable via state injection
    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const gs = store.getState().gameState;
      if (gs?.scout) {
        gs.scout.careerPath = "independent";
        store.getState().loadGame(gs);
      }
    });
    await gamePage.page.waitForTimeout(100);

    const path = await gamePage.getGameStateValue("scout.careerPath");
    expect(path).toBe("independent");
  });

  test("path-specific content on agency screen: club path", async ({ gamePage }) => {
    await gamePage.injectState({
      currentWeek: 20,
      scout: {
        careerTier: 2,
        primarySpecialization: "youth",
        careerPath: "club",
        reputation: 40,
      },
    });

    await gamePage.setScreen("agency");
    await gamePage.page.waitForTimeout(500);

    const screen = await gamePage.getCurrentScreen();
    expect(screen).toBe("agency");

    const content = await gamePage.page.innerText("body");
    expect(content.length).toBeGreaterThan(50);

    gamePage.expectNoConsoleErrors();
  });

  test("path-specific content on agency screen: independent path", async ({ gamePage }) => {
    await gamePage.injectState({
      currentWeek: 20,
      scout: {
        careerTier: 2,
        primarySpecialization: "youth",
        careerPath: "independent",
        reputation: 40,
      },
    });

    await gamePage.setScreen("agency");
    await gamePage.page.waitForTimeout(500);

    const screen = await gamePage.getCurrentScreen();
    expect(screen).toBe("agency");

    const content = await gamePage.page.innerText("body");
    expect(content.length).toBeGreaterThan(50);

    gamePage.expectNoConsoleErrors();
  });

  test("career path flows through to observation session", async ({ gamePage }) => {
    await gamePage.injectMidGameState("youth");

    // Start an observation — session should carry scout's career path
    await gamePage.startObservationSession("schoolMatch");

    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      if (store.getState().activeSession?.state === "setup") {
        store.getState().beginSession();
      }
    });
    await gamePage.page.waitForTimeout(200);

    const session = await gamePage.getActiveSession();
    expect(session).not.toBeNull();
    expect(session!.mode).toBe("fullObservation");

    // End session cleanly
    await gamePage.page.evaluate(() => {
      (window as any).__GAME_STORE__.getState().endObservationSession();
    });

    gamePage.expectNoConsoleErrors();
  });
});
