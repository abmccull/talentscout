"use client";

import { useState } from "react";
import { useGameStore } from "@/stores/gameStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  Users,
  ArrowUp,
  UserPlus,
  Search,
  BarChart3,
  Briefcase,
  Shield,
  GraduationCap,
} from "lucide-react";
import {
  OFFICE_TIERS,
  SALARY_BY_ROLE,
} from "@/engine/finance";
import type {
  OfficeTier,
  AgencyEmployeeRole,
  AgencyEmployee,
} from "@/engine/core/types";
import { EmployeeCard } from "./EmployeeCard";

// ─── Constants ────────────────────────────────────────────────────────────────

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

// ─── Component ────────────────────────────────────────────────────────────────

export function OfficeTab() {
  const gameState = useGameStore((s) => s.gameState);
  const upgradeAgencyOffice = useGameStore((s) => s.upgradeAgencyOffice);
  const hireAgencyEmployee = useGameStore((s) => s.hireAgencyEmployee);
  const fireAgencyEmployee = useGameStore((s) => s.fireAgencyEmployee);
  const trainAgencyEmployee = useGameStore((s) => s.trainAgencyEmployee);

  const [confirmFire, setConfirmFire] = useState<string | null>(null);

  if (!gameState?.finances) return null;

  const { finances } = gameState;
  const { office, employees, balance } = finances;
  const currentTierIndex = TIER_ORDER.indexOf(office.tier);
  const countries = gameState.countries ?? [];

  return (
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
  );
}
