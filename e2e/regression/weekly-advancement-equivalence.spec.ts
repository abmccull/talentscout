import { test, expect } from "../fixtures";

test.describe("Canonical weekly advancement", () => {
  test("worker delta materializes the exact synchronous canonical state", async ({ gamePage }) => {
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

    const result = await gamePage.page.evaluate(async () => {
      const store = (window as any).__GAME_STORE__;
      store.getState().autoSchedule();
      store.getState().startWeekSimulation();
      const sourceState = structuredClone(store.getState().gameState);
      const resolvedSimulation = structuredClone(store.getState().weekSimulation);
      resolvedSimulation.dayResults = resolvedSimulation.dayResults.map((day: any) => {
        if (!day.interaction || day.interaction.selectedOptionId) return day;
        return {
          ...day,
          interaction: {
            ...day.interaction,
            selectedOptionId: day.interaction.options?.[0]?.id ?? "scan",
          },
        };
      });
      resolvedSimulation.currentDay = 7;
      resolvedSimulation.pendingWorldTick = true;
      store.setState({ weekSimulation: structuredClone(resolvedSimulation) });

      await store.getState().advanceWeekAsync();
      const workerState = structuredClone(store.getState().gameState);
      const telemetry = structuredClone(store.getState().lastWeeklyWorkerTelemetry);

      store.getState().loadGame(structuredClone(sourceState));
      store.setState({
        weekSimulation: structuredClone(resolvedSimulation),
        currentScreen: "weekSimulation",
      });
      store.getState().advanceWeek();
      const synchronousState = structuredClone(store.getState().gameState);

      return {
        equivalent: JSON.stringify(workerState) === JSON.stringify(synchronousState),
        workerDate: [workerState.currentSeason, workerState.currentWeek],
        synchronousDate: [synchronousState.currentSeason, synchronousState.currentWeek],
        telemetry,
      };
    });

    expect(result).toMatchObject({
      equivalent: true,
      workerDate: result.synchronousDate,
      telemetry: { route: "worker" },
    });
    gamePage.expectNoConsoleErrors();
  });

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
    await gamePage.navigateTo("calendar");
    await gamePage.page
      .getByTestId("weekly-strategy-panel")
      .locator(":scope > summary")
      .click();
    const speculativeIntent = gamePage.page.getByRole("radio", { name: /Chase an edge/i });
    const relationshipPolicy = gamePage.page.getByRole("radio", { name: /Protect relationships/i });
    await speculativeIntent.click();
    await relationshipPolicy.click();
    await expect(speculativeIntent).toHaveAttribute("aria-checked", "true");
    await expect(relationshipPolicy).toHaveAttribute("aria-checked", "true");

    const result = await gamePage.page.evaluate(async () => {
      const store = (window as any).__GAME_STORE__;
      const initial = structuredClone(store.getState().gameState);

      await store.getState().batchAdvance(4);
      const batchState = structuredClone(store.getState().gameState);

      store.getState().loadGame(structuredClone(initial));
      for (let index = 0; index < 4; index++) {
        store.getState().autoSchedule();
        store.getState().startWeekSimulation();
        await store.getState().fastForwardWeek();
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
        batchStrategyHistory: batchState.weeklyStrategy?.history?.length,
        repeatedStrategyHistory: repeatedState.weeklyStrategy?.history?.length,
        executionRoute: store.getState().lastWeeklyExecutionRoute,
        workerTelemetry: store.getState().lastWeeklyWorkerTelemetry,
      };
    });

    expect(result, "batch and repeated canonical policies diverged").toMatchObject({
      equivalent: true,
      batchBytes: result.repeatedBytes,
      batchDate: result.repeatedDate,
      batchStrategyHistory: 4,
      repeatedStrategyHistory: 4,
      executionRoute: "worker",
      workerTelemetry: {
        route: "worker",
      },
    });
    expect(result.workerTelemetry.changedFieldCount).toBeLessThan(
      result.workerTelemetry.totalFieldCount,
    );
    expect(result.workerTelemetry.responseBytes).toBeLessThan(result.repeatedBytes);
    expect(result.workerTelemetry.computeMs).toBeGreaterThanOrEqual(0);
    expect(result.workerTelemetry.roundTripMs).toBeGreaterThanOrEqual(
      result.workerTelemetry.computeMs,
    );
    gamePage.expectNoConsoleErrors();
  });
});
