import { describe, expect, it, vi } from "vitest";
import type { Activity, GameState } from "@/engine/core/types";
import { addActivity, createWeekSchedule, processCompletedWeek } from "@/engine/core/calendar";
import { createRNG } from "@/engine/rng";
import { processWeeklyObservationActivities } from "@/stores/actions/weeklyObservationActivities";
import { processWeeklyPlacementResolution } from "@/stores/actions/weeklyPlacementResolution";

vi.mock("@/lib/activeSaveProvider", () => ({
  getActiveSaveProvider: async () => ({ save: async () => undefined }),
  isSupabaseCloudSaveActive: async () => false,
}));

vi.mock("@/lib/db", () => ({
  AUTOSAVE_SLOT: 0,
  migrateSaveState: (state: unknown) => state,
  migrateFreeAgentGeography: () => undefined,
  db: {
    mods: { toArray: async () => [] },
    leaderboard: { put: async () => undefined, clear: async () => undefined },
  },
}));

async function createObservationState(seed: string): Promise<GameState> {
  const { useGameStore } = await import("@/stores/gameStore");
  await useGameStore.getState().startNewGame({
    scoutFirstName: "Observation",
    scoutLastName: "Invariant",
    scoutAge: 24,
    specialization: "youth",
    difficulty: "normal",
    worldSeed: seed,
    selectedCountries: ["england"],
    startingCountry: "england",
    nationality: "English",
    skillAllocations: {
      technicalEye: 2,
      psychologicalRead: 2,
      playerJudgment: 2,
      potentialAssessment: 2,
    },
    originId: "academy-apprentice",
    flawId: "fragile-network",
    doctrineIds: ["evidence-first"],
  });
  return useGameStore.getState().gameState!;
}

function scheduleSchoolMatch(state: GameState): GameState {
  const activity: Activity = {
    type: "schoolMatch",
    slots: 1,
    description: "Observe a local school match",
  };
  return {
    ...state,
    schedule: addActivity(
      createWeekSchedule(state.currentWeek, state.currentSeason),
      activity,
      0,
    ),
  };
}

function resolveObservationWeek(state: GameState) {
  const weekResult = processCompletedWeek(
    state.schedule,
    state.scout,
    createRNG(`${state.seed}-week-${state.currentWeek}-${state.currentSeason}`),
  );
  return processWeeklyObservationActivities({
    gameState: state,
    state,
    weekResult,
    qualityByType: new Map(),
    completedInteractiveIds: new Set(),
    completedLiveActivityTypes: new Set(),
    discoveryModifiers: new Map(),
    profileModifiers: new Map(),
    anomalyModifiers: new Map(),
    relationshipModifiers: new Map(),
    reportQualityModifiers: new Map(),
    focusDepthByType: new Map(),
    focusedPlayersByType: new Map(),
    weekSimulation: null,
  });
}

describe("weekly observation transaction", () => {
  it("is deterministic and leaves its source state untouched", async () => {
    const state = scheduleSchoolMatch(await createObservationState("observation-transaction"));
    const before = JSON.stringify(state);

    const first = resolveObservationWeek(state);
    const second = resolveObservationWeek(state);
    const sourceObservationIds = new Set(Object.keys(state.observations));
    const generated = Object.values(first.state.observations).filter(
      (observation) => !sourceObservationIds.has(observation.id),
    );

    expect(first.observationsGenerated).toBeGreaterThan(0);
    expect(first.playersDiscovered).toBeGreaterThan(0);
    expect(first).toEqual(second);
    expect(generated.length).toBe(first.observationsGenerated);
    expect(generated.every((observation) => Boolean(
      observation.situation?.id
      && observation.situation.repetitionKey
      && observation.situation.activityType === "schoolMatch",
    ))).toBe(true);
    expect(JSON.stringify(state)).toBe(before);
  }, 30_000);

  it("uses the career seed to produce distinct observation evidence", async () => {
    const base = scheduleSchoolMatch(await createObservationState("observation-seed-a"));
    const alternate = { ...base, seed: "observation-seed-b" };

    const first = resolveObservationWeek(base);
    const second = resolveObservationWeek(alternate);

    expect(first.state.observations).not.toEqual(second.state.observations);
  }, 30_000);

  it("does not manufacture observations when no observation activity completed", async () => {
    const initial = await createObservationState("observation-empty-week");
    const empty = {
      ...initial,
      schedule: createWeekSchedule(initial.currentWeek, initial.currentSeason),
    };
    const result = resolveObservationWeek(empty);

    expect(result.observationsGenerated).toBe(0);
    expect(result.playersDiscovered).toBe(0);
    expect(result.state.observations).toEqual(empty.observations);
  }, 30_000);
});

describe("weekly travel fatigue authority", () => {
  it("applies a trip posture multiplier inside calendar processing", async () => {
    const state = await createObservationState("travel-fatigue-contract");
    const activity: Activity = {
      type: "internationalTravel",
      slots: 1,
      targetId: "brazil",
      description: "Travel to Brazil",
    };
    const schedule = addActivity(
      createWeekSchedule(state.currentWeek, state.currentSeason),
      activity,
      0,
    );
    const seed = `${state.seed}-week-${state.currentWeek}-${state.currentSeason}`;
    const controlled = processCompletedWeek(
      schedule,
      state.scout,
      createRNG(seed),
      { internationalTravel: 0.9 },
    );
    const blitz = processCompletedWeek(
      schedule,
      state.scout,
      createRNG(seed),
      { internationalTravel: 1.25 },
    );

    expect(blitz.fatigueChange).toBeGreaterThan(controlled.fatigueChange);
  }, 30_000);
});

describe("weekly placement transaction", () => {
  it("is an identity transaction without scheduled or pending placement work", async () => {
    const initial = await createObservationState("placement-empty-week");
    const state = {
      ...initial,
      schedule: createWeekSchedule(initial.currentWeek, initial.currentSeason),
    };
    const weekResult = processCompletedWeek(
      state.schedule,
      state.scout,
      createRNG(`${state.seed}-week-${state.currentWeek}-${state.currentSeason}`),
    );

    const result = processWeeklyPlacementResolution({
      sourceState: state,
      state,
      weekResult,
    });

    expect(result).toBe(state);
  }, 30_000);
});
