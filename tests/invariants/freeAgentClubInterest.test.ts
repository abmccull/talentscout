import { describe, expect, it } from "vitest";
import type { Club, FreeAgent, GameState, Player } from "@/engine/core/types";
import {
  scoreFreeAgentClubInterest,
  tickFreeAgentPool,
} from "@/engine/freeAgents/pool";

function club(id: string, playerIds: string[]): Club {
  return {
    id,
    name: id,
    shortName: id,
    leagueId: "league",
    reputation: 55,
    budget: 10_000_000,
    scoutingPhilosophy: "marketSmart",
    managerId: `${id}-manager`,
    playerIds,
    youthAcademyRating: 12,
  };
}

describe("NPC free-agent club interest", () => {
  it("prioritizes a genuine positional need over an already crowded squad lane", () => {
    const striker = { age: 25, position: "ST", currentAbility: 110 } as Player;
    const players = {
      s1: { id: "s1", position: "ST" },
      s2: { id: "s2", position: "ST" },
      s3: { id: "s3", position: "ST" },
    } as unknown as GameState["players"];
    const state = {
      players,
      managerProfiles: {},
      leagues: {},
      seed: "free-agent-interest",
      currentSeason: 2,
    };

    const needy = scoreFreeAgentClubInterest(striker, club("need", []), state);
    const crowded = scoreFreeAgentClubInterest(
      striker,
      club("crowded", ["s1", "s2", "s3"]),
      state,
    );

    expect(needy).toBeGreaterThan(crowded * 3);
  });

  it("keeps doctrine and geography in the club-interest weighting", () => {
    const striker = { age: 24, position: "ST", currentAbility: 112 } as Player;
    const state = {
      players: {},
      managerProfiles: {
        academy: { clubId: "academy", preferredFormation: "4-4-2" },
      },
      leagues: {
        "league-academy": { id: "league-academy", country: "England" },
      },
      seed: "free-agent-geo",
      currentSeason: 4,
    } as unknown as GameState;
    const academyClub: Club = {
      ...club("academy", []),
      leagueId: "league-academy",
      scoutingPhilosophy: "academyFirst",
    };

    const domestic = scoreFreeAgentClubInterest(
      striker,
      academyClub,
      state,
      { country: "england", nationality: "English" },
    );
    const foreign = scoreFreeAgentClubInterest(
      striker,
      academyClub,
      state,
      { country: "brazil", nationality: "Brazilian" },
    );

    expect(domestic).toBeGreaterThan(foreign);
  });

  it("drops terminal free-agent entries on the next pool tick instead of accumulating them", () => {
    const agent = (playerId: string, status: FreeAgent["status"]): FreeAgent => ({
      playerId,
      country: "england",
      nationality: "English",
      releasedFrom: "club",
      releasedSeason: 2,
      weeksInPool: 1,
      maxWeeksInPool: 20,
      wageExpectation: 1_000,
      signingBonusExpectation: 2_000,
      discoverySource: null,
      discoveredByScout: false,
      npcInterest: [],
      status,
    });
    const state = {
      currentWeek: 10,
      currentSeason: 2,
      players: {},
      clubs: {},
      leagues: {},
      freeAgentPool: {
        agents: [
          agent("signed", "signed"),
          agent("retired", "retired"),
          agent("dropped", "droppedOut"),
          agent("live", "available"),
          agent("negotiating", "inNegotiation"),
        ],
        lastRefreshSeason: 2,
        totalReleasedThisSeason: 0,
        totalSignedThisSeason: 0,
        totalRetiredThisSeason: 0,
      },
    } as unknown as GameState;
    const rng = {
      chance: () => false,
      nextInt: (min: number) => min,
      pickWeighted: <T,>(items: Array<{ item: T }>) => items[0].item,
    };

    const result = tickFreeAgentPool(state, rng as never, { allowMidSeasonReleases: false });

    expect(result.updatedPool.agents.map((entry) => entry.playerId).sort()).toEqual([
      "live",
      "negotiating",
    ]);
  });
});
