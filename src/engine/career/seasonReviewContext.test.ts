import { expect, test } from "vitest";

import type { GameState } from "../core/types";
import { deriveSeasonReviewMetrics } from "./seasonReviewContext";

test("deriveSeasonReviewMetrics uses season activity instead of global country state", () => {
  const state = {
    scout: {
      id: "scout-1",
      homeCountry: "england",
      countryReputations: {
        england: {
          country: "england",
          familiarity: 60,
          reportsSubmitted: 0,
          successfulFinds: 0,
          contactCount: 0,
        },
        spain: {
          country: "spain",
          familiarity: 95,
          reportsSubmitted: 0,
          successfulFinds: 0,
          contactCount: 0,
        },
      },
    },
    countries: ["england", "spain", "france", "germany"],
    reports: {
      senior: {
        id: "report-1",
        scoutId: "scout-1",
        playerId: "senior-player-1",
        submittedSeason: 2,
      },
    },
    observations: {
      senior: {
        id: "obs-senior",
        playerId: "senior-player-1",
        season: 2,
        scoutId: "scout-1",
      },
      youthOne: {
        id: "obs-youth-1",
        playerId: "youth-player-1",
        season: 2,
        scoutId: "scout-1",
      },
      youthTwo: {
        id: "obs-youth-2",
        playerId: "youth-player-2",
        season: 2,
        scoutId: "scout-1",
      },
    },
    players: {
      "senior-player-1": {
        id: "senior-player-1",
        clubId: "club-england",
      },
    },
    clubs: {
      "club-england": {
        id: "club-england",
        leagueId: "league-england",
      },
    },
    leagues: {
      "league-england": {
        id: "league-england",
        country: "england",
      },
    },
    unsignedYouth: {
      "youth-1": {
        id: "youth-1",
        player: { id: "youth-player-1" },
        country: "spain",
        regionId: "madrid",
      },
      "youth-2": {
        id: "youth-2",
        player: { id: "youth-player-2" },
        country: "spain",
        regionId: "catalonia",
      },
    },
    subRegions: {
      madrid: {
        id: "madrid",
        name: "Madrid",
        country: "spain",
        familiarity: 0,
      },
      catalonia: {
        id: "catalonia",
        name: "Catalonia",
        country: "spain",
        familiarity: 0,
      },
    },
    discoveryRecords: [
      { playerId: "youth-player-1", discoveredSeason: 2 },
      { playerId: "youth-player-2", discoveredSeason: 2 },
      { playerId: "senior-player-1", discoveredSeason: 2 },
    ],
    placementReports: {
      accepted: {
        id: "placement-1",
        unsignedYouthId: "youth-1",
        scoutId: "scout-1",
        clubResponse: "accepted",
        season: 2,
      },
    },
    alumniRecords: [
      {
        id: "alumni-1",
        playerId: "youth-player-1",
        placedSeason: 2,
        milestones: [
          {
            type: "firstTeamDebut",
            season: 2,
          },
          {
            type: "transfer",
            season: 2,
          },
        ],
      },
    ],
  } as unknown as GameState;

  const metrics = deriveSeasonReviewMetrics(state, 2);

  expect(metrics.countriesScoutedThisSeason.sort()).toEqual([
    "england",
    "spain",
  ]);
  expect(metrics.regionsScoutedThisSeason.sort()).toEqual([
    "catalonia",
    "madrid",
  ]);
  expect(metrics.homeCountry).toBe("england");
  expect(metrics.unsignedYouthDiscovered).toBe(2);
  expect(metrics.successfulPlacements).toBe(1);
  expect(metrics.alumniMilestonesThisSeason).toBe(1);
});

test("deriveSeasonReviewMetrics still counts a placed discovery after the active youth duplicate is removed", () => {
  const state = {
    scout: { id: "scout-1", homeCountry: "england" },
    reports: {
      placed: {
        id: "report-placed",
        scoutId: "scout-1",
        playerId: "placed-player",
        submittedSeason: 2,
      },
    },
    scoutingCases: {},
    observations: {},
    players: {
      "placed-player": { id: "placed-player", clubId: "club-england" },
    },
    retiredPlayers: {},
    clubs: {
      "club-england": { id: "club-england", leagueId: "league-england" },
    },
    leagues: {
      "league-england": { id: "league-england", country: "england" },
    },
    unsignedYouth: {},
    subRegions: {},
    discoveryRecords: [{ playerId: "placed-player", discoveredSeason: 2 }],
    placementReports: {
      accepted: {
        id: "placement-1",
        reportId: "report-placed",
        unsignedYouthId: "removed-youth-id",
        scoutId: "scout-1",
        clubResponse: "accepted",
        season: 2,
      },
    },
    alumniRecords: [{
      id: "alumni-1",
      playerId: "placed-player",
      placedSeason: 2,
      milestones: [],
    }],
  } as unknown as GameState;

  const metrics = deriveSeasonReviewMetrics(state, 2);

  expect(metrics.unsignedYouthDiscovered).toBe(1);
  expect(metrics.successfulPlacements).toBe(1);
});
