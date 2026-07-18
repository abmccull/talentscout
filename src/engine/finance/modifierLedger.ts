import type {
  FinancialRecord,
  ScoutingInfrastructure,
  ToolId,
} from "@/engine/core/types";
import {
  ALL_EQUIPMENT_SLOTS,
  getEquipmentItem,
  type EquipmentEffect,
  type EquipmentEffectType,
} from "./equipmentCatalog";
import { calculateInfrastructureEffects } from "./scoutingInvestment";
import {
  getToolDefinition,
  getToolPassiveBonus,
  type ToolPassiveBonus,
} from "@/engine/tools/unlockables";

export type ModifierLedgerStatus = "active" | "conditional" | "inactive";

export interface AgencyModifierLedgerEntry {
  id: string;
  source: string;
  effect: string;
  formula: string;
  currentValue: string;
  affectedActions: string[];
  status: ModifierLedgerStatus;
}

export interface AgencyModifierLedgerInput {
  scoutingInfrastructure?: ScoutingInfrastructure;
  finances: Pick<FinancialRecord, "office" | "satelliteOffices" | "equipment">;
  /** Career milestone tools are projected here alongside purchased systems. */
  unlockedTools?: ToolId[];
}

const TOOL_EFFECT_PRESENTATION: Record<
  keyof ToolPassiveBonus,
  { effect: string; affectedActions: string[]; conditional?: string }
> = {
  fatigueReduction: {
    effect: "Report-writing stamina",
    affectedActions: ["Scheduled report-writing blocks"],
    conditional: "Applies in weeks where report work is scheduled.",
  },
  accuracyBonus: {
    effect: "Data-reading precision",
    affectedActions: ["Database queries", "Statistical evidence"],
  },
  confidenceBonus: {
    effect: "Video evidence confidence",
    affectedActions: ["Video observations"],
  },
  relationshipGainBonus: {
    effect: "Relationship development",
    affectedActions: ["Contact meetings", "Network development"],
  },
  travelFatigueReduction: {
    effect: "Travel fatigue",
    affectedActions: ["Domestic and international travel"],
  },
  workflowFatigueReduction: {
    effect: "Busy-week organisation",
    affectedActions: ["Weeks containing at least three work blocks"],
    conditional: "Applies only in a genuinely busy week.",
  },
  youthDiscoveryBonus: {
    effect: "Youth search coverage",
    affectedActions: ["Eligible youth venue searches"],
  },
  trendHistoryDepth: {
    effect: "Long-term observation history",
    affectedActions: ["Tracked-player development view"],
  },
};

function toolBonusValue(key: keyof ToolPassiveBonus, value: number): string {
  if (
    key === "accuracyBonus"
    || key === "confidenceBonus"
    || key === "relationshipGainBonus"
    || key === "travelFatigueReduction"
  ) {
    const sign = key === "travelFatigueReduction" ? "-" : "+";
    return `${sign}${Math.round(value * 100)}%`;
  }
  if (key === "trendHistoryDepth") return `${value} seasons visible`;
  if (key === "youthDiscoveryBonus") return `+${value} candidate per eligible search`;
  return `${value > 0 ? "-" : "+"}${Math.abs(value)} fatigue`;
}

function buildToolLedgerEntries(unlockedTools: ToolId[]): AgencyModifierLedgerEntry[] {
  return unlockedTools.flatMap((toolId) => {
    const definition = getToolDefinition(toolId);
    const bonus = getToolPassiveBonus(toolId);
    return (Object.entries(bonus) as [keyof ToolPassiveBonus, number][]).map(
      ([key, value]) => {
        const presentation = TOOL_EFFECT_PRESENTATION[key];
        return {
          id: `career-tool-${toolId}-${key}`,
          source: definition?.name ?? toolId,
          effect: presentation.effect,
          formula: presentation.conditional ?? "Applies while this career tool is unlocked.",
          currentValue: toolBonusValue(key, value),
          affectedActions: presentation.affectedActions,
          status: presentation.conditional ? "conditional" as const : "active" as const,
        };
      },
    );
  });
}

const PERCENT_EFFECTS = new Set<EquipmentEffectType>([
  "observationConfidence",
  "videoConfidence",
  "dataAccuracy",
  "reportQuality",
  "travelCostReduction",
  "relationshipGainBonus",
  "intelReliabilityBonus",
  "youthDiscoveryBonus",
  "gutFeelingBonus",
  "familiarityGainBonus",
  "paEstimateAccuracy",
  "systemFitAccuracy",
  "anomalyDetectionRate",
  "predictionAccuracy",
  "valuationAccuracy",
]);

const EQUIPMENT_EFFECT_LABELS: Record<EquipmentEffectType, string> = {
  observationConfidence: "Observation confidence",
  videoConfidence: "Video evidence confidence",
  dataAccuracy: "Data evidence accuracy",
  reportQuality: "Report craft quality",
  fatigueReduction: "Activity fatigue reduction",
  travelCostReduction: "Travel cost reduction",
  travelSlotReduction: "Travel time reduction",
  relationshipGainBonus: "Relationship gain",
  intelReliabilityBonus: "Contact-intel reliability",
  youthDiscoveryBonus: "Youth discovery chance",
  gutFeelingBonus: "Gut-feeling trigger rate",
  attributesPerSession: "Attributes observed per session",
  familiarityGainBonus: "Regional familiarity gain",
  paEstimateAccuracy: "Potential-estimate precision",
  systemFitAccuracy: "System-fit precision",
  anomalyDetectionRate: "Anomaly detection rate",
  predictionAccuracy: "Prediction accuracy",
  valuationAccuracy: "Valuation precision",
};

const EQUIPMENT_ACTIONS: Record<EquipmentEffectType, string[]> = {
  observationConfidence: ["Live and venue observations"],
  videoConfidence: ["Video observations"],
  dataAccuracy: ["Database and analyst work"],
  reportQuality: ["Filed reports"],
  fatigueReduction: ["Listed activity types"],
  travelCostReduction: ["Travel bookings"],
  travelSlotReduction: ["Travel bookings"],
  relationshipGainBonus: ["Contact meetings"],
  intelReliabilityBonus: ["Contact intelligence"],
  youthDiscoveryBonus: ["Youth discovery activities"],
  gutFeelingBonus: ["Youth observation reactions"],
  attributesPerSession: ["Observation sessions"],
  familiarityGainBonus: ["Regional fieldwork"],
  paEstimateAccuracy: ["Potential estimates"],
  systemFitAccuracy: ["First-team fit reports"],
  anomalyDetectionRate: ["Data anomaly scans"],
  predictionAccuracy: ["Data predictions"],
  valuationAccuracy: ["Market valuation estimates"],
};

function signedPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${Math.round(value * 100)}%`;
}

function equipmentValue(type: EquipmentEffectType, value: number): string {
  if (PERCENT_EFFECTS.has(type)) return signedPercent(value);
  return `${value >= 0 ? "+" : ""}${value}`;
}

interface AggregatedEquipmentEffect {
  type: EquipmentEffectType;
  homeRegionOnly: boolean;
  value: number;
  sources: string[];
  activityTypes: string[];
}

function aggregateEquipmentEffects(
  equipment: FinancialRecord["equipment"],
): AggregatedEquipmentEffect[] {
  if (!equipment) return [];
  const aggregated = new Map<string, AggregatedEquipmentEffect>();
  for (const slot of ALL_EQUIPMENT_SLOTS) {
    const item = getEquipmentItem(equipment.loadout[slot]);
    if (!item) continue;
    for (const effect of item.effects) {
      const key = `${effect.type}:${effect.homeRegionOnly === true ? "home" : "global"}`;
      const current = aggregated.get(key) ?? {
        type: effect.type,
        homeRegionOnly: effect.homeRegionOnly === true,
        value: 0,
        sources: [],
        activityTypes: [],
      };
      current.value += effect.value;
      current.sources = [...new Set([...current.sources, item.name])];
      current.activityTypes = [
        ...new Set([...current.activityTypes, ...(effect.activityTypes ?? [])]),
      ];
      aggregated.set(key, current);
    }
  }
  return [...aggregated.values()];
}

/** Build the one player-facing ledger for agency investment modifiers. */
export function buildAgencyModifierLedger(
  input: AgencyModifierLedgerInput,
): AgencyModifierLedgerEntry[] {
  const infrastructure = calculateInfrastructureEffects(input.scoutingInfrastructure);
  const entries: AgencyModifierLedgerEntry[] = [
    {
      id: "infrastructure-data",
      source: `Data subscription (${input.scoutingInfrastructure?.dataSubscription ?? "none"})`,
      effect: "Data evidence quality",
      formula: "Improves the confidence of data work while the subscription is active.",
      currentValue: signedPercent(infrastructure.dataQualityBonus),
      affectedActions: ["Database queries", "Stats briefings", "Deep video", "Analyst evidence"],
      status: infrastructure.dataQualityBonus > 0 ? "active" : "inactive",
    },
    {
      id: "infrastructure-travel",
      source: `Travel budget (${input.scoutingInfrastructure?.travelBudget ?? "economy"})`,
      effect: "Travel fatigue",
      formula: "Reduces fatigue added by each travel block.",
      currentValue: infrastructure.travelFatigueMultiplier < 1
        ? `-${Math.round((1 - infrastructure.travelFatigueMultiplier) * 100)}%`
        : "No reduction",
      affectedActions: ["Domestic and international travel"],
      status: infrastructure.travelFatigueMultiplier < 1 ? "active" : "inactive",
    },
    {
      id: "infrastructure-report",
      source: `Office equipment (${input.scoutingInfrastructure?.officeEquipment ?? "basic"})`,
      effect: "Scout report craft",
      formula: "Supports the craft of reports you personally author and submit.",
      currentValue: signedPercent(infrastructure.reportQualityBonus),
      affectedActions: ["Authored report submissions"],
      status: infrastructure.reportQualityBonus > 0 ? "active" : "inactive",
    },
    {
      id: "agency-office",
      source: `Agency office (${input.finances.office.tier})`,
      effect: "Staff work quality",
      formula: "Improves the clarity of reviewable leads prepared by headquarters staff.",
      currentValue: `+${Math.round(input.finances.office.qualityBonus * 100)} points`,
      affectedActions: ["Headquarters staff work"],
      status: input.finances.office.qualityBonus > 0 ? "active" : "inactive",
    },
  ];

  for (const office of input.finances.satelliteOffices) {
    const staffed = office.employeeIds.length > 0;
    entries.push({
      id: `satellite-office-${office.id}`,
      source: `Satellite office (${office.region})`,
      effect: "Local staff quality and route access",
      formula: "Supports assigned staff and keeps a staffed regional route available.",
      currentValue: staffed
        ? `+${Math.round(office.qualityBonus * 100)} points; staffed route active`
        : "Awaiting assigned staff",
      affectedActions: ["Assigned staff work", "Regional access", "Travel planning", "Passive knowledge"],
      status: staffed ? "active" : "conditional",
    });
  }

  for (const effect of aggregateEquipmentEffects(input.finances.equipment)) {
    entries.push({
      id: `equipment-${effect.type}-${effect.homeRegionOnly ? "home" : "global"}`,
      source: effect.sources.join(" + "),
      effect: EQUIPMENT_EFFECT_LABELS[effect.type],
      formula: effect.homeRegionOnly
        ? "Applies only when the work takes place in your home country."
        : "Applies while this item is equipped.",
      currentValue: equipmentValue(effect.type, effect.value),
      affectedActions: effect.activityTypes.length > 0
        ? effect.activityTypes
        : EQUIPMENT_ACTIONS[effect.type],
      status: effect.homeRegionOnly ? "conditional" : "active",
    });
  }

  entries.push(...buildToolLedgerEntries(input.unlockedTools ?? []));

  return entries;
}
