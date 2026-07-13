import { describe, expect, it } from "vitest";
import type {
  Club,
  Fixture,
  GameState,
  League,
} from "@/engine/core/types";
import { buildStandings } from "@/engine/core/standings";
import { createRNG } from "@/engine/rng";
import {
  ensureSeasonFixtures,
  getFixtureSeason,
  normalizeFixtureSeasons,
} from "@/engine/world/fixtures";
import {
  applyRelegationResult,
  processRelegationPromotion,
  processRelegationPromotionIncludingFixtures,
} from "@/engine/world/relegation";

function league(id: string, tier: number, clubIds: string[]): League {
  return {
    id,
    name: `League ${tier}`,
    shortName: `L${tier}`,
    country: "Testland",
    tier,
    clubIds,
    season: 1,
  };
}

function club(id: string, leagueId: string): Club {
  return {
    id,
    name: id.toUpperCase(),
    shortName: id.toUpperCase(),
    leagueId,
    reputation: 50,
    scoutingPhilosophy: "academyFirst",
    youthAcademyRating: 10,
    budget: 1_000_000,
    managerId: `manager-${id}`,
    playerIds: [],
    academyPlayerIds: [],
  } as Club;
}

function resultFixture(
  id: string,
  leagueId: string,
  season: number,
  homeClubId: string,
  awayClubId: string,
  homeGoals = 1,
  awayGoals = 0,
): Fixture {
  return {
    id,
    leagueId,
    season,
    week: 1,
    homeClubId,
    awayClubId,
    played: true,
    homeGoals,
    awayGoals,
  };
}

describe("competition season integrity", () => {
  it("scopes standings to one season instead of accumulating historical results", () => {
    const clubs = {
      a: club("a", "l1"),
      b: club("b", "l1"),
    };
    const fixtures = {
      s1: resultFixture("fixture-l1-s1-w01-0001", "l1", 1, "a", "b"),
      s2: resultFixture("fixture-l1-s2-w01-0001", "l1", 2, "b", "a", 2, 0),
    };

    const seasonOne = buildStandings("l1", fixtures, clubs, 1);
    const seasonTwo = buildStandings("l1", fixtures, clubs, 2);

    expect(seasonOne.a).toMatchObject({ played: 1, points: 3 });
    expect(seasonOne.b).toMatchObject({ played: 1, points: 0 });
    expect(seasonTwo.a).toMatchObject({ played: 1, points: 0 });
    expect(seasonTwo.b).toMatchObject({ played: 1, points: 3 });
  });

  it("pins legacy fixtures to a concrete season without rewriting valid history", () => {
    const fixtures: Record<string, Fixture> = {
      generated: {
        id: "fixture-l1-s3-w01-0001",
        leagueId: "l1",
        week: 1,
        homeClubId: "a",
        awayClubId: "b",
        played: false,
      },
      custom: {
        id: "custom-friendly",
        leagueId: "l1",
        week: 1,
        homeClubId: "a",
        awayClubId: "b",
        played: false,
      },
    };

    const normalized = normalizeFixtureSeasons(fixtures, 2);

    expect(getFixtureSeason(normalized.generated)).toBe(3);
    expect(normalized.generated.season).toBe(3);
    expect(normalized.custom.season).toBe(2);
    expect(normalizeFixtureSeasons(normalized, 2)).toBe(normalized);
  });

  it("generates an idempotent season schedule from current league membership", () => {
    const leagues = { l1: league("l1", 1, ["a", "b", "c", "d"]) };
    const first = ensureSeasonFixtures(
      createRNG("fixtures-s2"),
      leagues,
      {},
      2,
      ["l1"],
      1,
    );
    const second = ensureSeasonFixtures(
      createRNG("fixtures-s2"),
      leagues,
      first,
      2,
      ["l1"],
      1,
    );

    expect(Object.keys(first)).toHaveLength(12);
    expect(second).toEqual(first);
    expect(Object.values(second).every((fixture) => fixture.season === 2)).toBe(true);
  });

  it("does not move clubs in secondary leagues that have no simulated table", () => {
    const upperIds = ["a1", "a2", "a3"];
    const lowerIds = ["b1", "b2", "b3"];
    const state = {
      currentWeek: 38,
      currentSeason: 1,
      leagues: {
        l1: league("l1", 1, upperIds),
        l2: league("l2", 2, lowerIds),
      },
      clubs: Object.fromEntries([
        ...upperIds.map((id) => [id, club(id, "l1")]),
        ...lowerIds.map((id) => [id, club(id, "l2")]),
      ]),
      players: {},
      fixtures: {},
    } as unknown as GameState;

    const result = processRelegationPromotion(state, createRNG("no-table"));

    expect(result.events).toEqual([]);
    expect(result.messages).toEqual([]);
  });

  it("moves clubs structurally across every adjacent tier exactly once", () => {
    const leagueOneIds = ["a1", "a2", "a3", "a4", "a5", "a6"];
    const leagueTwoIds = ["b1", "b2", "b3", "b4", "b5", "b6"];
    const leagueThreeIds = ["c1", "c2", "c3", "c4", "c5", "c6"];
    const leagues = {
      l1: league("l1", 1, leagueOneIds),
      l2: league("l2", 2, leagueTwoIds),
      l3: league("l3", 3, leagueThreeIds),
    };
    const clubs = Object.fromEntries([
      ...leagueOneIds.map((id) => [id, club(id, "l1")]),
      ...leagueTwoIds.map((id) => [id, club(id, "l2")]),
      ...leagueThreeIds.map((id) => [id, club(id, "l3")]),
    ]);
    const fixtures: Record<string, Fixture> = {};
    for (const [leagueId, ids] of [
      ["l1", leagueOneIds],
      ["l2", leagueTwoIds],
      ["l3", leagueThreeIds],
    ] as const) {
      fixtures[`${leagueId}-1`] = resultFixture(
        `fixture-${leagueId}-s1-w01-0001`, leagueId, 1, ids[0], ids[5],
      );
      fixtures[`${leagueId}-2`] = resultFixture(
        `fixture-${leagueId}-s1-w01-0002`, leagueId, 1, ids[1], ids[4],
      );
      fixtures[`${leagueId}-3`] = resultFixture(
        `fixture-${leagueId}-s1-w01-0003`, leagueId, 1, ids[2], ids[3],
      );
    }
    const state = {
      currentWeek: 38,
      currentSeason: 1,
      leagues,
      clubs,
      players: {},
      fixtures,
    } as unknown as GameState;

    const result = processRelegationPromotion(state, createRNG("relegation-s1"));
    const applied = applyRelegationResult(state, result);
    const replayed = applyRelegationResult(
      { ...state, ...applied } as GameState,
      result,
    );

    expect(result.events).toHaveLength(12);
    expect(applied.leagues.l1.clubIds).toEqual(
      expect.arrayContaining(["a1", "a2", "a3", "b1", "b2", "b3"]),
    );
    expect(applied.leagues.l2.clubIds).toEqual(
      expect.arrayContaining(["a4", "a5", "a6", "c1", "c2", "c3"]),
    );
    expect(applied.leagues.l3.clubIds).toEqual(
      expect.arrayContaining(["b4", "b5", "b6", "c4", "c5", "c6"]),
    );
    expect(Object.values(applied.leagues).every((item) => item.clubIds.length === 6)).toBe(true);
    for (const item of Object.values(applied.clubs)) {
      expect(applied.leagues[item.leagueId].clubIds).toContain(item.id);
    }
    expect(replayed).toEqual(applied);

    const nextFixtures = ensureSeasonFixtures(
      createRNG("fixtures-s2"),
      applied.leagues,
      fixtures,
      2,
      Object.keys(applied.leagues),
      1,
    );
    for (const fixture of Object.values(nextFixtures).filter((item) => item.season === 2)) {
      expect(applied.clubs[fixture.homeClubId].leagueId).toBe(fixture.leagueId);
      expect(applied.clubs[fixture.awayClubId].leagueId).toBe(fixture.leagueId);
    }
  });

  it("includes the decisive final fixture when resolving relegation places", () => {
    const upperIds = ["a1", "a2", "a3", "a4", "a5", "a6"];
    const lowerIds = ["b1", "b2", "b3", "b4", "b5", "b6"];
    const leagues = {
      l1: league("l1", 1, upperIds),
      l2: league("l2", 2, lowerIds),
    };
    const clubs = Object.fromEntries([
      ...upperIds.map((id) => [id, club(id, "l1")]),
      ...lowerIds.map((id) => [id, club(id, "l2")]),
    ]);
    const fixtures: Record<string, Fixture> = {
      upperOne: resultFixture("upper-one", "l1", 1, "a1", "a6"),
      upperTwo: resultFixture("upper-two", "l1", 1, "a2", "a5"),
      upperThree: resultFixture("upper-three", "l1", 1, "a3", "a4"),
      lowerOne: resultFixture("lower-one", "l2", 1, "b1", "b6"),
      lowerTwo: resultFixture("lower-two", "l2", 1, "b2", "b5"),
      lowerThree: resultFixture("lower-three", "l2", 1, "b3", "b4"),
    };
    const finalFixture = {
      ...resultFixture("upper-final", "l1", 1, "a4", "a3", 3, 0),
      week: 38,
    };
    const state = {
      currentWeek: 38,
      currentSeason: 1,
      leagues,
      clubs,
      players: {},
      fixtures,
    } as unknown as GameState;

    const staleResult = processRelegationPromotion(state, createRNG("final-day"));
    const completeResult = processRelegationPromotionIncludingFixtures(
      state,
      [finalFixture],
      createRNG("final-day"),
    );
    const staleRelegated = staleResult.events
      .filter((event) => event.type === "relegated")
      .map((event) => event.clubId);
    const completeRelegated = completeResult.events
      .filter((event) => event.type === "relegated")
      .map((event) => event.clubId);

    expect(staleRelegated).toContain("a4");
    expect(staleRelegated).not.toContain("a3");
    expect(completeRelegated).toContain("a3");
    expect(completeRelegated).not.toContain("a4");
    expect(state.fixtures).not.toHaveProperty(finalFixture.id);
  });
});
