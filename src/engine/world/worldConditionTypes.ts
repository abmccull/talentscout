export type WorldConditionScope = "global" | "regional";

export interface WorldConditionModifiers {
  discoveryMultiplier: number;
  observationConfidenceMultiplier: number;
  opportunityMultiplier: number;
  developmentMultiplier: number;
  breakthroughMultiplier: number;
  recruitmentScoreAdjustment: number;
  travelCostMultiplier: number;
  travelDurationDelta: number;
  travelFatigueMultiplier: number;
  marketplaceValueMultiplier: number;
  rivalPressureMultiplier: number;
  /** Auditable one-off cash movement when the season opens. */
  seasonalFinanceAdjustment: number;
}

/** A resolved, save-stable world condition instance. */
export interface WorldConditionInstance {
  id: string;
  definitionId: string;
  scope: WorldConditionScope;
  season: number;
  countryId?: string;
  modifiers: WorldConditionModifiers;
}
