import type {
  ClubDecision,
  GameState,
  JudgmentCategory,
  RecommendationReview,
  RecommendationReviewCheckpoint,
  RecommendationReviewDimension,
  ScoutReport,
  ScoutingCase,
} from "@/engine/core/types";

export type ProfessionalCaseAccountabilityStatus =
  | "supported"
  | "mixed"
  | "challenged"
  | "pending";

export type ProfessionalCaseAccountabilityKey =
  | "clubFit"
  | "timingPathway"
  | "strengthsRisks"
  | "calibration"
  | "revisionBehavior";

export interface ProfessionalCaseAccountabilityCategory {
  key: ProfessionalCaseAccountabilityKey;
  label: string;
  status: ProfessionalCaseAccountabilityStatus;
  score?: number;
  summary: string;
}

export interface ProfessionalCaseAccountabilitySnapshot {
  caseId: string;
  playerId: string;
  reportId?: string;
  reviewId?: string;
  checkpoint?: RecommendationReviewCheckpoint;
  completedReview: boolean;
  headline: string;
  summary: string;
  categories: ProfessionalCaseAccountabilityCategory[];
}

type AccountabilityState = Pick<
  GameState,
  "scoutingCases" | "reports" | "recommendationReviews" | "clubDecisions"
>;

const CATEGORY_LABELS: Record<JudgmentCategory, string> = {
  potential: "Potential",
  roleFit: "Role fit",
  characterRisk: "Character risk",
};

function compareReportDate(left: ScoutReport, right: ScoutReport): number {
  return right.submittedSeason - left.submittedSeason
    || right.submittedWeek - left.submittedWeek
    || (right.revision ?? 1) - (left.revision ?? 1)
    || left.id.localeCompare(right.id);
}

function compareDecisionDate(left: ClubDecision, right: ClubDecision): number {
  return right.decidedSeason - left.decidedSeason
    || right.decidedWeek - left.decidedWeek
    || left.id.localeCompare(right.id);
}

function compareReviewDate(left: RecommendationReview, right: RecommendationReview): number {
  return (right.completedSeason ?? right.dueSeason) - (left.completedSeason ?? left.dueSeason)
    || (right.completedWeek ?? right.dueWeek) - (left.completedWeek ?? left.dueWeek)
    || left.id.localeCompare(right.id);
}

function statusFromScore(score: number | undefined): ProfessionalCaseAccountabilityStatus {
  if (score === undefined) return "pending";
  if (score >= 72) return "supported";
  if (score < 45) return "challenged";
  return "mixed";
}

function statusFromReviewDimension(
  dimension: RecommendationReviewDimension | undefined,
): ProfessionalCaseAccountabilityStatus {
  switch (dimension?.status) {
    case "positive":
      return "supported";
    case "negative":
      return "challenged";
    case "mixed":
      return "mixed";
    default:
      return "pending";
  }
}

function reportsForCase(
  state: AccountabilityState,
  scoutingCase: ScoutingCase,
): ScoutReport[] {
  const caseReportIds = new Set(scoutingCase.reportIds ?? []);
  return Object.values(state.reports ?? {})
    .filter((report) => report.caseId === scoutingCase.id || caseReportIds.has(report.id))
    .sort(compareReportDate);
}

function latestDecisionForCase(
  state: AccountabilityState,
  scoutingCase: ScoutingCase,
): ClubDecision | undefined {
  const caseDecisionIds = new Set(scoutingCase.decisionIds ?? []);
  return Object.values(state.clubDecisions ?? {})
    .filter((decision) => decision.caseId === scoutingCase.id || caseDecisionIds.has(decision.id))
    .sort(compareDecisionDate)[0];
}

function latestReviewForCase(
  state: AccountabilityState,
  scoutingCase: ScoutingCase,
): RecommendationReview | undefined {
  const reviewIds = new Set(scoutingCase.reviewIds ?? []);
  return Object.values(state.recommendationReviews ?? {})
    .filter((review) => review.caseId === scoutingCase.id || reviewIds.has(review.id))
    .sort(compareReviewDate)[0];
}

function didOpinionChange(reports: ScoutReport[]): boolean {
  if (reports.length < 2) return false;
  const first = reports[0];
  return reports.slice(1).some((report) =>
    report.conviction !== first.conviction
    || report.projectedRole !== first.projectedRole
    || report.recommendedAction !== first.recommendedAction
    || JSON.stringify(report.perceivedPARange) !== JSON.stringify(first.perceivedPARange)
    || JSON.stringify(report.categoryVerdicts ?? {}) !== JSON.stringify(first.categoryVerdicts ?? {}),
  );
}

function convictionImpliedConfidence(report: ScoutReport): number {
  const potentialConfidence = report.categoryVerdicts?.potential?.confidence;
  if (potentialConfidence === "high") return 90;
  if (potentialConfidence === "medium") return 65;
  if (potentialConfidence === "low") return 35;
  switch (report.conviction) {
    case "note": return 25;
    case "recommend": return 50;
    case "strongRecommend": return 75;
    case "tablePound": return 95;
  }
}

function describeStatus(status: ProfessionalCaseAccountabilityStatus): string {
  switch (status) {
    case "supported": return "supported";
    case "mixed": return "mixed";
    case "challenged": return "challenged";
    case "pending": return "still pending";
  }
}

function dimensionByKey(
  review: RecommendationReview | undefined,
  key: RecommendationReviewDimension["key"],
): RecommendationReviewDimension | undefined {
  return review?.playerFacingDimensions?.find((dimension) => dimension.key === key);
}

function buildClubFitCategory(
  review: RecommendationReview | undefined,
  decision: ClubDecision | undefined,
): ProfessionalCaseAccountabilityCategory {
  const dimension = dimensionByKey(review, "supportAdaptationFit");
  if (dimension) {
    return {
      key: "clubFit",
      label: "Club fit",
      status: statusFromReviewDimension(dimension),
      score: dimension.score,
      summary: dimension.summary,
    };
  }
  if (review?.clubFitScore !== undefined) {
    const status = statusFromScore(review.clubFitScore);
    return {
      key: "clubFit",
      label: "Club fit",
      status,
      score: review.clubFitScore,
      summary: `Observable club-fit evidence ${describeStatus(status)} the recommendation at ${review.clubFitScore}/100.`,
    };
  }
  if (decision?.outcome === "followUpRequested") {
    return {
      key: "clubFit",
      label: "Club fit",
      status: "pending",
      summary: decision.reasons?.[0]
        ?? "The club kept the file open, so fit remains unresolved rather than settled.",
    };
  }
  if (decision?.outcome === "accepted") {
    return {
      key: "clubFit",
      label: "Club fit",
      status: "pending",
      summary: "A club acted on the recommendation, but long-run adaptation and role fit still need later evidence.",
    };
  }
  if (decision?.outcome === "rejected") {
    return {
      key: "clubFit",
      label: "Club fit",
      status: "challenged",
      summary: decision.reasons?.[0]
        ?? "The club rejected the pathway at decision time, so the fit case did not land.",
    };
  }
  return {
    key: "clubFit",
    label: "Club fit",
    status: "pending",
    summary: "No persistent outcome has yet shown whether the destination and role were the right fit.",
  };
}

function buildTimingPathwayCategory(
  review: RecommendationReview | undefined,
): ProfessionalCaseAccountabilityCategory {
  const dimension = dimensionByKey(review, "pathwayQuality");
  if (dimension) {
    return {
      key: "timingPathway",
      label: "Timing and pathway",
      status: statusFromReviewDimension(dimension),
      score: dimension.score,
      summary: dimension.summary,
    };
  }
  if (review?.timingScore !== undefined) {
    const status = statusFromScore(review.timingScore);
    return {
      key: "timingPathway",
      label: "Timing and pathway",
      status,
      score: review.timingScore,
      summary: `Observable pathway timing ${describeStatus(status)} the move at ${review.timingScore}/100.`,
    };
  }
  return {
    key: "timingPathway",
    label: "Timing and pathway",
    status: "pending",
    summary: "The case still lacks enough career evidence to prove whether the move came at the right time and into the right pathway.",
  };
}

function buildStrengthsRiskCategory(
  report: ScoutReport | undefined,
  review: RecommendationReview | undefined,
): ProfessionalCaseAccountabilityCategory {
  const verdictKeys = (Object.keys(report?.categoryVerdicts ?? {}) as JudgmentCategory[])
    .filter((key) => Boolean(report?.categoryVerdicts?.[key]));
  if (verdictKeys.length === 0) {
    return {
      key: "strengthsRisks",
      label: "Strengths and risks",
      status: "pending",
      summary: "No structured category verdict survived with the report, so the original strengths-and-risks case cannot yet be judged cleanly.",
    };
  }

  const clauses = verdictKeys.map((key) => {
    const score = review?.categoryScores?.[key];
    const status = statusFromScore(score);
    if (score === undefined) {
      return `${CATEGORY_LABELS[key]} stayed unresolved from visible evidence.`;
    }
    return `${CATEGORY_LABELS[key]} was ${describeStatus(status)} at ${score}/100.`;
  });
  const supported = verdictKeys.filter((key) => (review?.categoryScores?.[key] ?? -1) >= 72).length;
  const challenged = verdictKeys.filter((key) => {
    const score = review?.categoryScores?.[key];
    return score !== undefined && score < 45;
  }).length;
  const status = challenged > 0
    ? (supported > 0 ? "mixed" : "challenged")
    : supported > 0
      ? "supported"
      : "pending";

  return {
    key: "strengthsRisks",
    label: "Strengths and risks",
    status,
    summary: clauses.join(" "),
  };
}

function buildCalibrationCategory(
  report: ScoutReport | undefined,
  review: RecommendationReview | undefined,
): ProfessionalCaseAccountabilityCategory {
  if (!report) {
    return {
      key: "calibration",
      label: "Confidence calibration",
      status: "pending",
      summary: "No preserved report exists to judge how strong the original confidence call really was.",
    };
  }

  if (review?.confidenceCalibration !== undefined) {
    const status = statusFromScore(review.confidenceCalibration);
    return {
      key: "calibration",
      label: "Confidence calibration",
      status,
      score: review.confidenceCalibration,
      summary: `${report.conviction === "tablePound" ? "Table-pound" : report.conviction} conviction was ${describeStatus(status)} at ${review.confidenceCalibration}/100.`,
    };
  }

  return {
    key: "calibration",
    label: "Confidence calibration",
    status: "pending",
    score: convictionImpliedConfidence(report),
    summary: "The report preserved a confidence stance, but not enough later evidence exists yet to judge whether that certainty was proportionate.",
  };
}

function buildRevisionCategory(
  reports: ScoutReport[],
  review: RecommendationReview | undefined,
): ProfessionalCaseAccountabilityCategory {
  const dimension = dimensionByKey(review, "revisionQuality");
  if (dimension) {
    return {
      key: "revisionBehavior",
      label: "Revision behavior",
      status: statusFromReviewDimension(dimension),
      score: dimension.score,
      summary: dimension.summary,
    };
  }
  if (reports.length <= 1) {
    return {
      key: "revisionBehavior",
      label: "Revision behavior",
      status: "pending",
      summary: "No later revision was preserved, so adaptability under new evidence remains unresolved.",
    };
  }
  const changed = didOpinionChange(reports);
  return {
    key: "revisionBehavior",
    label: "Revision behavior",
    status: changed ? "supported" : "mixed",
    summary: changed
      ? "Later revisions materially changed the thesis, so the scout updated the case when new evidence arrived."
      : "Multiple revisions were preserved, but the core thesis barely moved under new evidence.",
  };
}

function buildHeadline(
  review: RecommendationReview | undefined,
  categories: ProfessionalCaseAccountabilityCategory[],
): string {
  if (review?.status === "complete") {
    const best = categories.find((category) => category.status !== "pending") ?? categories[0];
    const scorePart = review.overallScore !== undefined ? ` at ${review.overallScore}/100` : "";
    return `${review.checkpoint === "oneSeason" ? "One-season" : "Two-season"} accountability${scorePart}: ${best.label.toLowerCase()} ${describeStatus(best.status)}.`;
  }
  return "Observable review pending: the case is still being judged on fit, timing, and calibration rather than headline outcome alone.";
}

function buildSummary(
  completedReview: boolean,
  categories: ProfessionalCaseAccountabilityCategory[],
): string {
  const featured = categories
    .filter((category) => completedReview ? category.status !== "pending" : true)
    .slice(0, 2);
  if (featured.length === 0) {
    return completedReview
      ? "The case review completed, but the visible evidence still could not cleanly settle the key judgments."
      : "The case remains open because the right-fit, right-time, and right-confidence questions are still unresolved.";
  }
  return featured.map((category) => category.summary).join(" ");
}

export function deriveProfessionalCaseAccountability(
  state: AccountabilityState,
  caseId: string,
): ProfessionalCaseAccountabilitySnapshot | null {
  const scoutingCase = state.scoutingCases?.[caseId];
  if (!scoutingCase) return null;

  const reports = reportsForCase(state, scoutingCase);
  const latestReport = reports[0];
  const review = latestReviewForCase(state, scoutingCase);
  const completedReviewRecord = review?.status === "complete" ? review : undefined;
  const decision = latestDecisionForCase(state, scoutingCase);
  const completedReview = review?.status === "complete";
  const categories: ProfessionalCaseAccountabilityCategory[] = [
    buildClubFitCategory(completedReviewRecord, decision),
    buildTimingPathwayCategory(completedReviewRecord),
    buildStrengthsRiskCategory(latestReport, completedReviewRecord),
    buildCalibrationCategory(latestReport, completedReviewRecord),
    buildRevisionCategory(reports.slice().reverse(), completedReviewRecord),
  ];

  return {
    caseId: scoutingCase.id,
    playerId: scoutingCase.playerId,
    reportId: latestReport?.id,
    reviewId: review?.id,
    checkpoint: review?.checkpoint,
    completedReview,
    headline: buildHeadline(review, categories),
    summary: buildSummary(completedReview, categories),
    categories,
  };
}
