/**
 * Specialization-locked income system.
 *
 * Prevents meta convergence by giving each specialization a 50% bonus to
 * their "native" income source and a 25% penalty to non-native sources.
 *
 * At career tier 3+, each spec unlocks a unique income stream that further
 * differentiates playstyles.
 *
 * All functions are pure — no mutation, no I/O.
 */

import type { Scout, FinancialRecord, Specialization } from "../core/types";

// =============================================================================
// INCOME SOURCE TYPES
// =============================================================================

/**
 * The categories of income a scout can earn beyond base salary.
 * These map to the different ways scouts monetize their work.
 */
export type IncomeSource =
  | "placementFees"     // Youth: placing young players into academies/clubs
  | "reportSales"       // Regional: selling reports on the marketplace
  | "transferBonuses"   // FirstTeam: bonuses from completed transfers
  | "signingFees"       // FirstTeam: fees for recommending signings
  | "consultingFees"    // Data: consulting contracts and analyst reports
  | "salary";           // Base salary (unmodified by spec)

// =============================================================================
// SPEC BONUS/PENALTY CONFIGURATION
// =============================================================================

/**
 * Per-specialization multiplier table.
 * 1.5 = 50% bonus, 0.75 = 25% penalty, 1.0 = neutral.
 */
const SPEC_INCOME_MULTIPLIERS: Record<Specialization, Record<IncomeSource, number>> = {
  youth: {
    placementFees:   1.5,   // Native: 50% bonus
    reportSales:     0.75,  // Penalty: 25% less
    transferBonuses: 1.0,
    signingFees:     1.0,
    consultingFees:  1.0,
    salary:          1.0,
  },
  firstTeam: {
    placementFees:   0.75,  // Penalty: 25% less
    reportSales:     1.0,
    transferBonuses: 1.5,   // Native: 50% bonus
    signingFees:     1.5,   // Native: 50% bonus
    consultingFees:  1.0,
    salary:          1.0,
  },
  regional: {
    placementFees:   1.0,
    reportSales:     1.5,   // Native: 50% bonus (foreign market premium)
    transferBonuses: 0.75,  // Penalty: 25% less
    signingFees:     1.0,
    consultingFees:  1.0,
    salary:          1.0,
  },
  data: {
    placementFees:   0.75,  // Penalty: 25% less
    reportSales:     1.0,
    transferBonuses: 1.0,
    signingFees:     1.0,
    consultingFees:  1.5,   // Native: 50% bonus
    salary:          1.0,
  },
};

// =============================================================================
// TIER 3+ UNIQUE INCOME CONSTANTS
// =============================================================================

/** Youth Scout (Tier 3+): monthly income per academy partnership. Max 3 partnerships. */
const ACADEMY_ADVISORY_INCOME_PER_PARTNER = 500;
const MAX_ACADEMY_PARTNERSHIPS = 3;

/** First Team Scout (Tier 3+): percentage of transfer fee earned as bonus. */
export const TRANSFER_WINDOW_BONUS_RATE = 0.02;

/** Regional Scout (Tier 3+): monthly fee for regional intelligence. */
const REGIONAL_EXPERTISE_FEE = 300;

/** Data Scout (Tier 3+): multiplier on report sale price for predictive reports. */
export const PREDICTIVE_REPORT_MULTIPLIER = 2.0;

/** Data Scout (Tier 3+): base consulting contract income per month at tier 3+. */
const DATA_CONSULTING_BASE = 400;

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Get the income multiplier for a specific income source based on the
 * scout's primary specialization.
 */
export function getIncomeMultiplier(
  specialization: Specialization,
  source: IncomeSource,
): number {
  return SPEC_INCOME_MULTIPLIERS[specialization][source];
}

/**
 * Apply the specialization income multiplier to a raw income amount.
 * Returns the adjusted amount.
 */
export function applySpecBonus(
  specialization: Specialization,
  source: IncomeSource,
  rawAmount: number,
): number {
  const multiplier = getIncomeMultiplier(specialization, source);
  return Math.round(rawAmount * multiplier);
}

/**
 * Calculate the total specialization bonus/penalty for a monthly salary cycle.
 *
 * The base salary itself is NOT modified (salary multiplier = 1.0).
 * However, the system generates "bonus income" that represents the scout's
 * specialization-driven side income: placement fees, report marketplace
 * revenue, transfer bonuses, and consulting fees.
 *
 * This function computes a flat monthly bonus/penalty amount based on the
 * scout's tier, reputation, and specialization.
 */
export function calculateSpecMonthlyBonus(scout: Scout): number {
  const spec = scout.primarySpecialization;
  const tier = scout.careerTier;
  const rep = scout.reputation;

  // Base side-income scales with tier and reputation.
  // Tier 1: ~200/month, Tier 5: ~2000/month, modulated by reputation.
  const baseSideIncome = tier * 100 * (0.5 + rep / 200);

  // The spec bonus is the delta between the native multiplier and 1.0
  // applied to the base side income. Each spec has one native source.
  const nativeSource = getNativeSource(spec);
  const nativeMultiplier = SPEC_INCOME_MULTIPLIERS[spec][nativeSource];
  const penaltySources = getPenaltySources(spec);

  // Bonus from native source
  const nativeBonus = Math.round(baseSideIncome * (nativeMultiplier - 1.0));

  // Penalty from non-native sources (averaged across penalty sources)
  let penaltyTotal = 0;
  for (const src of penaltySources) {
    const mult = SPEC_INCOME_MULTIPLIERS[spec][src];
    penaltyTotal += Math.round(baseSideIncome * 0.5 * (mult - 1.0));
  }

  return nativeBonus + penaltyTotal;
}

/**
 * Calculate tier 3+ unique specialization income per month.
 * Returns 0 if the scout is below tier 3.
 */
export function calculateSpecUniqueIncome(
  scout: Scout,
  finances: FinancialRecord,
): number {
  if (scout.careerTier < 3) return 0;

  switch (scout.primarySpecialization) {
    case "youth": {
      // Academy Advisory: 500/month per partnership (max 3)
      const partnerships = finances.academyPartnerships ?? 0;
      return partnerships * ACADEMY_ADVISORY_INCOME_PER_PARTNER;
    }

    case "firstTeam": {
      // Transfer Window Bonus is applied per-transfer, not monthly.
      // This returns 0 here; the bonus is applied in processWeeklyFinances
      // when transfers are detected.
      return 0;
    }

    case "regional": {
      // Regional Expertise Fee: 300/month if the scout has a region
      const hasRegion = !!finances.regionalExpertiseRegion;
      return hasRegion ? REGIONAL_EXPERTISE_FEE : 0;
    }

    case "data": {
      // Predictive Reports + consulting contracts base income
      return DATA_CONSULTING_BASE;
    }

    default:
      return 0;
  }
}

/**
 * Check whether a youth scout can add a new academy partnership.
 */
export function canAddAcademyPartnership(finances: FinancialRecord): boolean {
  return (finances.academyPartnerships ?? 0) < MAX_ACADEMY_PARTNERSHIPS;
}

/**
 * Get the maximum number of academy partnerships.
 */
export function getMaxAcademyPartnerships(): number {
  return MAX_ACADEMY_PARTNERSHIPS;
}

/**
 * Calculate the first-team scout's transfer window bonus for a given fee.
 */
export function calculateTransferBonus(transferFee: number): number {
  return Math.round(transferFee * TRANSFER_WINDOW_BONUS_RATE);
}

/**
 * Get a human-readable description of the specialization's income focus.
 */
export function getSpecIncomeDescription(spec: Specialization): string {
  switch (spec) {
    case "youth":
      return "Bonus on placement fees. Academy advisory income at Tier 3.";
    case "firstTeam":
      return "Bonus on transfer bonuses and signing fees. Transfer window bonuses at Tier 3.";
    case "regional":
      return "Bonus on marketplace report sales. Regional expertise fees at Tier 3.";
    case "data":
      return "Bonus on consulting fees. Predictive reports at 2x price at Tier 3.";
  }
}

/**
 * Get a short label for the spec's income focus (for UI badges).
 */
export function getSpecIncomeLabel(spec: Specialization): string {
  switch (spec) {
    case "youth":
      return "Placement Fees +50%";
    case "firstTeam":
      return "Transfer Bonuses +50%";
    case "regional":
      return "Report Sales +50%";
    case "data":
      return "Consulting +50%";
  }
}

/**
 * Get the tier 3 unique income label for UI display.
 */
export function getSpecTier3Label(spec: Specialization): string {
  switch (spec) {
    case "youth":
      return "Academy Advisory (500/mo per partner)";
    case "firstTeam":
      return "Transfer Window Bonus (2% of fees)";
    case "regional":
      return "Regional Expertise Fee (300/mo)";
    case "data":
      return "Predictive Reports (2x price + consulting)";
  }
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

function getNativeSource(spec: Specialization): IncomeSource {
  switch (spec) {
    case "youth":     return "placementFees";
    case "firstTeam": return "transferBonuses";
    case "regional":  return "reportSales";
    case "data":      return "consultingFees";
  }
}

function getPenaltySources(spec: Specialization): IncomeSource[] {
  switch (spec) {
    case "youth":     return ["reportSales"];
    case "firstTeam": return ["placementFees"];
    case "regional":  return ["transferBonuses"];
    case "data":      return ["placementFees"];
  }
}
