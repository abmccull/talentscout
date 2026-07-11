import assert from "node:assert/strict";
import test from "node:test";

import type { GameState } from "../core/types";
import { deriveSeasonReviewMetrics } from "./seasonReviewContext";

test("deriveSeasonReviewMetrics uses season activity instead of global country state", () => {
  const state = {
    scout: {
      id: "scout-1",
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
          familiarity: 15,
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

  assert.deepEqual(metrics.countriesScoutedThisSeason.sort(), [
    "england",
    "spain",
  ]);
  assert.deepEqual(metrics.regionsScoutedThisSeason.sort(), [
    "catalonia",
    "madrid",
  ]);
  assert.equal(metrics.homeCountry, "england");
  assert.equal(metrics.unsignedYouthDiscovered, 2);
  assert.equal(metrics.successfulPlacements, 1);
  assert.equal(metrics.alumniMilestonesThisSeason, 1);
});
