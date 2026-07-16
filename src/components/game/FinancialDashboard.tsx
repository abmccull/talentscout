"use client";

import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Wallet,
  BarChart2,
  FileText,
  Users,
  AlertCircle,
  Banknote,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";
import {
  calculateMonthlyRunRate,
  forecastCashFlow,
  calculateRevenueBreakdown,
  calculateNetWorth,
  getLoanEligibility,
  getEquipmentItem,
  ALL_EQUIPMENT_SLOTS,
} from "@/engine/finance";
import { calculateAgencyHealth } from "@/engine/finance/dashboard";
import {
  canAcceptConsultingWork,
  canAcceptRetainerWork,
} from "@/engine/finance/agencyCapacity";
import { canCompleteConsulting } from "@/engine/finance/consulting";
import type { ExpenseType, LoanType } from "@/engine/core/types";
import type { EquipmentSlot } from "@/engine/finance";
import { gameWeeksBetween } from "@/engine/core/gameDate";

// ─── Constants ──────────────────────────────────────────────────────────────

const LOAN_LABELS: Record<LoanType, string> = {
  business: "Business",
  equipment: "Equipment",
  emergency: "Emergency",
};

const CONSULTING_TYPE_LABELS: Record<string, string> = {
  transferAdvisory: "Transfer Advisory",
  youthAudit: "Youth Audit",
  dataPackage: "Data Package",
  talentWorkshop: "Talent Workshop",
};

type TabKey = "overview" | "contracts" | "revenue";

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
  const {
    finances,
    scout,
    clubs,
    fixtures,
    currentSeason,
    currentWeek,
    playersById,
    takeLoanAction,
    repayLoanAction,
    acceptRetainerContract,
    cancelRetainerContract,
    acceptConsultingContract,
    declineRetainerOffer,
    declineConsultingOffer,
    completeConsultingContract,
    sellEquipmentForCashAction,
  } = useGameStore(
    useShallow((state) => ({
      finances: state.gameState?.finances,
      scout: state.gameState?.scout,
      clubs: state.gameState?.clubs,
      fixtures: state.gameState?.fixtures,
      currentSeason: state.gameState?.currentSeason,
      currentWeek: state.gameState?.currentWeek,
      playersById: state.gameState?.players,
      takeLoanAction: state.takeLoanAction,
      repayLoanAction: state.repayLoanAction,
      acceptRetainerContract: state.acceptRetainerContract,
      cancelRetainerContract: state.cancelRetainerContract,
      acceptConsultingContract: state.acceptConsultingContract,
      declineRetainerOffer: state.declineRetainerOffer,
      declineConsultingOffer: state.declineConsultingOffer,
      completeConsultingContract: state.completeConsultingContract,
      sellEquipmentForCashAction: state.sellEquipmentForCashAction,
    })),
  );
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [selectedLoanType, setSelectedLoanType] = useState<LoanType | null>(null);
  const [loanAmount, setLoanAmount] = useState(1000);

  if (
    !finances
    || !scout
    || !clubs
    || !fixtures
    || currentSeason == null
    || currentWeek == null
    || !playersById
  ) {
    return (
      <GameLayout>
        <div className="p-6 text-zinc-400">No financial data available.</div>
      </GameLayout>
    );
  }

  const monthlyRunRate = calculateMonthlyRunRate(finances, scout);
  const lifetimeRevenue = calculateRevenueBreakdown(finances, scout);
  const netWorth = calculateNetWorth(finances);
  const forecast = forecastCashFlow(finances, scout, 12);
  const agencyHealth = calculateAgencyHealth(finances, scout);

  const activeRetainers = finances.retainerContracts.filter((r) => r.status === "active");
  const suspendedRetainers = finances.retainerContracts.filter((r) => r.status === "suspended");
  const retainerMonthlyTotal = activeRetainers.reduce((sum, r) => sum + r.monthlyFee, 0);
  const activeConsulting = finances.consultingContracts.filter((c) => c.status === "active");
  const isIndependent = finances.careerPath === "independent";

  const pendingRetainers = finances.pendingRetainerOffers ?? [];
  const pendingConsulting = finances.pendingConsultingOffers ?? [];
  const hasPendingOffers = pendingRetainers.length > 0 || pendingConsulting.length > 0;

  const incomeEntries = Object.entries(monthlyRunRate.incomeBreakdown).filter(
    ([, val]) => (val as number) > 0,
  ) as [string, number][];

  const expenseEntries = (Object.entries(monthlyRunRate.expenseBreakdown) as [ExpenseType, number][]).filter(
    ([, val]) => val > 0,
  );

  const loanEligibility = getLoanEligibility(finances, scout.careerTier);

  const getClubName = (clubId: string) => clubs[clubId]?.name ?? "Unknown Club";

  const calcMonthlyPayment = (type: LoanType, amount: number) => {
    const offer = loanEligibility.offers[type];
    if (!offer) return 0;
    const totalInterest = amount * offer.interestRate * offer.termMonths;
    return Math.round((amount + totalInterest) / offer.termMonths);
  };

  const tabs: { key: TabKey; label: string; badge?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "contracts", label: "Contracts", badge: hasPendingOffers ? pendingRetainers.length + pendingConsulting.length : undefined },
    { key: "revenue", label: "Revenue History" },
  ];

  return (
    <GameLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Financial Dashboard</h1>
            <p className="text-sm text-zinc-400">
              {isIndependent ? "Independent Scout" : "Club Scout"} — current period overview
            </p>
          </div>
        </div>

        {/* ── Tab bar ──────────────────────────────────────────────────── */}
        <div className="flex gap-1 border-b border-zinc-800 pb-px">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative rounded-t-md px-4 py-2 text-sm font-medium transition cursor-pointer ${
                activeTab === tab.key
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {tab.label}
              {tab.badge != null && tab.badge > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-black min-w-[18px]">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Financial Distress Banner ──────────────────────────────── */}
        {finances.distressLevel && finances.distressLevel !== "healthy" && (
          <div className={`rounded-lg border p-4 ${
            finances.distressLevel === "bankruptcy"
              ? "border-red-500 bg-red-950/50"
              : finances.distressLevel === "critical"
                ? "border-red-600 bg-red-950/30"
                : finances.distressLevel === "distressed"
                  ? "border-orange-600 bg-orange-950/30"
                  : "border-yellow-600 bg-yellow-950/30"
          }`}>
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className={`h-4 w-4 ${
                finances.distressLevel === "bankruptcy" || finances.distressLevel === "critical"
                  ? "text-red-400"
                  : finances.distressLevel === "distressed"
                    ? "text-orange-400"
                    : "text-yellow-400"
              }`} />
              <span className="text-sm font-semibold text-white">
                {finances.distressLevel === "bankruptcy" ? "BANKRUPTCY" :
                 finances.distressLevel === "critical" ? "Financial Crisis" :
                 finances.distressLevel === "distressed" ? "Financial Distress" :
                 "Financial Warning"}
              </span>
              {finances.weeksInDistress != null && finances.weeksInDistress > 0 && (
                <Badge variant="outline" className="text-xs border-zinc-600">
                  {finances.weeksInDistress} weeks
                </Badge>
              )}
            </div>
            <p className="text-xs text-zinc-400">
              {finances.distressLevel === "bankruptcy"
                ? "All contracts terminated. Equipment liquidated. Reputation halved. Recovery in progress."
                : finances.distressLevel === "critical"
                  ? "Staff departing. Clients pulling contracts. Immediate action required."
                  : finances.distressLevel === "distressed"
                    ? "Forced cutbacks active. Reputation declining. Reduce expenses or increase income."
                    : "Balance has been negative for over 2 weeks. Take action to avoid escalation."}
            </p>
            {/* Emergency: Sell Equipment for Cash */}
            {finances.distressLevel !== "bankruptcy" && finances.equipment && (() => {
              const totalValue = ALL_EQUIPMENT_SLOTS.reduce((sum, slot) => {
                const itemId = finances.equipment?.loadout[slot as EquipmentSlot];
                const item = itemId ? getEquipmentItem(itemId) : null;
                return sum + (item?.purchaseCost ?? 0);
              }, 0);
              if (totalValue <= 0) return null;
              const saleValue = Math.floor(totalValue * 0.4);
              return (
                <Button
                  size="sm"
                  variant="destructive"
                  className="mt-3"
                  onClick={() => sellEquipmentForCashAction(totalValue)}
                >
                  <AlertCircle size={12} className="mr-1.5" />
                  Emergency: Sell Equipment for £{saleValue.toLocaleString()}
                </Button>
              );
            })()}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* OVERVIEW TAB                                                   */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {activeTab === "overview" && (
          <>
            {/* Overview cards */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" data-tutorial-id="finances-overview">
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
                      <p className="text-xs text-zinc-500 mb-1">Recurring Monthly Income</p>
                      <p className="text-xl font-bold text-emerald-400">
                        {formatCurrency(monthlyRunRate.totalIncome)}
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
                        {formatCurrency(monthlyRunRate.totalExpenses)}
                      </p>
                    </div>
                    <TrendingDown size={18} className="text-red-600 mt-0.5" aria-hidden="true" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Net profit callout */}
            <div
              className={`rounded-lg border px-4 py-3 flex items-center justify-between ${
                monthlyRunRate.netProfit >= 0
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : "border-red-500/30 bg-red-500/5"
              }`}
            >
              <span className="text-sm text-zinc-400">Recurring Monthly Run Rate</span>
              <span className={`text-lg font-bold ${amountColor(monthlyRunRate.netProfit)}`}>
                {monthlyRunRate.netProfit >= 0 ? "+" : ""}
                {formatCurrency(monthlyRunRate.netProfit)}
              </span>
            </div>

            {isIndependent && (
              <Card className="border-emerald-400/20 bg-emerald-400/[0.04]">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between text-sm">
                    <span>Agency pulse</span>
                    <Badge
                      variant={agencyHealth.capacity.utilization > 1 ? "destructive" : "outline"}
                      className="text-[10px]"
                    >
                      {Math.round(agencyHealth.capacity.utilization * 100)}% committed
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-zinc-500">Report capacity</p>
                    <p className="mt-1 text-lg font-semibold text-white">
                      {agencyHealth.capacity.committedReportWork}/{agencyHealth.capacity.monthlyReportCapacity}
                    </p>
                    <p className="text-[10px] text-zinc-500">monthly work units</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-zinc-500">Revenue at risk</p>
                    <p className={`mt-1 text-lg font-semibold ${agencyHealth.revenueAtRisk > 0 ? "text-amber-300" : "text-emerald-300"}`}>
                      {formatCurrency(agencyHealth.revenueAtRisk)}
                    </p>
                    <p className="text-[10px] text-zinc-500">still needs delivery</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-zinc-500">Cash runway</p>
                    <p className="mt-1 text-lg font-semibold text-white">
                      {agencyHealth.runwayMonths == null ? "Sustainable" : `${agencyHealth.runwayMonths} mo`}
                    </p>
                    <p className="text-[10px] text-zinc-500">at current commitments</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-zinc-500">Client concentration</p>
                    <p className={`mt-1 text-lg font-semibold ${agencyHealth.clientConcentration > 0.6 ? "text-amber-300" : "text-white"}`}>
                      {Math.round(agencyHealth.clientConcentration * 100)}%
                    </p>
                    <p className="text-[10px] text-zinc-500">largest retainer share</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Breakdown columns */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Income breakdown */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <BarChart2 size={14} className="text-emerald-400" aria-hidden="true" />
                    Recurring Income Breakdown
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
                        total={monthlyRunRate.totalIncome}
                        accentClass="bg-emerald-500"
                      />
                    ))
                  )}
                  {monthlyRunRate.totalIncome > 0 && (
                    <div className="border-t border-[#27272a] pt-2 flex items-center justify-between text-xs">
                      <span className="text-zinc-500">Total</span>
                      <span className="font-bold text-emerald-400">{formatCurrency(monthlyRunRate.totalIncome)}</span>
                    </div>
                  )}
                  <p className="text-[10px] text-zinc-600">
                    Variable report, placement, consulting, sell-on, and award revenue is excluded from this run rate.
                  </p>
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
                        total={monthlyRunRate.totalExpenses}
                        accentClass="bg-red-500"
                      />
                    ))
                  )}
                  {monthlyRunRate.totalExpenses > 0 && (
                    <div className="border-t border-[#27272a] pt-2 flex items-center justify-between text-xs">
                      <span className="text-zinc-500">Total</span>
                      <span className="font-bold text-red-400">{formatCurrency(monthlyRunRate.totalExpenses)}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Cash flow forecast */}
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
                  Twelve financial periods are distributed across the season. Variable income (report sales, fees) is not projected.
                </p>
              </CardContent>
            </Card>

            {/* ── Loans & Credit ─────────────────────────────────────── */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Banknote size={14} className="text-amber-400" aria-hidden="true" />
                  Loans & Credit
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Credit Score Gauge */}
                <div className="mb-4 rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-zinc-400">Credit Score</span>
                    <span className={`text-sm font-bold ${
                      (finances.creditScore ?? 50) >= 70 ? "text-emerald-400" :
                      (finances.creditScore ?? 50) >= 40 ? "text-amber-400" :
                      "text-red-400"
                    }`}>
                      {finances.creditScore ?? 50}/100
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className={`h-full rounded-full transition-all ${
                        (finances.creditScore ?? 50) >= 70 ? "bg-emerald-500" :
                        (finances.creditScore ?? 50) >= 40 ? "bg-amber-500" :
                        "bg-red-500"
                      }`}
                      style={{ width: `${finances.creditScore ?? 50}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-zinc-600 mt-1">
                    {(finances.creditScore ?? 50) >= 70
                      ? "Good standing — favorable loan terms"
                      : (finances.creditScore ?? 50) >= 40
                        ? "Average — standard loan terms"
                        : "Poor — limited loan access, higher rates"}
                  </p>
                </div>
                {finances.activeLoan ? (
                  <div className="space-y-3">
                    <div className="rounded-md border border-red-500/20 bg-red-500/5 px-4 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-white capitalize">
                          {finances.activeLoan.type} Loan
                        </span>
                        <Badge
                          variant={finances.activeLoan.status === "active" ? "outline" : "destructive"}
                          className="text-[10px] capitalize"
                        >
                          {finances.activeLoan.status ?? "active"}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Remaining</span>
                          <span className="text-red-400 font-semibold">
                            {formatCurrency(finances.activeLoan.remainingBalance)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Monthly payment</span>
                          <span className="text-red-400 font-semibold">
                            {formatCurrency(finances.activeLoan.monthlyPayment)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Interest rate</span>
                          <span className="text-zinc-300">
                            {Math.round(finances.activeLoan.monthlyInterestRate * 100)}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Arrears</span>
                          <span className={(finances.activeLoan.arrears ?? 0) > 0 ? "font-semibold text-red-300" : "text-zinc-300"}>
                            {formatCurrency(finances.activeLoan.arrears ?? 0)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Payment record</span>
                          <span className="text-zinc-300">
                            {finances.activeLoan.paymentsMade ?? 0} paid · {finances.activeLoan.missedPayments ?? 0} missed
                          </span>
                        </div>
                        {finances.activeLoan.nextPaymentWeek !== undefined && finances.activeLoan.nextPaymentSeason !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Next payment</span>
                            <span className="text-zinc-300">
                              S{finances.activeLoan.nextPaymentSeason}, W{finances.activeLoan.nextPaymentWeek}
                            </span>
                          </div>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={finances.balance < finances.activeLoan.remainingBalance}
                        onClick={() => repayLoanAction()}
                        className="text-xs"
                      >
                        Repay Early — {formatCurrency(finances.activeLoan.remainingBalance)}
                      </Button>
                      {finances.balance < finances.activeLoan.remainingBalance && (
                        <p className="text-[10px] text-zinc-600 mt-1">
                          Insufficient balance for early repayment
                        </p>
                      )}
                    </div>
                  </div>
                ) : loanEligibility.eligible ? (
                  <div className="space-y-3">
                    <p className="text-xs text-zinc-400">No active loan. Select a loan type to apply.</p>
                    <div className="grid grid-cols-3 gap-2">
                      {loanEligibility.types.map((type) => {
                        const offer = loanEligibility.offers[type];
                        if (!offer) return null;
                        return (
                          <button
                            key={type}
                            onClick={() => {
                              setSelectedLoanType(type);
                              setLoanAmount(Math.min(offer.maxAmount, Math.max(500, loanAmount)));
                            }}
                            className={`rounded-md border px-3 py-2 text-left text-xs transition cursor-pointer ${
                              selectedLoanType === type
                                ? "border-emerald-500/50 bg-emerald-500/10"
                                : "border-zinc-700 hover:border-zinc-600"
                            }`}
                          >
                            <p className="font-medium text-white mb-0.5">{LOAN_LABELS[type]}</p>
                            <p className="text-zinc-500">Up to {formatCurrency(offer.maxAmount)}</p>
                            <p className="text-zinc-500">{(offer.interestRate * 100).toFixed(1)}% monthly</p>
                            <p className="text-zinc-500">{offer.termMonths}-month term</p>
                          </button>
                        );
                      })}
                    </div>
                    {selectedLoanType && (
                      <div className="rounded-md border border-zinc-700 px-4 py-3 space-y-2">
                        <div className="flex items-center gap-3">
                          <label className="text-xs text-zinc-400 shrink-0">Amount:</label>
                          <input
                            type="range"
                            min={Math.min(500, loanEligibility.offers[selectedLoanType]?.maxAmount ?? 500)}
                            max={loanEligibility.offers[selectedLoanType]?.maxAmount ?? 500}
                            step={500}
                            value={loanAmount}
                            onChange={(e) => setLoanAmount(Number(e.target.value))}
                            className="flex-1"
                          />
                          <span className="text-sm font-semibold text-white min-w-[60px] text-right">
                            {formatCurrency(loanAmount)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-zinc-500">Monthly payment</span>
                          <span className="text-amber-400 font-semibold">
                            {formatCurrency(calcMonthlyPayment(selectedLoanType, loanAmount))}/mo
                          </span>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => {
                            takeLoanAction(selectedLoanType, loanAmount);
                            setSelectedLoanType(null);
                          }}
                          className="text-xs"
                        >
                          Confirm Loan
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1.5 text-xs text-zinc-500">
                    <p>No responsible loan options are available right now.</p>
                    {Object.values(loanEligibility.offers)
                      .filter((offer) => offer && !offer.eligible && offer.reason)
                      .slice(0, 2)
                      .map((offer) => (
                        <p key={offer!.type} className="text-[10px] text-zinc-600">
                          {LOAN_LABELS[offer!.type]}: {offer!.reason}
                        </p>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* CONTRACTS TAB                                                  */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {activeTab === "contracts" && (
          <div data-tutorial-id="finances-contracts">
            {!isIndependent ? (
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-zinc-500">
                    Contracts are available for independent-path scouts only.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {/* Pending Offers */}
                {hasPendingOffers && (
                  <Card className="border-amber-500/20">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-sm">
                        <AlertCircle size={14} className="text-amber-400" aria-hidden="true" />
                        Pending Offers
                        <Badge variant="warning" className="text-[10px] ml-auto">
                          {pendingRetainers.length + pendingConsulting.length} new
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {pendingRetainers.map((r) => {
                        const canAccept = canAcceptRetainerWork(finances, scout, r);
                        return (
                        <div
                          key={r.id}
                          className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div>
                              <span className="text-xs font-medium text-white">
                                Retainer — {getClubName(r.clubId)}
                              </span>
                              <span className="text-[10px] text-zinc-500 ml-2">
                                Tier {r.tier}
                              </span>
                            </div>
                            <span className="text-xs text-emerald-400 font-semibold">
                              {formatCurrency(r.monthlyFee)}/mo
                            </span>
                          </div>
                          <p className="text-[11px] leading-4 text-zinc-300">
                            {r.brief?.description ?? `${r.requiredReportsPerMonth} decision-ready reports each month.`}
                          </p>
                          <div className="my-2 flex flex-wrap gap-1.5 text-[10px] text-zinc-400">
                            <span className="rounded bg-zinc-800 px-1.5 py-0.5">{r.requiredReportsPerMonth} reports/mo</span>
                            {r.brief && <span className="rounded bg-zinc-800 px-1.5 py-0.5">Quality {r.brief.minimumReportQuality}+</span>}
                            {r.brief && <span className="rounded bg-zinc-800 px-1.5 py-0.5">Age {r.brief.ageRange[0]}–{r.brief.ageRange[1]}</span>}
                            <span className="rounded bg-zinc-800 px-1.5 py-0.5">{r.termMonths ?? 3}-month term</span>
                          </div>
                          {!canAccept && (
                            <p className="mb-2 text-[10px] text-red-300">
                              This would exceed your current report capacity. Add scouting leverage or close another commitment.
                            </p>
                          )}
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="h-6 text-[11px]"
                              disabled={!canAccept}
                              onClick={() => acceptRetainerContract(r)}
                            >
                              <CheckCircle size={10} className="mr-1" />
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-[11px]"
                              onClick={() => declineRetainerOffer(r.id)}
                            >
                              <XCircle size={10} className="mr-1" />
                              Decline
                            </Button>
                          </div>
                        </div>
                        );
                      })}
                      {pendingConsulting.map((c) => {
                        const canAccept = canAcceptConsultingWork(finances, scout, c);
                        return (
                        <div
                          key={c.id}
                          className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div>
                              <span className="text-xs font-medium text-white">
                                {CONSULTING_TYPE_LABELS[c.type] ?? c.type} — {getClubName(c.clubId)}
                              </span>
                            </div>
                            <span className="text-xs text-emerald-400 font-semibold">
                              {formatCurrency(c.fee)}
                            </span>
                          </div>
                          <div className="my-2 space-y-1 text-[10px] text-zinc-400">
                            {(c.deliverables ?? []).map((deliverable) => (
                              <p key={`${c.id}-${deliverable.type}`}>
                                {deliverable.required}× {deliverable.description}
                              </p>
                            ))}
                            <p className="text-zinc-500">Deadline: S{c.deadlineSeason} W{c.deadline}</p>
                          </div>
                          {!canAccept && (
                            <p className="mb-2 text-[10px] text-red-300">
                              Your agency does not have enough delivery capacity for this engagement.
                            </p>
                          )}
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="h-6 text-[11px]"
                              disabled={!canAccept}
                              onClick={() => acceptConsultingContract(c)}
                            >
                              <CheckCircle size={10} className="mr-1" />
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-[11px]"
                              onClick={() => declineConsultingOffer(c.id)}
                            >
                              <XCircle size={10} className="mr-1" />
                              Decline
                            </Button>
                          </div>
                        </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                )}

                {/* Active Retainers */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <FileText size={14} className="text-amber-400" aria-hidden="true" />
                      Active Retainers
                      <span className="ml-auto text-xs text-zinc-500 font-normal">
                        {activeRetainers.length} active
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {activeRetainers.length === 0 && suspendedRetainers.length === 0 ? (
                      <p className="text-xs text-zinc-600">No retainer contracts.</p>
                    ) : (
                      <>
                        {activeRetainers.map((r) => {
                          const deliveryPct = r.requiredReportsPerMonth > 0
                            ? Math.round((r.reportsDeliveredThisMonth / r.requiredReportsPerMonth) * 100)
                            : 0;
                          return (
                            <div
                              key={r.id}
                              className="rounded-md border border-[#27272a] px-3 py-2 text-xs"
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-zinc-300 font-medium">
                                  {getClubName(r.clubId)}
                                </span>
                                <span className="text-emerald-400 font-semibold">
                                  {formatCurrency(r.monthlyFee)}/mo
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-zinc-500 mb-1.5">
                                <span>Tier {r.tier}</span>
                                <span>
                                  {r.reportsDeliveredThisMonth}/{r.requiredReportsPerMonth} reports
                                </span>
                              </div>
                              {r.nextSettlementWeek !== undefined && r.nextSettlementSeason !== undefined && (
                                <p className="mb-1.5 text-[10px] text-zinc-500">
                                  Invoice decision: Season {r.nextSettlementSeason}, Week {r.nextSettlementWeek}
                                </p>
                              )}
                              {r.brief && (
                                <p className="mb-2 text-[10px] leading-4 text-zinc-400">
                                  {r.brief.description} Quality floor {r.brief.minimumReportQuality}.
                                </p>
                              )}
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800 mb-2">
                                <div
                                  className="h-full rounded-full bg-emerald-500 transition-all"
                                  style={{ width: `${deliveryPct}%` }}
                                />
                              </div>
                              <div className="mb-2 flex gap-3 text-[10px] text-zinc-500">
                                <span>{r.consecutivePeriodsMet ?? 0} periods met</span>
                                <span>{r.averageDeliveredQuality ?? 0} avg quality</span>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-[11px]"
                                onClick={() => cancelRetainerContract(r.id)}
                              >
                                Cancel
                              </Button>
                            </div>
                          );
                        })}
                        {suspendedRetainers.map((r) => (
                          <div
                            key={r.id}
                            className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-zinc-300 font-medium">
                                {getClubName(r.clubId)}
                              </span>
                              <Badge variant="warning" className="text-[10px]">Suspended</Badge>
                            </div>
                            <div className="text-zinc-500">
                              Tier {r.tier} — {formatCurrency(r.monthlyFee)}/mo
                            </div>
                          </div>
                        ))}
                        {activeRetainers.length > 0 && (
                          <div className="border-t border-[#27272a] pt-2 flex items-center justify-between text-xs">
                            <span className="text-zinc-500">Monthly total</span>
                            <span className="font-bold text-emerald-400">
                              {formatCurrency(retainerMonthlyTotal)}/mo
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* Active Consulting */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Users size={14} className="text-blue-400" aria-hidden="true" />
                      Active Consulting
                      <span className="ml-auto text-xs text-zinc-500 font-normal">
                        {activeConsulting.length} active
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {activeConsulting.length === 0 ? (
                      <p className="text-xs text-zinc-600">No active consulting contracts.</p>
                    ) : (
                      activeConsulting.map((c) => {
                        const weeksRemaining = Math.max(
                          0,
                          gameWeeksBetween(
                            fixtures,
                            {
                              season: currentSeason,
                              week: currentWeek,
                            },
                            { season: c.deadlineSeason, week: c.deadline },
                          ),
                        );
                        return (
                          <div
                            key={c.id}
                            className="rounded-md border border-[#27272a] px-3 py-2 text-xs"
                          >
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-zinc-300 font-medium">
                                {CONSULTING_TYPE_LABELS[c.type] ?? c.type} — {getClubName(c.clubId)}
                              </span>
                              <span className="text-emerald-400 font-semibold">
                                {formatCurrency(c.fee)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-zinc-500">
                              <Clock size={10} />
                              <span>
                                Deadline: S{c.deadlineSeason} W{c.deadline} ({weeksRemaining} week{weeksRemaining !== 1 ? "s" : ""} remaining)
                              </span>
                            </div>
                            <div className="mt-2 space-y-1">
                              {(c.deliverables ?? []).map((deliverable) => (
                                <div
                                  key={`${c.id}-${deliverable.type}`}
                                  className="flex items-center justify-between text-[10px]"
                                >
                                  <span className="text-zinc-500">{deliverable.description}</span>
                                  <span className={deliverable.delivered >= deliverable.required ? "text-emerald-300" : "text-amber-300"}>
                                    {deliverable.delivered}/{deliverable.required}
                                  </span>
                                </div>
                              ))}
                            </div>
                            <Button
                              size="sm"
                              className="mt-3 h-7 w-full text-[11px]"
                              disabled={!canCompleteConsulting(c)}
                              onClick={() => completeConsultingContract(c.id)}
                            >
                              <CheckCircle size={11} className="mr-1.5" />
                              {canCompleteConsulting(c) ? "Deliver Final Work & Invoice" : "Complete Required Scouting First"}
                            </Button>
                          </div>
                        );
                      })
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* REVENUE HISTORY TAB                                            */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {activeTab === "revenue" && (
          <div className="space-y-6" data-tutorial-id="finances-marketplace">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <BarChart2 size={14} className="text-emerald-400" aria-hidden="true" />
                  Recorded Career Revenue
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(lifetimeRevenue)
                  .filter(([key, value]) => key !== "total" && value !== 0)
                  .map(([key, amount]) => (
                    <BreakdownRow
                      key={key}
                      label={INCOME_LABELS[key] ?? key}
                      amount={amount}
                      total={lifetimeRevenue.total}
                      accentClass="bg-emerald-500"
                    />
                  ))}
                <div className="border-t border-[#27272a] pt-2 flex items-center justify-between text-xs">
                  <span className="text-zinc-500">Lifetime total</span>
                  <span className="font-bold text-emerald-400">
                    {formatCurrency(lifetimeRevenue.total)}
                  </span>
                </div>
                <p className="text-[10px] text-zinc-600">
                  Source totals are lifetime counters. Salary includes payroll recorded in the transaction ledger.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <DollarSign size={14} className="text-emerald-400" aria-hidden="true" />
                  Placement Fee Records
                </CardTitle>
              </CardHeader>
              <CardContent>
                {finances.placementFeeRecords.length === 0 ? (
                  <p className="text-xs text-zinc-600">
                    No placement fees earned yet. Fees are earned when players you scouted are transferred.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {[...finances.placementFeeRecords]
                      .sort((a, b) => b.season - a.season || b.week - a.week)
                      .map((record) => {
                        const playerName = (() => {
                          const p = playersById[record.playerId];
                          return p ? `${p.firstName} ${p.lastName}` : "Unknown Player";
                        })();
                        return (
                          <div
                            key={record.id}
                            className="rounded-md border border-[#27272a] px-3 py-2 text-xs"
                          >
                            <div className="flex items-center justify-between mb-0.5">
                              <div>
                                <span className="text-zinc-500">
                                  S{record.season} W{record.week}
                                </span>
                                <span className="text-zinc-300 font-medium ml-2">
                                  {playerName} &rarr; {getClubName(record.clubId)}
                                </span>
                              </div>
                              <span className="text-emerald-400 font-semibold">
                                {formatCurrency(record.earnedFee)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-zinc-500">
                              <span>
                                Transfer fee: {formatCurrency(record.transferFee)}
                              </span>
                              {record.hasSellOnClause ? (
                                <span className="flex items-center gap-1 text-emerald-500">
                                  <CheckCircle size={10} />
                                  Sell-on: {(record.sellOnPercentage * 100).toFixed(1)}%
                                </span>
                              ) : (
                                <span className="text-zinc-600">No sell-on clause</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    <div className="border-t border-[#27272a] pt-3 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-500">Total fees earned</span>
                        <span className="font-bold text-emerald-400">
                          {formatCurrency(
                            finances.placementFeeRecords.reduce((sum, r) => sum + r.earnedFee, 0),
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-500">Active sell-on clauses</span>
                        <span className="text-zinc-300">
                          {finances.placementFeeRecords.filter((r) => r.hasSellOnClause).length}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </GameLayout>
  );
}
