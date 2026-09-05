import { describe, expect, it } from "vitest";
import type { Club, Fixture, GameState, PlayerMatchRating } from "@/engine/core/types";
import { RNG } from "@/engine/rng";
import { generatePlayer } from "@/engine/players/generation";
import { calculateContractRenewalChance, processContractExpiries } from "@/engine/freeAgents/expiry";

class DecisionRNG extends RNG {
  readonly probabilities: number[] = [];
  constructor(private readonly decisions: boolean[]) { super("retention-decisions"); }
  override chance(probability: number): boolean {
    this.probabilities.push(probability);
    return this.decisions.shift() ?? false;
  }
}

type RenewalState = Parameters<typeof calculateContractRenewalChance>[2]
  & Pick<GameState, "clubs" | "leagues" | "currentWeek">;

function regular(reputation: number, relativeAbility = 0) {
  // Authored rounded generation ranges: [21,49], [52,93], [101,164], [119,191].
  const clubLevel = { 15: 35, 40: 72.5, 80: 132.5, 95: 155 }[reputation];
  if (clubLevel === undefined) throw new Error(`Missing club-level fixture: ${reputation}`);
  const ability = Math.ceil(clubLevel) + relativeAbility;
  const player = { ...generatePlayer(new RNG("relative-regular"), { position: "CM", ageRange: [26, 26],
    abilityRange: [ability, ability], nationality: "English", clubId: "club", clubReputation: reputation }),
    id: "target", wage: 1_000, contractExpiry: 1, form: 0, morale: 5, secondaryPositions: [], personalityProfile: undefined };
  const club: Club = { id: "club", name: "Club", shortName: "CLU", leagueId: "league", reputation,
    budget: 1_000_000, weeklyWageBudget: 1_000_000, scoutingPhilosophy: "marketSmart",
    managerId: "manager", playerIds: [player.id], youthAcademyRating: 4 };
  const fixtures: Record<string, Fixture> = {};
  const matchRatings: Record<string, Record<string, PlayerMatchRating>> = {};
  for (let index = 0; index < 12; index += 1) {
    const id = `fixture-${index}`;
    fixtures[id] = { id, season: 1, week: index + 1, leagueId: "league", homeClubId: club.id, awayClubId: "opponent", played: true };
    matchRatings[id] = { [player.id]: { playerId: player.id, fixtureId: id, started: true, minutesPlayed: 90, rating: 7, eventCount: 4, stats: {}, source: "simulated" } };
  }
  const state: RenewalState = { players: { [player.id]: player }, clubs: { [club.id]: club }, currentSeason: 1, currentWeek: 46,
    fixtures, matchRatings, managerProfiles: {}, leagues: { league: { id: "league", name: "League", shortName: "LGE", country: "England", tier: 3, clubIds: [club.id], season: 1 } } };
  return { player, club, state };
}

describe("contract retention relative to club level", () => {
  it("values equally suitable regulars equally across club levels before independent player acceptance", () => {
    const measurements = [15, 40, 80, 95].map((reputation) => {
      const { player, club, state } = regular(reputation);
      const rng = new DecisionRNG([true, true]);
      // All fields read by expiry are supplied; no career creation or tick is needed.
      const result = processContractExpiries(state as GameState, rng);
      expect(result.renewedPlayerIds).toEqual([player.id]);
      expect(rng.probabilities).toHaveLength(2);
      return { reputation, ability: player.currentAbility, clubOffer: calculateContractRenewalChance(player, club, state),
        playerAcceptance: rng.probabilities[1], combinedChanceWhenAffordable: rng.probabilities[0] * rng.probabilities[1] };
    });
    console.info("RELATIVE_RETENTION_MEASUREMENTS", JSON.stringify(measurements));
    expect(measurements[0].clubOffer).toBeCloseTo(measurements[1].clubOffer);
    expect(measurements[0].clubOffer).toBeCloseTo(measurements[2].clubOffer);
    expect(measurements[0].clubOffer).toBeCloseTo(measurements[3].clubOffer);
    expect(measurements[0].clubOffer).toBeCloseTo(0.92);
    expect(measurements.every((row) => row.clubOffer < 1 && row.playerAcceptance < 1)).toBe(true);
    expect(measurements[0].playerAcceptance).toBe(measurements[2].playerAcceptance);
  });

  it.each([15, 40, 80, 95])("distinguishes above-level, fringe and below-level players at reputation %i", (reputation) => {
    const aboveLevel = regular(reputation, 10);
    const fringe = regular(reputation, -10);
    const belowLevel = regular(reputation, -25);
    const score = (fixture: ReturnType<typeof regular>) => calculateContractRenewalChance(fixture.player, fixture.club, fixture.state);
    expect(score(aboveLevel)).toBeGreaterThan(score(fringe));
    expect(score(fringe)).toBeGreaterThan(score(belowLevel));
  });

  it("lets an appropriate regular reject the club's renewal offer", () => {
    const { player, state } = regular(15);
    const rng = new DecisionRNG([true, false]);
    const result = processContractExpiries(state as GameState, rng);
    expect(rng.probabilities).toHaveLength(2);
    expect(result.renewals).toEqual([]);
    expect(result.releasedPlayers.map((entry) => entry.playerId)).toEqual([player.id]);
    expect(player.contractExpiry).toBe(1);
  });

  it("cannot renew beyond the actual approved wage capacity", () => {
    const { player, club, state } = regular(15);
    club.weeklyWageBudget = 500;
    const rng = new DecisionRNG([true, true]);
    const result = processContractExpiries(state as GameState, rng);
    expect(rng.probabilities).toHaveLength(1);
    expect(result.renewals).toEqual([]);
    expect(result.releasedPlayers.map((entry) => entry.playerId)).toEqual([player.id]);
  });

  it("still permits the club to decline a suitable player", () => {
    const { player, state } = regular(15);
    const result = processContractExpiries(state as GameState, new DecisionRNG([false]));
    expect(result.renewals).toEqual([]);
    expect(result.releasedPlayers.map((entry) => entry.playerId)).toEqual([player.id]);
  });
});
