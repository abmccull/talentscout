"use client";

import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Wallet,
  BarChart2,
  FileText,
  Users,
  AlertCircle,
} from "lucide-react";
import {
  calculateProfitAndLoss,
  forecastCashFlow,
  calculateRevenueBreakdown,
  calculateNetWorth,
} from "@/engine/finance";
import type { ExpenseType } from "@/engine/core/types";

// ─── Formatters ──────────────────────────────────────────────────────────────

function formatCurrency(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}£${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}£${(abs / 1_000).toFixed(1)}K`;
  return `${sign}£${abs.toLocaleString()}`;
}

function amountColor(n: number): string {
  return n >= 0 ? "text-emerald-400" : "text-red-400";
}

// ─── Labels ──────────────────────────────────────────────────────────────────

const INCOME_LABELS: Record<string, string> = {
  salary: "Salary",
  reportSales: "Report Sales",
  placementFees: "Placement Fees",
  retainers: "Retainers",
  consulting: "Consulting",
  sellOn: "Sell-On Clauses",
  bonuses: "Bonuses",
};

const EXPENSE_LABELS: Record<ExpenseType, string> = {
  rent: "Rent",
  travel: "Travel",
  subscriptions: "Subscriptions",
  equipment: "Equipment",
  npcSalaries: "NPC Salaries",
  other: "Other",
  lifestyle: "Lifestyle",
  officeCost: "Office",
  employeeSalaries: "Employee Salaries",
  marketing: "Marketing",
  loanPayment: "Loan Repayment",
  courseFees: "Course Fees",
  insurance: "Insurance",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

interface BreakdownRowProps {
  label: string;
  amount: number;
  total: number;
  accentClass?: string;
}

function BreakdownRow({ label, amount, total, accentClass = "bg-emerald-500" }: BreakdownRowProps) {
  const pct = total > 0 ? Math.round((amount / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-zinc-400">{label}</span>
        <span className="font-semibold text-white">{formatCurrency(amount)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full transition-all ${accentClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── FinancialDashboard ───────────────────────────────────────────────────────

export function FinancialDashboard() {
  const { gameState } = useGameStore();

  if (!gameState?.finances) {
    return (
      <GameLayout>
        <div className="p-6 text-zinc-400">No financial data available.</div>
      </GameLayout>
    );
  }

  const { finances, scout } = gameState;

  const pnl = calculateProfitAndLoss(finances, scout);
  const revenue = calculateRevenueBreakdown(finances, scout);
  const netWorth = calculateNetWorth(finances);
  const forecast = forecastCashFlow(finances, scout, 12);

  const activeRetainers = finances.retainerContracts.filter((r) => r.status === "active");
  const retainerMonthlyTotal = activeRetainers.reduce((sum, r) => sum + r.monthlyFee, 0);
  const activeConsulting = finances.consultingContracts.filter((c) => c.status === "active");
  const isIndependent = finances.careerPath === "independent";

  const incomeEntries = Object.entries(revenue).filter(
    ([key, val]) => key !== "total" && (val as number) > 0,
  ) as [string, number][];

  const expenseEntries = (Object.entries(pnl.expenseBreakdown) as [ExpenseType, number][]).filter(
    ([, val]) => val > 0,
  );

  return (
    <GameLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Financial Dashboard</h1>
          <p className="text-sm text-zinc-400">
            {isIndependent ? "Independent Scout" : "Club Scout"} — current period overview
          </p>
        </div>

        {/* ── Overview cards ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Balance</p>
                  <p className={`text-xl font-bold ${amountColor(finances.balance)}`}>
                    {formatCurrency(finances.balance)}
                  </p>
                </div>
                <Wallet size={18} className="text-zinc-600 mt-0.5" aria-hidden="true" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Net Worth</p>
                  <p className={`text-xl font-bold ${amountColor(netWorth)}`}>
                    {formatCurrency(netWorth)}
                  </p>
                </div>
                <DollarSign size={18} className="text-zinc-600 mt-0.5" aria-hidden="true" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Monthly Income</p>
                  <p className="text-xl font-bold text-emerald-400">
                    {formatCurrency(pnl.totalIncome)}
                  </p>
                </div>
                <TrendingUp size={18} className="text-emerald-600 mt-0.5" aria-hidden="true" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Monthly Expenses</p>
                  <p className="text-xl font-bold text-red-400">
                    {formatCurrency(pnl.totalExpenses)}
                  </p>
                </div>
                <TrendingDown size={18} className="text-red-600 mt-0.5" aria-hidden="true" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Net profit callout ──────────────────────────────────────────── */}
        <div
          className={`rounded-lg border px-4 py-3 flex items-center justify-between ${
            pnl.netProfit >= 0
              ? "border-emerald-500/30 bg-emerald-500/5"
              : "border-red-500/30 bg-red-500/5"
          }`}
        >
          <span className="text-sm text-zinc-400">Net Monthly Profit / Loss</span>
          <span className={`text-lg font-bold ${amountColor(pnl.netProfit)}`}>
            {pnl.netProfit >= 0 ? "+" : ""}
            {formatCurrency(pnl.netProfit)}
          </span>
        </div>

        {/* ── Breakdown columns ───────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Income breakdown */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <BarChart2 size={14} className="text-emerald-400" aria-hidden="true" />
                Income Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {incomeEntries.length === 0 ? (
                <p className="text-xs text-zinc-600">No income recorded this period.</p>
              ) : (
                incomeEntries.map(([key, amount]) => (
                  <BreakdownRow
                    key={key}
                    label={INCOME_LABELS[key] ?? key}
                    amount={amount}
                    total={revenue.total}
                    accentClass="bg-emerald-500"
                  />
                ))
              )}
              {revenue.total > 0 && (
                <div className="border-t border-[#27272a] pt-2 flex items-center justify-between text-xs">
                  <span className="text-zinc-500">Total</span>
                  <span className="font-bold text-emerald-400">{formatCurrency(revenue.total)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Expense breakdown */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <TrendingDown size={14} className="text-red-400" aria-hidden="true" />
                Expense Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {expenseEntries.length === 0 ? (
                <p className="text-xs text-zinc-600">No expenses recorded this period.</p>
              ) : (
                expenseEntries.map(([key, amount]) => (
                  <BreakdownRow
                    key={key}
                    label={EXPENSE_LABELS[key] ?? key}
                    amount={amount}
                    total={pnl.totalExpenses}
                    accentClass="bg-red-500"
                  />
                ))
              )}
              {pnl.totalExpenses > 0 && (
                <div className="border-t border-[#27272a] pt-2 flex items-center justify-between text-xs">
                  <span className="text-zinc-500">Total</span>
                  <span className="font-bold text-red-400">{formatCurrency(pnl.totalExpenses)}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Cash flow forecast ──────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <TrendingUp size={14} className="text-blue-400" aria-hidden="true" />
              12-Week Cash Flow Forecast
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex gap-6 text-xs">
              <div>
                <span className="text-zinc-500">Weekly income rate: </span>
                <span className="text-emerald-400 font-semibold">
                  {formatCurrency(forecast.weeklyIncome)}/wk
                </span>
              </div>
              <div>
                <span className="text-zinc-500">Weekly expense rate: </span>
                <span className="text-red-400 font-semibold">
                  {formatCurrency(forecast.weeklyExpenses)}/wk
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs" aria-label="12-week cash flow projection">
                <thead>
                  <tr className="border-b border-[#27272a]">
                    {forecast.weeks.map((w) => (
                      <th
                        key={w}
                        scope="col"
                        className="pb-1.5 text-center font-medium text-zinc-500 min-w-[52px]"
                      >
                        Wk {w}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {forecast.projectedBalance.map((bal, i) => (
                      <td
                        key={forecast.weeks[i]}
                        className={`pt-2 text-center font-mono font-semibold ${amountColor(bal)}`}
                      >
                        {formatCurrency(bal)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[10px] text-zinc-600">
              Payments cycle every 4 weeks. Variable income (report sales, fees) is not projected.
            </p>
          </CardContent>
        </Card>

        {/* ── Active contracts (independent path only) ────────────────────── */}
        {isIndependent && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Retainer contracts */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <FileText size={14} className="text-amber-400" aria-hidden="true" />
                  Retainer Contracts
                  <span className="ml-auto text-xs text-zinc-500 font-normal">
                    {activeRetainers.length} active
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {activeRetainers.length === 0 ? (
                  <p className="text-xs text-zinc-600">No active retainer contracts.</p>
                ) : (
                  <>
                    {activeRetainers.map((r) => (
                      <div
                        key={r.id}
                        className="rounded-md border border-[#27272a] px-3 py-2 text-xs"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-zinc-400">Tier {r.tier} Retainer</span>
                          <span className="text-emerald-400 font-semibold">
                            {formatCurrency(r.monthlyFee)}/mo
                          </span>
                        </div>
                        <div className="text-zinc-600">
                          {r.reportsDeliveredThisMonth}/{r.requiredReportsPerMonth} reports delivered
                        </div>
                      </div>
                    ))}
                    <div className="border-t border-[#27272a] pt-2 flex items-center justify-between text-xs">
                      <span className="text-zinc-500">Monthly total</span>
                      <span className="font-bold text-emerald-400">
                        {formatCurrency(retainerMonthlyTotal)}/mo
                      </span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Consulting contracts + loan */}
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Users size={14} className="text-blue-400" aria-hidden="true" />
                    Consulting Contracts
                    <span className="ml-auto text-xs text-zinc-500 font-normal">
                      {activeConsulting.length} active
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {activeConsulting.length === 0 ? (
                    <p className="text-xs text-zinc-600">No active consulting contracts.</p>
                  ) : (
                    activeConsulting.map((c) => (
                      <div
                        key={c.id}
                        className="rounded-md border border-[#27272a] px-3 py-2 text-xs"
                      >
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="capitalize text-zinc-400">
                            {c.type.replace(/([A-Z])/g, " $1").trim()}
                          </span>
                          <span className="text-emerald-400 font-semibold">
                            {formatCurrency(c.fee)}
                          </span>
                        </div>
                        <div className="text-zinc-600">
                          Deadline: S{c.deadlineSeason} W{c.deadline}
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              {finances.activeLoan && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <AlertCircle size={14} className="text-red-400" aria-hidden="true" />
                      Active Loan
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500 capitalize">{finances.activeLoan.type} loan</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500">Remaining balance</span>
                      <span className="text-red-400 font-semibold">
                        {formatCurrency(finances.activeLoan.remainingBalance)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500">Monthly payment</span>
                      <span className="text-red-400 font-semibold">
                        {formatCurrency(finances.activeLoan.monthlyPayment)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </GameLayout>
  );
}
