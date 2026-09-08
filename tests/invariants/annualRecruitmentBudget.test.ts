import { describe, expect, it } from "vitest";
import type { Club, GameState, Player } from "@/engine/core/types";
import { applyRelegationResult, type RelegationResult } from "@/engine/world/relegation";
import {
  assessClubAffordability,
  reapproveAnnualClubEconomics,
  settleWeeklyClubObligations,
} from "@/engine/finance/clubEconomics";

function club(overrides: Partial<Club> = {}): Club {
  return {
    id: "local", name: "Local", shortName: "LOC", leagueId: "lower",
    reputation: 14, budget: 2_000, weeklyWageBudget: 25_000,
    scoutingBudget: 5_000, scoutingPhilosophy: "academyFirst",
    managerId: "manager", playerIds: [], youthAcademyRating: 3,
    annualRecruitmentBudget: 150_000,
    lastRecruitmentAllocation: {
      season: 1, grant: 150_000, carryover: 0, returned: 0, previousBalance: 0,
    },
    ...overrides,
  };
}

describe("annual club recruitment funding", () => {
  it("adjusts annual funding once with the authoritative promotion transaction", () => {
    const state = {
      clubs: { local: club() }, players: {},
      leagues: { lower: { id: "lower", clubIds: ["local"] }, upper: { id: "upper", clubIds: [] } },
    } as unknown as GameState;
    const result: RelegationResult = {
      season: 1, flaggedPlayerIds: [], messages: [], events: [{
        clubId: "local", clubName: "Local", fromLeagueId: "lower", toLeagueId: "upper",
        type: "promoted", reputationChange: 10, budgetMultiplier: 1.15,
      }],
    };
    const promoted = applyRelegationResult(state, result);
    expect(promoted.clubs.local.annualRecruitmentBudget).toBe(187_500);
    expect(applyRelegationResult({ ...state, ...promoted }, result)).toEqual(promoted);
    const funded = reapproveAnnualClubEconomics(promoted.clubs, {}, 2).local;
    expect(funded.lastRecruitmentAllocation?.grant).toBe(187_500);
    expect(funded.budget).toBe(189_800);
  });

  it("preserves debt and recurring capacity through a round trip, rejecting an old movement replay", () => {
    const state = {
      clubs: { local: club({ budget: -20_000 }) }, players: {},
      leagues: { lower: { id: "lower", clubIds: ["local"] }, upper: { id: "upper", clubIds: [] } },
    } as unknown as GameState;
    const promotion: RelegationResult = {
      season: 1, flaggedPlayerIds: [], messages: [], events: [{
        clubId: "local", clubName: "Local", fromLeagueId: "lower", toLeagueId: "upper",
        type: "promoted", reputationChange: 10, budgetMultiplier: 1.15,
      }],
    };
    const promoted = applyRelegationResult(state, promotion);
    expect(promoted.clubs.local.budget).toBe(-20_000);
    const relegated = applyRelegationResult({ ...state, ...promoted }, {
      ...promotion, season: 2, events: [{ ...promotion.events[0],
        fromLeagueId: "upper", toLeagueId: "lower", type: "relegated",
        reputationChange: -10, budgetMultiplier: 0.8,
      }],
    });
    expect(relegated.clubs.local).toMatchObject({
      budget: -20_000, reputation: 14, annualRecruitmentBudget: 150_000, weeklyWageBudget: 25_000,
    });
    expect(applyRelegationResult({ ...state, ...relegated }, promotion)).toEqual(relegated);
  });

  it("renews a spent recruitment envelope once per season without raising wage capacity", () => {
    const original = club();
    const next = reapproveAnnualClubEconomics({ local: original }, {}, 2).local;
    expect(next.budget).toBe(152_000);
    expect(next.weeklyWageBudget).toBe(25_000);
    expect(next.lastRecruitmentAllocation).toEqual({
      season: 2, grant: 150_000, carryover: 2_000, returned: 0, previousBalance: 2_000,
    });
    const spent = { ...next, budget: 500, scoutingBudget: 0 };
    expect(reapproveAnnualClubEconomics({ local: spent }, {}, 2).local).toEqual(spent);
    expect(reapproveAnnualClubEconomics({ local: spent }, {}, 1).local).toEqual(spent);
    expect(original.budget).toBe(2_000);
  });

  it("keeps the grant independent of spending and surviving payroll, with bounded carryover", () => {
    let current = club({ budget: 5_000_000 });
    for (let season = 2; season <= 31; season++) {
      current = reapproveAnnualClubEconomics({ local: current }, {}, season).local;
      expect(current.budget).toBe(180_000);
      expect(current.annualRecruitmentBudget).toBe(150_000);
    }
    const wages = { veteran: { id: "veteran", clubId: "local", wage: 20_000 } as Player };
    const empty = reapproveAnnualClubEconomics({ local: club({ budget: 0 }) }, {}, 2).local;
    const full = reapproveAnnualClubEconomics({ local: club({ budget: 0 }) }, wages, 2).local;
    expect(empty.budget).toBe(full.budget);
    expect(empty.budget).toBe(150_000);
    const windfall = reapproveAnnualClubEconomics({ local: club({ budget: 5_000_000 }) }, {}, 2).local;
    expect(windfall.lastRecruitmentAllocation?.returned).toBe(4_970_000);
  });

  it("derives legacy annual funding from club stature once, never from remaining cash", () => {
    const legacy = club({ annualRecruitmentBudget: undefined, lastRecruitmentAllocation: undefined });
    const poor = reapproveAnnualClubEconomics({ local: { ...legacy, budget: 0 } }, {}, 8).local;
    const rich = reapproveAnnualClubEconomics({ local: { ...legacy, budget: 10_000_000 } }, {}, 8).local;
    expect(poor.annualRecruitmentBudget).toBe(137_200);
    expect(rich.annualRecruitmentBudget).toBe(poor.annualRecruitmentBudget);
    const later = reapproveAnnualClubEconomics({ local: { ...poor, reputation: 50, budget: 0 } }, {}, 9).local;
    expect(later.annualRecruitmentBudget).toBe(137_200);
  });

  it("preserves negative balances and unpaid obligations for ordinary settlement", () => {
    const original = club({ budget: -20_000, financialObligations: [{
      id: "debt", type: "appearanceBonus", playerId: "p", amount: 8_000,
      weeklyAmount: 2_000, remainingWeeks: 4, createdWeek: 40, createdSeason: 1,
      status: "active",
    }] });
    const next = reapproveAnnualClubEconomics({ local: original }, {}, 2).local;
    expect(next.budget).toBe(130_000);
    expect(next.financialObligations).toEqual(original.financialObligations);
    const settled = settleWeeklyClubObligations({ local: next }, 1, 2).clubs.local;
    expect(settled.budget).toBe(128_000);
    expect(settled.financialObligations?.[0].amount).toBe(6_000);
  });

  it("still rejects recruitment above either the cash or wage envelope", () => {
    const next = reapproveAnnualClubEconomics({ local: club({ budget: 0 }) }, {}, 2).local;
    expect(assessClubAffordability({ club: next, players: {}, upfrontCost: 150_001 }).affordable).toBe(false);
    expect(assessClubAffordability({ club: next, players: {}, weeklyWageCommitment: 25_001 }).affordable).toBe(false);
    expect(assessClubAffordability({ club: next, players: {}, upfrontCost: 20_000, weeklyWageCommitment: 2_000 }).affordable).toBe(true);
  });
});
