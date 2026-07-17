import { describe, expect, it } from "vitest";

import type { RecommendationReview } from "@/engine/core/types";
import {
  buildRecommendationReviewDisplayModel,
  buildRecommendationReviewTimelineDescription,
  buildRecommendationReviewTimelineDetails,
} from "@/engine/reports/recommendationReviewDisplay";

function review(overrides: Partial<RecommendationReview> = {}): RecommendationReview {
  return {
    id: "review-1",
    caseId: "case-1",
    reportId: "report-1",
    playerId: "player-1",
    clubId: "club-1",
    checkpoint: "oneSeason",
    dueWeek: 5,
    dueSeason: 2,
    status: "complete",
    completedWeek: 5,
    completedSeason: 2,
    overallScore: 81,
    ...overrides,
  };
}

describe("recommendation review display model", () => {
  it("prefers explicit player-facing dimensions over generic findings", () => {
    const display = buildRecommendationReviewDisplayModel(review({
      playerFacingDimensions: [{
        key: "priceValueCalibration",
        label: "Price/value calibration",
        status: "positive",
        evidenceLevel: "partial",
        score: 76,
        summary: "The later pathway returned credible value for the preserved academy budget.",
      }, {
        key: "revisionQuality",
        label: "Revision quality",
        status: "insufficientEvidence",
        evidenceLevel: "limited",
        summary: "No later revision was preserved before this checkpoint, so revision quality cannot be judged.",
      }],
      findings: ["Legacy finding that should not be the main UI summary."],
    }));

    expect(display.overallScoreLabel).toBe("81/100");
    expect(display.dimensions).toEqual([
      expect.objectContaining({
        key: "priceValueCalibration",
        statusLabel: "Supported",
        scoreLabel: "76/100",
      }),
      expect.objectContaining({
        key: "revisionQuality",
        statusLabel: "Insufficient evidence",
        scoreLabel: "Insufficient evidence",
      }),
    ]);
    expect(display.highlights).toEqual([
      "Price/value calibration: The later pathway returned credible value for the preserved academy budget.",
      "Revision quality: No later revision was preserved before this checkpoint, so revision quality cannot be judged.",
    ]);
  });

  it("falls back to findings and honest insufficient-evidence timeline copy", () => {
    const pending = review({
      overallScore: undefined,
      playerFacingDimensions: [{
        key: "pathwayQuality",
        label: "Pathway quality",
        status: "insufficientEvidence",
        evidenceLevel: "limited",
        summary: "The player remains on an academy track with too little match evidence to rate pathway quality honestly.",
      }],
      findings: ["The recommendation remains open to re-evaluation because performance evidence is limited."],
    });

    expect(buildRecommendationReviewTimelineDescription(pending))
      .toBe("Observable review completed, but the pathway still lacks enough evidence for a firm verdict.");
    expect(buildRecommendationReviewTimelineDetails(pending)).toEqual([
      "Pathway quality: The player remains on an academy track with too little match evidence to rate pathway quality honestly.",
    ]);
  });
});
