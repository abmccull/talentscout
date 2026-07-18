import type {
  FinancialRecord,
  GameDate,
  Scout,
} from "@/engine/core/types";
import { calculateAgencyHealth } from "@/engine/finance/dashboard";
import { deriveAgencyStrategicHealth } from "./agency";
import {
  addGameWeeksWithSeasonLength,
  isGameDateAtOrAfter,
  LEGACY_SEASON_LENGTH_WEEKS,
} from "@/engine/core/gameDate";
import {
  AGENCY_POLICY_DEFINITIONS,
  getAgencyOperatingPolicyDefinition,
  normalizeAgencyStrategyState,
  type AgencyOperatingPolicy,
  type AgencyStrategyState,
} from "./agencyStrategyState";
export {
  AGENCY_POLICY_DEFINITIONS,
  getAgencyOperatingPolicyDefinition,
  normalizeAgencyStrategyState,
  type AgencyOperatingPolicy,
  type AgencyStrategyState,
} from "./agencyStrategyState";

export interface AgencyPolicyWeeklyModifiers {
  marketplaceValueMultiplier: number;
  marketplaceDemandMultiplier: number;
  weeklyOperatingCost: number;
  clientSatisfactionDelta: number;
  employeeMoraleDelta: number;
  employeeFatigueDelta: number;
  regionalPresenceBonus: number;
}

export interface AgencyPolicyWeekResult {
  finances: FinancialRecord;
  changed: boolean;
  operatingCost: number;
  policy?: AgencyOperatingPolicy;
}

const NEUTRAL_POLICY_MODIFIERS: AgencyPolicyWeeklyModifiers = {
  marketplaceValueMultiplier: 1,
  marketplaceDemandMultiplier: 1,
  weeklyOperatingCost: 0,
  clientSatisfactionDelta: 0,
  employeeMoraleDelta: 0,
  employeeFatigueDelta: 0,
  regionalPresenceBonus: 0,
};

export interface AgencyPolicyEffect {
  policy: AgencyOperatingPolicy;
  benefits: string[];
  tradeoffs: string[];
  recommendedWhen: string;
}

export interface AgencyStrategicPressure {
  runwayWeeks: number | null;
  clientConcentration: number;
  capacityUtilization: number;
  revenueAtRisk: number;
  qualityDebt: number;
  staffFragility: number;
  dominantRisk:
    | "runway"
    | "concentration"
    | "capacity"
    | "qualityDebt"
    | "staffFragility"
    | "balanced";
  suggestedPolicy: AgencyOperatingPolicy;
  policyEffect: AgencyPolicyEffect;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getAgencyPolicyWeeklyModifiers(
  policy: AgencyOperatingPolicy | undefined,
): AgencyPolicyWeeklyModifiers {
  if (!policy) return NEUTRAL_POLICY_MODIFIERS;
  const definition = AGENCY_POLICY_DEFINITIONS[policy];
  return {
    marketplaceValueMultiplier: definition.marketplaceValueMultiplier,
    marketplaceDemandMultiplier: definition.marketplaceDemandMultiplier,
    weeklyOperatingCost: definition.weeklyOperatingCost,
    clientSatisfactionDelta: definition.clientSatisfactionDelta,
    employeeMoraleDelta: definition.employeeMoraleDelta,
    employeeFatigueDelta: definition.employeeFatigueDelta,
    regionalPresenceBonus: definition.regionalPresenceBonus,
  };
}

export function canChangeAgencyOperatingPolicy(
  finances: FinancialRecord,
  now: GameDate,
): boolean {
  const current = normalizeAgencyStrategyState(finances.agencyStrategyState);
  return finances.careerPath === "independent"
    && (!current || isGameDateAtOrAfter(now, current.lockedUntil));
}

export function selectAgencyOperatingPolicy(input: {
  finances: FinancialRecord;
  policy: AgencyOperatingPolicy;
  now: GameDate;
  seasonLength?: number;
  focusRegionId?: string;
}): { finances: FinancialRecord; changed: boolean; error?: string } {
  if (input.finances.careerPath !== "independent") {
    return { finances: input.finances, changed: false, error: "Agency policy requires an independent career." };
  }
  if (!Object.hasOwn(AGENCY_POLICY_DEFINITIONS, input.policy)) {
    return { finances: input.finances, changed: false, error: "Unknown agency operating policy." };
  }
  const current = normalizeAgencyStrategyState(input.finances.agencyStrategyState);
  const nextFocusRegionId = input.focusRegionId?.trim() || undefined;
  if (
    current?.policy === input.policy
    && current.focusRegionId === nextFocusRegionId
  ) {
    return { finances: input.finances, changed: false };
  }
  if (current && !isGameDateAtOrAfter(input.now, current.lockedUntil)) {
    return {
      finances: input.finances,
      changed: false,
      error: `The current operating policy is committed until Season ${current.lockedUntil.season}, Week ${current.lockedUntil.week}.`,
    };
  }
  const strategy: AgencyStrategyState = {
    policy: input.policy,
    selectedAt: { ...input.now },
    lockedUntil: addGameWeeksWithSeasonLength(
      input.now,
      4,
      input.seasonLength ?? LEGACY_SEASON_LENGTH_WEEKS,
    ),
    ...(nextFocusRegionId ? { focusRegionId: nextFocusRegionId } : {}),
  };
  return {
    finances: { ...input.finances, agencyStrategyState: strategy },
    changed: true,
  };
}

/** Apply the chosen operating policy once per simulated week. */
export function processAgencyOperatingPolicyWeek(
  finances: FinancialRecord,
  now: GameDate,
): AgencyPolicyWeekResult {
  const strategy = normalizeAgencyStrategyState(finances.agencyStrategyState);
  if (!strategy || finances.careerPath !== "independent") {
    return { finances, changed: false, operatingCost: 0 };
  }
  if (
    strategy.lastAppliedAt?.week === now.week
    && strategy.lastAppliedAt.season === now.season
  ) {
    return { finances, changed: false, operatingCost: 0, policy: strategy.policy };
  }
  const modifiers = getAgencyPolicyWeeklyModifiers(strategy.policy);
  return {
    finances: {
      ...finances,
      clientRelationships: finances.clientRelationships.map((relationship) =>
        relationship.status === "active"
          ? {
              ...relationship,
              satisfaction: clamp(
                relationship.satisfaction + modifiers.clientSatisfactionDelta,
                0,
                100,
              ),
            }
          : relationship,
      ),
      employees: finances.employees.map((employee) => ({
        ...employee,
        morale: clamp(employee.morale + modifiers.employeeMoraleDelta, 0, 100),
        fatigue: clamp(employee.fatigue + modifiers.employeeFatigueDelta, 0, 100),
      })),
      agencyStrategyState: {
        ...strategy,
        lastAppliedAt: { ...now },
      },
    },
    changed: true,
    operatingCost: modifiers.weeklyOperatingCost,
    policy: strategy.policy,
  };
}

function runwayWeeksFromMonths(runwayMonths: number | null): number | null {
  if (runwayMonths === null) return null;
  return Math.round(runwayMonths * (52 / 12) * 10) / 10;
}

function staffFragilityScore(finances: FinancialRecord, scout: Scout): number {
  const employees = finances.employees ?? [];
  if (employees.length === 0) return 0;
  const eventPressure = (finances.pendingEmployeeEvents ?? []).length * 12;
  const moralePressure = employees.reduce((sum, employee) => sum + Math.max(0, 50 - employee.morale), 0);
  const underpaid = employees.reduce((sum, employee) => sum + Math.max(0, 60 - (employee.paySatisfaction ?? scout.reputation)), 0);
  return clamp(Math.round((eventPressure + moralePressure + underpaid) / employees.length), 0, 100);
}

function dominantRiskFrom(
  runwayWeeks: number | null,
  clientConcentration: number,
  capacityUtilization: number,
  qualityDebt: number,
  staffFragility: number,
): AgencyStrategicPressure["dominantRisk"] {
  const scored: Array<[AgencyStrategicPressure["dominantRisk"], number]> = [
    ["runway", runwayWeeks !== null && runwayWeeks < 10 ? 100 - runwayWeeks * 6 : 0],
    ["concentration", Math.round(clientConcentration * 100)],
    ["capacity", Math.round(Math.max(0, capacityUtilization - 0.85) * 100)],
    ["qualityDebt", qualityDebt],
    ["staffFragility", staffFragility],
  ];
  const best = scored.sort((left, right) => right[1] - left[1])[0];
  return best[1] >= 35 ? best[0] : "balanced";
}

export function describeAgencyPolicy(
  policy: AgencyOperatingPolicy,
): AgencyPolicyEffect {
  const definition = getAgencyOperatingPolicyDefinition(policy);
  return {
    policy,
    benefits: definition.benefits,
    tradeoffs: definition.tradeoffs,
    recommendedWhen: definition.recommendedWhen,
  };
}

export function deriveAgencyStrategicPressure(
  finances: FinancialRecord,
  scout: Scout,
  preferredPolicy?: AgencyOperatingPolicy,
): AgencyStrategicPressure {
  const health = deriveAgencyStrategicHealth(finances, scout);
  const runwayWeeks = runwayWeeksFromMonths(health.runwayMonths);
  const clientConcentration = health.clientConcentration;
  const capacityUtilization = clamp(
    health.effectiveMonthlyCapacity > 0
      ? health.committedWork / health.effectiveMonthlyCapacity
      : health.committedWork > 0 ? 2 : 0,
    0,
    2,
  );
  const qualityDebt = health.qualityDebt;
  const staffFragility = staffFragilityScore(finances, scout);
  const dominantRisk = dominantRiskFrom(
    runwayWeeks,
    clientConcentration,
    capacityUtilization,
    qualityDebt,
    staffFragility,
  );

  const suggestedPolicy = preferredPolicy ?? (
    dominantRisk === "runway"
      ? "runwayDefense"
      : dominantRisk === "concentration"
        ? "clientDiversification"
        : dominantRisk === "capacity" || dominantRisk === "qualityDebt" || dominantRisk === "staffFragility"
          ? "qualityDiscipline"
          : clientConcentration > 0.55
            ? "marketExpansion"
            : runwayWeeks !== null && runwayWeeks >= 16
              ? "placementUpside"
              : "balancedBook"
  );

  return {
    runwayWeeks,
    clientConcentration: Math.round(clientConcentration * 100) / 100,
    capacityUtilization: Math.round(capacityUtilization * 100) / 100,
    revenueAtRisk: calculateAgencyHealth(finances, scout).revenueAtRisk,
    qualityDebt,
    staffFragility,
    dominantRisk,
    suggestedPolicy,
    policyEffect: describeAgencyPolicy(suggestedPolicy),
  };
}
