import type { GameState, ScoutingCase } from "@/engine/core/types";

export type PlayerProfileTabId = "decision" | "evidence" | "development" | "history";

export interface PlayerProfileTab {
  id: PlayerProfileTabId;
  label: string;
  description: string;
}

export interface UnknownAttributeSummary {
  visibleCount: number;
  hiddenCount: number;
  hiddenLabels: string[];
}

export function evidenceOpportunityLabel(gainBand: "high" | "medium" | "low"): string {
  if (gainBand === "high") return "Strong evidence fit";
  if (gainBand === "medium") return "Useful evidence fit";
  return "Exploratory evidence";
}

export const PLAYER_PROFILE_TABS: PlayerProfileTab[] = [
  {
    id: "decision",
    label: "Decision",
    description: "Current question, next action, and live opportunity cost.",
  },
  {
    id: "evidence",
    label: "Evidence",
    description: "Observations, attribute reads, and supporting intel.",
  },
  {
    id: "development",
    label: "Development",
    description: "Pathway, environment, and readiness context.",
  },
  {
    id: "history",
    label: "History",
    description: "Reports, callbacks, movement, and career trace.",
  },
];

function caseMomentum(scoutingCase: ScoutingCase): number {
  return (scoutingCase.reportIds.length * 4)
    + (scoutingCase.decisionIds.length * 5)
    + (scoutingCase.reviewIds?.length ?? 0) * 3
    + (scoutingCase.professionalContext ? 2 : 0)
    + (scoutingCase.activeReportId ? 1 : 0);
}

export function selectMostRelevantScoutingCase(
  gameState: Pick<GameState, "scoutingCases">,
  playerId: string,
): ScoutingCase | undefined {
  return Object.values(gameState.scoutingCases ?? {})
    .filter((scoutingCase) => scoutingCase.playerId === playerId)
    .sort((left, right) =>
      caseMomentum(right) - caseMomentum(left)
      || right.reportIds.length - left.reportIds.length
      || right.decisionIds.length - left.decisionIds.length,
    )[0];
}

export function summarizeUnknownAttributes(
  attributes: Array<[string, unknown]>,
): UnknownAttributeSummary {
  const visible = attributes.filter(([, reading]) => Boolean(reading));
  const hidden = attributes.filter(([, reading]) => !reading).map(([label]) => label);
  return {
    visibleCount: visible.length,
    hiddenCount: hidden.length,
    hiddenLabels: hidden,
  };
}
