/**
 * Scouting Infrastructure Investment System (F14)
 *
 * Manages upgrades to data subscriptions, travel budgets, and office
 * equipment. Each tier provides passive bonuses to different aspects
 * of the scouting workflow (data quality, fatigue reduction, report quality).
 *
 * All functions are pure — no mutation, no I/O.
 */

import type {
  GameState,
  ScoutingInfrastructure,
  DataSubscriptionTier,
  TravelBudgetTier,
  OfficeEquipmentTier,
  InfrastructureEffects,
  TripQuality,
  TripQualityLevel,
} from "../core/types";

// =============================================================================
// CONSTANTS — PRICING & EFFECTS
// =============================================================================

/** One-time upgrade cost to reach each data subscription tier. */
const DATA_SUBSCRIPTION_COSTS: Record<DataSubscriptionTier, number> = {
  none: 0,
  basic: 500,
  premium: 2000,
  elite: 6000,
};

/** Weekly recurring cost for each data subscription tier. */
const DATA_SUBSCRIPTION_WEEKLY: Record<DataSubscriptionTier, number> = {
  none: 0,
  basic: 25,
  premium: 75,
  elite: 150,
};

/** Data quality bonus per tier (additive to observation accuracy). */
const DATA_SUBSCRIPTION_BONUS: Record<DataSubscriptionTier, number> = {
  none: 0,
  basic: 0.05,
  premium: 0.12,
  elite: 0.20,
};

/** One-time upgrade cost to reach each travel budget tier. */
const TRAVEL_BUDGET_COSTS: Record<TravelBudgetTier, number> = {
  economy: 0,
  standard: 1000,
  business: 4000,
};

/** Weekly recurring cost for each travel budget tier. */
const TRAVEL_BUDGET_WEEKLY: Record<TravelBudgetTier, number> = {
  economy: 0,
  standard: 30,
  business: 100,
};

/** Fatigue multiplier per travel budget tier (lower = less fatigue). */
const TRAVEL_BUDGET_FATIGUE: Record<TravelBudgetTier, number> = {
  economy: 1.0,
  standard: 0.8,
  business: 0.6,
};

/** One-time upgrade cost to reach each office equipment tier. */
const OFFICE_EQUIPMENT_COSTS: Record<OfficeEquipmentTier, number> = {
  basic: 0,
  upgraded: 1500,
  professional: 5000,
};

/** Weekly recurring cost for each office equipment tier. */
const OFFICE_EQUIPMENT_WEEKLY: Record<OfficeEquipmentTier, number> = {
  basic: 0,
  upgraded: 20,
  professional: 60,
};

/** Report quality bonus per office equipment tier. */
const OFFICE_EQUIPMENT_BONUS: Record<OfficeEquipmentTier, number> = {
  basic: 0,
  upgraded: 0.08,
  professional: 0.15,
};

/** Tier ordering for upgrade validation. */
const DATA_TIER_ORDER: DataSubscriptionTier[] = ["none", "basic", "premium", "elite"];
const TRAVEL_TIER_ORDER: TravelBudgetTier[] = ["economy", "standard", "business"];
const EQUIPMENT_TIER_ORDER: OfficeEquipmentTier[] = ["basic", "upgraded", "professional"];

/** Trip quality presets. */
export const TRIP_QUALITY_PRESETS: Record<TripQualityLevel, TripQuality> = {
  budget: { level: "budget", costMultiplier: 0.5, fatigueMultiplier: 1.5, observationBonus: -0.1 },
  standard: { level: "standard", costMultiplier: 1.0, fatigueMultiplier: 1.0, observationBonus: 0 },
  premium: { level: "premium", costMultiplier: 1.8, fatigueMultiplier: 0.6, observationBonus: 0.15 },
};

// =============================================================================
// DEFAULT INFRASTRUCTURE
// =============================================================================

/** Create default (no investment) infrastructure state. */
export function createDefaultInfrastructure(): ScoutingInfrastructure {
  return {
    dataSubscription: "none",
    travelBudget: "economy",
    officeEquipment: "basic",
    investmentCosts: { weekly: 0, oneTime: 0 },
  };
}

// =============================================================================
// UPGRADE FUNCTIONS
// =============================================================================

/**
 * Purchase a data subscription upgrade.
 * Returns updated GameState or null if the player cannot afford it
 * or the tier is not an upgrade.
 */
export function purchaseDataSubscription(
  state: GameState,
  tier: DataSubscriptionTier,
): GameState | null {
  if (!state.finances) return null;

  const infra = state.scoutingInfrastructure ?? createDefaultInfrastructure();
  const currentIndex = DATA_TIER_ORDER.indexOf(infra.dataSubscription);
  const targetIndex = DATA_TIER_ORDER.indexOf(tier);

  // Must be an upgrade, not a downgrade or same tier
  if (targetIndex <= currentIndex) return null;

  const cost = DATA_SUBSCRIPTION_COSTS[tier];
  if (state.finances.balance < cost) return null;

  const newInfra: ScoutingInfrastructure = {
    ...infra,
    dataSubscription: tier,
    investmentCosts: {
      weekly: DATA_SUBSCRIPTION_WEEKLY[tier] +
        TRAVEL_BUDGET_WEEKLY[infra.travelBudget] +
        OFFICE_EQUIPMENT_WEEKLY[infra.officeEquipment],
      oneTime: infra.investmentCosts.oneTime + cost,
    },
  };

  const transaction = {
    week: state.currentWeek,
    season: state.currentSeason,
    amount: -cost,
    description: `Data subscription upgrade: ${tier}`,
  };

  return {
    ...state,
    scoutingInfrastructure: newInfra,
    finances: {
      ...state.finances,
      balance: state.finances.balance - cost,
      transactions: [...state.finances.transactions, transaction],
    },
  };
}

/**
 * Upgrade the travel budget tier.
 * Returns updated GameState or null if insufficient funds or invalid upgrade.
 */
export function upgradeTravelBudget(
  state: GameState,
  tier: TravelBudgetTier,
): GameState | null {
  if (!state.finances) return null;

  const infra = state.scoutingInfrastructure ?? createDefaultInfrastructure();
  const currentIndex = TRAVEL_TIER_ORDER.indexOf(infra.travelBudget);
  const targetIndex = TRAVEL_TIER_ORDER.indexOf(tier);

  if (targetIndex <= currentIndex) return null;

  const cost = TRAVEL_BUDGET_COSTS[tier];
  if (state.finances.balance < cost) return null;

  const newInfra: ScoutingInfrastructure = {
    ...infra,
    travelBudget: tier,
    investmentCosts: {
      weekly: DATA_SUBSCRIPTION_WEEKLY[infra.dataSubscription] +
        TRAVEL_BUDGET_WEEKLY[tier] +
        OFFICE_EQUIPMENT_WEEKLY[infra.officeEquipment],
      oneTime: infra.investmentCosts.oneTime + cost,
    },
  };

  const transaction = {
    week: state.currentWeek,
    season: state.currentSeason,
    amount: -cost,
    description: `Travel budget upgrade: ${tier}`,
  };

  return {
    ...state,
    scoutingInfrastructure: newInfra,
    finances: {
      ...state.finances,
      balance: state.finances.balance - cost,
      transactions: [...state.finances.transactions, transaction],
    },
  };
}

/**
 * Upgrade office equipment tier.
 * Returns updated GameState or null if insufficient funds or invalid upgrade.
 */
export function upgradeOfficeEquipment(
  state: GameState,
  tier: OfficeEquipmentTier,
): GameState | null {
  if (!state.finances) return null;

  const infra = state.scoutingInfrastructure ?? createDefaultInfrastructure();
  const currentIndex = EQUIPMENT_TIER_ORDER.indexOf(infra.officeEquipment);
  const targetIndex = EQUIPMENT_TIER_ORDER.indexOf(tier);

  if (targetIndex <= currentIndex) return null;

  const cost = OFFICE_EQUIPMENT_COSTS[tier];
  if (state.finances.balance < cost) return null;

  const newInfra: ScoutingInfrastructure = {
    ...infra,
    officeEquipment: tier,
    investmentCosts: {
      weekly: DATA_SUBSCRIPTION_WEEKLY[infra.dataSubscription] +
        TRAVEL_BUDGET_WEEKLY[infra.travelBudget] +
        OFFICE_EQUIPMENT_WEEKLY[tier],
      oneTime: infra.investmentCosts.oneTime + cost,
    },
  };

  const transaction = {
    week: state.currentWeek,
    season: state.currentSeason,
    amount: -cost,
    description: `Office equipment upgrade: ${tier}`,
  };

  return {
    ...state,
    scoutingInfrastructure: newInfra,
    finances: {
      ...state.finances,
      balance: state.finances.balance - cost,
      transactions: [...state.finances.transactions, transaction],
    },
  };
}

// =============================================================================
// EFFECTS CALCULATION
// =============================================================================

/**
 * Aggregate all passive bonuses from the current infrastructure investments
 * into a single effects object that can be consumed by observation, report,
 * and travel systems.
 */
export function calculateInfrastructureEffects(
  infrastructure: ScoutingInfrastructure | undefined,
): InfrastructureEffects {
  if (!infrastructure) {
    return {
      dataQualityBonus: 0,
      travelFatigueMultiplier: 1.0,
      reportQualityBonus: 0,
      weeklyCost: 0,
    };
  }

  return {
    dataQualityBonus: DATA_SUBSCRIPTION_BONUS[infrastructure.dataSubscription],
    travelFatigueMultiplier: TRAVEL_BUDGET_FATIGUE[infrastructure.travelBudget],
    reportQualityBonus: OFFICE_EQUIPMENT_BONUS[infrastructure.officeEquipment],
    weeklyCost:
      DATA_SUBSCRIPTION_WEEKLY[infrastructure.dataSubscription] +
      TRAVEL_BUDGET_WEEKLY[infrastructure.travelBudget] +
      OFFICE_EQUIPMENT_WEEKLY[infrastructure.officeEquipment],
  };
}

/**
 * Process weekly infrastructure costs — deducts the weekly maintenance
 * cost from the scout's balance. Should be called each week.
 */
export function processWeeklyInfrastructureCosts(
  state: GameState,
): GameState {
  const infra = state.scoutingInfrastructure;
  if (!infra || !state.finances) return state;

  const effects = calculateInfrastructureEffects(infra);
  if (effects.weeklyCost <= 0) return state;

  const transaction = {
    week: state.currentWeek,
    season: state.currentSeason,
    amount: -effects.weeklyCost,
    description: "Infrastructure maintenance",
  };

  return {
    ...state,
    finances: {
      ...state.finances,
      balance: state.finances.balance - effects.weeklyCost,
      transactions: [...state.finances.transactions, transaction],
    },
  };
}

/**
 * Get the trip quality preset for a given level.
 */
export function getTripQuality(level: TripQualityLevel): TripQuality {
  return TRIP_QUALITY_PRESETS[level];
}

// =============================================================================
// COST QUERY HELPERS
// =============================================================================

/** Get the one-time cost to upgrade to a data subscription tier. */
export function getDataSubscriptionCost(tier: DataSubscriptionTier): number {
  return DATA_SUBSCRIPTION_COSTS[tier];
}

/** Get the weekly cost for a data subscription tier. */
export function getDataSubscriptionWeekly(tier: DataSubscriptionTier): number {
  return DATA_SUBSCRIPTION_WEEKLY[tier];
}

/** Get the one-time cost to upgrade to a travel budget tier. */
export function getTravelBudgetCost(tier: TravelBudgetTier): number {
  return TRAVEL_BUDGET_COSTS[tier];
}

/** Get the weekly cost for a travel budget tier. */
export function getTravelBudgetWeekly(tier: TravelBudgetTier): number {
  return TRAVEL_BUDGET_WEEKLY[tier];
}

/** Get the one-time cost to upgrade to an office equipment tier. */
export function getOfficeEquipmentCost(tier: OfficeEquipmentTier): number {
  return OFFICE_EQUIPMENT_COSTS[tier];
}

/** Get the weekly cost for an office equipment tier. */
export function getOfficeEquipmentWeekly(tier: OfficeEquipmentTier): number {
  return OFFICE_EQUIPMENT_WEEKLY[tier];
}

/** Get the data quality bonus for a tier. */
export function getDataSubscriptionBonus(tier: DataSubscriptionTier): number {
  return DATA_SUBSCRIPTION_BONUS[tier];
}

/** Get the fatigue multiplier for a travel budget tier. */
export function getTravelBudgetFatigue(tier: TravelBudgetTier): number {
  return TRAVEL_BUDGET_FATIGUE[tier];
}

/** Get the report quality bonus for an office equipment tier. */
export function getOfficeEquipmentBonus(tier: OfficeEquipmentTier): number {
  return OFFICE_EQUIPMENT_BONUS[tier];
}
