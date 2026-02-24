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
  UserMinus,
  UserPlus,
  DollarSign,
  Briefcase,
  BarChart3,
  Shield,
  Search,
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
};

const ROLE_ICONS: Record<AgencyEmployeeRole, React.ElementType> = {
  scout: Search,
  analyst: BarChart3,
  administrator: Briefcase,
  relationshipManager: Shield,
};

function getMoraleColor(morale: number): string {
  if (morale >= 70) return "text-emerald-400";
  if (morale >= 40) return "text-amber-400";
  return "text-red-400";
}

function getMoraleLabel(morale: number): string {
  if (morale >= 80) return "Excellent";
  if (morale >= 60) return "Good";
  if (morale >= 40) return "Fair";
  if (morale >= 20) return "Low";
  return "Critical";
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AgencyScreen() {
  const gameState = useGameStore((s) => s.gameState);
  const upgradeAgencyOffice = useGameStore((s) => s.upgradeAgencyOffice);
  const hireAgencyEmployee = useGameStore((s) => s.hireAgencyEmployee);
  const fireAgencyEmployee = useGameStore((s) => s.fireAgencyEmployee);

  const [confirmFire, setConfirmFire] = useState<string | null>(null);

  if (!gameState?.finances) return null;

  const { finances } = gameState;
  const { office, employees, balance } = finances;
  const currentTierIndex = TIER_ORDER.indexOf(office.tier);
  const monthlyOverhead = calculateAgencyOverhead(finances);
  const salaryTotal = employees.reduce((sum, e) => sum + e.salary, 0);

  return (
    <GameLayout>
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-1">Agency</h1>
        <p className="text-sm text-zinc-400 mb-6">
          Manage your independent scouting agency — upgrade your office and hire staff.
        </p>

        {/* Summary bar */}
        <div className="mb-6 grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                Monthly Overhead
              </p>
              <p className="text-lg font-bold text-amber-400">
                £{monthlyOverhead.toLocaleString()}/mo
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                Employees
              </p>
              <p className="text-lg font-bold">
                {employees.length}{" "}
                <span className="text-sm font-normal text-zinc-500">
                  / {office.maxEmployees}
                </span>
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                Quality Bonus
              </p>
              <p className="text-lg font-bold text-emerald-400">
                +{Math.round(office.qualityBonus * 100)}%
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ── Left Column: Office Management ──────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Building2 size={14} className="text-zinc-400" />
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
                          <ArrowUp size={12} className="mr-1" />
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
                      <span>
                        £{config.monthlyCost.toLocaleString()}/mo
                      </span>
                      <span>
                        +{Math.round(config.qualityBonus * 100)}% quality
                      </span>
                      <span>
                        {config.maxEmployees} staff max
                      </span>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* ── Right Column: Employee Management ──────────────────────── */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Users size={14} className="text-zinc-400" />
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
                  <div className="space-y-2">
                    {employees.map((emp: AgencyEmployee) => {
                      const RoleIcon = ROLE_ICONS[emp.role];
                      return (
                        <div
                          key={emp.id}
                          className="flex items-center gap-3 rounded-lg border border-zinc-800 p-3"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium truncate">
                                {emp.name}
                              </span>
                              <Badge variant="secondary" className="text-[10px] flex items-center gap-1">
                                <RoleIcon size={10} />
                                {ROLE_LABELS[emp.role]}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-zinc-500">
                              <span>
                                Skill: {emp.quality}/20
                              </span>
                              <span className={getMoraleColor(emp.morale)}>
                                Morale: {getMoraleLabel(emp.morale)}
                              </span>
                              <span>
                                £{emp.salary.toLocaleString()}/mo
                              </span>
                            </div>
                            {/* Quality bar */}
                            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-zinc-800">
                              <div
                                className="h-full rounded-full bg-emerald-500 transition-all"
                                style={{ width: `${(emp.quality / 20) * 100}%` }}
                              />
                            </div>
                          </div>
                          <div>
                            {confirmFire === emp.id ? (
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="h-7 text-xs"
                                  onClick={() => {
                                    fireAgencyEmployee(emp.id);
                                    setConfirmFire(null);
                                  }}
                                >
                                  Confirm
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs"
                                  onClick={() => setConfirmFire(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-red-400 hover:text-red-300"
                                onClick={() => setConfirmFire(emp.id)}
                              >
                                <UserMinus size={12} />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Hire section */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <UserPlus size={14} className="text-zinc-400" />
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
                    {(Object.keys(ROLE_LABELS) as AgencyEmployeeRole[]).map(
                      (role) => {
                        const [minSalary, maxSalary] = SALARY_BY_ROLE[role];
                        const RoleIcon = ROLE_ICONS[role];
                        return (
                          <button
                            key={role}
                            onClick={() => hireAgencyEmployee(role)}
                            className="rounded-lg border border-zinc-800 p-3 text-left hover:border-emerald-600/50 hover:bg-emerald-950/10 transition cursor-pointer"
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <RoleIcon size={14} className="text-zinc-400" />
                              <span className="text-sm font-medium">
                                {ROLE_LABELS[role]}
                              </span>
                            </div>
                            <p className="text-[10px] text-zinc-500">
                              £{minSalary.toLocaleString()} – £{maxSalary.toLocaleString()}/mo
                            </p>
                          </button>
                        );
                      },
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </GameLayout>
  );
}
