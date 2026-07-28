import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState } from "@/engine/core/types";
import { createConsequenceEngineState } from "@/engine/consequences";

const mocks = vi.hoisted(() => ({
  applyPreparedRelationshipConflict: vi.fn(),
  prepareWeeklyRelationshipConflictCandidate: vi.fn(),
  getRunSimulationModifiers: vi.fn(),
  applyAcceptedNarrativeConsequences: vi.fn(),
  checkStorylineTriggers: vi.fn(),
  createStoryDirectorStateV2: vi.fn(),
  applyCareerEraDirection: vi.fn(),
  directWeeklyNarrativeEvent: vi.fn(),
  directWeeklyStoryEmissionsV2: vi.fn(),
  inferNarrativeEntityRefsV2: vi.fn(),
  applyDirectedCareerEraBeat: vi.fn(),
  prepareCareerEraWeek: vi.fn(),
  processActiveStorylines: vi.fn(),
  recordEventDirectorOutcome: vi.fn(),
  applyDirectedWorldPulse: vi.fn(),
  prepareWeeklyWorldPulse: vi.fn(),
  deriveScoutingCaseQuestions: vi.fn(),
  directWeeklyYouthProfessionalCase: vi.fn(),
  registerNarrativeDecisions: vi.fn(),
  applyDirectedWeeklyScoutingEcology: vi.fn(),
  prepareWeeklyScoutingEcology: vi.fn(),
  applyDirectedWeeklyRivalCampaigns: vi.fn(),
  applyDirectedWorldConditionArcBeats: vi.fn(),
  prepareWorldConditionArcWeek: vi.fn(),
  getSeasonLength: vi.fn(),
}));

vi.mock("@/engine/consequences/relationshipConflictDirector", () => ({
  applyPreparedRelationshipConflict: mocks.applyPreparedRelationshipConflict,
  prepareWeeklyRelationshipConflictCandidate: mocks.prepareWeeklyRelationshipConflictCandidate,
}));

vi.mock("@/engine/run", () => ({
  getRunSimulationModifiers: mocks.getRunSimulationModifiers,
}));

vi.mock("@/engine/world/acceptedNarrativeConsequences", () => ({
  applyAcceptedNarrativeConsequences: mocks.applyAcceptedNarrativeConsequences,
}));

vi.mock("@/engine/events", () => ({
  checkStorylineTriggers: mocks.checkStorylineTriggers,
  createStoryDirectorStateV2: mocks.createStoryDirectorStateV2,
  applyCareerEraDirection: mocks.applyCareerEraDirection,
  directWeeklyNarrativeEvent: mocks.directWeeklyNarrativeEvent,
  directWeeklyStoryEmissionsV2: mocks.directWeeklyStoryEmissionsV2,
  inferNarrativeEntityRefsV2: mocks.inferNarrativeEntityRefsV2,
  applyDirectedCareerEraBeat: mocks.applyDirectedCareerEraBeat,
  prepareCareerEraWeek: mocks.prepareCareerEraWeek,
  processActiveStorylines: mocks.processActiveStorylines,
  recordEventDirectorOutcome: mocks.recordEventDirectorOutcome,
}));

vi.mock("@/engine/events/worldPulse", () => ({
  applyDirectedWorldPulse: mocks.applyDirectedWorldPulse,
  prepareWeeklyWorldPulse: mocks.prepareWeeklyWorldPulse,
}));

vi.mock("@/engine/reports/caseQuestions", () => ({
  deriveScoutingCaseQuestions: mocks.deriveScoutingCaseQuestions,
}));

vi.mock("@/engine/youth", () => ({
  directWeeklyYouthProfessionalCase: mocks.directWeeklyYouthProfessionalCase,
}));

vi.mock("../../src/stores/actions/weeklyNarrativeConsequences", () => ({
  registerNarrativeDecisions: mocks.registerNarrativeDecisions,
}));

vi.mock("../../src/stores/actions/weeklyScoutingEcologyPhase", () => ({
  applyDirectedWeeklyScoutingEcology: mocks.applyDirectedWeeklyScoutingEcology,
  prepareWeeklyScoutingEcology: mocks.prepareWeeklyScoutingEcology,
}));

vi.mock("../../src/stores/actions/weeklyRivalCampaigns", () => ({
  applyDirectedWeeklyRivalCampaigns: mocks.applyDirectedWeeklyRivalCampaigns,
}));

vi.mock("../../src/stores/actions/weeklyWorldConditionArcs", () => ({
  applyDirectedWorldConditionArcBeats: mocks.applyDirectedWorldConditionArcBeats,
  prepareWorldConditionArcWeek: mocks.prepareWorldConditionArcWeek,
}));

vi.mock("@/engine/core/gameLoop", () => ({
  getSeasonLength: mocks.getSeasonLength,
}));

import { runWeeklyNarrativeArbitration } from "../../src/stores/actions/weeklyNarrativeArbitration";

function baseState(): GameState {
  return {
    currentWeek: 7,
    currentSeason: 1,
    fixtures: {},
    runManifest: {
      rootSeed: "weekly-narrative-test",
      specialization: "youth",
    },
    scout: {
      id: "scout-1",
      homeCountry: "spain",
    },
    eventChains: [],
    activeStorylines: [],
    narrativeEvents: [],
    consequenceState: createConsequenceEngineState(),
    eventDirector: {
      version: 1,
      tension: 18,
      quietWeeks: 5,
      recentEventTypes: [],
      eventCounts: {},
      recentSpecialEventIds: [],
      specialEventCounts: {},
      totalEvents: 0,
    },
    scoutingCases: {
      "case-1": {
        id: "case-1",
        playerId: "prospect",
        scoutId: "scout-1",
        status: "reported",
        reportIds: [],
        decisionIds: [],
      },
    },
    careerEraDirectorState: {
      version: 1,
      current: {
        id: "career-era-1",
        theme: "proveJudgment",
        title: "Prove the read",
        premise: "A quiet stretch needs one decisive follow-up.",
        deskPrompt: "Stay close to the case.",
        startedAt: { season: 1, week: 1 },
        endsAt: { season: 1, week: 12 },
        primaryProspectId: "prospect",
        reinforcementCount: 0,
      },
      history: [],
      processedWeekKeys: [],
    },
    storyDirectorV2: { version: 2 },
    inbox: [],
    players: {
      prospect: {
        id: "prospect",
        firstName: "Mateo",
        lastName: "Ruiz",
      },
    },
  } as unknown as GameState;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getRunSimulationModifiers.mockReturnValue({ storylineChanceMultiplier: 1 });
  mocks.applyAcceptedNarrativeConsequences.mockImplementation((state: GameState) => ({ state }));
  mocks.checkStorylineTriggers.mockReturnValue(undefined);
  mocks.createStoryDirectorStateV2.mockImplementation((state?: object) => state ?? { version: 2 });
  mocks.applyCareerEraDirection.mockImplementation(([candidate]: [unknown]) => [candidate]);
  mocks.directWeeklyNarrativeEvent.mockReturnValue({ event: null });
  mocks.inferNarrativeEntityRefsV2.mockReturnValue({ cast: [], topics: [] });
  mocks.processActiveStorylines.mockReturnValue({ events: [], updatedStorylines: [] });
  mocks.recordEventDirectorOutcome.mockImplementation((director: GameState["eventDirector"]) => director);
  mocks.prepareWorldConditionArcWeek.mockImplementation((state: GameState) => ({
    state,
    beats: [],
  }));
  mocks.applyDirectedWorldConditionArcBeats.mockImplementation(({ state }: { state: GameState }) => state);
  mocks.prepareWeeklyScoutingEcology.mockReturnValue({ candidates: [] });
  mocks.applyDirectedWeeklyScoutingEcology.mockImplementation(({ state }: { state: GameState }) => state);
  mocks.prepareCareerEraWeek.mockImplementation(({ state, blockedByActivity }: {
    state: GameState;
    blockedByActivity: boolean;
  }) => ({
    state: state.careerEraDirectorState,
    candidate: blockedByActivity
      ? undefined
      : {
        id: "career-era-candidate",
        templateId: "career-era:proveJudgment",
        kind: "worldPulse",
        category: "career-era:proveJudgment",
        semanticSignature: "career-era:1",
        baseWeight: 1,
        cast: [],
        topics: [],
        continuation: true,
        requiresChoice: false,
      },
    message: {
      id: "career-era-message",
      week: state.currentWeek,
      season: state.currentSeason,
      type: "news",
      title: "Career era",
      body: "Passive reinforcement",
      read: false,
      actionRequired: false,
    },
  }));
  mocks.prepareWeeklyWorldPulse.mockImplementation(({ state, blockedByActivity }: {
    state: GameState;
    blockedByActivity: boolean;
  }) => (blockedByActivity
    ? undefined
    : {
      candidate: {
        id: "world-pulse-candidate",
        templateId: "world-pulse:case",
        kind: "worldPulse",
        category: "world-pulse",
        semanticSignature: "world-pulse:case",
        baseWeight: 1,
        cast: [],
        topics: [],
        requiresChoice: false,
      },
      message: {
        id: "world-pulse-message",
        week: state.currentWeek,
        season: state.currentSeason,
        type: "news",
        title: "World pulse",
        body: "Passive pulse",
        read: false,
        actionRequired: false,
      },
    }));
  mocks.applyDirectedWorldPulse.mockImplementation(({ state }: { state: GameState }) => state);
  mocks.applyDirectedCareerEraBeat.mockImplementation(({ gameState }: { gameState: GameState }) => gameState);
  mocks.applyDirectedWeeklyRivalCampaigns.mockImplementation(({ state }: { state: GameState }) => state);
  mocks.directWeeklyYouthProfessionalCase.mockImplementation(({ state }: { state: GameState }) => ({ state }));
  mocks.registerNarrativeDecisions.mockImplementation((state: GameState) => state);
  mocks.getSeasonLength.mockReturnValue(38);
  mocks.deriveScoutingCaseQuestions.mockReturnValue({
    caseId: "case-1",
    playerId: "prospect",
    status: "reported",
    centralQuestion: "Can he handle the next level now?",
    observedContexts: [],
    activeQuestions: [{
      id: "case-1:club-follow-up",
      family: "upside",
      targetDomains: [],
      prompt: "What new evidence would answer the club's remaining role fit doubt?",
      whyNow: "The case remains open.",
      evidenceGap: "A live context is still missing.",
      recommendedContexts: [],
    }],
    callbacks: [],
  });
  mocks.applyPreparedRelationshipConflict.mockImplementation((state: GameState, prepared: {
    candidate: { id: string };
  }) => ({
    state: {
      ...state,
      consequenceState: {
        ...state.consequenceState,
        decisions: {
          ...state.consequenceState.decisions,
          [prepared.candidate.id]: {
            id: prepared.candidate.id,
            status: "offered",
            source: { kind: "relationshipConflict", id: "quiet-definition" },
          },
        },
      },
    },
  }));
});

describe("weekly narrative arbitration quiet fallback", () => {
  it("targets a quiet case question before passive beats and suppresses passive acceptance when the conflict lands", () => {
    const state = baseState();
    mocks.prepareWeeklyRelationshipConflictCandidate.mockReturnValue({
      prepared: {
        candidate: {
          id: "quiet-conflict",
          templateId: "family-versus-journalist-privacy",
          kind: "relationshipConflict",
          category: "relationship",
          semanticSignature: "relationship:quiet",
          baseWeight: 1,
          cast: [],
          topics: [{ kind: "player", id: "prospect" }],
          requiresChoice: true,
        },
        materialized: {
          decision: {
            metadata: { careerEraId: "career-era-1" },
          },
        },
      },
    });
    mocks.directWeeklyStoryEmissionsV2.mockReturnValueOnce({
      state: { version: 2, marker: "primary" },
      accepted: [],
      rejected: [],
      acceptedCandidates: [{ candidate: { id: "quiet-conflict" } }],
      rejectedCandidates: [],
    });

    const result = runWeeklyNarrativeArbitration({
      state,
      rivalCampaignWeek: { candidates: [] } as never,
    });

    expect(mocks.prepareWeeklyRelationshipConflictCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        forceTrigger: true,
        preferredSubjectIds: ["prospect"],
        quietFallback: expect.objectContaining({
          quietIntervention: true,
          caseId: "case-1",
          questionId: "case-1:club-follow-up",
          careerEraId: "career-era-1",
        }),
      }),
    );
    expect(mocks.directWeeklyStoryEmissionsV2).toHaveBeenCalledTimes(1);
    expect(result.acceptedStoryCandidateIds).toEqual(["quiet-conflict"]);
    expect(result.state.consequenceState.decisions["quiet-conflict"]).toBeDefined();
    expect(result.state.careerEraDirectorState?.current?.lastReinforcedAt).toEqual({
      season: 1,
      week: 7,
    });
  });

  it("skips the quiet fallback when a higher-priority ecology lane is already in play", () => {
    const state = baseState();
    mocks.prepareWeeklyScoutingEcology.mockReturnValue({
      candidates: [{
        id: "rival-lane",
        templateId: "rival-opportunity:test",
        kind: "rivalOpportunity",
        category: "rival-pressure",
        semanticSignature: "rival-pressure:test",
        baseWeight: 1,
        cast: [],
        topics: [],
        requiresChoice: true,
      }],
    });
    mocks.directWeeklyStoryEmissionsV2.mockReturnValueOnce({
      state: { version: 2, marker: "primary" },
      accepted: [],
      rejected: [],
      acceptedCandidates: [{ candidate: { id: "rival-lane" } }],
      rejectedCandidates: [],
    });

    const result = runWeeklyNarrativeArbitration({
      state,
      rivalCampaignWeek: { candidates: [] } as never,
    });

    expect(mocks.prepareWeeklyRelationshipConflictCandidate).not.toHaveBeenCalled();
    expect(mocks.prepareCareerEraWeek).toHaveBeenCalledWith(expect.objectContaining({
      blockedByActivity: true,
    }));
    expect(result.acceptedStoryCandidateIds).toEqual(["rival-lane"]);
  });
});
