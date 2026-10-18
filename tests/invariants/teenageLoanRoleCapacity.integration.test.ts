import "fake-indexeddb/auto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FreeAgent, GameState, LoanDeal, Player } from "@/engine/core/types";
import { getClubWeeklyCommitmentTotal, normalizeClubEconomicsMap } from "@/engine/finance/clubEconomics";
import { expandClubFinancialObligation } from "@/engine/finance/terminalRecordArchive";
import { createVisualIdentity } from "@/engine/players/portraits/identity";
import { getLifecycleWorld, resolvePlayerMovements, withLifecycleWorld } from "@/engine/world/playerLifecycle";
import type { PlayerMovementIntent } from "@/engine/world/playerLifecycle";
import { deleteSave, loadGame, saveGameWithResult } from "@/lib/db";
import { CURRENT_SAVE_SCHEMA_VERSION } from "@/lib/saveEnvelope";

vi.mock("@/lib/activeSaveProvider", () => ({
  getActiveSaveProvider: async () => ({ save: async () => undefined }),
  isSupabaseCloudSaveActive: async () => false,
}));

let generated: GameState;
let hostId: string, parentId: string;
const SLOT = 3;
beforeAll(async () => {
  const { useGameStore } = await import("@/stores/gameStore");
  await useGameStore.getState().startNewGame({
    scoutFirstName: "Loan", scoutLastName: "Registration", scoutAge: 28,
    specialization: "youth", difficulty: "normal", worldSeed: "teen-loan-before-correction",
    selectedCountries: ["england"], startingCountry: "england", nationality: "English",
    skillAllocations: { technicalEye: 2, psychologicalRead: 2, playerJudgment: 2, potentialAssessment: 2 },
    originId: "academy-apprentice", flawId: "fragile-network", doctrineIds: ["evidence-first"],
  });
  generated = useGameStore.getState().gameState!;
  [hostId, parentId] = Object.keys(generated.clubs).slice(0, 2);
  await deleteSave(SLOT);
}, 60_000);
afterAll(async () => { await deleteSave(SLOT); });

function world(position: "GK" | "CB", age: number) {
  const state = structuredClone(generated);
  const template = Object.values(state.players).find(player => player.age >= 18)!;
  state.clubs = Object.fromEntries([hostId, parentId].map(id => [id, {
    ...state.clubs[id], playerIds: [], academyPlayerIds: [], loanedInPlayerIds: [], loanedOutPlayerIds: [],
    budget: 100_000, weeklyWageBudget: 100_000, financialObligations: [],
  }]));
  state.players = {};
  const member = (id: string, clubId: string, memberPosition: Player["position"]) => {
    state.players[id] = { ...template, id, visualIdentity: createVisualIdentity(id),
      clubId, contractClubId: clubId, loanParentClubId: undefined, onLoan: undefined,
      position: memberPosition, age: 24, wage: 500, contractExpiry: 5, injured: false, injuryWeeksRemaining: 0 };
    state.clubs[clubId].playerIds.push(id);
  };
  for (let index = 0; index < (position === "GK" ? 18 : 9); index++) member(`host-outfield-${index}`, hostId, "CM");
  if (position === "CB") member("host-keeper", hostId, "GK");
  for (let index = 0; index < 18; index++) member(`parent-outfield-${index}`, parentId, "CM");
  member("parent-first-keeper", parentId, "GK");
  member("teen-loan", parentId, position);
  state.players["teen-loan"] = { ...state.players["teen-loan"], age, wage: 1_000 };
  state.clubs[hostId].weeklyWageBudget = state.clubs[hostId].playerIds.length * 500 + 1_000;
  state.freeAgentPool = { ...state.freeAgentPool, agents: [], totalSignedThisSeason: 0 };
  state.activeLoans = []; state.loanHistory = []; state.playerMovementHistory = [];
  state.currentWeek = 1; state.currentSeason = 2;
  // Compare refused moves with the same normalized finance facts used by the resolver.
  state.clubs = normalizeClubEconomicsMap(state.clubs, state.players, { currentWeek: 1, currentSeason: 2 });
  const deal: LoanDeal = { id: `teen-loan-${position}-${age}`, playerId: "teen-loan", parentClubId: parentId,
    loanClubId: hostId, startWeek: 1, startSeason: 2, endWeek: 20, endSeason: 2,
    loanFee: 500, wageContribution: 50, recallClause: false, status: "active" };
  return { state, deal };
}

describe("real teenage loan senior-registration capacity before route correction", () => {
  it.each([[16, "GK"], [17, "GK"], [16, "CB"], [17, "CB"], [18, "GK"]] as const)(
    "settles and persists actual senior %s-year-old %s cover without a phantom vacancy", async (age, position) => {
      const { state, deal } = world(position, age);
      const before = JSON.stringify(state);
      const parentPayroll = getClubWeeklyCommitmentTotal(state.clubs[parentId], state.players);
      const commitment = getClubWeeklyCommitmentTotal(state.clubs[hostId], state.players);
      const resolution = resolvePlayerMovements(getLifecycleWorld(state), [{ type: "loanStart",
        playerId: "teen-loan", deal, preserveSquadWageReserve: true }], 1, 2, 46);
      expect(resolution.rejected).toEqual([]);
      expect(resolution.applied).toHaveLength(1);
      const accepted = withLifecycleWorld(state, resolution.state);
      expect(accepted.players["teen-loan"]).toMatchObject({ clubId: hostId, contractClubId: parentId,
        loanParentClubId: parentId, onLoan: true, wage: 1_000, age });
      expect(accepted.clubs[hostId].playerIds).toContain("teen-loan");
      expect(accepted.clubs[hostId].academyPlayerIds).not.toContain("teen-loan");
      expect(getClubWeeklyCommitmentTotal(accepted.clubs[hostId], accepted.players)).toBe(commitment + 500);
      expect(getClubWeeklyCommitmentTotal(accepted.clubs[parentId], accepted.players)).toBe(parentPayroll);
      expect(accepted.clubs[hostId].weeklyWageBudget! - commitment - 500).toBe(500);
      expect(accepted.clubs[hostId].budget).toBe(99_500);
      expect(accepted.clubs[parentId].budget).toBe(100_500);
      expect(accepted.clubs[hostId].financialObligations?.map(expandClubFinancialObligation)).toEqual([
        expect.objectContaining({ playerId: "teen-loan", weeklyAmount: 500, status: "active" }),
      ]);
      expect(JSON.stringify(state)).toBe(before);
      const saved = await saveGameWithResult(SLOT, "Teenage senior loan integration", accepted);
      expect(saved.wrote).toBe(true);
      expect(saved.record.slot).toBe(SLOT);
      expect(saved.record.schemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
      const loaded = (await loadGame(SLOT))!;
      expect(loaded.players["teen-loan"]).toMatchObject({ clubId: hostId, contractClubId: parentId,
        loanParentClubId: parentId, onLoan: true, wage: 1_000, age });
      expect(loaded.clubs[hostId].playerIds).toContain("teen-loan");
      expect(loaded.clubs[hostId].academyPlayerIds).not.toContain("teen-loan");
      expect(loaded.clubs[hostId].weeklyWageBudget).toBe(accepted.clubs[hostId].weeklyWageBudget);
      expect(loaded.clubs[hostId].budget).toBe(99_500);
      expect(loaded.clubs[parentId].budget).toBe(100_500);
      expect(getClubWeeklyCommitmentTotal(loaded.clubs[hostId], loaded.players)).toBe(commitment + 500);
      expect(getClubWeeklyCommitmentTotal(loaded.clubs[parentId], loaded.players)).toBe(parentPayroll);
      expect(loaded.clubs[hostId].financialObligations?.map(expandClubFinancialObligation)).toEqual([
        expect.objectContaining({ playerId: "teen-loan", weeklyAmount: 500, status: "active" }),
      ]);
      for (const id of [hostId, parentId]) {
        expect(accepted.clubs[id].recruitmentAllocation).toEqual(state.clubs[id].recruitmentAllocation);
        expect(loaded.clubs[id].recruitmentAllocation).toEqual(state.clubs[id].recruitmentAllocation);
      }
      expect(loaded.activeLoans).toEqual(accepted.activeLoans);
    }, 60_000,
  );

  it("retains the ordinary age15 loan refusal and unchanged source facts", () => {
    const { state, deal } = world("GK", 15);
    const before = JSON.stringify(state);
    const resolution = resolvePlayerMovements(getLifecycleWorld(state), [{ type: "loanStart",
      playerId: "teen-loan", deal, preserveSquadWageReserve: true }], 1, 2, 46);
    expect(resolution.applied).toEqual([]);
    expect(resolution.rejected).toHaveLength(1);
    expect(resolution.state.clubs[hostId].budget).toBe(100_000);
    expect(resolution.state.players["teen-loan"].clubId).toBe(parentId);
    expect(JSON.stringify(state)).toBe(before);
  });

  it.each((["freeAgentSigning", "youthSigning", "permanentTransfer"] as const).flatMap(type =>
    ([16, 17] as const).flatMap(age => [false, true].map(funded => ({ type, age, funded }))),
  ))("preserves actual academy registration for $type age$age with funded=$funded", async ({ type, age, funded }) => {
    const { state } = world("GK", age);
    if (funded) state.clubs[hostId].weeklyWageBudget! += 500;
    if (type !== "permanentTransfer") {
      state.players["teen-loan"] = { ...state.players["teen-loan"], clubId: "", contractClubId: undefined };
      state.clubs[parentId].playerIds = state.clubs[parentId].playerIds.filter(id => id !== "teen-loan");
      state.freeAgentPool.agents = [{ playerId: "teen-loan", country: "england", releasedFrom: parentId,
        releasedSeason: 1, weeksInPool: 0, maxWeeksInPool: 100, wageExpectation: 500, signingBonusExpectation: 500,
        discoverySource: null, discoveredByScout: false, npcInterest: [], status: "available" } satisfies FreeAgent];
    }
    const intent: PlayerMovementIntent = type === "permanentTransfer"
      ? { type, playerId: "teen-loan", fromClubId: parentId, toClubId: hostId, fee: 500,
          wage: 500, contractLength: 3, preserveSquadWageReserve: true }
      : type === "freeAgentSigning"
        ? { type, playerId: "teen-loan", toClubId: hostId, wage: 500, signingBonus: 500,
            contractLength: 3, preserveSquadWageReserve: true }
        : { type, playerId: "teen-loan", toClubId: hostId, wage: 500,
            contractLength: 3, preserveSquadWageReserve: true };
    const before = JSON.stringify(state);
    const resolution = resolvePlayerMovements(getLifecycleWorld(state), [intent], 1, 2, 46);
    expect(JSON.stringify(state)).toBe(before);
    if (!funded) {
      expect(resolution.applied).toEqual([]);
      expect(resolution.rejected).toHaveLength(1);
      expect(resolution.rejected[0].reason).toContain("squad completion wage reserve");
      expect(resolution.state.players["teen-loan"]).toEqual(state.players["teen-loan"]);
      expect(resolution.state.clubs[hostId]).toEqual(state.clubs[hostId]);
      expect(resolution.state.clubs[parentId]).toEqual(state.clubs[parentId]);
      return;
    }
    expect(resolution.rejected).toEqual([]);
    expect(resolution.applied).toHaveLength(1);
    const accepted = withLifecycleWorld(state, resolution.state);
    expect(accepted.clubs[hostId].academyPlayerIds).toContain("teen-loan");
    expect(accepted.clubs[hostId].playerIds).not.toContain("teen-loan");
    expect(accepted.players["teen-loan"]).toMatchObject({ age, clubId: hostId, contractClubId: hostId, wage: 500 });
    const saved = await saveGameWithResult(SLOT, "Academy registration integration", accepted);
    expect(saved.wrote).toBe(true);
    const loaded = (await loadGame(SLOT))!;
    expect(loaded.clubs[hostId].academyPlayerIds).toContain("teen-loan");
    expect(loaded.clubs[hostId].playerIds).not.toContain("teen-loan");
    expect(loaded.players["teen-loan"]).toMatchObject({ age, clubId: hostId, contractClubId: hostId, wage: 500 });
    expect(loaded.clubs[hostId].weeklyWageBudget).toBe(state.clubs[hostId].weeklyWageBudget);
    expect(getClubWeeklyCommitmentTotal(loaded.clubs[hostId], loaded.players)).toBe(9_500);
  });
});
