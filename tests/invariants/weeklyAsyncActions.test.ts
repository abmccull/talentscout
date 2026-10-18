import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState, WeekSimulationState } from "@/engine/core/types";
import type { GameStoreState, GetState, SetState } from "@/stores/actions/types";

const mocks = vi.hoisted(() => ({
  runTransaction: vi.fn(), applyTutorialCommands: vi.fn(), queueAutosave: vi.fn(), generation: 0,
}));
vi.mock("@/lib/activeSaveProvider", () => ({ getActiveSaveProvider: async () => ({ save: async () => undefined }) }));
vi.mock("@/lib/saveProvider", () => ({ persistGameState: async () => undefined }));
vi.mock("@/lib/weeklySimulationWorkerClient", () => ({
  runWeeklyWorkerTransaction: mocks.runTransaction,
  getWeeklySimulationGeneration: () => mocks.generation,
}));
vi.mock("@/stores/actions/weeklyActions", () => ({ queueWeeklyAutosave: mocks.queueAutosave }));
vi.mock("@/stores/actions/weeklyTutorialBridge", () => ({ applyWeeklyTutorialCommands: mocks.applyTutorialCommands }));
vi.mock("@/stores/actions/weeklyQuickScoutActions", () => ({ isBatchAdvanceInProgress: () => false }));
vi.mock("@/engine/players/portraits/gameIntegration", () => ({
  preparePortraitWeekCommit: (simulated: GameState, latest: GameState) => ({ ...simulated, playerPortraits: latest.playerPortraits }),
  isPortraitOnlyStateChange: (source: GameState, current: GameState | null) => source === current,
}));
vi.mock("@/stores/tutorialStore", () => ({ useTutorialStore: { getState: () => ({
  completedSequences: new Set(), visitedScreens: new Set(), dismissedHints: new Set(), discoveredFeatures: new Set(),
}) } }));
import { createWeeklyAsyncActions } from "@/stores/actions/weeklyAsyncActions";

function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function setup(seed = "source") {
  let store = {
    gameState: { seed, currentSeason: 1, currentWeek: 1, lastSaved: 1, watchlist: [], playerPortraits: {} },
    weekSimulation: { dayResults: [], currentDay: 7, pendingWorldTick: true } as WeekSimulationState,
    activeSession: null, currentScreen: "weekSimulation", isLoaded: true, isAdvancingWeek: false,
  } as unknown as GameStoreState;
  const get: GetState = () => store;
  const set: SetState = (partial) => { store = { ...store, ...(typeof partial === "function" ? partial(store) : partial) }; };
  const actions = createWeeklyAsyncActions(get, set);
  return { get, set, actions };
}

function completed(source: GameState) {
  return {
    route: "worker", materializedCommit: {
      patch: { gameState: { ...source, currentWeek: source.currentWeek + 1, activeObservationSession: null, pendingWeekRecovery: null }, weekSimulation: null },
      tutorialCommands: [{ type: "completeMilestone", id: "advancedWeek" }],
    }, telemetry: { route: "worker", roundTripMs: 12 },
  };
}

describe("weekly async transaction ownership", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.generation = 0; });

  it("advances exactly once across a lifecycle save and preserves latest persistence and portraits", async () => {
    const { get, set, actions } = setup();
    const source = get().gameState!;
    const job = deferred();
    mocks.runTransaction.mockReturnValue(job.promise);
    const pending = actions.advanceWeekAsync();
    const portraits = { reservations: { person: "latest" } } as unknown as GameState["playerPortraits"];
    set({ gameState: { ...source, lastSaved: 500, playerPortraits: portraits,
      activeObservationSession: null,
      pendingWeekRecovery: { week: 1, season: 1, simulation: get().weekSimulation! },
    } });
    await actions.advanceWeekAsync();
    expect(mocks.runTransaction).toHaveBeenCalledTimes(1);
    job.resolve(completed(source));
    await pending;
    expect(get().gameState).toMatchObject({ currentWeek: 2, lastSaved: 500, pendingWeekRecovery: null, activeObservationSession: null });
    expect(get().gameState!.playerPortraits).toBe(portraits);
    expect(get().isAdvancingWeek).toBe(false);
    expect(get().weeklyTransactionError).toBeNull();
    expect(mocks.applyTutorialCommands).toHaveBeenCalledTimes(1);
    expect(mocks.queueAutosave).toHaveBeenCalledTimes(1);
  });

  it("retains substantive edits, releases advancement and supports a fresh retry", async () => {
    const { get, set, actions } = setup();
    const source = get().gameState!;
    const simulation = get().weekSimulation;
    const job = deferred();
    mocks.runTransaction.mockReturnValue(job.promise);
    const pending = actions.advanceWeekAsync();
    const edited = { ...source, watchlist: ["new-prospect"] } as GameState;
    set({ gameState: edited });
    job.resolve(completed(source));
    await pending;
    expect(get().gameState).toBe(edited);
    expect(get().weekSimulation).toBe(simulation);
    expect(get().isAdvancingWeek).toBe(false);
    expect(get().weeklyTransactionError).toMatch(/changed|again|retry/i);
    expect(mocks.applyTutorialCommands).not.toHaveBeenCalled();
    expect(mocks.queueAutosave).not.toHaveBeenCalled();
    mocks.runTransaction.mockResolvedValue(completed(edited));
    await actions.advanceWeekAsync();
    expect(get().gameState).toMatchObject({ currentWeek: 2, watchlist: ["new-prospect"] });
    expect(get().weeklyTransactionError).toBeNull();
    expect(mocks.applyTutorialCommands).toHaveBeenCalledTimes(1);
  });

  it("releases its own latch when the live observation or simulation is changed", async () => {
    const { get, set, actions } = setup();
    const source = get().gameState!;
    const job = deferred();
    mocks.runTransaction.mockReturnValue(job.promise);
    const pending = actions.advanceWeekAsync();
    set({ weekSimulation: { ...get().weekSimulation! } });
    job.resolve(completed(source));
    await pending;
    expect(get().gameState).toBe(source);
    expect(get().isAdvancingWeek).toBe(false);
    expect(mocks.applyTutorialCommands).not.toHaveBeenCalled();
  });

  for (const oldOutcome of ["resolved", "rejected"] as const) {
    it(`does not clear or commit over a replacement same-seed career's newer job when old work is ${oldOutcome}`, async () => {
      const { get, set, actions } = setup();
      const source = get().gameState!;
      const old = deferred();
      const fresh = deferred();
      mocks.runTransaction.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
      const oldPending = actions.advanceWeekAsync();
      mocks.generation += 1;
      const replacement = { ...source, watchlist: ["replacement"] } as GameState;
      set({ gameState: replacement, weekSimulation: { ...get().weekSimulation! }, isAdvancingWeek: false });
      const newPending = actions.advanceWeekAsync();
      if (oldOutcome === "resolved") old.resolve(completed(source));
      else old.reject(new Error("old career cancelled"));
      await oldPending;
      expect(get().gameState).toBe(replacement);
      expect(get().isAdvancingWeek).toBe(true);
      expect(mocks.applyTutorialCommands).not.toHaveBeenCalled();
      fresh.resolve(completed(replacement));
      await newPending;
      expect(get().gameState).toMatchObject({ currentWeek: 2, watchlist: ["replacement"] });
      expect(get().isAdvancingWeek).toBe(false);
      expect(mocks.applyTutorialCommands).toHaveBeenCalledTimes(1);
      expect(mocks.queueAutosave).toHaveBeenCalledTimes(1);
    });
  }

  it("shows a recoverable failure even after a substantive edit", async () => {
    const { get, set, actions } = setup();
    const job = deferred();
    mocks.runTransaction.mockReturnValue(job.promise);
    const pending = actions.advanceWeekAsync();
    const edited = { ...get().gameState!, watchlist: ["keep"] } as GameState;
    set({ gameState: edited });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    job.reject(new Error("simulation interrupted"));
    await pending;
    expect(get().gameState).toBe(edited);
    expect(get().isAdvancingWeek).toBe(false);
    expect(get().weeklyTransactionError).toMatch(/simulation interrupted/);
    log.mockRestore();
  });

  it.each(["resolved", "rejected"] as const)("releases an invalidated finance edit after worker %s and accepts a fresh retry", async (outcome) => {
    const { get, set, actions } = setup("same-career");
    const job = deferred();
    mocks.runTransaction.mockReturnValueOnce(job.promise);
    const pending = actions.advanceWeekAsync();
    const edited = { ...get().gameState!, finances: { balance: 100 } } as GameState;
    set({ gameState: edited });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      if (outcome === "resolved") job.resolve(completed(edited));
      else job.reject(new Error("Worker interrupted; retry the week"));
      await expect(pending).resolves.toBe(outcome === "resolved" ? "cancelled" : "failed");
      expect(get().gameState).toBe(edited);
      expect(get().isAdvancingWeek).toBe(false);
      expect(get().weeklyTransactionError).toMatch(/changed|again|retry/i);
      expect(mocks.applyTutorialCommands).not.toHaveBeenCalled();
      expect(mocks.queueAutosave).not.toHaveBeenCalled();
      mocks.runTransaction.mockResolvedValueOnce(completed(edited));
      await expect(actions.advanceWeekAsync()).resolves.toBe("committed");
      expect(mocks.runTransaction).toHaveBeenCalledTimes(2);
      expect(get().gameState).toMatchObject({ currentWeek: 2, finances: { balance: 100 } });
      expect(get().isAdvancingWeek).toBe(false);
      expect(get().weeklyTransactionError).toBeNull();
      expect(mocks.applyTutorialCommands).toHaveBeenCalledTimes(1);
      expect(mocks.queueAutosave).toHaveBeenCalledTimes(1);
    } finally {
      log.mockRestore();
    }
  });

  it.each(["resolved", "rejected"] as const)("does not unlock a newer invocation over the identical football state when old work is %s", async (outcome) => {
    const { get, set, actions } = setup("same-career");
    const source = get().gameState!;
    const old = deferred();
    const fresh = deferred();
    mocks.runTransaction.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const oldPending = actions.advanceWeekAsync();
    // A restore can retire an operation without changing the football snapshot.
    set({ isAdvancingWeek: false });
    const newPending = actions.advanceWeekAsync();
    if (outcome === "resolved") old.resolve(completed(source));
    else old.reject(new Error("old invocation interrupted"));
    await expect(oldPending).resolves.toBe("cancelled");
    expect(get().gameState).toBe(source);
    expect(get().isAdvancingWeek).toBe(true);
    expect(mocks.applyTutorialCommands).not.toHaveBeenCalled();
    expect(mocks.queueAutosave).not.toHaveBeenCalled();
    fresh.resolve(completed(source));
    await expect(newPending).resolves.toBe("committed");
    expect(get().gameState!.currentWeek).toBe(2);
    expect(get().isAdvancingWeek).toBe(false);
    expect(mocks.applyTutorialCommands).toHaveBeenCalledTimes(1);
    expect(mocks.queueAutosave).toHaveBeenCalledTimes(1);
  });

  it("discards a worker result after the active save is replaced without a new invocation", async () => {
    const { get, set, actions } = setup();
    const source = get().gameState!;
    const job = deferred();
    mocks.runTransaction.mockReturnValueOnce(job.promise);
    const pending = actions.advanceWeekAsync();
    const replacement = { ...source, seed: "replacement", currentSeason: 4, currentWeek: 9 };
    mocks.generation += 1;
    set({ gameState: replacement, weekSimulation: null, isAdvancingWeek: false });
    job.resolve(completed(source));
    await expect(pending).resolves.toBe("cancelled");
    expect(get().gameState).toBe(replacement);
    expect(get().weekSimulation).toBeNull();
    expect(get().isAdvancingWeek).toBe(false);
    expect(mocks.applyTutorialCommands).not.toHaveBeenCalled();
    expect(mocks.queueAutosave).not.toHaveBeenCalled();
  });
});
