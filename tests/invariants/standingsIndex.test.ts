import { describe, expect, it } from "vitest";
import type { Club, Fixture } from "@/engine/core/types";
import {
  buildStandings,
  buildStandingsByLeague,
} from "@/engine/core/standings";

function club(id: string, leagueId: string): Club {
  return {
    id,
    name: id,
    shortName: id,
    leagueId,
    reputation: 50,
    budget: 1_000_000,
    scoutingPhilosophy: "marketSmart",
    managerId: `manager-${id}`,
    playerIds: [],
    youthAcademyRating: 10,
  };
}

function fixture(
  id: string,
  leagueId: string,
  homeClubId: string,
  awayClubId: string,
  season: number,
  played: boolean,
  homeGoals?: number,
  awayGoals?: number,
): Fixture {
  return {
    id,
    leagueId,
    homeClubId,
    awayClubId,
    season,
    week: 1,
    played,
    ...(homeGoals === undefined ? {} : { homeGoals }),
    ...(awayGoals === undefined ? {} : { awayGoals }),
  };
}

describe("standings multi-league index", () => {
  it("matches independent league tables while enumerating world records once", () => {
    const clubs = {
      a: club("a", "league-a"),
      b: club("b", "league-a"),
      c: club("c", "league-b"),
      d: club("d", "league-b"),
      e: club("e", "league-empty"),
    };
    const fixtures = {
      a1: fixture("a1", "league-a", "a", "b", 3, true, 2, 1),
      a2: fixture("a2", "league-a", "b", "a", 3, true, 0, 0),
      aOld: fixture("a-old", "league-a", "a", "b", 2, true, 5, 0),
      b1: fixture("b1", "league-b", "c", "d", 3, true, 1, 3),
      bUnplayed: fixture("b-unplayed", "league-b", "d", "c", 3, false),
      bMissingScore: fixture("b-missing", "league-b", "c", "d", 3, true),
      malformed: fixture("malformed", "league-a", "a", "c", 3, true, 9, 9),
    };
    let clubEnumerations = 0;
    let fixtureEnumerations = 0;
    const guardedClubs = new Proxy(clubs, {
      ownKeys(target) {
        clubEnumerations += 1;
        return Reflect.ownKeys(target);
      },
    });
    const guardedFixtures = new Proxy(fixtures, {
      ownKeys(target) {
        fixtureEnumerations += 1;
        return Reflect.ownKeys(target);
      },
    });

    const indexed = buildStandingsByLeague(guardedFixtures, guardedClubs, 3);

    expect(clubEnumerations).toBe(1);
    expect(fixtureEnumerations).toBe(1);
    for (const leagueId of ["league-a", "league-b", "league-empty", "missing"]) {
      expect(indexed[leagueId] ?? {}).toEqual(
        buildStandings(leagueId, fixtures, clubs, 3),
      );
    }
  });
});
