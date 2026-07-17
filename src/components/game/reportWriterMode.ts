import type { StructuredReportInput } from "@/engine/core/types";

export interface ConciseOpeningReportModeInput {
  isYouthScout: boolean;
  openingStage?: string | null;
  openingPlayerId?: string | null;
  selectedPlayerId?: string | null;
  previousReportExists: boolean;
  observationCount: number;
  contextCount: number;
}

export const CONCISE_OPENING_ACTION_OPTIONS: Array<{
  value: StructuredReportInput["recommendedAction"];
  label: string;
  description: string;
}> = [
  {
    value: "monitor",
    label: "Keep private",
    description: "Protect the name and schedule another look before escalating it.",
  },
  {
    value: "inviteForTrial",
    label: "Test next",
    description: "Push for another live context that can prove the first read wrong.",
  },
  {
    value: "offerAcademyPlace",
    label: "Escalate now",
    description: "Share it as an actionable lead even though the case is still thin.",
  },
];

const FULL_REPORT_ACTION_LABELS: Record<StructuredReportInput["recommendedAction"], string> = {
  monitor: "Monitor",
  inviteForTrial: "Invite for trial",
  offerAcademyPlace: "Offer academy place",
};

const CONCISE_OPENING_ACTION_LABELS: Record<StructuredReportInput["recommendedAction"], string> = {
  monitor: "Keep private and plan another look",
  inviteForTrial: "Test the read in another context",
  offerAcademyPlace: "Escalate the lead now",
};

export function isConciseOpeningReportMode(input: ConciseOpeningReportModeInput): boolean {
  if (!input.isYouthScout) return false;
  if (input.openingStage !== "report") return false;
  if (!input.openingPlayerId || input.openingPlayerId !== input.selectedPlayerId) return false;
  if (input.previousReportExists) return false;
  return input.observationCount <= 1 && input.contextCount <= 1;
}

export function getRecommendedActionLabel(
  action: StructuredReportInput["recommendedAction"],
  conciseOpeningMode = false,
): string {
  return conciseOpeningMode
    ? CONCISE_OPENING_ACTION_LABELS[action]
    : FULL_REPORT_ACTION_LABELS[action];
}

export function buildConciseOpeningSummary(input: {
  currentRead: string;
  keyUncertainty: string;
  recommendedActionLabel: string;
}): string {
  return [
    `Current read: ${input.currentRead.trim()}`,
    `Key uncertainty: ${input.keyUncertainty.trim()}`,
    `Recommended next step: ${input.recommendedActionLabel}.`,
  ].join(" ");
}
