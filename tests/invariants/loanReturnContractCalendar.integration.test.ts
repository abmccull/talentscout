import { describe, expect, it } from "vitest";
import type { Club, LoanDeal, Player } from "@/engine/core/types";
import { expandClubFinancialObligation, expandLoanDeal } from "@/engine/finance/terminalRecordArchive";
import { resolvePlayerMovements, type LifecycleWorldState, type PlayerMovementIntent } from "@/engine/world/playerLifecycle";

function world(length: number, expiry = 2): LifecycleWorldState {
  const club = (id: string): Club => ({ id, name: id, shortName: id, leagueId: "league",
    reputation: 13, budget: 100_000, weeklyWageBudget: 10_000, scoutingPhilosophy: "marketSmart",
    managerId: id, youthAcademyRating: 1, playerIds: [], academyPlayerIds: [], loanedOutPlayerIds: [], loanedInPlayerIds: [] });
  const parent = club("parent"), borrower = club("borrower");
  parent.loanedOutPlayerIds = ["p"]; borrower.playerIds = ["p"]; borrower.loanedInPlayerIds = ["p"];
  borrower.financialObligations = [{ id: "contribution", type: "loanWageContribution", playerId: "p",
    creditorClubId: "parent", amount: 250, weeklyAmount: 250, remainingWeeks: 20,
    createdWeek: 1, createdSeason: 2, status: "active" }];
  const player = { id: "p", firstName: "Calendar", lastName: "Boundary", age: 24, position: "GK",
    clubId: "borrower", contractClubId: "parent", contractExpiry: expiry, wage: 500,
    onLoan: true, loanParentClubId: "parent", currentAbility: 26, potentialAbility: 40 } as Player;
  const loan: LoanDeal = { id: "loan", playerId: "p", parentClubId: "parent", loanClubId: "borrower",
    startWeek: 1, startSeason: 2, endWeek: length, endSeason: 2, loanFee: 0, wageContribution: 50,
    recallClause: true, status: "active" };
  return { players: { p: player }, clubs: { parent, borrower }, activeLoans: [loan], loanHistory: [],
    retiredPlayers: {}, retiredPlayerIds: [], playerMovementHistory: [],
    freeAgentPool: { agents: [], lastRefreshSeason: 2, totalReleasedThisSeason: 0,
      totalSignedThisSeason: 0, totalRetiredThisSeason: 0 } };
}

const closure = (resolution: "return" | "recall"): PlayerMovementIntent =>
  ({ type: "loanEnd", playerId: "p", dealId: "loan", resolution });
const release: PlayerMovementIntent = { type: "release", playerId: "p", fromClubId: "parent" };
const renewal: PlayerMovementIntent = { type: "contractRenewal", playerId: "p", clubId: "parent", wage: 600, contractLength: 3 };

function verifySettlement(result: ReturnType<typeof resolvePlayerMovements>) {
  expect(result.state.activeLoans).toEqual([]);
  expect(result.state.loanHistory).toHaveLength(1);
  expect(expandLoanDeal(result.state.loanHistory[0]).status).not.toBe("active");
  expect(expandClubFinancialObligation(result.state.clubs.borrower.financialObligations![0]).status).toBe("expired");
  expect(result.state.clubs.borrower.playerIds).toEqual([]);
  expect(result.state.clubs.borrower.loanedInPlayerIds).toEqual([]);
  expect(result.state.clubs.parent.loanedOutPlayerIds).toEqual([]);
  expect(new Set(result.applied.map(event => event.id)).size).toBe(result.applied.length);
}

function verifyReserved(length: number, week: number, expiry = 2, season = 2,
  resolution: "return" | "recall" = "recall") {
  for (const decision of [release, renewal]) {
    const input = world(length, expiry), before = JSON.stringify(input);
    const result = resolvePlayerMovements(input, [closure(resolution), decision], week, season, length);
    expect(result.applied.map(event => event.type)).toEqual([resolution === "return" ? "loanReturn" : "loanRecall"]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toContain("already resolved this tick");
    expect(result.state.players.p).toMatchObject({ clubId: "parent", contractClubId: "parent", contractExpiry: expiry, wage: 500 });
    expect(result.state.clubs.parent.playerIds).toEqual(["p"]);
    expect(result.state.freeAgentPool.agents).toEqual([]);
    verifySettlement(result);
    expect(JSON.stringify(input)).toBe(before);
  }
}

function verifyExpired(length: number, week: number, expiry: number, resolution: "return" | "recall") {
  for (const decision of [release, renewal]) {
    const input = world(length, expiry), before = JSON.stringify(input);
    const result = resolvePlayerMovements(input, [decision, closure(resolution), decision, closure(resolution)], week, 2, length);
    expect(result.applied.map(event => event.type)).toEqual([
      resolution === "return" ? "loanReturn" : "loanRecall", decision.type,
    ]);
    expect(result.rejected).toHaveLength(2);
    verifySettlement(result);
    if (decision.type === "release") {
      expect(result.state.players.p).toMatchObject({ clubId: "", contractExpiry: 0, wage: 0 });
      expect(result.state.clubs.parent.playerIds).toEqual([]);
    } else {
      expect(result.state.players.p).toMatchObject({ clubId: "parent", contractClubId: "parent", contractExpiry: 5, wage: 600 });
      expect(result.state.clubs.parent.playerIds).toEqual(["p"]);
    }
    expect(JSON.stringify(input)).toBe(before);
  }
}

describe("ownership expiry follows the actual loan-return calendar", () => {
  it.each([22, 38, 40, 46])("reserves the current contract after a week-8 recall on a %i-week calendar", length => {
    verifyReserved(length, 8);
  });
  it.each([22, 38, 40, 46])("reserves the current contract through the penultimate week on a %i-week calendar", length => {
    verifyReserved(length, length - 1, 2, 2, "return");
  });
  it.each([22, 38, 40, 46])("settles the expired owner decision once at the final week of a %i-week calendar", length => {
    verifyExpired(length, length, 2, "return");
    verifyExpired(length, length, 2, "recall");
  });
  it.each([22, 38, 40, 46])("settles an overdue previous-season contract after a recall on a %i-week calendar", length => {
    verifyExpired(length, 8, 1, "recall");
  });
  it.each([22, 38, 40, 46])("keeps a future-year contract reserved at the final week on a %i-week calendar", length => {
    verifyReserved(length, length, 3, 2, "return");
  });
  it("uses the existing 38-week fallback when no calendar is supplied", () => {
    const ongoing = resolvePlayerMovements(world(38), [closure("recall"), release], 8, 2);
    expect(ongoing.applied.map(event => event.type)).toEqual(["loanRecall"]);
    const expired = resolvePlayerMovements(world(38), [closure("return"), release], 38, 2);
    expect(expired.applied.map(event => event.type)).toEqual(["loanReturn", "release"]);
  });
  it.each([
    [0, 2, 38], [39, 2, 38], [NaN, 2, 38], [8, 0, 38], [8, 2, 0], [8, 2, 38.5],
  ])("does not grant a second owner decision for malformed date week=%s season=%s length=%s", (week, season, length) => {
    verifyReserved(length, week, 2, season);
  });
  it.each([-1, 1.5, NaN])("does not grant a second owner decision for malformed expiry %s", expiry => {
    // NaN is intentionally compared separately: MatchObject correctly uses Object.is.
    verifyReserved(38, 38, expiry);
  });
});
