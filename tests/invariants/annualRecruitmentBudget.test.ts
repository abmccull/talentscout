import { describe, expect, it } from "vitest";
import type { Club, GameState, Player } from "@/engine/core/types";
import { applyRelegationResult, type RelegationResult } from "@/engine/world/relegation";
import { assessClubAffordability, reapproveAnnualClubEconomics, settleWeeklyClubObligations } from "@/engine/finance/clubEconomics";
import { expandClubFinancialObligation } from "@/engine/finance/terminalRecordArchive";

function club(overrides: Partial<Club> = {}): Club {
  return { id: "local", name: "Local", shortName: "LOC", leagueId: "lower", reputation: 14,
    budget: 2_000, weeklyWageBudget: 25_000, scoutingBudget: 5_000, scoutingPhilosophy: "academyFirst",
    managerId: "manager", playerIds: [], youthAcademyRating: 3,
    recruitmentAllocation: { season: 1, amount: 150_000, budgetBefore: 0, budgetAfter: 150_000 }, ...overrides };
}
const promotion: RelegationResult = { season: 1, flaggedPlayerIds: [], messages: [], events: [{
  clubId: "local", clubName: "Local", fromLeagueId: "lower", toLeagueId: "upper", type: "promoted",
  reputationChange: 10, budgetMultiplier: 1.15 }] };
function world(local: Club): GameState { return { clubs: { local }, players: {}, leagues: {
  lower: { id: "lower", clubIds: ["local"] }, upper: { id: "upper", clubIds: [] } } } as unknown as GameState; }
describe("annual club recruitment funding", () => {
  it("preserves debt through a round trip and rejects an old movement replay", () => {
    const state = world(club({ budget: -20_000 }));
    const promoted = applyRelegationResult(state, promotion);
    expect(promoted.clubs.local.budget).toBe(-20_000);
    const relegated = applyRelegationResult({ ...state, ...promoted }, { ...promotion, season: 2,
      events: [{ ...promotion.events[0], fromLeagueId: "upper", toLeagueId: "lower", type: "relegated",
        reputationChange: -10, budgetMultiplier: 0.8 }] });
    expect(relegated.clubs.local).toMatchObject({ budget: -20_000, reputation: 14, weeklyWageBudget: 25_000 });
    expect(applyRelegationResult({ ...state, ...relegated }, promotion)).toEqual(relegated);
  });
  it("funds the promoted stature once without overwriting accumulated cash", () => {
    const state = world(club());
    const promoted = applyRelegationResult(state, promotion);
    const next = reapproveAnnualClubEconomics(promoted.clubs, {}, 2).local;
    expect(next.budget).toBe(promoted.clubs.local.budget + next.recruitmentAllocation!.amount);
    expect(next.recruitmentAllocation!.amount).toBeGreaterThan(reapproveAnnualClubEconomics(state.clubs, {}, 2).local.recruitmentAllocation!.amount);
    const spent = { ...next, budget: 500, scoutingBudget: 0 };
    expect(reapproveAnnualClubEconomics({ local: spent }, {}, 2).local).toEqual(spent);
    expect(reapproveAnnualClubEconomics({ local: spent }, {}, 1).local).toEqual(spent);
    expect(state.clubs.local.budget).toBe(2_000);
  });
  it("keeps the annual grant independent of spending and surviving payroll", () => {
    const wages = { veteran: { id: "veteran", clubId: "local", wage: 20_000 } as Player };
    const empty = reapproveAnnualClubEconomics({ local: club({ budget: 0 }) }, {}, 2).local;
    const full = reapproveAnnualClubEconomics({ local: club({ budget: 0 }) }, wages, 2).local;
    const rich = reapproveAnnualClubEconomics({ local: club({ budget: 5_000_000 }) }, {}, 2).local;
    expect(empty.recruitmentAllocation!.amount).toBe(full.recruitmentAllocation!.amount);
    expect(empty.recruitmentAllocation!.amount).toBe(rich.recruitmentAllocation!.amount);
    expect(rich.budget - empty.budget).toBe(5_000_000);
    let current = rich;
    for (let season = 3; season <= 31; season++) {
      const next = reapproveAnnualClubEconomics({ local: current }, {}, season).local;
      expect(next.budget - current.budget).toBe(empty.recruitmentAllocation!.amount);
      current = next;
    }
  });
  it("retains unpaid obligations and adds the grant to the true negative balance", () => {
    const original = club({ budget: -20_000, financialObligations: [{ id: "debt", type: "appearanceBonus",
      playerId: "p", amount: 8_000, weeklyAmount: 2_000, remainingWeeks: 4,
      createdWeek: 40, createdSeason: 1, status: "active" }] });
    const next = reapproveAnnualClubEconomics({ local: original }, {}, 2).local;
    expect(next.budget).toBe(-20_000 + next.recruitmentAllocation!.amount);
    expect(next.financialObligations).toEqual(original.financialObligations);
    const settled = settleWeeklyClubObligations({ local: next }, 1, 2).clubs.local;
    expect(settled.budget).toBe(next.budget - 2_000);
    expect(expandClubFinancialObligation(settled.financialObligations![0]).amount).toBe(6_000);
  });
  it("rejects recruitment above either independently approved envelope", () => {
    const next = reapproveAnnualClubEconomics({ local: club({ budget: 0 }) }, {}, 2).local;
    expect(assessClubAffordability({ club: next, players: {}, upfrontCost: next.budget + 1 }).affordable).toBe(false);
    expect(assessClubAffordability({ club: next, players: {}, weeklyWageCommitment: next.weeklyWageBudget! + 1 }).affordable).toBe(false);
  });
});
