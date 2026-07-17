import type {
  FinancialRecord,
  ScoutingInfrastructure,
} from "@/engine/core/types";
import {
  ALL_EQUIPMENT_SLOTS,
  getEquipmentItem,
  type EquipmentEffect,
  type EquipmentEffectType,
} from "./equipmentCatalog";
import { calculateInfrastructureEffects } from "./scoutingInvestment";

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
      formula: "Base evidence × (1 + subscription bonus)",
      currentValue: signedPercent(infrastructure.dataQualityBonus),
      affectedActions: ["Database queries", "Stats briefings", "Deep video", "Analyst evidence"],
      status: infrastructure.dataQualityBonus > 0 ? "active" : "inactive",
    },
    {
      id: "infrastructure-travel",
      source: `Travel budget (${input.scoutingInfrastructure?.travelBudget ?? "economy"})`,
      effect: "Travel fatigue",
      formula: "Base travel fatigue × tier multiplier",
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
      formula: "Report craft + equipment tier bonus",
      currentValue: signedPercent(infrastructure.reportQualityBonus),
      affectedActions: ["Manual and scheduled reports"],
      status: infrastructure.reportQualityBonus > 0 ? "active" : "inactive",
    },
    {
      id: "agency-office",
      source: `Agency office (${input.finances.office.tier})`,
      effect: "Employee report quality",
      formula: "Employee quality score + office bonus",
      currentValue: `+${Math.round(input.finances.office.qualityBonus * 100)} points`,
      affectedActions: ["Headquarters employee reports"],
      status: input.finances.office.qualityBonus > 0 ? "active" : "inactive",
    },
  ];

  for (const office of input.finances.satelliteOffices) {
    const staffed = office.employeeIds.length > 0;
    entries.push({
      id: `satellite-office-${office.id}`,
      source: `Satellite office (${office.region})`,
      effect: "Local staff quality and route access",
      formula: "Assigned employee quality + office bonus; staffed route −1 travel slot",
      currentValue: staffed
        ? `+${Math.round(office.qualityBonus * 100)} points; staffed route active`
        : "Awaiting assigned staff",
      affectedActions: ["Assigned employee reports", "Regional access", "Travel planning", "Passive knowledge"],
      status: staffed ? "active" : "conditional",
    });
  }

  for (const effect of aggregateEquipmentEffects(input.finances.equipment)) {
    entries.push({
      id: `equipment-${effect.type}-${effect.homeRegionOnly ? "home" : "global"}`,
      source: effect.sources.join(" + "),
      effect: EQUIPMENT_EFFECT_LABELS[effect.type],
      formula: effect.homeRegionOnly
        ? "Equipped values add only when work country = scout home country"
        : "Active equipped values add together",
      currentValue: equipmentValue(effect.type, effect.value),
      affectedActions: effect.activityTypes.length > 0
        ? effect.activityTypes
        : EQUIPMENT_ACTIONS[effect.type],
      status: effect.homeRegionOnly ? "conditional" : "active",
    });
  }

  return entries;
}
