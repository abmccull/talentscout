import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameState } from "@/engine/core/types";
import type { SetState } from "@/stores/actions/types";

const persistGameState = vi.fn(
  async (
    _provider: unknown,
    _slot: string,
    _state: GameState,
    _name: string,
  ) => undefined,
);

vi.mock("@/lib/activeSaveProvider", () => ({
  getActiveSaveProvider: async () => ({ save: async () => undefined }),
}));
vi.mock("@/lib/saveProvider", () => ({
  persistGameState: (
    provider: unknown,
    slot: string,
    state: GameState,
    name: string,
  ) => persistGameState(provider, slot, state, name),
}));

import {
  flushGameplayAutosave,
  queueGameplayAutosave,
  resetGameplayAutosaveWatermark,
  snapshotPersistedGameState,
} from "@/stores/actions/persistGameplayAutosave";

afterEach(() => {
  persistGameState.mockReset();
  persistGameState.mockResolvedValue(undefined);
  resetGameplayAutosaveWatermark();
  vi.useRealTimers();
});

describe("opening-loop autosave snapshot", () => {
  it("persists newer gameplay after the system clock moves backwards", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000);
    const set = vi.fn();
    const first = snapshotPersistedGameState({ currentWeek: 1, lastSaved: 0, watchlist: [] } as unknown as GameState);
    await flushGameplayAutosave(first, set);
    vi.setSystemTime(1_000);
    const latest = snapshotPersistedGameState({ ...first, watchlist: ["latest-edit"] });
    await flushGameplayAutosave(latest, set);
    expect(latest.lastSaved).toBeGreaterThan(first.lastSaved);
    expect(persistGameState).toHaveBeenCalledTimes(2);
    expect(persistGameState).toHaveBeenLastCalledWith(expect.anything(), "autosave", latest, "Autosave");
  });

  it("uses a loaded career's future timestamp but resets it for a fresh career", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const set = vi.fn();
    const loaded = snapshotPersistedGameState({ currentWeek: 8, lastSaved: 50_000 } as GameState);
    expect(loaded.lastSaved).toBeGreaterThan(50_000);
    await flushGameplayAutosave(loaded, set);
    resetGameplayAutosaveWatermark();
    const fresh = snapshotPersistedGameState({ currentWeek: 1, lastSaved: 0 } as GameState);
    expect(fresh.lastSaved).toBe(1_000);
    await flushGameplayAutosave(fresh, set);
    expect(persistGameState).toHaveBeenLastCalledWith(expect.anything(), "autosave", fresh, "Autosave");
  });

  it("clears a persisted session when the live session is explicitly null", () => {
    const session = { id: "old-session", state: "briefing" } as unknown as GameState["activeObservationSession"];
    const state = { activeObservationSession: session } as GameState;
    expect(snapshotPersistedGameState(state, null).activeObservationSession).toBeNull();
    expect(snapshotPersistedGameState(state).activeObservationSession).toBe(session);
  });

  it("embeds the live observation session so a quit can resume the hook", () => {
    const state = {
      currentWeek: 1,
      currentSeason: 1,
      activeObservationSession: null,
    } as GameState;
    const session = {
      id: "opening-session",
      state: "briefing",
    } as unknown as GameState["activeObservationSession"];
    const snapshot = snapshotPersistedGameState(state, session);
    expect(snapshot.activeObservationSession).toEqual(session);
    expect(snapshot.lastSaved).toBeGreaterThan(0);
  });
});

describe("opening-loop autosave queue", () => {
  it("stamps a completed week's older timestamp after its newer checkpoint", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000);
    const set = vi.fn();
    const source = { currentWeek: 1, lastSaved: 100, activeObservationSession: null } as GameState;
    const checkpoint = snapshotPersistedGameState(source);
    await flushGameplayAutosave(checkpoint, set);
    vi.setSystemTime(1_000);
    const completedWeek = { ...source, currentWeek: 2 };
    queueGameplayAutosave(completedWeek, set);
    await vi.runAllTimersAsync();
    expect(persistGameState).toHaveBeenCalledTimes(2);
    const saved = persistGameState.mock.calls[1][2];
    expect(saved.currentWeek).toBe(2);
    expect(saved.lastSaved).toBeGreaterThan(checkpoint.lastSaved);
    expect(saved.activeObservationSession).toBeNull();
    expect(completedWeek.lastSaved).toBe(100);
  });

  it("discards an old career's delayed request after its generation changes", async () => {
    vi.useFakeTimers();
    const oldSet = vi.fn() as unknown as SetState;
    const oldState = { currentWeek: 9, lastSaved: 90 } as GameState;
    queueGameplayAutosave(oldState, oldSet);
    expect(resetGameplayAutosaveWatermark()).toBe(true);
    await vi.runAllTimersAsync();
    expect(persistGameState).not.toHaveBeenCalled();
  });

  it("keeps the replacement career last when an old write is already in flight", async () => {
    vi.useFakeTimers();
    let finishOld!: () => void;
    const oldWrite = new Promise<void>((resolve) => { finishOld = resolve; });
    let stored: GameState | null = null;
    persistGameState.mockImplementationOnce(async (_provider, _slot, state) => {
      await oldWrite;
      stored = state;
      return undefined;
    });
    persistGameState.mockImplementationOnce(async (_provider, _slot, state) => {
      stored = state;
      return undefined;
    });
    const oldSet = vi.fn();
    const nextSet = vi.fn();
    const oldState = { currentWeek: 9, lastSaved: 900 } as GameState;
    const nextState = { currentWeek: 1, lastSaved: 10 } as GameState;
    queueGameplayAutosave(oldState, oldSet);
    await vi.advanceTimersByTimeAsync(400);
    expect(persistGameState).toHaveBeenCalledTimes(1);
    expect(resetGameplayAutosaveWatermark()).toBe(true);
    oldSet.mockClear();
    const replacementFlush = flushGameplayAutosave(nextState, nextSet);
    expect(persistGameState).toHaveBeenCalledTimes(1);
    finishOld();
    await replacementFlush;
    expect(persistGameState).toHaveBeenCalledTimes(2);
    expect(stored).toBe(nextState);
    expect(oldSet).not.toHaveBeenCalled();
    expect(resetGameplayAutosaveWatermark()).toBe(false);
  });

  it("does not surface an old career's late failure on the replacement career", async () => {
    vi.useFakeTimers();
    let rejectOld!: (error: Error) => void;
    const oldWrite = new Promise<undefined>((_resolve, reject) => { rejectOld = reject; });
    persistGameState.mockImplementationOnce(() => oldWrite);
    const oldSet = vi.fn();
    const nextSet = vi.fn();
    queueGameplayAutosave({ currentWeek: 9, lastSaved: 90 } as GameState, oldSet);
    await vi.advanceTimersByTimeAsync(400);
    resetGameplayAutosaveWatermark();
    oldSet.mockClear();
    const replacementFlush = flushGameplayAutosave({ currentWeek: 1, lastSaved: 10 } as GameState, nextSet);
    rejectOld(new Error("Old career write failed"));
    await expect(replacementFlush).resolves.toBeUndefined();
    expect(oldSet).not.toHaveBeenCalled();
    expect(nextSet).toHaveBeenLastCalledWith({ autosaveError: null });
  });

  it("persists the newest career snapshot after paint", async () => {
    vi.useFakeTimers();
    const set = vi.fn() as unknown as SetState;
    const first = { currentWeek: 1, lastSaved: 1 } as GameState;
    const second = { currentWeek: 2, lastSaved: 2 } as GameState;

    queueGameplayAutosave(first, set);
    queueGameplayAutosave(second, set);
    await vi.runAllTimersAsync();

    expect(persistGameState).toHaveBeenCalledTimes(1);
    expect(persistGameState).toHaveBeenCalledWith(
      expect.anything(),
      "autosave",
      expect.objectContaining({ currentWeek: 2, lastSaved: expect.any(Number) }),
      "Autosave",
    );
  });

  it("flushes immediately on quit and ignores a stale older snapshot", async () => {
    const set = vi.fn() as unknown as SetState;
    const older = { currentWeek: 1, lastSaved: 10 } as GameState;
    const newer = { currentWeek: 1, lastSaved: 20 } as GameState;

    await flushGameplayAutosave(newer, set);
    await flushGameplayAutosave(older, set);

    expect(persistGameState).toHaveBeenCalledTimes(1);
    expect(persistGameState).toHaveBeenCalledWith(
      expect.anything(),
      "autosave",
      newer,
      "Autosave",
    );
    expect(set).toHaveBeenCalledWith({ autosaveError: null });
  });
});
