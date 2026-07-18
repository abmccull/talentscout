/**
 * Financial pressure system for TalentScout.
 *
 * Models the scout's income, monthly expenses, equipment upgrades, and
 * solvency state. All functions are pure — no mutation, no I/O.
 *
 * Currency unit: game currency (integer-precision; no floating-point cash).
 * Twelve financial periods are distributed across each competition season so
 * league length cannot alter annual salary or operating costs.
 */

import type {
  Scout,
  FinancialRecord,
  ExpenseType,
  CareerTier,
  CareerPath,
  LifestyleConfig,
  Office,
  DifficultyLevel,
} from "../core/types";
import { getEquipmentMonthlyTotal } from "./equipmentBonuses";
import { DEFAULT_LOADOUT, DEFAULT_OWNED_ITEMS } from "./equipmentCatalog";
import type { EquipmentInventory } from "./equipmentCatalog";
import {
  calculateSpecMonthlyBonus,
  calculateSpecUniqueIncome,
} from "./specializationIncome";
import {
  normalizeEmployeeContract,
  normalizeEmployeeContractsInRecord,
} from "./employeeEconomics";
import {
  getSatelliteOfficeCostReferenceId,
  getSatelliteOfficeMonthlyCostTotal,
} from "./internationalExpansion";
import { normalizeCanonicalLoanState } from "./saveMigration";
import {
  isFinancialPeriodClose,
  monthlyEquivalentOfWeeklyAmount,
} from "../core/annualization";
import { LEGACY_SEASON_LENGTH_WEEKS } from "../core/gameDate";

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

/**
 * Apply one auditable cash movement.
 *
 * Keeping the balance mutation and its ledger entry in the same helper makes
 * it impossible for callers such as difficulty modifiers or legacy perks to
 * change cash without explaining where the money came from.
 */
export function applyBalanceTransaction(
  finances: FinancialRecord,
  amount: number,
  week: number,
  season: number,
  description: string,
  referenceId?: string,
): FinancialRecord {
  if (!Number.isFinite(amount) || amount === 0) return finances;

  return {
    ...finances,
    balance: finances.balance + amount,
    transactions: [
      ...finances.transactions,
      {
        week,
        season,
        amount,
        description,
        ...(referenceId ? { referenceId } : {}),
      },
    ],
  };
}

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
  1: 100,
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
  1: 50,
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

/**
 * Flat "other" monthly expense (minor incidentals / lifestyle).
 * Tier 1 pays a reduced rate to ease the early-game poverty trap.
 */
const FLAT_OTHER_EXPENSE = 50;
const TIER_1_OTHER_EXPENSE = 35;

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

// =============================================================================
// DIFFICULTY-SCALED FINANCIAL CONSTANTS
// =============================================================================

const STARTING_CASH: Record<DifficultyLevel, number> = {
  casual: 4000,
  normal: 2000,
  hard: 2000,
  ironman: 2000,
};

const STARTER_STIPEND: Record<DifficultyLevel, number> = {
  casual: 500,
  normal: 300,
  hard: 200,
  ironman: 150,
};

/**
 * Create a starting FinancialRecord for a scout based on their career tier.
 *
 * Starting cash scales by difficulty (casual gets 4000, others get 2000).
 * Equipment begins at level 1 (no bonus). The expense record is
 * populated with initial estimates for the first month.
 */
export function initializeFinances(scout: Scout, careerPath?: CareerPath, difficulty?: DifficultyLevel): FinancialRecord {
  const monthlyIncome = monthlyEquivalentOfWeeklyAmount(scout.salary);
  const path = careerPath ?? scout.careerPath ?? "club";
  const startingCash = STARTING_CASH[difficulty ?? "normal"];

  const defaultEquipment: EquipmentInventory = {
    ownedItems: [...DEFAULT_OWNED_ITEMS],
    loadout: { ...DEFAULT_LOADOUT },
  };

  const lifestyle = defaultLifestyleForTier(scout.careerTier);
  const office: Office = { tier: "home", monthlyCost: 0, qualityBonus: 0, maxEmployees: 0 };

  // Build a temporary record so we can calculate initial expenses
  const stub: FinancialRecord = {
    balance: startingCash,
    monthlyIncome,
    expenses: emptyExpenses(),
    equipmentLevel: 1,
    transactions: [{
      week: 0,
      season: 1,
      amount: startingCash,
      description: "Opening balance",
      kind: "openingBalance",
    }],
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
    staffWorkProducts: [],
    analystReviews: [],
    lifestyle,
    completedCourses: [],
    activeEnrollment: undefined,
    ownedVehicle: undefined,
    pendingRetainerOffers: [],
    pendingConsultingOffers: [],
    marketTemperature: "normal",
    activeEconomicEvents: [],
    clientRelationships: [],
    pendingEmployeeEvents: [],
    satelliteOffices: [],
    awards: [],
    // B2: Economy / Loans
    loans: [],
    starterBonus: { firstReportBonusUsed: false, firstPlacementBonusUsed: false, starterStipendWeeksRemaining: 4 },
    // B9: Specialization income tracking fields
    specBonusApplied: 0,
    specUniqueIncome: 0,
    academyPartnerships: 0,
    regionalExpertiseRegion: undefined,
  };

  const expenses = calculateMonthlyExpenses(scout, stub);

  return { ...stub, expenses };
}

/**
 * Process the weekly starter stipend — a guaranteed minimum income for the
 * first 4 weeks representing an introductory retainer from the league.
 * Returns the updated FinancialRecord (or the original if no stipend remains).
 *
 * Existing saves that lack `starterStipendWeeksRemaining` are treated as
 * having 0 weeks remaining (stipend exhausted).
 */
export function processStarterStipend(
  finances: FinancialRecord,
  difficulty: DifficultyLevel,
  week: number,
  season: number,
): FinancialRecord {
  if (finances.transactions.some(
    (transaction) => transaction.week === week
      && transaction.season === season
      && transaction.description === "Starter scouting stipend",
  )) {
    return finances;
  }
  const weeksRemaining = finances.starterBonus?.starterStipendWeeksRemaining ?? 0;
  if (!finances.starterBonus || weeksRemaining <= 0) {
    return finances;
  }
  const stipend = STARTER_STIPEND[difficulty] ?? STARTER_STIPEND.normal;
  const paid = applyBalanceTransaction(
    finances,
    stipend,
    week,
    season,
    "Starter scouting stipend",
  );
  return {
    ...paid,
    starterBonus: {
      ...paid.starterBonus,
      starterStipendWeeksRemaining: weeksRemaining - 1,
    },
  };
}

/** Apply the cash deltas introduced by a difficulty profile. */
export function applyDifficultyFinancialAdjustments(
  finances: FinancialRecord,
  incomeAdjustment: number,
  expenseAdjustment: number,
  week: number,
  season: number,
): FinancialRecord {
  const alreadyAdjustedIncome = finances.transactions.some(
    (transaction) => transaction.week === week
      && transaction.season === season
      && transaction.description === "Difficulty income adjustment",
  );
  let updated = alreadyAdjustedIncome
    ? finances
    : applyBalanceTransaction(
      finances,
      incomeAdjustment,
      week,
      season,
      "Difficulty income adjustment",
    );
  const alreadyAdjustedExpenses = updated.transactions.some(
    (transaction) => transaction.week === week
      && transaction.season === season
      && transaction.description === "Difficulty expense adjustment",
  );
  updated = alreadyAdjustedExpenses
    ? updated
    : applyBalanceTransaction(
      updated,
      -expenseAdjustment,
      week,
      season,
      "Difficulty expense adjustment",
    );
  return updated;
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
  const rent = finances.lifestyle ? 0 : TIER_RENT[tier];

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
  const other = tier === 1 ? TIER_1_OTHER_EXPENSE : FLAT_OTHER_EXPENSE;

  // --- Lifestyle (overrides rent for revamped saves) ---
  const lifestyle = finances.lifestyle ? finances.lifestyle.monthlyCost : 0;

  // --- Office cost (independent path) ---
  const officeCost = (finances.office ? finances.office.monthlyCost : 0)
    + getSatelliteOfficeMonthlyCostTotal(finances);

  // --- Employee salaries (agency) ---
  const employeeSalaries = finances.employees
    ? finances.employees.reduce(
      (sum, employee) => sum + normalizeEmployeeContract(
        employee,
        scout.reputation,
      ).employee.salary,
      0,
    )
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
 * At each of the season's twelve financial period closes:
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
  seasonLength = LEGACY_SEASON_LENGTH_WEEKS,
): FinancialRecord {
  const canonicalFinances = normalizeCanonicalLoanState(finances);

  if (!isFinancialPeriodClose(currentWeek, seasonLength)) {
    return canonicalFinances;
  }

  const payrollReference = `monthly-finance:s${currentSeason}w${currentWeek}`;
  const currentCycleTransactions = canonicalFinances.transactions.filter(
    (transaction) => transaction.week === currentWeek
      && transaction.season === currentSeason,
  );
  const alreadyProcessed = currentCycleTransactions.some(
    (transaction) => transaction.referenceId === `${payrollReference}:scout-income`,
  ) || (
    currentCycleTransactions.some((transaction) => transaction.description === "Monthly salary")
    && currentCycleTransactions.some((transaction) => transaction.description === "Monthly expenses")
  );
  if (alreadyProcessed) {
    return canonicalFinances;
  }

  const normalizedFinances = normalizeEmployeeContractsInRecord(
    canonicalFinances,
    scout.reputation,
    currentWeek,
    currentSeason,
  );

  // Recalculate expenses to capture any changes (new NPC scouts, travel, etc.).
  const currentExpenses = calculateMonthlyExpenses(scout, normalizedFinances);
  // Debt service is displayed in the monthly expense breakdown, but it is
  // charged only by processLoanPayment(), which also reduces the outstanding
  // principal. Keeping it out of this operating-cost pass prevents one loan
  // instalment from being deducted twice.
  const totalOperatingExpenses = sumOperatingExpenses(currentExpenses);
  const alreadyChargedSatelliteCost = normalizedFinances.transactions.some(
    (transaction) => transaction.referenceId === getSatelliteOfficeCostReferenceId(
      currentWeek,
      currentSeason,
    ),
  )
    ? getSatelliteOfficeMonthlyCostTotal(normalizedFinances)
    : 0;
  const operatingExpenses = totalOperatingExpenses
    - currentExpenses.employeeSalaries
    - alreadyChargedSatelliteCost;
  const monthlyIncome = monthlyEquivalentOfWeeklyAmount(scout.salary);

  // Specialization income bonus/penalty (B9: lock income sources by spec)
  const specBonus = calculateSpecMonthlyBonus(scout);
  const specUniqueIncome = calculateSpecUniqueIncome(scout, canonicalFinances);
  const totalSpecIncome = specBonus + specUniqueIncome;

  const transactions: FinancialRecord["transactions"] = [];

  transactions.push({
    week: currentWeek,
    season: currentSeason,
    amount: monthlyIncome,
    description: "Monthly salary",
    referenceId: `${payrollReference}:scout-income`,
  });

  if (totalSpecIncome !== 0) {
    transactions.push({
      week: currentWeek,
      season: currentSeason,
      amount: totalSpecIncome,
      description: totalSpecIncome >= 0
        ? "Specialization income bonus"
        : "Specialization income penalty",
      referenceId: `${payrollReference}:specialization-income`,
    });
  }

  transactions.push({
    week: currentWeek,
    season: currentSeason,
    amount: -operatingExpenses,
    description: "Monthly operating expenses",
    referenceId: `${payrollReference}:operating-expenses`,
  });

  for (const employee of normalizedFinances.employees) {
    transactions.push({
      week: currentWeek,
      season: currentSeason,
      amount: -employee.salary,
      description: `Employee salary: ${employee.name} (${employee.role})`,
      referenceId: `${payrollReference}:employee:${employee.id}`,
    });
  }

  return {
    ...normalizedFinances,
    balance: normalizedFinances.balance
      + monthlyIncome
      + totalSpecIncome
      - operatingExpenses
      - currentExpenses.employeeSalaries,
    monthlyIncome,
    expenses: currentExpenses,
    specBonusApplied: specBonus,
    specUniqueIncome,
    transactions: [...normalizedFinances.transactions, ...transactions],
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
// STARTER BONUS
// =============================================================================

/** Bonus multiplier for the first report sold (50% extra). */
const FIRST_REPORT_BONUS_MULTIPLIER = 0.50;

/** Bonus multiplier for the first placement fee (25% extra). */
const FIRST_PLACEMENT_BONUS_MULTIPLIER = 0.25;

/**
 * Apply the starter bonus for a report sale.
 * Returns an updated FinancialRecord with the bonus credited, or the
 * original record if the bonus has already been used.
 *
 * @param basePayment The base payment amount for the report sold.
 */
export function applyFirstReportBonus(
  finances: FinancialRecord,
  basePayment: number,
  currentWeek: number,
  currentSeason: number,
): FinancialRecord {
  if (finances.starterBonus?.firstReportBonusUsed) return finances;
  const starterBonus = finances.starterBonus ?? {
    firstReportBonusUsed: false,
    firstPlacementBonusUsed: false,
    starterStipendWeeksRemaining: 0,
  };

  const bonus = Math.round(basePayment * FIRST_REPORT_BONUS_MULTIPLIER);

  const bonusTransaction: FinancialRecord["transactions"][number] = {
    week: currentWeek,
    season: currentSeason,
    amount: bonus,
    description: "Welcome Package: first report bonus (+50%)",
    referenceId: `welcome:first-report:s${currentSeason}w${currentWeek}`,
    category: "bonus",
  };

  return {
    ...finances,
    balance: finances.balance + bonus,
    bonusRevenue: (finances.bonusRevenue ?? 0) + bonus,
    starterBonus: { ...starterBonus, firstReportBonusUsed: true },
    transactions: [...finances.transactions, bonusTransaction],
  };
}

/**
 * Apply the starter bonus for a placement fee.
 * Returns an updated FinancialRecord with the bonus credited, or the
 * original record if the bonus has already been used.
 *
 * @param baseFee The base placement fee amount.
 */
export function applyFirstPlacementBonus(
  finances: FinancialRecord,
  baseFee: number,
  currentWeek: number,
  currentSeason: number,
): FinancialRecord {
  if (finances.starterBonus?.firstPlacementBonusUsed) return finances;
  const starterBonus = finances.starterBonus ?? {
    firstReportBonusUsed: false,
    firstPlacementBonusUsed: false,
    starterStipendWeeksRemaining: 0,
  };

  const bonus = Math.round(baseFee * FIRST_PLACEMENT_BONUS_MULTIPLIER);

  const bonusTransaction: FinancialRecord["transactions"][number] = {
    week: currentWeek,
    season: currentSeason,
    amount: bonus,
    description: "Welcome Package: first placement bonus (+25%)",
    referenceId: `welcome:first-placement:s${currentSeason}w${currentWeek}`,
    category: "bonus",
  };

  return {
    ...finances,
    balance: finances.balance + bonus,
    bonusRevenue: (finances.bonusRevenue ?? 0) + bonus,
    starterBonus: { ...starterBonus, firstPlacementBonusUsed: true },
    transactions: [...finances.transactions, bonusTransaction],
  };
}

// ---------------------------------------------------------------------------
// Lifestyle Gameplay Effects
// ---------------------------------------------------------------------------

export interface LifestyleEffects {
  /** Modifier to contact acquisition rate. Negative = harder to meet contacts. */
  contactAcquisitionModifier: number;
  /** Modifier to retainer contract value (percentage). */
  retainerValueModifier: number;
  /** Modifier to consulting fee (percentage). */
  consultingFeeModifier: number;
  /** Bonus relationship points per contact interaction. */
  relationshipBonusPerInteraction: number;
  /** Credit score floor penalty (subtracted from effective score). */
  creditScoreFloorPenalty: number;
}

/**
 * Get gameplay effects based on current lifestyle level.
 * Higher lifestyle provides professional advantages but may carry financial risk.
 */
export function getLifestyleEffects(lifestyleLevel: number): LifestyleEffects {
  switch (lifestyleLevel) {
    case 1: // Frugal
      return {
        contactAcquisitionModifier: -0.05,
        retainerValueModifier: 0,
        consultingFeeModifier: 0,
        relationshipBonusPerInteraction: 0,
        creditScoreFloorPenalty: 0,
      };
    case 2: // Modest
      return {
        contactAcquisitionModifier: 0,
        retainerValueModifier: 0,
        consultingFeeModifier: 0,
        relationshipBonusPerInteraction: 0,
        creditScoreFloorPenalty: 0,
      };
    case 3: // Comfortable
      return {
        contactAcquisitionModifier: 0,
        retainerValueModifier: 0.05,
        consultingFeeModifier: 0,
        relationshipBonusPerInteraction: 1,
        creditScoreFloorPenalty: 0,
      };
    case 4: // Upscale
      return {
        contactAcquisitionModifier: 0,
        retainerValueModifier: 0.05,
        consultingFeeModifier: 0.10,
        relationshipBonusPerInteraction: 2,
        creditScoreFloorPenalty: 0,
      };
    case 5: // Lavish
      return {
        contactAcquisitionModifier: 0,
        retainerValueModifier: 0.15,
        consultingFeeModifier: 0.15,
        relationshipBonusPerInteraction: 3,
        creditScoreFloorPenalty: 10,
      };
    default:
      return {
        contactAcquisitionModifier: 0,
        retainerValueModifier: 0,
        consultingFeeModifier: 0,
        relationshipBonusPerInteraction: 0,
        creditScoreFloorPenalty: 0,
      };
  }
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

/**
 * Expenses charged by the monthly operating-cost pass.
 *
 * Loan instalments are deliberately excluded: processLoanPayment is the one
 * authoritative cash-and-liability mutation for active loans.
 */
export function sumOperatingExpenses(
  expenses: Record<ExpenseType, number>,
): number {
  return sumExpenses(expenses) - expenses.loanPayment;
}
