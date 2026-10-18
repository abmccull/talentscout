import { expect, it } from "vitest";
import type { Club, GameState, Player } from "@/engine/core/types";
import { RNG } from "@/engine/rng";
import { calculateLoanTerms, isLoanEligible, processAILoanDeals } from "@/engine/world/loans";
import { loanContractWeeksRemaining, loanFitsOwnershipContract } from "@/engine/world/loanContract";

const player = { id: "p", clubId: "parent", contractClubId: "parent", contractExpiry: 4,
  age: 21, position: "CM", currentAbility: 50, wage: 500, marketValue: 50_000 } as Player;
const parent = { id: "parent", reputation: 50, playerIds: ["p"] } as Club;
const host = { id: "host", reputation: 30 } as Club;

it.each([22, 40, 46])("caps every sampled loan at expiry on a %i-week calendar", length => {
  for (const week of [1, length - 15, length - 4]) {
    expect(isLoanEligible(player, parent, { p: player }, 4, new Set(), week, length)).toBe(true);
    for (let seed = 0; seed < 40; seed++) {
      const terms = calculateLoanTerms(player, parent, host, week, 4, new RNG(`term-${seed}`), length);
      expect(loanFitsOwnershipContract(player, terms, length)).toBe(true);
      expect(terms.endSeason).toBe(4);
      expect(terms.endWeek).toBeLessThanOrEqual(length);
    }
  }
});

it("accepts a next-season contract but rejects fewer than four remaining weeks", () => {
  expect(isLoanEligible({ ...player, contractExpiry: 5 }, parent, { p: player }, 4, new Set(), 46, 46)).toBe(true);
  expect(isLoanEligible(player, parent, { p: player }, 4, new Set(), 43, 46)).toBe(false);
  expect(() => calculateLoanTerms(player, parent, host, 43, 4, new RNG("too-short"), 46)).toThrow(/minimum loan duration/);
  expect(loanContractWeeksRemaining(player, 47, 4, 46)).toBe(0);
  expect(loanContractWeeksRemaining({ contractExpiry: NaN }, 1, 4, 46)).toBe(0);
});

it("checks actual return dates instead of only the start-season year", () => {
  const deal = { startWeek: 38, startSeason: 4, endWeek: 40, endSeason: 4 };
  expect(loanFitsOwnershipContract(player, deal, 40)).toBe(true);
  expect(loanFitsOwnershipContract(player, { ...deal, endWeek: 1, endSeason: 5 }, 40)).toBe(false);
  expect(loanFitsOwnershipContract(player, { ...deal, endWeek: NaN }, 40)).toBe(false);
  expect(loanFitsOwnershipContract(player, { ...deal, endWeek: 37 }, 40)).toBe(false);
});

it("caps a scout-recommended loan and its fee at the same ownership boundary", () => {
  const state = { players: { p: player }, clubs: {
    parent: { ...parent, budget: 100_000, weeklyWageBudget: 100_000 },
    host: { ...host, budget: 100_000, weeklyWageBudget: 100_000, playerIds: [], youthAcademyRating: 10 },
  }, scout: { id: "scout", currentClubId: "parent", reputation: 80 }, reports: {},
  loanRecommendations: [{ id: "rec", playerId: "p", targetClubId: "host", scoutId: "scout", week: 35,
    season: 4, rationale: "playing-time", suggestedDuration: 999, suggestedWageContribution: 50, status: "pending" }],
  } as unknown as GameState;
  const rng = new RNG("short-contract-recommendation");
  rng.chance = () => true;
  const result = processAILoanDeals(state, 35, 4, rng, 40);
  expect(result.deals).toHaveLength(1);
  expect(result.deals[0]).toMatchObject({ endWeek: 40, endSeason: 4 });
  expect(result.deals[0].loanFee).toBeLessThanOrEqual(Math.round(player.wage * 5 * 0.12));
  expect(loanFitsOwnershipContract(player, result.deals[0], 40)).toBe(true);
});
