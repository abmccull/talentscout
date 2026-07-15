/**
 * Save migration for the economics revamp.
 *
 * Upgrades legacy FinancialRecord objects (pre-revamp) to the new shape
 * by filling all new fields with sensible defaults. Existing fields are
 * preserved exactly as-is.
 */

import type {
  FinancialRecord,
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
  // Some intermediate saves already carried a careerPath but predated later
  // economics collections. Normalize the complete record rather than treating
  // that one marker as proof of a current schema.
  const legacy = old as Partial<FinancialRecord>;
  const expenses = (
    legacy.expenses && typeof legacy.expenses === "object" ? legacy.expenses : {}
  ) as Partial<FinancialRecord["expenses"]>;
  const array = <Value>(value: Value[] | undefined): Value[] =>
    Array.isArray(value) ? value : [];
  const finite = (value: number | undefined, fallback = 0): number =>
    Number.isFinite(value) ? value! : fallback;

  return reconcileFinancialLedger({
    ...legacy,
    balance: finite(legacy.balance),
    monthlyIncome: finite(legacy.monthlyIncome),
    equipmentLevel: finite(legacy.equipmentLevel, 1),
    transactions: array(legacy.transactions),
    expenses: {
      ...expenses,
      lifestyle: finite(expenses.lifestyle),
      officeCost: finite(expenses.officeCost),
      employeeSalaries: finite(expenses.employeeSalaries),
      marketing: finite(expenses.marketing),
      loanPayment: finite(expenses.loanPayment),
      courseFees: finite(expenses.courseFees),
      insurance: finite(expenses.insurance),
    },
    careerPath: legacy.careerPath ?? scout.careerPath ?? "club",
    independentTier: legacy.independentTier,
    reportSalesRevenue: finite(legacy.reportSalesRevenue),
    placementFeeRevenue: finite(legacy.placementFeeRevenue),
    retainerRevenue: finite(legacy.retainerRevenue),
    consultingRevenue: finite(legacy.consultingRevenue),
    sellOnRevenue: finite(legacy.sellOnRevenue),
    bonusRevenue: finite(legacy.bonusRevenue),
    retainerContracts: array(legacy.retainerContracts),
    activeLoan: legacy.activeLoan,
    placementFeeRecords: array(legacy.placementFeeRecords),
    reportListings: array(legacy.reportListings),
    consultingContracts: array(legacy.consultingContracts),
    office: legacy.office ?? DEFAULT_OFFICE,
    employees: array(legacy.employees),
    lifestyle: legacy.lifestyle ?? defaultLifestyle(scout.careerTier ?? 1),
    completedCourses: array(legacy.completedCourses),
    activeEnrollment: legacy.activeEnrollment,
    ownedVehicle: legacy.ownedVehicle,
    pendingRetainerOffers: array(legacy.pendingRetainerOffers),
    pendingConsultingOffers: array(legacy.pendingConsultingOffers),
    marketTemperature: legacy.marketTemperature ?? "normal",
    activeEconomicEvents: array(legacy.activeEconomicEvents),
    clientRelationships: array(legacy.clientRelationships),
    pendingEmployeeEvents: array(legacy.pendingEmployeeEvents),
    satelliteOffices: array(legacy.satelliteOffices),
    awards: array(legacy.awards),
    loans: array(legacy.loans),
    starterBonus: legacy.starterBonus ?? {
      firstReportBonusUsed: false,
      firstPlacementBonusUsed: false,
      starterStipendWeeksRemaining: 0,
    },
  } as FinancialRecord);
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
