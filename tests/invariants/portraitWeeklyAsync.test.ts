import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState, WeekSimulationState } from "@/engine/core/types";
import type { GameStoreState, SetState } from "@/stores/actions/types";
const mocks = vi.hoisted(() => ({ run: vi.fn(), save: vi.fn(), tutorial: vi.fn() }));
vi.mock("@/lib/weeklySimulationWorkerClient", () => ({ runWeeklyWorkerTransaction: mocks.run }));
vi.mock("@/stores/actions/weeklyActions", () => ({ queueWeeklyAutosave: mocks.save }));
vi.mock("@/stores/actions/weeklyTutorialBridge", () => ({ applyWeeklyTutorialCommands: mocks.tutorial }));
vi.mock("@/stores/actions/weeklyHeadlessTransaction", () => ({ materializeWeeklyWorkerCommit: () => { throw new Error("unexpected delta path"); } }));
vi.mock("@/stores/actions/weeklyQuickScoutActions", () => ({ isBatchAdvanceInProgress: () => false }));
vi.mock("@/stores/actions/persistGameplayAutosave", () => ({
  flushGameplayAutosave: async () => undefined, snapshotPersistedGameState: (state: GameState) => state,
}));
vi.mock("@/stores/tutorialStore", () => ({ useTutorialStore: { getState: () => ({
  completedSequences: new Set(), visitedScreens: new Set(), dismissedHints: new Set(), discoveredFeatures: new Set(),
}) } }));
import { createWeeklyAsyncActions } from "@/stores/actions/weeklyAsyncActions";
import { revealGamePortraits } from "@/engine/players/portraits/gameIntegration";
import { createVisualIdentity } from "@/engine/players/portraits/identity";

beforeEach(() => vi.clearAllMocks());

describe("live portrait allocation during actual async weekly commit", () => {
  it("keeps the latest reservation and commits football progress after a portrait-only edit", async () => {
    const source = { seed: "career", currentSeason: 1, currentWeek: 1,
      players: { a: { id: "a", age: 17, visualIdentity: createVisualIdentity("a") } },
      unsignedYouth: {}, retiredPlayers: {}, reports: {}, observations: {}, discoveryRecords: [],
      scoutingCases: {}, alumniRecords: [], watchlist: [], scout: { id: "scout" } } as unknown as GameState;
    let store = { gameState: source, weekSimulation: { currentDay: 7 } as WeekSimulationState,
      currentScreen: "weekSimulation", isLoaded: true, isAdvancingWeek: false } as unknown as GameStoreState;
    const set: SetState = (partial) => { store = { ...store, ...(typeof partial === "function" ? partial(store) : partial) }; };
    let resolve!: (result: unknown) => void;
    mocks.run.mockReturnValue(new Promise((done) => { resolve = done; }));
    const pending = createWeeklyAsyncActions(() => store, set).advanceWeekAsync();
    const latest = revealGamePortraits(source, ["a"], "selected");
    store = { ...store, gameState: { ...latest, lastSaved: 1_000 } };
    resolve({ route: "worker", materializedCommit: {
      patch: { gameState: { ...source, currentWeek: 2 } }, tutorialCommands: [],
    }, telemetry: {} });
    await pending;
    expect(store.gameState!.currentWeek).toBe(2);
    expect(store.gameState!.playerPortraits).toEqual(latest.playerPortraits);
    expect(store.isAdvancingWeek).toBe(false);
    expect(mocks.save).toHaveBeenCalledWith(store.gameState, set);
  });
});

