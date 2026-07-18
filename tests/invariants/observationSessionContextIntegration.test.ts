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

  it("propagates case guidance onto scheduled activities and into the session focus", async () => {
    const { useGameStore } = await import("@/stores/gameStore");
    await useGameStore.getState().startNewGame({
      scoutFirstName: "Case",
      scoutLastName: "Planner",
      scoutAge: 24,
      specialization: "youth",
      difficulty: "normal",
      worldSeed: "scheduled-case-focus",
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
    const playerId = youth.player.id;
    useGameStore.setState({
      gameState: {
        ...state,
        scoutingCases: {
          ...state.scoutingCases,
          "case-focus": {
            id: "case-focus",
            scoutId: state.scout.id,
            playerId,
            openedWeek: state.currentWeek,
            openedSeason: state.currentSeason,
            lastUpdatedWeek: state.currentWeek,
            lastUpdatedSeason: state.currentSeason,
            status: "open",
            reportIds: [],
            listingIds: [],
            deliveryIds: [],
            decisionIds: [],
            placementReportIds: [],
            hypothesisIds: [],
            reviewIds: [],
            professionalContext: {
              modeId: "youth-scout",
              familyId: "opening-discovery",
              title: "Opening discovery",
              premise: "A new case needs a second context before the recommendation can move.",
              centralQuestion: "What travels to the next level?",
              stakeholderRefs: [],
              judgmentDecisionIds: [],
            },
          },
        },
      },
    });

    useGameStore.getState().scheduleActivity({
      type: "followUpSession",
      slots: 1,
      targetId: playerId,
      description: "Case-guided follow-up",
    }, 0);

    const scheduled = useGameStore.getState().gameState?.schedule.activities[0];
    expect(scheduled?.scoutingQuestionId).toBeTruthy();
    expect((scheduled?.scoutingQuestionIds?.length ?? 0)).toBeGreaterThan(0);

    useGameStore.getState().startObservationSession(
      "followUpSession",
      [{
        playerId,
        name: `${youth.player.firstName} ${youth.player.lastName}`,
        position: youth.player.position,
      }],
      playerId,
      { activityInstanceId: scheduled?.instanceId },
    );

    const session = useGameStore.getState().activeSession;
    expect(session?.scoutingQuestionId).toBe(scheduled?.scoutingQuestionId);
    expect(session?.observerContext?.openQuestionIds).toEqual(scheduled?.scoutingQuestionIds);
  }, 30_000);
});
