import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState, WeekSimulationState } from "@/engine/core/types";
import type { GameStoreState, GetState, SetState } from "@/stores/actions/types";

const mocks = vi.hoisted(() => ({
  runTransaction: vi.fn(),
  applyTutorialCommands: vi.fn(),
  queueAutosave: vi.fn(),
}));

vi.mock("@/lib/activeSaveProvider", () => ({
  getActiveSaveProvider: async () => ({ save: async () => undefined }),
}));
vi.mock("@/lib/saveProvider", () => ({
  persistGameState: async () => undefined,
}));
vi.mock("@/lib/weeklySimulationWorkerClient", () => ({
  runWeeklyWorkerTransaction: mocks.runTransaction,
}));
vi.mock("@/stores/actions/weeklyActions", () => ({
  applyWeeklyTutorialCommands: mocks.applyTutorialCommands,
  queueWeeklyAutosave: mocks.queueAutosave,
}));
vi.mock("@/stores/actions/weeklyQuickScoutActions", () => ({
  isBatchAdvanceInProgress: () => false,
}));
vi.mock("@/stores/tutorialStore", () => ({
  useTutorialStore: {
    getState: () => ({
      completedSequences: new Set(),
      visitedScreens: new Set(),
      dismissedHints: new Set(),
      discoveredFeatures: new Set(),
    }),
  },
}));

import { createWeeklyAsyncActions } from "@/stores/actions/weeklyAsyncActions";

describe("weekly async transaction coordinator", () => {
  beforeEach(() => vi.clearAllMocks());

  it("discards a completed worker result after the active save is replaced", async () => {
    let resolveTransaction!: (value: unknown) => void;
    mocks.runTransaction.mockReturnValue(new Promise((resolve) => {
      resolveTransaction = resolve;
    }));

    const sourceState = { seed: "source", currentSeason: 1, currentWeek: 1 } as GameState;
    const replacementState = { seed: "replacement", currentSeason: 4, currentWeek: 9 } as GameState;
    const sourceSimulation = {
      dayResults: [],
      currentDay: 7,
      pendingWorldTick: true,
    } as WeekSimulationState;
    let store = {
      gameState: sourceState,
      weekSimulation: sourceSimulation,
      currentScreen: "weekSimulation",
      isLoaded: true,
      isAdvancingWeek: false,
    } as unknown as GameStoreState;
    const get: GetState = () => store;
    const set: SetState = (partial) => {
      const update = typeof partial === "function" ? partial(store) : partial;
      store = { ...store, ...update };
    };
    const actions = createWeeklyAsyncActions(get, set);

    const pending = actions.advanceWeekAsync();
    expect(store.isAdvancingWeek).toBe(true);
    store = {
      ...store,
      gameState: replacementState,
      weekSimulation: null,
      isAdvancingWeek: false,
    };
    resolveTransaction({
      route: "worker",
      commit: {
        patch: {},
        gameState: {
          kind: "delta",
          changedFields: { currentWeek: 2 },
          recordDeltas: {},
          arrayDeltas: {},
          removedFields: [],
        },
        tutorialCommands: [{ type: "completeMilestone", id: "advancedWeek" }],
        metrics: {
          computeMs: 10,
          changedFieldCount: 1,
          changedEntryCount: 1,
          totalFieldCount: 2,
          responseBytes: 200,
        },
      },
      telemetry: {
        route: "worker",
        computeMs: 10,
        changedFieldCount: 1,
        changedEntryCount: 1,
        totalFieldCount: 2,
        responseBytes: 200,
        roundTripMs: 12,
      },
    });
    await pending;

    expect(store.gameState).toBe(replacementState);
    expect(store.isAdvancingWeek).toBe(false);
    expect(mocks.applyTutorialCommands).not.toHaveBeenCalled();
    expect(mocks.queueAutosave).not.toHaveBeenCalled();
  });
});
