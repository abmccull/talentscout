import type { FinancialRecord, Scout } from "../core/types";
import { calculateMonthlyRunRate } from "./dashboard";

export function runwayMonths(balance: number, monthlyIncome: number, monthlyExpenses: number): number {
  if (balance < 0) return 0;
  const burn = monthlyExpenses - monthlyIncome;
  return burn > 0 ? balance / burn : Infinity;
}

export function calculateCashRunway(finances: FinancialRecord | null | undefined, scout: Scout): number | undefined {
  if (!finances) return undefined;
  // Partial/legacy records cannot support a cash-runway claim. Do not turn
  // absent commitments into zero expenses or break otherwise usable dashboards.
  if (!Array.isArray(finances.retainerContracts)
    || !Array.isArray(finances.satelliteOffices)
    || (scout.careerTier >= 4 && !Array.isArray(scout.npcScoutIds))) return undefined;
  const runRate = calculateMonthlyRunRate(finances, scout);
  if (![finances.balance, runRate.totalIncome, runRate.totalExpenses].every(Number.isFinite)) return undefined;
  return runwayMonths(finances.balance, runRate.totalIncome, runRate.totalExpenses);
}
