import { expect, test } from "vitest";

import type { GameState } from "@/engine/core/types";
import { deriveScoutingCaseQuestions } from "@/engine/reports/caseQuestions";

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
