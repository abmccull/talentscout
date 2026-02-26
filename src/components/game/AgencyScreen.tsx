"use client";

import { useState } from "react";
import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  Users,
  ArrowUp,
  UserPlus,
  DollarSign,
  Briefcase,
  BarChart3,
  Shield,
  Search,
  GraduationCap,
  Bell,
  Globe,
  Trophy,
} from "lucide-react";
import {
  OFFICE_TIERS,
  SALARY_BY_ROLE,
  calculateAgencyOverhead,
} from "@/engine/finance";
import type {
  OfficeTier,
  AgencyEmployeeRole,
  AgencyEmployee,
} from "@/engine/core/types";
import { EmployeeCard } from "./agency/EmployeeCard";
import { ClientsTab } from "./agency/ClientsTab";
import { EventsTab } from "./agency/EventsTab";
import { OfficesTab } from "./agency/OfficesTab";
import { LegacyTab } from "./agency/LegacyTab";

// ─── Constants ───────────────────────────────────────────────────────────────

const TIER_ORDER: OfficeTier[] = ["home", "coworking", "small", "professional", "hq"];

const TIER_LABELS: Record<OfficeTier, string> = {
  home: "Home Office",
  coworking: "Co-working Space",
  small: "Small Office",
  professional: "Professional Office",
  hq: "Headquarters",
};

const ROLE_LABELS: Record<AgencyEmployeeRole, string> = {
  scout: "Scout",
  analyst: "Analyst",
  administrator: "Administrator",
  relationshipManager: "Relationship Manager",
  mentee: "Mentee",
};

const ROLE_ICONS: Record<AgencyEmployeeRole, React.ElementType> = {
  scout: Search,
  analyst: BarChart3,
  administrator: Briefcase,
  relationshipManager: Shield,
  mentee: GraduationCap,
};

// ─── Tab system types ─────────────────────────────────────────────────────────

type TabId = "employees" | "clients" | "events" | "offices" | "legacy";

interface TabDef {
  id: TabId;
  label: string;
  icon: React.ElementType;
  minTier: number;
  badge?: number;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AgencyScreen() {
  const gameState = useGameStore((s) => s.gameState);
  const upgradeAgencyOffice = useGameStore((s) => s.upgradeAgencyOffice);
  const hireAgencyEmployee = useGameStore((s) => s.hireAgencyEmployee);
  const fireAgencyEmployee = useGameStore((s) => s.fireAgencyEmployee);
  const trainAgencyEmployee = useGameStore((s) => s.trainAgencyEmployee);

  const [confirmFire, setConfirmFire] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("employees");

  // All hooks must be called before early returns
  const pendingEvents = gameState?.finances?.pendingEmployeeEvents ?? [];
  const clientRelationships = gameState?.finances?.clientRelationships ?? [];
  const satelliteOffices = gameState?.finances?.satelliteOffices ?? [];
  const awards = gameState?.finances?.awards ?? [];
  const countries = gameState?.countries ?? [];

  if (!gameState?.finances) return null;

  const independentTier =
    gameState?.finances?.independentTier ?? gameState?.scout?.independentTier ?? 1;

  // ── Tier 1–2: Roadmap + Progress ─────────────────────────────────────────
  if (independentTier < 3) {
    return (
      <GameLayout>
        <div className="p-6">
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white">Your Agency</h2>
              <p className="mt-1 text-sm text-zinc-400">Build your scouting empire — one tier at a time.</p>
            </div>

            {/* Agency Roadmap */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Agency Roadmap</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { tier: 1, name: "Freelance Scout", desc: "Sell reports on the marketplace. Build your reputation one assignment at a time.", unlocks: ["Report marketplace", "Manual report sales"] },
                  { tier: 2, name: "Established Freelancer", desc: "Clubs start noticing your work. Your first retainer contract slot opens.", unlocks: ["1 retainer slot", "Agency preview access", "Client pitching"] },
                  { tier: 3, name: "Agency Founder", desc: "Open an office. Hire your first employee. Your agency is born.", unlocks: ["Office upgrades", "Hire employees", "3 retainer slots", "Full agency management"] },
                  { tier: 4, name: "Professional Agency", desc: "Consulting contracts. International expansion. Your name carries weight.", unlocks: ["Consulting contracts", "6 retainer slots", "Satellite offices", "Relationship managers"] },
                  { tier: 5, name: "Elite Firm", desc: "Industry leader. Awards ceremonies. Platinum-tier clients. Legacy.", unlocks: ["Unlimited retainers", "12 employees", "Industry awards", "Mentee system", "Platinum clients"] },
                ].map(({ tier: t, name, desc, unlocks }) => {
                  const isCurrent = independentTier === t;
                  const isComplete = independentTier > t;
                  return (
                    <div key={t} className={`rounded-lg border p-4 ${isCurrent ? "border-emerald-500/50 bg-emerald-500/5" : isComplete ? "border-zinc-700 bg-zinc-800/30" : "border-zinc-800 bg-zinc-900/50 opacity-60"}`}>
                      <div className="flex items-center gap-3">
                        <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${isComplete ? "bg-emerald-500 text-black" : isCurrent ? "bg-emerald-500/20 text-emerald-400 ring-2 ring-emerald-500/50" : "bg-zinc-800 text-zinc-500"}`}>
                          {isComplete ? "✓" : t}
                        </div>
                        <div>
                          <h4 className={`text-sm font-semibold ${isCurrent ? "text-emerald-400" : isComplete ? "text-zinc-300" : "text-zinc-500"}`}>Tier {t}: {name}</h4>
                          <p className="text-xs text-zinc-500">{desc}</p>
                        </div>
                      </div>
                      {(isCurrent || isComplete) && (
                        <div className="mt-2 flex flex-wrap gap-1.5 pl-11">
                          {unlocks.map((u) => (
                            <span key={u} className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${isComplete ? "bg-zinc-700 text-zinc-400" : "bg-emerald-500/10 text-emerald-400"}`}>{u}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Tier Progress */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Progress to Tier {independentTier + 1}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(() => {
                  const requirements = independentTier === 1
                    ? [
                        { label: "Reputation", current: gameState?.scout?.reputation ?? 0, target: 20 },
                        { label: "Balance", current: gameState?.finances?.balance ?? 0, target: 1000, isCurrency: true },
                        { label: "Reports Submitted", current: gameState?.scout?.reportsSubmitted ?? 0, target: 5 },
                      ]
                    : [
                        { label: "Reputation", current: gameState?.scout?.reputation ?? 0, target: 40 },
                        { label: "Balance", current: gameState?.finances?.balance ?? 0, target: 5000, isCurrency: true },
                        { label: "Reports Submitted", current: gameState?.scout?.reportsSubmitted ?? 0, target: 20 },
                        { label: "Active Retainers", current: gameState?.finances?.retainerContracts?.filter((r: { status: string }) => r.status === "active").length ?? 0, target: 1 },
                      ];
                  return requirements.map(({ label, current, target, isCurrency }) => {
                    const pct = Math.min(100, (current / target) * 100);
                    const met = current >= target;
                    return (
                      <div key={label}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className={met ? "text-emerald-400" : "text-zinc-400"}>{label}</span>
                          <span className={`font-mono ${met ? "text-emerald-400" : "text-zinc-300"}`}>
                            {isCurrency ? `£${current.toLocaleString()}` : current} / {isCurrency ? `£${target.toLocaleString()}` : target}
                            {met && " ✓"}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${met ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  });
                })()}
              </CardContent>
            </Card>
          </div>
        </div>
      </GameLayout>
    );
  }

  // ── Tier 3+: Full Agency Management ──────────────────────────────────────
  const { finances } = gameState;
  const { office, employees, balance } = finances;
  const currentTierIndex = TIER_ORDER.indexOf(office.tier);
  const monthlyOverhead = calculateAgencyOverhead(finances);

  const tabs: TabDef[] = [
    { id: "employees", label: "Employees", icon: Users, minTier: 3 },
    { id: "clients", label: "Clients", icon: DollarSign, minTier: 3 },
    {
      id: "events",
      label: "Events",
      icon: Bell,
      minTier: 3,
      badge: pendingEvents.length > 0 ? pendingEvents.length : undefined,
    },
    { id: "offices", label: "Offices", icon: Globe, minTier: 4 },
    { id: "legacy", label: "Legacy", icon: Trophy, minTier: 5 },
  ];

  const visibleTabs = tabs.filter((t) => independentTier >= t.minTier);

  // Ensure activeTab is valid for this tier
  const activeTabVisible = visibleTabs.some((t) => t.id === activeTab);
  const resolvedTab = activeTabVisible ? activeTab : "employees";

  return (
    <GameLayout>
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-1">Agency</h1>
        <p className="text-sm text-zinc-400 mb-4">
          Manage your independent scouting agency — upgrade your office and hire staff.
        </p>

        {/* Summary bar */}
        <div className="mb-4 grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-3">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                Monthly Overhead
              </p>
              <p className="text-base font-bold text-amber-400">
                £{monthlyOverhead.toLocaleString()}/mo
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                Employees
              </p>
              <p className="text-base font-bold">
                {employees.length}{" "}
                <span className="text-sm font-normal text-zinc-500">
                  / {office.maxEmployees}
                </span>
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                Quality Bonus
              </p>
              <p className="text-base font-bold text-emerald-400">
                +{Math.round(office.qualityBonus * 100)}%
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tab bar */}
        <div
          className="mb-4 flex items-center gap-1 border-b border-zinc-800 overflow-x-auto"
          role="tablist"
          aria-label="Agency management tabs"
        >
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = resolvedTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                aria-controls={`tabpanel-${tab.id}`}
                id={`tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition whitespace-nowrap border-b-2 -mb-px ${
                  isActive
                    ? "border-emerald-500 text-emerald-400"
                    : "border-transparent text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <Icon size={13} aria-hidden="true" />
                {tab.label}
                {tab.badge !== undefined && (
                  <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-black">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab panels */}
        <div
          role="tabpanel"
          id={`tabpanel-${resolvedTab}`}
          aria-labelledby={`tab-${resolvedTab}`}
        >
          {/* ── Employees tab ─────────────────────────────────────────────── */}
          {resolvedTab === "employees" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left: Office management */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Building2 size={14} className="text-zinc-400" aria-hidden="true" />
                    Office
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {TIER_ORDER.map((tier, index) => {
                    const config = OFFICE_TIERS[tier];
                    const isCurrent = tier === office.tier;
                    const isPast = index < currentTierIndex;
                    const isNext = index === currentTierIndex + 1;
                    const isFuture = index > currentTierIndex + 1;
                    const canAfford = balance >= config.monthlyCost;

                    return (
                      <div
                        key={tier}
                        className={`rounded-lg border p-3 transition ${
                          isCurrent
                            ? "border-emerald-600/50 bg-emerald-950/20"
                            : isPast
                              ? "border-zinc-800 opacity-50"
                              : "border-zinc-800"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                              {TIER_LABELS[tier]}
                            </span>
                            {isCurrent && (
                              <Badge variant="success" className="text-[10px]">
                                Current
                              </Badge>
                            )}
                          </div>
                          {isNext && (
                            <Button
                              size="sm"
                              variant={canAfford ? "default" : "ghost"}
                              disabled={!canAfford}
                              onClick={() => upgradeAgencyOffice(tier)}
                              className="h-7 text-xs"
                            >
                              <ArrowUp size={12} className="mr-1" aria-hidden="true" />
                              Upgrade
                            </Button>
                          )}
                          {isFuture && !isCurrent && (
                            <span className="text-[10px] text-zinc-600">
                              Upgrade sequentially
                            </span>
                          )}
                        </div>
                        <div className="flex gap-4 text-xs text-zinc-500">
                          <span>£{config.monthlyCost.toLocaleString()}/mo</span>
                          <span>+{Math.round(config.qualityBonus * 100)}% quality</span>
                          <span>{config.maxEmployees} staff max</span>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              {/* Right: Employee cards + hire */}
              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Users size={14} className="text-zinc-400" aria-hidden="true" />
                        Employees
                      </span>
                      <span className="text-xs font-normal text-zinc-500">
                        {employees.length} / {office.maxEmployees}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {employees.length === 0 ? (
                      <p className="text-sm text-zinc-500 text-center py-6">
                        {office.maxEmployees === 0
                          ? "Upgrade your office to hire your first employee."
                          : "No employees yet. Hire your first team member below."}
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {employees.map((emp: AgencyEmployee) => (
                          <EmployeeCard
                            key={emp.id}
                            emp={emp}
                            currentWeek={gameState.currentWeek}
                            currentSeason={gameState.currentSeason}
                            countries={countries}
                            onFire={fireAgencyEmployee}
                            confirmFireId={confirmFire}
                            onConfirmFire={setConfirmFire}
                            onTrain={(empId, skillIdx) => trainAgencyEmployee(empId, skillIdx)}
                          />
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Hire section */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <UserPlus size={14} className="text-zinc-400" aria-hidden="true" />
                      Hire Employee
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {office.maxEmployees === 0 ? (
                      <p className="text-sm text-zinc-500 text-center py-4">
                        Upgrade from Home Office to unlock hiring.
                      </p>
                    ) : employees.length >= office.maxEmployees ? (
                      <p className="text-sm text-zinc-500 text-center py-4">
                        Office at full capacity. Upgrade to hire more staff.
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {(Object.keys(ROLE_LABELS) as AgencyEmployeeRole[]).map((role) => {
                          const [minSalary, maxSalary] = SALARY_BY_ROLE[role];
                          const RoleIcon = ROLE_ICONS[role];
                          return (
                            <button
                              key={role}
                              onClick={() => hireAgencyEmployee(role)}
                              className="rounded-lg border border-zinc-800 p-3 text-left hover:border-emerald-600/50 hover:bg-emerald-950/10 transition cursor-pointer"
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <RoleIcon size={14} className="text-zinc-400" aria-hidden="true" />
                                <span className="text-sm font-medium">
                                  {ROLE_LABELS[role]}
                                </span>
                              </div>
                              <p className="text-[10px] text-zinc-500">
                                £{minSalary.toLocaleString()} – £{maxSalary.toLocaleString()}/mo
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* ── Clients tab ───────────────────────────────────────────────── */}
          {resolvedTab === "clients" && (
            <ClientsTab
              clientRelationships={clientRelationships}
              clubs={gameState.clubs}
            />
          )}

          {/* ── Events tab ────────────────────────────────────────────────── */}
          {resolvedTab === "events" && (
            <EventsTab
              pendingEvents={pendingEvents}
              employees={employees}
              currentWeek={gameState.currentWeek}
              currentSeason={gameState.currentSeason}
            />
          )}

          {/* ── Offices tab (tier 4+) ─────────────────────────────────────── */}
          {resolvedTab === "offices" && independentTier >= 4 && (
            <OfficesTab
              mainOffice={office}
              satelliteOffices={satelliteOffices}
              employees={employees}
              countries={countries}
              balance={balance}
            />
          )}

          {/* ── Legacy tab (tier 5) ───────────────────────────────────────── */}
          {resolvedTab === "legacy" && independentTier >= 5 && (
            <LegacyTab
              awards={awards}
              finances={finances}
              currentSeason={gameState.currentSeason}
            />
          )}
        </div>
      </div>
    </GameLayout>
  );
}
