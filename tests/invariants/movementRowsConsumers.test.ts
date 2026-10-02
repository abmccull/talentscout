// Preceding real-consumer proposal; codec/adapters do not exist in frozen source.
import { describe, expect, it } from "vitest";
import type { Club, GameState, LoanDeal, Player, PlayerMovementEvent } from "@/engine/core/types";
import { expandClubFinancialObligation, expandLoanDeal } from "@/engine/finance/terminalRecordArchive";
import { getLifecycleWorld, resolvePlayerMovements, withLifecycleWorld } from "@/engine/world/playerLifecycle";
import { buildCareerTimeline } from "@/components/game/career/careerScreenModel";
import { compactPlayerMovementHistory, expandPlayerMovementHistory } from "@/engine/world/movementRowsArchive";

function player(id: string): Player {
  return { id, firstName: "Alex", lastName: id, age: 22, position: "CM", clubId: "a",
    contractClubId: "a", contractExpiry: 5, wage: 1_000, currentAbility: 72,
    potentialAbility: 84, morale: 5 } as Player;
}
function club(id: string, budget = 100_000): Club {
  return { id, name: `Club ${id}`, shortName: id.toUpperCase(), leagueId: `league-${id}`,
    reputation: 55, budget, weeklyWageBudget: 6_000, scoutingBudget: 250_000,
    financialObligations: [], scoutingPhilosophy: "academyFirst", managerId: `manager-${id}`,
    playerIds: [], academyPlayerIds: [], youthAcademyRating: 12,
    loanedOutPlayerIds: [], loanedInPlayerIds: [] };
}
function fixture(): GameState {
  const historical = "historical:player:exact-long-identity-000000000000000000000000000000000";
  const playerMovementHistory: PlayerMovementEvent[] = Array.from({ length: 32 }, (_, index) => ({
    id: `move_1_1_${index}_${historical}_contractRenewal`, playerId: historical,
    type: "contractRenewal", week: 1, season: 1, contractClubId: "a", reason: "Exact old authored reason",
  }));
  const a = club("a"); a.playerIds = ["p1", "p2"];
  a.financialObligations = [{ id: "sell-on-p1", type: "sellOnClause", playerId: "p1",
    creditorClubId: "c", percentage: 10, createdWeek: 1, createdSeason: 1, status: "active" }];
  return { seed: "movement-regression", currentWeek: 6, currentSeason: 2,
    players: { p1: player("p1"), p2: player("p2") }, clubs: { a, b: club("b"), c: club("c", 50_000) },
    activeLoans: [], loanHistory: [], retiredPlayers: {}, retiredPlayerIds: [], playerMovementHistory,
    freeAgentPool: { agents: [], lastRefreshSeason: 1, totalReleasedThisSeason: 0,
      totalSignedThisSeason: 0, totalRetiredThisSeason: 0 },
  } as unknown as GameState;
}
function compactState(state: GameState): GameState {
  return { ...state, playerMovementHistory: compactPlayerMovementHistory(state.playerMovementHistory) };
}
function logicalState(state: GameState): GameState {
  return { ...state, playerMovementHistory: expandPlayerMovementHistory(state.playerMovementHistory) };
}

describe("movement collection consumer adapters", () => {
  it("retains lifecycle history length, append ordinals, cash and complete settlement IDs", () => {
    const input = fixture(); const compact = compactState(input);
    const snapshot = structuredClone(compact);
    expect(Array.isArray(compact.playerMovementHistory)).toBe(false);
    const ordinaryWorld = getLifecycleWorld(input);
    const compactWorld = getLifecycleWorld(compact);
    expect(compactWorld.playerMovementHistory).toStrictEqual(ordinaryWorld.playerMovementHistory);
    expect(compactWorld.playerMovementHistory).toHaveLength(32);
    const intents = [
      { type: "permanentTransfer" as const, playerId: "p1", fromClubId: "a", toClubId: "b",
        fee: 20_000, wage: 1_200, reason: "Exact accepted scouting consequence" },
      { type: "permanentTransfer" as const, playerId: "p2", fromClubId: "a", toClubId: "b",
        fee: 10_000, wage: 1_200 },
    ];
    const expected = resolvePlayerMovements(ordinaryWorld, intents, 6, 2);
    const actual = resolvePlayerMovements(compactWorld, intents, 6, 2);
    expect(actual).toStrictEqual(expected);
    expect(actual.applied.map(event => event.id)).toEqual([
      "move_2_6_32_p1_permanentTransfer", "move_2_6_33_p2_permanentTransfer",
    ]);
    expect(actual.rejected).toEqual([]);
    expect(actual.state.clubs.a.budget).toBe(128_000);
    expect(actual.state.clubs.b.budget).toBe(70_000);
    expect(actual.state.clubs.c.budget).toBe(52_000);
    expect(actual.applied[0].financialSettlements).toEqual([
      { type: "sellOnClause", amount: 2_000, creditorClubId: "c", obligationId: "sell-on-p1" },
    ]);
    expect(expandClubFinancialObligation(actual.state.clubs.a.financialObligations?.[0])).toMatchObject({
      id: "sell-on-p1", status: "settled",
    });
    const published = withLifecycleWorld(compact, actual.state);
    expect(logicalState(published)).toStrictEqual(logicalState(withLifecycleWorld(input, expected.state)));
    expect(expandPlayerMovementHistory(published.playerMovementHistory)).toHaveLength(34);
    const persisted = JSON.parse(JSON.stringify(published)) as GameState;
    expect(expandPlayerMovementHistory(persisted.playerMovementHistory)).toStrictEqual(actual.state.playerMovementHistory);
    const duplicated = resolvePlayerMovements(getLifecycleWorld(persisted), intents, 6, 2);
    expect(duplicated.applied).toEqual([]);
    expect(duplicated.state.clubs).toStrictEqual(actual.state.clubs);
    expect(duplicated.state.playerMovementHistory).toStrictEqual(actual.state.playerMovementHistory);
    expect(compact).toStrictEqual(snapshot);
  });

  it("keeps loan provenance and parent/borrower cash parity through compact history", () => {
    const input = fixture(); const compact = compactState(input);
    const deal: LoanDeal = { id: "loan:p1:exact-provenance", playerId: "p1", parentClubId: "a",
      loanClubId: "b", startWeek: 6, startSeason: 2, endWeek: 10, endSeason: 2,
      loanFee: 1_000, wageContribution: 50, recallClause: true, status: "active" };
    const intents = [{ type: "loanStart" as const, playerId: "p1", deal, reason: "Authored loan evidence" }];
    const expected = resolvePlayerMovements(getLifecycleWorld(input), intents, 6, 2);
    const actual = resolvePlayerMovements(getLifecycleWorld(compact), intents, 6, 2);
    expect(actual).toStrictEqual(expected);
    expect(actual.applied[0]).toMatchObject({ id: "move_2_6_32_p1_loanStart", loanDealId: deal.id });
    expect(actual.state.clubs.a.budget).toBe(101_000);
    expect(actual.state.clubs.b.budget).toBe(99_000);
    const published = withLifecycleWorld(compact, actual.state);
    const close = [{ type: "loanEnd" as const, playerId: "p1", dealId: deal.id,
      resolution: "return" as const, outcome: "neutral" as const }];
    const returned = resolvePlayerMovements(getLifecycleWorld(published), close, 10, 2);
    const control = resolvePlayerMovements(expected.state, close, 10, 2);
    expect(returned).toStrictEqual(control);
    expect(returned.applied[0]).toMatchObject({ id: "move_2_10_33_p1_loanReturn", loanDealId: deal.id });
    expect(expandLoanDeal(returned.state.loanHistory[0])).toMatchObject({ id: deal.id, status: "completed" });
  });

  it("preserves read-only public career history IDs and leaves stored history unchanged", () => {
    const input = fixture();
    input.playerMovementHistory = expandPlayerMovementHistory(input.playerMovementHistory).map((event, i) => ({
      ...event, playerId: "p1", id: `public:exact:${i}:p1:${event.id}`,
    }));
    const compact = compactState(input); const before = JSON.stringify(compact.playerMovementHistory);
    const args = { discoveryRecords: [], discoveredPlayerIds: new Set(["p1"]),
      playerFacingDiscoveryById: new Map() };
    const expected = buildCareerTimeline({ ...args, gameState: input });
    const actual = buildCareerTimeline({ ...args, gameState: compact });
    expect(actual).toStrictEqual(expected);
    expect(actual.map(event => event.id)).toStrictEqual(
      expandPlayerMovementHistory(input.playerMovementHistory).map(event => `movement-${event.id}`),
    );
    expect(JSON.stringify(compact.playerMovementHistory)).toBe(before);
  });
});
