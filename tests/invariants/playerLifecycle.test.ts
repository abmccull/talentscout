import { describe, expect, it } from "vitest";
import type {
  Club,
  FreeAgent,
  FreeAgentPool,
  LoanDeal,
  Player,
  Scout,
} from "@/engine/core/types";
import {
  resolvePlayerMovements,
  type LifecycleWorldState,
} from "@/engine/world/playerLifecycle";
import { processFreeAgentNegotiationDeadlines } from "@/engine/freeAgents/negotiation";
import { getTransferFlowProbability } from "@/engine/world/transfers";
import { applyScoutSkillXp } from "@/engine/scout/progression";

function player(overrides: Partial<Player> = {}): Player {
  return {
    id: "p1",
    firstName: "Alex",
    lastName: "Prospect",
    age: 20,
    clubId: "a",
    contractClubId: "a",
    contractExpiry: 5,
    wage: 1_000,
    currentAbility: 90,
    potentialAbility: 150,
    morale: 5,
    ...overrides,
  } as Player;
}

function club(id: string, budget = 100_000): Club {
  return {
    id,
    name: `Club ${id.toUpperCase()}`,
    shortName: id.toUpperCase(),
    leagueId: `league-${id}`,
    reputation: 50,
    budget,
    scoutingPhilosophy: "academyFirst",
    managerId: `manager-${id}`,
    playerIds: [],
    academyPlayerIds: [],
    youthAcademyRating: 12,
    loanedOutPlayerIds: [],
    loanedInPlayerIds: [],
  };
}

function emptyPool(agents: FreeAgent[] = []): FreeAgentPool {
  return {
    agents,
    lastRefreshSeason: 1,
    totalReleasedThisSeason: 0,
    totalSignedThisSeason: 0,
    totalRetiredThisSeason: 0,
  };
}

function world(
  activePlayer: Player = player(),
  overrides: Partial<LifecycleWorldState> = {},
): LifecycleWorldState {
  const a = club("a");
  a.playerIds = [activePlayer.id];
  return {
    players: { [activePlayer.id]: activePlayer },
    clubs: { a, b: club("b") },
    activeLoans: [],
    loanHistory: [],
    retiredPlayers: {},
    retiredPlayerIds: [],
    playerMovementHistory: [],
    freeAgentPool: emptyPool(),
    ...overrides,
  };
}

describe("authoritative player lifecycle", () => {
  it("applies a permanent transfer once with contract, roster, and budget integrity", () => {
    const input = world();
    input.clubs.b.academyPlayerIds = ["p1"]; // corrupt duplicate membership is repaired
    const result = resolvePlayerMovements(input, [{
      type: "permanentTransfer",
      playerId: "p1",
      fromClubId: "a",
      toClubId: "b",
      fee: 20_000,
      signingBonus: 5_000,
      wage: 2_000,
      contractLength: 4,
    }], 4, 2);

    expect(result.rejected).toEqual([]);
    expect(result.state.players.p1).toMatchObject({
      clubId: "b",
      contractClubId: "b",
      contractExpiry: 6,
      wage: 2_000,
    });
    expect(result.state.clubs.a.playerIds).not.toContain("p1");
    expect(result.state.clubs.b.playerIds).toEqual(["p1"]);
    expect(result.state.clubs.b.academyPlayerIds).not.toContain("p1");
    expect(result.state.clubs.a.budget).toBe(120_000);
    expect(result.state.clubs.b.budget).toBe(75_000);
    expect(result.state.playerMovementHistory).toHaveLength(1);
  });

  it("tracks contract ownership, wage sharing, and buy-option economics across a loan", () => {
    const input = world();
    const deal: LoanDeal = {
      id: "loan-1",
      playerId: "p1",
      parentClubId: "a",
      loanClubId: "b",
      startWeek: 1,
      startSeason: 2,
      endWeek: 11,
      endSeason: 2,
      loanFee: 1_000,
      wageContribution: 50,
      buyOptionFee: 20_000,
      recallClause: true,
      status: "active",
    };
    const started = resolvePlayerMovements(
      input,
      [{ type: "loanStart", playerId: "p1", deal }],
      1,
      2,
    );

    expect(started.state.players.p1).toMatchObject({
      clubId: "b",
      contractClubId: "a",
      loanParentClubId: "a",
      onLoan: true,
    });
    expect(started.state.clubs.a.budget).toBe(101_000);
    expect(started.state.clubs.b.budget).toBe(99_000);
    expect(started.state.clubs.b.financialObligations?.[0]).toMatchObject({
      type: "loanWageContribution",
      creditorClubId: "a",
      weeklyAmount: 500,
      remainingWeeks: 10,
      amount: 5_000,
      status: "active",
    });
    expect(started.state.clubs.a.loanedOutPlayerIds).toEqual(["p1"]);
    expect(started.state.clubs.b.loanedInPlayerIds).toEqual(["p1"]);

    const duplicateStart = resolvePlayerMovements(
      started.state,
      [{ type: "loanStart", playerId: "p1", deal }],
      1,
      2,
    );
    expect(duplicateStart.applied).toEqual([]);
    expect(duplicateStart.rejected).toHaveLength(1);
    expect(duplicateStart.state.activeLoans).toHaveLength(1);
    expect(duplicateStart.state.clubs.a.budget).toBe(101_000);
    expect(duplicateStart.state.clubs.b.budget).toBe(99_000);
    expect(duplicateStart.state.playerMovementHistory).toHaveLength(1);

    const bought = resolvePlayerMovements(
      duplicateStart.state,
      [{
        type: "loanEnd",
        playerId: "p1",
        dealId: "loan-1",
        resolution: "buyOption",
        outcome: "buy-option-exercised",
      }],
      11,
      2,
    );
    expect(bought.state.players.p1).toMatchObject({
      clubId: "b",
      contractClubId: "b",
      onLoan: undefined,
    });
    expect(bought.state.clubs.a.budget).toBe(121_000);
    expect(bought.state.clubs.b.budget).toBe(79_000);
    expect(bought.state.clubs.b.financialObligations?.[0]).toMatchObject({
      type: "loanWageContribution",
      status: "expired",
    });
    expect(bought.state.activeLoans).toEqual([]);
    expect(bought.state.loanHistory[0].outcome).toBe("buy-option-exercised");
  });

  it("allows the owning club to renew a player while he remains on loan", () => {
    const activePlayer = player({
      clubId: "b",
      contractClubId: "a",
      loanParentClubId: "a",
      onLoan: true,
    });
    const input = world(activePlayer, {
      activeLoans: [{
        id: "loan-1",
        playerId: "p1",
        parentClubId: "a",
        loanClubId: "b",
        startWeek: 1,
        startSeason: 1,
        endWeek: 20,
        endSeason: 1,
        loanFee: 0,
        wageContribution: 50,
        recallClause: false,
        status: "active",
      }],
    });
    input.clubs.a.playerIds = [];
    input.clubs.a.loanedOutPlayerIds = ["p1"];
    input.clubs.b.playerIds = ["p1"];
    input.clubs.b.loanedInPlayerIds = ["p1"];

    const result = resolvePlayerMovements(input, [{
      type: "contractRenewal",
      playerId: "p1",
      clubId: "a",
      contractLength: 3,
      wage: 1_500,
    }], 8, 2);
    expect(result.rejected).toEqual([]);
    expect(result.state.players.p1).toMatchObject({
      clubId: "b",
      contractClubId: "a",
      onLoan: true,
      contractExpiry: 5,
      wage: 1_500,
    });
  });

  it("gives terminal retirement priority and archives the complete player record", () => {
    const input = world(player({ age: 38 }));
    const result = resolvePlayerMovements(input, [
      { type: "contractRenewal", playerId: "p1", clubId: "a", contractLength: 1 },
      { type: "retirement", playerId: "p1", reason: "career complete" },
    ], 38, 4);

    expect(result.state.players.p1).toBeUndefined();
    expect(result.state.retiredPlayers.p1).toBeDefined();
    expect(result.state.retiredPlayerIds).toEqual(["p1"]);
    expect(result.state.clubs.a.playerIds).not.toContain("p1");
    expect(result.applied.map((event) => event.type)).toEqual(["retirement"]);
    expect(result.rejected).toHaveLength(1);
  });

  it("releases and re-signs a free agent without dual club membership", () => {
    const released = resolvePlayerMovements(
      world(),
      [{ type: "release", playerId: "p1", fromClubId: "a" }],
      10,
      2,
    );
    released.state.freeAgentPool = emptyPool([{
      playerId: "p1",
      country: "England",
      releasedFrom: "a",
      releasedSeason: 2,
      weeksInPool: 0,
      maxWeeksInPool: 20,
      wageExpectation: 900,
      signingBonusExpectation: 2_000,
      discoverySource: "contactTip",
      discoveredByScout: true,
      npcInterest: [],
      status: "available",
    }]);
    const signed = resolvePlayerMovements(released.state, [{
      type: "freeAgentSigning",
      playerId: "p1",
      toClubId: "b",
      wage: 1_100,
      signingBonus: 2_000,
      contractLength: 2,
    }], 11, 2);

    expect(signed.state.players.p1).toMatchObject({ clubId: "b", contractClubId: "b" });
    expect(signed.state.clubs.a.playerIds).not.toContain("p1");
    expect(signed.state.clubs.b.playerIds).toEqual(["p1"]);
    expect(signed.state.freeAgentPool.agents).toEqual([]);
    expect(signed.state.freeAgentPool.totalSignedThisSeason).toBe(1);
  });

  it("removes stale pool entries when a higher-priority contract transition wins", () => {
    const input = world();
    input.freeAgentPool = emptyPool([{
      playerId: "p1",
      country: "England",
      releasedFrom: "b",
      releasedSeason: 1,
      weeksInPool: 2,
      maxWeeksInPool: 20,
      wageExpectation: 900,
      signingBonusExpectation: 2_000,
      discoverySource: null,
      discoveredByScout: false,
      npcInterest: [],
      status: "signed",
    }]);

    const resolved = resolvePlayerMovements(input, [
      {
        type: "contractRenewal",
        playerId: "p1",
        clubId: "a",
        contractLength: 2,
      },
      {
        type: "freeAgentSigning",
        playerId: "p1",
        toClubId: "b",
        wage: 1_100,
        signingBonus: 2_000,
        contractLength: 2,
      },
    ], 12, 2);

    expect(resolved.applied.map((event) => event.type)).toEqual(["contractRenewal"]);
    expect(resolved.rejected).toHaveLength(1);
    expect(resolved.state.players.p1.contractClubId).toBe("a");
    expect(resolved.state.freeAgentPool.agents).toEqual([]);
  });
});

describe("supporting lifecycle invariants", () => {
  it("expires free-agent talks across a season boundary", () => {
    const agent: FreeAgent = {
      playerId: "p1",
      country: "England",
      releasedFrom: "a",
      releasedSeason: 1,
      weeksInPool: 2,
      maxWeeksInPool: 20,
      wageExpectation: 1_000,
      signingBonusExpectation: 2_000,
      discoverySource: "contactTip",
      discoveredByScout: true,
      npcInterest: [],
      status: "inNegotiation",
    };
    const result = processFreeAgentNegotiationDeadlines(
      [{
        freeAgentId: "p1",
        offeredWage: 900,
        offeredBonus: 1_000,
        offeredContractLength: 2,
        round: 1,
        status: "countered",
        deadline: 2,
        deadlineSeason: 2,
        startSeason: 1,
      }],
      emptyPool([agent]),
      { p1: player({ clubId: "", contractClubId: undefined }) },
      2,
      2,
    );
    expect(result.negotiations).toEqual([]);
    expect(result.updatedPool.agents[0].status).toBe("available");
    expect(result.messages).toHaveLength(1);
  });

  it("normalizes geography and strongly prefers domestic transfer routes", () => {
    expect(getTransferFlowProbability(" South-Korea ", "Germany")).toBe(0.09);
    expect(getTransferFlowProbability("ENGLAND", "england")).toBe(0.3);
    expect(getTransferFlowProbability("England", "Brazil")).toBe(0.02);
  });

  it("applies event XP through the same carry-over progression rules as calendar XP", () => {
    const scout = {
      skills: { potentialAssessment: 5 },
      skillXp: { potentialAssessment: 45 },
    } as unknown as Scout;
    const progressed = applyScoutSkillXp(scout, { potentialAssessment: 70 });
    expect(progressed.skills.potentialAssessment).toBe(7);
    expect(progressed.skillXp.potentialAssessment).toBe(5);
  });
});
