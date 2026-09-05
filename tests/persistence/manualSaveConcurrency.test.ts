import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState } from "@/engine/core/types";

const provider = vi.hoisted(() => ({
  saveState: vi.fn(async () => null),
  listSaves: vi.fn(async () => []),
  listRecoveryCopies: vi.fn(async () => []),
  getSyncStatus: vi.fn(async () => ({ pendingCount: 0, failedCount: 0, lastError: null, oldestQueuedAt: null })),
}));
vi.mock("@/lib/activeSaveProvider", () => ({ getActiveSaveProvider: async () => provider }));

import { migrateSaveState } from "@/lib/db";
import { useGameStore } from "@/stores/gameStore";
import { queueGameplayAutosave, resetGameplayAutosaveWatermark } from "@/stores/actions/persistGameplayAutosave";

const goldenPath = fileURLToPath(new URL("../fixtures/saves/v0-save-record.json", import.meta.url));
function career(week = 1): GameState {
  const fixture = JSON.parse(readFileSync(goldenPath, "utf8")) as { state: Record<string, unknown> };
  return migrateSaveState({ ...fixture.state, currentWeek: week });
}
function delaySave() {
  let resolve!: () => void;
  const pending = new Promise<void>((done) => { resolve = done; });
  provider.saveState.mockImplementationOnce(async () => { await pending; return null; });
  return resolve;
}

beforeEach(() => {
  provider.saveState.mockReset();
  provider.saveState.mockResolvedValue(null);
  resetGameplayAutosaveWatermark();
  useGameStore.setState({ gameState: career(), activeSession: null, isSaving: false, autosaveError: null });
});
afterEach(() => {
  resetGameplayAutosaveWatermark();
  useGameStore.setState({ gameState: null, activeSession: null, isSaving: false, isLoaded: false });
  vi.useRealTimers();
});

describe("manual save concurrency", () => {
  it("preserves edits made while the captured snapshot is being saved", async () => {
    const release = delaySave();
    const saving = useGameStore.getState().saveToSlot(1, "Before edit");
    const updated = { ...useGameStore.getState().gameState!, watchlist: ["new-watchlist-player"] };
    useGameStore.setState({ gameState: updated });
    release();
    await saving;
    expect(useGameStore.getState().gameState).toBe(updated);
    expect(useGameStore.getState().isSaving).toBe(false);
  });

  it("does not restore career A after career B loads during the save", async () => {
    const release = delaySave();
    const saving = useGameStore.getState().saveToSlot(1, "Career A");
    const otherCareer = career(7);
    otherCareer.scout.firstName = "Different";
    useGameStore.getState().loadGame(otherCareer);
    const loaded = useGameStore.getState().gameState;
    release();
    await saving;
    expect(useGameStore.getState().gameState).toBe(loaded);
    expect(useGameStore.getState().gameState?.scout.firstName).toBe("Different");
  });

  it("updates only save metadata if the captured gameplay is still current", async () => {
    const before = useGameStore.getState().gameState!;
    await useGameStore.getState().saveToSlot(1, "Current career");
    const after = useGameStore.getState().gameState!;
    expect(after).toEqual({ ...before, lastSaved: after.lastSaved });
    expect(after.lastSaved).toBeGreaterThan(0);
  });

  it("keeps the current game intact and unlocks retry after persistence rejects", async () => {
    const before = useGameStore.getState().gameState;
    provider.saveState.mockRejectedValueOnce(new Error("Storage is full"));
    await expect(useGameStore.getState().saveToSlot(1, "Retry me")).rejects.toThrow("Storage is full");
    expect(useGameStore.getState().gameState).toBe(before);
    expect(useGameStore.getState().isSaving).toBe(false);
    await expect(useGameStore.getState().saveToSlot(1, "Retry me")).resolves.toBeUndefined();
  });
});

describe("load autosave lifecycle", () => {
  it("replaces a pending old-career autosave with the successfully loaded career", async () => {
    vi.useFakeTimers();
    const before = useGameStore.getState().gameState!;
    queueGameplayAutosave(before, useGameStore.setState);
    useGameStore.getState().loadGame(career(7));
    await vi.runAllTimersAsync();
    expect(provider.saveState).toHaveBeenCalledTimes(1);
    expect(provider.saveState).toHaveBeenCalledWith("autosave", expect.objectContaining({ currentWeek: 7 }), "Autosave", undefined);
  });

  it("does not invalidate the current autosave when an attempted load is invalid", async () => {
    vi.useFakeTimers();
    const before = useGameStore.getState().gameState!;
    queueGameplayAutosave(before, useGameStore.setState);
    expect(() => useGameStore.getState().loadGame({ currentWeek: 1, currentSeason: 1, scout: null })).toThrow();
    await vi.runAllTimersAsync();
    expect(provider.saveState).toHaveBeenCalledTimes(1);
    expect(provider.saveState).toHaveBeenCalledWith("autosave", expect.objectContaining({ ...before, lastSaved: expect.any(Number) }), "Autosave", undefined);
    expect(useGameStore.getState().gameState).toBe(before);
  });
});
