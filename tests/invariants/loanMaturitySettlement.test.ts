import { describe, expect, it } from "vitest";
import type { Club, GameState, LoanDeal, Player } from "@/engine/core/types";
import { generatePlayer } from "@/engine/players/generation";
import { RNG } from "@/engine/rng";
import { processLoanReturns } from "@/engine/world/loans";
import { resolvePlayerMovements, type LifecycleWorldState, type PlayerMovementIntent } from "@/engine/world/playerLifecycle";

function loanWorld(count = 1): LifecycleWorldState {
  const club = (id: string): Club => ({ id, name: id, shortName: id, leagueId: "league", reputation: 50,
    budget: 100_000, weeklyWageBudget: 30_000, scoutingPhilosophy: "academyFirst", managerId: id,
    playerIds: [], academyPlayerIds: [], youthAcademyRating: 10 });
  const clubs = { parent: club("parent"), borrower: club("borrower") };
  const players: Record<string, Player> = {};
  const activeLoans: LoanDeal[] = [];
  for (let index = 0; index < count; index++) {
    const id = `p${index}`;
    players[id] = { ...generatePlayer(new RNG(id), { position: "CM", ageRange: [23, 23], abilityRange: [90, 90],
      clubId: "borrower", nationality: "English", currentSeason: 2 }), id, wage: 1_000, onLoan: true,
      contractClubId: "parent", loanParentClubId: "parent", loanEndWeek: 10, loanEndSeason: 2 };
    clubs.borrower.playerIds.push(id);
    activeLoans.push({ id: `loan${index}`, playerId: id, parentClubId: "parent", loanClubId: "borrower",
      startWeek: 1, startSeason: 2, endWeek: 10, endSeason: 2, wageContribution: 50, loanFee: 1_000,
      buyOptionFee: 20_000, recallClause: true, status: "active" });
  }
  return { clubs, players, activeLoans, loanHistory: [], retiredPlayers: {}, retiredPlayerIds: [], playerMovementHistory: [],
    freeAgentPool: { agents: [], lastRefreshSeason: 2, totalReleasedThisSeason: 0, totalSignedThisSeason: 0, totalRetiredThisSeason: 0 } };
}
const buy = (index: number): PlayerMovementIntent => ({ type: "loanEnd", playerId: `p${index}`,
  dealId: `loan${index}`, resolution: "buyOption", outcome: "buy-option-exercised" });

describe("mature loan settlement", () => {
  it("returns a due player when another same-tick purchase consumes the quoted wage headroom", () => {
    const source = loanWorld(2);
    const before = structuredClone(source);
    const result = resolvePlayerMovements(source, [buy(0), buy(1)], 10, 2);
    expect(result.applied.map((event) => event.type).sort()).toEqual(["loanBuyOption", "loanReturn"]);
    expect(result.state.activeLoans).toHaveLength(0);
    expect(result.state.loanHistory.filter((deal) => deal.outcome === "buy-option-exercised")).toHaveLength(1);
    const returned = Object.values(result.state.players).find((player) => player.clubId === "parent")!;
    expect(returned.onLoan).toBeUndefined();
    expect(result.state.clubs.parent.playerIds).toContain(returned.id);
    expect(result.state.clubs.borrower.budget).toBe(80_000);
    const again = resolvePlayerMovements(result.state, [buy(0), buy(1)], 11, 2);
    expect(again.applied).toHaveLength(0);
    expect(again.state.loanHistory).toEqual(result.state.loanHistory);
    expect(again.state.clubs.borrower.budget).toBe(80_000);
    expect(source).toEqual(before);
  });

  it("does not end a still-running loan merely because an early purchase is unaffordable", () => {
    const source = loanWorld();
    source.clubs.borrower.weeklyWageBudget = 1_000;
    const result = resolvePlayerMovements(source, [buy(0)], 9, 2);
    expect(result.applied).toHaveLength(0);
    expect(result.state.activeLoans).toHaveLength(1);
    expect(result.state.players.p0.onLoan).toBe(true);
  });

  it("recovers overdue active loans through the normal due-loan processor", () => {
    const source = loanWorld();
    const state = { ...source, currentWeek: 1, currentSeason: 3 } as unknown as GameState;
    const result = processLoanReturns(state, 1, 3, new RNG("overdue"));
    expect(result.deals.map((deal) => deal.id)).toEqual(["loan0"]);
    const settled = resolvePlayerMovements(source, [buy(0)], 1, 3);
    expect(settled.state.activeLoans).toHaveLength(0);
    expect(processLoanReturns({ ...state, ...settled.state }, 2, 3, new RNG("replay")).deals).toHaveLength(0);
  });
});
