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
  Loan,
  BusinessLoan,
  RetainerContract,
  ConsultingContract,
  ClientRelationship,
} from "../core/types";
import type { RNG } from "../rng/index";
import { ensureEmployeeSkills } from "./employeeSkills";
import { normalizeAnalystReviewHistory } from "./analystReviews";
import {
  addGameWeeksWithSeasonLength,
  LEGACY_SEASON_LENGTH_WEEKS,
} from "../core/gameDate";
import { monthlyEquivalentOfWeeklyAmount } from "../core/annualization";

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

function normalizeRetainerContract(contract: RetainerContract): RetainerContract {
  return {
    ...contract,
    deliveredReportIds: Array.isArray(contract.deliveredReportIds)
      ? [...new Set(contract.deliveredReportIds)]
      : [],
    averageDeliveredQuality: contract.averageDeliveredQuality ?? 0,
    consecutivePeriodsMet: contract.consecutivePeriodsMet ?? 0,
    consecutivePeriodsMissed: contract.consecutivePeriodsMissed ?? 0,
    termMonths: contract.termMonths ?? 3,
  };
}

function normalizeConsultingContract(contract: ConsultingContract): ConsultingContract {
  return {
    ...contract,
    deliveredReportIds: Array.isArray(contract.deliveredReportIds)
      ? [...new Set(contract.deliveredReportIds)]
      : [],
    deliverables: Array.isArray(contract.deliverables)
      ? contract.deliverables.map((deliverable) => ({ ...deliverable }))
      : contract.status === "active"
        ? [{
            type: "presentation",
            description: "Deliver the final client presentation",
            required: 1,
            delivered: 0,
          }]
        : [],
  };
}

function normalizeClientRelationship(
  relationship: ClientRelationship,
): ClientRelationship {
  return {
    ...relationship,
    failedContracts: relationship.failedContracts ?? 0,
  };
}

const LEGACY_LOAN_TERM_MONTHS = 12;
const DEFAULT_LOAN_STATUS: Loan["status"] = "active";

function inferLegacyLoanMonthlyPayment(loan: BusinessLoan): number {
  return Math.max(1, Math.round(Math.max(loan.remainingBalance, 0) / LEGACY_LOAN_TERM_MONTHS));
}

function getLoanStatusSeverity(status: Loan["status"] | undefined): number {
  switch (status) {
    case "defaulted":
      return 2;
    case "delinquent":
      return 1;
    default:
      return 0;
  }
}

function consolidateLegacyLoans(
  activeLoan: Loan | undefined,
  legacyLoans: BusinessLoan[],
): Loan | undefined {
  if (!activeLoan && legacyLoans.length === 0) {
    return undefined;
  }

  if (legacyLoans.length === 0) {
    if (!activeLoan) {
      return undefined;
    }

    const normalizedLoan: Loan = {
      ...activeLoan,
      termMonths: activeLoan.termMonths ?? LEGACY_LOAN_TERM_MONTHS,
      paymentsMade: activeLoan.paymentsMade ?? 0,
      missedPayments: activeLoan.missedPayments ?? 0,
      arrears: activeLoan.arrears ?? 0,
      status: activeLoan.status ?? DEFAULT_LOAN_STATUS,
    };

    return normalizedLoan.termMonths === activeLoan.termMonths
      && normalizedLoan.paymentsMade === activeLoan.paymentsMade
      && normalizedLoan.missedPayments === activeLoan.missedPayments
      && normalizedLoan.arrears === activeLoan.arrears
      && normalizedLoan.status === activeLoan.status
      ? activeLoan
      : normalizedLoan;
  }

  const legacyPrincipal = legacyLoans.reduce(
    (sum, loan) => sum + (Number.isFinite(loan.principal) ? loan.principal : 0),
    0,
  );
  const legacyRemaining = legacyLoans.reduce(
    (sum, loan) => sum + (Number.isFinite(loan.remainingBalance) ? loan.remainingBalance : 0),
    0,
  );
  const weightedLegacyInterest = legacyLoans.reduce(
    (sum, loan) => sum
      + (Number.isFinite(loan.remainingBalance) ? loan.remainingBalance : 0)
      * (Number.isFinite(loan.monthlyInterestRate) ? loan.monthlyInterestRate : 0),
    0,
  );
  const legacyMonthlyPayment = legacyLoans.reduce(
    (sum, loan) => sum + inferLegacyLoanMonthlyPayment(loan),
    0,
  );
  const earliestLegacy = legacyLoans.reduce(
    (earliest, loan) => {
      if (!earliest) {
        return { week: loan.originWeek, season: loan.originSeason };
      }
      if (loan.originSeason < earliest.season) return { week: loan.originWeek, season: loan.originSeason };
      if (loan.originSeason === earliest.season && loan.originWeek < earliest.week) {
        return { week: loan.originWeek, season: loan.originSeason };
      }
      return earliest;
    },
    undefined as { week: number; season: number } | undefined,
  );

  if (!activeLoan) {
    return {
      id: legacyLoans.length === 1 ? legacyLoans[0].id : "loan_legacy_consolidated",
      type: "business",
      principal: legacyPrincipal,
      monthlyInterestRate: legacyRemaining > 0 ? weightedLegacyInterest / legacyRemaining : 0,
      remainingBalance: legacyRemaining,
      monthlyPayment: legacyMonthlyPayment,
      startWeek: earliestLegacy?.week ?? 1,
      startSeason: earliestLegacy?.season ?? 1,
      termMonths: LEGACY_LOAN_TERM_MONTHS,
      paymentsMade: 0,
      missedPayments: 0,
      arrears: 0,
      status: DEFAULT_LOAN_STATUS,
    };
  }

  const combinedRemaining = activeLoan.remainingBalance + legacyRemaining;
  const combinedPrincipal = activeLoan.principal + legacyPrincipal;
  const weightedActiveInterest = activeLoan.remainingBalance * activeLoan.monthlyInterestRate;
  const consolidatedStatus = getLoanStatusSeverity(activeLoan.status) >= 1
    ? activeLoan.status
    : DEFAULT_LOAN_STATUS;

  return {
    ...activeLoan,
    principal: combinedPrincipal,
    remainingBalance: combinedRemaining,
    monthlyInterestRate: combinedRemaining > 0
      ? (weightedActiveInterest + weightedLegacyInterest) / combinedRemaining
      : activeLoan.monthlyInterestRate,
    monthlyPayment: activeLoan.monthlyPayment + legacyMonthlyPayment,
    startSeason: earliestLegacy && earliestLegacy.season < activeLoan.startSeason
      ? earliestLegacy.season
      : activeLoan.startSeason,
    startWeek: earliestLegacy
      && (
        earliestLegacy.season < activeLoan.startSeason
        || (earliestLegacy.season === activeLoan.startSeason && earliestLegacy.week < activeLoan.startWeek)
      )
      ? earliestLegacy.week
      : activeLoan.startWeek,
    termMonths: activeLoan.termMonths ?? LEGACY_LOAN_TERM_MONTHS,
    paymentsMade: activeLoan.paymentsMade ?? 0,
    missedPayments: activeLoan.missedPayments ?? 0,
    arrears: activeLoan.arrears ?? 0,
    status: consolidatedStatus,
  };
}

/**
 * Canonicalize debt storage so `activeLoan` is the sole debt authority.
 * Legacy `loans[]` entries are consolidated once, then cleared permanently.
 */
export function normalizeCanonicalLoanState(
  finances: FinancialRecord,
): FinancialRecord {
  const legacyLoans = Array.isArray(finances.loans) ? finances.loans : [];
  const normalizedActiveLoan = consolidateLegacyLoans(finances.activeLoan, legacyLoans);

  const needsActiveLoanNormalization = normalizedActiveLoan !== finances.activeLoan;
  const needsLegacyClear = legacyLoans.length > 0;
  if (!needsActiveLoanNormalization && !needsLegacyClear) {
    return finances;
  }

  return {
    ...finances,
    activeLoan: normalizedActiveLoan,
    loans: [],
  };
}

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
  const careerPath = legacy.careerPath ?? scout.careerPath ?? "club";

  return reconcileFinancialLedger(normalizeCanonicalLoanState({
    ...legacy,
    balance: finite(legacy.balance),
    monthlyIncome: careerPath === "club"
      ? monthlyEquivalentOfWeeklyAmount(scout.salary)
      : 0,
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
    careerPath,
    independentTier: legacy.independentTier,
    reportSalesRevenue: finite(legacy.reportSalesRevenue),
    placementFeeRevenue: finite(legacy.placementFeeRevenue),
    retainerRevenue: finite(legacy.retainerRevenue),
    consultingRevenue: finite(legacy.consultingRevenue),
    sellOnRevenue: finite(legacy.sellOnRevenue),
    bonusRevenue: finite(legacy.bonusRevenue),
    retainerContracts: array(legacy.retainerContracts).map(normalizeRetainerContract),
    activeLoan: legacy.activeLoan,
    placementFeeRecords: array(legacy.placementFeeRecords),
    reportListings: array(legacy.reportListings),
    consultingContracts: array(legacy.consultingContracts).map(normalizeConsultingContract),
    office: legacy.office ?? DEFAULT_OFFICE,
    employees: array(legacy.employees),
    analystReviews: normalizeAnalystReviewHistory(array(legacy.analystReviews)),
    lifestyle: legacy.lifestyle ?? defaultLifestyle(scout.careerTier ?? 1),
    completedCourses: array(legacy.completedCourses),
    activeEnrollment: legacy.activeEnrollment,
    ownedVehicle: legacy.ownedVehicle,
    pendingRetainerOffers: array(legacy.pendingRetainerOffers).map(normalizeRetainerContract),
    pendingConsultingOffers: array(legacy.pendingConsultingOffers).map(normalizeConsultingContract),
    marketTemperature: legacy.marketTemperature ?? "normal",
    activeEconomicEvents: array(legacy.activeEconomicEvents),
    clientRelationships: array(legacy.clientRelationships).map(normalizeClientRelationship),
    pendingEmployeeEvents: array(legacy.pendingEmployeeEvents),
    satelliteOffices: array(legacy.satelliteOffices),
    awards: array(legacy.awards),
    loans: array(legacy.loans),
    starterBonus: legacy.starterBonus ?? {
      firstReportBonusUsed: false,
      firstPlacementBonusUsed: false,
      starterStipendWeeksRemaining: 0,
    },
  } as FinancialRecord));
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
        3,
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
