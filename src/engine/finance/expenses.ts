/**
 * Financial pressure system for TalentScout.
 *
 * Models the scout's income, monthly expenses, equipment upgrades, and
 * solvency state. All functions are pure — no mutation, no I/O.
 *
 * Currency unit: game currency (integer-precision; no floating-point cash).
 * "Monthly" cycle: every 4 weeks a paycheck arrives and expenses are deducted.
 */

import type {
  Scout,
  FinancialRecord,
  ExpenseType,
  CareerTier,
  CareerPath,
  LifestyleConfig,
  Office,
} from "../core/types";
import { getEquipmentMonthlyTotal } from "./equipmentBonuses";
import { DEFAULT_LOADOUT, DEFAULT_OWNED_ITEMS } from "./equipmentCatalog";
import type { EquipmentInventory } from "./equipmentCatalog";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Equipment upgrade costs indexed by the level being purchased (2–5). */
const EQUIPMENT_UPGRADE_COSTS: Record<number, number> = {
  2: 500,
  3: 1500,
  4: 4000,
  5: 10000,
};

/** Maximum equipment level. */
const MAX_EQUIPMENT_LEVEL = 5;

/** Balance floor below which the scout is considered broke. */
const BROKE_THRESHOLD = -500;

/**
 * Accuracy bonus granted by each equipment level.
 * Index 0 is unused; level 1 = index 1, etc.
 */
const EQUIPMENT_OBSERVATION_BONUSES: readonly number[] = [
  0,     // (unused placeholder)
  0,     // level 1
  0.02,  // level 2
  0.05,  // level 3
  0.08,  // level 4
  0.12,  // level 5
];

/**
 * Base monthly rent cost per career tier.
 * Tier 1 (freelance, home office) → lowest; tier 5 (sporting director) → highest.
 */
const TIER_RENT: Record<CareerTier, number> = {
  1: 200,
  2: 350,
  3: 500,
  4: 650,
  5: 800,
};

/**
 * Base monthly travel cost per career tier.
 * Higher tiers attend more matches and travel to wider territories.
 */
const TIER_TRAVEL_BASE: Record<CareerTier, number> = {
  1: 100,
  2: 175,
  3: 250,
  4: 325,
  5: 400,
};

/**
 * Monthly subscription cost per equipment level.
 * Covers data services, video platforms, scouting databases, etc.
 */
const EQUIPMENT_SUBSCRIPTION_COST: Record<number, number> = {
  1: 50,
  2: 75,
  3: 100,
  4: 150,
  5: 200,
};

/** Flat "other" monthly expense (minor incidentals). */
const FLAT_OTHER_EXPENSE = 50;

/**
 * NPC salary cost band per scout managed.
 * At tier 4 the cost is lower (junior scouts); tier 5 is higher (senior network).
 */
const NPC_SALARY_PER_SCOUT: Record<4 | 5, number> = {
  4: 500,
  5: 2000,
};

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Create a starting FinancialRecord for a scout based on their career tier.
 *
 * Tier 1 scouts start with a balance of 500 and a monthly income derived from
 * their salary. Equipment begins at level 1 (no bonus). The expense record is
 * populated with initial estimates for the first month.
 */
export function initializeFinances(scout: Scout, careerPath?: CareerPath): FinancialRecord {
  const monthlyIncome = scout.salary * 4; // weekly salary × 4 weeks
  const path = careerPath ?? scout.careerPath ?? "club";

  const defaultEquipment: EquipmentInventory = {
    ownedItems: [...DEFAULT_OWNED_ITEMS],
    loadout: { ...DEFAULT_LOADOUT },
  };

  const lifestyle = defaultLifestyleForTier(scout.careerTier);
  const office: Office = { tier: "home", monthlyCost: 0, qualityBonus: 0, maxEmployees: 0 };

  // Build a temporary record so we can calculate initial expenses
  const stub: FinancialRecord = {
    balance: 500,
    monthlyIncome,
    expenses: emptyExpenses(),
    equipmentLevel: 1,
    transactions: [],
    equipment: defaultEquipment,
    careerPath: path,
    independentTier: path === "independent" ? 1 : undefined,
    reportSalesRevenue: 0,
    placementFeeRevenue: 0,
    retainerRevenue: 0,
    consultingRevenue: 0,
    sellOnRevenue: 0,
    bonusRevenue: 0,
    retainerContracts: [],
    activeLoan: undefined,
    placementFeeRecords: [],
    reportListings: [],
    consultingContracts: [],
    office,
    employees: [],
    lifestyle,
    completedCourses: [],
    activeEnrollment: undefined,
    ownedVehicle: undefined,
    marketTemperature: "normal",
    activeEconomicEvents: [],
  };

  const expenses = calculateMonthlyExpenses(scout, stub);

  return { ...stub, expenses };
}

function defaultLifestyleForTier(tier: CareerTier): LifestyleConfig {
  const configs: Record<CareerTier, LifestyleConfig> = {
    1: { level: 1, monthlyCost: 200, networkingBonus: 0, salaryOfferBonus: 0 },
    2: { level: 2, monthlyCost: 500, networkingBonus: 0.05, salaryOfferBonus: 0 },
    3: { level: 3, monthlyCost: 1000, networkingBonus: 0.10, salaryOfferBonus: 0.05 },
    4: { level: 4, monthlyCost: 2000, networkingBonus: 0.15, salaryOfferBonus: 0.10 },
    5: { level: 5, monthlyCost: 5000, networkingBonus: 0.20, salaryOfferBonus: 0.15 },
  };
  return configs[tier];
}

/**
 * Calculate the breakdown of monthly expenses for the scout.
 *
 * Returns a full `Record<ExpenseType, number>` so every key is always present.
 * Equipment expenses are always 0 here — equipment is a one-time purchase,
 * not a recurring monthly line item.
 */
export function calculateMonthlyExpenses(
  scout: Scout,
  finances: FinancialRecord,
): Record<ExpenseType, number> {
  const tier = scout.careerTier;

  // --- Rent ---
  const rent = TIER_RENT[tier];

  // --- Travel ---
  // Extra travel cost when the scout has an active international booking.
  const travelBase = TIER_TRAVEL_BASE[tier];
  const travelSurcharge = scout.travelBooking?.isAbroad ? 100 : 0;
  const travel = travelBase + travelSurcharge;

  // --- Subscriptions ---
  // If the new equipment loadout exists, use its monthly total; otherwise fall back to old system.
  const subscriptions = finances.equipment
    ? getEquipmentMonthlyTotal(finances.equipment.loadout)
    : (EQUIPMENT_SUBSCRIPTION_COST[finances.equipmentLevel] ?? EQUIPMENT_SUBSCRIPTION_COST[1]);

  // --- Equipment (one-time only; recurring = 0) ---
  const equipment = 0;

  // --- NPC salaries (tier 4+) ---
  let npcSalaries = 0;
  if (tier >= 4) {
    const npcCount = scout.npcScoutIds.length;
    if (npcCount > 0) {
      const salaryPerScout = tier === 5 ? NPC_SALARY_PER_SCOUT[5] : NPC_SALARY_PER_SCOUT[4];
      npcSalaries = npcCount * salaryPerScout;
    }
  }

  // --- Other ---
  const other = FLAT_OTHER_EXPENSE;

  // --- Lifestyle (overrides rent for revamped saves) ---
  const lifestyle = finances.lifestyle ? finances.lifestyle.monthlyCost : 0;

  // --- Office cost (independent path) ---
  const officeCost = finances.office ? finances.office.monthlyCost : 0;

  // --- Employee salaries (agency) ---
  const employeeSalaries = finances.employees
    ? finances.employees.reduce((sum, e) => sum + e.salary, 0)
    : 0;

  // --- Marketing spend (agency) ---
  const marketing = 0; // Set via setMarketingSpend action

  // --- Loan payment ---
  const loanPayment = finances.activeLoan ? finances.activeLoan.monthlyPayment : 0;

  // --- Course fees ---
  const courseFees = 0; // One-time deduction at enrollment, not recurring

  // --- Insurance (scales with agency size) ---
  const insurance = finances.employees && finances.employees.length > 0
    ? Math.round(finances.employees.length * 50)
    : 0;

  return {
    rent,
    travel,
    subscriptions,
    equipment,
    npcSalaries,
    other,
    lifestyle,
    officeCost,
    employeeSalaries,
    marketing,
    loanPayment,
    courseFees,
    insurance,
  };
}

/**
 * Process one week of financial activity.
 *
 * On weeks that are a multiple of 4 (i.e. end of month):
 *  - The scout receives their monthly salary (income).
 *  - Total monthly expenses are deducted.
 *  - Both are recorded as transactions.
 *
 * On non-pay weeks the finances are returned unchanged (no transactions added).
 */
export function processWeeklyFinances(
  finances: FinancialRecord,
  scout: Scout,
  currentWeek: number,
  currentSeason: number,
): FinancialRecord {
  // Only process on a 4-week cycle (monthly paycheck + bills).
  if (currentWeek % 4 !== 0) {
    return finances;
  }

  // Recalculate expenses to capture any changes (new NPC scouts, travel, etc.).
  const currentExpenses = calculateMonthlyExpenses(scout, finances);
  const totalExpenses = sumExpenses(currentExpenses);
  const monthlyIncome = scout.salary * 4;

  const incomeTransaction: FinancialRecord["transactions"][number] = {
    week: currentWeek,
    season: currentSeason,
    amount: monthlyIncome,
    description: "Monthly salary",
  };

  const expenseTransaction: FinancialRecord["transactions"][number] = {
    week: currentWeek,
    season: currentSeason,
    amount: -totalExpenses,
    description: "Monthly expenses",
  };

  return {
    ...finances,
    balance: finances.balance + monthlyIncome - totalExpenses,
    monthlyIncome,
    expenses: currentExpenses,
    transactions: [...finances.transactions, incomeTransaction, expenseTransaction],
  };
}

/**
 * Return true if the scout can afford the given amount from their current balance.
 */
export function canAfford(finances: FinancialRecord, amount: number): boolean {
  return finances.balance >= amount;
}

/**
 * Attempt to purchase the next equipment level upgrade.
 *
 * Returns an updated FinancialRecord with the cost deducted and equipment
 * level incremented, or null if:
 *  - The scout is already at max equipment level (5), or
 *  - The scout cannot afford the upgrade cost.
 *
 * The purchase is recorded as a transaction.
 */
export function purchaseEquipmentUpgrade(
  finances: FinancialRecord,
  currentWeek: number,
  currentSeason: number,
): FinancialRecord | null {
  const nextLevel = finances.equipmentLevel + 1;

  if (nextLevel > MAX_EQUIPMENT_LEVEL) {
    // Already at max level.
    return null;
  }

  const cost = EQUIPMENT_UPGRADE_COSTS[nextLevel];
  if (cost === undefined) {
    // Defensive: unknown level — should never happen given the check above.
    return null;
  }

  if (!canAfford(finances, cost)) {
    return null;
  }

  const upgradeTransaction: FinancialRecord["transactions"][number] = {
    week: currentWeek,
    season: currentSeason,
    amount: -cost,
    description: `Equipment upgrade to level ${nextLevel}`,
  };

  return {
    ...finances,
    balance: finances.balance - cost,
    equipmentLevel: nextLevel,
    transactions: [...finances.transactions, upgradeTransaction],
  };
}

/**
 * Return the observation accuracy bonus conferred by a given equipment level.
 *
 * Bonuses:
 *  - Level 1: 0.00 (no bonus)
 *  - Level 2: 0.02 (+2%)
 *  - Level 3: 0.05 (+5%)
 *  - Level 4: 0.08 (+8%)
 *  - Level 5: 0.12 (+12%)
 *
 * Returns 0 for any out-of-range level (defensive fallback).
 */
export function getEquipmentObservationBonus(equipmentLevel: number): number {
  return EQUIPMENT_OBSERVATION_BONUSES[equipmentLevel] ?? 0;
}

/**
 * Return true if the scout's balance has fallen below the broke threshold (−500).
 * A negative balance is permitted (debt/overdraft), but below −500 is "broke".
 */
export function isBroke(finances: FinancialRecord): boolean {
  return finances.balance < BROKE_THRESHOLD;
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

/**
 * Build an all-zeros expense record. Used as the initial placeholder before
 * the first real calculation, ensuring all keys are always present.
 */
function emptyExpenses(): Record<ExpenseType, number> {
  return {
    rent: 0,
    travel: 0,
    subscriptions: 0,
    equipment: 0,
    npcSalaries: 0,
    other: 0,
    lifestyle: 0,
    officeCost: 0,
    employeeSalaries: 0,
    marketing: 0,
    loanPayment: 0,
    courseFees: 0,
    insurance: 0,
  };
}

/**
 * Sum all expense values into a single monthly total.
 */
function sumExpenses(expenses: Record<ExpenseType, number>): number {
  let total = 0;
  for (const key of Object.keys(expenses) as ExpenseType[]) {
    total += expenses[key];
  }
  return total;
}
