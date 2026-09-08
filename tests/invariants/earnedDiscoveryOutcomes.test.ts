import { describe, expect, it } from "vitest";
import type { GameState, ScoutReport } from "@/engine/core/types";
import { getEarnedDiscoveryOutcomes } from "@/engine/career/earnedDiscoveryOutcomes";
import { countWonderkidDiscoveries, getAchievementProgress } from "@/engine/core/achievementEngine";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { achievementPresentation } from "@/lib/achievementPresentation";
import { SCENARIOS } from "@/engine/scenarios";
import { useAchievementStore } from "@/stores/achievementStore";

function stateWithDiscovery(): GameState {
  return {
    currentSeason: 1, currentWeek: 20, players: {}, unsignedYouth: {}, retiredPlayers: {},
    discoveryRecords: [{
      playerId: "prospect", discoveredSeason: 1, discoveredWeek: 1,
      initialCA: 30, initialPA: 80, wasWonderkid: false, careerSnapshots: [],
    }],
    reports: {
      report: {
        id: "report", playerId: "prospect", submittedSeason: 1, submittedWeek: 2,
        conviction: "recommend", recommendedAction: "offerAcademyPlace",
      },
    },
    fixtures: {}, matchRatings: {},
    worldHistory: { version: 1, latestRecordedSeason: 0, seasons: [] },
  } as unknown as GameState;
}

function addMatches(state: GameState, count: number, season = 1, averageRating = 7): void {
  for (let index = 0; index < count; index++) {
    const id = `match-${season}-${index}`;
    state.fixtures[id] = {
      id, season, week: index + 3, played: true,
      homeClubId: "home", awayClubId: "away", leagueId: "league",
    };
    state.matchRatings[id] = { prospect: {
      fixtureId: id, playerId: "prospect", minutesPlayed: 90, started: true,
      rating: averageRating, source: "simulated", stats: {}, eventCount: 1,
    } };
  }
}

function addArchive(state: GameState, season: number, appearances = 20, averageRating = 7.5): void {
  state.worldHistory!.seasons.push({
    season, recordedAfterTotalWeeks: season * 46, clubs: [], leagues: [],
    players: [{
      playerId: "prospect", nationality: "French", age: 22, position: "CM",
      currentAbility: 1, marketValue: 1, status: "contracted", movementEventIds: [],
      performance: {
        appearances, starts: appearances, minutesPlayed: appearances * 90,
        appearancesWithoutMinutes: 0, averageRating, goals: 0, assists: 0, cleanSheets: 0,
      },
    }],
  });
  state.worldHistory!.latestRecordedSeason = Math.max(state.worldHistory!.latestRecordedSeason, season);
}

const achievement = (id: string) => ACHIEVEMENTS.find((candidate) => candidate.id === id)!;

describe("earned discovery outcomes", () => {
  it("hidden PA, CA, wonderkid labels and unsupported careerOutcome cannot unlock anything immediately", () => {
    const state = stateWithDiscovery();
    const baseline = getEarnedDiscoveryOutcomes(state);
    Object.assign(state.discoveryRecords[0], {
      initialCA: 200, initialPA: 200, wasWonderkid: true, careerOutcome: "starPlayer",
    });
    state.unsignedYouth.youth = { id: "youth", player: {
      id: "prospect", nationality: "French", currentAbility: 200,
      potentialAbility: 200, wonderkidTier: "generational",
    } } as GameState["unsignedYouth"][string];
    expect(getEarnedDiscoveryOutcomes(state)).toEqual(baseline);
    for (const id of ["wonderkid-found", "discoveries-5", "discoveries-15", "generational-talent"]) {
      expect(achievement(id).check(state)).toBe(false);
    }
    for (const scenario of SCENARIOS) {
      for (const objective of scenario.objectives.filter((item) => item.id.includes("wonderkid"))) {
        expect(objective.check(state)).toBe(false);
      }
    }
    expect(getAchievementProgress(state, "discoveries-5")?.current).toBe(0);
  });

  it("an initially unheralded discovery earns one success after ten later good rated appearances", () => {
    const state = stateWithDiscovery();
    addMatches(state, 9);
    expect(countWonderkidDiscoveries(state)).toBe(0);
    addMatches(state, 10);
    const before = structuredClone(state);
    expect(getEarnedDiscoveryOutcomes(state)).toEqual([{
      playerId: "prospect", nationality: undefined, successfulSeasons: [1], standoutSeasons: [],
    }]);
    expect(achievement("wonderkid-found").check(state)).toBe(true);
    expect(getAchievementProgress(state, "discoveries-5")?.current).toBe(1);
    expect(state).toEqual(before);
    expect(getEarnedDiscoveryOutcomes(JSON.parse(JSON.stringify(state)))).toEqual(getEarnedDiscoveryOutcomes(state));
  });

  it("does not backdate credit to performances before or during the report week", () => {
    const state = stateWithDiscovery();
    addMatches(state, 10);
    state.reports.report.submittedWeek = 12;
    expect(countWonderkidDiscoveries(state)).toBe(0);
    state.reports.report.submittedWeek = 2;
    state.currentWeek = 11;
    expect(countWonderkidDiscoveries(state)).toBe(0);
  });

  it("ignores unplayed, undated, future, non-participating, malformed and mismatched ratings", () => {
    for (const invalidate of [
      (state: GameState) => { state.fixtures["match-1-9"].played = false; },
      (state: GameState) => { delete state.fixtures["match-1-9"].season; },
      (state: GameState) => { state.fixtures["match-1-9"].week = 99; },
      (state: GameState) => { state.matchRatings["match-1-9"].prospect.minutesPlayed = 0; },
      (state: GameState) => { state.matchRatings["match-1-9"].prospect.minutesPlayed = Number.NaN; },
      (state: GameState) => { state.matchRatings["match-1-9"].prospect.rating = Number.NaN; },
      (state: GameState) => { state.matchRatings["match-1-9"].prospect.fixtureId = "wrong"; },
    ]) {
      const state = stateWithDiscovery();
      addMatches(state, 10);
      invalidate(state);
      expect(countWonderkidDiscoveries(state)).toBe(0);
    }
  });

  it("requires an authored backing report and respects monitor or pass over optimistic conviction", () => {
    const state = stateWithDiscovery();
    addMatches(state, 10);
    const report = state.reports.report;
    for (const action of ["monitor", "pass"]) {
      report.recommendedAction = action as ScoutReport["recommendedAction"];
      expect(countWonderkidDiscoveries(state)).toBe(0);
    }
    delete report.recommendedAction;
    expect(countWonderkidDiscoveries(state)).toBe(1); // Dated legacy backing still qualifies.
    report.conviction = "note";
    expect(countWonderkidDiscoveries(state)).toBe(0);
    state.reports = {};
    expect(countWonderkidDiscoveries(state)).toBe(0);
  });

  it("does not duplicate credit for report revisions, duplicate discoveries or fixture aliases", () => {
    const state = stateWithDiscovery();
    addMatches(state, 9);
    state.fixtures.alias = state.fixtures["match-1-0"];
    state.matchRatings.alias = state.matchRatings["match-1-0"];
    expect(countWonderkidDiscoveries(state)).toBe(0);
    addMatches(state, 10);
    state.discoveryRecords.push(structuredClone(state.discoveryRecords[0]));
    state.reports.revision = { ...state.reports.report, id: "revision", revision: 2 };
    expect(countWonderkidDiscoveries(state)).toBe(1);
  });

  it("uses later completed archives, preserves public nationality after retirement compaction and avoids double counts", () => {
    const state = stateWithDiscovery();
    state.currentSeason = 4;
    addArchive(state, 1); // Full archive cannot isolate post-report games in report season.
    addArchive(state, 4); // Future/incomplete season.
    expect(countWonderkidDiscoveries(state)).toBe(0);
    addArchive(state, 2);
    addMatches(state, 20, 2, 7.5);
    expect(getEarnedDiscoveryOutcomes(state)[0]).toMatchObject({
      nationality: "French", successfulSeasons: [2], standoutSeasons: [2],
    });
    expect(achievement("generational-talent").check(state)).toBe(false);
    addArchive(state, 3);
    expect(achievement("generational-talent").check(state)).toBe(true);
  });

  it("requires sustained rating quality rather than appearances or labels alone", () => {
    const state = stateWithDiscovery();
    addMatches(state, 15, 1, 6.9);
    expect(countWonderkidDiscoveries(state)).toBe(0);
    state.currentSeason = 4;
    addArchive(state, 2, 19, 9);
    addArchive(state, 3, 20, 7.49);
    expect(countWonderkidDiscoveries(state)).toBe(1);
    expect(achievement("generational-talent").check(state)).toBe(false);
  });

  it("presents the actual outcome requirement instead of disguising a hidden-potential award", () => {
    const presentation = achievementPresentation(achievement("wonderkid-found"));
    expect(presentation.hint).toContain("10 rated appearances");
    expect(presentation.showProgress).toBe(true);
    expect(achievementPresentation(achievement("generational-talent")).hint).toContain("two seasons");
  });

  it("preserves existing historical unlock IDs and dates when old saves lack outcome evidence", () => {
    const previous = useAchievementStore.getState();
    const record = { achievementId: "wonderkid-found", unlockedAt: 123, week: 1, season: 1 };
    try {
      useAchievementStore.setState({
        unlockedAchievements: new Set(["wonderkid-found"]),
        unlockRecords: { "wonderkid-found": record },
        pendingToasts: [], progressCache: {},
      });
      useAchievementStore.getState().checkAndUnlock(stateWithDiscovery());
      expect(useAchievementStore.getState().unlockedAchievements.has("wonderkid-found")).toBe(true);
      expect(useAchievementStore.getState().unlockRecords["wonderkid-found"]).toEqual(record);
    } finally {
      useAchievementStore.setState(previous);
    }
  });
});
