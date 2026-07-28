import type { AlumniRecord, GameState, RecommendationReview } from "@/engine/core/types";
import type { DashboardCareerThread } from "./types";

function playerName(state: GameState, playerId: string): string {
  const player = state.players[playerId] ?? state.retiredPlayers?.[playerId];
  return player ? `${player.firstName} ${player.lastName}` : "A former prospect";
}

function latestAlumniThread(state: GameState, record: AlumniRecord): DashboardCareerThread | null {
  const updates = [
    ...record.milestones.map((entry) => ({ ...entry, id: `${record.id}:milestone:${entry.type}:${entry.season}:${entry.week}` })),
    ...record.careerUpdates.map((entry) => ({ ...entry, id: `${record.id}:update:${entry.type}:${entry.season}:${entry.week}` })),
  ].sort((left, right) =>
    right.season - left.season || right.week - left.week || left.id.localeCompare(right.id),
  );
  const latest = updates[0];
  if (!latest) return null;
  const reportId = record.originatingReportId ?? record.placementReportId;
  return {
    id: `career-thread:alumni:${record.id}:${latest.season}:${latest.week}:${latest.type}`,
    type: "alumni_callback",
    legacyRecordId: record.id,
    alumniRecordId: record.id,
    primaryItemId: latest.id,
    relatedItemIds: updates.slice(0, 4).map((entry) => entry.id),
    playerId: record.playerId,
    caseId: record.caseId,
    reportId,
    title: `${playerName(state, record.playerId)} returned to your story`,
    summary: latest.description,
    whatHappened: updates.slice(0, 4).reverse().map((entry) => entry.description),
    careerImpact: record.currentStatus === "retired"
      ? "The full arc remains part of your permanent scouting record."
      : "This development adds new evidence to your original judgment.",
    actionTarget: {
      screen: "alumniDashboard",
      alumniRecordId: record.id,
      playerId: record.playerId,
      caseId: record.caseId,
    },
    evidenceIds: [record.id, ...updates.slice(0, 4).map((entry) => entry.id)],
    lastUpdatedAt: { season: latest.season, week: latest.week },
    archived: record.currentStatus === "retired",
    significance: latest.type === "internationalCallUp" || latest.type === "internationalCall" ? 1 : 0.7,
    tone: latest.type === "injury" || latest.type === "released" ? "negative" : "positive",
  };
}

function reviewThread(state: GameState, review: RecommendationReview): DashboardCareerThread | null {
  if (review.status !== "complete" || !review.completedWeek || !review.completedSeason) return null;
  const findings = review.findings?.filter(Boolean) ?? [];
  return {
    id: `career-thread:review:${review.id}`,
    type: "recommendation_callback",
    primaryItemId: review.id,
    relatedItemIds: [review.reportId, review.caseId],
    playerId: review.playerId,
    caseId: review.caseId,
    reportId: review.reportId,
    title: `Your report on ${playerName(state, review.playerId)} has been reviewed`,
    summary: findings[0] ?? "The checkpoint is complete, but the record does not support a stronger causal claim.",
    whatHappened: findings.length > 0
      ? findings.slice(0, 4)
      : ["The recommendation reached its scheduled review checkpoint."],
    careerImpact: typeof review.overallScore === "number"
      ? `The review recorded an overall score of ${Math.round(review.overallScore)}.`
      : "The historical evidence remains neutral.",
    actionTarget: {
      screen: "reportHistory",
      reportId: review.reportId,
      caseId: review.caseId,
      playerId: review.playerId,
    },
    evidenceIds: [review.id, review.reportId, ...(review.evidence ?? []).flatMap((evidence) => evidence.sourceId ? [evidence.sourceId] : [])],
    lastUpdatedAt: { season: review.completedSeason, week: review.completedWeek },
    archived: false,
    significance: typeof review.overallScore === "number"
      ? Math.min(1, Math.abs(review.overallScore - 50) / 50)
      : 0.4,
    tone: typeof review.overallScore !== "number"
      ? "neutral"
      : review.overallScore >= 65 ? "positive" : review.overallScore < 45 ? "negative" : "neutral",
  };
}

export function buildDashboardCareerThreads(state: GameState): DashboardCareerThread[] {
  const alumniThreads = (state.alumniRecords ?? [])
    .map((record) => latestAlumniThread(state, record))
    .filter((thread): thread is DashboardCareerThread => thread !== null);
  const reviewThreads = Object.values(state.recommendationReviews ?? {})
    .map((review) => reviewThread(state, review))
    .filter((thread): thread is DashboardCareerThread => thread !== null);
  return [...alumniThreads, ...reviewThreads].sort((left, right) =>
    right.lastUpdatedAt.season - left.lastUpdatedAt.season
    || right.lastUpdatedAt.week - left.lastUpdatedAt.week
    || (right.significance ?? 0) - (left.significance ?? 0)
    || left.id.localeCompare(right.id),
  );
}

export function selectDashboardCareerThread(state: GameState): DashboardCareerThread | null {
  return buildDashboardCareerThreads(state)[0] ?? null;
}
