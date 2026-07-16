import { describe, expect, it, vi } from "vitest";

import { addActivity, createWeekSchedule } from "@/engine/core/calendar";
import type {
  Activity,
  CulturalInsight,
  GameState,
  Observation,
} from "@/engine/core/types";
import { createBackgroundObservationSituation } from "@/engine/observation/backgroundSituation";
import { createRNG } from "@/engine/rng";
import { produceWeeklyPlayerObservation } from "@/stores/actions/weeklyObservationProducer";

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

const BRAZIL_INSIGHT: CulturalInsight = {
  type: "developmentCulture",
  description: "Informal small-sided development sharpens improvisation.",
  gameplayEffect: "Technical evidence is easier to interpret in local context.",
};

async function createSituationState(seed: string): Promise<GameState> {
  const { useGameStore } = await import("@/stores/gameStore");
  await useGameStore.getState().startNewGame({
    scoutFirstName: "Background",
    scoutLastName: "Observer",
    scoutAge: 29,
    specialization: "data",
    difficulty: "normal",
    worldSeed: seed,
    selectedCountries: ["england", "brazil"],
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
  const state = useGameStore.getState().gameState!;
  const activity: Activity = {
    type: "deepVideoAnalysis",
    slots: 1,
    description: "Deep video review",
  };
  return {
    ...state,
    schedule: addActivity(
      createWeekSchedule(state.currentWeek, state.currentSeason),
      activity,
      0,
    ),
    scout: {
      ...state.scout,
      travelBooking: {
        destinationCountry: "brazil",
        departureWeek: state.currentWeek,
        returnWeek: state.currentWeek + 2,
        cost: 1_000,
        isAbroad: true,
        posture: "deepDive",
      },
    },
    regionalKnowledge: {
      ...state.regionalKnowledge,
      brazil: {
        countryId: "brazil",
        knowledgeLevel: 45,
        discoveredLeagues: [],
        culturalInsights: [BRAZIL_INSIGHT],
        localContacts: [],
        scoutingEfficiency: 1,
      },
    },
  };
}

function firstPlayer(state: GameState) {
  const player = Object.values(state.players)[0]
    ?? Object.values(state.unsignedYouth)[0]?.player;
  if (!player) throw new Error("Expected generated player pool");
  return player;
}

describe("background observation situation authority", () => {
  it("is stable across save/reload and carries schedule, culture, and travel identity", async () => {
    const state = await createSituationState("background-situation-save");
    const player = firstPlayer(state);
    const input = {
      state,
      activityType: "deepVideoAnalysis" as const,
      observationContext: "deepVideoAnalysis" as const,
      player,
      existingObservations: [] as Observation[],
      countryId: "Brazil",
    };

    const first = createBackgroundObservationSituation(input);
    const reloaded = createBackgroundObservationSituation({
      ...input,
      state: JSON.parse(JSON.stringify(state)) as GameState,
    });

    expect(reloaded).toEqual(first);
    expect(first.activityInstanceId).toBeTruthy();
    expect(first.situation.countryId).toBe("brazil");
    expect(first.situation.travelPosture).toBe("deepDive");
    expect(first.situation.culturalInsightIds).toHaveLength(1);
    expect(first.situation.repetitionKey).toContain("deepVideoAnalysis");
  }, 30_000);

  it("persists the situation before perception and makes posture affect evidence", async () => {
    const deepState = await createSituationState("background-situation-signal");
    const player = firstPlayer(deepState);
    const blitzState: GameState = {
      ...deepState,
      scout: {
        ...deepState.scout,
        travelBooking: deepState.scout.travelBooking
          ? { ...deepState.scout.travelBooking, posture: "opportunityBlitz" }
          : undefined,
      },
    };
    const observe = (state: GameState) => produceWeeklyPlayerObservation({
      state,
      rng: createRNG("identical-background-perception-stream"),
      scout: state.scout,
      player,
      context: "deepVideoAnalysis",
      activityType: "deepVideoAnalysis",
      countryId: "brazil",
      existingObservations: [],
    });
    const deep = observe(deepState);
    const blitz = observe(blitzState);
    const averageConfidence = (observation: Observation) =>
      observation.attributeReadings.reduce((sum, reading) => sum + reading.confidence, 0)
      / observation.attributeReadings.length;

    expect(deep.situation?.travelPosture).toBe("deepDive");
    expect(blitz.situation?.travelPosture).toBe("opportunityBlitz");
    expect(deep.situation?.uncertaintyMultiplier)
      .toBeLessThan(blitz.situation?.uncertaintyMultiplier ?? 0);
    expect(averageConfidence(deep)).toBeGreaterThan(averageConfidence(blitz));
    expect(deep.activityInstanceId).toBeTruthy();
    expect(deep.situation?.repetitionKey).toBeTruthy();
  }, 30_000);
});
