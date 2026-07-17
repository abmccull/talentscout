import type {
  RecommendationReview,
  RecommendationReviewDimension,
  RecommendationReviewDimensionStatus,
} from "@/engine/core/types";

export interface RecommendationReviewDisplayDimension {
  key: RecommendationReviewDimension["key"];
  label: string;
  status: RecommendationReviewDimensionStatus;
  statusLabel: string;
  scoreLabel: string;
  summary: string;
}

export interface RecommendationReviewDisplayModel {
  overallScoreLabel: string;
  dimensions: RecommendationReviewDisplayDimension[];
  highlights: string[];
}

const STATUS_LABELS: Record<RecommendationReviewDimensionStatus, string> = {
  positive: "Supported",
  mixed: "Mixed",
  negative: "Concerning",
  insufficientEvidence: "Insufficient evidence",
};

function scoreLabel(score: number | undefined): string {
  return score === undefined ? "Insufficient evidence" : `${score}/100`;
}

export function buildRecommendationReviewDisplayModel(
  review: RecommendationReview,
): RecommendationReviewDisplayModel {
  const dimensions = (review.playerFacingDimensions ?? []).map((dimension) => ({
    key: dimension.key,
    label: dimension.label,
    status: dimension.status,
    statusLabel: STATUS_LABELS[dimension.status],
    scoreLabel: scoreLabel(dimension.score),
    summary: dimension.summary,
  }));

  return {
    overallScoreLabel: scoreLabel(review.overallScore),
    dimensions,
    highlights: dimensions.length > 0
      ? dimensions.map((dimension) => `${dimension.label}: ${dimension.summary}`).slice(0, 4)
      : (review.findings ?? []).slice(0, 4),
  };
}

export function buildRecommendationReviewTimelineDescription(
  review: RecommendationReview,
): string {
  if (review.status !== "complete") {
    return "Your original judgment remains open until enough career evidence exists.";
  }
  if (review.overallScore !== undefined) {
    return `Observable review completed at ${review.overallScore}/100.`;
  }
  if ((review.playerFacingDimensions ?? []).some((dimension) => dimension.status !== "insufficientEvidence")) {
    return "Observable review completed with partial evidence and no final overall score.";
  }
  return "Observable review completed, but the pathway still lacks enough evidence for a firm verdict.";
}

export function buildRecommendationReviewTimelineDetails(
  review: RecommendationReview,
  limit = 3,
): string[] {
  return buildRecommendationReviewDisplayModel(review).highlights.slice(0, Math.max(0, limit));
}
