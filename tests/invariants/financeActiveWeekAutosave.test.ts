import { describe, expect, it, vi } from "vitest";
import type { GameState } from "@/engine/core/types";
import { createFinanceActions } from "@/stores/actions/financeActions";
import { createDurableGameplaySetter } from "@/stores/actions/durableGameplayCommit";
import { queueGameplayAutosave } from "@/stores/actions/persistGameplayAutosave";
import type { GameStoreState, GetState, SetState } from "@/stores/actions/types";

vi.mock("@/stores/actions/persistGameplayAutosave", async importOriginal => ({
  ...await importOriginal<typeof import("@/stores/actions/persistGameplayAutosave")>(),
  queueGameplayAutosave: vi.fn(),
}));

describe("finance autosave retains the live itinerary", () => {
  it.each([false, true])("keeps the active week in the final explicit snapshot (durable wrapper=%s)", wrapped => {
    vi.mocked(queueGameplayAutosave).mockClear();
    const simulation = { currentDay: 2, dayResults: [], phase: "simulating", week: 3, season: 1 } as unknown as NonNullable<GameStoreState["weekSimulation"]>;
    let store = { gameState: {
      seed: "active-finance", lastSaved: 1, currentWeek: 3, currentSeason: 1, fixtures: {}, runManifest: { rootSeed: "active-finance" },
      clubs: { buyer: { id: "buyer", name: "Buyer", shortName: "BUY", reputation: 40, playerIds: [] } },
      players: {}, contacts: {}, reports: {}, inbox: [], pendingWeekRecovery: null,
      scout: { id: "scout", careerPath: "independent", reputation: 20, fatigue: 10 },
      finances: { balance: 500, actionSequence: 0, transactions: [], employees: [], retainerContracts: [], pendingRetainerOffers: [], clientRelationships: [] },
    } as unknown as GameState, weekSimulation: simulation, activeSession: null } as GameStoreState;
    const get: GetState = () => store;
    const set: SetState = partial => { store = { ...store, ...(typeof partial === "function" ? partial(store) : partial) }; };
    const actions = createFinanceActions(get, wrapped ? createDurableGameplaySetter(get, set) : set);
    actions.pitchToClient("buyer", "coldCall");
    expect(store.gameState!.finances!.balance).toBe(450);
    expect(queueGameplayAutosave).toHaveBeenCalled();
    const finalSnapshot = vi.mocked(queueGameplayAutosave).mock.calls.at(-1)![0];
    expect(finalSnapshot.pendingWeekRecovery).toEqual({ week: 3, season: 1, simulation });
    expect(store.weekSimulation).toBe(simulation);
  });
});
