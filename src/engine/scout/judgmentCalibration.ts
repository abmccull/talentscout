import type { ConvictionLevel, Player, ScoutReport } from "@/engine/core/types";
import { selectLatestReportsByCase } from "@/engine/reports/reportAccountability";

export type CalibrationTendency = "well-calibrated" | "overconfident" | "too-cautious";

export interface JudgmentCalibrationSignal {
  dimension: "position" | "age-group" | "conviction";
  label: string;
  sampleSize: number;
  averageOutcome: number;
  averageConviction: number;
  gap: number;
  tendency: CalibrationTendency;
}

export interface JudgmentCalibrationProfile {
  distinctCaseCount: number;
  evaluatedCaseCount: number;
  pendingCaseCount: number;
  maturity: number;
  averageOutcome?: number;
  averageConviction?: number;
  overallGap?: number;
  tendency: CalibrationTendency | "awaiting-outcomes";
  headline: string;
  guidance: string;
  signals: JudgmentCalibrationSignal[];
  convictionResults: JudgmentCalibrationSignal[];
}

const CONVICTION_EXPECTATION: Record<ConvictionLevel, number> = {
  note: 35,
  recommend: 55,
  strongRecommend: 75,
  tablePound: 90,
};

const CONVICTION_LABEL: Record<ConvictionLevel, string> = {
  note: "Monitor",
  recommend: "Recommend",
  strongRecommend: "Strong recommendation",
  tablePound: "Table-pound",
};

interface EvaluatedJudgment {
  report: ScoutReport;
  outcome: number;
  conviction: number;
  position?: string;
  ageGroup?: string;
}

interface JudgmentCalibrationState {
  reports: Record<string, ScoutReport>;
  scout: { id: string };
  players: Record<string, Player>;
  retiredPlayers?: Record<string, Player>;
  currentSeason: number;
}

function average(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;
}

function rounded(value: number): number {
  return Math.round(value * 10) / 10;
}

function tendencyFor(gap: number): CalibrationTendency {
  if (gap >= 10) return "overconfident";
  if (gap <= -10) return "too-cautious";
  return "well-calibrated";
}

function ageGroup(age: number): string {
  if (age <= 20) return "U21";
  if (age <= 24) return "21–24";
  if (age <= 28) return "25–28";
  return "29+";
}

function signal(
  dimension: JudgmentCalibrationSignal["dimension"],
  label: string,
  judgments: EvaluatedJudgment[],
): JudgmentCalibrationSignal {
  const averageOutcome = rounded(average(judgments.map((judgment) => judgment.outcome)));
  const averageConviction = rounded(average(judgments.map((judgment) => judgment.conviction)));
  const gap = rounded(averageConviction - averageOutcome);
  return {
    dimension,
    label,
    sampleSize: judgments.length,
    averageOutcome,
    averageConviction,
    gap,
    tendency: tendencyFor(gap),
  };
}

function groupSignals(
  judgments: EvaluatedJudgment[],
  dimension: "position" | "age-group",
  getLabel: (judgment: EvaluatedJudgment) => string | undefined,
): JudgmentCalibrationSignal[] {
  const groups = new Map<string, EvaluatedJudgment[]>();
  for (const judgment of judgments) {
    const label = getLabel(judgment);
    if (!label) continue;
    const group = groups.get(label) ?? [];
    group.push(judgment);
    groups.set(label, group);
  }
  return [...groups.entries()]
    .filter(([, group]) => group.length >= 2)
    .map(([label, group]) => signal(dimension, label, group))
    .filter((candidate) => Math.abs(candidate.gap) >= 8)
    .sort((left, right) =>
      Math.abs(right.gap) - Math.abs(left.gap)
      || right.sampleSize - left.sampleSize
      || left.label.localeCompare(right.label),
    );
}

/**
 * Compare the strength of the scout's original calls with mature, aggregated
 * post-transfer reviews. This never exposes engine attributes or hidden CA/PA;
 * it describes a persistent pattern in the scout's own professional record.
 */
export function buildJudgmentCalibrationProfile(state: JudgmentCalibrationState): JudgmentCalibrationProfile {
  const cases = selectLatestReportsByCase(
    Object.values(state.reports).filter((report) => report.scoutId === state.scout.id),
  );
  const evaluated: EvaluatedJudgment[] = cases.flatMap((report) => {
    if (report.postTransferRating === undefined) return [];
    const player = state.players[report.playerId] ?? state.retiredPlayers?.[report.playerId];
    const reportAge = player
      ? Math.max(15, player.age - Math.max(0, state.currentSeason - report.submittedSeason))
      : undefined;
    return [{
      report,
      outcome: report.postTransferRating,
      conviction: CONVICTION_EXPECTATION[report.conviction],
      position: player?.position,
      ageGroup: reportAge === undefined ? undefined : ageGroup(reportAge),
    }];
  });
  const pendingCaseCount = cases.length - evaluated.length;
  const maturity = cases.length > 0 ? rounded((evaluated.length / cases.length) * 100) : 0;

  if (evaluated.length === 0) {
    return {
      distinctCaseCount: cases.length,
      evaluatedCaseCount: 0,
      pendingCaseCount,
      maturity,
      tendency: "awaiting-outcomes",
      headline: cases.length === 0 ? "No professional cases yet" : "Judgment still awaiting the world",
      guidance: cases.length === 0
        ? "File a recommendation, state your conviction, and let the player's career create evidence."
        : "Mature reviews appear after transfers and meaningful career time. Pending cases do not count as successes or failures.",
      signals: [],
      convictionResults: [],
    };
  }

  const overall = signal("conviction", "All evaluated cases", evaluated);
  const signals = [
    ...groupSignals(evaluated, "position", (judgment) => judgment.position),
    ...groupSignals(evaluated, "age-group", (judgment) => judgment.ageGroup),
  ].slice(0, 4);
  const convictionResults = (Object.keys(CONVICTION_EXPECTATION) as ConvictionLevel[])
    .map((conviction) => {
      const group = evaluated.filter((judgment) => judgment.report.conviction === conviction);
      return group.length > 0
        ? signal("conviction", CONVICTION_LABEL[conviction], group)
        : undefined;
    })
    .filter((candidate): candidate is JudgmentCalibrationSignal => candidate !== undefined);
  const topSignal = signals[0];
  const headline = overall.tendency === "overconfident"
    ? "Your conviction is running ahead of outcomes"
    : overall.tendency === "too-cautious"
      ? "Your best judgments deserve stronger backing"
      : "Your conviction broadly matches the evidence";
  const guidance = topSignal
    ? topSignal.tendency === "overconfident"
      ? `Slow down on ${topSignal.label} cases: your calls average ${topSignal.gap} points more conviction than their mature reviews.`
      : topSignal.tendency === "too-cautious"
        ? `Back your work on ${topSignal.label} cases more decisively: outcomes exceed your conviction by ${Math.abs(topSignal.gap)} points.`
        : "Keep recording explicit conviction so future reviews can distinguish sound caution from missed courage."
    : overall.tendency === "overconfident"
      ? "Seek a different observation context before escalating borderline recommendations."
      : overall.tendency === "too-cautious"
        ? "When evidence is mature, stronger conviction can convert good judgment into influence."
        : "Your sample is balanced so far; keep testing whether that holds across roles and ages.";

  return {
    distinctCaseCount: cases.length,
    evaluatedCaseCount: evaluated.length,
    pendingCaseCount,
    maturity,
    averageOutcome: overall.averageOutcome,
    averageConviction: overall.averageConviction,
    overallGap: overall.gap,
    tendency: overall.tendency,
    headline,
    guidance,
    signals,
    convictionResults,
  };
}
