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
  snapshotPersistedGameState,
} from "@/stores/actions/persistGameplayAutosave";

afterEach(() => {
  persistGameState.mockClear();
  vi.useRealTimers();
});

describe("opening-loop autosave snapshot", () => {
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
  it("persists the newest career snapshot after paint", async () => {
    vi.useFakeTimers();
    const set = vi.fn() as unknown as SetState;
    const first = { currentWeek: 1, lastSaved: 1 } as GameState;
    const second = { currentWeek: 1, lastSaved: 2 } as GameState;

    queueGameplayAutosave(first, set);
    queueGameplayAutosave(second, set);
    await vi.runAllTimersAsync();

    expect(persistGameState).toHaveBeenCalledTimes(1);
    expect(persistGameState).toHaveBeenCalledWith(
      expect.anything(),
      "autosave",
      second,
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
