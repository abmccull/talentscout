import { describe, expect, it } from "vitest";
import { simulateAbstractCompetitionWeek } from "@/engine/world/abstractCompetition";
import { migrateHistoricalFixtureRetention } from "@/engine/world/saveRetention";
import {
  buildAbstractCompetitionHarness,
  cloneJson,
  mergeAbstractFixtures,
  mergeAbstractMatchRatings,
  minimalGameState,
} from "./abstractCompetitionHarness";

describe("abstract competition save and replay invariants", () => {
  it("replays the same saved week idempotently and keeps the next week deterministic after reload", () => {
    const harness = buildAbstractCompetitionHarness();
    const weekOne = simulateAbstractCompetitionWeek({
      worldSeed: "abstract-save-reload",
      season: 3,
      week: 1,
      ...harness,
    });
    const persistedFixtures = mergeAbstractFixtures(weekOne.fixturesPlayed);
    const persistedMatchRatings = mergeAbstractMatchRatings(weekOne.matchRatingsByFixture);
    const reloadedFixtures = cloneJson(persistedFixtures);
    const reloadedMatchRatings = cloneJson(persistedMatchRatings);

    const sameWeekReplay = simulateAbstractCompetitionWeek({
      worldSeed: "abstract-save-reload",
      season: 3,
      week: 1,
      ...harness,
      fixtures: reloadedFixtures,
      matchRatings: reloadedMatchRatings,
    });
    expect(sameWeekReplay.fixturesPlayed).toEqual([]);
    expect(sameWeekReplay.matchRatingsByFixture).toEqual({});
    expect(sameWeekReplay.skippedFixtureIds.sort()).toEqual(
      Object.keys(reloadedFixtures).sort(),
    );

    const nextWeekFromLiveState = simulateAbstractCompetitionWeek({
      worldSeed: "abstract-save-reload",
      season: 3,
      week: 2,
      ...harness,
      fixtures: persistedFixtures,
      matchRatings: persistedMatchRatings,
    });
    const nextWeekFromReload = simulateAbstractCompetitionWeek({
      worldSeed: "abstract-save-reload",
      season: 3,
      week: 2,
      ...harness,
      fixtures: reloadedFixtures,
      matchRatings: reloadedMatchRatings,
    });
    expect(nextWeekFromReload).toEqual(nextWeekFromLiveState);
  });

  it("keeps current-season abstract fixtures and ratings through save-retention migration", () => {
    const harness = buildAbstractCompetitionHarness();
    const weekOne = simulateAbstractCompetitionWeek({
      worldSeed: "abstract-save-retention",
      season: 3,
      week: 1,
      ...harness,
    });
    const state = minimalGameState({
      currentSeason: 3,
      currentWeek: 1,
      fixtures: mergeAbstractFixtures(weekOne.fixturesPlayed),
      matchRatings: mergeAbstractMatchRatings(weekOne.matchRatingsByFixture),
      playedFixtures: [],
    });
    const beforeFixtureIds = Object.keys(state.fixtures).sort();
    const beforeRatingIds = Object.keys(state.matchRatings).sort();

    migrateHistoricalFixtureRetention(state);

    expect(Object.keys(state.fixtures).sort()).toEqual(beforeFixtureIds);
    expect(Object.keys(state.matchRatings).sort()).toEqual(beforeRatingIds);

    const replayAfterRetention = simulateAbstractCompetitionWeek({
      worldSeed: "abstract-save-retention",
      season: 3,
      week: 1,
      ...harness,
      fixtures: state.fixtures,
      matchRatings: state.matchRatings,
    });
    expect(replayAfterRetention.fixturesPlayed).toEqual([]);
    expect(replayAfterRetention.skippedFixtureIds.sort()).toEqual(beforeFixtureIds);
  });
});
