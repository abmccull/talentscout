import { describe, expect, it } from "vitest";
import type { Club, GameState, LoanDeal, LoanRecommendation, Player } from "@/engine/core/types";
import { projectAppliedLoanClosures } from "@/engine/core/weekly/loanClosureFeedback";
import { RNG } from "@/engine/rng";
import { processLoanReturns } from "@/engine/world/loans";
import { expandLoanDeal, expandClubFinancialObligation } from "@/engine/finance/terminalRecordArchive";
import { resolvePlayerMovements, type LifecycleWorldState, type PlayerMovementIntent } from "@/engine/world/playerLifecycle";

function world(expiry = 2): LifecycleWorldState {
  const club = (id: string): Club => ({ id, name: id, shortName: id, leagueId: "league",
    reputation: 13, budget: 100_000, weeklyWageBudget: 10_000, scoutingPhilosophy: "marketSmart",
    managerId: id, youthAcademyRating: 1, playerIds: [], academyPlayerIds: [], loanedOutPlayerIds: [], loanedInPlayerIds: [] });
  const parent = club("parent"), borrower = club("borrower");
  parent.loanedOutPlayerIds = ["p"]; borrower.playerIds = ["p"]; borrower.loanedInPlayerIds = ["p"];
  borrower.financialObligations = [{ id: "contribution", type: "loanWageContribution", playerId: "p",
    creditorClubId: "parent", amount: 250, weeklyAmount: 250, remainingWeeks: 1, createdWeek: 1, createdSeason: 2, status: "active" }];
  const player = { id: "p", firstName: "Contract", lastName: "Boundary", age: 24, position: "GK",
    clubId: "borrower", contractClubId: "parent", contractExpiry: expiry, wage: 500,
    onLoan: true, loanParentClubId: "parent", currentAbility: 26, potentialAbility: 40 } as Player;
  const loan: LoanDeal = { id: "loan", playerId: "p", parentClubId: "parent", loanClubId: "borrower",
    startWeek: 1, startSeason: 2, endWeek: 46, endSeason: 2, loanFee: 0, wageContribution: 50,
    buyOptionFee: 1_000, recallClause: true, status: "active" };
  return { players: { p: player }, clubs: { parent, borrower }, activeLoans: [loan], loanHistory: [],
    retiredPlayers: {}, retiredPlayerIds: [], playerMovementHistory: [],
    freeAgentPool: { agents: [{ playerId: "p", releasedFrom: "parent", status: "available", wageExpectation: 500 } as never],
      lastRefreshSeason: 2, totalReleasedThisSeason: 1, totalSignedThisSeason: 0, totalRetiredThisSeason: 0 } };
}
const end = (resolution: "return" | "recall" | "buyOption" = "return"): PlayerMovementIntent =>
  ({ type: "loanEnd", playerId: "p", dealId: "loan", resolution });
const release: PlayerMovementIntent = { type: "release", playerId: "p", fromClubId: "parent" };
const renewal: PlayerMovementIntent = { type: "contractRenewal", playerId: "p", clubId: "parent", wage: 600, contractLength: 3 };

function verifyClosed(result: ReturnType<typeof resolvePlayerMovements>) {
  expect(result.state.activeLoans).toEqual([]);
  expect(result.state.loanHistory).toHaveLength(1);
  expect(expandLoanDeal(result.state.loanHistory[0]).status).not.toBe("active");
  expect(expandClubFinancialObligation(result.state.clubs.borrower.financialObligations![0]).status).toBe("expired");
  expect(result.state.clubs.borrower.playerIds).not.toContain("p");
  expect(result.state.clubs.parent.loanedOutPlayerIds).not.toContain("p");
  expect(new Set(result.applied.map(event => event.id)).size).toBe(result.applied.length);
}

describe("compatible loan closure and expired owner contract", () => {
  it("plans an overdue active loan return after a legacy save skipped its exact deadline", () => {
    const state = world() as unknown as GameState;
    const result = processLoanReturns(state, 1, 3, new RNG("overdue-return"), 46);
    expect(result.deals.map(deal => deal.id)).toEqual(["loan"]);
    expect(state.activeLoans?.[0]?.status).toBe("active");
  });
  it("returns an unaffordable due purchase without an NPC-only flag, while rejecting an early purchase", () => {
    const input = world(); input.clubs.borrower.budget = 0;
    const early = resolvePlayerMovements(input, [end("buyOption")], 45, 2, 46);
    expect(early.applied).toEqual([]);
    expect(early.state.activeLoans).toHaveLength(1);
    const due = resolvePlayerMovements(input, [end("buyOption"), release], 46, 2, 46);
    expect(due.applied.map(event => event.type)).toEqual(["loanReturn", "release"]);
    verifyClosed(due);
    expect(expandLoanDeal(due.state.loanHistory[0]).outcome).not.toBe("buy-option-exercised");
    expect(due.state.clubs.borrower.budget).toBe(0);
  });
  it("closes a terminal loan recommendation from committed compact history without rewards", () => {
    const input = world();
    const result = resolvePlayerMovements(input, [{ type: "retirement", playerId: "p" }], 46, 2, 46);
    const recommendations = [{ id: "rec", loanDealId: "loan", scoutId: "scout", status: "accepted", reputationApplied: false }] as LoanRecommendation[];
    const feedback = projectAppliedLoanClosures({ scout: { id: "scout" } as GameState["scout"],
      previousLoanHistory: [], loanHistory: result.state.loanHistory, movements: result.applied,
      recommendations, players: result.state.players, clubs: result.state.clubs, week: 46, season: 2,
    }, new RNG("terminal-closure"));
    expect(feedback.updatedRecommendations[0]).toMatchObject({ status: "completed", outcome: "terminated", reputationApplied: true });
    expect(feedback.messages).toEqual([]);
    expect(feedback.reputationDelta).toBe(0);
    expect(feedback.xpAward).toBe(0);
    expect(recommendations[0].status).toBe("accepted");
  });
  it("returns then releases into the planned pool with no duplicate registration or settlement", () => {
    const input = world(), before = JSON.stringify(input);
    const result = resolvePlayerMovements(input, [release, end()], 46, 2, 46);
    expect(result.applied.map(event => event.type)).toEqual(["loanReturn", "release"]);
    verifyClosed(result);
    expect(result.state.players.p).toMatchObject({ clubId: "", contractExpiry: 0, wage: 0 });
    expect(result.state.clubs.parent.playerIds).not.toContain("p");
    expect(result.state.freeAgentPool.agents.map(agent => agent.playerId)).toEqual(["p"]);
    expect(JSON.stringify(input)).toBe(before);
  });
  it.each(["return", "recall"] as const)("%s then renews the expired contract once", resolution => {
    const result = resolvePlayerMovements(world(), [renewal, end(resolution), renewal, end(resolution)], 46, 2, 46);
    expect(result.applied.map(event => event.type)).toEqual([resolution === "return" ? "loanReturn" : "loanRecall", "contractRenewal"]);
    verifyClosed(result);
    expect(result.state.players.p).toMatchObject({ clubId: "parent", contractClubId: "parent", contractExpiry: 5, wage: 600 });
    expect(result.state.clubs.parent.playerIds).toEqual(["p"]);
    expect(result.state.freeAgentPool.agents).toEqual([]);
    expect(result.rejected).toHaveLength(2);
  });
  it("rechecks current owned wages before the compatible renewal", () => {
    const input = world(); input.clubs.parent.weeklyWageBudget = 550;
    const result = resolvePlayerMovements(input, [end(), renewal], 46, 2, 46);
    expect(result.applied.map(event => event.type)).toEqual(["loanReturn"]);
    expect(result.rejected[0].reason).toContain("renewed weekly wage");
    expect(result.state.players.p.contractExpiry).toBe(2);
    verifyClosed(result);
  });
  it("updates parent membership even when the incoming loan registration was stale", () => {
    const input = world(); input.clubs.parent.loanedOutPlayerIds = [];
    const result = resolvePlayerMovements(input, [end(), release], 46, 2, 46);
    expect(result.applied.map(event => event.type)).toEqual(["loanReturn", "release"]);
    expect(result.state.clubs.parent.playerIds).toEqual([]);
    verifyClosed(result);
  });
  it("permits the expired parent release after an NPC buy option actually declines and returns", () => {
    const input = world(); input.clubs.borrower.weeklyWageBudget = 300;
    const result = resolvePlayerMovements(input, [{ ...end("buyOption"), preserveSquadWageReserve: true }, release], 46, 2, 46);
    expect(result.applied.map(event => event.type)).toEqual(["loanReturn", "release"]);
    verifyClosed(result);
  });
  it("keeps a successful buy option ahead of the former owner's expired decision", () => {
    const result = resolvePlayerMovements(world(), [end("buyOption"), release, renewal], 46, 2, 46);
    expect(result.applied.map(event => event.type)).toEqual(["loanBuyOption"]);
    expect(result.state.players.p.contractClubId).toBe("borrower");
    expect(result.rejected).toHaveLength(2);
    expect(result.state.loanHistory).toHaveLength(1);
  });
  it("keeps an ongoing recalled contract reserved for that tick", () => {
    const result = resolvePlayerMovements(world(5), [end("recall"), release, renewal], 46, 2, 46);
    expect(result.applied.map(event => event.type)).toEqual(["loanRecall"]);
    expect(result.state.players.p.contractExpiry).toBe(5);
    expect(result.rejected).toHaveLength(2);
  });
  it("rejects the wrong owner without consuming the valid parent's expired decision", () => {
    const result = resolvePlayerMovements(world(), [end(), { ...release, fromClubId: "borrower" }, release, renewal], 46, 2, 46);
    expect(result.applied.map(event => event.type)).toEqual(["loanReturn", "release"]);
    expect(result.rejected).toHaveLength(2);
    verifyClosed(result);
  });
  it("keeps retirement ahead of both compatible-looking intentions", () => {
    const result = resolvePlayerMovements(world(), [end(), release, renewal, { type: "retirement", playerId: "p" }], 46, 2, 46);
    expect(result.applied.map(event => event.type)).toEqual(["retirement"]);
    expect(result.state.players.p).toBeUndefined();
    expect(result.state.loanHistory).toHaveLength(1);
    expect(result.rejected).toHaveLength(3);
  });
});
