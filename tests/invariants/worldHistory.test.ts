import { describe, expect, it } from "vitest";
import type {
  Club,
  Fixture,
  League,
  ManagerProfile,
  Player,
  PlayerMatchRating,
  PlayerMovementEvent,
} from "@/engine/core/types";
import type { RelegationResult } from "@/engine/world/relegation";
import {
  WORLD_HISTORY_MAX_SEASONS,
  createEmptyWorldHistory,
  recordCompletedSeasonWorldHistory,
  type WorldHistorySnapshot,
} from "@/engine/world/worldHistory";

function club(
  id: string,
  leagueId: string,
  overrides: Partial<Club> = {},
): Club {
  return {
    id,
    name: id.toUpperCase(),
    shortName: id.toUpperCase(),
    leagueId,
    reputation: 50,
    budget: 1_000_000,
    scoutingPhilosophy: "marketSmart",
    managerId: `manager-${id}`,
    playerIds: [],
    youthAcademyRating: 10,
    ...overrides,
  };
}

function player(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    firstName: "Test",
    lastName: id,
    age: 21,
    dateOfBirth: { day: 1, month: 1, year: 2000 },
    nationality: "English",
    position: "CM",
    secondaryPositions: [],
    preferredFoot: "right",
    clubId: "alpha",
    contractClubId: "alpha",
    contractExpiry: 4,
    wage: 1_000,
    marketValue: 500_000,
    attributes: {} as Player["attributes"],
    currentAbility: 112,
    potentialAbility: 140,
    developmentProfile: "steadyGrower",
    wonderkidTier: "qualityPro",
    form: 1,
    morale: 8,
    injured: false,
    injuryWeeksRemaining: 0,
    personalityTraits: [],
    personalityRevealed: [],
    playerTraits: [],
    playerTraitsRevealed: [],
    recentMatchRatings: [],
    seasonRatings: [],
    ...overrides,
  };
}

function manager(clubId: string, managerName: string): ManagerProfile {
  return {
    clubId,
    managerName,
    preference: "balanced",
    reportInfluence: 0.65,
    preferredFormation: "4-3-3",
  };
}

function rating(
  fixtureId: string,
  playerId: string,
  overrides: Partial<PlayerMatchRating> = {},
): PlayerMatchRating {
  return {
    playerId,
    fixtureId,
    rating: 7,
    eventCount: 0,
    stats: {},
    source: "simulated",
    ...overrides,
  };
}

function baseSnapshot(): WorldHistorySnapshot {
  const leagues: Record<string, League> = {
    upper: {
      id: "upper",
      name: "Upper League",
      shortName: "UP",
      country: "england",
      tier: 1,
      clubIds: ["alpha", "beta"],
      season: 1,
    },
    lower: {
      id: "lower",
      name: "Lower League",
      shortName: "LO",
      country: "england",
      tier: 2,
      clubIds: ["gamma"],
      season: 1,
    },
  };
  const clubs = {
    beta: club("beta", "upper"),
    gamma: club("gamma", "lower"),
    alpha: club("alpha", "upper", { playerIds: ["active", "unsupported"] }),
  };
  const fixtures: Record<string, Fixture> = {
    second: {
      id: "second",
      homeClubId: "beta",
      awayClubId: "alpha",
      leagueId: "upper",
      season: 1,
      week: 2,
      played: true,
      homeGoals: 0,
      awayGoals: 1,
    },
    first: {
      id: "first",
      homeClubId: "alpha",
      awayClubId: "beta",
      leagueId: "upper",
      season: 1,
      week: 1,
      played: true,
      homeGoals: 2,
      awayGoals: 0,
    },
  };
  const movements: PlayerMovementEvent[] = [
    {
      id: "move-active",
      playerId: "active",
      type: "permanentTransfer",
      week: 1,
      season: 1,
      fromClubId: "beta",
      toClubId: "alpha",
      fee: 500_000,
    },
    {
      id: "retire-veteran",
      playerId: "veteran",
      type: "retirement",
      week: 2,
      season: 1,
      fromClubId: "beta",
    },
  ];

  return {
    totalWeeksPlayed: 1,
    leagues,
    clubs,
    players: {
      unsupported: player("unsupported"),
      active: player("active", { age: 23, currentAbility: 123 }),
    },
    fixtures,
    managerProfiles: {
      beta: manager("different-club", "Unsupported Mismatch"),
      alpha: manager("alpha", "Ada Manager"),
    },
    matchRatings: {
      second: {
        active: rating("second", "active", {
          started: false,
          minutesPlayed: 30,
          rating: 6.8,
          stats: { assists: 1 },
        }),
      },
      first: {
        unsupported: rating("first", "unsupported", { rating: 9.9 }),
        active: rating("first", "active", {
          started: true,
          minutesPlayed: 90,
          rating: 7.4,
          stats: { goals: 1 },
        }),
      },
    },
    retiredPlayerIds: ["veteran"],
    retiredPlayers: {
      veteran: player("veteran", {
        age: 36,
        clubId: "",
        contractClubId: undefined,
        currentAbility: 80,
      }),
    },
    playerMovementHistory: movements,
  };
}

function relegationResult(): RelegationResult {
  return {
    season: 1,
    events: [
      {
        clubId: "beta",
        clubName: "BETA",
        fromLeagueId: "upper",
        toLeagueId: "lower",
        type: "relegated",
        reputationChange: -10,
        budgetMultiplier: 0.8,
      },
    ],
    flaggedPlayerIds: [],
    messages: [],
  };
}

describe("authoritative world history", () => {
  it("records standings, identities, explicit performance, movement, and retirement facts", () => {
    const snapshot = baseSnapshot();
    const history = recordCompletedSeasonWorldHistory(
      undefined,
      snapshot,
      1,
      relegationResult(),
    );
    const season = history.seasons[0];

    expect(season.recordedAfterTotalWeeks).toBe(2);
    expect(season.clubs.map((entry) => entry.clubId)).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
    expect(season.clubs.find((entry) => entry.clubId === "alpha")).toEqual(
      expect.objectContaining({
        standing: expect.objectContaining({ position: 1, played: 2, points: 6 }),
        leagueMovement: "stayed",
        nextLeagueId: "upper",
        manager: expect.objectContaining({ managerName: "Ada Manager" }),
      }),
    );
    expect(season.clubs.find((entry) => entry.clubId === "beta")).toEqual(
      expect.objectContaining({
        standing: expect.objectContaining({ position: 2, points: 0 }),
        leagueMovement: "relegated",
        nextLeagueId: "lower",
      }),
    );
    expect(season.clubs.find((entry) => entry.clubId === "beta")?.manager).toBeUndefined();
    expect(season.clubs.find((entry) => entry.clubId === "gamma")?.standing).toBeUndefined();

    expect(season.players.find((entry) => entry.playerId === "active")).toEqual(
      expect.objectContaining({
        firstName: "Test",
        lastName: "active",
        age: 23,
        currentAbility: 123,
        status: "contracted",
        movementEventIds: ["move-active"],
        performance: {
          appearances: 2,
          starts: 1,
          minutesPlayed: 120,
          appearancesWithoutMinutes: 0,
          averageRating: 7.1,
          goals: 1,
          assists: 1,
          cleanSheets: 0,
        },
      }),
    );
    expect(
      season.players.find((entry) => entry.playerId === "unsupported")?.performance,
    ).toBeUndefined();
    expect(season.players.find((entry) => entry.playerId === "veteran")).toEqual(
      expect.objectContaining({
        status: "retired",
        movementEventIds: ["retire-veteran"],
      }),
    );
    expect(season.playerMovementSummaries).toEqual([
      {
        id: "move-active",
        playerId: "active",
        type: "permanentTransfer",
        week: 1,
        fromClubId: "beta",
        toClubId: "alpha",
        fee: 500_000,
      },
      {
        id: "retire-veteran",
        playerId: "veteran",
        type: "retirement",
        week: 2,
        fromClubId: "beta",
      },
    ]);
  });

  it("is deterministic, does not mutate its snapshot, and records a rollover exactly once", () => {
    const snapshot = baseSnapshot();
    const before = structuredClone(snapshot);
    const first = recordCompletedSeasonWorldHistory(undefined, snapshot, 1, relegationResult());
    const duplicate = recordCompletedSeasonWorldHistory(first, snapshot, 1, relegationResult());
    const reverseRecord = <T>(record: Record<string, T>): Record<string, T> =>
      Object.fromEntries(Object.entries(record).reverse());
    const reordered: WorldHistorySnapshot = {
      ...structuredClone(snapshot),
      leagues: reverseRecord(snapshot.leagues),
      clubs: reverseRecord(snapshot.clubs),
      players: reverseRecord(snapshot.players),
      fixtures: reverseRecord(snapshot.fixtures),
      managerProfiles: reverseRecord(snapshot.managerProfiles),
      matchRatings: Object.fromEntries(
        Object.entries(snapshot.matchRatings)
          .reverse()
          .map(([fixtureId, ratings]) => [fixtureId, reverseRecord(ratings)]),
      ),
      retiredPlayers: reverseRecord(snapshot.retiredPlayers),
      playerMovementHistory: [...snapshot.playerMovementHistory].reverse(),
    };

    expect(duplicate).toBe(first);
    expect(snapshot).toEqual(before);
    expect(
      recordCompletedSeasonWorldHistory(undefined, reordered, 1, relegationResult()),
    ).toEqual(first);
    expect(first.seasons[0].clubs.every((club) => club.recruitmentDoctrine)).toBe(true);
    expect(first.seasons[0].clubs[0].recruitmentDoctrine?.preferredSeniorAgeRange)
      .toHaveLength(2);
  });

  it("owns its tactical snapshot and survives a JSON save round trip", () => {
    const snapshot = baseSnapshot();
    snapshot.clubs.alpha = {
      ...snapshot.clubs.alpha,
      tacticalStyle: {
        defensiveLine: 12,
        pressingIntensity: 14,
        tempo: 13,
        width: 11,
        directness: 8,
        tacticalIdentity: "highPress",
        eventDistribution: { shot: 1.2 },
        strengthAgainst: ["possessionBased"],
        weakAgainst: ["directPlay"],
      },
    };
    const history = recordCompletedSeasonWorldHistory(undefined, snapshot, 1);
    const saved = JSON.parse(JSON.stringify(history));

    snapshot.clubs.alpha.tacticalStyle!.eventDistribution!.shot = 9;
    snapshot.clubs.alpha.tacticalStyle!.strengthAgainst!.push("balanced");

    expect(history.seasons[0].clubs.find((club) => club.clubId === "alpha")?.tacticalStyle)
      .toMatchObject({
        eventDistribution: { shot: 1.2 },
        strengthAgainst: ["possessionBased"],
      });
    expect(saved).toEqual(history);
    expect(recordCompletedSeasonWorldHistory(saved, snapshot, 1)).toBe(saved);
  });

  it("does not claim league movement when the resolver result is absent or for another season", () => {
    const snapshot = baseSnapshot();
    const absent = recordCompletedSeasonWorldHistory(undefined, snapshot, 1);
    const mismatched = recordCompletedSeasonWorldHistory(
      undefined,
      snapshot,
      1,
      { ...relegationResult(), season: 2 },
    );

    expect(absent.seasons[0].clubs.every((entry) => entry.leagueMovement === undefined)).toBe(true);
    expect(mismatched).toEqual(absent);
  });

  it("keeps a bounded archive while retaining a monotonic exactly-once watermark", () => {
    const snapshot = baseSnapshot();
    let history = createEmptyWorldHistory();
    for (let season = 1; season <= WORLD_HISTORY_MAX_SEASONS + 2; season++) {
      history = recordCompletedSeasonWorldHistory(history, snapshot, season);
    }

    expect(history.latestRecordedSeason).toBe(WORLD_HISTORY_MAX_SEASONS + 2);
    expect(history.seasons).toHaveLength(WORLD_HISTORY_MAX_SEASONS);
    expect(history.seasons[0].season).toBe(3);

    const replayedTrimmedSeason = recordCompletedSeasonWorldHistory(history, snapshot, 1);
    expect(replayedTrimmedSeason).toBe(history);
  });
});
