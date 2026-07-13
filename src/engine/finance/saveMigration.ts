/**
 * Save migration for the economics revamp.
 *
 * Upgrades legacy FinancialRecord objects (pre-revamp) to the new shape
 * by filling all new fields with sensible defaults. Existing fields are
 * preserved exactly as-is.
 */

import type {
  FinancialRecord,
  CareerPath,
  LifestyleConfig,
  Office,
  CareerTier,
  Scout,
} from "../core/types";
import type { RNG } from "../rng/index";
import { ensureEmployeeSkills } from "./employeeSkills";
import {
  addGameWeeksWithSeasonLength,
  LEGACY_SEASON_LENGTH_WEEKS,
} from "../core/gameDate";

/**
 * Default lifestyle config for a given career tier.
 * Matches the old TIER_RENT values loosely.
 */
function defaultLifestyle(careerTier: CareerTier): LifestyleConfig {
  const configs: Record<CareerTier, LifestyleConfig> = {
    1: { level: 1, monthlyCost: 200, networkingBonus: 0, salaryOfferBonus: 0 },
    2: { level: 2, monthlyCost: 500, networkingBonus: 0.05, salaryOfferBonus: 0 },
    3: { level: 3, monthlyCost: 1000, networkingBonus: 0.10, salaryOfferBonus: 0.05 },
    4: { level: 4, monthlyCost: 2000, networkingBonus: 0.15, salaryOfferBonus: 0.10 },
    5: { level: 5, monthlyCost: 5000, networkingBonus: 0.20, salaryOfferBonus: 0.15 },
  };
  return configs[careerTier];
}

const DEFAULT_OFFICE: Office = {
  tier: "home",
  monthlyCost: 0,
  qualityBonus: 0,
  maxEmployees: 0,
};

/**
 * Add the one legacy opening entry needed to reconcile cash to its ledger.
 * The saved balance never changes, and the delta formula makes this idempotent.
 */
export function reconcileFinancialLedger(
  finances: FinancialRecord,
): FinancialRecord {
  const transactions = Array.isArray(finances.transactions)
    ? finances.transactions
    : [];
  const recordedBalance = transactions.reduce(
    (sum, transaction) =>
      sum + (Number.isFinite(transaction.amount) ? transaction.amount : 0),
    0,
  );
  const openingDelta = finances.balance - recordedBalance;
  if (openingDelta === 0) return finances;

  return {
    ...finances,
    transactions: [
      {
        week: 0,
        season: 1,
        amount: openingDelta,
        description: "Opening balance (legacy reconciliation)",
        kind: "openingBalance",
      },
      ...transactions,
    ],
  };
}

/**
 * Migrate a legacy FinancialRecord to the new schema.
 * Safe to call on already-migrated records (no-op on existing fields).
 */
export function migrateFinancialRecord(
  old: FinancialRecord,
  scout: Scout,
): FinancialRecord {
  // Existing new-shape records may still predate the opening-balance ledger.
  if (old.careerPath !== undefined) {
    return reconcileFinancialLedger(old);
  }

  const careerPath: CareerPath = scout.careerPath ?? "club";

  return reconcileFinancialLedger({
    ...old,

    // Ensure new expense types exist in the expenses record
    expenses: {
      ...old.expenses,
      lifestyle: old.expenses.lifestyle ?? 0,
      officeCost: old.expenses.officeCost ?? 0,
      employeeSalaries: old.expenses.employeeSalaries ?? 0,
      marketing: old.expenses.marketing ?? 0,
      loanPayment: old.expenses.loanPayment ?? 0,
      courseFees: old.expenses.courseFees ?? 0,
      insurance: old.expenses.insurance ?? 0,
    },

    // Career path
    careerPath,
    independentTier: undefined,

    // Revenue tracking — all zeroed for existing saves
    reportSalesRevenue: 0,
    placementFeeRevenue: 0,
    retainerRevenue: 0,
    consultingRevenue: 0,
    sellOnRevenue: 0,
    bonusRevenue: 0,

    // Contracts & records — empty
    retainerContracts: [],
    activeLoan: undefined,
    placementFeeRecords: [],
    reportListings: [],
    consultingContracts: [],

    // Assets
    office: DEFAULT_OFFICE,
    employees: [],
    lifestyle: defaultLifestyle(scout.careerTier),
    completedCourses: [],
    activeEnrollment: undefined,
    ownedVehicle: undefined,

    // Pending offers
    pendingRetainerOffers: [],
    pendingConsultingOffers: [],

    // Market
    marketTemperature: "normal",
    activeEconomicEvents: [],

    // Agency overhaul
    clientRelationships: [],
    pendingEmployeeEvents: [],
    satelliteOffices: [],
    awards: [],
  });
}

/**
 * Migrate existing report listings to include bidding fields.
 * Safe to call on already-migrated records (no-op on listings with bids).
 */
export function migrateReportListingBids(
  finances: FinancialRecord,
  seasonLength = LEGACY_SEASON_LENGTH_WEEKS,
): FinancialRecord {
  const needsMigration = finances.reportListings.some(
    (l) => !Array.isArray(l.bids)
      || !Number.isInteger(l.biddingEndsWeek)
      || !Number.isInteger(l.biddingEndsSeason),
  );
  if (!needsMigration) return finances;

  return {
    ...finances,
    reportListings: finances.reportListings.map((l) => {
      const biddingEnds = addGameWeeksWithSeasonLength(
        { week: l.listedWeek, season: l.listedSeason },
        2,
        seasonLength,
      );
      return {
        ...l,
        bids: l.bids ?? [],
        biddingEndsWeek: l.biddingEndsWeek ?? biddingEnds.week,
        biddingEndsSeason: l.biddingEndsSeason ?? biddingEnds.season,
      };
    }),
  };
}

/**
 * Migrate employees to have skills if they don't already.
 * Called during game load to ensure backward compatibility.
 */
export function migrateEmployeeSkillsInRecord(
  finances: FinancialRecord,
  rng: RNG,
): FinancialRecord {
  if (finances.employees.length === 0) return finances;

  const needsMigration = finances.employees.some((e) => !e.skills);
  if (!needsMigration) return finances;

  return {
    ...finances,
    employees: finances.employees.map((e) => ensureEmployeeSkills(rng, e)),
  };
}
