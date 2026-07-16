/**
 * Loans & Financing — business loans, equipment financing, and emergency loans.
 */

import type {
  FinancialRecord,
  Loan,
  LoanType,
} from "../core/types";
import {
  creditForLoanDefault,
  creditForLoanRepayment,
  creditForMissedPayment,
  getCreditScore,
} from "./creditScore";
import { applyBalanceTransaction } from "./expenses";
import { normalizeCanonicalLoanState } from "./saveMigration";
import {
  addGameWeeksWithSeasonLength,
  isGameDateAtOrAfter,
  LEGACY_SEASON_LENGTH_WEEKS,
} from "../core/gameDate";

interface LoanConfig {
  maxAmount: number;
  monthlyInterestRate: number;
  termMonths: number;
  minTier: number;
  minCreditScore: number;
  maxIncomeMultiple: number;
  tierCaps: Record<1 | 2 | 3 | 4 | 5, number>;
  reserveLowCash?: boolean;
}

export interface LoanOffer {
  type: LoanType;
  eligible: boolean;
  reason?: string;
  maxAmount: number;
  interestRate: number;
  monthlyPayment: number;
  termMonths: number;
  effectiveCareerTier: number;
  creditScore: number;
}

export interface LoanEligibilitySummary {
  eligible: boolean;
  types: LoanType[];
  creditScore: number;
  maxAmount: number;
  effectiveCareerTier: number;
  offers: Partial<Record<LoanType, LoanOffer>>;
}

const LOAN_CONFIGS: Record<LoanType, LoanConfig> = {
  business: {
    maxAmount: 20000,
    monthlyInterestRate: 0.05,
    termMonths: 12,
    minTier: 1,
    minCreditScore: 30,
    maxIncomeMultiple: 6,
    tierCaps: { 1: 5000, 2: 8000, 3: 12000, 4: 16000, 5: 20000 },
  },
  equipment: {
    maxAmount: 10000,
    monthlyInterestRate: 0.10,
    termMonths: 6,
    minTier: 1,
    minCreditScore: 20,
    maxIncomeMultiple: 4,
    tierCaps: { 1: 1000, 2: 2500, 3: 5000, 4: 7500, 5: 10000 },
  },
  emergency: {
    maxAmount: 2000,
    monthlyInterestRate: 0.08,
    termMonths: 4,
    minTier: 1,
    minCreditScore: 0,
    maxIncomeMultiple: 1,
    tierCaps: { 1: 600, 2: 900, 3: 1300, 4: 1800, 5: 2000 },
    reserveLowCash: true,
  },
};

const DEFAULT_DEFAULT_THRESHOLD = 3;
const DEFAULT_LOAN_STATUS: Loan["status"] = "active";

function clampTier(value: number): 1 | 2 | 3 | 4 | 5 {
  return Math.max(1, Math.min(5, Math.round(value))) as 1 | 2 | 3 | 4 | 5;
}

function resolveCareerTier(
  finances: FinancialRecord,
  careerTier?: number,
): 1 | 2 | 3 | 4 | 5 {
  if (careerTier !== undefined) {
    return clampTier(careerTier);
  }
  if (typeof finances.lifestyle?.level === "number") {
    return clampTier(finances.lifestyle.level);
  }
  if (typeof finances.independentTier === "number") {
    return clampTier(finances.independentTier);
  }
  return 1;
}

function getEffectiveRate(
  config: LoanConfig,
  creditScore: number,
): number {
  const creditModifier = 1 - (creditScore / 100) * 0.4;
  return Number((config.monthlyInterestRate * creditModifier).toFixed(6));
}

export function calculateLoanMonthlyPayment(
  principal: number,
  termMonths: number,
  monthlyInterestRate: number,
): number {
  if (principal <= 0 || termMonths <= 0) return 0;
  const totalInterest = principal * monthlyInterestRate * termMonths;
  return Math.max(1, Math.round((principal + totalInterest) / termMonths));
}

function appendLoanAuditEvent(
  finances: FinancialRecord,
  week: number,
  season: number,
  description: string,
  referenceId: string,
): FinancialRecord {
  if (finances.transactions.some((transaction) => transaction.referenceId === referenceId)) {
    return finances;
  }
  return {
    ...finances,
    transactions: [
      ...finances.transactions,
      {
        week,
        season,
        amount: 0,
        description,
        referenceId,
        category: "debt",
      },
    ],
  };
}

function buildLoanOffer(
  finances: FinancialRecord,
  type: LoanType,
  careerTier?: number,
): LoanOffer {
  const normalizedFinances = normalizeCanonicalLoanState(finances);
  const config = LOAN_CONFIGS[type];
  const effectiveCareerTier = resolveCareerTier(normalizedFinances, careerTier);
  const creditScore = getCreditScore(normalizedFinances);
  const interestRate = getEffectiveRate(config, creditScore);
  const contractedRetainerIncome = normalizedFinances.retainerContracts
    .filter((contract) => contract.status === "active")
    .reduce((total, contract) => total + contract.monthlyFee, 0);
  // Independent agencies often borrow before payroll-style income exists.
  // A positive cash reserve supports a bounded secured micro-facility, while
  // active retainers count as recurring underwriting income.
  const monthlyIncome = Math.max(
    0,
    normalizedFinances.monthlyIncome + contractedRetainerIncome,
    Math.min(2_500, Math.max(0, normalizedFinances.balance)),
  );
  const tierCap = config.tierCaps[effectiveCareerTier];
  const incomeMultipleCap = Math.floor(monthlyIncome * config.maxIncomeMultiple);
  const paymentCapacityCap = monthlyIncome > 0
    ? Math.floor((monthlyIncome * 0.35 * config.termMonths) / (1 + interestRate * config.termMonths))
    : 0;
  const emergencyFallbackCap = type === "emergency"
    ? Math.max(500, Math.floor(Math.max(monthlyIncome, 0)))
    : 0;
  const maxAmount = Math.max(
    0,
    Math.min(
      config.maxAmount,
      tierCap,
      type === "emergency" && monthlyIncome <= 0
        ? emergencyFallbackCap
        : Math.min(incomeMultipleCap, paymentCapacityCap || incomeMultipleCap),
    ),
  );

  if (normalizedFinances.activeLoan) {
    return {
      type,
      eligible: false,
      reason: "An existing loan must be resolved before taking another.",
      maxAmount: 0,
      interestRate,
      monthlyPayment: 0,
      termMonths: config.termMonths,
      effectiveCareerTier,
      creditScore,
    };
  }

  if (effectiveCareerTier < config.minTier) {
    return {
      type,
      eligible: false,
      reason: `This facility unlocks at tier ${config.minTier}.`,
      maxAmount: 0,
      interestRate,
      monthlyPayment: 0,
      termMonths: config.termMonths,
      effectiveCareerTier,
      creditScore,
    };
  }

  if (creditScore < config.minCreditScore) {
    return {
      type,
      eligible: false,
      reason: `Credit score ${creditScore} is below the ${config.minCreditScore} required for this loan.`,
      maxAmount: 0,
      interestRate,
      monthlyPayment: 0,
      termMonths: config.termMonths,
      effectiveCareerTier,
      creditScore,
    };
  }

  if (config.reserveLowCash && normalizedFinances.balance >= 1000) {
    return {
      type,
      eligible: false,
      reason: "Emergency lending is reserved for low-cash situations.",
      maxAmount: 0,
      interestRate,
      monthlyPayment: 0,
      termMonths: config.termMonths,
      effectiveCareerTier,
      creditScore,
    };
  }

  if (monthlyIncome <= 0 && type !== "emergency") {
    return {
      type,
      eligible: false,
      reason: "Stable monthly income, contracted retainers, or a cash reserve is required for this loan type.",
      maxAmount: 0,
      interestRate,
      monthlyPayment: 0,
      termMonths: config.termMonths,
      effectiveCareerTier,
      creditScore,
    };
  }

  if (maxAmount <= 0) {
    return {
      type,
      eligible: false,
      reason: "Current income and tier do not support any safe offer for this loan type.",
      maxAmount: 0,
      interestRate,
      monthlyPayment: 0,
      termMonths: config.termMonths,
      effectiveCareerTier,
      creditScore,
    };
  }

  return {
    type,
    eligible: true,
    maxAmount,
    interestRate,
    monthlyPayment: calculateLoanMonthlyPayment(maxAmount, config.termMonths, interestRate),
    termMonths: config.termMonths,
    effectiveCareerTier,
    creditScore,
  };
}

export function getLoanOfferForType(
  finances: FinancialRecord,
  type: LoanType,
  careerTier?: number,
): LoanOffer {
  return buildLoanOffer(finances, type, careerTier);
}

export function getEffectiveLoanOffers(
  finances: FinancialRecord,
  careerTier?: number,
): LoanOffer[] {
  return (Object.keys(LOAN_CONFIGS) as LoanType[]).map((type) =>
    buildLoanOffer(finances, type, careerTier),
  );
}

export function getLoanEligibility(
  finances: FinancialRecord,
  careerTier?: number,
): LoanEligibilitySummary {
  const offers = getEffectiveLoanOffers(finances, careerTier);
  const eligibleOffers = offers.filter((offer) => offer.eligible);
  const effectiveCareerTier = offers[0]?.effectiveCareerTier ?? resolveCareerTier(finances, careerTier);
  return {
    eligible: eligibleOffers.length > 0,
    types: eligibleOffers.map((offer) => offer.type),
    creditScore: offers[0]?.creditScore ?? getCreditScore(normalizeCanonicalLoanState(finances)),
    maxAmount: eligibleOffers.reduce((max, offer) => Math.max(max, offer.maxAmount), 0),
    effectiveCareerTier,
    offers: Object.fromEntries(offers.map((offer) => [offer.type, offer])) as Partial<Record<LoanType, LoanOffer>>,
  };
}

export function takeLoan(
  finances: FinancialRecord,
  type: LoanType,
  amount: number,
  week: number,
  season: number,
  careerTier?: number,
  seasonLength = LEGACY_SEASON_LENGTH_WEEKS,
): FinancialRecord | null {
  const normalizedFinances = normalizeCanonicalLoanState(finances);
  const offer = getLoanOfferForType(normalizedFinances, type, careerTier);
  const principal = Math.round(amount);
  if (!offer.eligible || principal <= 0 || principal > offer.maxAmount) {
    return null;
  }

  const actionSequence = (normalizedFinances.actionSequence ?? 0) + 1;
  const monthlyPayment = calculateLoanMonthlyPayment(
    principal,
    offer.termMonths,
    offer.interestRate,
  );
  const totalRepayment = principal + Math.round(principal * offer.interestRate * offer.termMonths);
  const firstPayment = addGameWeeksWithSeasonLength(
    { week, season },
    4,
    seasonLength,
  );
  const loan: Loan = {
    id: `loan_${type}_s${season}w${week}_a${actionSequence}`,
    type,
    principal,
    monthlyInterestRate: offer.interestRate,
    remainingBalance: totalRepayment,
    monthlyPayment,
    startWeek: week,
    startSeason: season,
    nextPaymentWeek: firstPayment.week,
    nextPaymentSeason: firstPayment.season,
    termMonths: offer.termMonths,
    paymentsMade: 0,
    missedPayments: 0,
    arrears: 0,
    status: DEFAULT_LOAN_STATUS,
  };
  const funded = applyBalanceTransaction(
    normalizedFinances,
    principal,
    week,
    season,
    `${type.charAt(0).toUpperCase() + type.slice(1)} loan received (${Math.round(offer.interestRate * 100)}% interest)`,
    `loan:${loan.id}:disbursement`,
  );

  return {
    ...funded,
    activeLoan: loan,
    actionSequence,
    loans: [],
  };
}

export function processLoanPayment(
  finances: FinancialRecord,
  week: number,
  season: number,
  seasonLength = LEGACY_SEASON_LENGTH_WEEKS,
): FinancialRecord {
  const normalizedFinances = normalizeCanonicalLoanState(finances);
  if (!normalizedFinances.activeLoan) return normalizedFinances;

  const loan = normalizedFinances.activeLoan;
  if (loan.status === "defaulted") {
    return normalizedFinances;
  }
  const hasPaymentDate = Number.isInteger(loan.nextPaymentWeek)
    && Number.isInteger(loan.nextPaymentSeason);
  const paymentDue = hasPaymentDate
    ? isGameDateAtOrAfter(
        { week, season },
        { week: loan.nextPaymentWeek!, season: loan.nextPaymentSeason! },
      )
    : week % 4 === 0;
  if (!paymentDue) return normalizedFinances;

  const paymentReference = `loan:${loan.id}:payment:s${season}w${week}`;
  const delinquencyReference = `loan:${loan.id}:delinquency:s${season}w${week}`;
  const defaultReference = `loan:${loan.id}:default:s${season}w${week}`;
  if (normalizedFinances.transactions.some((transaction) =>
    transaction.referenceId === paymentReference
    || transaction.referenceId === delinquencyReference
    || transaction.referenceId === defaultReference
  )) {
    return normalizedFinances;
  }

  const arrearsBefore = loan.arrears ?? 0;
  const scheduledPayment = Math.min(loan.monthlyPayment, loan.remainingBalance);
  const totalDue = Math.min(loan.remainingBalance, scheduledPayment + arrearsBefore);
  const availableCash = Math.max(0, normalizedFinances.balance);
  const payment = Math.min(availableCash, totalDue);
  const remainingBalance = loan.remainingBalance - payment;
  const currentCycleShortfall = Math.max(0, scheduledPayment - payment);
  const newArrears = Math.max(0, arrearsBefore + scheduledPayment - payment);
  const missedPayments = (loan.missedPayments ?? 0) + (currentCycleShortfall > 0 ? 1 : 0);
  const paymentsMade = (loan.paymentsMade ?? 0) + (payment > 0 ? 1 : 0);
  const onTime = currentCycleShortfall === 0 && arrearsBefore === 0 && payment > 0;
  const defaultedNow = currentCycleShortfall > 0 && missedPayments >= DEFAULT_DEFAULT_THRESHOLD;
  const finalPayment = remainingBalance <= 0;

  let updated = normalizedFinances;
  if (payment > 0) {
    updated = applyBalanceTransaction(
      updated,
      -payment,
      week,
      season,
      finalPayment
        ? "Final loan payment — loan repaid"
        : payment < totalDue
          ? "Partial loan payment"
          : "Monthly loan payment",
      paymentReference,
    );
  }

  if (currentCycleShortfall > 0) {
    updated = appendLoanAuditEvent(
      updated,
      week,
      season,
      defaultedNow
        ? `Loan defaulted after ${missedPayments} missed payment(s).`
        : `Loan payment missed — arrears now ${newArrears}.`,
      defaultedNow ? defaultReference : delinquencyReference,
    );
    updated = creditForMissedPayment(updated);
    if (defaultedNow) {
      updated = creditForLoanDefault(updated);
    }
  } else if (onTime) {
    updated = creditForLoanRepayment(updated);
  }

  if (finalPayment) {
    return {
      ...updated,
      activeLoan: undefined,
      loans: [],
    };
  }

  const nextStatus: Loan["status"] = defaultedNow
    ? "defaulted"
    : newArrears > 0 || (loan.status === "delinquent" && payment === 0)
      ? "delinquent"
      : DEFAULT_LOAN_STATUS;
  const nextPayment = addGameWeeksWithSeasonLength(
    { week, season },
    4,
    seasonLength,
  );

  return {
    ...updated,
    activeLoan: {
      ...loan,
      remainingBalance,
      paymentsMade,
      missedPayments,
      arrears: newArrears,
      status: nextStatus,
      nextPaymentWeek: nextPayment.week,
      nextPaymentSeason: nextPayment.season,
    },
    loans: [],
  };
}

export function repayLoanEarly(
  finances: FinancialRecord,
  week: number,
  season: number,
): FinancialRecord | null {
  const normalizedFinances = normalizeCanonicalLoanState(finances);
  if (!normalizedFinances.activeLoan) return null;

  const remaining = normalizedFinances.activeLoan.remainingBalance;
  if (normalizedFinances.balance < remaining) return null;
  const loanId = normalizedFinances.activeLoan.id;
  const paid = applyBalanceTransaction(
    normalizedFinances,
    -remaining,
    week,
    season,
    "Loan repaid early",
    `loan:${loanId}:early-repayment:s${season}w${week}`,
  );

  return {
    ...paid,
    activeLoan: undefined,
    loans: [],
  };
}
