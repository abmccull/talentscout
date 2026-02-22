/**
 * Financial dashboard — P&L calculation, cash flow forecasting,
 * revenue/expense breakdown, and net worth computation.
 */

import type {
  FinancialRecord,
  Scout,
  ExpenseType,
} from "../core/types";

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
 * Calculate profit and loss for the current period.
 */
export function calculateProfitAndLoss(
  finances: FinancialRecord,
  scout: Scout,
): ProfitAndLoss {
  const salary = scout.salary * 4; // monthly

  const totalIncome =
    salary +
    finances.reportSalesRevenue +
    finances.placementFeeRevenue +
    finances.retainerRevenue +
    finances.consultingRevenue +
    finances.sellOnRevenue +
    finances.bonusRevenue;

  let totalExpenses = 0;
  for (const key of Object.keys(finances.expenses) as ExpenseType[]) {
    totalExpenses += finances.expenses[key];
  }

  return {
    totalIncome,
    totalExpenses,
    netProfit: totalIncome - totalExpenses,
    incomeBreakdown: {
      salary,
      reportSales: finances.reportSalesRevenue,
      placementFees: finances.placementFeeRevenue,
      retainers: finances.retainerRevenue,
      consulting: finances.consultingRevenue,
      sellOn: finances.sellOnRevenue,
      bonuses: finances.bonusRevenue,
    },
    expenseBreakdown: { ...finances.expenses },
  };
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
  const monthlyIncome = scout.salary * 4;
  const retainerMonthly = finances.retainerContracts
    .filter((r) => r.status === "active")
    .reduce((sum, r) => sum + r.monthlyFee, 0);

  let totalExpenses = 0;
  for (const key of Object.keys(finances.expenses) as ExpenseType[]) {
    totalExpenses += finances.expenses[key];
  }

  // Weekly equivalents
  const weeklyIncome = (monthlyIncome + retainerMonthly) / 4;
  const weeklyExpenses = totalExpenses / 4;

  const weekNumbers: number[] = [];
  const balances: number[] = [];
  let balance = finances.balance;

  for (let i = 1; i <= weeks; i++) {
    // Every 4th week is a payment cycle
    if (i % 4 === 0) {
      balance += monthlyIncome + retainerMonthly - totalExpenses;
    }
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
 * Calculate revenue breakdown by source.
 */
export function calculateRevenueBreakdown(
  finances: FinancialRecord,
  scout: Scout,
): RevenueBreakdown {
  const salary = scout.salary * 4;
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

  // Liabilities
  let liabilities = 0;
  if (finances.activeLoan) {
    liabilities += finances.activeLoan.remainingBalance;
  }

  return assets - liabilities;
}
