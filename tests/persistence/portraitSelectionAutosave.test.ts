import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState } from "@/engine/core/types";
import type { GameStoreState, SetState } from "@/stores/actions/types";

vi.mock("@/stores/actions/persistGameplayAutosave", () => ({
  queueGameplayAutosave: vi.fn(),
  snapshotPersistedGameState: (state: GameState) => state,
}));
vi.mock("@/lib/steam/richPresence", () => ({ updateRichPresence: vi.fn() }));
import { createNavigationActions } from "@/stores/actions/navigationActions";
import { queueGameplayAutosave } from "@/stores/actions/persistGameplayAutosave";
import { createVisualIdentity } from "@/engine/players/portraits/identity";

beforeEach(() => vi.clearAllMocks());

describe("portrait reservation in the actual selection action", () => {
  it("persists first selection once and retains the same identity across repeated selection", () => {
    const p = { id: "a", age: 17, visualIdentity: createVisualIdentity("a") };
    let store = { gameState: { seed: "career", currentSeason: 1, currentWeek: 1, players: { a: p },
      unsignedYouth: {}, retiredPlayers: {} }, activeSession: null } as unknown as GameStoreState;
    const set: SetState = (partial) => { store = { ...store, ...(typeof partial === "function" ? partial(store) : partial) }; };
    const actions = createNavigationActions(() => store, set);
    actions.selectPlayer("a");
    const ledger = store.gameState!.playerPortraits;
    expect(ledger!.reservations["person:v1:a"]!.identity).toEqual(p.visualIdentity);
    expect(queueGameplayAutosave).toHaveBeenCalledTimes(1);
    actions.selectPlayer("a");
    expect(store.gameState!.playerPortraits).toBe(ledger);
    expect(queueGameplayAutosave).toHaveBeenCalledTimes(1);
    actions.selectPlayer(null);
    expect(store.gameState!.playerPortraits).toBe(ledger);
  });
});

