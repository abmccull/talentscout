import { describe, expect, it } from "vitest";
import type {
  Club,
  League,
  Observation,
  Player,
  ScoutReport,
} from "@/engine/core/types";
import {
  buildPlayerDatabaseIndexes,
  buildPlayerDatabaseRows,
  filterAndSortPlayerRows,
  filterPlayersForSpecialization,
  paginateRows,
} from "@/components/game/queries/playerDatabaseQuery";

function createPlayer(
  id: string,
  overrides: Partial<Player> = {},
): Player {
  return {
    id,
    firstName: "Test",
    lastName: id,
    nationality: "England",
    position: "CM",
    age: 18,
    marketValue: 500_000,
    clubId: "club-a",
    ...overrides,
  } as Player;
}

function createObservation(
  id: string,
  playerId: string,
  week: number,
  perceivedCA: number,
): Observation {
  return {
    id,
    playerId,
    scoutId: "scout-1",
    week,
    season: 2026,
    context: "liveMatch",
    attributeReadings: [],
    notes: [],
    flaggedMoments: [],
    abilityReading: {
      perceivedCA,
      caConfidence: 0.7,
      perceivedPALow: 3,
      perceivedPAHigh: 4,
      paConfidence: 0.6,
    },
  } as Observation;
}

function createReport(id: string, playerId: string): ScoutReport {
  return {
    id,
    playerId,
    scoutId: "scout-1",
    submittedWeek: 4,
    submittedSeason: 2026,
    attributeAssessments: [],
    strengths: [],
    weaknesses: [],
    conviction: "recommend",
    summary: "Solid profile.",
    estimatedValue: 500_000,
    qualityScore: 70,
  } as ScoutReport;
}

describe("player database query model", () => {
  it("builds indexed player rows without per-row collection scans", () => {
    const players = [
      createPlayer("alpha", { firstName: "Alex", lastName: "North", marketValue: 750_000 }),
      createPlayer("bravo", { firstName: "Ben", lastName: "South", clubId: "club-b", age: 22 }),
    ];
    const clubs = {
      "club-a": { id: "club-a", shortName: "North FC", leagueId: "league-1" } as Club,
      "club-b": { id: "club-b", shortName: "South FC", leagueId: "league-2" } as Club,
    };
    const leagues = {
      "league-1": { id: "league-1", shortName: "Premier U21" } as League,
      "league-2": { id: "league-2", shortName: "Reserve Elite" } as League,
    };
    const indexes = buildPlayerDatabaseIndexes(
      {
        "obs-1": createObservation("obs-1", "alpha", 3, 3.5),
        "obs-2": createObservation("obs-2", "alpha", 7, 4),
        "obs-3": createObservation("obs-3", "bravo", 5, 2.5),
      },
      {
        "report-1": createReport("report-1", "alpha"),
      },
    );

    const rows = buildPlayerDatabaseRows(players, clubs, leagues, indexes);
    const alpha = rows.find((row) => row.player.id === "alpha");
    const bravo = rows.find((row) => row.player.id === "bravo");

    expect(indexes.scoutedPlayerIds).toEqual(new Set(["alpha", "bravo"]));
    expect(alpha).toMatchObject({
      observationCount: 2,
      reportCount: 1,
      lastSeenWeek: 7,
      clubName: "North FC",
      leagueName: "Premier U21",
    });
    expect(alpha?.perceived?.ca).toBe(4);
    expect(bravo).toMatchObject({
      observationCount: 1,
      reportCount: 0,
      lastSeenWeek: 5,
      clubName: "South FC",
      leagueName: "Reserve Elite",
    });
  });

  it("filters and sorts rows with watchlist and market constraints", () => {
    const rows = [
      {
        player: createPlayer("alpha", {
          firstName: "Alex",
          lastName: "North",
          marketValue: 900_000,
        }),
        clubId: "club-a",
        clubName: "North FC",
        leagueName: "Premier U21",
        observationCount: 2,
        reportCount: 1,
        lastSeenWeek: 7,
        perceived: null,
      },
      {
        player: createPlayer("bravo", {
          firstName: "Ben",
          lastName: "West",
          marketValue: 300_000,
          age: 20,
        }),
        clubId: "club-b",
        clubName: "West FC",
        leagueName: "Reserve Elite",
        observationCount: 1,
        reportCount: 0,
        lastSeenWeek: 5,
        perceived: null,
      },
    ];

    const filtered = filterAndSortPlayerRows(
      rows,
      {
        search: "fc",
        positionFilter: "",
        minAge: 18,
        maxAge: 19,
        nationalityFilter: "",
        leagueFilter: "",
        minValue: 500_000,
        maxValue: undefined,
        watchlistOnly: true,
        watchlist: new Set(["alpha"]),
      },
      "value",
      "desc",
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0].player.id).toBe("alpha");
  });

  it("applies youth specialization gating only to global search pools and paginates safely", () => {
    const players = [
      createPlayer("alpha", { age: 18 }),
      createPlayer("bravo", { age: 23 }),
      createPlayer("charlie", { age: 17 }),
    ];

    const youthPlayers = filterPlayersForSpecialization(players, "youth", false);
    const allObservedPlayers = filterPlayersForSpecialization(players, "youth", true);
    const paged = paginateRows(youthPlayers, 4, 1);

    expect(youthPlayers.map((player) => player.id)).toEqual(["alpha", "charlie"]);
    expect(allObservedPlayers.map((player) => player.id)).toEqual([
      "alpha",
      "bravo",
      "charlie",
    ]);
    expect(paged.page).toBe(2);
    expect(paged.totalPages).toBe(2);
    expect(paged.items[0].id).toBe("charlie");
  });
});
