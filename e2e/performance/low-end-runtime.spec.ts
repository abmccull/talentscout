import { mkdir, writeFile } from "node:fs/promises";
import { cpus, platform, release, totalmem } from "node:os";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import type { Page } from "@playwright/test";
import {
  CHROMIUM_EMULATION_BUDGET,
  CHROMIUM_EMULATION_SEASON_ROLLOVER_BUDGET_MS,
  evaluateChromiumEmulationBudget,
  PHYSICAL_CERTIFICATION_LIMITATION,
} from "@/engine/telemetry/performancePolicy";
import { expect, test } from "../fixtures";
import { navItem } from "../helpers/selectors";

const outputPath = resolve(
  process.env.LOW_END_PROFILE_OUTPUT
    ?? "artifacts/performance/low-end-emulation-profile.json",
);
const rolloverOutputPath = resolve(
  process.env.LOW_END_ROLLOVER_PROFILE_OUTPUT
    ?? "artifacts/performance/season-rollover-emulation-profile.json",
);

const budgets = CHROMIUM_EMULATION_BUDGET;

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}

async function waitForSettledScreen(page: Page, screen: string): Promise<void> {
  await page.waitForFunction(
    (expectedScreen) => {
      const currentScreen = (window as any).__GAME_STORE__?.getState()?.currentScreen;
      const renderedScreen = document.querySelector(
        `[data-game-screen="${expectedScreen}"]`,
      );
      const loading = [...document.querySelectorAll<HTMLElement>('[role="status"]')]
        .some((element) => element.textContent?.startsWith("Loading workspace"));
      return currentScreen === expectedScreen && renderedScreen !== null && !loading;
    },
    screen,
    { timeout: 60_000 },
  );
  // Require a second rendered frame so controlled save injection and lazy
  // workspace commits are not charged to the next measured interaction.
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

async function measureSettledNavigation(page: Page, screen: string): Promise<number> {
  return page.evaluate(
    async ({ expectedScreen, selector }) => {
      const button = document.querySelector<HTMLButtonElement>(selector);
      if (!button) throw new Error(`Navigation control not found: ${selector}`);

      const startedAt = window.performance.now();
      button.click();
      let stableFrames = 0;

      while (window.performance.now() - startedAt < 60_000) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const currentScreen = (window as any).__GAME_STORE__?.getState()?.currentScreen;
        const renderedScreen = document.querySelector(
          `[data-game-screen="${expectedScreen}"]`,
        );
        const loading = [...document.querySelectorAll<HTMLElement>('[role="status"]')]
          .some((element) => element.textContent?.startsWith("Loading workspace"));
        stableFrames = currentScreen === expectedScreen && renderedScreen && !loading
          ? stableFrames + 1
          : 0;
        if (stableFrames >= 2) return window.performance.now() - startedAt;
      }

      throw new Error(`Navigation did not settle: ${expectedScreen}`);
    },
    { expectedScreen: screen, selector: navItem(screen) },
  );
}

async function measureSettledWeekAdvance(page: Page): Promise<{
  elapsedMs: number;
  workerTelemetry: Record<string, unknown> | null;
}> {
  return page.evaluate(async () => {
    const store = (window as any).__GAME_STORE__;
    const before = store?.getState()?.gameState;
    if (!store || !before) throw new Error("Game state unavailable for week profile");

    const startedAt = window.performance.now();
    await store.getState().batchAdvance(1);
    let stableFrames = 0;

    while (window.performance.now() - startedAt < 60_000) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const rootState = store.getState();
      const state = rootState.gameState;
      const advanced = state && (
        state.currentSeason !== before.currentSeason
        || state.currentWeek !== before.currentWeek
      );
      const renderedScreen = document.querySelector(
        `[data-game-screen="${rootState.currentScreen}"]`,
      );
      const headerCommitted = state && [...document.querySelectorAll("header p, aside p")]
        .some((element) => {
          const label = element.textContent ?? "";
          return label.includes(`Week ${state.currentWeek}`)
            && label.includes(`Season ${state.currentSeason}`);
        });
      const loading = [...document.querySelectorAll<HTMLElement>('[role="status"]')]
        .some((element) => element.textContent?.startsWith("Loading workspace"));
      stableFrames = advanced && renderedScreen && headerCommitted && !loading
        ? stableFrames + 1
        : 0;
      if (stableFrames >= 2) {
        return {
          elapsedMs: window.performance.now() - startedAt,
          workerTelemetry: structuredClone(
            store.getState().lastWeeklyWorkerTelemetry ?? null,
          ),
        };
      }
    }

    throw new Error("One-week advancement did not settle");
  });
}

async function readSimulationDateContext(page: Page): Promise<{
  season: number;
  week: number;
  seasonLength: number;
  fixtureCount: number;
}> {
  return page.evaluate(() => {
    const state = (window as any).__GAME_STORE__?.getState()?.gameState;
    if (!state) throw new Error("Game state unavailable for date profile");
    const currentFixtures = Object.values(state.fixtures ?? {})
      .filter((fixture: any) => fixture.season === state.currentSeason);
    const seasonLength = currentFixtures.reduce(
      (maximum: number, fixture: any) => Math.max(maximum, fixture.week ?? 0),
      38,
    );
    return {
      season: state.currentSeason,
      week: state.currentWeek,
      seasonLength,
      fixtureCount: currentFixtures.length,
    };
  });
}

test.describe("low-end runtime evidence", () => {
  test("core career journey stays inside the published emulation budgets", async ({ gamePage }) => {
    test.setTimeout(180_000);
    const cdp = await gamePage.page.context().newCDPSession(gamePage.page);
    await cdp.send("Performance.enable");
    await cdp.send("Network.enable");
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 80,
      downloadThroughput: 1_500_000 / 8,
      uploadThroughput: 750_000 / 8,
      connectionType: "cellular3g",
    });

    const loadStart = performance.now();
    await gamePage.goto();
    const coldLoadMs = performance.now() - loadStart;
    await gamePage.injectLateGameState("youth");
    await waitForSettledScreen(gamePage.page, "dashboard");

    const beforeWeek = await readSimulationDateContext(gamePage.page);
    expect(beforeWeek.fixtureCount).toBeGreaterThan(0);
    expect(beforeWeek.seasonLength).toBeGreaterThan(beforeWeek.week);

    const navigationDurationsMs: number[] = [];
    for (const screen of ["calendar", "career", "internationalView", "reportHistory", "dashboard"]) {
      navigationDurationsMs.push(await measureSettledNavigation(gamePage.page, screen));
    }

    const weekAdvance = await measureSettledWeekAdvance(gamePage.page);
    const afterWeek = await readSimulationDateContext(gamePage.page);
    expect(afterWeek).toMatchObject({
      season: beforeWeek.season,
      week: beforeWeek.week + 1,
    });
    const payloadHotspots = (
      weekAdvance.workerTelemetry?.payloadHotspots as Array<{ field?: string }> | undefined
    ) ?? [];
    expect(payloadHotspots.map(({ field }) => field)).not.toEqual(
      expect.arrayContaining(["retiredPlayers", "worldHistory", "playerMovementHistory"]),
    );

    await cdp.send("HeapProfiler.collectGarbage");
    const rawMetrics = await cdp.send("Performance.getMetrics");
    const metrics = Object.fromEntries(
      rawMetrics.metrics.map((metric) => [metric.name, metric.value]),
    );
    const navigationP95Ms = percentile(navigationDurationsMs, 0.95);
    const measured = {
      coldLoadMs: Math.round(coldLoadMs * 100) / 100,
      navigationDurationsMs: navigationDurationsMs.map((value) => Math.round(value * 100) / 100),
      navigationP95Ms: Math.round(navigationP95Ms * 100) / 100,
      oneWeekAdvanceMs: Math.round(weekAdvance.elapsedMs * 100) / 100,
      weeklyWorker: weekAdvance.workerTelemetry,
      jsHeapUsedBytes: Math.round(metrics.JSHeapUsedSize ?? 0),
      jsHeapTotalBytes: Math.round(metrics.JSHeapTotalSize ?? 0),
      domNodes: Math.round(metrics.Nodes ?? 0),
      documents: Math.round(metrics.Documents ?? 0),
      layoutCount: Math.round(metrics.LayoutCount ?? 0),
    };
    const policyChecks = evaluateChromiumEmulationBudget({
      coldLoadMs: measured.coldLoadMs,
      navigationP95Ms: measured.navigationP95Ms,
      oneWeekAdvanceMs: measured.oneWeekAdvanceMs,
      jsHeapUsedBytes: measured.jsHeapUsedBytes,
      domNodes: measured.domNodes,
    });
    const checks = {
      coldLoad: policyChecks.coldLoadMs,
      navigationP95: policyChecks.navigationP95Ms,
      oneWeekAdvance: policyChecks.oneWeekAdvanceMs,
      heap: policyChecks.jsHeapUsedBytes,
      domNodes: policyChecks.domNodes,
    };
    const report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      evidenceClass: "chromium-emulation-not-physical-low-end-hardware",
      emulation: {
        cpuSlowdown: 4,
        networkLatencyMs: 80,
        downloadBitsPerSecond: 1_500_000,
        uploadBitsPerSecond: 750_000,
      },
      transport: {
        contentEncoding: "gzip for text assets",
        staticAssetCaching: "immutable hashed chunks; one-day image/audio cache",
        audioDelivery: "HTML5 streaming with metadata-only preload for music and ambience",
        navigationMeasurement: "in-browser DOM click through two stable rendered frames; excludes Playwright driver/actionability latency",
        weekAdvanceMeasurement: "in-browser batchAdvance(1) through two stable rendered frames; excludes Playwright protocol latency and fixed helper waits",
      },
      host: {
        platform: platform(),
        release: release(),
        logicalCpuCount: cpus().length,
        cpuModel: cpus()[0]?.model ?? "unknown",
        totalMemoryBytes: totalmem(),
      },
      budgets,
      measured,
      simulationContext: {
        profile: "coherent-mature-ordinary-week",
        before: beforeWeek,
        after: afterWeek,
      },
      checks,
      status: Object.values(checks).every(Boolean) ? "pass" : "fail",
      limitation: PHYSICAL_CERTIFICATION_LIMITATION,
    };

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    expect(checks, JSON.stringify(report, null, 2)).toEqual({
      coldLoad: true,
      navigationP95: true,
      oneWeekAdvance: true,
      heap: true,
      domNodes: true,
    });
  });

  test("coherent season rollover stays inside its published boundary budget", async ({ gamePage }) => {
    test.setTimeout(180_000);
    const cdp = await gamePage.page.context().newCDPSession(gamePage.page);
    await cdp.send("Performance.enable");
    await cdp.send("Network.enable");
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 80,
      downloadThroughput: 1_500_000 / 8,
      uploadThroughput: 750_000 / 8,
      connectionType: "cellular3g",
    });

    await gamePage.goto();
    await gamePage.injectLateGameState("youth");
    await waitForSettledScreen(gamePage.page, "dashboard");

    // Exercise one coherent week first. A real player reaches the season
    // boundary with the persistent simulation worker already compiled and hot.
    await measureSettledWeekAdvance(gamePage.page);
    const warmContext = await readSimulationDateContext(gamePage.page);
    expect(warmContext.fixtureCount).toBeGreaterThan(0);
    expect(warmContext.seasonLength).toBeGreaterThan(warmContext.week);

    await gamePage.page.evaluate((finalWeek) => {
      const store = (window as any).__GAME_STORE__;
      const rootState = store?.getState();
      if (!store || !rootState?.gameState) {
        throw new Error("Game state unavailable for rollover profile");
      }
      store.setState({
        gameState: { ...rootState.gameState, currentWeek: finalWeek },
        weekSimulation: null,
        lastWeekSummary: null,
        weeklyTransactionError: null,
      });
    }, warmContext.seasonLength);
    await gamePage.page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));

    const before = await readSimulationDateContext(gamePage.page);
    expect(before.week).toBe(before.seasonLength);
    const rollover = await measureSettledWeekAdvance(gamePage.page);
    const after = await readSimulationDateContext(gamePage.page);
    expect(after.season).toBe(before.season + 1);
    expect(after.week).toBe(1);
    expect(after.fixtureCount).toBeGreaterThan(0);

    const elapsedMs = Math.round(rollover.elapsedMs * 100) / 100;
    const passed = elapsedMs <= CHROMIUM_EMULATION_SEASON_ROLLOVER_BUDGET_MS;
    const report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      evidenceClass: "chromium-emulation-season-boundary-stress-not-physical-low-end-hardware",
      profile: "coherent-warmed-season-rollover",
      emulation: {
        cpuSlowdown: 4,
        networkLatencyMs: 80,
        downloadBitsPerSecond: 1_500_000,
        uploadBitsPerSecond: 750_000,
      },
      host: {
        platform: platform(),
        release: release(),
        logicalCpuCount: cpus().length,
        cpuModel: cpus()[0]?.model ?? "unknown",
        totalMemoryBytes: totalmem(),
      },
      budgetMs: CHROMIUM_EMULATION_SEASON_ROLLOVER_BUDGET_MS,
      measured: {
        elapsedMs,
        weeklyWorker: rollover.workerTelemetry,
      },
      simulationContext: { before, after },
      status: passed ? "pass" : "fail",
      limitation: `${PHYSICAL_CERTIFICATION_LIMITATION} This is a coherent warmed boundary stress run, not a canonically played multi-season save.`,
    };
    await mkdir(dirname(rolloverOutputPath), { recursive: true });
    await writeFile(rolloverOutputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    expect(elapsedMs, JSON.stringify(report, null, 2)).toBeLessThanOrEqual(
      CHROMIUM_EMULATION_SEASON_ROLLOVER_BUDGET_MS,
    );
  });
});
