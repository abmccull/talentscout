import { describe, expect, it } from "vitest";

import type { GameState } from "@/engine/core/types";
import { deriveScoutingCaseQuestions } from "@/engine/reports/caseQuestions";
import { deriveProfessionalCaseAccountability } from "@/engine/reports/caseAccountability";

function baseState(): GameState {
  return {
    scoutingCases: {
      "case-1": {
        id: "case-1",
        playerId: "player-1",
        scoutId: "scout-1",
        openedWeek: 2,
        openedSeason: 1,
        lastUpdatedWeek: 12,
        lastUpdatedSeason: 2,
        status: "placed",
        reportIds: ["report-1", "report-2"],
        listingIds: [],
        deliveryIds: ["delivery-1"],
        decisionIds: ["decision-1"],
        placementReportIds: ["placement-1"],
        reviewIds: ["review-1"],
      },
    },
    reports: {
      "report-1": {
        id: "report-1",
        caseId: "case-1",
        playerId: "player-1",
        scoutId: "scout-1",
        submittedWeek: 3,
        submittedSeason: 1,
        attributeAssessments: [{ attribute: "passing", estimatedValue: 13 }],
        strengths: ["Press-resistant receiving"],
        weaknesses: ["Needs a stronger pathway"],
        conviction: "recommend",
        summary: "Initial pathway case.",
        estimatedValue: 100000,
        qualityScore: 72,
        categoryVerdicts: {
          potential: {
            verdict: "Starter upside is visible.",
            confidence: "medium",
            hypothesisIds: [],
            acknowledgedUncertainty: "Needs a second competitive context.",
          },
          roleFit: {
            verdict: "Fits an academy eight role.",
            confidence: "medium",
            hypothesisIds: [],
            acknowledgedUncertainty: "The role fit still needs a faster tempo game.",
          },
        },
      },
      "report-2": {
        id: "report-2",
        caseId: "case-1",
        supersedesReportId: "report-1",
        revision: 2,
        playerId: "player-1",
        scoutId: "scout-1",
        submittedWeek: 6,
        submittedSeason: 1,
        attributeAssessments: [{ attribute: "passing", estimatedValue: 14 }],
        strengths: ["Carries through pressure"],
        weaknesses: ["Adaptation runway still matters"],
        conviction: "strongRecommend",
        summary: "Escalated after the trial context.",
        estimatedValue: 140000,
        qualityScore: 78,
        projectedRole: "boxToBoxMidfielder",
        recommendedAction: "offerAcademyPlace",
        categoryVerdicts: {
          potential: {
            verdict: "Starter upside is still visible.",
            confidence: "high",
            hypothesisIds: [],
            acknowledgedUncertainty: "The development environment still matters.",
          },
          roleFit: {
            verdict: "The role fit now looks cleaner.",
            confidence: "medium",
            hypothesisIds: [],
            acknowledgedUncertainty: "Needs full-speed senior pressure.",
          },
        },
      },
    },
    clubDecisions: {
      "decision-1": {
        id: "decision-1",
        caseId: "case-1",
        deliveryId: "delivery-1",
        reportId: "report-2",
        clubId: "club-a",
        outcome: "accepted",
        decidedWeek: 7,
        decidedSeason: 1,
        reasons: ["The evidence matched the academy pathway and role need."],
      },
    },
    recommendationReviews: {
      "review-1": {
        id: "review-1",
        caseId: "case-1",
        reportId: "report-2",
        playerId: "player-1",
        clubId: "club-a",
        checkpoint: "oneSeason",
        dueWeek: 12,
        dueSeason: 2,
        status: "complete",
        completedWeek: 12,
        completedSeason: 2,
        categoryScores: {
          potential: 82,
          roleFit: 61,
        },
        confidenceCalibration: 80,
        clubFitScore: 77,
        timingScore: 69,
        overallScore: 76,
        playerFacingDimensions: [{
          key: "supportAdaptationFit",
          label: "Support/adaptation fit",
          status: "positive",
          evidenceLevel: "full",
          score: 77,
          summary: "The academy environment sustained the move and the player stayed on a credible development path.",
        }, {
          key: "pathwayQuality",
          label: "Pathway quality",
          status: "mixed",
          evidenceLevel: "full",
          score: 69,
          summary: "The pathway produced good progress, but not every timing question closed cleanly.",
        }, {
          key: "revisionQuality",
          label: "Revision quality",
          status: "positive",
          evidenceLevel: "full",
          score: 81,
          summary: "The later revision tightened the call after a stronger context instead of just repeating the first impression.",
        }],
        findings: ["Unused because accountability snapshot should drive the callback copy."],
      },
    },
    observations: {},
    inbox: [],
  } as unknown as GameState;
}

describe("professional case accountability", () => {
  it("derives structured verdicts from persisted review and report artifacts", () => {
    const snapshot = deriveProfessionalCaseAccountability(baseState(), "case-1");

    expect(snapshot?.headline).toBe("One-season accountability at 76/100: club fit supported.");
    expect(snapshot?.categories.map((category) => category.key)).toEqual([
      "clubFit",
      "timingPathway",
      "strengthsRisks",
      "calibration",
      "revisionBehavior",
    ]);
    expect(snapshot?.categories.find((category) => category.key === "strengthsRisks")?.summary)
      .toContain("Potential was supported at 82/100.");
    expect(snapshot?.categories.find((category) => category.key === "calibration")?.summary)
      .toContain("80/100");
  });

  it("feeds the accountability summary into review callbacks", () => {
    const snapshot = deriveScoutingCaseQuestions(baseState(), "case-1");
    const reviewCallback = snapshot?.callbacks.find((callback) => callback.source === "review");

    expect(reviewCallback?.summary).toContain("academy environment sustained the move");
    expect(reviewCallback?.summary).not.toContain("Unused because accountability");
  });

  it("stays pending without fabricating a completed review verdict", () => {
    const state = baseState();
    state.recommendationReviews["review-1"] = {
      ...state.recommendationReviews["review-1"],
      status: "scheduled",
      completedWeek: undefined,
      completedSeason: undefined,
      playerFacingDimensions: undefined,
      confidenceCalibration: undefined,
      overallScore: undefined,
    };

    const snapshot = deriveProfessionalCaseAccountability(state, "case-1");
    expect(snapshot?.completedReview).toBe(false);
    expect(snapshot?.headline).toContain("Observable review pending");
    expect(snapshot?.summary).toContain("right time");
  });
});
