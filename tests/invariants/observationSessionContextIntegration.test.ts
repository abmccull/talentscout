import { describe, expect, it, vi } from "vitest";
import type { Observation, ReflectionJournalEntry } from "@/engine/core/types";

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

describe("observation session context integration", () => {
  it("carries prior evidence across youth aliases and keeps the contextual opening question", async () => {
    const { useGameStore } = await import("@/stores/gameStore");
    await useGameStore.getState().startNewGame({
      scoutFirstName: "Context",
      scoutLastName: "Scout",
      scoutAge: 24,
      specialization: "youth",
      difficulty: "normal",
      worldSeed: "observation-session-context",
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

    const state = useGameStore.getState().gameState!;
    const youth = Object.values(state.unsignedYouth)[0];
    expect(youth).toBeDefined();
    const canonicalPlayerId = youth.player.id;
    const observation = {
      id: "prior-context-observation",
      playerId: canonicalPlayerId,
      scoutId: state.scout.id,
      week: state.currentWeek,
      season: state.currentSeason,
      context: "schoolMatch",
      attributeReadings: [{
        attribute: "firstTouch",
        perceivedValue: 12,
        confidence: 0.65,
        observationCount: 1,
      }],
      notes: [],
      flaggedMoments: [],
    } satisfies Observation;
    const reflection = {
      id: "prior-context-reflection",
      sessionId: "prior-session",
      activityType: "schoolMatch",
      week: state.currentWeek,
      season: state.currentSeason,
      playerIds: [canonicalPlayerId],
      notes: [],
      hypotheses: [],
      scoutingQuestionId: "execution",
      evidenceCards: [],
      createdAt: 1,
    } satisfies ReflectionJournalEntry;

    useGameStore.setState({
      activeSession: null,
      gameState: {
        ...state,
        observations: { ...state.observations, [observation.id]: observation },
        reflectionJournal: {
          ...(state.reflectionJournal ?? {}),
          [reflection.id]: reflection,
        },
      },
    });

    useGameStore.getState().startObservationSession(
      "schoolMatch",
      [{
        playerId: youth.id,
        name: `${youth.player.firstName} ${youth.player.lastName}`,
        position: youth.player.position,
      }],
      youth.id,
    );

    const session = useGameStore.getState().activeSession;
    expect(session?.observerContext).toMatchObject({
      priorObservationCount: 1,
      priorQuestionIds: ["execution"],
      priorEvidenceQuality: 0.65,
    });
    expect(session?.questionOptions?.[0]).toMatchObject({ recommended: true });
    expect(session?.scoutingQuestionId).toBe(session?.questionOptions?.[0]?.id);
  }, 30_000);
});
