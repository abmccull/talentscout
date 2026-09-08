import type {
  Club,
  ConvictionLevel,
  JudgmentCategory,
  Player,
  ReportComparison as LegacyReportComparison,
  ScoutReport,
} from "@/engine/core/types";
import { compareReports } from "@/engine/reports/comparison";
import { resolvePlayerEntity } from "@/lib/playerResolution";

const JUDGMENT_CATEGORIES: JudgmentCategory[] = ["potential", "roleFit", "characterRisk"];

const CATEGORY_LABELS: Record<JudgmentCategory, string> = {
  potential: "Potential",
  roleFit: "Role fit",
  characterRisk: "Character and risk",
};

const CONFIDENCE_LABELS = {
  high: "High",
  medium: "Medium",
  low: "Low",
} as const;

export type ReportComparisonMode = "structured" | "legacy" | "mixed";

export interface ReportComparisonCard {
  reportId: string;
  playerName: string;
  conviction: ConvictionLevel;
  estimatedValue: number;
  perceivedCAStars: number | null;
  perceivedPARange: [number, number] | null;
  strengthCount: number;
  weaknessCount: number;
  reportStyleLabel: string;
  targetClubName: string;
  audienceLabel: string;
  projectedRoleLabel: string;
  recommendedActionLabel: string;
  primaryRiskLabel: string;
  evidenceCount: number;
  unknownCount: number;
  confidenceSummary: string;
}

export interface StructuredComparisonCell {
  reportId: string;
  available: boolean;
  confidenceLabel: string | null;
  verdict: string | null;
  uncertainty: string | null;
  evidenceCount: number;
}

export interface StructuredComparisonRow {
  category: JudgmentCategory;
  label: string;
  cells: StructuredComparisonCell[];
}

export interface ReportComparisonViewModel {
  mode: ReportComparisonMode;
  headline: string;
  explanation: string;
  cards: ReportComparisonCard[];
  structuredRows: StructuredComparisonRow[];
  legacyComparison: LegacyReportComparison | null;
  legacyHeading: string;
  legacyExplanation: string;
}

interface BuildReportComparisonViewModelInput {
  reports: ScoutReport[];
  players: Array<Player | undefined>;
  clubs: Record<string, Club> | undefined;
}

/** Keep report identities intact when prospects are unsigned or careers are archived. */
export function resolveReportComparisonPlayers(
  reports: Pick<ScoutReport, "playerId">[],
  state: Parameters<typeof resolvePlayerEntity>[0],
): Array<Player | undefined> {
  return reports.map((report) => resolvePlayerEntity(state, report.playerId)?.player);
}

export function buildReportComparisonViewModel({
  reports,
  players,
  clubs,
}: BuildReportComparisonViewModelInput): ReportComparisonViewModel {
  const structuredCount = reports.filter(hasStructuredJudgments).length;
  const allHaveLegacyAttributes = reports.length > 0 && reports.every(hasLegacyAttributes);

  const mode: ReportComparisonMode = structuredCount === reports.length && structuredCount > 0
    ? "structured"
    : structuredCount === 0
      ? "legacy"
      : "mixed";

  const cards = reports.map((report, index) => buildCard(report, players[index], clubs));
  const structuredRows = JUDGMENT_CATEGORIES.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    cells: reports.map((report) => buildStructuredCell(report, category)),
  }));

  const legacyComparison = allHaveLegacyAttributes && reports.length >= 2
    ? compareReports(reports)
    : null;

  const headline = buildHeadline(mode);
  const explanation = buildExplanation(mode, allHaveLegacyAttributes);

  const legacyHeading = mode === "legacy"
    ? "Attribute comparison"
    : "Earlier attribute estimates";
  const legacyExplanation = mode === "legacy"
    ? "Compare the attribute estimates recorded in each report, including their uncertainty."
    : "Use these earlier estimates to support the recommendations and evidence above.";

  return {
    mode,
    headline,
    explanation,
    cards,
    structuredRows,
    legacyComparison,
    legacyHeading,
    legacyExplanation,
  };
}

function buildHeadline(mode: ReportComparisonMode): string {
  switch (mode) {
    case "structured":
      return "Compare the recommendation, the evidence behind it, and what remains uncertain.";
    case "mixed":
      return "Compare the recommendations first, then review any earlier attribute estimates.";
    case "legacy":
    default:
      return "Compare your recorded attribute estimates side by side.";
  }
}

function buildExplanation(mode: ReportComparisonMode, allHaveLegacyAttributes: boolean): string {
  switch (mode) {
    case "structured":
      return "Start with the case each scout made: the observed evidence, the unknowns, and the action recommended to the club.";
    case "mixed":
      return allHaveLegacyAttributes
        ? "These reports record different kinds of evidence. Compare their recommendations above and use the shared attribute estimates as supporting context."
        : "These reports record different kinds of evidence. They do not share enough observed attributes for a fair numeric comparison.";
    case "legacy":
    default:
      return "All selected reports include attribute estimates. Compare their strengths, concerns and uncertainty before choosing the next step.";
  }
}

function buildCard(
  report: ScoutReport,
  player: Player | undefined,
  clubs: Record<string, Club> | undefined,
): ReportComparisonCard {
  const playerName = player ? `${player.firstName} ${player.lastName}` : "Unknown";
  const evidenceCount = countEvidence(report);
  const unknownCount = countUnknowns(report);
  const targetClubName = report.intendedClubId && clubs?.[report.intendedClubId]?.name
    ? clubs[report.intendedClubId].name
    : "No target club recorded";

  return {
    reportId: report.id,
    playerName,
    conviction: report.conviction,
    estimatedValue: report.estimatedValue,
    perceivedCAStars: report.perceivedCAStars ?? null,
    perceivedPARange: report.perceivedPARange ?? null,
    strengthCount: report.strengths.length,
    weaknessCount: report.weaknesses.length,
    reportStyleLabel: reportStyleLabel(report),
    targetClubName,
    audienceLabel: report.intendedAudience ? formatLabel(report.intendedAudience) : "Audience not specified",
    projectedRoleLabel: report.projectedRole ? formatLabel(report.projectedRole) : "Role not specified",
    recommendedActionLabel: report.recommendedAction ? formatLabel(report.recommendedAction) : "Action not specified",
    primaryRiskLabel: primaryRiskLabel(report),
    evidenceCount,
    unknownCount,
    confidenceSummary: confidenceSummary(report),
  };
}

function buildStructuredCell(report: ScoutReport, category: JudgmentCategory): StructuredComparisonCell {
  const verdict = report.categoryVerdicts?.[category];
  const available = Boolean(
    verdict
    && (
      verdict.status !== "notAssessed"
      || verdict.verdict
      || (verdict.evidenceIds?.length ?? 0) > 0
      || (verdict.hypothesisIds?.length ?? 0) > 0
    ),
  );

  return {
    reportId: report.id,
    available,
    confidenceLabel: verdict?.confidence ? CONFIDENCE_LABELS[verdict.confidence] : null,
    verdict: available ? cleanText(verdict?.verdict) : null,
    uncertainty: available ? cleanText(verdict?.acknowledgedUncertainty) : null,
    evidenceCount: verdict?.evidenceIds?.length ?? 0,
  };
}

function hasStructuredJudgments(report: ScoutReport): boolean {
  return JUDGMENT_CATEGORIES.some((category) => buildStructuredCell(report, category).available);
}

function hasLegacyAttributes(report: ScoutReport): boolean {
  return report.attributeAssessments.length > 0;
}

function countEvidence(report: ScoutReport): number {
  const ids = new Set<string>();
  for (const id of report.evidenceAssessment?.evidenceIds ?? []) {
    const cleaned = cleanText(id);
    if (cleaned) ids.add(cleaned);
  }
  for (const verdict of Object.values(report.categoryVerdicts ?? {})) {
    for (const id of verdict?.evidenceIds ?? []) {
      const cleaned = cleanText(id);
      if (cleaned) ids.add(cleaned);
    }
  }
  for (const risk of report.riskAssessments ?? []) {
    for (const id of risk.evidenceIds ?? []) {
      const cleaned = cleanText(id);
      if (cleaned) ids.add(cleaned);
    }
  }
  if (ids.size > 0) return ids.size;
  for (const id of report.evidenceObservationIds ?? []) {
    const cleaned = cleanText(id);
    if (cleaned) ids.add(cleaned);
  }
  if (ids.size > 0) return ids.size;
  return report.attributeAssessments.length;
}

function countUnknowns(report: ScoutReport): number {
  const unknowns = new Set<string>();
  for (const verdict of Object.values(report.categoryVerdicts ?? {})) {
    const cleaned = cleanText(verdict?.acknowledgedUncertainty);
    if (cleaned) unknowns.add(cleaned.toLowerCase());
  }
  if (unknowns.size > 0) return unknowns.size;
  return (report.riskAssessments ?? []).filter((risk) => risk.status !== "observed").length;
}

function confidenceSummary(report: ScoutReport): string {
  const counts = { high: 0, medium: 0, low: 0 };
  for (const verdict of Object.values(report.categoryVerdicts ?? {})) {
    if (!verdict?.confidence) continue;
    counts[verdict.confidence]++;
  }
  const total = counts.high + counts.medium + counts.low;
  if (total === 0) {
    return hasLegacyAttributes(report)
      ? "Legacy estimate grid"
      : "Confidence not structured";
  }
  const parts = [
    counts.high > 0 ? `${counts.high} high` : null,
    counts.medium > 0 ? `${counts.medium} medium` : null,
    counts.low > 0 ? `${counts.low} low` : null,
  ].filter((part): part is string => Boolean(part));
  return parts.join(" / ");
}

function primaryRiskLabel(report: ScoutReport): string {
  const observedRisk = report.riskAssessments?.find((risk) => risk.status === "observed");
  if (observedRisk) return observedRisk.label;
  const fallbackRisk = report.riskAssessments?.[0]?.label ?? report.riskFactors?.[0];
  if (fallbackRisk) return fallbackRisk;
  return "No primary risk recorded";
}

function reportStyleLabel(report: ScoutReport): string {
  const structured = hasStructuredJudgments(report);
  const legacy = hasLegacyAttributes(report);
  if (structured && legacy) return "Hybrid transitional";
  if (structured) return "Structured evidence";
  if (legacy) return "Legacy attribute";
  return "Minimal note";
}

function formatLabel(value: string): string {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function cleanText(value: string | undefined | null): string | null {
  if (!value) return null;
  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : null;
}
