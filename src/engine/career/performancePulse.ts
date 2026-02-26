/**
 * Performance Pulse — monthly performance snapshots with grading and consequences.
 * Runs every 4 weeks during advanceWeek to evaluate scout performance.
 */

import type {
  Scout,
  PerformancePulse,
  InboxMessage,
  GameState,
} from "../core/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PULSE_INTERVAL_WEEKS = 4;

/** Grade thresholds based on a composite score 0-100. */
const GRADE_THRESHOLDS: { min: number; grade: PerformancePulse["grade"] }[] = [
  { min: 80, grade: "A" },
  { min: 60, grade: "B" },
  { min: 40, grade: "C" },
  { min: 20, grade: "D" },
  { min: 0, grade: "F" },
];

/** Reputation effects per grade. */
const GRADE_REPUTATION: Record<PerformancePulse["grade"], number> = {
  A: 3,
  B: 1,
  C: 0,
  D: -2,
  F: -5,
};

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

/**
 * Check if a performance pulse should be generated this week.
 */
export function shouldGeneratePulse(week: number): boolean {
  return week > 0 && week % PULSE_INTERVAL_WEEKS === 0;
}

/**
 * Generate a performance pulse from recent game state.
 * Looks at the last 4 weeks of activity to calculate metrics.
 */
export function generatePerformancePulse(
  state: GameState,
  scout: Scout,
): PerformancePulse {
  const period = Math.ceil(state.currentWeek / PULSE_INTERVAL_WEEKS);

  // Count reports submitted in the last 4 weeks
  const recentReports = Object.values(state.reports).filter(
    (r) =>
      r.submittedSeason === state.currentSeason &&
      r.submittedWeek !== undefined &&
      r.submittedWeek > state.currentWeek - PULSE_INTERVAL_WEEKS,
  );
  const reportsSubmitted = recentReports.length;

  // Average report quality (0-100 scale from quality score)
  const reportQualityAvg =
    recentReports.length > 0
      ? recentReports.reduce((sum, r) => sum + (r.qualityScore ?? 50), 0) / recentReports.length
      : 0;

  // Accuracy rate from recent accuracy history
  const recentAccuracy = (scout.accuracyHistory ?? []).filter(
    (a) =>
      a.season === state.currentSeason &&
      a.week > state.currentWeek - PULSE_INTERVAL_WEEKS,
  );
  const accuracyRate =
    recentAccuracy.length > 0
      ? recentAccuracy.reduce((sum, a) => {
          const diff = Math.abs(a.predictedCA - a.actualCA);
          return sum + Math.max(0, 100 - diff * 2);
        }, 0) / recentAccuracy.length
      : 50; // default to neutral if no data

  // Signing success — count of placed/discovered players recently
  const signingSuccess = state.discoveryRecords.filter(
    (d) =>
      d.discoveredSeason === state.currentSeason &&
      d.placementWeek !== undefined &&
      d.placementWeek > state.currentWeek - PULSE_INTERVAL_WEEKS,
  ).length;

  // Average fatigue over the period (rough estimate from current)
  const fatigueAvg = scout.fatigue;

  // Calculate composite score
  const compositeScore = calculateCompositeScore(
    reportsSubmitted,
    reportQualityAvg,
    accuracyRate,
    signingSuccess,
    fatigueAvg,
  );

  // Determine grade
  const grade = getGrade(compositeScore);

  // Determine trend from previous pulses
  const previousPulses = scout.performancePulses ?? [];
  const trend = calculateTrend(previousPulses, compositeScore);

  return {
    period,
    season: state.currentSeason,
    reportsSubmitted,
    reportQualityAvg: Math.round(reportQualityAvg),
    accuracyRate: Math.round(accuracyRate),
    signingSuccess,
    fatigueAvg: Math.round(fatigueAvg),
    grade,
    trend,
  };
}

/**
 * Apply the consequences of a performance pulse to the scout.
 * Returns updated scout and any inbox messages.
 */
export function applyPulseConsequences(
  scout: Scout,
  pulse: PerformancePulse,
  week: number,
  season: number,
): { scout: Scout; messages: InboxMessage[] } {
  const messages: InboxMessage[] = [];
  const repChange = GRADE_REPUTATION[pulse.grade];
  const newRep = Math.max(0, Math.min(100, scout.reputation + repChange));

  // Build message
  const gradeMessages: Record<PerformancePulse["grade"], string> = {
    A: "Outstanding work this month! Your reputation continues to grow and your employer is very pleased with your performance.",
    B: "Solid month of work. You're performing well and maintaining a good standing.",
    C: "An average month. Nothing remarkable, but nothing concerning either. Consider pushing yourself harder.",
    D: "Below expectations this month. Your employer has expressed concern about your recent performance. Two consecutive D grades may lead to assignment changes.",
    F: "Poor performance this month. You've received a formal warning. Two F grades in a season may result in contract termination for club scouts.",
  };

  messages.push({
    id: `pulse_${season}_${pulse.period}`,
    week,
    season,
    type: "performance" as any,
    title: `Monthly Review: Grade ${pulse.grade}`,
    body: `${gradeMessages[pulse.grade]}\n\nReports: ${pulse.reportsSubmitted} | Quality: ${pulse.reportQualityAvg}% | Accuracy: ${pulse.accuracyRate}% | Trend: ${pulse.trend}${repChange !== 0 ? `\nReputation ${repChange > 0 ? "+" : ""}${repChange}` : ""}`,
    read: false,
    actionRequired: pulse.grade === "D" || pulse.grade === "F",
  });

  // Check for two F grades in the same season (termination warning)
  const seasonPulses = (scout.performancePulses ?? []).filter(
    (p) => p.season === season,
  );
  const fCount = seasonPulses.filter((p) => p.grade === "F").length + (pulse.grade === "F" ? 1 : 0);
  if (fCount >= 2 && scout.careerPath === "club") {
    messages.push({
      id: `pulse_termination_${season}_${pulse.period}`,
      week,
      season,
      type: "performance" as any,
      title: "Contract Termination Warning",
      body: "You have received two F grades this season. Your club is seriously considering terminating your contract. Dramatic improvement is needed immediately.",
      read: false,
      actionRequired: true,
    });
  }

  const updatedScout: Scout = {
    ...scout,
    reputation: newRep,
    performancePulses: [...(scout.performancePulses ?? []), pulse],
  };

  return { scout: updatedScout, messages };
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

function calculateCompositeScore(
  reportsSubmitted: number,
  qualityAvg: number,
  accuracyRate: number,
  signings: number,
  fatigue: number,
): number {
  // Weighted scoring:
  // - Reports submitted (20%): 0 reports = 0, 4+ = 100
  // - Quality average (30%): direct mapping
  // - Accuracy rate (25%): direct mapping
  // - Signings (15%): 0 = 30 (baseline), 1 = 70, 2+ = 100
  // - Fatigue penalty (10%): lower fatigue = higher score

  const reportScore = Math.min(100, (reportsSubmitted / 4) * 100);
  const signingScore = signings >= 2 ? 100 : signings === 1 ? 70 : 30;
  const fatigueScore = Math.max(0, 100 - fatigue);

  return Math.round(
    reportScore * 0.20 +
    qualityAvg * 0.30 +
    accuracyRate * 0.25 +
    signingScore * 0.15 +
    fatigueScore * 0.10,
  );
}

function getGrade(score: number): PerformancePulse["grade"] {
  for (const { min, grade } of GRADE_THRESHOLDS) {
    if (score >= min) return grade;
  }
  return "F";
}

function calculateTrend(
  previousPulses: PerformancePulse[],
  currentScore: number,
): PerformancePulse["trend"] {
  if (previousPulses.length === 0) return "stable";

  const lastPulse = previousPulses[previousPulses.length - 1];
  const lastScore = calculateCompositeScore(
    lastPulse.reportsSubmitted,
    lastPulse.reportQualityAvg,
    lastPulse.accuracyRate,
    lastPulse.signingSuccess,
    lastPulse.fatigueAvg,
  );

  const diff = currentScore - lastScore;
  if (diff > 10) return "improving";
  if (diff < -10) return "declining";
  return "stable";
}
