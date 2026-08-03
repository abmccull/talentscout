import type {
  HiddenIntel,
  NPCScoutReport,
  RecommendationReviewDimension,
  RecommendationReview,
  ScoutEvidenceClaim,
  ScoutEvidenceDirection,
} from "@/engine/core/types";
import type {
  AcademyRecommendationOutcomeEvidence,
  AcademyRecommendationReview,
  AcademyReviewEvidenceLevel,
} from "@/engine/youth/recommendationReviews";

type ObservableReview = RecommendationReview & Partial<Pick<
  AcademyRecommendationReview,
  "evidenceLevel" | "outcomeEvidence"
>>;

export interface SourceEvidenceCalibrationResult {
  npcReports: Record<string, NPCScoutReport>;
  contactIntel: Record<string, HiddenIntel[]>;
  calibratedClaimIds: string[];
  calibratedClaimIdsByReviewId: Record<string, string[]>;
}

interface SourceEvidenceCalibrationInput {
  npcReports: Record<string, NPCScoutReport>;
  contactIntel: Record<string, HiddenIntel[]>;
}

interface ObservableDirection {
  direction: ScoutEvidenceDirection;
  note: string;
}

function compareDate(
  left: { season: number; week: number },
  right: { season: number; week: number },
): number {
  return left.season - right.season || left.week - right.week;
}

function directionFromScore(
  score: number | undefined,
  label: string,
): ObservableDirection | undefined {
  if (score === undefined) return undefined;
  const rounded = Math.round(score);
  return {
    direction: score >= 65 ? "positive" : score < 45 ? "negative" : "mixed",
    note: `${label} resolved at ${rounded}/100 from persisted football outcomes.`,
  };
}

function injuryDirection(
  outcome: AcademyRecommendationOutcomeEvidence,
  evidenceLevel: AcademyReviewEvidenceLevel | undefined,
): ObservableDirection | undefined {
  if (outcome.weeksMissed >= 6) {
    return {
      direction: "negative",
      note: `${outcome.injuryCount} recorded injury incident${outcome.injuryCount === 1 ? "" : "s"} caused ${outcome.weeksMissed} recovery weeks in the review window.`,
    };
  }
  if (outcome.weeksMissed > 0) {
    return {
      direction: "mixed",
      note: `${outcome.weeksMissed} recovery weeks produced a mixed durability outcome in the review window.`,
    };
  }
  if (evidenceLevel === "full") {
    return {
      direction: "positive",
      note: "The full review window contains no recorded injury absence.",
    };
  }
  return undefined;
}

function dimensionDirection(
  dimension: RecommendationReviewDimension | undefined,
  label: string,
): ObservableDirection | undefined {
  if (!dimension || dimension.status === "insufficientEvidence") return undefined;
  return {
    direction: dimension.status === "positive"
      ? "positive"
      : dimension.status === "negative"
        ? "negative"
        : "mixed",
    note: `${label}${dimension.score === undefined ? "" : ` resolved at ${dimension.score}/100`} from persisted recommendation-review evidence.`,
  };
}

function observableDirection(
  claim: ScoutEvidenceClaim,
  review: ObservableReview,
): ObservableDirection | undefined {
  const outcome = review.outcomeEvidence;
  const dimensions = review.playerFacingDimensions ?? [];
  switch (claim.category) {
    case "readiness":
      return directionFromScore(review.overallScore, "Recommendation outcome");
    case "roleFit":
      return directionFromScore(review.clubFitScore, "Club fit");
    case "adaptability":
      return dimensionDirection(
        dimensions.find((dimension) => dimension.key === "supportAdaptationFit"),
        "Support/adaptation fit",
      );
    case "injuryProneness":
    case "durability":
      return outcome ? injuryDirection(outcome, review.evidenceLevel) : undefined;
    default:
      // Match ratings and pathway records cannot honestly prove potential,
      // personality, consistency, adaptability, or a discrete attribute.
      return undefined;
  }
}

export function calibrateEvidenceClaimFromReview(
  claim: ScoutEvidenceClaim,
  review: RecommendationReview,
): ScoutEvidenceClaim {
  if (
    claim.playerId !== review.playerId
    || review.status !== "complete"
    || claim.calibration.status !== "uncalibrated"
    || review.completedWeek === undefined
    || review.completedSeason === undefined
  ) {
    return claim;
  }

  if (
    claim.recordedWeek !== undefined
    && claim.recordedSeason !== undefined
    && compareDate(
      { season: claim.recordedSeason, week: claim.recordedWeek },
      { season: review.completedSeason, week: review.completedWeek },
    ) > 0
  ) {
    return claim;
  }

  const observed = observableDirection(claim, review as ObservableReview);
  if (!observed) return claim;

  // A permanently hedged "mixed" call is not automatically correct. It is
  // supported only when the observable result is also mixed; otherwise the
  // clear outcome challenges the source's lack of conviction.
  const supported = claim.direction === observed.direction;
  return {
    ...claim,
    calibration: {
      status: supported ? "supported" : "challenged",
      note: `${supported ? "Supported" : "Challenged"} at the ${review.checkpoint === "oneSeason" ? "one-season" : "two-season"} checkpoint. ${observed.note}`,
      reviewedWeek: review.completedWeek,
      reviewedSeason: review.completedSeason,
    },
  };
}

function indexReviewsByPlayer(
  reviews: readonly RecommendationReview[],
): Map<string, RecommendationReview[]> {
  const reviewsByPlayer = new Map<string, RecommendationReview[]>();
  for (const review of reviews) {
    const existing = reviewsByPlayer.get(review.playerId);
    if (existing) {
      existing.push(review);
      continue;
    }
    reviewsByPlayer.set(review.playerId, [review]);
  }
  return reviewsByPlayer;
}

function calibrateEvidenceClaimFromOrderedReviews(
  claim: ScoutEvidenceClaim,
  reviews: readonly RecommendationReview[],
): { claim: ScoutEvidenceClaim; reviewId?: string } {
  let calibratedClaim = claim;
  for (const review of reviews) {
    const nextClaim = calibrateEvidenceClaimFromReview(calibratedClaim, review);
    if (nextClaim !== calibratedClaim) {
      return { claim: nextClaim, reviewId: review.id };
    }
    calibratedClaim = nextClaim;
  }
  return { claim };
}

/**
 * Calibrate only persisted, player-visible source claims against a completed
 * observable review. The first valid checkpoint is immutable: save/reload or a
 * later review cannot rewrite a source's historical record.
 */
export function calibrateSourceEvidenceFromReviews(
  input: SourceEvidenceCalibrationInput & {
    reviews: readonly RecommendationReview[];
  },
): SourceEvidenceCalibrationResult {
  const calibratedClaimIds: string[] = [];
  const calibratedClaimIdsByReviewId: Record<string, string[]> = {};
  const reviewsByPlayer = indexReviewsByPlayer(input.reviews);

  let npcReports = input.npcReports;
  for (const [id, report] of Object.entries(input.npcReports)) {
    const reviews = reviewsByPlayer.get(report.playerId);
    const originalClaims = report.evidenceClaims;
    if (!reviews?.length || !originalClaims?.length) continue;

    let evidenceClaims: ScoutEvidenceClaim[] | undefined;
    for (let index = 0; index < originalClaims.length; index += 1) {
      const claim = originalClaims[index];
      const result = calibrateEvidenceClaimFromOrderedReviews(claim, reviews);
      if (result.claim === claim) continue;

      if (!evidenceClaims) {
        evidenceClaims = originalClaims.slice();
      }
      evidenceClaims[index] = result.claim;
      calibratedClaimIds.push(claim.id);
      if (result.reviewId) {
        calibratedClaimIdsByReviewId[result.reviewId] ??= [];
        calibratedClaimIdsByReviewId[result.reviewId].push(claim.id);
      }
    }

    if (!evidenceClaims) continue;
    if (npcReports === input.npcReports) {
      npcReports = { ...input.npcReports };
    }
    npcReports[id] = { ...report, evidenceClaims };
  }

  let contactIntel = input.contactIntel;
  for (const [playerId, entries] of Object.entries(input.contactIntel)) {
    const reviews = reviewsByPlayer.get(playerId);
    if (!reviews?.length) continue;

    let calibratedEntries: HiddenIntel[] | undefined;
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      if (!entry.evidenceClaim) continue;

      const result = calibrateEvidenceClaimFromOrderedReviews(entry.evidenceClaim, reviews);
      if (result.claim === entry.evidenceClaim) continue;

      if (!calibratedEntries) {
        calibratedEntries = entries.slice();
      }
      calibratedEntries[index] = { ...entry, evidenceClaim: result.claim };
      calibratedClaimIds.push(entry.evidenceClaim.id);
      if (result.reviewId) {
        calibratedClaimIdsByReviewId[result.reviewId] ??= [];
        calibratedClaimIdsByReviewId[result.reviewId].push(entry.evidenceClaim.id);
      }
    }

    if (!calibratedEntries) continue;
    if (contactIntel === input.contactIntel) {
      contactIntel = { ...input.contactIntel };
    }
    contactIntel[playerId] = calibratedEntries;
  }

  return {
    npcReports,
    contactIntel,
    calibratedClaimIds: [...new Set(calibratedClaimIds)],
    calibratedClaimIdsByReviewId: Object.fromEntries(
      Object.entries(calibratedClaimIdsByReviewId).map(([reviewId, claimIds]) => [
        reviewId,
        [...new Set(claimIds)],
      ]),
    ),
  };
}

export function calibrateSourceEvidenceFromReview(
  input: SourceEvidenceCalibrationInput & {
    review: RecommendationReview;
  },
): SourceEvidenceCalibrationResult {
  return calibrateSourceEvidenceFromReviews({
    npcReports: input.npcReports,
    contactIntel: input.contactIntel,
    reviews: [input.review],
  });
}
