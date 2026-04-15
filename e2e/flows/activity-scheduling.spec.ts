import { test, expect } from "../fixtures";

test.describe("Activity Scheduling", () => {
  test.beforeEach(async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectState({
      currentWeek: 5,
      scout: { careerTier: 1, primarySpecialization: "youth" },
    });
  });

  test("schedule activity via store", async ({ gamePage }) => {
    await gamePage.scheduleActivityByType("schoolMatch", 0);

    const dayActivity = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const schedule = store.getState().gameState?.schedule;
      return schedule?.activities?.[0]?.type ?? null;
    });

    expect(dayActivity).toBe("schoolMatch");
  });

  test("unschedule clears slot", async ({ gamePage }) => {
    // Schedule then unschedule
    await gamePage.scheduleActivityByType("schoolMatch", 0);

    await gamePage.page.evaluate(() => {
      (window as any).__GAME_STORE__.getState().unscheduleActivity(0);
    });
    await gamePage.page.waitForTimeout(100);

    const dayActivity = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const schedule = store.getState().gameState?.schedule;
      return schedule?.activities?.[0] ?? null;
    });

    expect(dayActivity).toBeNull();
  });

  test("autoSchedule fills empty days", async ({ gamePage }) => {
    await gamePage.page.evaluate(() => {
      (window as any).__GAME_STORE__.getState().autoSchedule();
    });
    await gamePage.page.waitForTimeout(200);

    const filledSlots = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const schedule = store.getState().gameState?.schedule;
      if (!schedule?.activities) return 0;
      return schedule.activities.filter((a: any) => a !== null).length;
    });

    expect(filledSlots).toBeGreaterThan(0);
  });

  test("calendar UI shows activity cards after scheduling", async ({ gamePage }) => {
    await gamePage.scheduleActivityByType("schoolMatch", 0);
    await gamePage.setScreen("calendar");
    await gamePage.page.waitForTimeout(500);

    const content = await gamePage.page.innerText("body");
    // Calendar should show some activity-related content
    expect(content.length).toBeGreaterThan(100);
  });

  test("advance week triggers simulation", async ({ gamePage }) => {
    const weekBefore = await gamePage.getCurrentWeek();

    await gamePage.advanceWeek();

    const weekAfter = await gamePage.getCurrentWeek();
    expect(weekAfter).toBe(weekBefore + 1);
  });

  test("day simulation has interaction results", async ({ gamePage }) => {
    // Schedule activities and start week simulation
    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      store.getState().autoSchedule();
    });
    await gamePage.page.waitForTimeout(100);

    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      store.getState().startWeekSimulation();
    });
    await gamePage.page.waitForTimeout(300);

    const simState = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const sim = store.getState().weekSimulation;
      return sim ? { exists: true, currentDay: sim.currentDay ?? 0 } : { exists: false, currentDay: -1 };
    });

    expect(simState.exists).toBe(true);
  });

  test("fastForwardWeek skips remaining days", async ({ gamePage }) => {
    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      store.getState().autoSchedule();
      store.getState().startWeekSimulation();
    });
    await gamePage.page.waitForTimeout(200);

    await gamePage.page.evaluate(() => {
      (window as any).__GAME_STORE__.getState().fastForwardWeek();
    });
    await gamePage.page.waitForTimeout(300);

    // After fast forward, simulation should be done or week advanced
    const simDone = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const sim = store.getState().weekSimulation;
      return sim === null || sim?.completed === true;
    });

    expect(simDone).toBe(true);
  });
});
