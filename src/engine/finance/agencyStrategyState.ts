import type { GameDate } from "@/engine/core/types";

export type AgencyOperatingPolicy =
  | "balancedBook"
  | "runwayDefense"
  | "clientDiversification"
  | "stableRetainers"
  | "placementUpside"
  | "regionalDepth"
  | "qualityDiscipline"
  | "marketExpansion";

export type LegacyAgencyStrategicPosture =
  | "balanced"
  | "cashDefense"
  | "qualityFirst"
  | "diversifyClients"
  | "controlledGrowth";

export interface AgencyStrategyState {
  policy: AgencyOperatingPolicy;
  selectedAt: GameDate;
  lockedUntil: GameDate;
  lastAppliedAt?: GameDate;
  /** Country or region receiving the benefit of a regional-depth commitment. */
  focusRegionId?: string;
}

export interface AgencyOperatingPolicyDefinition {
  label: string;
  purpose: string;
  benefits: string[];
  tradeoffs: string[];
  recommendedWhen: string;
  marketplaceValueMultiplier: number;
  marketplaceDemandMultiplier: number;
  weeklyOperatingCost: number;
  clientSatisfactionDelta: number;
  employeeMoraleDelta: number;
  employeeFatigueDelta: number;
  regionalPresenceBonus: number;
  capacityMultiplier: number;
  qualityDebtAdjustment: number;
  reputationExposureAdjustment: number;
  blocksFixedCostGrowth?: boolean;
  blocksDominantClientConcentration?: boolean;
}

export const AGENCY_POLICY_DEFINITIONS: Record<
  AgencyOperatingPolicy,
  AgencyOperatingPolicyDefinition
> = {
  balancedBook: {
    label: "Balanced book",
    purpose: "Keep delivery, client development, and recovery in equilibrium.",
    benefits: ["Neutral operating pressure", "No hidden growth or austerity tax"],
    tradeoffs: ["No single pressure is aggressively solved"],
    recommendedWhen: "Use when the book is healthy and you want optionality.",
    marketplaceValueMultiplier: 1,
    marketplaceDemandMultiplier: 1,
    weeklyOperatingCost: 0,
    clientSatisfactionDelta: 0,
    employeeMoraleDelta: 0,
    employeeFatigueDelta: 0,
    regionalPresenceBonus: 0,
    capacityMultiplier: 1,
    qualityDebtAdjustment: 0,
    reputationExposureAdjustment: 0,
  },
  runwayDefense: {
    label: "Defend the runway",
    purpose: "Freeze new fixed-cost commitments and prioritize short-term resilience.",
    benefits: ["Protects cash runway", "Reduces exposure to one bad month"],
    tradeoffs: ["Slower growth", "Less room for new hires or office expansion"],
    recommendedWhen: "Use when cash runway is short or the balance sheet is exposed.",
    marketplaceValueMultiplier: 0.93,
    marketplaceDemandMultiplier: 0.8,
    weeklyOperatingCost: 10,
    clientSatisfactionDelta: 1,
    employeeMoraleDelta: -1,
    employeeFatigueDelta: 0,
    regionalPresenceBonus: 0,
    capacityMultiplier: 0.95,
    qualityDebtAdjustment: 3,
    reputationExposureAdjustment: 0,
    blocksFixedCostGrowth: true,
  },
  clientDiversification: {
    label: "Diversify the book",
    purpose: "Protect the practice from one client owning revenue, leverage, or judgment.",
    benefits: ["Reduces single-client leverage", "Improves long-term resilience"],
    tradeoffs: ["Turns down some easy renewals", "Consumes commercial attention"],
    recommendedWhen: "Use when one account is starting to dominate your security.",
    marketplaceValueMultiplier: 0.96,
    marketplaceDemandMultiplier: 0.88,
    weeklyOperatingCost: 30,
    clientSatisfactionDelta: 0,
    employeeMoraleDelta: 0,
    employeeFatigueDelta: -1,
    regionalPresenceBonus: 0,
    capacityMultiplier: 0.85,
    qualityDebtAdjustment: -4,
    reputationExposureAdjustment: -5,
    blocksDominantClientConcentration: true,
  },
  stableRetainers: {
    label: "Stable retainers",
    purpose: "Lean toward dependable client work without fully shutting down upside plays.",
    benefits: ["Smooths cash flow", "Builds repeat trust with active clubs"],
    tradeoffs: ["Consumes report capacity", "Can still drift toward client dependence"],
    recommendedWhen: "Use when you want steadier income without full austerity.",
    marketplaceValueMultiplier: 0.95,
    marketplaceDemandMultiplier: 0.82,
    weeklyOperatingCost: 20,
    clientSatisfactionDelta: 1,
    employeeMoraleDelta: 0,
    employeeFatigueDelta: 0,
    regionalPresenceBonus: 0,
    capacityMultiplier: 0.96,
    qualityDebtAdjustment: -2,
    reputationExposureAdjustment: -1,
  },
  placementUpside: {
    label: "Placement upside",
    purpose: "Back conviction and chase breakthrough wins that can change your status.",
    benefits: ["Higher upside per successful case", "More chance of breakout reputation moments"],
    tradeoffs: ["Irregular income", "Mistakes are more visible"],
    recommendedWhen: "Use when runway is healthy and you can absorb variance.",
    marketplaceValueMultiplier: 1.18,
    marketplaceDemandMultiplier: 1.08,
    weeklyOperatingCost: 35,
    clientSatisfactionDelta: -1,
    employeeMoraleDelta: 0,
    employeeFatigueDelta: 1,
    regionalPresenceBonus: 0,
    capacityMultiplier: 1.06,
    qualityDebtAdjustment: 6,
    reputationExposureAdjustment: 8,
  },
  regionalDepth: {
    label: "Regional depth",
    purpose: "Commit attention and operating support to one territory where edge can compound.",
    benefits: ["Improves local access and context", "Makes follow-up work more efficient"],
    tradeoffs: ["Narrower total coverage", "Revenue leans harder on one market"],
    recommendedWhen: "Use when one region is close to becoming a durable stronghold.",
    marketplaceValueMultiplier: 0.92,
    marketplaceDemandMultiplier: 0.9,
    weeklyOperatingCost: 65,
    clientSatisfactionDelta: 0,
    employeeMoraleDelta: 1,
    employeeFatigueDelta: 0,
    regionalPresenceBonus: 14,
    capacityMultiplier: 0.94,
    qualityDebtAdjustment: -3,
    reputationExposureAdjustment: -2,
  },
  qualityDiscipline: {
    label: "Quality discipline",
    purpose: "Reserve review time and accept less work so the agency stays defensible.",
    benefits: ["Protects standards", "Reduces fatigue and revision churn"],
    tradeoffs: ["Slower growth", "May require declining live demand"],
    recommendedWhen: "Use when backlog, fatigue, or fragile staff quality are visible.",
    marketplaceValueMultiplier: 1,
    marketplaceDemandMultiplier: 0.75,
    weeklyOperatingCost: 90,
    clientSatisfactionDelta: 1,
    employeeMoraleDelta: 1,
    employeeFatigueDelta: -3,
    regionalPresenceBonus: 0,
    capacityMultiplier: 0.8,
    qualityDebtAdjustment: -22,
    reputationExposureAdjustment: -8,
  },
  marketExpansion: {
    label: "Market expansion",
    purpose: "Stretch the operation to open more future demand before rivals do.",
    benefits: ["Broadens future revenue base", "Expands reach and optionality"],
    tradeoffs: ["Higher coordination load", "Can outrun current staff quality"],
    recommendedWhen: "Use when concentration is too high but cash and capacity remain comfortable.",
    marketplaceValueMultiplier: 1,
    marketplaceDemandMultiplier: 1.22,
    weeklyOperatingCost: 140,
    clientSatisfactionDelta: -1,
    employeeMoraleDelta: -1,
    employeeFatigueDelta: 2,
    regionalPresenceBonus: 5,
    capacityMultiplier: 1.15,
    qualityDebtAdjustment: 15,
    reputationExposureAdjustment: 12,
  },
};

const AGENCY_POLICIES = new Set<AgencyOperatingPolicy>([
  "balancedBook",
  "runwayDefense",
  "clientDiversification",
  "stableRetainers",
  "placementUpside",
  "regionalDepth",
  "qualityDiscipline",
  "marketExpansion",
]);

const LEGACY_POSTURE_TO_POLICY: Record<
  LegacyAgencyStrategicPosture,
  AgencyOperatingPolicy
> = {
  balanced: "balancedBook",
  cashDefense: "runwayDefense",
  qualityFirst: "qualityDiscipline",
  diversifyClients: "clientDiversification",
  controlledGrowth: "marketExpansion",
};

function safeGameDate(value: unknown): GameDate | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const date = value as Partial<GameDate>;
  if (!Number.isInteger(date.week) || !Number.isInteger(date.season)) return undefined;
  if ((date.week ?? 0) < 1 || (date.season ?? 0) < 1) return undefined;
  return { week: date.week!, season: date.season! };
}

export function normalizeAgencyStrategyState(
  value: unknown,
): AgencyStrategyState | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Partial<AgencyStrategyState>;
  if (!candidate.policy || !AGENCY_POLICIES.has(candidate.policy)) return undefined;
  const selectedAt = safeGameDate(candidate.selectedAt);
  const lockedUntil = safeGameDate(candidate.lockedUntil);
  const lastAppliedAt = safeGameDate(candidate.lastAppliedAt);
  if (!selectedAt || !lockedUntil) return undefined;
  return {
    policy: candidate.policy,
    selectedAt,
    lockedUntil,
    ...(lastAppliedAt ? { lastAppliedAt } : {}),
    ...(typeof candidate.focusRegionId === "string" && candidate.focusRegionId.trim()
      ? { focusRegionId: candidate.focusRegionId }
      : {}),
  };
}

export function isAgencyOperatingPolicy(value: unknown): value is AgencyOperatingPolicy {
  return typeof value === "string" && AGENCY_POLICIES.has(value as AgencyOperatingPolicy);
}

export function getAgencyOperatingPolicyDefinition(
  policy: AgencyOperatingPolicy,
): AgencyOperatingPolicyDefinition {
  return AGENCY_POLICY_DEFINITIONS[policy];
}

export function mapLegacyAgencyPostureToPolicy(
  posture: LegacyAgencyStrategicPosture,
): AgencyOperatingPolicy {
  return LEGACY_POSTURE_TO_POLICY[posture];
}
