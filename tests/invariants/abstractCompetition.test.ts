import { describe, expect, it } from "vitest";
import type { Club, Fixture, League, Player } from "@/engine/core/types";
import {
  ABSTRACT_COMPETITION_SIMULATION_DETAIL,
  getAbstractLeagueSeasonLength,
  simulateAbstractCompetitionWeek,
} from "@/engine/world/abstractCompetition";

type CoverageLeague = League & { coverageTier?: "full" | "abstract" | "contactOnly" };

function makeLeague(
  id: string,
  coverageTier: CoverageLeague["coverageTier"],
  clubIds: string[],
): CoverageLeague {
  return {
    id,
    name: `${id} League`,
    shortName: id.toUpperCase(),
    country: "Testland",
    tier: 1,
    clubIds,
    season: 3,
    coverageTier,
  };
}

function makeClub(id: string, leagueId: string): Club {
  return {
    id,
    name: `${id} FC`,
    shortName: id.slice(0, 3).toUpperCase(),
    leagueId,
    reputation: 55,
    budget: 2_000_000,
    scoutingPhilosophy: "academyFirst",
    managerId: `${id}-manager`,
    playerIds: [],
    academyPlayerIds: [],
    youthAcademyRating: 12,
  };
}

function makePlayer(
  id: string,
  clubId: string,
  position: Player["position"],
  currentAbility: number,
  index: number,
): Player {
  const player: Player = {
    id,
    firstName: "Test",
    lastName: id,
    age: 22 + (index % 5),
    dateOfBirth: { day: 1, month: 1, year: 2000 - index },
    nationality: "Testland",
    position,
    secondaryPositions: [],
    preferredFoot: "right",
    clubId,
    contractClubId: clubId,
    contractExpiry: 5,
    wage: 1_000,
    marketValue: 500_000,
    attributes: {} as Player["attributes"],
    currentAbility,
    potentialAbility: currentAbility + 12,
    developmentProfile: "steadyGrower",
    wonderkidTier: "qualityPro",
    form: (index % 3) - 1,
    morale: 6 + (index % 3),
    injured: false,
    injuryWeeksRemaining: 0,
    personalityTraits: [],
    personalityRevealed: [],
    playerTraits: [],
    playerTraitsRevealed: [],
    recentMatchRatings: [],
    seasonRatings: [],
  };
  return player;
}

function seedClubSquad(
  club: Club,
  players: Record<string, Player>,
  strengthBase: number,
): void {
  const positions: Player["position"][] = [
    "GK",
    "LB",
    "CB",
    "CB",
    "RB",
    "CDM",
    "CM",
    "CAM",
    "LW",
    "RW",
    "ST",
    "CM",
    "ST",
    "CB",
  ];

  positions.forEach((position, index) => {
    const player = makePlayer(
      `${club.id}-${index}`,
      club.id,
      position,
      strengthBase + (positions.length - index),
      index,
    );
    players[player.id] = player;
    club.playerIds.push(player.id);
  });
}

function buildWorld() {
  const abstractClubIds = ["abstract-a", "abstract-b", "abstract-c", "abstract-d"];
  const fullClubIds = ["full-a", "full-b"];
  const leagues: Record<string, League> = {
    "league-abstract": makeLeague("league-abstract", "abstract", abstractClubIds),
    "league-full": makeLeague("league-full", "full", fullClubIds),
  };
  const clubs: Record<string, Club> = {};
  const players: Record<string, Player> = {};

  abstractClubIds.forEach((clubId, index) => {
    clubs[clubId] = makeClub(clubId, "league-abstract");
    seedClubSquad(clubs[clubId], players, 118 - index * 3);
  });
  fullClubIds.forEach((clubId, index) => {
    clubs[clubId] = makeClub(clubId, "league-full");
    seedClubSquad(clubs[clubId], players, 104 - index * 2);
  });

  return { leagues, clubs, players };
}

describe("abstract competition simulation", () => {
  it("generates deterministic played fixtures and explicit player participation from real club rosters", () => {
    const world = buildWorld();
    const first = simulateAbstractCompetitionWeek({
      worldSeed: "abstract-week-seed",
      season: 3,
      week: 1,
      ...world,
    });
    const replay = simulateAbstractCompetitionWeek({
      worldSeed: "abstract-week-seed",
      season: 3,
      week: 1,
      ...world,
    });

    expect(first).toEqual(replay);
    expect(first.fixturesPlayed).toHaveLength(2);
    expect(first.fixturesPlayed.every((fixture) => fixture.played)).toBe(true);
    expect(first.fixturesPlayed.every(
      (fixture) => fixture.simulationDetail === ABSTRACT_COMPETITION_SIMULATION_DETAIL,
    )).toBe(true);

    const allFixturePlayerIds = new Set(
      first.fixturesPlayed.flatMap((fixture) => Object.keys(fixture.playerRatings)),
    );
    expect([...allFixturePlayerIds].every((playerId) => world.players[playerId])).toBe(true);

    for (const fixture of first.fixturesPlayed) {
      const ratings = Object.values(fixture.playerRatings);
      expect(ratings.length).toBeGreaterThanOrEqual(22);
      expect(ratings.every((rating) => (rating.minutesPlayed ?? 0) > 0)).toBe(true);
      expect(ratings.every((rating) => rating.started === true || rating.started === false)).toBe(true);
      expect(ratings.every((rating) => rating.source === "simulated")).toBe(true);
      expect(first.matchRatingsByFixture[fixture.id]).toEqual(fixture.playerRatings);
    }

    expect(first.skippedFixtureIds).toEqual([]);
  });

  it("is idempotent once the same abstract fixtures and ratings already exist", () => {
    const world = buildWorld();
    const first = simulateAbstractCompetitionWeek({
      worldSeed: "abstract-idempotency",
      season: 3,
      week: 2,
      ...world,
    });

    const fixtures: Record<string, Fixture> = Object.fromEntries(
      first.fixturesPlayed.map((fixture) => [fixture.id, fixture]),
    );
    const second = simulateAbstractCompetitionWeek({
      worldSeed: "abstract-idempotency",
      season: 3,
      week: 2,
      ...world,
      fixtures,
      matchRatings: first.matchRatingsByFixture,
    });

    expect(second.fixturesPlayed).toEqual([]);
    expect(second.matchRatingsByFixture).toEqual({});
    expect(second.skippedFixtureIds.sort()).toEqual(Object.keys(fixtures).sort());
  });

  it("keeps the schedule bounded to abstract leagues and a stable season length", () => {
    const world = buildWorld();
    const abstractLeague = world.leagues["league-abstract"];
    const fullLeague = world.leagues["league-full"];

    expect(getAbstractLeagueSeasonLength(abstractLeague)).toBe(6);
    expect(getAbstractLeagueSeasonLength(fullLeague)).toBe(2);

    const result = simulateAbstractCompetitionWeek({
      worldSeed: "abstract-bounds",
      season: 3,
      week: 7,
      ...world,
    });

    expect(result.fixturesPlayed).toEqual([]);
    expect(result.skippedFixtureIds).toEqual([]);
  });

  it("keeps depleted abstract squads deterministic without selecting from an empty roster", () => {
    const world = buildWorld();
    const abstractClubIds = world.leagues["league-abstract"].clubIds;

    for (const clubId of abstractClubIds) {
      world.clubs[clubId].playerIds = [];
      world.clubs[clubId].academyPlayerIds = [];
    }
    world.players = {};

    const first = simulateAbstractCompetitionWeek({
      worldSeed: "abstract-empty-rosters",
      season: 3,
      week: 1,
      ...world,
    });
    const replay = simulateAbstractCompetitionWeek({
      worldSeed: "abstract-empty-rosters",
      season: 3,
      week: 1,
      ...world,
    });

    expect(first).toEqual(replay);
    expect(first.fixturesPlayed).toHaveLength(2);
    expect(first.fixturesPlayed.every(
      (fixture) => fixture.homeGoals === 0 && fixture.awayGoals === 0,
    )).toBe(true);
    expect(first.fixturesPlayed.every(
      (fixture) => Object.keys(fixture.playerRatings).length === 0,
    )).toBe(true);
  });

  it("does not invent an assister when an emergency squad has only one player", () => {
    const world = buildWorld();
    const abstractClubIds = world.leagues["league-abstract"].clubIds;
    const emergencyPlayers: Record<string, Player> = {};

    abstractClubIds.forEach((clubId, index) => {
      const player = makePlayer(`${clubId}-emergency`, clubId, "ST", 100 + index, index);
      emergencyPlayers[player.id] = player;
      world.clubs[clubId].playerIds = [player.id];
      world.clubs[clubId].academyPlayerIds = [];
    });
    world.players = emergencyPlayers;

    let scoredGoals = 0;
    for (let seed = 0; seed < 40; seed += 1) {
      const result = simulateAbstractCompetitionWeek({
        worldSeed: `abstract-one-player-${seed}`,
        season: 3,
        week: 1,
        ...world,
      });
      for (const fixture of result.fixturesPlayed) {
        scoredGoals += fixture.homeGoals + fixture.awayGoals;
        expect(Object.values(fixture.playerRatings).every(
          (rating) => (rating.stats.assists ?? 0) === 0,
        )).toBe(true);
      }
    }

    expect(scoredGoals).toBeGreaterThan(0);
  });

  it("calls up academy players when the registered senior squad is depleted", () => {
    const world = buildWorld();
    const abstractClubIds = world.leagues["league-abstract"].clubIds;
    const emergencyPlayers: Record<string, Player> = {};

    abstractClubIds.forEach((clubId, clubIndex) => {
      const senior = makePlayer(`${clubId}-senior`, clubId, "GK", 108, clubIndex);
      emergencyPlayers[senior.id] = senior;
      world.clubs[clubId].playerIds = [senior.id];
      world.clubs[clubId].academyPlayerIds = [];

      const academyPositions: Player["position"][] = [
        "LB", "CB", "CB", "RB", "CDM", "CM", "CAM", "LW", "RW", "ST",
      ];
      academyPositions.forEach((position, playerIndex) => {
        const academy = {
          ...makePlayer(
            `${clubId}-academy-${playerIndex}`,
            clubId,
            position,
            75 + playerIndex,
            playerIndex,
          ),
          age: 17,
        };
        emergencyPlayers[academy.id] = academy;
        world.clubs[clubId].academyPlayerIds!.push(academy.id);
      });
    });
    world.players = emergencyPlayers;

    const result = simulateAbstractCompetitionWeek({
      worldSeed: "abstract-academy-callups",
      season: 3,
      week: 1,
      ...world,
    });

    for (const fixture of result.fixturesPlayed) {
      expect(Object.keys(fixture.playerRatings)).toHaveLength(22);
      const academyAppearances = Object.keys(fixture.playerRatings).filter(
        (playerId) => playerId.includes("-academy-"),
      );
      expect(academyAppearances).toHaveLength(20);
    }
  });
});
