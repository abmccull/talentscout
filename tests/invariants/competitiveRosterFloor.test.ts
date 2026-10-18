import { describe, expect, it } from "vitest";
import type { Club, FreeAgent, GameState, Player } from "@/engine/core/types";
import {
  tickFreeAgentPool,
} from "@/engine/freeAgents/pool";
import { processContractExpiries } from "@/engine/freeAgents/expiry";
import { RNG } from "@/engine/rng";
import {
  COMPETITIVE_ROSTER_OUTFLOW_FLOOR,
} from "@/engine/match/eligibleRoster";

function club(id: string, playerIds: string[], extras: Partial<Club> = {}): Club {
  return {
    id,
    name: id,
    shortName: id,
    leagueId: "league",
    reputation: 55,
    budget: 10_000_000,
    weeklyWageBudget: 500_000,
    scoutingPhilosophy: "marketSmart",
    managerId: `${id}-manager`,
    playerIds,
    academyPlayerIds: [],
    youthAcademyRating: 12,
    ...extras,
  };
}

function player(id: string, position: Player["position"], clubId: string, ability = 110): Player {
  return {
    id,
    firstName: id,
    lastName: "Test",
    age: 24,
    nationality: "English",
    position,
    secondaryPositions: [],
    clubId,
    contractClubId: clubId,
    contractExpiry: 2,
    currentAbility: ability,
    potentialAbility: ability + 10,
    marketValue: 40_000,
    wage: 800,
    form: 0,
    morale: 5,
    injured: false,
    attributes: {},
    personalityProfile: { transferWillingness: 0.95 },
    seasonRatings: [],
    recentMatchRatings: [],
  } as unknown as Player;
}

describe("competitive roster floor ordinary-market guards", () => {
  it("blocks mid-season releases inside the outflow buffer above the XI floor", () => {
    const ids = Array.from({ length: COMPETITIVE_ROSTER_OUTFLOW_FLOOR }, (_, index) => `p${index}`);
    const players = Object.fromEntries(ids.map((id, index) => [
      id,
      player(id, index === 0 ? "GK" : "CM", "club", 50),
    ])) as Record<string, Player>;
    for (const entry of Object.values(players)) {
      entry.age = 28;
      entry.contractExpiry = 4;
    }
    const state = {
      currentWeek: 20,
      currentSeason: 2,
      players,
      clubs: { club: club("club", ids) },
      leagues: { league: { id: "league", country: "England" } },
      freeAgentPool: {
        agents: [],
        lastRefreshSeason: 2,
        totalReleasedThisSeason: 0,
        totalSignedThisSeason: 0,
        totalRetiredThisSeason: 0,
      },
      managerProfiles: {},
      seed: "mid-season-floor",
    } as unknown as GameState;
    const rng = {
      chance: () => true,
      nextInt: (min: number) => min,
      pickWeighted: <T,>(items: Array<{ item: T }>) => items[0]?.item,
      gaussian: () => 0,
    };

    const result = tickFreeAgentPool(state, rng as never);
    expect(result.midSeasonReleases).toEqual([]);
  });


  it("restores signed-but-unattached free agents to the available market", () => {
    const players = {
      orphan: player("orphan", "GK", "", 40),
    } as Record<string, Player>;
    players.orphan.clubId = undefined as unknown as string;
    players.orphan.contractClubId = undefined;
    const state = {
      currentWeek: 4,
      currentSeason: 2,
      players,
      clubs: {
        thin: club("thin", [], { reputation: 20, budget: 200_000, weeklyWageBudget: 20_000 }),
      },
      leagues: { league: { id: "league", country: "England" } },
      freeAgentPool: {
        agents: [{
          playerId: "orphan",
          country: "england",
          nationality: "English",
          releasedFrom: "other",
          releasedSeason: 1,
          weeksInPool: 3,
          maxWeeksInPool: 20,
          wageExpectation: 400,
          signingBonusExpectation: 400,
          discoverySource: null,
          discoveredByScout: false,
          npcInterest: [],
          status: "signed",
        }],
        lastRefreshSeason: 2,
        totalReleasedThisSeason: 0,
        totalSignedThisSeason: 0,
        totalRetiredThisSeason: 0,
      },
      managerProfiles: {},
      seed: "orphan-restore",
    } as unknown as GameState;
    const rng = new RNG("orphan-restore");
    rng.chance = () => false;
    const result = tickFreeAgentPool(state, rng, { allowMidSeasonReleases: false });
    expect(result.updatedPool.agents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ playerId: "orphan", status: "available" }),
      ]),
    );
    expect(result.npcSignedPlayerIds).toEqual([]);
    expect(Object.keys(state.players)).toEqual(["orphan"]);
  });

  it("still releases when a floor-preserving renewal is unaffordable", () => {
    const ids = Array.from({ length: 5 }, (_, index) => `u${index}`);
    const players = Object.fromEntries(ids.map((id, index) => {
      const entry = player(id, index === 0 ? "GK" : "CM", "club", 55);
      entry.contractExpiry = 1;
      entry.wage = 5_000;
      return [id, entry];
    })) as Record<string, Player>;
    const state = {
      currentWeek: 46,
      currentSeason: 1,
      players,
      clubs: {
        club: club("club", ids, {
          reputation: 20,
          budget: 0,
          weeklyWageBudget: 100,
        }),
      },
      leagues: {
        league: {
          id: "league", name: "League", shortName: "LGE", country: "England",
          tier: 4, clubIds: ["club"], season: 1,
        },
      },
      fixtures: {},
      matchRatings: {},
      managerProfiles: {},
    } as unknown as GameState;
    const rng = new RNG("unaffordable-floor");
    rng.chance = () => true;
    const result = processContractExpiries(state, rng);
    expect(result.renewedPlayerIds).toEqual([]);
    expect(result.releasedPlayers.map((agent: FreeAgent) => agent.playerId).sort())
      .toEqual(ids.sort());
  });
});
