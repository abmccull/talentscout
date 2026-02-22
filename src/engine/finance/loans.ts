/**
 * Loans & Financing — business loans, equipment financing, and emergency loans
 * with monthly interest payments.
 */

import type {
  FinancialRecord,
  Loan,
  LoanType,
} from "../core/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

interface LoanConfig {
  maxAmount: number;
  monthlyInterestRate: number;
  termMonths: number;
}

const LOAN_CONFIGS: Record<LoanType, LoanConfig> = {
  business: { maxAmount: 20000, monthlyInterestRate: 0.05, termMonths: 12 },
  equipment: { maxAmount: 10000, monthlyInterestRate: 0.10, termMonths: 6 },
  emergency: { maxAmount: 2000, monthlyInterestRate: 0.08, termMonths: 4 },
};

// ---------------------------------------------------------------------------
// Loan eligibility
// ---------------------------------------------------------------------------

/**
 * Check what loan types the scout is eligible for.
 */
export function getLoanEligibility(
  finances: FinancialRecord,
): { eligible: boolean; types: LoanType[] } {
  // Can't take a loan if already has one
  if (finances.activeLoan) {
    return { eligible: false, types: [] };
  }

  const types: LoanType[] = [];

  // Business loan requires positive balance history
  if (finances.balance >= 0) {
    types.push("business");
  }

  // Equipment loan is always available
  types.push("equipment");

  // Emergency loan available when balance is low
  if (finances.balance < 500) {
    types.push("emergency");
  }

  return { eligible: types.length > 0, types };
}

// ---------------------------------------------------------------------------
// Loan operations
// ---------------------------------------------------------------------------

/**
 * Take out a loan. Returns null if already has an active loan or amount exceeds max.
 */
export function takeLoan(
  finances: FinancialRecord,
  type: LoanType,
  amount: number,
  week: number,
  season: number,
): FinancialRecord | null {
  if (finances.activeLoan) return null;

  const config = LOAN_CONFIGS[type];
  if (amount > config.maxAmount) return null;
  if (amount <= 0) return null;

  // Calculate monthly payment (simple amortization)
  const totalInterest = amount * config.monthlyInterestRate * config.termMonths;
  const totalRepayment = amount + totalInterest;
  const monthlyPayment = Math.round(totalRepayment / config.termMonths);

  const loan: Loan = {
    id: `loan_${type}_${week}_${season}`,
    type,
    principal: amount,
    monthlyInterestRate: config.monthlyInterestRate,
    remainingBalance: totalRepayment,
    monthlyPayment,
    startWeek: week,
    startSeason: season,
  };

  return {
    ...finances,
    balance: finances.balance + amount,
    activeLoan: loan,
    transactions: [
      ...finances.transactions,
      {
        week,
        season,
        amount,
        description: `${type.charAt(0).toUpperCase() + type.slice(1)} loan received`,
      },
    ],
  };
}

/**
 * Process monthly loan payment. Called every 4 weeks.
 */
export function processLoanPayment(
  finances: FinancialRecord,
  week: number,
  season: number,
): FinancialRecord {
  if (!finances.activeLoan) return finances;
  if (week % 4 !== 0) return finances;

  const loan = finances.activeLoan;
  const payment = Math.min(loan.monthlyPayment, loan.remainingBalance);
  const newBalance = loan.remainingBalance - payment;

  // Loan fully repaid
  if (newBalance <= 0) {
    return {
      ...finances,
      balance: finances.balance - payment,
      activeLoan: undefined,
      transactions: [
        ...finances.transactions,
        {
          week,
          season,
          amount: -payment,
          description: "Final loan payment — loan repaid",
        },
      ],
    };
  }

  return {
    ...finances,
    balance: finances.balance - payment,
    activeLoan: { ...loan, remainingBalance: newBalance },
    transactions: [
      ...finances.transactions,
      {
        week,
        season,
        amount: -payment,
        description: "Monthly loan payment",
      },
    ],
  };
}

/**
 * Repay the remaining loan balance early.
 */
export function repayLoanEarly(
  finances: FinancialRecord,
  week: number,
  season: number,
): FinancialRecord | null {
  if (!finances.activeLoan) return null;

  const remaining = finances.activeLoan.remainingBalance;
  if (finances.balance < remaining) return null;

  return {
    ...finances,
    balance: finances.balance - remaining,
    activeLoan: undefined,
    transactions: [
      ...finances.transactions,
      {
        week,
        season,
        amount: -remaining,
        description: "Loan repaid early",
      },
    ],
  };
}
