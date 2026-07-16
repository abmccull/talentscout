/**
 * Financial dashboard — P&L calculation, cash flow forecasting,
 * revenue/expense breakdown, and net worth computation.
 */

import type {
  FinancialRecord,
  Scout,
  ExpenseType,
} from "../core/types";
import { getAgencyCapacity, type AgencyCapacity } from "./agencyCapacity";
import { getEquipmentItem } from "./equipmentCatalog";
import { calculateMonthlyExpenses } from "./expenses";
import {
  MONTHS_PER_YEAR,
  WEEKS_PER_YEAR,
  monthlyEquivalentOfWeeklyAmount,
} from "../core/annualization";

// ---------------------------------------------------------------------------
// P&L
// ---------------------------------------------------------------------------

export interface ProfitAndLoss {
  totalIncome: number;
  totalExpenses: number;
  netProfit: number;
  incomeBreakdown: {
    salary: number;
    reportSales: number;
    placementFees: number;
    retainers: number;
    consulting: number;
    sellOn: number;
    bonuses: number;
  };
  expenseBreakdown: Record<ExpenseType, number>;
}

/**
 * Calculate the recurring monthly operating run rate.
 *
 * One-off report, placement, consulting, sell-on, and award revenue is tracked
 * over the career and must not be mixed into a single month's recurring P&L.
 */
export function calculateMonthlyRunRate(
  finances: FinancialRecord,
  scout: Scout,
): ProfitAndLoss {
  const salary = scout.careerPath === "club"
    ? monthlyEquivalentOfWeeklyAmount(scout.salary)
    : 0;
  const retainers = finances.retainerContracts
    .filter((contract) => contract.status === "active")
    .reduce((total, contract) => total + contract.monthlyFee, 0);

  const totalIncome = salary + retainers;

  const liveExpenses = calculateMonthlyExpenses(scout, finances);
  let totalExpenses = 0;
  for (const key of Object.keys(liveExpenses) as ExpenseType[]) {
    totalExpenses += liveExpenses[key];
  }

  return {
    totalIncome,
    totalExpenses,
    netProfit: totalIncome - totalExpenses,
    incomeBreakdown: {
      salary,
      reportSales: 0,
      placementFees: 0,
      retainers,
      consulting: 0,
      sellOn: 0,
      bonuses: 0,
    },
    expenseBreakdown: liveExpenses,
  };
}

export interface AgencyHealthMetrics {
  contractedMonthlyRevenue: number;
  revenueAtRisk: number;
  securedMonthlyRevenue: number;
  monthlyOperatingCost: number;
  operatingProfit: number;
  runwayMonths: number | null;
  clientConcentration: number;
  capacity: AgencyCapacity;
}

/**
 * Decision-facing business health. It deliberately avoids accounting jargon:
 * can the agency deliver its promises, how concentrated is its income, and
 * how long can it survive at the current burn?
 */
export function calculateAgencyHealth(
  finances: FinancialRecord,
  scout: Scout,
): AgencyHealthMetrics {
  const committedRetainers = finances.retainerContracts.filter(
    (contract) => contract.status === "active" || contract.status === "suspended",
  );
  const contractedMonthlyRevenue = committedRetainers.reduce(
    (total, contract) => total + contract.monthlyFee,
    0,
  );
  const securedMonthlyRevenue = committedRetainers.reduce((total, contract) => {
    if (contract.status === "suspended") return total;
    const deliveryProgress = contract.requiredReportsPerMonth > 0
      ? Math.min(1, contract.reportsDeliveredThisMonth / contract.requiredReportsPerMonth)
      : 1;
    return total + Math.round(contract.monthlyFee * deliveryProgress);
  }, 0);
  const monthlyOperatingCost = Object.values(calculateMonthlyExpenses(scout, finances)).reduce(
    (total, amount) => total + amount,
    0,
  );
  const salary = scout.careerPath === "club"
    ? monthlyEquivalentOfWeeklyAmount(scout.salary)
    : 0;
  const operatingProfit = salary + contractedMonthlyRevenue - monthlyOperatingCost;
  const monthlyBurn = Math.max(0, -operatingProfit);
  const largestClient = committedRetainers.reduce(
    (largest, contract) => Math.max(largest, contract.monthlyFee),
    0,
  );

  return {
    contractedMonthlyRevenue,
    revenueAtRisk: Math.max(0, contractedMonthlyRevenue - securedMonthlyRevenue),
    securedMonthlyRevenue,
    monthlyOperatingCost,
    operatingProfit,
    runwayMonths: monthlyBurn > 0
      ? Math.max(0, Math.round((finances.balance / monthlyBurn) * 10) / 10)
      : null,
    clientConcentration: contractedMonthlyRevenue > 0
      ? largestClient / contractedMonthlyRevenue
      : 0,
    capacity: getAgencyCapacity(finances, scout),
  };
}

/** @deprecated Use calculateMonthlyRunRate for explicit period semantics. */
export function calculateProfitAndLoss(
  finances: FinancialRecord,
  scout: Scout,
): ProfitAndLoss {
  return calculateMonthlyRunRate(finances, scout);
}

// ---------------------------------------------------------------------------
// Cash flow forecast
// ---------------------------------------------------------------------------

export interface CashFlowForecast {
  weeks: number[];
  projectedBalance: number[];
  weeklyIncome: number;
  weeklyExpenses: number;
}

/**
 * Project the scout's balance forward for the given number of weeks.
 * Assumes current income/expense rates hold steady.
 */
export function forecastCashFlow(
  finances: FinancialRecord,
  scout: Scout,
  weeks: number,
): CashFlowForecast {
  const monthlyIncome = scout.careerPath === "club"
    ? monthlyEquivalentOfWeeklyAmount(scout.salary)
    : 0;
  const retainerMonthly = finances.retainerContracts
    .filter((r) => r.status === "active")
    .reduce((sum, r) => sum + r.monthlyFee, 0);

  const liveExpenses = calculateMonthlyExpenses(scout, finances);
  let totalExpenses = 0;
  for (const key of Object.keys(liveExpenses) as ExpenseType[]) {
    totalExpenses += liveExpenses[key];
  }

  // Calendar-equivalent weekly rates. A calendar month is not exactly four
  // weeks, so use 12/52 to avoid overstating annual income and burn.
  const weeklyIncome = (monthlyIncome + retainerMonthly)
    * MONTHS_PER_YEAR / WEEKS_PER_YEAR;
  const weeklyExpenses = totalExpenses * MONTHS_PER_YEAR / WEEKS_PER_YEAR;

  const weekNumbers: number[] = [];
  const balances: number[] = [];
  let balance = finances.balance;

  for (let i = 1; i <= weeks; i++) {
    balance += weeklyIncome - weeklyExpenses;
    weekNumbers.push(i);
    balances.push(Math.round(balance));
  }

  return {
    weeks: weekNumbers,
    projectedBalance: balances,
    weeklyIncome: Math.round(weeklyIncome),
    weeklyExpenses: Math.round(weeklyExpenses),
  };
}

// ---------------------------------------------------------------------------
// Revenue breakdown
// ---------------------------------------------------------------------------

export interface RevenueBreakdown {
  salary: number;
  reportSales: number;
  placementFees: number;
  retainers: number;
  consulting: number;
  sellOn: number;
  bonuses: number;
  total: number;
}

/**
 * Calculate ledger-recorded lifetime revenue by source.
 */
export function calculateRevenueBreakdown(
  finances: FinancialRecord,
  _scout: Scout,
): RevenueBreakdown {
  const salary = finances.transactions.reduce((total, transaction) => {
    const isSalary = transaction.referenceId?.endsWith(":scout-income")
      || transaction.description === "Monthly salary";
    return isSalary ? total + Math.max(0, transaction.amount) : total;
  }, 0);
  return {
    salary,
    reportSales: finances.reportSalesRevenue,
    placementFees: finances.placementFeeRevenue,
    retainers: finances.retainerRevenue,
    consulting: finances.consultingRevenue,
    sellOn: finances.sellOnRevenue,
    bonuses: finances.bonusRevenue,
    total:
      salary +
      finances.reportSalesRevenue +
      finances.placementFeeRevenue +
      finances.retainerRevenue +
      finances.consultingRevenue +
      finances.sellOnRevenue +
      finances.bonusRevenue,
  };
}

// ---------------------------------------------------------------------------
// Net worth
// ---------------------------------------------------------------------------

/**
 * Calculate the scout's net worth.
 * Assets: balance + vehicle value + equipment resale
 * Liabilities: active loan balance
 */
export function calculateNetWorth(finances: FinancialRecord): number {
  let assets = finances.balance;

  // Vehicle value
  if (finances.ownedVehicle) {
    assets += finances.ownedVehicle.value;
  }

  if (finances.equipment) {
    assets += finances.equipment.ownedItems.reduce((total, itemId) => {
      const item = getEquipmentItem(itemId);
      return total + Math.round((item?.purchaseCost ?? 0) * 0.4);
    }, 0);
  }

  // Liabilities
  let liabilities = 0;
  if (finances.activeLoan) {
    liabilities += finances.activeLoan.remainingBalance;
  }

  return assets - liabilities;
}
