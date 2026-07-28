export type DataSubscriptionTier = "none" | "basic" | "premium" | "elite";

export type TravelBudgetTier = "economy" | "standard" | "business";

export type OfficeEquipmentTier = "basic" | "upgraded" | "professional";

export interface ScoutingInfrastructure {
  dataSubscription: DataSubscriptionTier;
  travelBudget: TravelBudgetTier;
  officeEquipment: OfficeEquipmentTier;
  investmentCosts: { weekly: number; oneTime: number };
}

export interface AssistantScout {
  id: string;
  name: string;
  skill: number;
  salary: number;
  assignedPlayerId?: string;
  assignedRegion?: string;
  fatigue: number;
  reportsCompleted: number;
  morale?: number;
  lowMorale?: boolean;
}

export type TripQualityLevel = "budget" | "standard" | "premium";

export interface TripQuality {
  level: TripQualityLevel;
  costMultiplier: number;
  fatigueMultiplier: number;
  observationBonus: number;
}

export interface InfrastructureEffects {
  dataQualityBonus: number;
  travelFatigueMultiplier: number;
  reportQualityBonus: number;
  weeklyCost: number;
}
