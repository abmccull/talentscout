import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LoadResult } from "@/lib/saveProvider";

const provider = vi.hoisted(() => ({
  load: vi.fn(), checkConflict: vi.fn(), restoreRecoveryCopy: vi.fn(), resolveConflict: vi.fn(),
  saveState: vi.fn(async () => null), listSaves: vi.fn(async () => []),
  listRecoveryCopies: vi.fn(async () => []),
  getSyncStatus: vi.fn(async () => ({ pendingCount: 0, failedCount: 0, lastError: null, oldestQueuedAt: null })),
}));
vi.mock("@/lib/activeSaveProvider", () => ({ getActiveSaveProvider: async () => provider }));
import { migrateSaveState } from "@/lib/db";
import { useGameStore } from "@/stores/gameStore";
import { resetGameplayAutosaveWatermark } from "@/stores/actions/persistGameplayAutosave";

const fixture = JSON.parse(readFileSync(fileURLToPath(new URL("../fixtures/saves/v0-save-record.json", import.meta.url)), "utf8"));
function result(week: number): LoadResult {
  return { state: migrateSaveState({ ...fixture.state, currentWeek: week }), data: "", source: "local", name: `Week ${week}`, timestamp: week };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.clearAllMocks();
  provider.checkConflict.mockResolvedValue(null);
  resetGameplayAutosaveWatermark();
  useGameStore.getState().loadGame(result(1).state);
});
afterEach(() => {
  resetGameplayAutosaveWatermark();
  useGameStore.setState({ gameState: null, activeSession: null, activeSaveLoadId: null, isLoadingSave: false, isResolvingSaveConflict: false });
});

describe("save load ownership", () => {
  it.each(["load", "recovery", "conflict"] as const)("discards an obsolete %s response after a direct career load", async (kind) => {
    const pending = deferred<LoadResult>();
    const method = kind === "load" ? provider.load : kind === "recovery" ? provider.restoreRecoveryCopy : provider.resolveConflict;
    method.mockReturnValueOnce(pending.promise);
    const loading = kind === "load" ? useGameStore.getState().loadFromSlot(1)
      : kind === "recovery" ? useGameStore.getState().restoreSaveRecoveryCopy("archive")
      : useGameStore.getState().resolveSaveConflict(1, "local");
    await vi.waitFor(() => expect(method).toHaveBeenCalled());
    useGameStore.getState().loadGame(result(9).state);
    const latest = useGameStore.getState().gameState;
    pending.resolve(result(3));
    await loading;
    expect(useGameStore.getState().gameState).toBe(latest);
    expect(useGameStore.getState().gameState!.currentWeek).toBe(9);
    expect(useGameStore.getState().isLoadingSave).toBe(false);
    expect(useGameStore.getState().isResolvingSaveConflict).toBe(false);
  });

  it.each(["resolve", "reject"] as const)("keeps a newer recovery request locked after an older load %s", async (outcome) => {
    const old = deferred<LoadResult>();
    const latest = deferred<LoadResult>();
    provider.load.mockReturnValueOnce(old.promise);
    provider.restoreRecoveryCopy.mockReturnValueOnce(latest.promise);
    const first = useGameStore.getState().loadFromSlot(1);
    await vi.waitFor(() => expect(provider.load).toHaveBeenCalled());
    const second = useGameStore.getState().restoreSaveRecoveryCopy("newer");
    await vi.waitFor(() => expect(provider.restoreRecoveryCopy).toHaveBeenCalled());
    if (outcome === "resolve") old.resolve(result(3));
    else old.reject(new Error("Obsolete load failure"));
    await first;
    expect(useGameStore.getState().isLoadingSave).toBe(true);
    expect(useGameStore.getState().gameState!.currentWeek).toBe(1);
    latest.resolve(result(9));
    await second;
    expect(useGameStore.getState().gameState!.currentWeek).toBe(9);
    expect(useGameStore.getState().isLoadingSave).toBe(false);
  });

  it("does not display an obsolete conflict or continue its load", async () => {
    const conflict = deferred<unknown>();
    provider.checkConflict.mockReturnValueOnce(conflict.promise);
    const pending = useGameStore.getState().loadFromSlot(1);
    await vi.waitFor(() => expect(provider.checkConflict).toHaveBeenCalled());
    useGameStore.getState().loadGame(result(8).state);
    conflict.resolve({ slotName: "slot1", local: {}, cloud: {} });
    await pending;
    expect(useGameStore.getState().saveConflict).toBeNull();
    expect(provider.load).not.toHaveBeenCalled();
  });

  it("surfaces the current failure and leaves the current career retryable", async () => {
    provider.load.mockRejectedValueOnce(new Error("Unreadable save"));
    const before = useGameStore.getState().gameState;
    await expect(useGameStore.getState().loadFromSlot(1)).rejects.toThrow("Unreadable save");
    expect(useGameStore.getState().gameState).toBe(before);
    expect(useGameStore.getState().activeSaveLoadId).toBeNull();
    expect(useGameStore.getState().isLoadingSave).toBe(false);
    provider.load.mockResolvedValueOnce(result(4));
    await useGameStore.getState().loadFromSlot(1);
    expect(useGameStore.getState().gameState!.currentWeek).toBe(4);
  });
});
