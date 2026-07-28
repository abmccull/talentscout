import type { GameState, RecommendationReview } from "@/engine/core/types";
import type { DashboardPriorityCandidate, OutcomeExplanation } from "./types";

export interface DashboardOutcomeExplanation extends OutcomeExplanation {
  id: string;
  occurredSeason: number;
  evidenceIds: string[];
  confidence: number;
  actionTarget?: DashboardPriorityCandidate["actionTarget"];
  neutral?: boolean;
}

function completedReviewExplanation(review: RecommendationReview): DashboardOutcomeExplanation | null {
  if (review.status !== "complete" || !review.completedWeek || !review.completedSeason) return null;
  const evidenceIds = [
    review.id,
    review.reportId,
    review.caseId,
    ...((review.evidence ?? []).flatMap((evidence) => evidence.sourceId ? [evidence.sourceId] : [])),
  ];
  const causeLines = review.findings?.filter(Boolean)
    ?? review.playerFacingDimensions?.map((dimension) => dimension.summary).filter(Boolean)
    ?? [];
  const neutral = causeLines.length === 0;
  return {
    id: `review:${review.id}`,
    headline: neutral
      ? "This recommendation reached its review checkpoint"
      : "Your recommendation has new evidence",
    causeLines: neutral
      ? ["The historical record does not contain enough evidence to attribute a specific cause."]
      : causeLines.slice(0, 3),
    affectedSystems: ["reports", "career"],
    relatedDecisionIds: [review.id, review.reportId, review.caseId],
    occurredWeek: review.completedWeek,
    occurredSeason: review.completedSeason,
    evidenceIds: [...new Set(evidenceIds)],
    confidence: neutral ? 0.35 : Math.min(1, 0.55 + (review.evidence?.length ?? 0) * 0.08),
    actionTarget: {
      screen: "reportHistory",
      reportId: review.reportId,
      caseId: review.caseId,
      playerId: review.playerId,
    },
    neutral,
  };
}

export function buildOutcomeExplanations(state: GameState): DashboardOutcomeExplanation[] {
  const explanations: DashboardOutcomeExplanation[] = [];

  for (const review of Object.values(state.recommendationReviews ?? {})) {
    const explanation = completedReviewExplanation(review);
    if (explanation) explanations.push(explanation);
  }

  for (const record of Object.values(state.careerStoryArchive?.records ?? {})) {
    const causeLines = [
      ...record.knownTradeoffs,
      ...record.outcomeFacts.map((fact) => String(fact.value)),
      ...record.stakeholderReactions.map((reaction) =>
        `${reaction.stakeholder.id} reacted ${reaction.valence >= 0 ? "positively" : "negatively"}.`,
      ),
    ].filter(Boolean).slice(0, 3);
    const neutral = causeLines.length === 0;
    explanations.push({
      id: `career-story:${record.id}`,
      headline: record.title,
      causeLines: neutral
        ? ["The archived record confirms the outcome but does not preserve a specific causal explanation."]
        : causeLines,
      affectedSystems: [
        "career",
        ...(record.stakeholderReactions.length > 0 ? ["relationships"] : []),
        ...(record.obligations.length > 0 ? ["obligations"] : []),
      ],
      relatedDecisionIds: [record.decisionId],
      occurredWeek: record.terminalAt.week,
      occurredSeason: record.terminalAt.season,
      evidenceIds: [
        record.id,
        ...record.outcomeFacts.map((fact) => fact.id),
        ...record.obligations.map((obligation) => obligation.id),
      ],
      confidence: neutral ? 0.4 : 0.8,
      actionTarget: record.reportId
        ? { screen: "reportHistory", reportId: record.reportId, playerId: record.playerId }
        : { screen: "career", focus: "moments" },
      neutral,
    });
  }

  for (const [index, transaction] of (state.finances?.transactions ?? []).entries()) {
    if (!transaction.referenceId || transaction.kind === "openingBalance") continue;
    explanations.push({
      id: `finance:${transaction.referenceId}`,
      headline: transaction.amount >= 0 ? "A financial reward was recorded" : "A financial cost was recorded",
      causeLines: [transaction.description],
      affectedSystems: ["finances", "career"],
      relatedDecisionIds: [transaction.referenceId],
      occurredWeek: transaction.week,
      occurredSeason: transaction.season,
      evidenceIds: [transaction.referenceId, `transaction:${index}`],
      confidence: 1,
      actionTarget: { screen: "agency", focus: "overview" },
    });
  }

  return explanations.sort((left, right) =>
    right.occurredSeason - left.occurredSeason
    || right.occurredWeek - left.occurredWeek
    || left.id.localeCompare(right.id),
  );
}

export function findOutcomeExplanationForCandidate(
  candidate: Pick<DashboardPriorityCandidate, "id" | "relatedEntityIds">,
  explanations: readonly DashboardOutcomeExplanation[],
): DashboardOutcomeExplanation | null {
  const related = new Set([candidate.id, ...candidate.relatedEntityIds]);
  return explanations.find((explanation) =>
    explanation.evidenceIds.some((id) => related.has(id))
    || explanation.relatedDecisionIds.some((id) => related.has(id)),
  ) ?? null;
}
