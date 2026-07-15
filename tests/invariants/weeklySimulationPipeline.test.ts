import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  CANONICAL_WEEKLY_SIMULATION_PHASES,
  compactCompletedSeasonHistory,
  createWeeklySimulationPipeline,
  evaluateWeekAdvancePreflight,
  observeWeeklySimulationTelemetry,
} from "@/engine/core/weeklySimulationPipeline";
import { createWeeklyTransactionJob } from "@/engine/core/weeklyTransactionProtocol";
import { observeSaveRetentionCompaction } from "@/engine/world/saveRetention";
import { migrateSaveState } from "@/lib/db";

const goldenV0Path = fileURLToPath(
  new URL("../fixtures/saves/v0-save-record.json", import.meta.url),
);

function migratedState() {
  const record = JSON.parse(readFileSync(goldenV0Path, "utf8")) as {
    state: Record<string, unknown>;
  };
  return migrateSaveState(record.state);
}

describe("canonical weekly simulation pipeline", () => {
  it("keeps preflight priority stable across every advancement entrypoint", () => {
    expect(evaluateWeekAdvancePreflight({
      hasWeekSimulation: false,
      hasPendingDayInteractions: true,
      demoLimitReached: true,
      hasPendingInteractiveMatch: true,
    })).toEqual({ kind: "start-week-simulation" });
    expect(evaluateWeekAdvancePreflight({
      hasWeekSimulation: true,
      hasPendingDayInteractions: true,
      demoLimitReached: true,
      hasPendingInteractiveMatch: true,
    })).toEqual({ kind: "await-day-interaction" });
    expect(evaluateWeekAdvancePreflight({
      hasWeekSimulation: true,
      hasPendingDayInteractions: false,
      demoLimitReached: true,
      hasPendingInteractiveMatch: true,
    })).toEqual({ kind: "show-demo-end" });
    expect(evaluateWeekAdvancePreflight({
      hasWeekSimulation: true,
      hasPendingDayInteractions: false,
      demoLimitReached: false,
      hasPendingInteractiveMatch: true,
    })).toEqual({ kind: "start-pending-match" });
  });

  it("rejects out-of-order or date-free week transactions", () => {
    const state = migratedState();
    const pipeline = createWeeklySimulationPipeline(state);

    expect(() => pipeline.enter("world-systems")).toThrow("out of order");
    for (const phase of CANONICAL_WEEKLY_SIMULATION_PHASES) pipeline.enter(phase);
    expect(() => pipeline.complete(state)).toThrow("without advancing the game date");
  });

  it("records the complete ordered transaction before returning the advanced state", () => {
    const state = migratedState();
    const pipeline = createWeeklySimulationPipeline(state);
    for (const phase of CANONICAL_WEEKLY_SIMULATION_PHASES) pipeline.enter(phase);
    const advanced = { ...state, currentWeek: state.currentWeek + 1 };

    expect(pipeline.complete(advanced)).toBe(advanced);
    expect(pipeline.snapshot()).toMatchObject({
      mode: state.scout.primarySpecialization,
      sourceSeason: state.currentSeason,
      sourceWeek: state.currentWeek,
      completedPhases: CANONICAL_WEEKLY_SIMULATION_PHASES,
    });
  });

  it("records monotonic phase timings without changing the completed state", () => {
    const state = migratedState();
    const clockReadings = [0, 1, 4, 6, 9, 12, 13, 20];
    const telemetrySamples: unknown[] = [];
    const stopObserving = observeWeeklySimulationTelemetry((sample) => {
      telemetrySamples.push(sample);
    });
    try {
      const job = createWeeklyTransactionJob(state);
      const pipeline = createWeeklySimulationPipeline(state, {
        transaction: job,
        now: () => clockReadings.shift() ?? 20,
      });
      for (const phase of CANONICAL_WEEKLY_SIMULATION_PHASES) pipeline.enter(phase);
      const advanced = { ...state, currentWeek: state.currentWeek + 1 };

      expect(pipeline.complete(advanced)).toBe(advanced);
      expect(pipeline.snapshot()).toMatchObject({
        transaction: job,
        execution: {
          route: "main-thread",
          fallbackReason: "synchronous-store-transaction",
        },
        startedAtMs: 0,
        completedAtMs: 20,
        phaseTimings: [
          { phase: "activity-resolution", elapsedMs: 3 },
          { phase: "world-systems", elapsedMs: 2 },
          { phase: "core-world-tick", elapsedMs: 3 },
          { phase: "post-tick-accountability", elapsedMs: 3 },
          { phase: "season-rollover", elapsedMs: 1 },
          { phase: "finalize", elapsedMs: 7 },
        ],
      });
      expect(telemetrySamples).toHaveLength(1);
      expect(telemetrySamples[0]).toMatchObject({
        transaction: job,
        elapsedMs: 20,
      });
    } finally {
      stopObserving();
    }
  });

  it("keeps telemetry finite when an optional diagnostics clock regresses", () => {
    const state = migratedState();
    const clockReadings = [10, 4, Number.NaN, 8, 11, 9, 12, 13];
    const pipeline = createWeeklySimulationPipeline(state, {
      now: () => clockReadings.shift() ?? 13,
    });
    for (const phase of CANONICAL_WEEKLY_SIMULATION_PHASES) pipeline.enter(phase);
    pipeline.complete({ ...state, currentWeek: state.currentWeek + 1 });

    const snapshot = pipeline.snapshot();
    expect(snapshot.startedAtMs).toBe(10);
    expect(snapshot.completedAtMs).toBe(13);
    expect(snapshot.phaseTimings.every((timing) => (
      Number.isFinite(timing.elapsedMs) && timing.elapsedMs >= 0
    ))).toBe(true);
  });

  it("keeps an interrupted phase trace out of the save and restarts from the source date", () => {
    const state = migratedState();
    const persistedBefore = JSON.stringify(state);
    const interrupted = createWeeklySimulationPipeline(state, {
      transaction: createWeeklyTransactionJob(state),
    });
    interrupted.enter("activity-resolution");
    interrupted.enter("world-systems");

    // The pipeline holds only local trace metadata. A crash/reload therefore
    // restarts the same source week rather than persisting a half-processed one.
    expect(JSON.stringify(state)).toBe(persistedBefore);
    const reloaded = JSON.parse(persistedBefore) as typeof state;
    const restarted = createWeeklySimulationPipeline(reloaded, {
      transaction: createWeeklyTransactionJob(reloaded),
    });
    const restartedSnapshot = restarted.snapshot();
    expect(restartedSnapshot).toMatchObject({
      sourceSeason: state.currentSeason,
      sourceWeek: state.currentWeek,
      completedPhases: [],
      transaction: createWeeklyTransactionJob(state),
    });
    expect(restartedSnapshot.activePhase).toBeUndefined();
  });

  it("compacts exactly once at a season boundary and never during a normal week", () => {
    const state = migratedState();
    const samples: unknown[] = [];
    const stopObserving = observeSaveRetentionCompaction((sample) => samples.push(sample));
    try {
      const normalWeek = {
        ...state,
        currentWeek: state.currentWeek + 1,
      };
      expect(compactCompletedSeasonHistory(state, normalWeek)).toBe(normalWeek);
      expect(samples).toHaveLength(0);

      compactCompletedSeasonHistory(state, {
        ...state,
        currentSeason: state.currentSeason + 1,
        currentWeek: 1,
      });
      expect(samples).toHaveLength(1);
    } finally {
      stopObserving();
    }
  });
});
