/**
 * Loans & Financing — business loans, equipment financing, and emergency loans
 * with monthly interest payments.
 */

import type {
  FinancialRecord,
  Loan,
  LoanType,
} from "../core/types";
import { getCreditScore, checkLoanEligibility } from "./creditScore";

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
 * Now factors in credit score and income for underwriting.
 */
export function getLoanEligibility(
  finances: FinancialRecord,
  careerTier?: number,
): { eligible: boolean; types: LoanType[]; creditScore: number; maxAmount: number } {
  // Can't take a loan if already has one
  if (finances.activeLoan) {
    return { eligible: false, types: [], creditScore: getCreditScore(finances), maxAmount: 0 };
  }

  const score = getCreditScore(finances);
  const types: LoanType[] = [];

  // Business loan requires positive balance and decent credit
  if (finances.balance >= 0 && score >= (careerTier && careerTier >= 4 ? 40 : 30)) {
    types.push("business");
  }

  // Equipment loan available if credit score is at least 20
  if (score >= 20) {
    types.push("equipment");
  }

  // Emergency loan available when balance is low (less restrictive)
  if (finances.balance < 500) {
    types.push("emergency");
  }

  const maxAmount = Math.min(20000, finances.monthlyIncome * 6);

  return { eligible: types.length > 0, types, creditScore: score, maxAmount };
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

  // Dynamic interest rate based on credit score
  const score = getCreditScore(finances);
  const baseRate = config.monthlyInterestRate;
  // Better credit = lower rate (up to 40% reduction at score 100)
  const creditModifier = 1 - (score / 100) * 0.4;
  const effectiveRate = baseRate * creditModifier;

  // Calculate monthly payment (simple amortization)
  const totalInterest = amount * effectiveRate * config.termMonths;
  const totalRepayment = amount + totalInterest;
  const monthlyPayment = Math.round(totalRepayment / config.termMonths);

  const loan: Loan = {
    id: `loan_${type}_${week}_${season}`,
    type,
    principal: amount,
    monthlyInterestRate: effectiveRate,
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
        description: `${type.charAt(0).toUpperCase() + type.slice(1)} loan received (${Math.round(effectiveRate * 100)}% interest)`,
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
