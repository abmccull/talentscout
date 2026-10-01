import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FinancialRecord, GameState, Player, StaffScoutingWorkProduct } from "@/engine/core/types";
import type { GameStoreState } from "@/stores/gameStoreTypes";
import type { GetState, SetState } from "@/stores/actions/types";

vi.mock("@/stores/actions/persistGameplayAutosave", () => ({
  queueGameplayAutosave: vi.fn(),
  snapshotPersistedGameState: (state: GameState) => ({ ...state, lastSaved: 1234 }),
}));
vi.mock("@/stores/tutorialStore", () => ({
  useTutorialStore: { getState: () => ({ checkAutoAdvance: vi.fn(), completeMilestone: vi.fn() }) },
}));

import { createMatchActions } from "@/stores/actions/matchActions";
import { createFinanceActions } from "@/stores/actions/financeActions";
import { queueGameplayAutosave } from "@/stores/actions/persistGameplayAutosave";
import { createVisualIdentity } from "@/engine/players/portraits/identity";

function player(id: string): Player {
  // These paths consume identity/age only; full football fixtures belong to their own tests.
  return { id, age: 18, firstName: "Ari", lastName: id, visualIdentity: createVisualIdentity(id) } as Player;
}
function world(): GameState {
  return {
    seed: "portrait-domain-actions", currentSeason: 1, currentWeek: 2, fixtures: {},
    players: Object.fromEntries(["a", "b", "c", "d"].map((id) => [id, player(id)])),
    unsignedYouth: {}, retiredPlayers: {}, watchlist: [], reports: {}, inbox: [],
    scout: { id: "scout", fatigue: 20, careerPath: "independent" },
  } as unknown as GameState;
}
function harness(gameState = world()) {
  let store = {
    gameState, activeSession: null,
    activeMatch: { fixtureId: "match", phases: [], currentPhase: 0, focusSelections: [] },
  } as unknown as GameStoreState;
  const get: GetState = () => store;
  const set: SetState = (partial) => {
    store = { ...store, ...(typeof partial === "function" ? partial(store) : partial) };
  };
  return { get, set };
}

beforeEach(() => vi.clearAllMocks());

describe("live portrait ownership in domain actions", () => {
  it("successful match focus reserves once; another phase retains the same face without another save", () => {
    const store = harness();
    const actions = createMatchActions(store.get, store.set);
    actions.setFocus("a", "general");
    const first = store.get().gameState!;
    const binding = first.playerPortraits!.reservations["person:v1:a"]!.binding;
    expect(binding).toBeDefined();
    expect(store.get().activeMatch!.focusSelections.map((focus) => focus.playerId)).toEqual(["a"]);
    expect(Object.keys(first.playerPortraits!.reservations)).toEqual(["person:v1:a"]);
    expect(queueGameplayAutosave).toHaveBeenCalledTimes(1);
    expect(vi.mocked(queueGameplayAutosave).mock.calls[0]![0].playerPortraits).toBe(first.playerPortraits);

    store.set({ activeMatch: { ...store.get().activeMatch!, currentPhase: 1 } });
    actions.setFocus("a", "general");
    expect(store.get().activeMatch!.focusSelections[0]!.phases).toEqual([0, 1]);
    expect(store.get().gameState!.playerPortraits).toBe(first.playerPortraits);
    expect(store.get().gameState!.playerPortraits!.reservations["person:v1:a"]!.binding).toBe(binding);
    expect(queueGameplayAutosave).toHaveBeenCalledTimes(1);
  });

  it("a rejected fourth match focus consumes no portrait and queues no save", () => {
    const store = harness();
    const actions = createMatchActions(store.get, store.set);
    for (const id of ["a", "b", "c"]) actions.setFocus(id, "general");
    const before = store.get();
    const beforeLedger = before.gameState!.playerPortraits;
    vi.mocked(queueGameplayAutosave).mockClear();
    actions.setFocus("d", "general");

    expect(store.get()).toBe(before);
    expect(store.get().activeMatch!.focusSelections.map((focus) => focus.playerId)).toEqual(["a", "b", "c"]);
    expect(store.get().gameState!.playerPortraits).toBe(beforeLedger);
    expect(beforeLedger!.reservations["person:v1:d"]).toBeUndefined();
    expect(Object.keys(beforeLedger!.faceOwners)).toHaveLength(3);
    expect(queueGameplayAutosave).not.toHaveBeenCalled();
  });

  it("staff approval saves the same newly bound ledger as the live watchlist and is replay-safe", () => {
    const product: StaffScoutingWorkProduct = {
      id: "staff-a", playerId: "a", employeeId: "employee", employeeName: "Taylor Analyst",
      createdWeek: 2, createdSeason: 1, status: "awaitingReview", qualityScore: 70,
      signals: [], limitation: "Needs a first-hand look.", suggestedConviction: "investigate",
    };
    const state = world();
    state.finances = {
      staffWorkProducts: [product], retainerContracts: [], consultingContracts: [],
      employees: [], clientRelationships: [], transactions: [], reportListings: [],
      office: { tier: "home", monthlyCost: 0, qualityBonus: 0, maxEmployees: 0 },
    } as unknown as FinancialRecord;
    const store = harness(state);
    const actions = createFinanceActions(store.get, store.set);
    actions.approveStaffWorkProduct(product.id);

    const live = store.get().gameState!;
    expect(live.watchlist).toEqual(["a"]);
    expect(live.finances!.staffWorkProducts[0]!.status).toBe("approved");
    expect(live.scout.fatigue).toBe(22);
    expect(live.playerPortraits!.reservations["person:v1:a"]!.binding).toBeDefined();
    expect(queueGameplayAutosave).toHaveBeenCalledTimes(1);
    const queued = vi.mocked(queueGameplayAutosave).mock.calls[0]![0];
    expect(queued.playerPortraits).toBe(live.playerPortraits);
    expect(queued.watchlist).toBe(live.watchlist);
    expect(queued.finances).toBe(live.finances);
    actions.approveStaffWorkProduct(product.id);
    expect(store.get().gameState).toBe(live);
    expect(queueGameplayAutosave).toHaveBeenCalledTimes(1);
    expect(live.inbox.filter((entry) => entry.id === "staff-review-approved:staff-a")).toHaveLength(1);
  });
});
