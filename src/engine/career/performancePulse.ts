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
import { selectLatestReportsByCaseOpenedInRange } from "@/engine/reports/reportAccountability";

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

  // Count cases first opened in the last 4 weeks. Revisions retain their value
  // as improved judgments, but cannot be recycled into monthly volume rewards.
  const recentReports = selectLatestReportsByCaseOpenedInRange(
    Object.values(state.reports).filter((report) => report.scoutId === scout.id),
    {
      submittedSeason: state.currentSeason,
      submittedWeek: Math.max(1, state.currentWeek - PULSE_INTERVAL_WEEKS + 1),
    },
    {
      submittedSeason: state.currentSeason,
      submittedWeek: state.currentWeek,
    },
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
  const professionalDevelopment = (state.schedule?.activities ?? []).some(
    (activity) => activity?.type === "study",
  )
    || state.inbox?.some((message) =>
      message.title === "Course Completed"
      && message.week === state.currentWeek
      && message.season === state.currentSeason
    ) === true;

  // Calculate composite score
  const compositeScore = calculateCompositeScore(
    reportsSubmitted,
    reportQualityAvg,
    accuracyRate,
    signingSuccess,
    fatigueAvg,
    professionalDevelopment,
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
    professionalDevelopment,
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
  if (pulse.professionalDevelopment && pulse.grade === "C") {
    gradeMessages.C = "A productive month of formal study. Your course work maintained professional standing while case output was lower, but qualifications do not replace accountable scouting outcomes.";
  }

  messages.push({
    id: `pulse_${season}_${pulse.period}`,
    week,
    season,
    type: "performance" as any,
    title: `Monthly Review: Grade ${pulse.grade}`,
    body: `${gradeMessages[pulse.grade]}\n\nReports: ${pulse.reportsSubmitted} | Quality: ${pulse.reportQualityAvg}% | Accuracy: ${pulse.accuracyRate}% | Trend: ${pulse.trend}${pulse.professionalDevelopment ? " | Professional development: active" : ""}${repChange !== 0 ? `\nReputation ${repChange > 0 ? "+" : ""}${repChange}` : ""}`,
    read: false,
    actionRequired: pulse.grade === "D" || pulse.grade === "F",
    relatedId: "performance",
    relatedEntityType: "tool" as const,
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
      relatedId: "performance",
      relatedEntityType: "tool" as const,
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
  professionalDevelopment = false,
): number {
  // Weighted scoring:
  // - Reports submitted (20%): 0 reports = 0, 4+ = 100
  // - Quality average (30%): direct mapping
  // - Accuracy rate (25%): direct mapping
  // - Signings (15%): 0 = 30 (baseline), 1 = 70, 2+ = 100
  // - Fatigue penalty (10%): lower fatigue = higher score

  // Formal qualifications are real work, but not a substitute for case
  // outcomes. During a study-only period they provide a neutral baseline,
  // preventing the same course from both consuming time and triggering a
  // contradictory "poor performance" reputation penalty.
  const studyBaseline = professionalDevelopment && reportsSubmitted === 0 ? 50 : 0;
  const reportScore = Math.max(
    studyBaseline,
    Math.min(100, (reportsSubmitted / 4) * 100),
  );
  const qualityScore = Math.max(studyBaseline, qualityAvg);
  const signingScore = signings >= 2 ? 100 : signings === 1 ? 70 : 30;
  const fatigueScore = Math.max(0, 100 - fatigue);

  return Math.round(
    reportScore * 0.20 +
    qualityScore * 0.30 +
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
    lastPulse.professionalDevelopment,
  );

  const diff = currentScore - lastScore;
  if (diff > 10) return "improving";
  if (diff < -10) return "declining";
  return "stable";
}
