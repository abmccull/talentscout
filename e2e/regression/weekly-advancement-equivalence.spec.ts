import { test, expect } from "../fixtures";

test.describe("Canonical weekly advancement", () => {
  test("worker delta materializes the exact synchronous canonical state", async ({ gamePage }, testInfo) => {
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

      // The direct reference stops before the interactive simulation cleanup.
      // Check its full pre-week recovery mirror separately, then compare it at
      // the same committed recovery phase as the worker. Every other field,
      // including lastSaved, remains in the exact serialized comparison.
      const sourceRecovery = sourceState.pendingWeekRecovery;
      const synchronousRecovery = synchronousState.pendingWeekRecovery;
      const synchronousComparable = { ...synchronousState, pendingWeekRecovery: null };

      // Keep diagnostics on the original snapshots. The existing JSON contract
      // already omits optional object properties whose value is undefined.
      function diagnoseEquivalence(left: any, right: any) {
        let semanticDifferenceCount = 0;
        let orderDifferenceCount = 0;
        const semanticDifferences: Array<{ path: string; reason: string; left?: unknown; right?: unknown }> = [];
        const orderDifferences: string[] = [];
        const sample = (value: unknown) => value === undefined ? { type: "undefined" }
          : value !== null && typeof value === "object" ? { type: Array.isArray(value) ? "array" : "object", keys: Object.keys(value).slice(0, 8) }
          : typeof value === "string" && value.length > 100 ? value.slice(0, 100) + "…" : value;
        const note = (path: string, reason: string, left?: unknown, right?: unknown) => {
          semanticDifferenceCount++;
          if (semanticDifferences.length < 64) semanticDifferences.push({ path, reason, left: sample(left), right: sample(right) });
        };
        function inspect(a: any, b: any, path: string) {
          if (Object.is(a, b)) return;
          if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
            note(path, "value", a, b); return;
          }
          if (Array.isArray(a) !== Array.isArray(b)) { note(path, "array/object type"); return; }
          if (Array.isArray(a)) {
            if (a.length !== b.length) note(path + ".length", "array length", a.length, b.length);
            for (let index = 0; index < Math.max(a.length, b.length); index++) {
              if (Object.hasOwn(a, index) !== Object.hasOwn(b, index)) note(`${path}[${index}]`, "array presence");
              else if (Object.hasOwn(a, index)) inspect(a[index], b[index], `${path}[${index}]`);
            }
            return;
          }
          const aKeys = Object.keys(a), bKeys = Object.keys(b);
          const sameKeys = aKeys.length === bKeys.length && aKeys.every(key => Object.hasOwn(b, key));
          if (sameKeys && aKeys.some((key, index) => key !== bKeys[index])) {
            orderDifferenceCount++;
            if (orderDifferences.length < 64) orderDifferences.push(path || "<root>");
          }
          for (const key of new Set([...aKeys, ...bKeys])) {
            const child = path ? `${path}.${key}` : key;
            if (Object.hasOwn(a, key) !== Object.hasOwn(b, key)) note(child, "object property presence", a[key], b[key]);
            else inspect(a[key], b[key], child);
          }
        }
        inspect(left, right, "");
        return { semanticDifferenceCount, semanticDifferences, orderDifferenceCount, orderDifferences,
          saveMetadata: { left: left.lastSaved, right: right.lastSaved },
          recoveryMetadata: { left: left.pendingWeekRecovery == null ? null : { season: left.pendingWeekRecovery.season, week: left.pendingWeekRecovery.week },
            right: right.pendingWeekRecovery == null ? null : { season: right.pendingWeekRecovery.season, week: right.pendingWeekRecovery.week } },
          jsonOnlyDifference: JSON.stringify(left) !== JSON.stringify(right) && semanticDifferenceCount === 0 };
      }

      return {
        equivalent: JSON.stringify(workerState) === JSON.stringify(synchronousComparable),
        recoveryContracts: {
          sourceCheckpointPresent: sourceRecovery != null,
          sourceCheckpointMatchesSourceDate: sourceRecovery?.season === sourceState.currentSeason
            && sourceRecovery?.week === sourceState.currentWeek,
          workerRecoveryCleared: workerState.pendingWeekRecovery === null,
          synchronousCheckpointPreserved: JSON.stringify(synchronousRecovery) === JSON.stringify(sourceRecovery),
          synchronousCheckpointPrecedesCommit: synchronousRecovery != null
            && (synchronousRecovery.season < synchronousState.currentSeason
              || (synchronousRecovery.season === synchronousState.currentSeason
                && synchronousRecovery.week < synchronousState.currentWeek)),
        },
        diagnostics: diagnoseEquivalence(workerState, synchronousState),
        workerDate: [workerState.currentSeason, workerState.currentWeek],
        synchronousDate: [synchronousState.currentSeason, synchronousState.currentWeek],
        telemetry,
      };
    });

    await testInfo.attach("worker-synchronous-equivalence-diagnostics.json", { contentType: "application/json", body: Buffer.from(JSON.stringify(result, null, 2)) });

    expect(result).toMatchObject({
      equivalent: true,
      recoveryContracts: {
        sourceCheckpointPresent: true,
        sourceCheckpointMatchesSourceDate: true,
        workerRecoveryCleared: true,
        synchronousCheckpointPreserved: true,
        synchronousCheckpointPrecedesCommit: true,
      },
      workerDate: result.synchronousDate,
      telemetry: { route: "worker" },
    });
    expect(result.workerDate).toEqual([1, 2]);
    gamePage.expectNoConsoleErrors();
  });

  test("batch policy produces the same game state as repeated default fast-forward", async ({ gamePage }, testInfo) => {
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
      const repeatedSavedAt: number[] = [];
      for (let index = 0; index < 4; index++) {
        store.getState().autoSchedule();
        store.getState().startWeekSimulation();
        await store.getState().fastForwardWeek();
        repeatedSavedAt.push(store.getState().gameState.lastSaved);
      }
      const repeatedState = structuredClone(store.getState().gameState);

      // Compare inside the browser. Returning two full multi-league worlds
      // through the Playwright protocol turns a four-week invariant into a
      // minutes-long serialization benchmark as the database grows.
      const batchJson = JSON.stringify(batchState);
      const repeatedJson = JSON.stringify(repeatedState);

      // These runs execute at different wall times. Compare all other saved
      // fields exactly and verify each route's save timestamp contract below.
      // The original raw serialized-size comparison remains unchanged.
      const { lastSaved: batchSavedAt, ...batchComparable } = batchState;
      const { lastSaved: repeatedFinalSavedAt, ...repeatedComparable } = repeatedState;

      // Diagnostics still report the unmodified snapshots, including lastSaved.
      function diagnoseEquivalence(left: any, right: any) {
        let semanticDifferenceCount = 0;
        let orderDifferenceCount = 0;
        const semanticDifferences: Array<{ path: string; reason: string; left?: unknown; right?: unknown }> = [];
        const orderDifferences: string[] = [];
        const sample = (value: unknown) => value === undefined ? { type: "undefined" }
          : value !== null && typeof value === "object" ? { type: Array.isArray(value) ? "array" : "object", keys: Object.keys(value).slice(0, 8) }
          : typeof value === "string" && value.length > 100 ? value.slice(0, 100) + "…" : value;
        const note = (path: string, reason: string, left?: unknown, right?: unknown) => {
          semanticDifferenceCount++;
          if (semanticDifferences.length < 64) semanticDifferences.push({ path, reason, left: sample(left), right: sample(right) });
        };
        function inspect(a: any, b: any, path: string) {
          if (Object.is(a, b)) return;
          if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
            note(path, "value", a, b); return;
          }
          if (Array.isArray(a) !== Array.isArray(b)) { note(path, "array/object type"); return; }
          if (Array.isArray(a)) {
            if (a.length !== b.length) note(path + ".length", "array length", a.length, b.length);
            for (let index = 0; index < Math.max(a.length, b.length); index++) {
              if (Object.hasOwn(a, index) !== Object.hasOwn(b, index)) note(`${path}[${index}]`, "array presence");
              else if (Object.hasOwn(a, index)) inspect(a[index], b[index], `${path}[${index}]`);
            }
            return;
          }
          const aKeys = Object.keys(a), bKeys = Object.keys(b);
          const sameKeys = aKeys.length === bKeys.length && aKeys.every(key => Object.hasOwn(b, key));
          if (sameKeys && aKeys.some((key, index) => key !== bKeys[index])) {
            orderDifferenceCount++;
            if (orderDifferences.length < 64) orderDifferences.push(path || "<root>");
          }
          for (const key of new Set([...aKeys, ...bKeys])) {
            const child = path ? `${path}.${key}` : key;
            if (Object.hasOwn(a, key) !== Object.hasOwn(b, key)) note(child, "object property presence", a[key], b[key]);
            else inspect(a[key], b[key], child);
          }
        }
        inspect(left, right, "");
        return { semanticDifferenceCount, semanticDifferences, orderDifferenceCount, orderDifferences,
          saveMetadata: { left: left.lastSaved, right: right.lastSaved },
          recoveryMetadata: { left: left.pendingWeekRecovery == null ? null : { season: left.pendingWeekRecovery.season, week: left.pendingWeekRecovery.week },
            right: right.pendingWeekRecovery == null ? null : { season: right.pendingWeekRecovery.season, week: right.pendingWeekRecovery.week } },
          jsonOnlyDifference: JSON.stringify(left) !== JSON.stringify(right) && semanticDifferenceCount === 0 };
      }
      return {
        equivalent: JSON.stringify(batchComparable) === JSON.stringify(repeatedComparable),
        persistenceContracts: {
          initialSaveTimestampValid: Number.isSafeInteger(initial.lastSaved) && initial.lastSaved >= 0,
          batchSaveTimestampAdvanced: Number.isSafeInteger(batchSavedAt) && batchSavedAt > initial.lastSaved,
          repeatedSaveTimestampsAdvanced: repeatedSavedAt.every((savedAt, index) =>
            Number.isSafeInteger(savedAt) && savedAt > (index === 0 ? initial.lastSaved : repeatedSavedAt[index - 1])),
          repeatedFinalTimestampMatches: repeatedFinalSavedAt === repeatedSavedAt[repeatedSavedAt.length - 1],
          batchRecoveryCleared: batchState.pendingWeekRecovery === null,
          repeatedRecoveryCleared: repeatedState.pendingWeekRecovery === null,
        },
        saveTimestamps: { initial: initial.lastSaved, batch: batchSavedAt, repeated: repeatedSavedAt },
        diagnostics: diagnoseEquivalence(batchState, repeatedState),
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

    await testInfo.attach("batch-repeated-equivalence-diagnostics.json", { contentType: "application/json", body: Buffer.from(JSON.stringify(result, null, 2)) });

    expect(result, "batch and repeated canonical policies diverged").toMatchObject({
      equivalent: true,
      persistenceContracts: {
        initialSaveTimestampValid: true,
        batchSaveTimestampAdvanced: true,
        repeatedSaveTimestampsAdvanced: true,
        repeatedFinalTimestampMatches: true,
        batchRecoveryCleared: true,
        repeatedRecoveryCleared: true,
      },
      batchBytes: result.repeatedBytes,
      batchDate: result.repeatedDate,
      batchStrategyHistory: 4,
      repeatedStrategyHistory: 4,
      executionRoute: "worker",
      workerTelemetry: {
        route: "worker",
      },
    });
    expect(result.batchDate).toEqual([1, 5]);
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
