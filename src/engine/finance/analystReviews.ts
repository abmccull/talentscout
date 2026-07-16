import type {
  AgencyEmployee,
  AnalystEvidenceCategory,
  AnalystReviewArtifact,
  AnalystReviewBias,
  AppliedAnalystReview,
  FinancialRecord,
  ScoutReport,
} from "../core/types";

export const MAX_AVAILABLE_ANALYST_REVIEWS = 3;
export const MAX_ANALYST_REVIEW_HISTORY = 24;
export const MAX_ANALYST_CRAFT_BONUS = 6;

const CATEGORY_LABELS: Record<AnalystEvidenceCategory, string> = {
  attributeCoverage: "Attribute coverage",
  confidenceDiscipline: "Confidence discipline",
  riskFraming: "Risk framing",
  roleFit: "Role fit",
  marketContext: "Market context",
};

const BIAS_LABELS: Record<AnalystReviewBias, string> = {
  coverageFirst: "Coverage-first",
  skeptical: "Skeptical",
  roleSpecialist: "Role specialist",
  marketPragmatist: "Market pragmatist",
  balanced: "Balanced",
};

const BIAS_DISCLOSURES: Record<AnalystReviewBias, string> = {
  coverageFirst: "Prioritizes broad positional evidence and may underweight contextual narrative.",
  skeptical: "Presses uncertainty and downside before accepting an optimistic interpretation.",
  roleSpecialist: "Prioritizes tactical role evidence and may underweight broader market considerations.",
  marketPragmatist: "Prioritizes price and decision utility and may underweight long-horizon upside.",
  balanced: "Balances evidence breadth, uncertainty, role and market context without a strong specialty.",
};

const BIAS_CATEGORY: Record<AnalystReviewBias, AnalystEvidenceCategory> = {
  coverageFirst: "attributeCoverage",
  skeptical: "confidenceDiscipline",
  roleSpecialist: "roleFit",
  marketPragmatist: "marketContext",
  balanced: "riskFraming",
};

export function normalizeAnalystReviewHistory(
  reviews: AnalystReviewArtifact[],
): AnalystReviewArtifact[] {
  const available = reviews
    .filter((review) => review.status === "available")
    .slice(-MAX_AVAILABLE_ANALYST_REVIEWS);
  const consumed = reviews
    .filter((review) => review.status === "consumed")
    .slice(-(MAX_ANALYST_REVIEW_HISTORY - available.length));
  return [...consumed, ...available];
}

function stableBiasForEmployee(employeeId: string): AnalystReviewBias {
  const biases = Object.keys(BIAS_LABELS) as AnalystReviewBias[];
  const hash = [...employeeId].reduce(
    (value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0,
    2166136261,
  );
  return biases[hash % biases.length];
}

function visibleReportWeaknesses(
  report: ScoutReport,
): AnalystEvidenceCategory[] {
  const weaknesses: AnalystEvidenceCategory[] = [];
  const averageRangeWidth = report.attributeAssessments.length > 0
    ? report.attributeAssessments.reduce(
        (sum, assessment) => sum + assessment.confidenceRange[1] - assessment.confidenceRange[0],
        0,
      ) / report.attributeAssessments.length
    : Number.POSITIVE_INFINITY;

  if (report.attributeAssessments.length < 6) weaknesses.push("attributeCoverage");
  if (averageRangeWidth > 4) weaknesses.push("confidenceDiscipline");
  if (report.weaknesses.length === 0 && (report.riskFactors?.length ?? 0) === 0) {
    weaknesses.push("riskFraming");
  }
  if (!report.projectedRole && !report.recruitmentNeed) weaknesses.push("roleFit");
  if (!report.estimatedValueRange && report.estimatedWeeklyWage === undefined) {
    weaknesses.push("marketContext");
  }
  return weaknesses;
}

function chooseEvidenceCategory(
  report: ScoutReport | undefined,
  bias: AnalystReviewBias,
): AnalystEvidenceCategory {
  const preferred = BIAS_CATEGORY[bias];
  if (!report) return preferred;
  const weaknesses = visibleReportWeaknesses(report);
  if (weaknesses.includes(preferred)) return preferred;
  return weaknesses[0] ?? preferred;
}

function critiqueFor(
  category: AnalystEvidenceCategory,
  report: ScoutReport | undefined,
): string {
  if (!report) {
    const nextReportCritiques: Record<AnalystEvidenceCategory, string> = {
      attributeCoverage: "Build the next recommendation from enough position-relevant readings to show more than one performance dimension.",
      confidenceDiscipline: "Keep every conclusion proportional to the confidence and context of the observations behind it.",
      riskFraming: "State the most material downside, the evidence for it, and what follow-up would reduce the uncertainty.",
      roleFit: "Explain the role and tactical demands the evidence supports instead of describing ability in isolation.",
      marketContext: "Frame the recommendation against an observable value range, wage context and decision deadline.",
    };
    return nextReportCritiques[category];
  }

  const reportCritiques: Record<AnalystEvidenceCategory, string> = {
    attributeCoverage: `Revision ${report.revision ?? 1} assessed ${report.attributeAssessments.length} attributes. Use fresh evidence to broaden the position-relevant case before revising.`,
    confidenceDiscipline: "The current ranges leave material uncertainty. Preserve that uncertainty and use a changed context before tightening the next judgment.",
    riskFraming: "The current revision does not frame enough downside. Name a material risk and the evidence that would confirm or reduce it.",
    roleFit: "The current revision does not make the tactical job explicit. Connect observed actions to a proposed role and environment.",
    marketContext: "The current revision needs stronger decision context. Anchor the recommendation to an observable value range, wage expectation or deadline.",
  };
  return reportCritiques[category];
}

function calculateCraftBonus(
  employee: AgencyEmployee,
  efficiency: number,
): number {
  const insightDepth = employee.skills?.skill1 ?? employee.quality;
  const patternRecognition = employee.skills?.skill2 ?? employee.quality;
  const processingEfficiency = employee.skills?.skill3 ?? employee.quality;
  const skillFactor = (insightDepth + patternRecognition + processingEfficiency) / 60;
  const points = Math.round(1 + MAX_ANALYST_CRAFT_BONUS * skillFactor * Math.max(0, Math.min(1, efficiency)));
  return Math.max(1, Math.min(MAX_ANALYST_CRAFT_BONUS, points));
}

export interface CreateAnalystReviewInput {
  employee: AgencyEmployee;
  efficiency: number;
  reports: Record<string, ScoutReport>;
  scoutId: string;
  existingReviews: AnalystReviewArtifact[];
  week: number;
  season: number;
}

/**
 * Produce at most one idempotent weekly review from information already visible
 * in a filed report. When no revision exists, the artifact is explicitly scoped
 * to the next eligible report rather than pretending that analysis occurred.
 */
export function createAnalystReviewArtifact(
  input: CreateAnalystReviewInput,
): AnalystReviewArtifact | undefined {
  const id = `analyst-review:${input.employee.id}:s${input.season}w${input.week}`;
  if (input.existingReviews.some((review) => review.id === id)) return undefined;
  if (
    input.existingReviews.filter((review) => review.status === "available").length
    >= MAX_AVAILABLE_ANALYST_REVIEWS
  ) {
    return undefined;
  }

  const alreadyTargeted = new Set(
    input.existingReviews
      .map((review) => review.sourceReportId)
      .filter((reportId): reportId is string => Boolean(reportId)),
  );
  const sourceReport = Object.values(input.reports)
    .filter((report) => report.scoutId === input.scoutId && !alreadyTargeted.has(report.id))
    .sort((left, right) =>
      right.submittedSeason - left.submittedSeason
      || right.submittedWeek - left.submittedWeek
      || (right.revision ?? 1) - (left.revision ?? 1)
      || right.id.localeCompare(left.id)
    )[0];
  const bias = stableBiasForEmployee(input.employee.id);
  const evidenceCategory = chooseEvidenceCategory(sourceReport, bias);

  return {
    id,
    analystEmployeeId: input.employee.id,
    analystName: input.employee.name,
    createdWeek: input.week,
    createdSeason: input.season,
    status: "available",
    scope: sourceReport ? "reportRevision" : "nextEligibleReport",
    sourceReportId: sourceReport?.id,
    targetPlayerId: sourceReport?.playerId,
    targetCaseId: sourceReport?.caseId,
    targetBriefId: sourceReport?.briefId,
    evidenceCategory,
    bias,
    biasDisclosure: BIAS_DISCLOSURES[bias],
    critique: critiqueFor(evidenceCategory, sourceReport),
    craftQualityBonus: calculateCraftBonus(input.employee, input.efficiency),
  };
}

export function appendAnalystReview(
  finances: FinancialRecord,
  review: AnalystReviewArtifact,
): FinancialRecord {
  if (finances.analystReviews.some((candidate) => candidate.id === review.id)) {
    return finances;
  }
  return {
    ...finances,
    analystReviews: normalizeAnalystReviewHistory([
      ...(finances.analystReviews ?? []),
      review,
    ]),
  };
}

export function getApplicableAnalystReview(
  reviews: AnalystReviewArtifact[],
  playerId: string,
  previousReport?: ScoutReport,
): AnalystReviewArtifact | undefined {
  const available = reviews.filter((review) => review.status === "available");
  const targeted = available
    .filter((review) =>
      review.scope === "reportRevision"
      && review.targetPlayerId === playerId
      && Boolean(previousReport)
      && (
        review.sourceReportId === previousReport?.id
        || Boolean(review.targetCaseId && review.targetCaseId === previousReport?.caseId)
      )
      && (!review.targetBriefId || review.targetBriefId === previousReport?.briefId)
    );
  const nextEligible = available.filter((review) => review.scope === "nextEligibleReport");

  const byAge = (left: AnalystReviewArtifact, right: AnalystReviewArtifact) =>
    left.createdSeason - right.createdSeason
    || left.createdWeek - right.createdWeek
    || left.id.localeCompare(right.id);
  return targeted.sort(byAge)[0] ?? nextEligible.sort(byAge)[0];
}

export function toAppliedAnalystReview(
  review: AnalystReviewArtifact,
): AppliedAnalystReview {
  return {
    artifactId: review.id,
    analystEmployeeId: review.analystEmployeeId,
    analystName: review.analystName,
    sourceReportId: review.sourceReportId,
    evidenceCategory: review.evidenceCategory,
    bias: review.bias,
    biasDisclosure: review.biasDisclosure,
    critique: review.critique,
    craftQualityBonus: review.craftQualityBonus,
  };
}

/** Mark one available artifact consumed. Replays are a no-op. */
export function consumeAnalystReview(
  finances: FinancialRecord,
  reviewId: string,
  reportId: string,
  week: number,
  season: number,
): FinancialRecord {
  const review = finances.analystReviews.find((candidate) => candidate.id === reviewId);
  if (!review || review.status !== "available") return finances;

  return {
    ...finances,
    analystReviews: normalizeAnalystReviewHistory(finances.analystReviews.map((candidate) =>
      candidate.id === reviewId
        ? {
            ...candidate,
            status: "consumed" as const,
            consumedByReportId: reportId,
            consumedWeek: week,
            consumedSeason: season,
          }
        : candidate
    )),
  };
}

export function formatAnalystEvidenceCategory(
  category: AnalystEvidenceCategory,
): string {
  return CATEGORY_LABELS[category];
}

export function formatAnalystReviewBias(bias: AnalystReviewBias): string {
  return BIAS_LABELS[bias];
}
