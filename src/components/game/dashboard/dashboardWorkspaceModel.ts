import type {
  DashboardPriorityCandidate,
  DashboardPriorityItem,
  DashboardWeekSummary,
} from "@/components/game/dashboard/dashboardPriorityModel";
import {
  buildDashboardPriorityCandidates,
  buildDashboardWeekSummary,
  getDashboardPlannerObjectiveKey,
} from "@/components/game/dashboard/dashboardPriorityModel";
import type { DashboardYouthDeskAction } from "./types";
import type { BuildDashboardPriorityModelInput } from "@/components/game/dashboard/dashboardPriorityModel";
import {
  buildOutcomeExplanations,
  findOutcomeExplanationForCandidate,
} from "@/engine/dashboard/outcomeExplanations";
import { generateDashboardInsights } from "@/engine/dashboard/insights";
import { selectDashboardCareerThread } from "@/engine/dashboard/careerThreads";
import { deriveCareerStageProfile } from "@/engine/dashboard/careerStage";
import { migrateDashboardState } from "@/engine/dashboard/state";
import type {
  DashboardCareerThread,
  DashboardInsight,
} from "@/engine/dashboard/types";

export const DASHBOARD_OWNERSHIP_CONTRACT = Object.freeze({
  owns: [
    "Prioritize information from existing systems.",
    "Explain why each item matters.",
    "Provide a clear next action.",
    "Link into the authoritative workspace.",
    "Avoid resolving complex decisions directly unless the action is genuinely simple.",
  ] as const,
  excludes: [
    "Resolving Inbox decisions inside the Dashboard.",
    "Recalculating simulation outcomes.",
    "Becoming an archive or metric dump.",
    "Showing hidden copies of other screens.",
    "Duplicating Inbox, Planner, Career, or Reports logic.",
  ] as const,
});

export interface DashboardWorkspaceModel {
  attention: DashboardPriorityItem[];
  opportunitiesAtRisk: DashboardPriorityItem[];
  visibleItems: DashboardPriorityItem[];
  activeItemIds: string[];
  nextAction: DashboardPriorityItem | null;
  weekSummary: DashboardWeekSummary;
  careerThread: DashboardCareerThread | null;
  insights: DashboardInsight[];
  careerStage: ReturnType<typeof deriveCareerStageProfile>;
  recentlyResolved: ReturnType<typeof migrateDashboardState>["recentlyResolved"];
}

function toPriorityItem(
  candidate: DashboardPriorityCandidate,
  outcomeExplanation = candidate.outcomeExplanation,
): DashboardPriorityItem {
  return {
    id: candidate.id,
    objectiveKey: candidate.canonicalKey,
    category: candidate.category,
    severity: candidate.severity,
    title: candidate.title,
    explanation: candidate.explanation,
    consequence: candidate.consequence,
    deadlineWeek: candidate.deadlineWeek,
    relatedEntityIds: candidate.relatedEntityIds,
    sourceSystem: candidate.sourceSystem,
    actionLabel: candidate.actionLabel,
    actionTarget: candidate.actionTarget,
    outcomeExplanation,
    fingerprint: candidate.fingerprint,
    dismissible: candidate.dismissible,
    snoozable: candidate.snoozable,
    pinnable: candidate.pinnable,
  };
}

/** Advancing booked work and using spare days are distinct decisions, even
 * when both can lead to Planner. Only the explicit allocation action owns it. */
export function getYouthDeskRepresentedObjectiveKey(
  actionKind: DashboardYouthDeskAction["kind"],
  season: number,
  week: number,
): string | undefined {
  return actionKind === "planner" ? getDashboardPlannerObjectiveKey(season, week) : undefined;
}

/** Suppress only an objective already presented by the active case. Distinct
 * deadlines, people and rival decisions can share a screen and remain visible.
 * This projection never dismisses or resolves the underlying responsibility. */
export function selectDashboardSupportingItems(
  items: readonly DashboardPriorityItem[],
  representedObjectiveKey?: string,
): DashboardPriorityItem[] {
  return items.filter((item) => !representedObjectiveKey || item.objectiveKey !== representedObjectiveKey);
}

function isAttentionCandidate(candidate: DashboardPriorityCandidate): boolean {
  return candidate.category === "required_action"
    || candidate.category === "deadline"
    || candidate.category === "risk";
}

function isOpportunityCandidate(candidate: DashboardPriorityCandidate): boolean {
  return candidate.category === "opportunity";
}

export function buildDashboardWorkspaceModel(
  input: BuildDashboardPriorityModelInput,
): DashboardWorkspaceModel {
  const rankedAll = buildDashboardPriorityCandidates({
    ...input,
    maxItems: Number.MAX_SAFE_INTEGER,
  });
  const ranked = rankedAll.slice(0, Math.min(5, input.maxItems ?? 5));
  const explanations = buildOutcomeExplanations(input.gameState);
  const withExplanations = ranked.map((candidate) => ({
    candidate,
    outcome: findOutcomeExplanationForCandidate(candidate, explanations) ?? undefined,
  }));
  const visibleItems = withExplanations.map(({ candidate, outcome }) =>
    toPriorityItem(candidate, outcome),
  );
  const attention = withExplanations
    .filter(({ candidate }) => isAttentionCandidate(candidate))
    .slice(0, 3)
    .map(({ candidate, outcome }) => toPriorityItem(candidate, outcome));
  const opportunitiesAtRisk = withExplanations
    .filter(({ candidate }) => isOpportunityCandidate(candidate))
    .slice(0, 2)
    .map(({ candidate, outcome }) => toPriorityItem(candidate, outcome));

  return {
    attention,
    opportunitiesAtRisk,
    visibleItems,
    activeItemIds: rankedAll.map((candidate) => candidate.id),
    nextAction: visibleItems[0] ?? null,
    weekSummary: buildDashboardWeekSummary(input.gameState),
    careerThread: selectDashboardCareerThread(input.gameState),
    insights: generateDashboardInsights(input.gameState).slice(0, 2),
    careerStage: deriveCareerStageProfile(input.gameState),
    recentlyResolved: migrateDashboardState(input.gameState.dashboardState).recentlyResolved,
  };
}
