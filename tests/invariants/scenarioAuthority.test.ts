import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type {
  GameState,
  ScoutReport,
} from "@/engine/core/types";
import {
  SCENARIOS,
  checkScenarioObjectives,
  isScenarioFailed,
  reconcileScenarioAuthority,
  resolveScenarioOutcome,
} from "@/engine/scenarios";
import { migrateSaveState } from "@/lib/db";
import { DEMO_SCENARIO_IDS } from "@/lib/demo";

function baseState(scenarioId = SCENARIOS[0].id): GameState {
  const scenario = SCENARIOS.find((candidate) => candidate.id === scenarioId) ?? SCENARIOS[0];
  return {
    currentSeason: scenario.setup.startingSeason,
    currentWeek: scenario.setup.startingWeek,
    activeScenarioId: scenarioId,
    completedScenarioIds: [],
    reports: {},
    placementReports: {},
    discoveryRecords: [],
    players: {},
    rivalScouts: {
      nemesis: {
        id: "nemesis",
        name: "Test Nemesis",
        isNemesis: true,
        reputation: 100,
        targetPlayerIds: [],
      },
    },
    scout: {
      careerTier: 1,
      reputation: 0,
      countryReputations: {},
    },
    legacyScore: {
      totalScore: 0,
      scenariosCompleted: 0,
    },
  } as unknown as GameState;
}

function addReports(
  state: GameState,
  count: number,
  options: {
    conviction?: ScoutReport["conviction"];
    quality?: number;
    nationalities?: string[];
  } = {},
): void {
  for (let index = 0; index < count; index++) {
    const playerId = `player-${index}`;
    state.players[playerId] = {
      id: playerId,
      nationality: options.nationalities?.[index % options.nationalities.length] ?? "English",
    } as GameState["players"][string];
    state.reports[`report-${index}`] = {
      id: `report-${index}`,
      playerId,
      conviction: options.conviction ?? "note",
      qualityScore: options.quality ?? 10,
    } as ScoutReport;
  }
}

function addDiscoveries(
  state: GameState,
  count: number,
  wonderkid: boolean,
  nationalities: string[] = ["English"],
): void {
  for (let index = 0; index < count; index++) {
    const playerId = `discovery-player-${index}`;
    state.players[playerId] = {
      id: playerId,
      nationality: nationalities[index % nationalities.length],
    } as GameState["players"][string];
    state.discoveryRecords.push({ playerId, wasWonderkid: wonderkid } as GameState["discoveryRecords"][number]);
  }
}

type ObjectiveCase = {
  scenarioId: string;
  objectiveId: string;
  satisfy: (state: GameState) => void;
};

const OBJECTIVE_CASES: ObjectiveCase[] = [
  { scenarioId: "the_rescue_job", objectiveId: "submit_3_recommend_reports", satisfy: (state) => addReports(state, 3, { conviction: "recommend" }) },
  { scenarioId: "the_rescue_job", objectiveId: "submit_before_week_28", satisfy: (state) => { state.currentWeek = 28; addReports(state, 3, { conviction: "recommend" }); } },
  { scenarioId: "the_rescue_job", objectiveId: "bonus_table_pound", satisfy: (state) => addReports(state, 1, { conviction: "tablePound" }) },
  { scenarioId: "youth_academy_challenge", objectiveId: "place_5_youth", satisfy: (state) => { state.placementReports = Object.fromEntries(Array.from({ length: 5 }, (_, index) => [`placement-${index}`, {}])) as GameState["placementReports"]; } },
  { scenarioId: "youth_academy_challenge", objectiveId: "discover_wonderkid", satisfy: (state) => addDiscoveries(state, 1, true) },
  { scenarioId: "the_data_pioneer", objectiveId: "submit_10_recommend_reports", satisfy: (state) => addReports(state, 10, { conviction: "recommend" }) },
  { scenarioId: "the_data_pioneer", objectiveId: "high_quality_reports", satisfy: (state) => addReports(state, 5, { quality: 70 }) },
  { scenarioId: "international_assignment", objectiveId: "report_3_foreign_players", satisfy: (state) => addReports(state, 3, { nationalities: ["French"] }) },
  { scenarioId: "international_assignment", objectiveId: "build_country_familiarity", satisfy: (state) => { state.scout.countryReputations = { england: { reportsSubmitted: 1 }, france: { reportsSubmitted: 1 } } as unknown as GameState["scout"]["countryReputations"]; } },
  { scenarioId: "the_rebuild", objectiveId: "submit_15_reports", satisfy: (state) => addReports(state, 15) },
  { scenarioId: "the_rebuild", objectiveId: "submit_3_table_pounds", satisfy: (state) => addReports(state, 3, { conviction: "tablePound" }) },
  { scenarioId: "the_rebuild", objectiveId: "high_avg_quality", satisfy: (state) => addReports(state, 1, { quality: 60 }) },
  { scenarioId: "moneyball", objectiveId: "submit_8_quality_reports", satisfy: (state) => addReports(state, 8, { quality: 65 }) },
  { scenarioId: "moneyball", objectiveId: "multi_country_finds", satisfy: (state) => addReports(state, 3, { quality: 65, nationalities: ["French", "Spanish", "German"] }) },
  { scenarioId: "wonderkid_hunter", objectiveId: "discover_3_wonderkids", satisfy: (state) => addDiscoveries(state, 3, true) },
  { scenarioId: "wonderkid_hunter", objectiveId: "multi_country_wonderkids", satisfy: (state) => addDiscoveries(state, 2, true, ["French", "Spanish"]) },
  { scenarioId: "the_last_season", objectiveId: "reach_legacy_100", satisfy: (state) => { state.legacyScore.totalScore = 100; } },
  { scenarioId: "the_last_season", objectiveId: "final_table_pound", satisfy: (state) => addReports(state, 1, { conviction: "tablePound" }) },
  { scenarioId: "rivalry", objectiveId: "5_discoveries_before_rivals", satisfy: (state) => addDiscoveries(state, 5, false) },
  { scenarioId: "rivalry", objectiveId: "outpace_nemesis", satisfy: (state) => { state.scout.reputation = 101; } },
  { scenarioId: "zero_to_hero", objectiveId: "reach_tier_3", satisfy: (state) => { state.scout.careerTier = 3; } },
  { scenarioId: "zero_to_hero", objectiveId: "reach_reputation_60", satisfy: (state) => { state.scout.reputation = 60; } },
  { scenarioId: "zero_to_hero", objectiveId: "submit_20_reports", satisfy: (state) => addReports(state, 20) },
];

describe("scenario content authority", () => {
  it("keeps every configured demo scenario inside the shipped authority table", () => {
    const shippedIds = new Set(SCENARIOS.map((scenario) => scenario.id));
    expect(DEMO_SCENARIO_IDS.every((scenarioId) => shippedIds.has(scenarioId))).toBe(true);
  });

  it("has one passing boundary fixture for every shipped objective", () => {
    expect(new Set(SCENARIOS.map((scenario) => scenario.id)).size).toBe(SCENARIOS.length);
    for (const scenario of SCENARIOS) {
      expect(new Set(scenario.objectives.map((objective) => objective.id)).size).toBe(scenario.objectives.length);
      expect(scenario.objectives.some((objective) => objective.required)).toBe(true);
      expect(scenario.estimatedSeasons).toBeGreaterThan(0);
    }
    const shippedKeys = SCENARIOS.flatMap((scenario) =>
      scenario.objectives.map((objective) => `${scenario.id}:${objective.id}`),
    ).sort();
    const testedKeys = OBJECTIVE_CASES.map((entry) => `${entry.scenarioId}:${entry.objectiveId}`).sort();
    expect(testedKeys).toEqual(shippedKeys);

    for (const entry of OBJECTIVE_CASES) {
      const state = baseState(entry.scenarioId);
      const scenario = SCENARIOS.find((candidate) => candidate.id === entry.scenarioId)!;
      const objective = scenario.objectives.find((candidate) => candidate.id === entry.objectiveId)!;
      expect(objective.check(state), `${entry.scenarioId}:${entry.objectiveId} starts incomplete`).toBe(false);

      entry.satisfy(state);
      expect(objective.check(state), `${entry.scenarioId}:${entry.objectiveId} reaches its documented boundary`).toBe(true);
      const progress = checkScenarioObjectives(state, entry.scenarioId);
      expect(progress.objectives.find((candidate) => candidate.id === entry.objectiveId)?.completed).toBe(true);

      const reloaded = JSON.parse(JSON.stringify(state)) as GameState;
      expect(checkScenarioObjectives(reloaded, entry.scenarioId)).toEqual(progress);
    }
  });

  it.each(SCENARIOS.map((scenario) => [scenario.id, scenario] as const))(
    "%s enforces its season deadline at the first season beyond its budget",
    (_id, scenario) => {
      const lastAllowed = baseState(scenario.id);
      lastAllowed.currentSeason = scenario.setup.startingSeason + scenario.estimatedSeasons - 1;
      lastAllowed.currentWeek = scenario.setup.startingWeek;
      expect(isScenarioFailed(lastAllowed, scenario.id).failed).toBe(false);

      const expired = { ...lastAllowed, currentSeason: lastAllowed.currentSeason + 1 };
      expect(isScenarioFailed(expired, scenario.id)).toMatchObject({ failed: true });
    },
  );

  it("keeps the rescue-window boundary inclusive and rejects late completion", () => {
    const boundary = baseState("the_rescue_job");
    boundary.currentWeek = 28;
    addReports(boundary, 3, { conviction: "recommend" });
    expect(isScenarioFailed(boundary, "the_rescue_job").failed).toBe(false);
    expect(checkScenarioObjectives(boundary, "the_rescue_job").allRequiredComplete).toBe(true);

    const late = { ...boundary, currentWeek: 29 };
    expect(isScenarioFailed(late, "the_rescue_job")).toMatchObject({ failed: true });
    expect(checkScenarioObjectives(late, "the_rescue_job").allRequiredComplete).toBe(false);
  });

  it.each(SCENARIOS.map((scenario) => scenario.id))(
    "%s grants its completion marker exactly once",
    (scenarioId) => {
      const failure = resolveScenarioOutcome(baseState(scenarioId), "failure");
      expect(failure).toMatchObject({ valid: true, rewardApplied: false, resolvedScenarioId: scenarioId });
      expect(failure.state.completedScenarioIds).not.toContain(scenarioId);
      expect(failure.state.legacyScore.scenariosCompleted).toBe(0);

      const first = resolveScenarioOutcome(baseState(scenarioId), "victory");
      expect(first).toMatchObject({ valid: true, rewardApplied: true, resolvedScenarioId: scenarioId });
      expect(first.state.completedScenarioIds.filter((id) => id === scenarioId)).toHaveLength(1);
      expect(first.state.legacyScore.scenariosCompleted).toBe(1);

      const reloaded = reconcileScenarioAuthority(JSON.parse(JSON.stringify(first.state)) as GameState);
      const duplicate = resolveScenarioOutcome({ ...reloaded, activeScenarioId: scenarioId }, "victory");
      expect(duplicate.rewardApplied).toBe(false);
      expect(duplicate.state.completedScenarioIds.filter((id) => id === scenarioId)).toHaveLength(1);
      expect(duplicate.state.legacyScore.scenariosCompleted).toBe(1);
    },
  );

  it("fails closed for unknown IDs and archives legacy markers without rewards", () => {
    const unknownId = "removed_scenario_v0";
    const state = baseState();
    state.activeScenarioId = unknownId;
    state.completedScenarioIds = [unknownId, "the_data_pioneer", "career_retired_voluntarily"];
    state.legacyScore.scenariosCompleted = 99;

    expect(checkScenarioObjectives(state, unknownId)).toMatchObject({
      valid: false,
      allRequiredComplete: false,
      failed: true,
    });
    expect(isScenarioFailed(state, unknownId).failed).toBe(true);

    const attemptedVictory = resolveScenarioOutcome(state, "victory");
    expect(attemptedVictory).toMatchObject({ valid: false, rewardApplied: false });
    expect(attemptedVictory.state.activeScenarioId).toBeUndefined();
    expect(attemptedVictory.state.completedScenarioIds).toEqual([
      "the_data_pioneer",
      "career_retired_voluntarily",
    ]);
    expect(attemptedVictory.state.legacyScore.scenariosCompleted).toBe(1);
    expect(attemptedVictory.state.invalidScenarioArchives).toEqual(expect.arrayContaining([
      expect.objectContaining({ scenarioId: unknownId, source: "active" }),
      expect.objectContaining({ scenarioId: unknownId, source: "completed" }),
    ]));
    expect(reconcileScenarioAuthority(attemptedVictory.state)).toEqual(attemptedVictory.state);
  });

  it("runs the same fail-closed reconciliation through the canonical save migration", () => {
    const goldenPath = fileURLToPath(new URL("../fixtures/saves/v0-save-record.json", import.meta.url));
    const legacy = JSON.parse(readFileSync(goldenPath, "utf8")) as { state: Record<string, unknown> };
    const rawState = {
      ...legacy.state,
      activeScenarioId: "removed_cloud_scenario",
      completedScenarioIds: ["removed_cloud_scenario", "moneyball"],
      legacyScore: { scenariosCompleted: 20, totalScore: 0 },
    };

    const migrated = migrateSaveState(rawState);
    expect(migrated.activeScenarioId).toBeUndefined();
    expect(migrated.completedScenarioIds).toEqual(["moneyball"]);
    expect(migrated.legacyScore.scenariosCompleted).toBe(1);
    expect(migrated.invalidScenarioArchives).toEqual(expect.arrayContaining([
      expect.objectContaining({ scenarioId: "removed_cloud_scenario", source: "active" }),
      expect.objectContaining({ scenarioId: "removed_cloud_scenario", source: "completed" }),
    ]));

    const reloaded = migrateSaveState(JSON.parse(JSON.stringify(migrated)));
    expect(reloaded.completedScenarioIds).toEqual(migrated.completedScenarioIds);
    expect(reloaded.invalidScenarioArchives).toEqual(migrated.invalidScenarioArchives);
    expect(reloaded.legacyScore.scenariosCompleted).toBe(1);
  });
});
