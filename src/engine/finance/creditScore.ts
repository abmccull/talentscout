/**
 * Credit Score System — tracks financial trustworthiness for loan underwriting.
 */

import type { FinancialRecord } from "../core/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CREDIT_SCORE_MIN = 0;
const CREDIT_SCORE_MAX = 100;
const CREDIT_SCORE_DEFAULT = 50;

/** Points awarded/deducted for various financial events. */
const CREDIT_EVENTS = {
  positiveBalanceMonth: 2,
  onTimeLoanRepayment: 3,
  missedPayment: -5,
  loanDefault: -10,
  negativeBalanceMonth: -3,
  completedRetainer: 1,
} as const;

// ---------------------------------------------------------------------------
// Credit Score Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Get the current credit score, defaulting to 50 if not set.
 */
export function getCreditScore(finances: FinancialRecord): number {
  return finances.creditScore ?? CREDIT_SCORE_DEFAULT;
}

/**
 * Apply a credit score change and return the updated financial record.
 */
export function adjustCreditScore(
  finances: FinancialRecord,
  delta: number,
): FinancialRecord {
  const current = getCreditScore(finances);
  return {
    ...finances,
    creditScore: clamp(current + delta, CREDIT_SCORE_MIN, CREDIT_SCORE_MAX),
  };
}

/**
 * Process monthly credit score updates based on financial health.
 * Called every 4 weeks alongside other monthly processing.
 */
export function processMonthlyCredit(finances: FinancialRecord): FinancialRecord {
  let updated = { ...finances };
  const score = getCreditScore(updated);

  // Positive balance bonus
  if (updated.balance > 0) {
    updated = adjustCreditScore(updated, CREDIT_EVENTS.positiveBalanceMonth);
  }

  // Negative balance penalty
  if (updated.balance < 0) {
    updated = adjustCreditScore(updated, CREDIT_EVENTS.negativeBalanceMonth);
  }

  return updated;
}

/**
 * Credit score change when a loan payment is made on time.
 */
export function creditForLoanRepayment(finances: FinancialRecord): FinancialRecord {
  return adjustCreditScore(finances, CREDIT_EVENTS.onTimeLoanRepayment);
}

/**
 * Credit score change when a loan payment is missed.
 */
export function creditForMissedPayment(finances: FinancialRecord): FinancialRecord {
  return adjustCreditScore(finances, CREDIT_EVENTS.missedPayment);
}

/**
 * Credit score change when a loan is defaulted on.
 */
export function creditForLoanDefault(finances: FinancialRecord): FinancialRecord {
  return adjustCreditScore(finances, CREDIT_EVENTS.loanDefault);
}

/**
 * Credit score change when a retainer contract is completed.
 */
export function creditForRetainerCompleted(finances: FinancialRecord): FinancialRecord {
  return adjustCreditScore(finances, CREDIT_EVENTS.completedRetainer);
}

// ---------------------------------------------------------------------------
// Loan Underwriting
// ---------------------------------------------------------------------------

/** Minimum credit score required per career tier (1-5). */
const TIER_MIN_CREDIT: Record<number, number> = {
  1: 30,
  2: 30,
  3: 40,
  4: 40,
  5: 50,
};

/**
 * Check if a scout qualifies for a loan based on credit score and income.
 */
export function checkLoanEligibility(
  finances: FinancialRecord,
  requestedAmount: number,
  careerTier: number,
): { eligible: boolean; reason?: string; interestRate: number; maxAmount: number } {
  const score = getCreditScore(finances);
  const minScore = TIER_MIN_CREDIT[careerTier] ?? 30;

  // Calculate max loan amount: capped at 6x monthly income
  const maxAmount = Math.min(20000, finances.monthlyIncome * 6);

  // Interest rate inversely tied to credit score
  // Score 100 → 3%, Score 50 → 5%, Score 0 → 10%
  const interestRate = 0.10 - (score / 100) * 0.07;

  if (score < minScore) {
    return {
      eligible: false,
      reason: `Credit score too low (${score}/${minScore} required)`,
      interestRate,
      maxAmount,
    };
  }

  // Deny if existing debt exceeds 50% of monthly income
  const existingDebt = finances.loans.reduce((sum, l) => sum + l.remainingBalance, 0)
    + (finances.activeLoan?.remainingBalance ?? 0);
  if (existingDebt > finances.monthlyIncome * 0.5 && finances.monthlyIncome > 0) {
    return {
      eligible: false,
      reason: "Existing debt exceeds 50% of monthly income",
      interestRate,
      maxAmount,
    };
  }

  if (requestedAmount > maxAmount) {
    return {
      eligible: false,
      reason: `Requested amount exceeds maximum (£${maxAmount.toLocaleString()})`,
      interestRate,
      maxAmount,
    };
  }

  return { eligible: true, interestRate, maxAmount };
}
