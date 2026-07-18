import { performance } from "node:perf_hooks";
import { beforeAll, describe, expect, it } from "vitest";
import type { AlumniRecord, Club, Fixture, League, Player, PlayerMatchRating } from "@/engine/core/types";
import { generateAlumniSeasonSummary } from "@/engine/youth/alumni";
import { simulateAbstractCompetitionWeek } from "@/engine/world/abstractCompetition";

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
    season: 4,
    coverageTier,
  };
}

function makeClub(id: string, leagueId: string): Club {
  return {
    id,
    name: `${id} FC`,
    shortName: id.slice(0, 3).toUpperCase(),
    leagueId,
    reputation: 58,
    budget: 2_500_000,
    scoutingPhilosophy: "academyFirst",
    managerId: `${id}-manager`,
    playerIds: [],
    academyPlayerIds: [],
    youthAcademyRating: 14,
  };
}

function makePlayer(
  id: string,
  clubId: string,
  position: Player["position"],
  currentAbility: number,
  index: number,
): Player {
  return {
    id,
    firstName: "Perf",
    lastName: id,
    age: 18 + (index % 8),
    dateOfBirth: { day: 1, month: 1, year: 2004 - index },
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
    potentialAbility: currentAbility + 10,
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

function buildPerformanceWorld(clubCount = 20) {
  const clubIds = Array.from({ length: clubCount }, (_, index) => `abstract-${index + 1}`);
  const leagues: Record<string, League> = {
    "league-abstract": makeLeague("league-abstract", "abstract", clubIds),
  };
  const clubs: Record<string, Club> = {};
  const players: Record<string, Player> = {};

  clubIds.forEach((clubId, index) => {
    clubs[clubId] = makeClub(clubId, "league-abstract");
    seedClubSquad(clubs[clubId], players, 124 - index);
  });

  return { leagues, clubs, players };
}

function mergeFixtures(
  fixturesPlayed: readonly Fixture[],
  existing: Record<string, Fixture> = {},
): Record<string, Fixture> {
  return {
    ...existing,
    ...Object.fromEntries(fixturesPlayed.map((fixture) => [fixture.id, fixture])),
  };
}

function mergeRatings(
  matchRatingsByFixture: Record<string, Record<string, PlayerMatchRating>>,
  existing: Record<string, Record<string, PlayerMatchRating>> = {},
): Record<string, Record<string, PlayerMatchRating>> {
  return {
    ...existing,
    ...matchRatingsByFixture,
  };
}

function measure<T>(sampleCount: number, fn: () => T): { result: T; durationMs: number } {
  let result = fn();
  const startedAt = performance.now();
  for (let index = 0; index < sampleCount; index += 1) {
    result = fn();
  }
  return {
    result,
    durationMs: performance.now() - startedAt,
  };
}

function buildHistoricalCompetitionArchive() {
  const world = buildPerformanceWorld();
  let fixtures: Record<string, Fixture> = {};
  let matchRatings: Record<string, Record<string, PlayerMatchRating>> = {};
  const targetSeason = 18;
  const seasonLength = 38;

  for (let week = 1; week <= seasonLength; week += 1) {
    const result = simulateAbstractCompetitionWeek({
      worldSeed: "abstract-performance-archive",
      season: targetSeason,
      week,
      seasonLength,
      ...world,
      fixtures,
      matchRatings,
    });
    fixtures = mergeFixtures(result.fixturesPlayed, fixtures);
    matchRatings = mergeRatings(result.matchRatingsByFixture, matchRatings);
  }

  const currentSeasonFixtures = Object.values(fixtures);
  const currentSeasonRatings = { ...matchRatings };

  for (let season = 1; season < targetSeason; season += 1) {
    for (const fixture of currentSeasonFixtures) {
      const clonedId = fixture.id.replace(`-s${targetSeason}-`, `-s${season}-`);
      fixtures[clonedId] = {
        ...fixture,
        id: clonedId,
        season,
      };

      const originalRatings = currentSeasonRatings[fixture.id] ?? {};
      matchRatings[clonedId] = Object.fromEntries(
        Object.entries(originalRatings).map(([playerId, rating]) => [
          playerId,
          {
            ...rating,
            fixtureId: clonedId,
          },
        ]),
      );
    }
  }

  return { ...world, fixtures, matchRatings, targetSeason, seasonLength };
}

function buildAlumniRecords(players: Record<string, Player>, count: number): AlumniRecord[] {
  return Object.values(players)
    .slice(0, count)
    .map((player, index) => ({
      id: `alumni-${index + 1}`,
      playerId: player.id,
      placedClubId: player.clubId,
      currentClubId: player.clubId,
      milestones: [],
      careerSnapshots: [],
      placedWeek: 1,
      placedSeason: 1,
      careerUpdates: [],
      currentStatus: "firstTeam",
      seasonStats: [],
      becameContact: false,
    }));
}

describe("abstract competition long-history performance invariants", () => {
  let archive: ReturnType<typeof buildHistoricalCompetitionArchive>;

  beforeAll(() => {
    archive = buildHistoricalCompetitionArchive();
  }, 30_000);

  it("replays a fully resolved abstract week without rescanning the entire fixture archive per pairing", { timeout: 30_000 }, () => {
    const currentSeason = archive.targetSeason;
    const currentWeek = 12;
    const resolvedWeek = simulateAbstractCompetitionWeek({
      worldSeed: "abstract-performance-archive",
      season: currentSeason,
      week: currentWeek,
      seasonLength: archive.seasonLength,
      leagues: archive.leagues,
      clubs: archive.clubs,
      players: archive.players,
      fixtures: archive.fixtures,
      matchRatings: archive.matchRatings,
    });

    expect(resolvedWeek.fixturesPlayed).toEqual([]);
    expect(resolvedWeek.skippedFixtureIds.length).toBeGreaterThan(0);

    const replay = measure(400, () =>
      simulateAbstractCompetitionWeek({
        worldSeed: "abstract-performance-archive",
        season: currentSeason,
        week: currentWeek,
        seasonLength: archive.seasonLength,
        leagues: archive.leagues,
        clubs: archive.clubs,
        players: archive.players,
        fixtures: archive.fixtures,
        matchRatings: archive.matchRatings,
      }),
    );

    console.info(
      `[perf] abstract replay 400x: ${replay.durationMs.toFixed(2)}ms across ${Object.keys(archive.fixtures).length} fixtures`,
    );

    expect(replay.result.fixturesPlayed).toEqual([]);
    expect(replay.result.skippedFixtureIds).toEqual(resolvedWeek.skippedFixtureIds);
  });

  it("summarizes alumni seasons from canonical ratings without rescanning the entire archive per record", { timeout: 30_000 }, () => {
    const targetSeason = archive.targetSeason;
    const alumniRecords = buildAlumniRecords(archive.players, 180);

    const baseline = alumniRecords.map((record) => {
      const player = archive.players[record.playerId];
      return generateAlumniSeasonSummary(
        record,
        player,
        targetSeason,
        archive.fixtures,
        archive.matchRatings,
      );
    });

    expect(baseline.some((record) => record.seasonStats.length > 0)).toBe(true);

    const replay = measure(80, () =>
      alumniRecords.map((record) => {
        const player = archive.players[record.playerId];
        return generateAlumniSeasonSummary(
          record,
          player,
          targetSeason,
          archive.fixtures,
          archive.matchRatings,
        );
      }),
    );

    console.info(
      `[perf] alumni season summary 80x: ${replay.durationMs.toFixed(2)}ms for ${alumniRecords.length} records across ${Object.keys(archive.matchRatings).length} rated fixtures`,
    );

    expect(replay.result).toEqual(baseline);
  });
});
