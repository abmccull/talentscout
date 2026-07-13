import { test, expect } from "../fixtures";

test.describe("Canonical weekly advancement", () => {
  test("batch policy produces the same game state as repeated default fast-forward", async ({ gamePage }) => {
    test.setTimeout(120_000);
    await gamePage.goto();
    await gamePage.injectState({
      currentWeek: 1,
      currentSeason: 1,
      scout: {
        primarySpecialization: "youth",
        careerPath: "independent",
        fatigue: 10,
      },
    });

    const result = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const initial = structuredClone(store.getState().gameState);

      store.getState().batchAdvance(4);
      const batchState = structuredClone(store.getState().gameState);

      store.getState().loadGame(structuredClone(initial));
      for (let index = 0; index < 4; index++) {
        store.getState().autoSchedule();
        store.getState().startWeekSimulation();
        store.getState().fastForwardWeek();
      }
      const repeatedState = structuredClone(store.getState().gameState);

      // Compare inside the browser. Returning two full multi-league worlds
      // through the Playwright protocol turns a four-week invariant into a
      // minutes-long serialization benchmark as the database grows.
      const batchJson = JSON.stringify(batchState);
      const repeatedJson = JSON.stringify(repeatedState);
      return {
        equivalent: batchJson === repeatedJson,
        batchBytes: batchJson.length,
        repeatedBytes: repeatedJson.length,
        batchDate: [batchState.currentSeason, batchState.currentWeek],
        repeatedDate: [repeatedState.currentSeason, repeatedState.currentWeek],
      };
    });

    expect(result, "batch and repeated canonical policies diverged").toMatchObject({
      equivalent: true,
      batchBytes: result.repeatedBytes,
      batchDate: result.repeatedDate,
    });
    gamePage.expectNoConsoleErrors();
  });
});
