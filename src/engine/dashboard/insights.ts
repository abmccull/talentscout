import { gameWeeksBetween } from "@/engine/core/gameDate";
import type { GameState, RecommendationReview } from "@/engine/core/types";
import { migrateDashboardState } from "./state";
import type { DashboardInsight } from "./types";

const INSIGHT_COOLDOWN_WEEKS = 4;
const MINIMUM_EVIDENCE = 2;

function completedReviews(state: GameState): RecommendationReview[] {
  return Object.values(state.recommendationReviews ?? {})
    .filter((review) => review.status === "complete")
    .sort((left, right) => left.id.localeCompare(right.id));
}

function withConfidence(evidenceCount: number, base: number): number {
  return Math.min(0.95, base + Math.max(0, evidenceCount - MINIMUM_EVIDENCE) * 0.08);
}

function buildReviewCalibrationInsights(state: GameState): DashboardInsight[] {
  const reviews = completedReviews(state);
  const misses = reviews.filter((review) =>
    typeof review.overallScore === "number" && review.overallScore < 50,
  );
  const strong = reviews.filter((review) =>
    typeof review.overallScore === "number" && review.overallScore >= 75,
  );
  const insights: DashboardInsight[] = [];

  if (misses.length >= MINIMUM_EVIDENCE) {
    const evidenceIds = misses.map((review) => review.id);
    insights.push({
      id: "insight:report-miss-pattern",
      type: "performance",
      title: "Several recent recommendations missed their mark",
      summary: `${misses.length} completed reviews scored below the expected range. Inspect the evidence before changing your scouting philosophy.`,
      confidence: withConfidence(evidenceIds.length, 0.62),
      evidenceIds,
      suggestedAction: { screen: "performance", metricId: "recommendation-calibration" },
      generatedWeek: state.currentWeek,
      generatedSeason: state.currentSeason,
      evidenceBand: evidenceIds.length >= 5 ? "strong" : "moderate",
      fingerprint: `report-miss:${evidenceIds.join(",")}`,
      supportingExamples: misses.slice(0, 3).flatMap((review) => review.findings?.slice(0, 1) ?? []),
      cooldownWeeks: INSIGHT_COOLDOWN_WEEKS,
    });
  }

  if (strong.length >= MINIMUM_EVIDENCE) {
    const evidenceIds = strong.map((review) => review.id);
    insights.push({
      id: "insight:validated-recommendations",
      type: "performance",
      title: "Your strongest recommendations are holding up",
      summary: `${strong.length} completed reviews validated the quality of your original judgment.`,
      confidence: withConfidence(evidenceIds.length, 0.68),
      evidenceIds,
      suggestedAction: { screen: "performance", metricId: "recommendation-calibration" },
      generatedWeek: state.currentWeek,
      generatedSeason: state.currentSeason,
      evidenceBand: evidenceIds.length >= 5 ? "strong" : "moderate",
      fingerprint: `validated:${evidenceIds.join(",")}`,
      supportingExamples: strong.slice(0, 3).flatMap((review) => review.findings?.slice(0, 1) ?? []),
      cooldownWeeks: INSIGHT_COOLDOWN_WEEKS,
    });
  }

  return insights;
}

function buildContactInsight(state: GameState): DashboardInsight[] {
  return Object.values(state.contacts ?? {}).flatMap((contact) => {
    const tipInteractions = (contact.interactionHistory ?? []).filter((interaction) =>
      interaction.type === "tip" || interaction.type === "referral",
    );
    if (tipInteractions.length < MINIMUM_EVIDENCE || contact.reliability < 65) return [];
    const evidenceIds = tipInteractions.map((interaction, index) =>
      `${contact.id}:${interaction.type}:${interaction.occurredAt.season}:${interaction.occurredAt.week}:${index}`,
    );
    return [{
      id: `insight:trusted-source:${contact.id}`,
      type: "relationship" as const,
      title: `${contact.name} is becoming a dependable source`,
      summary: `${tipInteractions.length} recorded tips or referrals and a reliability rating of ${contact.reliability} make this relationship worth protecting.`,
      confidence: withConfidence(evidenceIds.length, 0.6),
      evidenceIds,
      suggestedAction: { screen: "network" as const, contactId: contact.id },
      generatedWeek: state.currentWeek,
      generatedSeason: state.currentSeason,
      evidenceBand: evidenceIds.length >= 5 ? "strong" as const : "moderate" as const,
      fingerprint: `source:${contact.id}:${contact.reliability}:${evidenceIds.join(",")}`,
      cooldownWeeks: INSIGHT_COOLDOWN_WEEKS,
    }];
  });
}

function isCoolingDown(state: GameState, insight: DashboardInsight): boolean {
  const ledger = migrateDashboardState(state.dashboardState).insightLedger[insight.id];
  if (!ledger) return false;
  if (ledger.fingerprint && insight.fingerprint && ledger.fingerprint !== insight.fingerprint) return false;
  if (ledger.dismissedWeek && ledger.dismissedSeason) return true;
  if (
    ledger.lastGeneratedSeason === state.currentSeason
    && ledger.lastGeneratedWeek === state.currentWeek
  ) return false;
  const elapsed = gameWeeksBetween(
    state.fixtures,
    { season: ledger.lastGeneratedSeason ?? state.currentSeason, week: ledger.lastGeneratedWeek },
    { season: state.currentSeason, week: state.currentWeek },
  );
  return elapsed < (insight.cooldownWeeks ?? INSIGHT_COOLDOWN_WEEKS);
}

export function generateDashboardInsights(state: GameState): DashboardInsight[] {
  return [...buildReviewCalibrationInsights(state), ...buildContactInsight(state)]
    .filter((insight) => insight.evidenceIds.length >= MINIMUM_EVIDENCE)
    .filter((insight) => !isCoolingDown(state, insight))
    .sort((left, right) =>
      right.confidence - left.confidence || left.id.localeCompare(right.id),
    );
}
