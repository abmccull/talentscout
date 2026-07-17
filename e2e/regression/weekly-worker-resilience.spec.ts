import { expect, test } from "../fixtures";

test.describe("Weekly simulation worker resilience", () => {
  test("a stalled worker falls back without stranding the weekly gameplay loop", async ({
    gamePage,
    page,
  }) => {
    await page.addInitScript(() => {
      class StalledWorker extends EventTarget {
        postMessage() {
          // Deliberately never answer. The application must use its bounded
          // authoritative main-thread fallback instead of freezing the week.
        }

        terminate() {
          // The fake owns no resources.
        }
      }

      Object.defineProperty(window, "Worker", {
        configurable: true,
        value: StalledWorker,
      });
    });

    await gamePage.goto();
    await gamePage.injectState({
      currentWeek: 1,
      scout: {
        firstName: "Fallback",
        lastName: "Tester",
        primarySpecialization: "youth",
      },
    });
    await gamePage.navigateTo("calendar");

    const startedAt = Date.now();
    await gamePage.advanceCanonicalWeek();
    const elapsedMs = Date.now() - startedAt;

    const outcome = await page.evaluate(() => {
      const store = (window as any).__GAME_STORE__.getState();
      return {
        currentWeek: store.gameState?.currentWeek,
        route: store.lastWeeklyExecutionRoute,
        fallbackReason: store.lastWeeklyWorkerTelemetry?.fallbackReason,
        roundTripMs: store.lastWeeklyWorkerTelemetry?.roundTripMs,
        error: store.weeklyTransactionError,
      };
    });

    expect(outcome).toMatchObject({
      currentWeek: 2,
      route: "main-thread-fallback",
      fallbackReason: "worker-failed",
      error: null,
    });
    expect(outcome.roundTripMs).toBeGreaterThanOrEqual(8_000);
    expect(outcome.roundTripMs).toBeLessThan(20_000);
    expect(elapsedMs).toBeLessThan(25_000);
    gamePage.expectNoConsoleErrors();
  });
});
