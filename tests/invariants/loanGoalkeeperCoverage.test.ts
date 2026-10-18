import { describe, expect, it } from "vitest";
import type { Club, Player, GameState } from "@/engine/core/types";
import { RNG } from "@/engine/rng";
import { isLoanEligible, retainsFirstTeamAfterLoan, processAILoanDeals, findLoanDestination } from "@/engine/world/loans";

const keeper = { id: "keeper", clubId: "parent", contractClubId: "parent", age: 20,
  position: "GK", currentAbility: 50, contractExpiry: 5 } as Player;
const outfield = Object.fromEntries(Array.from({ length: 5 }, (_, index) => {
  const id = `outfield-${index}`;
  return [id, { ...keeper, id, position: "CM", currentAbility: 100 } as Player];
}));
const club = { id: "parent", playerIds: [keeper.id, ...Object.keys(outfield), "cover"] } as Club;
const cover = { ...keeper, id: "cover", age: 26 };

describe("goalkeeper loan coverage", () => {
  it("allows experienced surplus keeper loans while retaining two fit senior keepers", () => {
    const veteran = { ...keeper, age: 31 };
    const secondCover = { ...cover, id: "second-cover" };
    const parent = { ...club, playerIds: [...club.playerIds, secondCover.id] };
    const players = { ...outfield, keeper: veteran, cover, [secondCover.id]: secondCover };
    expect(isLoanEligible(veteran, parent, players, 1)).toBe(true);
    expect(isLoanEligible(veteran, parent, players, 1, new Set(["cover"]))).toBe(false);
    expect(isLoanEligible(veteran, parent, { ...players, cover: { ...cover, injured: true } }, 1)).toBe(false);
    expect(isLoanEligible({ ...veteran, injured: true }, parent, players, 1)).toBe(false);
    expect(isLoanEligible({ ...veteran, currentAbility: 150 }, parent, players, 1)).toBe(false);
    expect(isLoanEligible({ ...veteran, position: "CM" }, parent, players, 1)).toBe(false);
  });

  it("routes experienced keepers only to clubs needing keeper coverage", () => {
    const veteran = { ...keeper, age: 31, wage: 500 };
    const parent = { ...club, reputation: 60, leagueId: "home" };
    const host = { ...parent, id: "host", reputation: 40, budget: 100_000, playerIds: [] as string[] };
    const players = { one: { ...cover, id: "one", clubId: "host" }, two: { ...cover, id: "two", clubId: "host" } };
    const choose = (ids: string[]) => findLoanDestination(veteran, parent, { host: { ...host, playerIds: ids } }, players, new RNG("veteran-cover"));
    expect(choose([])?.id).toBe("host");
    expect(choose(["one"])?.id).toBe("host");
    expect(choose(["one", "two"])).toBeNull();
  });

  it("permits a domestic peer loan only with a clear opportunity at the player's position", () => {
    const prospect = { ...keeper, position: "CM", wage: 500 } as Player;
    const parent = { ...club, reputation: 30, leagueId: "home" };
    const host = { ...parent, id: "host", playerIds: [], budget: 100_000, reputation: 32 };
    const leagues = { home: { country: "england" }, foreign: { country: "france" } } as unknown as GameState["leagues"];
    const choose = (destination: Club, players: Record<string, Player> = {}) => findLoanDestination(
      prospect, parent, { host: destination }, players, new RNG("peer-loan"), leagues,
    );
    expect(choose(host)?.id).toBe("host");
    expect(choose({ ...host, leagueId: "foreign" })).toBeNull();
    expect(choose({ ...host, reputation: 36 })).toBeNull();
    expect(choose({ ...host, playerIds: ["incumbent"] }, {
      incumbent: { ...prospect, id: "incumbent", currentAbility: 80 },
    })).toBeNull();
    expect(choose({ ...host, playerIds: ["incumbent"] }, {
      incumbent: { ...prospect, id: "incumbent", currentAbility: 40 },
    })?.id).toBe("host");
  });
  it("selects a funded borrower and reserves each accepted weekly contribution", () => {
    const players = Object.fromEntries(Array.from({ length: 21 }, (_, i) => {
      const id = `p-${i}`;
      return [id, { ...keeper, id, position: "CM", currentAbility: i < 5 ? 100 : 50,
        wage: 500, marketValue: 10_000 } as Player];
    }));
    const parent = { ...club, playerIds: Object.keys(players), reputation: 60,
      budget: 100_000, weeklyWageBudget: 100_000, leagueId: "england", loanedOutPlayerIds: [] };
    const poor = { ...parent, id: "poor", playerIds: [], reputation: 40, weeklyWageBudget: 100 };
    // £500 loan allowance plus £1,000 reserved for the missing goalkeeper.
    const funded = { ...poor, id: "funded", weeklyWageBudget: 1_500 };
    const state = { players, clubs: { parent, poor, funded }, reports: {},
      leagues: { england: { country: "england" } }, loanRecommendations: [] } as unknown as GameState;
    const rng = new RNG("loan-borrower-funds");
    rng.chance = () => true;
    const result = processAILoanDeals(state, 1, 1, rng);
    expect(result.deals).toHaveLength(1);
    expect(result.deals[0].loanClubId).toBe("funded");
    expect(result.deals.reduce((total, deal) => total + Math.round(500 * deal.wageContribution / 100), 0)).toBeLessThanOrEqual(500);
    expect(funded.playerIds).toEqual([]);
  });
  it("stops the automatic loan batch when the parent reaches eighteen adults", () => {
    const players = Object.fromEntries(Array.from({ length: 21 }, (_, i) => {
      const id = `p-${i}`;
      return [id, { ...keeper, id, position: "CM", currentAbility: i < 5 ? 100 : 50,
        wage: 500, marketValue: 10_000 } as Player];
    }));
    const parent = { ...club, playerIds: Object.keys(players), reputation: 60,
      budget: 100_000, weeklyWageBudget: 100_000, leagueId: "england", loanedOutPlayerIds: [] };
    const host = { ...parent, id: "host", playerIds: [], reputation: 40 };
    const state = { players, clubs: { parent, host }, reports: {},
      leagues: { england: { country: "england" } }, loanRecommendations: [] } as unknown as GameState;
    const rng = new RNG("loan-parent-cover");
    rng.chance = () => true;
    const result = processAILoanDeals(state, 1, 1, rng);
    expect(result.deals).toHaveLength(3);
    expect(new Set(result.deals.map((deal) => deal.playerId)).size).toBe(3);
    expect(parent.playerIds).toHaveLength(21);
  });
  it("protects eighteen adult first-team places from automatic departures including same-week agreements", () => {
    const players = Object.fromEntries(Array.from({ length: 20 }, (_, i) => {
      const id = `p-${i}`;
      return [id, { ...keeper, id, position: "CM" } as Player];
    }));
    const parent = { ...club, playerIds: Object.keys(players) };
    expect(retainsFirstTeamAfterLoan(players['p-0'], parent, players)).toBe(true);
    expect(retainsFirstTeamAfterLoan(players['p-1'], parent, players, new Set(['p-0']))).toBe(true);
    expect(retainsFirstTeamAfterLoan(players['p-2'], parent, players, new Set(['p-0', 'p-1']))).toBe(false);
    players['p-19'] = { ...players['p-19'], clubId: 'elsewhere' };
    expect(retainsFirstTeamAfterLoan(players['p-1'], parent, players, new Set(['p-0']))).toBe(false);
    expect(retainsFirstTeamAfterLoan({ ...keeper, age: 17 }, parent, players)).toBe(true);
    expect(parent.playerIds).toHaveLength(20);
  });
  it("keeps the only senior keeper even when their ability is below the top five", () => {
    expect(isLoanEligible(keeper, club, { ...outfield, keeper }, 1)).toBe(false);
  });
  it("allows a development loan when a fit senior keeper remains", () => {
    expect(isLoanEligible(keeper, club, { ...outfield, keeper, cover }, 1)).toBe(true);
    expect(isLoanEligible(keeper, club, { ...outfield, keeper,
      cover: { ...cover, onLoan: true, contractClubId: "lender" },
    }, 1)).toBe(true);
  });
  it("does not count injured, departed, foreign or academy keepers as available senior cover", () => {
    for (const patch of [{ injured: true }, { onLoan: true, clubId: "host" }, { clubId: "other" }, { age: 17 }]) {
      expect(isLoanEligible(keeper, club, { ...outfield, keeper, cover: { ...cover, ...patch } }, 1)).toBe(false);
    }
    expect(isLoanEligible(keeper, club, { ...outfield, keeper, cover }, 1, new Set(["cover"]))).toBe(false);
  });
});

it("keeps promoted teenagers when a loan would remove emergency outfield cover", () => {
  const players = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i), {
    ...keeper, id: String(i), position: i < 2 ? "GK" : "CM", age: i === 11 ? 17 : 22,
  } as Player]));
  const parent = { ...club, playerIds: Object.keys(players) };
  expect(retainsFirstTeamAfterLoan(players["11"], parent, players)).toBe(false);
  players.extra = { ...players["11"], id: "extra" };
  parent.playerIds.push("extra");
  expect(retainsFirstTeamAfterLoan(players["11"], parent, players)).toBe(true);
  expect(retainsFirstTeamAfterLoan(players.extra, parent, players, new Set(["11"]))).toBe(false);
});
