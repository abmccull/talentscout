"use client";

import { useState } from "react";
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
  calculateProfitAndLoss,
  forecastCashFlow,
  calculateRevenueBreakdown,
  calculateNetWorth,
  getLoanEligibility,
} from "@/engine/finance";
import type { ExpenseType, LoanType } from "@/engine/core/types";

// ─── Constants ──────────────────────────────────────────────────────────────

const LOAN_CONFIGS: Record<LoanType, { label: string; maxAmount: number; rate: number; termMonths: number }> = {
  business: { label: "Business", maxAmount: 20000, rate: 0.05, termMonths: 12 },
  equipment: { label: "Equipment", maxAmount: 10000, rate: 0.10, termMonths: 6 },
  emergency: { label: "Emergency", maxAmount: 2000, rate: 0.08, termMonths: 4 },
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
    gameState,
    takeLoanAction,
    repayLoanAction,
    acceptRetainerContract,
    cancelRetainerContract,
    acceptConsultingContract,
    declineRetainerOffer,
    declineConsultingOffer,
  } = useGameStore();
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [selectedLoanType, setSelectedLoanType] = useState<LoanType | null>(null);
  const [loanAmount, setLoanAmount] = useState(1000);

  if (!gameState?.finances) {
    return (
      <GameLayout>
        <div className="p-6 text-zinc-400">No financial data available.</div>
      </GameLayout>
    );
  }

  const { finances, scout, clubs } = gameState;

  const pnl = calculateProfitAndLoss(finances, scout);
  const revenue = calculateRevenueBreakdown(finances, scout);
  const netWorth = calculateNetWorth(finances);
  const forecast = forecastCashFlow(finances, scout, 12);

  const activeRetainers = finances.retainerContracts.filter((r) => r.status === "active");
  const suspendedRetainers = finances.retainerContracts.filter((r) => r.status === "suspended");
  const retainerMonthlyTotal = activeRetainers.reduce((sum, r) => sum + r.monthlyFee, 0);
  const activeConsulting = finances.consultingContracts.filter((c) => c.status === "active");
  const isIndependent = finances.careerPath === "independent";

  const pendingRetainers = finances.pendingRetainerOffers ?? [];
  const pendingConsulting = finances.pendingConsultingOffers ?? [];
  const hasPendingOffers = pendingRetainers.length > 0 || pendingConsulting.length > 0;

  const incomeEntries = Object.entries(revenue).filter(
    ([key, val]) => key !== "total" && (val as number) > 0,
  ) as [string, number][];

  const expenseEntries = (Object.entries(pnl.expenseBreakdown) as [ExpenseType, number][]).filter(
    ([, val]) => val > 0,
  );

  const loanEligibility = getLoanEligibility(finances, scout.careerTier);

  const getClubName = (clubId: string) => clubs[clubId]?.name ?? "Unknown Club";

  // Loan calculation helper
  const calcMonthlyPayment = (type: LoanType, amount: number) => {
    const cfg = LOAN_CONFIGS[type];
    const totalInterest = amount * cfg.rate * cfg.termMonths;
    return Math.round((amount + totalInterest) / cfg.termMonths);
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
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* OVERVIEW TAB                                                   */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {activeTab === "overview" && (
          <>
            {/* Overview cards */}
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

            {/* Net profit callout */}
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

            {/* Breakdown columns */}
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
                  Payments cycle every 4 weeks. Variable income (report sales, fees) is not projected.
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
                        <Badge variant="destructive" className="text-[10px]">Active</Badge>
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
                        const cfg = LOAN_CONFIGS[type];
                        return (
                          <button
                            key={type}
                            onClick={() => {
                              setSelectedLoanType(type);
                              setLoanAmount(Math.min(cfg.maxAmount, Math.max(1000, loanAmount)));
                            }}
                            className={`rounded-md border px-3 py-2 text-left text-xs transition cursor-pointer ${
                              selectedLoanType === type
                                ? "border-emerald-500/50 bg-emerald-500/10"
                                : "border-zinc-700 hover:border-zinc-600"
                            }`}
                          >
                            <p className="font-medium text-white mb-0.5">{cfg.label}</p>
                            <p className="text-zinc-500">Up to {formatCurrency(cfg.maxAmount)}</p>
                            <p className="text-zinc-500">{Math.round(cfg.rate * 100)}% monthly</p>
                            <p className="text-zinc-500">{cfg.termMonths}-month term</p>
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
                            min={1000}
                            max={LOAN_CONFIGS[selectedLoanType].maxAmount}
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
                  <p className="text-xs text-zinc-600">No loan options available.</p>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* CONTRACTS TAB                                                  */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {activeTab === "contracts" && (
          <>
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
                      {pendingRetainers.map((r) => (
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
                          <p className="text-[10px] text-zinc-500 mb-2">
                            {r.requiredReportsPerMonth} reports/month required
                          </p>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="h-6 text-[11px]"
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
                      ))}
                      {pendingConsulting.map((c) => (
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
                          <p className="text-[10px] text-zinc-500 mb-2">
                            Deadline: S{c.deadlineSeason} W{c.deadline}
                          </p>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="h-6 text-[11px]"
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
                      ))}
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
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800 mb-2">
                                <div
                                  className="h-full rounded-full bg-emerald-500 transition-all"
                                  style={{ width: `${deliveryPct}%` }}
                                />
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
                          (c.deadlineSeason - gameState.currentSeason) * 52 +
                            c.deadline - gameState.currentWeek,
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
                          </div>
                        );
                      })
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* REVENUE HISTORY TAB                                            */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {activeTab === "revenue" && (
          <>
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
                          const p = gameState.players[record.playerId];
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
          </>
        )}
      </div>
    </GameLayout>
  );
}
