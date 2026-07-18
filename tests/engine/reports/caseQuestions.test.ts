import { expect, test } from "vitest";

import type { GameState } from "@/engine/core/types";
import {
  deriveScoutingCaseObservationFocus,
  deriveScoutingCaseQuestions,
} from "@/engine/reports/caseQuestions";

test("deriveScoutingCaseQuestions turns report uncertainty and club follow-up into next-context questions", () => {
  const state = {
    scoutingCases: {
      "case-1": {
        id: "case-1",
        playerId: "player-1",
        scoutId: "scout-1",
        openedWeek: 1,
        openedSeason: 1,
        lastUpdatedWeek: 5,
        lastUpdatedSeason: 1,
        status: "reported",
        reportIds: ["report-1"],
        decisionIds: ["decision-1"],
        listingIds: [],
        deliveryIds: [],
        placementReportIds: [],
        hypothesisIds: [],
        reviewIds: [],
        professionalContext: {
          centralQuestion: "Can he handle the move now?",
          stakeholderRefs: [],
          judgmentDecisionIds: [],
        },
      },
    },
    reports: {
      "report-1": {
        id: "report-1",
        caseId: "case-1",
        playerId: "player-1",
        riskFactors: ["Adaptation to academy structure"],
        categoryVerdicts: {
          roleFit: {
            verdict: "Promising but still role-dependent.",
            confidence: "medium",
            hypothesisIds: [],
            acknowledgedUncertainty: "Needs another live context before the pathway call is safe.",
          },
        },
        submittedWeek: 4,
        submittedSeason: 1,
        evidenceObservationIds: ["obs-1"],
      },
    },
    observations: {
      "obs-1": {
        id: "obs-1",
        playerId: "player-1",
        scoutId: "scout-1",
        week: 3,
        season: 1,
        context: "schoolMatch",
        attributeReadings: [],
        notes: [],
        flaggedMoments: [],
      },
    },
    clubDecisions: {
      "decision-1": {
        id: "decision-1",
        caseId: "case-1",
        outcome: "followUpRequested",
        decidedWeek: 5,
        decidedSeason: 1,
        requestedEvidenceCategory: "roleFit",
        reasons: ["The club wants a clearer answer on how the player fits the planned role."],
      },
    },
    recommendationReviews: {},
    reflectionJournal: {},
    inbox: [],
  } as unknown as GameState;

  const result = deriveScoutingCaseQuestions(state, "case-1");

  expect(result?.centralQuestion).toBe("Can he handle the move now?");
  expect(result?.observedContexts).toEqual(["schoolMatch"]);
  expect(result?.activeQuestions.length).toBeGreaterThanOrEqual(2);
  expect(result?.activeQuestions[0]?.questionId).toBeTruthy();
  expect(result?.activeQuestions[0]?.targetDomains.length).toBeGreaterThan(0);
  expect(result?.activeQuestions[0].recommendedContexts.length).toBeGreaterThan(0);
  expect(result?.callbacks.some((callback) => callback.source === "clubDecision")).toBe(true);
});

test("deriveScoutingCaseQuestions includes follow-up inbox callbacks", () => {
  const state = {
    scoutingCases: {
      "case-2": {
        id: "case-2",
        playerId: "player-2",
        scoutId: "scout-1",
        openedWeek: 1,
        openedSeason: 1,
        lastUpdatedWeek: 8,
        lastUpdatedSeason: 1,
        status: "placed",
        reportIds: [],
        decisionIds: [],
        listingIds: [],
        deliveryIds: [],
        placementReportIds: [],
        hypothesisIds: [],
        reviewIds: [],
      },
    },
    reports: {},
    observations: {},
    clubDecisions: {},
    recommendationReviews: {},
    reflectionJournal: {},
    inbox: [
      {
        id: "prospect-follow-up:case-2:anchor:early-check",
        title: "Player Two: First pathway check",
        body: "The academy has supplied its first update.",
        week: 8,
        season: 1,
      },
    ],
  } as unknown as GameState;

  const result = deriveScoutingCaseQuestions(state, "case-2");

  expect((result?.callbacks.length ?? 0)).toBeGreaterThanOrEqual(1);
  expect(result?.callbacks.some((callback) => callback.source === "followUp")).toBe(true);
});

test("deriveScoutingCaseQuestions includes uncited post-report observations in next evidence guidance", () => {
  const baseState = {
    scoutingCases: {
      "case-3": {
        id: "case-3",
        playerId: "player-3",
        scoutId: "scout-1",
        openedWeek: 1,
        openedSeason: 1,
        lastUpdatedWeek: 8,
        lastUpdatedSeason: 1,
        status: "reported",
        reportIds: ["report-3"],
        decisionIds: [],
        listingIds: [],
        deliveryIds: [],
        placementReportIds: [],
        hypothesisIds: [],
        reviewIds: [],
      },
    },
    reports: {
      "report-3": {
        id: "report-3",
        caseId: "case-3",
        playerId: "player-3",
        submittedWeek: 4,
        submittedSeason: 1,
        riskFactors: ["Adaptation remains uncertain."],
        evidenceObservationIds: ["obs-3a"],
        categoryVerdicts: {
          roleFit: {
            verdict: "The role fit is promising.",
            confidence: "medium",
            hypothesisIds: [],
            acknowledgedUncertainty: "Needs another competitive context.",
          },
        },
      },
    },
    observations: {
      "obs-3a": {
        id: "obs-3a",
        playerId: "player-3",
        scoutId: "scout-1",
        week: 3,
        season: 1,
        context: "schoolMatch",
        attributeReadings: [],
        notes: [],
        flaggedMoments: [],
      },
      "obs-3b": {
        id: "obs-3b",
        playerId: "player-3",
        scoutId: "scout-1",
        week: 7,
        season: 1,
        context: "parentCoachMeeting",
        attributeReadings: [],
        notes: [],
        flaggedMoments: [],
      },
    },
    clubDecisions: {},
    recommendationReviews: {},
    reflectionJournal: {},
    inbox: [],
  } as unknown as GameState;

  const withFollowUp = deriveScoutingCaseQuestions(baseState, "case-3");
  expect(withFollowUp?.observedContexts).toEqual(["schoolMatch", "parentCoachMeeting"]);
  expect(withFollowUp?.activeQuestions.some((question) => question.id.endsWith(":fresh-context"))).toBe(false);

  const onlyCited = {
    ...baseState,
    observations: {
      "obs-3a": baseState.observations["obs-3a"],
    },
  } as unknown as GameState;
  const withoutFollowUp = deriveScoutingCaseQuestions(onlyCited, "case-3");
  expect(withoutFollowUp?.activeQuestions.some((question) => question.id.endsWith(":fresh-context"))).toBe(true);
});

test.each([
  { category: "roleFit", expectedFamily: "role", expectedQuestionId: "movement", historicalQuestionId: "projection" },
  { category: "characterRisk", expectedFamily: "personality", expectedQuestionId: "pressure", historicalQuestionId: "movement" },
  { category: "potential", expectedFamily: "upside", expectedQuestionId: "projection", historicalQuestionId: "pressure" },
] as const)(
  "deriveScoutingCaseObservationFocus maps %s follow-up requests to the right question family",
  ({ category, expectedFamily, expectedQuestionId, historicalQuestionId }) => {
    const state = {
      scoutingCases: {
        "case-4": {
          id: "case-4",
          playerId: "player-4",
          scoutId: "scout-1",
          openedWeek: 1,
          openedSeason: 1,
          lastUpdatedWeek: 6,
          lastUpdatedSeason: 1,
          status: "reported",
          reportIds: ["report-4"],
          decisionIds: ["decision-4"],
          listingIds: [],
          deliveryIds: [],
          placementReportIds: [],
          hypothesisIds: [],
          reviewIds: [],
        },
      },
      reports: {
        "report-4": {
          id: "report-4",
          caseId: "case-4",
          playerId: "player-4",
          submittedWeek: 3,
          submittedSeason: 1,
          evidenceAssessment: {
            confidenceByCategory: {},
            unknowns: [],
            nextTest: {
              id: "next-test-4",
              questionId: historicalQuestionId,
              activityType: "followUpSession",
              contextRequirement: "Legacy historical prompt.",
            },
          },
          categoryVerdicts: {},
        },
      },
      observations: {
        "obs-4a": {
          id: "obs-4a",
          playerId: "player-4",
          scoutId: "scout-1",
          week: 2,
          season: 1,
          context: "schoolMatch",
          attributeReadings: [],
          notes: [],
          flaggedMoments: [],
        },
        "obs-4b": {
          id: "obs-4b",
          playerId: "player-4",
          scoutId: "scout-1",
          week: 5,
          season: 1,
          context: "youthTournament",
          attributeReadings: [],
          notes: [],
          flaggedMoments: [],
        },
      },
      clubDecisions: {
        "decision-4": {
          id: "decision-4",
          caseId: "case-4",
          outcome: "followUpRequested",
          decidedWeek: 6,
          decidedSeason: 1,
          requestedEvidenceCategory: category,
          reasons: ["The club wants the right follow-up evidence, not a repeated first question."],
        },
      },
      recommendationReviews: {},
      reflectionJournal: {},
      inbox: [],
      youthRecruitmentBriefs: {},
    } as unknown as GameState;

    const snapshot = deriveScoutingCaseQuestions(state, "case-4");
    expect(snapshot?.activeQuestions[0]).toMatchObject({
      family: expectedFamily,
      questionId: expectedQuestionId,
    });

    const focus = deriveScoutingCaseObservationFocus(state, { playerId: "player-4" });
    expect(focus?.scoutingQuestionId).toBe(expectedQuestionId);
    expect(focus?.scoutingQuestionIds[0]).toBe(expectedQuestionId);
  },
);
