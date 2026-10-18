import { describe, expect, it } from "vitest";
import type { Club, FreeAgent, GameState, Player } from "@/engine/core/types";
import { recruitForSeasonOpening } from "@/engine/freeAgents/seasonOpening";
import { getClubWeeklyCommitmentTotal } from "@/engine/finance/clubEconomics";
import { RNG } from "@/engine/rng";

function world(supply: boolean, wageBudget = 30_000): GameState {
  const players: Record<string, Player> = {};
  for (let index = 0; index < 10; index++) players['p' + index] = { id: 'p' + index, firstName: 'P', lastName: String(index),
    age: 24, nationality: "English", position: "CM", clubId: "club", contractClubId: "club", contractExpiry: 5,
    currentAbility: 40, potentialAbility: 50, wage: 500, marketValue: 5_000 } as Player;
  const club: Club = { id: "club", name: "Club", shortName: "C", leagueId: "league", reputation: 20,
    budget: 100_000, weeklyWageBudget: wageBudget, scoutingPhilosophy: "marketSmart", managerId: "m",
    playerIds: Object.keys(players), academyPlayerIds: [], youthAcademyRating: 5 };
  const agents: FreeAgent[] = [];
  if (supply) {
    players.keeper = { ...players.p0, id: "keeper", position: "GK", clubId: "", contractClubId: undefined, contractExpiry: 0 };
    agents.push({ playerId: "keeper", country: "england", nationality: "English", releasedFrom: "other", releasedSeason: 1,
      weeksInPool: 1, maxWeeksInPool: 52, wageExpectation: 500, signingBonusExpectation: 1_000,
      discoverySource: null, discoveredByScout: false, npcInterest: [], status: "available" });
  }
  return { seed: "ordinary-repair", currentWeek: 1, currentSeason: 2, players, clubs: { club },
    leagues: { league: { id: "league", country: "England", tier: 4, clubIds: ["club"] } },
    managerProfiles: {}, fixtures: {}, activeLoans: [], loanHistory: [], retiredPlayers: {}, retiredPlayerIds: [],
    playerMovementHistory: [], inbox: [], freeAgentPool: { agents, lastRefreshSeason: 2,
      totalReleasedThisSeason: 0, totalSignedThisSeason: 0, totalRetiredThisSeason: 0 } } as unknown as GameState;
}
describe("thin-squad recovery through the ordinary season-opening authority", () => {
  it("fills a missing goalkeeper from a real funded and accepted offer", () => {
    const state = world(true); const before = structuredClone(state);
    const rng = new RNG("accepted"); rng.chance = () => true;
    const next = recruitForSeasonOpening(state, rng);
    expect(next.players.keeper.clubId).toBe("club");
    expect(next.clubs.club.budget).toBe(state.clubs.club.budget - 1_000);
    expect(getClubWeeklyCommitmentTotal(next.clubs.club, next.players)).toBeLessThanOrEqual(next.clubs.club.weeklyWageBudget!);
    expect(Object.keys(next.players)).toEqual(Object.keys(state.players));
    expect(state).toEqual(before);
  });
  it.each(["empty", "declined", "payroll"])("keeps a truthful vacancy when ordinary supply is %s", mode => {
    const state = world(mode !== "empty", mode === "payroll" ? 5_000 : 30_000);
    const before = structuredClone(state); const rng = new RNG(mode); rng.chance = () => mode !== "declined";
    const next = recruitForSeasonOpening(state, rng);
    expect(next.clubs.club.playerIds).toEqual(before.clubs.club.playerIds);
    expect(next.clubs.club.budget).toBe(before.clubs.club.budget);
    expect(next.clubs.club.weeklyWageBudget).toBe(before.clubs.club.weeklyWageBudget);
    expect(Object.keys(next.players)).toEqual(Object.keys(before.players));
    expect(state).toEqual(before);
  });
});
