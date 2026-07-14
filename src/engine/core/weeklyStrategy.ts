import type {
  Activity,
  ActivityType,
  DayInteractionState,
  DayResult,
} from "./types";
import { getActivityDefaultChoice } from "./activityInteractions";

export type WeeklyIntentId =
  | "balancedDesk"
  | "evidenceDepth"
  | "discoveryBreadth"
  | "assignmentDelivery"
  | "relationshipCapital"
  | "speculativeEdge";

export type DelegationPolicyId =
  | "adaptiveDesk"
  | "protectCoverage"
  | "protectEvidence"
  | "protectRelationships";

export interface WeeklyIntentDefinition {
  id: WeeklyIntentId;
  label: string;
  shortLabel: string;
  promise: string;
  opportunityCost: string;
}

export interface DelegationPolicyDefinition {
  id: DelegationPolicyId;
  label: string;
  description: string;
  opportunityCost: string;
}

export interface WeeklyStrategyModifier {
  discoveryModifier?: number;
  profileModifier?: number;
  anomalyModifier?: number;
  relationshipModifier?: number;
  reportQualityModifier?: number;
}

export interface DelegatedDecisionMemory {
  id: string;
  dayIndex: number;
  activityType: ActivityType;
  policyId: DelegationPolicyId;
  selectedOptionId: "scan" | "focus" | "network";
  protectedValue: string;
  opportunityCost: string;
}

export interface WeeklyStrategyOutcome {
  id: string;
  week: number;
  season: number;
  intentId: WeeklyIntentId;
  delegationPolicyId: DelegationPolicyId;
  alignedActivities: number;
  opposedActivities: number;
  delegationMemories: DelegatedDecisionMemory[];
}

export interface WeeklyStrategyState {
  intentId: WeeklyIntentId;
  delegationPolicyId: DelegationPolicyId;
  lastChangedWeek: number;
  lastChangedSeason: number;
  history: WeeklyStrategyOutcome[];
}

export const WEEKLY_INTENTS: readonly WeeklyIntentDefinition[] = [
  {
    id: "balancedDesk",
    label: "Balanced desk",
    shortLabel: "Balanced",
    promise: "Keep discovery, evidence, and relationships moving without forcing an edge.",
    opportunityCost: "You gain no specialist advantage when the week becomes competitive.",
  },
  {
    id: "evidenceDepth",
    label: "Test the evidence",
    shortLabel: "Depth",
    promise: "Deepen existing reads and improve the quality of follow-ups and reports.",
    opportunityCost: "Narrow attention means fewer new names reach your desk.",
  },
  {
    id: "discoveryBreadth",
    label: "Widen the search",
    shortLabel: "Breadth",
    promise: "Cover more venues, video, and data to surface a broader prospect pool.",
    opportunityCost: "Each case receives less depth and report detail.",
  },
  {
    id: "assignmentDelivery",
    label: "Deliver the brief",
    shortLabel: "Assigned",
    promise: "Prioritize accountable reports, stakeholder requests, and known targets.",
    opportunityCost: "Speculative discovery and personal projects lose attention.",
  },
  {
    id: "relationshipCapital",
    label: "Invest in trust",
    shortLabel: "Relationships",
    promise: "Create access and context through contacts, families, agents, and staff.",
    opportunityCost: "Pitch-side coverage and analytical output fall behind.",
  },
  {
    id: "speculativeEdge",
    label: "Chase an edge",
    shortLabel: "Speculative",
    promise: "Back unassigned venues and anomalies before the wider market arrives.",
    opportunityCost: "Reliable delivery and stakeholder maintenance become more fragile.",
  },
] as const;

export const DELEGATION_POLICIES: readonly DelegationPolicyDefinition[] = [
  {
    id: "adaptiveDesk",
    label: "Desk lead decides",
    description: "Use the professional default for each activity when you skip the live call.",
    opportunityCost: "Competent coverage, but no consistent strategic edge.",
  },
  {
    id: "protectCoverage",
    label: "Protect coverage",
    description: "Delegates scan broadly and keep the pipeline moving.",
    opportunityCost: "Reports and individual reads are shallower.",
  },
  {
    id: "protectEvidence",
    label: "Protect evidence",
    description: "Delegates concentrate on the strongest available lead.",
    opportunityCost: "Coverage narrows and relationship work receives less care.",
  },
  {
    id: "protectRelationships",
    label: "Protect relationships",
    description: "Delegates favor context, trust, and access over raw throughput.",
    opportunityCost: "Fewer profiles and new discoveries are produced.",
  },
] as const;

const VALID_INTENTS = new Set<WeeklyIntentId>(WEEKLY_INTENTS.map((intent) => intent.id));
const VALID_POLICIES = new Set<DelegationPolicyId>(DELEGATION_POLICIES.map((policy) => policy.id));
const MAX_STRATEGY_HISTORY = 156;

const BROAD_DISCOVERY = new Set<ActivityType>([
  "watchVideo",
  "academyVisit",
  "youthTournament",
  "schoolMatch",
  "grassrootsTournament",
  "streetFootball",
  "academyTrialDay",
  "youthFestival",
  "reserveMatch",
  "scoutingMission",
  "databaseQuery",
  "deepVideoAnalysis",
  "marketInefficiency",
  "freeAgentOutreach",
  "agencyShowcase",
]);

const DEPTH_WORK = new Set<ActivityType>([
  "followUpSession",
  "trainingVisit",
  "trialMatch",
  "deepVideoAnalysis",
  "loanMonitoring",
  "reviewNPCReport",
  "writeReport",
  "writePlacementReport",
]);

const ASSIGNMENT_WORK = new Set<ActivityType>([
  "writeReport",
  "writePlacementReport",
  "managerMeeting",
  "boardPresentation",
  "oppositionAnalysis",
  "loanRecommendation",
  "reviewNPCReport",
]);

const RELATIONSHIP_WORK = new Set<ActivityType>([
  "networkMeeting",
  "parentCoachMeeting",
  "agentShowcase",
  "contractNegotiation",
  "analyticsTeamMeeting",
  "managerMeeting",
  "boardPresentation",
]);

const SPECULATIVE_WORK = new Set<ActivityType>([
  "schoolMatch",
  "grassrootsTournament",
  "streetFootball",
  "youthFestival",
  "marketInefficiency",
  "databaseQuery",
  "agencyShowcase",
  "freeAgentOutreach",
]);

function asIntent(value: unknown): WeeklyIntentId {
  return typeof value === "string" && VALID_INTENTS.has(value as WeeklyIntentId)
    ? value as WeeklyIntentId
    : "balancedDesk";
}

function asPolicy(value: unknown): DelegationPolicyId {
  return typeof value === "string" && VALID_POLICIES.has(value as DelegationPolicyId)
    ? value as DelegationPolicyId
    : "adaptiveDesk";
}

export function createWeeklyStrategyState(
  week: number,
  season: number,
): WeeklyStrategyState {
  return {
    intentId: "balancedDesk",
    delegationPolicyId: "adaptiveDesk",
    lastChangedWeek: week,
    lastChangedSeason: season,
    history: [],
  };
}

export function normalizeWeeklyStrategyState(
  value: WeeklyStrategyState | undefined,
  week: number,
  season: number,
): WeeklyStrategyState {
  if (!value) return createWeeklyStrategyState(week, season);
  const history = Array.isArray(value.history)
    ? value.history
        .filter((entry): entry is WeeklyStrategyOutcome => Boolean(entry?.id))
        .slice(-MAX_STRATEGY_HISTORY)
        .map((entry) => ({
          ...entry,
          intentId: asIntent(entry.intentId),
          delegationPolicyId: asPolicy(entry.delegationPolicyId),
          delegationMemories: Array.isArray(entry.delegationMemories)
            ? entry.delegationMemories.filter((memory) => Boolean(memory?.id))
            : [],
        }))
    : [];
  return {
    intentId: asIntent(value.intentId),
    delegationPolicyId: asPolicy(value.delegationPolicyId),
    lastChangedWeek: Number.isFinite(value.lastChangedWeek) ? value.lastChangedWeek : week,
    lastChangedSeason: Number.isFinite(value.lastChangedSeason) ? value.lastChangedSeason : season,
    history,
  };
}

export function selectWeeklyIntent(
  strategy: WeeklyStrategyState | undefined,
  intentId: WeeklyIntentId,
  week: number,
  season: number,
): WeeklyStrategyState {
  const current = normalizeWeeklyStrategyState(strategy, week, season);
  return {
    ...current,
    intentId: asIntent(intentId),
    lastChangedWeek: week,
    lastChangedSeason: season,
  };
}

export function selectDelegationPolicy(
  strategy: WeeklyStrategyState | undefined,
  policyId: DelegationPolicyId,
  week: number,
  season: number,
): WeeklyStrategyState {
  const current = normalizeWeeklyStrategyState(strategy, week, season);
  return {
    ...current,
    delegationPolicyId: asPolicy(policyId),
    lastChangedWeek: week,
    lastChangedSeason: season,
  };
}

/**
 * Scheduler weight only. The actual outcome edge is applied separately so a
 * manually planned week and an auto-scheduled week obey the same strategy.
 */
export function getWeeklyIntentActivityPriority(
  intentId: WeeklyIntentId,
  activity: Activity,
): number {
  switch (intentId) {
    case "evidenceDepth":
      return DEPTH_WORK.has(activity.type) ? 36 : BROAD_DISCOVERY.has(activity.type) ? -14 : 0;
    case "discoveryBreadth":
      return BROAD_DISCOVERY.has(activity.type) ? 34 : DEPTH_WORK.has(activity.type) ? -14 : 0;
    case "assignmentDelivery":
      return ASSIGNMENT_WORK.has(activity.type) || activity.briefId ? 40 : SPECULATIVE_WORK.has(activity.type) ? -16 : 0;
    case "relationshipCapital":
      return RELATIONSHIP_WORK.has(activity.type) ? 42 : BROAD_DISCOVERY.has(activity.type) ? -12 : 0;
    case "speculativeEdge":
      return SPECULATIVE_WORK.has(activity.type) ? 42 : ASSIGNMENT_WORK.has(activity.type) ? -18 : 0;
    case "balancedDesk":
    default:
      return 0;
  }
}

export function getWeeklyIntentActivityModifier(
  intentId: WeeklyIntentId,
  activity: Activity,
): WeeklyStrategyModifier {
  switch (intentId) {
    case "evidenceDepth":
      return DEPTH_WORK.has(activity.type)
        ? { reportQualityModifier: 1 }
        : BROAD_DISCOVERY.has(activity.type)
          ? { discoveryModifier: -1 }
          : {};
    case "discoveryBreadth":
      return BROAD_DISCOVERY.has(activity.type)
        ? { discoveryModifier: 1, profileModifier: 1 }
        : DEPTH_WORK.has(activity.type)
          ? { reportQualityModifier: -1 }
          : {};
    case "assignmentDelivery":
      return ASSIGNMENT_WORK.has(activity.type) || activity.briefId
        ? { reportQualityModifier: 1, relationshipModifier: 1 }
        : SPECULATIVE_WORK.has(activity.type)
          ? { discoveryModifier: -1 }
          : {};
    case "relationshipCapital":
      return RELATIONSHIP_WORK.has(activity.type)
        ? { relationshipModifier: 1, reportQualityModifier: 1 }
        : BROAD_DISCOVERY.has(activity.type)
          ? { discoveryModifier: -1 }
          : {};
    case "speculativeEdge":
      return SPECULATIVE_WORK.has(activity.type)
        ? { discoveryModifier: 1, anomalyModifier: 1 }
        : ASSIGNMENT_WORK.has(activity.type)
          ? { reportQualityModifier: -1, relationshipModifier: -1 }
          : {};
    case "balancedDesk":
    default:
      return {};
  }
}

export function getDelegationPolicyModifier(
  policyId: DelegationPolicyId,
): WeeklyStrategyModifier {
  switch (policyId) {
    case "protectCoverage":
      return { discoveryModifier: 1, profileModifier: 1, reportQualityModifier: -1 };
    case "protectEvidence":
      return { reportQualityModifier: 1, discoveryModifier: -1, relationshipModifier: -1 };
    case "protectRelationships":
      return { relationshipModifier: 1, discoveryModifier: -1, profileModifier: -1 };
    case "adaptiveDesk":
    default:
      return {};
  }
}

function resolveDelegatedChoice(
  activity: Activity,
  policyId: DelegationPolicyId,
): "scan" | "focus" | "network" {
  if (policyId === "protectCoverage") return "scan";
  if (policyId === "protectEvidence") return "focus";
  if (policyId === "protectRelationships") return "network";
  return getActivityDefaultChoice(activity.type);
}

function resolveFocusIds(day: DayResult): string[] {
  const max = day.interaction?.maxFocusPlayers ?? 3;
  const existing = day.interaction?.focusedPlayerIds
    ?? (day.interaction?.focusedPlayerId ? [day.interaction.focusedPlayerId] : []);
  const candidates = existing.length > 0
    ? existing
    : day.observations.map((observation) => observation.playerId);
  return [...new Set(candidates.filter(Boolean))].slice(0, max);
}

function delegatedNarrative(
  policyId: DelegationPolicyId,
  choice: "scan" | "focus" | "network",
): string {
  const policy = DELEGATION_POLICIES.find((candidate) => candidate.id === policyId)!;
  const call = choice === "scan"
    ? "kept coverage broad"
    : choice === "focus"
      ? "concentrated on the strongest available evidence"
      : "protected context and relationships";
  return `Standing order delegated: ${policy.label}. Your desk ${call}; ${policy.opportunityCost.toLowerCase()}`;
}

export function resolveDelegatedDayInteraction(
  day: DayResult,
  policyId: DelegationPolicyId,
): DayResult {
  if (!day.activity || !day.interaction || day.interaction.selectedOptionId) return day;
  const safePolicy = asPolicy(policyId);
  const selectedOptionId = resolveDelegatedChoice(day.activity, safePolicy);
  const focusIds = selectedOptionId === "focus" ? resolveFocusIds(day) : [];
  return {
    ...day,
    narrative: `${day.narrative}\n\n${delegatedNarrative(safePolicy, selectedOptionId)}`,
    interaction: {
      ...day.interaction,
      selectedOptionId,
      focusedPlayerId: focusIds[0],
      focusedPlayerIds: focusIds,
      resolutionMode: "delegated",
      delegationPolicyId: safePolicy,
    },
  };
}

export function resolveAllDelegatedDayInteractions(
  days: readonly DayResult[],
  policyId: DelegationPolicyId,
): DayResult[] {
  return days.map((day) => resolveDelegatedDayInteraction(day, policyId));
}

function strategyAlignment(intentId: WeeklyIntentId, activity: Activity): -1 | 0 | 1 {
  const priority = getWeeklyIntentActivityPriority(intentId, activity);
  return priority > 0 ? 1 : priority < 0 ? -1 : 0;
}

function memoryForDelegation(
  day: DayResult,
  week: number,
  season: number,
): DelegatedDecisionMemory | null {
  const interaction = day.interaction;
  if (
    !day.activity
    || interaction?.resolutionMode !== "delegated"
    || (interaction.selectedOptionId !== "scan"
      && interaction.selectedOptionId !== "focus"
      && interaction.selectedOptionId !== "network")
  ) return null;
  const policyId = asPolicy(interaction.delegationPolicyId);
  const definition = DELEGATION_POLICIES.find((policy) => policy.id === policyId)!;
  return {
    id: `delegated-call-s${season}-w${week}-d${day.dayIndex}`,
    dayIndex: day.dayIndex,
    activityType: day.activity.type,
    policyId,
    selectedOptionId: interaction.selectedOptionId,
    protectedValue: definition.description,
    opportunityCost: definition.opportunityCost,
  };
}

/** Idempotently archive the strategy and every call the player delegated. */
export function recordWeeklyStrategyOutcome(
  strategy: WeeklyStrategyState | undefined,
  week: number,
  season: number,
  days: readonly DayResult[],
): WeeklyStrategyState {
  const current = normalizeWeeklyStrategyState(strategy, week, season);
  const id = `weekly-strategy-s${season}-w${week}`;
  if (current.history.some((entry) => entry.id === id)) return current;
  let alignedActivities = 0;
  let opposedActivities = 0;
  const seenInstances = new Set<string>();
  for (const day of days) {
    if (!day.activity) continue;
    const key = day.activity.instanceId ?? `${day.activity.type}-d${day.dayIndex}`;
    if (seenInstances.has(key)) continue;
    seenInstances.add(key);
    const alignment = strategyAlignment(current.intentId, day.activity);
    if (alignment > 0) alignedActivities++;
    else if (alignment < 0) opposedActivities++;
  }
  const delegationMemories = days
    .map((day) => memoryForDelegation(day, week, season))
    .filter((memory): memory is DelegatedDecisionMemory => Boolean(memory));
  return {
    ...current,
    history: [
      ...current.history,
      {
        id,
        week,
        season,
        intentId: current.intentId,
        delegationPolicyId: current.delegationPolicyId,
        alignedActivities,
        opposedActivities,
        delegationMemories,
      },
    ].slice(-MAX_STRATEGY_HISTORY),
  };
}

export function markInteractionAsPlayerChoice(
  interaction: DayInteractionState,
): DayInteractionState {
  return {
    ...interaction,
    resolutionMode: "player",
    delegationPolicyId: undefined,
  };
}
