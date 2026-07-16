import { describe, expect, it } from "vitest";
import type { Club, ClubFinancialObligation, Player } from "@/engine/core/types";
import {
  assessClubAffordability,
  buildTransferAddOnObligations,
  getTransferContingentReserve,
  deriveClubScoutingBudget,
  deriveClubWeeklyWageBudget,
  normalizeClubEconomics,
  reapproveAnnualClubEconomics,
  settleRelegationClubObligations,
  settleTriggeredClubObligations,
  settleWeeklyClubObligations,
} from "@/engine/finance/clubEconomics";

function player(id: string, clubId: string, wage: number): Player {
  return {
    id,
    firstName: `Player${id}`,
    lastName: "Test",
    age: 24,
    clubId,
    contractClubId: clubId,
    contractExpiry: 5,
    wage,
    currentAbility: 68,
    potentialAbility: 78,
    morale: 5,
  } as Player;
}

function club(
  id: string,
  overrides: Partial<Club> = {},
): Club {
  return {
    id,
    name: `Club ${id.toUpperCase()}`,
    shortName: id.toUpperCase(),
    leagueId: `league-${id}`,
    reputation: 55,
    budget: 1_500_000,
    scoutingPhilosophy: "academyFirst",
    managerId: `manager-${id}`,
    playerIds: [],
    academyPlayerIds: [],
    youthAcademyRating: 13,
    loanedOutPlayerIds: [],
    loanedInPlayerIds: [],
    ...overrides,
  };
}

describe("club economics", () => {
  it("bulk annual reapproval is formula-identical to per-club derivation", () => {
    const players = Object.fromEntries(
      Array.from({ length: 120 }, (_, index) => {
        const clubId = ["a", "b", "c"][index % 3];
        const id = `annual-${index}`;
        return [id, player(id, clubId, 700 + index * 17)];
      }),
    );
    const clubs = {
      a: club("a", { scoutingBudget: 80_000, budget: 900_000 }),
      b: club("b", { scoutingBudget: 0, budget: 4_000_000, reputation: 72 }),
      c: club("c", { scoutingBudget: 500_000, budget: 12_000_000, youthAcademyRating: 18 }),
      empty: club("empty", { scoutingBudget: 45_000, budget: 200_000 }),
    };

    const expected = Object.fromEntries(Object.entries(clubs).map(([clubId, candidate]) => {
      const annualScoutingBudget = deriveClubScoutingBudget(candidate, players);
      const carryover = Math.min(
        Math.round(annualScoutingBudget * 0.2),
        Math.max(0, candidate.scoutingBudget ?? 0),
      );
      return [clubId, {
        ...candidate,
        weeklyWageBudget: deriveClubWeeklyWageBudget(candidate, players),
        scoutingBudget: annualScoutingBudget + carryover,
      }];
    }));

    expect(reapproveAnnualClubEconomics(clubs, players)).toEqual(expected);
  });

  it("derives legacy wage and scouting budgets from roster commitments and stays idempotent", () => {
    const players = {
      p1: player("p1", "a", 1_200),
      p2: player("p2", "a", 900),
    };
    const legacyClub = club("a", {
      playerIds: ["p1", "p2"],
      weeklyWageBudget: undefined,
      scoutingBudget: undefined,
      financialObligations: undefined,
    });

    const migrated = normalizeClubEconomics(legacyClub, players, {
      currentWeek: 7,
      currentSeason: 2,
    });
    const idempotent = normalizeClubEconomics(migrated, players, {
      currentWeek: 7,
      currentSeason: 2,
    });

    expect(migrated.weeklyWageBudget).toBeGreaterThanOrEqual(2_100);
    expect(migrated.scoutingBudget).toBeGreaterThan(0);
    expect(migrated.financialObligations).toEqual([]);
    expect(idempotent.weeklyWageBudget).toBe(migrated.weeklyWageBudget);
    expect(idempotent.scoutingBudget).toBe(migrated.scoutingBudget);
    expect(idempotent.financialObligations).toEqual(migrated.financialObligations);
  });

  it("does not cap elite-club wage budgets below their generated payroll", () => {
    const players = Object.fromEntries(
      Array.from({ length: 22 }, (_, index) => {
        const id = `elite-${index}`;
        return [id, player(id, "elite", 150_000)];
      }),
    );

    const migrated = normalizeClubEconomics(
      club("elite", {
        reputation: 92,
        budget: 150_000_000,
        playerIds: Object.keys(players),
      }),
      players,
    );

    expect(migrated.weeklyWageBudget).toBeGreaterThan(3_300_000);
    expect(assessClubAffordability({
      club: migrated,
      players,
      weeklyWageCommitment: 250,
    }).affordable).toBe(true);
  });

  it("uses both transfer cash and weekly headroom in the shared affordability preflight", () => {
    const players = {
      p1: player("p1", "a", 2_700),
    };
    const fundedClub = club("a", {
      playerIds: ["p1"],
      budget: 40_000,
      weeklyWageBudget: 3_200,
      financialObligations: [{
        id: "loan-1",
        type: "loanWageContribution",
        playerId: "other",
        creditorClubId: "b",
        amount: 600,
        weeklyAmount: 200,
        remainingWeeks: 3,
        createdWeek: 1,
        createdSeason: 1,
        status: "active",
      }],
    });

    expect(assessClubAffordability({
      club: fundedClub,
      players,
      upfrontCost: 15_000,
      weeklyWageCommitment: 250,
    }).affordable).toBe(true);

    expect(assessClubAffordability({
      club: fundedClub,
      players,
      upfrontCost: 50_000,
      weeklyWageCommitment: 250,
    }).affordable).toBe(false);

    expect(assessClubAffordability({
      club: fundedClub,
      players,
      upfrontCost: 15_000,
      weeklyWageCommitment: 400,
    }).affordable).toBe(false);

    expect(assessClubAffordability({
      club: fundedClub,
      players,
      upfrontCost: 15_000,
      weeklyWageCommitment: 250,
      contingentReserve: 30_000,
    }).affordable).toBe(false);
  });

  it("keeps authored add-ons contingent and derives a risk reserve", () => {
    const obligations = buildTransferAddOnObligations({
      playerId: "p1",
      creditorClubId: "a",
      addOns: [{
        type: "appearanceBonus",
        value: 1_000,
        trigger: "After 25 appearances",
      }, {
        type: "performanceBonus",
        value: 2_000,
        trigger: "10 goals or 10 assists",
      }],
      currentWeek: 1,
      currentSeason: 1,
    });

    expect(obligations[0]).toMatchObject({
      amount: 1_000,
      appearanceThreshold: 25,
      appearancesRecorded: 0,
    });
    expect(obligations[1]).toMatchObject({
      amount: 2_000,
      goalThreshold: 10,
      assistThreshold: 10,
    });
    expect(obligations[0]?.weeklyAmount).toBeUndefined();
    expect(obligations[1]?.weeklyAmount).toBeUndefined();
    expect(getTransferContingentReserve(obligations)).toBe(1_400);
  });

  it("settles scheduled obligations deterministically and skips same-week creations", () => {
    const obligation: ClubFinancialObligation = {
      id: "loan-obligation",
      type: "loanWageContribution",
      playerId: "p1",
      creditorClubId: "a",
      amount: 600,
      weeklyAmount: 200,
      remainingWeeks: 3,
      createdWeek: 1,
      createdSeason: 2,
      status: "active",
    };
    const sameWeek: ClubFinancialObligation = {
      id: "same-week",
      type: "appearanceBonus",
      playerId: "p2",
      creditorClubId: "a",
      amount: 300,
      weeklyAmount: 100,
      remainingWeeks: 3,
      createdWeek: 2,
      createdSeason: 2,
      status: "active",
    };

    const clubs = {
      a: club("a", { budget: 5_000 }),
      b: club("b", {
        budget: 8_000,
        financialObligations: [obligation, sameWeek],
      }),
    };

    const settled = settleWeeklyClubObligations(clubs, 2, 2);

    expect(settled.clubs.a.budget).toBe(5_200);
    expect(settled.clubs.b.budget).toBe(7_800);
    expect(settled.clubs.b.financialObligations?.find((entry) => entry.id === "loan-obligation"))
      .toMatchObject({ amount: 400, remainingWeeks: 2, status: "active" });
    expect(settled.clubs.b.financialObligations?.find((entry) => entry.id === "same-week"))
      .toMatchObject({ amount: 300, remainingWeeks: 3, status: "active" });

    const replayed = settleWeeklyClubObligations(settled.clubs, 2, 2);
    expect(replayed.clubs).toEqual(settled.clubs);
    expect(replayed.processedObligationIds).toEqual([]);
  });

  it("triggers relegation clauses once and turns any shortfall into scheduled debt", () => {
    const clubs = {
      a: club("a", { budget: 2_000 }),
      b: club("b", {
        budget: 600,
        financialObligations: [{
          id: "relegation-p1",
          type: "relegationClause",
          playerId: "p1",
          creditorClubId: "a",
          amount: 1_000,
          createdWeek: 2,
          createdSeason: 1,
          status: "active",
        }],
      }),
    };

    const triggered = settleRelegationClubObligations(
      clubs,
      new Set(["b"]),
      38,
      2,
    );
    const replayed = settleRelegationClubObligations(
      triggered.clubs,
      new Set(["b"]),
      38,
      2,
    );

    expect(triggered.clubs.a.budget).toBe(2_600);
    expect(triggered.clubs.b.budget).toBe(0);
    expect(triggered.clubs.b.financialObligations?.[0]).toMatchObject({
      amount: 400,
      weeklyAmount: 34,
      remainingWeeks: 12,
      triggeredWeek: 38,
      triggeredSeason: 2,
      status: "active",
    });
    expect(replayed.clubs).toEqual(triggered.clubs);
  });

  it("settles an appearance clause only when canonical match output reaches its trigger", () => {
    const clubs = {
      a: club("a", { budget: 2_000 }),
      b: club("b", {
        budget: 600,
        financialObligations: [{
          id: "appearance-p1",
          type: "appearanceBonus" as const,
          playerId: "p1",
          creditorClubId: "a",
          amount: 1_000,
          appearanceThreshold: 25,
          appearancesRecorded: 24,
          createdWeek: 1,
          createdSeason: 1,
          status: "active" as const,
        }],
      }),
      c: club("c"),
    };
    const fixtures = [{
      homeClubId: "b",
      awayClubId: "c",
      playerRatings: {
        p1: {
          playerId: "p1",
          fixtureId: "fixture-1",
          rating: 7.1,
          eventCount: 2,
          stats: {},
          source: "simulated" as const,
        },
      },
    }];

    const triggered = settleTriggeredClubObligations(clubs, fixtures, 5, 1);
    const replayed = settleTriggeredClubObligations(triggered.clubs, fixtures, 5, 1);

    expect(triggered.clubs.a.budget).toBe(2_600);
    expect(triggered.clubs.b.budget).toBe(0);
    expect(triggered.clubs.b.financialObligations?.[0]).toMatchObject({
      appearancesRecorded: 25,
      amount: 400,
      weeklyAmount: 34,
      remainingWeeks: 12,
      triggeredWeek: 5,
      triggeredSeason: 1,
    });
    expect(replayed.clubs).toEqual(triggered.clubs);
  });
});
