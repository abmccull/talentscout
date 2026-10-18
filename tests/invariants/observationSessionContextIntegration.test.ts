import { getInteractiveActivityCompletionKey } from "@/lib/activityCompletion";
import { describe, expect, it, vi } from "vitest";
import type { Observation, ReflectionJournalEntry, ScoutCueReading } from "@/engine/core/types";
import { useGameStore } from "@/stores/gameStore";
import { buildReflectionJournalEntry } from "@/stores/actions/observationActions";
import { createSession, startSession } from "@/engine/observation/session";
import { createRNG } from "@/engine/rng";
import type { PlayerMoment } from "@/engine/observation/types";
import { populateInvestigationPhases } from "@/engine/observation/investigation";
import { shapeTargetedInquiry } from "@/engine/observation/targetedInquiry";
import { resolveDialogueOptionSelection } from "@/engine/observation/interactionSelection";

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
  it("archives a question and answer against its player even without observations or a summary", () => {
    const created = createSession({ activityType: "parentCoachMeeting", specialization: "youth",
      playerPool: [{ playerId: "lead", name: "Theo", position: "CM" }],
      sourceContactId: "coach", sourceContactName: "Maya", scoutingQuestionId: "pressure",
      seed: "journal-inquiry", week: 4, season: 2,
    }, createRNG("journal-inquiry"));
    const shaped = shapeTargetedInquiry(populateInvestigationPhases(created, createRNG("journal-inquiry")), []);
    const active = { ...startSession(shaped), currentPhaseIndex: 1 };
    const node = active.phases[1].dialogueNodes![0];
    const selected = resolveDialogueOptionSelection(active, node.id, "recall-account");
    const entry = buildReflectionJournalEntry(selected.session, null, undefined, [], []);
    expect(entry?.playerIds).toEqual(["lead"]);
    expect(entry?.conversationDecisions).toHaveLength(1);
    expect(entry?.conversationDecisions?.[0].sourceName).toBe("Maya");
    expect(entry?.conversationDecisions?.[0].inquiry?.status).toBe("unanswered");
    expect(entry?.conversationDecisions?.[0].inquiry?.questionId).toBe("pressure");
    expect(entry?.evidenceCards).toEqual([]);
    expect(JSON.parse(JSON.stringify(entry)).conversationDecisions).toEqual(entry?.conversationDecisions);
    expect(entry?.conversationDecisions?.[0]).not.toBe(selected.resolution);
  });
  it("retains focused glimpses without estimates, excludes missed and peripheral passages, and completes only once", async () => {
    await useGameStore.getState().startNewGame({
      scoutFirstName: "Evidence", scoutLastName: "Scout", scoutAge: 24,
      specialization: "youth", difficulty: "normal", worldSeed: "earned-cue-store",
      selectedCountries: ["england"], startingCountry: "england", nationality: "English",
      skillAllocations: { technicalEye: 2, psychologicalRead: 2, playerJudgment: 2, potentialAssessment: 2 },
      originId: "academy-apprentice", flawId: "fragile-network", doctrineIds: ["evidence-first"],
    });
    const state = useGameStore.getState().gameState!;
    const prospects = Object.values(state.unsignedYouth).slice(0, 4);
    expect(prospects).toHaveLength(4);
    const session = createSession({
      activityType: "schoolMatch", specialization: "youth", seed: "earned-store-session",
      week: state.currentWeek, season: state.currentSeason,
      playerPool: prospects.map(({ player }) => ({ playerId: player.id, name: player.firstName, position: player.position })),
    }, createRNG("earned-store-session"));
    const moments: PlayerMoment[] = prospects.map(({ player }, index) => ({
      id: `moment-${index}`, playerId: player.id, momentType: "technicalAction", quality: 7,
      attributesHinted: ["passing"], description: "A useful pass.", vagueDescription: "Play moves on.",
      pressureContext: false, isStandout: false,
    }));
    useGameStore.setState({
      gameState: state,
      activeSession: {
        ...session, state: "reflection", currentPhaseIndex: 0,
        phases: [{ ...session.phases[0], index: 0, moments }],
        players: session.players.map((player, index) => ({
          ...player, isFocused: index !== 1, focusedPhases: index !== 1 ? [0] : [],
        })),
        flaggedMoments: [{ id: "peripheral-flag", moment: moments[1], phaseIndex: 0, minute: 12, reaction: "interesting" }],
        evidenceDecisions: { "cue-1": { cueId: "cue-1", classification: "noConclusion" } },
        cueReadings: moments.map((moment, index) => ({
          id: `cue-${index}`, sessionId: session.id, momentId: moment.id, playerId: moment.playerId,
          phaseIndex: 0, attributesHinted: ["passing"], confidence: 0.65,
          clarity: index === 3 ? "missed" : index === 2 ? "glimpse" : "strong", direction: "positive",
          detail: "A detailed read of the player's technique.", suggestedClassifications: ["technicalExecution"],
        } as ScoutCueReading)),
      },
    });
    useGameStore.getState().endObservationSession();
    const after = useGameStore.getState().gameState!;
    const filed = Object.values(after.observations).filter((observation) => observation.sourceSessionId === session.id);
    expect(filed).toHaveLength(2);
    expect(filed[0].playerId).toBe(prospects[0].player.id);
    expect(filed[0].attributeReadings.map((reading) => reading.attribute)).toEqual(["passing"]);
    const sparse = filed.find((entry) => entry.playerId === prospects[2].player.id)!;
    expect(sparse.attributeReadings).toEqual([]);
    expect(sparse.abilityReading).toBeUndefined();
    expect(sparse.revealedPersonalityTrait).toBeUndefined();
    expect(sparse.updatedPersonalityProfile).toBeUndefined();
    expect(filed.some((entry) => entry.playerId === prospects[1].player.id)).toBe(false);
    expect(filed.some((entry) => entry.playerId === prospects[3].player.id)).toBe(false);
    const journal = after.reflectionJournal[session.id];
    expect(journal.flaggedMoments?.[0].description).toBe(moments[1].vagueDescription);
    expect(journal.flaggedMoments?.[0].attributesHinted).toEqual([]);
    expect(journal.evidenceCards?.[0]).toMatchObject({ clarity: "glimpse", classification: "noConclusion", attributesHinted: [] });
    useGameStore.getState().endObservationSession();
    expect(useGameStore.getState().gameState).toBe(after);
  }, 30_000);
  it("carries prior evidence across youth aliases and keeps the contextual opening question", async () => {
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
      conversationDecisions: [{ phaseIndex: 1, nodeId: "inquiry", optionId: "ask",
        optionText: "Check pressure response", narrativeText: "Still unanswered",
        insightPointsAwarded: 0, relationshipDeltaApplied: 0,
        inquiry: { playerId: canonicalPlayerId, questionId: "pressure", sourceName: "Maya", status: "unanswered" },
      }, { phaseIndex: 2, nodeId: "other-player", optionId: "ask",
        optionText: "Different player", narrativeText: "Not this case",
        insightPointsAwarded: 0, relationshipDeltaApplied: 0,
        inquiry: { playerId: "unrelated-player", questionId: "movement", sourceName: "Maya", status: "unanswered" },
      }],
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
    expect(session?.observerContext?.openQuestionIds).toContain("pressure");
    expect(session?.observerContext?.openQuestionIds).not.toContain("movement");
    expect(session?.questionOptions?.[0]).toMatchObject({ recommended: true });
    expect(session?.scoutingQuestionId).toBe(session?.questionOptions?.[0]?.id);
  }, 30_000);

  it.each(["full", "early"])("persists case guidance and %s session completion without duplicate rewards", async (completionMode) => {
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

    useGameStore.getState().startWeekSimulation();
    expect(useGameStore.getState().weekSimulation?.currentDay).toBe(0);

    useGameStore.getState().startObservationSession(
      "followUpSession",
      [{
        playerId,
        name: `${youth.player.firstName} ${youth.player.lastName}`,
        position: youth.player.position,
      }],
      playerId,
      { activityInstanceId: getInteractiveActivityCompletionKey(scheduled!, 0) },
    );

    const session = useGameStore.getState().activeSession;
    expect(session?.mode).toBe("fullObservation");
    expect(session?.venueAtmosphere?.venueType).toBe("trainingVisit");
    expect(session?.phases.some((phase) => phase.moments.length > 0)).toBe(true);
    expect(session?.scoutingQuestionId).toBe(scheduled?.scoutingQuestionId);
    expect(session?.observerContext?.openQuestionIds).toEqual(scheduled?.scoutingQuestionIds);

    useGameStore.getState().beginSession();
    useGameStore.getState().allocateSessionFocus(playerId, "technical");
    for (let phase = 0; phase < session!.phases.length; phase++) {
      const active = useGameStore.getState().activeSession!;
      if (active.phases[active.currentPhaseIndex].isHalfTime) {
        useGameStore.getState().setSessionHalftimeApproach("challenge");
      }
      const moment = active.phases[active.currentPhaseIndex].moments.find((entry) => entry.playerId === playerId);
      if (moment) useGameStore.getState().flagSessionMoment(moment.id, "needs_more_data");
      if (completionMode === "early" && phase === 1) {
        useGameStore.getState().endObservationSession();
        break;
      }
      useGameStore.getState().advanceSessionPhase();
    }
    expect(useGameStore.getState().activeSession?.state).toBe("reflection");
    if (completionMode === "early") {
      expect(useGameStore.getState().activeSession?.phases).toHaveLength(2);
      expect(useGameStore.getState().activeSession?.plannedPhaseCount).toBe(session!.phases.length);
    }
    const reflected = useGameStore.getState().activeSession!;
    for (const cue of reflected.cueReadings ?? []) {
      if (reflected.flaggedMoments.some((flag) => flag.moment.id === cue.momentId)) {
        useGameStore.getState().classifySessionEvidence(cue.id, "noConclusion");
      }
    }
    const saved = JSON.parse(JSON.stringify(useGameStore.getState().saveGame()));
    const retainedWeek = saved.pendingWeekRecovery.simulation;
    useGameStore.getState().loadGame(saved);
    expect(useGameStore.getState().currentScreen).toBe("observation");
    expect(useGameStore.getState().weekSimulation).toEqual(retainedWeek);
    useGameStore.getState().endObservationSession();
    expect(useGameStore.getState().currentScreen).toBe("weekSimulation");
    expect(useGameStore.getState().weekSimulation?.currentDay).toBe(0);
    const completed = useGameStore.getState().gameState!;
    expect(completed.completedInteractiveSessions).toContain(session!.activityInstanceId);
    expect(completed.reflectionJournal[session!.id]?.activityInstanceId).toBe(session!.activityInstanceId);
    expect(completed.reflectionJournal[session!.id]?.sessionMode).toBe("fullObservation");
    expect(completed.reflectionJournal[session!.id]?.evidenceCards?.length).toBeGreaterThan(0);
    expect(completed.reflectionJournal[session!.id]?.evidenceCards?.every((card) =>
      card.playerId === playerId && card.questionId === scheduled?.scoutingQuestionId
      && card.classification === "noConclusion")).toBe(true);
    useGameStore.getState().endObservationSession();
    expect(useGameStore.getState().gameState).toBe(completed);

    const afterCompletion = JSON.parse(JSON.stringify(useGameStore.getState().saveGame()));
    useGameStore.getState().loadGame(afterCompletion);
    expect(useGameStore.getState().currentScreen).toBe("weekSimulation");
    expect(useGameStore.getState().activeSession).toBeNull();
    // A checkpoint from the old week cannot replay after a committed world tick.
    useGameStore.getState().loadGame({ ...afterCompletion, currentWeek: afterCompletion.currentWeek + 1 });
    expect(useGameStore.getState().weekSimulation).toBeNull();
  }, 30_000);
});
