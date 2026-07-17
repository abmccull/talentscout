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

/**
 * Calibrate only persisted, player-visible source claims against a completed
 * observable review. The first valid checkpoint is immutable: save/reload or a
 * later review cannot rewrite a source's historical record.
 */
export function calibrateSourceEvidenceFromReview(input: {
  npcReports: Record<string, NPCScoutReport>;
  contactIntel: Record<string, HiddenIntel[]>;
  review: RecommendationReview;
}): SourceEvidenceCalibrationResult {
  const calibratedClaimIds: string[] = [];
  const npcReports = Object.fromEntries(
    Object.entries(input.npcReports).map(([id, report]) => {
      if (report.playerId !== input.review.playerId || !report.evidenceClaims?.length) {
        return [id, report];
      }
      const evidenceClaims = report.evidenceClaims.map((claim) => {
        const calibrated = calibrateEvidenceClaimFromReview(claim, input.review);
        if (calibrated !== claim) calibratedClaimIds.push(claim.id);
        return calibrated;
      });
      return [id, evidenceClaims.some((claim, index) => claim !== report.evidenceClaims![index])
        ? { ...report, evidenceClaims }
        : report];
    }),
  );

  const contactIntel = Object.fromEntries(
    Object.entries(input.contactIntel).map(([playerId, entries]) => {
      if (playerId !== input.review.playerId) return [playerId, entries];
      const calibratedEntries = entries.map((entry) => {
        if (!entry.evidenceClaim) return entry;
        const calibrated = calibrateEvidenceClaimFromReview(entry.evidenceClaim, input.review);
        if (calibrated === entry.evidenceClaim) return entry;
        calibratedClaimIds.push(entry.evidenceClaim.id);
        return { ...entry, evidenceClaim: calibrated };
      });
      return [playerId, calibratedEntries.some((entry, index) => entry !== entries[index])
        ? calibratedEntries
        : entries];
    }),
  );

  return {
    npcReports,
    contactIntel,
    calibratedClaimIds: [...new Set(calibratedClaimIds)],
  };
}
