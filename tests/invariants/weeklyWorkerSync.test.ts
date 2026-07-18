import { describe, expect, it } from "vitest";
import type { GameState, WeekSimulationState } from "@/engine/core/types";
import {
  createWeeklyWorkerWireState,
  materializeWeeklyWorkerWireState,
} from "@/stores/actions/weeklyWorkerSync";
import type { WeeklyWorkerInput } from "@/stores/actions/weeklyWorkerTypes";

function state(overrides: Partial<GameState> = {}): GameState {
  return {
    seed: "worker-cache",
    currentSeason: 2,
    currentWeek: 8,
    scout: { primarySpecialization: "youth" },
    schedule: { week: 8, season: 2, slots: [] },
    players: { stable: { id: "stable" } },
    ...overrides,
  } as unknown as GameState;
}

function input(gameState: GameState): WeeklyWorkerInput {
  return {
    gameState,
    weekSimulation: { currentDay: 7 } as WeekSimulationState,
    currentScreen: "weekSimulation",
    isLoaded: true,
    tutorial: {
      completedSequences: [],
      visitedScreens: [],
      dismissedHints: [],
      discoveredFeatures: [],
    },
  };
}

describe("weekly worker persistent state synchronization", () => {
  it("sends a full input only when no matching worker base exists", () => {
    const source = state();
    expect(createWeeklyWorkerWireState(null, input(source))).toEqual({
      kind: "replace",
      input: input(source),
    });
    expect(createWeeklyWorkerWireState(
      source,
      input(state({ currentWeek: 9 })),
    ).kind).toBe("replace");
  });

  it("sends and materializes only changed top-level branches", () => {
    const base = state();
    const next = {
      ...base,
      schedule: { ...base.schedule, slots: [{ day: 1, activityId: "study" }] },
    } as GameState;
    const wire = createWeeklyWorkerWireState(base, input(next));

    expect(wire).toMatchObject({
      kind: "patch",
      gameState: {
        changedFields: { schedule: next.schedule },
        removedFields: [],
      },
    });
    const materialized = materializeWeeklyWorkerWireState(base, wire);
    expect(materialized.gameState).toEqual(next);
    expect(materialized.gameState.players).toBe(base.players);
  });

  it("rejects a patch against a stale worker cache", () => {
    const base = state();
    const wire = createWeeklyWorkerWireState(base, input({
      ...base,
      schedule: { ...base.schedule },
    }));
    expect(() => materializeWeeklyWorkerWireState(
      state({ currentWeek: 7 }),
      wire,
    )).toThrow(/does not match/);
  });
});
