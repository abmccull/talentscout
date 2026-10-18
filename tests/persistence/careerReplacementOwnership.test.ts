import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState } from "@/engine/core/types";

const provider = vi.hoisted(() => ({ checkConflict: vi.fn(), load: vi.fn(), restoreRecoveryCopy: vi.fn(), resolveConflict: vi.fn() }));
vi.mock("@/lib/activeSaveProvider", () => ({ getActiveSaveProvider: async () => provider }));
vi.mock("@/lib/weeklySimulationWorkerClient", () => ({ terminateWeeklySimulationWorker: vi.fn(), warmWeeklySimulationWorker: vi.fn(), getWeeklySimulationGeneration: () => 0 }));
vi.mock("@/stores/actions/persistGameplayAutosave", () => ({ resetGameplayAutosaveWatermark: () => false, queueGameplayAutosave: vi.fn(), queueWeeklyAutosave: vi.fn(), flushGameplayAutosave: vi.fn(), snapshotPersistedGameState: (s: unknown) => s }));
import { useGameStore } from "@/stores/gameStore";

const raw = JSON.parse(readFileSync(new URL("../fixtures/saves/v0-save-record.json", import.meta.url), "utf8")).state;
function deferred<T>() { let resolve!: (value:T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return {promise, resolve}; }
function result(state: GameState) { return { source: "local", state, data: "" }; }

describe("career replacement ownership scenarios", () => {
  beforeEach(() => { vi.clearAllMocks(); useGameStore.getState().dismissSaveConflict(); useGameStore.getState().loadGame(raw); provider.checkConflict.mockResolvedValue(null); });
  afterEach(() => { useGameStore.getState().dismissSaveConflict(); });
  it("closing the dialog cancels a delayed slot load", async () => {
    const read = deferred<ReturnType<typeof result>>(); provider.load.mockReturnValue(read.promise);
    const source = useGameStore.getState().gameState!;
    const pending = useGameStore.getState().loadFromSlot(1); await vi.waitFor(() => expect(provider.load).toHaveBeenCalled());
    useGameStore.getState().dismissSaveConflict();
    read.resolve(result({...source, currentWeek: 9})); await pending;
    expect(useGameStore.getState().gameState).toBe(source);
    expect(useGameStore.getState().isLoadingSave).toBe(false);
  });
  it("a gameplay edit survives delayed load completion", async () => {
    const read = deferred<ReturnType<typeof result>>(); provider.load.mockReturnValue(read.promise);
    const source = useGameStore.getState().gameState!;
    const pending = useGameStore.getState().loadFromSlot(1); await vi.waitFor(() => expect(provider.load).toHaveBeenCalled());
    const edited = {...source, watchlist: ["keep-my-edit"]}; useGameStore.setState({gameState: edited});
    read.resolve(result(source)); await pending;
    expect(useGameStore.getState().gameState).toBe(edited);
    expect(useGameStore.getState().isLoadingSave).toBe(false);
  });
  it("an abandoned conflict check cannot publish a stale dialog or clear a newer load", async () => {
    const first = deferred<null>(); const second = deferred<null>();
    provider.checkConflict.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise); provider.load.mockResolvedValue(null);
    const old = useGameStore.getState().loadFromSlot(1); await vi.waitFor(() => expect(provider.checkConflict).toHaveBeenCalledTimes(1));
    const fresh = useGameStore.getState().loadFromSlot(2); await vi.waitFor(() => expect(provider.checkConflict).toHaveBeenCalledTimes(2));
    first.resolve(null); await old;
    expect(useGameStore.getState().isLoadingSave).toBe(true);
    expect(provider.load).not.toHaveBeenCalled();
    second.resolve(null); await fresh;
    expect(useGameStore.getState().isLoadingSave).toBe(false);
  });
  for (const kind of ["recovery", "conflict"] as const) it(`direct replacement cancels a pending ${kind} load`, async () => {
    const read = deferred<ReturnType<typeof result>>();
    provider.restoreRecoveryCopy.mockReturnValue(read.promise); provider.resolveConflict.mockReturnValue(read.promise);
    const source = useGameStore.getState().gameState!;
    const pending = kind === "recovery" ? useGameStore.getState().restoreSaveRecoveryCopy("archive") : useGameStore.getState().resolveSaveConflict(1,"local");
    await vi.waitFor(() => expect(kind === "recovery" ? provider.restoreRecoveryCopy : provider.resolveConflict).toHaveBeenCalled());
    useGameStore.getState().loadGame({...source,currentWeek: 12}); const replacement = useGameStore.getState().gameState;
    read.resolve(result(source)); await pending;
    expect(useGameStore.getState().gameState).toBe(replacement);
    expect(useGameStore.getState().isLoadingSave).toBe(false);
    expect(useGameStore.getState().isResolvingSaveConflict).toBe(false);
  });
});

