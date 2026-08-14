import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Activity, GameState, Observation } from "@/engine/core/types";
import type { WeeklySimulationDiagnosticValue } from "@/engine/core/weeklySimulationTelemetry";
import { addActivity, createWeekSchedule, processCompletedWeek } from "@/engine/core/calendar";
import { createRNG } from "@/engine/rng";
import {
  createObservationEvidenceIndex,
  getPlayerObservationEvidence,
  upsertObservationEvidence,
} from "@/engine/scout/perception";
import { processWeeklyObservationActivities } from "@/stores/actions/weeklyObservationActivities";
import { processWeeklyPlacementResolution } from "@/stores/actions/weeklyPlacementResolution";
import { processWeeklyProfessionalObservationActivities } from "@/stores/actions/weeklyProfessionalObservationActivities";
import { resolveScoutEffectiveCountry } from "@/stores/actions/weeklySimulationSupport";
import { createConsequenceEngineState } from "@/engine/consequences";
import { buildProfessionalCaseOpportunityLockMetadata } from "@/engine/youth/professionalCaseOpportunities";

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

beforeEach(() => {
  vi.resetModules();
});

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

function scheduleFollowUpSession(state: GameState, targetId: string): GameState {
  const activity: Activity = {
    type: "followUpSession",
    slots: 1,
    targetId,
    description: "Follow up on a priority youth case",
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

function scheduleVideoAnalysis(state: GameState): GameState {
  const initialSchedule = createWeekSchedule(state.currentWeek, state.currentSeason);
  const schoolVideo: Activity = {
    type: "watchVideo",
    slots: 1,
    targetId: "video-school",
    description: "Review school match footage",
  };
  const grassrootsVideo: Activity = {
    type: "watchVideo",
    slots: 1,
    targetId: "video-grassroots",
    description: "Review grassroots highlights",
  };
  return {
    ...state,
    schedule: addActivity(
      addActivity(initialSchedule, schoolVideo, 0),
      grassrootsVideo,
      1,
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

function resolveProfessionalVideoWeek(
  state: GameState,
  options: {
    noteDiagnostic?: (
      key: string,
      value: WeeklySimulationDiagnosticValue | undefined,
    ) => void;
  } = {},
) {
  const weekResult = processCompletedWeek(
    state.schedule,
    state.scout,
    createRNG(`${state.seed}-week-${state.currentWeek}-${state.currentSeason}`),
  );
  const observations = { ...state.observations };
  const observationEvidenceIndex = createObservationEvidenceIndex(
    Object.values(observations),
  );
  const playerEvidence = (playerId: string): Observation[] =>
    getPlayerObservationEvidence(observationEvidenceIndex, playerId);
  const recordObservation = (observation: Observation): void => {
    observations[observation.id] = observation;
    upsertObservationEvidence(observationEvidenceIndex, observation);
  };
  const focusedYouth = Object.values(state.unsignedYouth).find(
    (youth) => !youth.placed && !youth.retired,
  );
  const focusTargetId = focusedYouth?.player.id;

  const result = processWeeklyProfessionalObservationActivities({
    sourceState: state,
    state,
    weekResult,
    qualityByType: new Map(),
    scout: state.scout,
    effectiveScoutCountry: resolveScoutEffectiveCountry(
      state.scout,
      state.regionalKnowledge,
      state.currentWeek,
    ),
    rng: createRNG(`${state.seed}-actobs-${state.currentWeek}-${state.currentSeason}`),
    discoveries: state.discoveryRecords ?? [],
    messages: [],
    playersDiscovered: 0,
    observationsGenerated: 0,
    allPlayers: Object.values(state.players),
    extraAttributesPerSession: 0,
    playerEvidence,
    recordObservation,
    observedPlayerIds: new Set(Object.values(observations).map((observation) => observation.playerId)),
    adjustedRange: (minimum, maximum, modifier) => [
      Math.max(1, minimum + modifier),
      Math.max(1, maximum + modifier),
    ],
    discoveryModifier: () => 0,
    relationshipModifier: () => 0,
    reportQualityModifier: () => 0,
    focusDepth: (activityType) => (
      activityType === "watchVideo" && focusTargetId ? 2 : 0
    ),
    focusPlayers: (activityType) => (
      activityType === "watchVideo" && focusTargetId ? [focusTargetId] : []
    ),
    prioritizeYouth: (pool, activityType) => {
      if (activityType !== "watchVideo" || !focusTargetId) return pool;
      const focused = pool.filter((youth) => youth.player.id === focusTargetId);
      const rest = pool.filter((youth) => youth.player.id !== focusTargetId);
      return [...focused, ...rest];
    },
    prioritizePlayers: (pool) => pool,
    tierLabels: {
      poor: "Poor",
      average: "Average",
      good: "Good",
      excellent: "Excellent",
      exceptional: "Exceptional",
    },
    noteDiagnostic: options.noteDiagnostic,
  });

  return {
    ...result,
    observations,
  };
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
    expect(result.state.observations).toBe(empty.observations);
  }, 30_000);

  it("keeps youth watchVideo output stable when optional diagnostics are enabled", async () => {
    const state = scheduleVideoAnalysis(await createObservationState("observation-video-diagnostics"));
    const before = JSON.stringify(state);
    const diagnostics = new Map<string, WeeklySimulationDiagnosticValue>();

    const baseline = resolveProfessionalVideoWeek(state);
    const withDiagnostics = resolveProfessionalVideoWeek(state, {
      noteDiagnostic: (key, value) => {
        diagnostics.set(key, value ?? null);
      },
    });

    expect(withDiagnostics).toEqual(baseline);
    expect(withDiagnostics.observationsGenerated).toBeGreaterThan(0);
    expect(Object.keys(withDiagnostics.observations).length)
      .toBeGreaterThan(Object.keys(state.observations).length);
    expect(JSON.stringify(state)).toBe(before);
    expect(diagnostics.get("professionalObservation.watchVideoYouth.scheduledActivities")).toBe(2);
    expect(diagnostics.get("professionalObservation.watchVideoYouth.selectedYouthCount"))
      .toBe(withDiagnostics.observationsGenerated - 2);
    expect(diagnostics.get("professionalObservation.watchVideoYouth.focusObservationCount")).toBe(2);
    expect(typeof diagnostics.get("professionalObservation.watchVideoYouth.poolSelectionMs")).toBe("number");
    expect(typeof diagnostics.get("professionalObservation.watchVideoYouth.venueObservationMs")).toBe("number");
    expect(typeof diagnostics.get("professionalObservation.watchVideoYouth.updateMessageMs")).toBe("number");
  }, 30_000);

  it("consumes a matching professional-case lock once through weekly completion and does not replay it", async () => {
    const initial = await createObservationState("observation-professional-case-lock");
    const targetYouth = Object.values(initial.unsignedYouth).find(
      (youth) => !youth.placed && !youth.retired,
    );
    expect(targetYouth).toBeTruthy();
    if (!targetYouth) return;

    const caseId = `case_${initial.scout.id}_${targetYouth.player.id}`;
    const state = scheduleFollowUpSession(initial, targetYouth.player.id);
    state.consequenceState = {
      ...createConsequenceEngineState(),
      opportunityLocks: {
        "lock:follow-up": {
          id: "lock:follow-up",
          opportunityId: `professional-case:${caseId}:role-conversion:opening`,
          exclusiveSetId: `professional-case:${caseId}:role-conversion`,
          owner: { kind: "scout", id: state.scout.id },
          status: "active",
          createdAt: { season: state.currentSeason, week: state.currentWeek - 1 },
          expiresAt: { season: state.currentSeason, week: state.currentWeek + 3 },
          sourceDecisionId: "decision:role-conversion",
          metadata: buildProfessionalCaseOpportunityLockMetadata({
            label: "Role-conversion access window",
            playerId: targetYouth.player.id,
            caseId,
            familyId: "role-conversion",
            actorName: "Maya Okoro",
            countryId: targetYouth.player.nationality,
            playerName: `${targetYouth.player.firstName} ${targetYouth.player.lastName}`,
            clubName: "Northbridge Academy",
          }),
        },
      },
    };
    state.scoutingCases = {
      ...state.scoutingCases,
      [caseId]: {
        id: caseId,
        playerId: targetYouth.player.id,
        openedWeek: state.currentWeek - 2,
        openedSeason: state.currentSeason,
        lastUpdatedWeek: state.currentWeek - 2,
        lastUpdatedSeason: state.currentSeason,
      } as NonNullable<GameState["scoutingCases"]>[string],
    };

    const first = resolveObservationWeek(state);
    const factId = `fact:${caseId}:opportunity:lock:follow-up`;
    const messageId = `prospect-follow-up:${caseId}:lock:follow-up`;

    expect(first.state.consequenceState.opportunityLocks["lock:follow-up"]?.status).toBe("consumed");
    expect(first.state.consequenceState.facts[factId]).toMatchObject({
      kind: "professionalCaseOpportunityResolved",
      value: "followUpSession",
    });
    expect(first.state.inbox.filter((message) => message.id === messageId)).toHaveLength(1);

    const replay = resolveObservationWeek(first.state);
    expect(replay.state.consequenceState.opportunityLocks["lock:follow-up"]?.status).toBe("consumed");
    expect(replay.state.consequenceState.facts[factId]).toEqual(first.state.consequenceState.facts[factId]);
    expect(replay.state.inbox.filter((message) => message.id === messageId)).toHaveLength(1);
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
