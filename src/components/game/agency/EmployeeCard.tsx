"use client";

import { useMemo, useState } from "react";
import { useGameStore } from "@/stores/gameStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronUp,
  UserMinus,
  Pencil,
  Check,
  X,
  BedDouble,
} from "lucide-react";
import type { AgencyEmployee, AgencyEmployeeRole } from "@/engine/core/types";
import {
  getEmployeePayEffects,
  getEmployeeSalaryBand,
} from "@/engine/finance";
import { gameWeeksBetween } from "@/engine/core/gameDate";
import { buildStakeholderEcologyProfile } from "@/engine/consequences";
import { StakeholderEcologyPanel } from "../StakeholderEcologyPanel";

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<AgencyEmployeeRole, string> = {
  scout: "Scout",
  analyst: "Analyst",
  administrator: "Administrator",
  relationshipManager: "Relationship Manager",
  mentee: "Mentee",
};

const ROLE_SKILL_NAMES: Record<AgencyEmployeeRole, [string, string, string]> = {
  scout: ["Coverage", "Accuracy", "Potential Eye"],
  analyst: ["Insight Depth", "Pattern Recognition", "Efficiency"],
  administrator: ["Cost Control", "Organization", "Paperwork"],
  relationshipManager: ["Prospecting", "Client Retention", "Negotiation"],
  mentee: ["Coverage", "Accuracy", "Potential Eye"],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function getAssignmentOptions(
  role: AgencyEmployeeRole,
  countries: string[],
): Array<{ label: string; value: string; region?: string }> {
  const options: Array<{ label: string; value: string; region?: string }> = [];

  if (role === "scout") {
    for (const country of countries.slice(0, 20)) {
      options.push({ label: `Scout: ${country}`, value: `scoutRegion:${country}`, region: country });
    }
    options.push({ label: "Idle", value: "idle" });
  } else if (role === "analyst") {
    options.push({ label: "Analyze Reports", value: "analyzeReports" });
    options.push({ label: "Idle", value: "idle" });
  } else if (role === "administrator") {
    options.push({ label: "Admin Duties", value: "adminDuties" });
    options.push({ label: "Idle", value: "idle" });
  } else if (role === "relationshipManager") {
    options.push({ label: "Manage Clients", value: "manageClients" });
    options.push({ label: "Idle", value: "idle" });
  } else {
    options.push({ label: "Idle", value: "idle" });
  }

  return options;
}

function parseAssignmentValue(value: string): { type: string; region?: string } {
  if (value.startsWith("scoutRegion:")) {
    return { type: "scoutRegion", region: value.split(":")[1] };
  }
  return { type: value };
}

function currentAssignmentValue(emp: AgencyEmployee): string {
  if (!emp.currentAssignment || emp.currentAssignment.type === "idle") return "idle";
  if (emp.currentAssignment.type === "scoutRegion" && emp.currentAssignment.targetRegion) {
    return `scoutRegion:${emp.currentAssignment.targetRegion}`;
  }
  return emp.currentAssignment.type;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface EmployeeCardProps {
  emp: AgencyEmployee;
  currentWeek: number;
  currentSeason: number;
  countries: string[];
  onFire: (id: string) => void;
  confirmFireId: string | null;
  onConfirmFire: (id: string | null) => void;
  onTrain: (employeeId: string, skillIndex: 1 | 2 | 3) => void;
}

export function EmployeeCard({
  emp,
  currentWeek,
  currentSeason,
  countries,
  onFire,
  confirmFireId,
  onConfirmFire,
  onTrain,
}: EmployeeCardProps) {
  const assignAgencyEmployee = useGameStore((s) => s.assignAgencyEmployee);
  const adjustEmployeeSalary = useGameStore((s) => s.adjustEmployeeSalary);
  const employerReputation = useGameStore((s) => s.gameState?.scout.reputation ?? 50);
  const fixtures = useGameStore((s) => s.gameState?.fixtures ?? {});
  const consequenceState = useGameStore((s) => s.gameState?.consequenceState);
  const scoutId = useGameStore((s) => s.gameState?.scout.id);

  const [logsOpen, setLogsOpen] = useState(false);
  const [relationshipOpen, setRelationshipOpen] = useState(false);
  const [editingSalary, setEditingSalary] = useState(false);
  const [salaryInput, setSalaryInput] = useState(String(emp.salary));
  const [salaryError, setSalaryError] = useState<string | null>(null);

  const assignmentOpts = getAssignmentOptions(emp.role, countries);
  const assignVal = currentAssignmentValue(emp);
  const salaryBand = getEmployeeSalaryBand(emp, employerReputation);
  const payEffects = getEmployeePayEffects(emp, employerReputation);
  const payPositionLabel = payEffects.position === "underMarket"
    ? "Under market"
    : payEffects.position === "premium"
      ? "Premium"
      : "Fair";
  const payPositionClass = payEffects.position === "underMarket"
    ? "border-red-500/30 bg-red-500/10 text-red-300"
    : payEffects.position === "premium"
      ? "border-blue-500/30 bg-blue-500/10 text-blue-300"
      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";

  const tenureWeeks = Math.max(0, gameWeeksBetween(
    fixtures,
    { season: emp.hiredSeason, week: emp.hiredWeek },
    { season: currentSeason, week: currentWeek },
  ));

  function handleAssignmentChange(value: string) {
    const { type, region } = parseAssignmentValue(value);
    assignAgencyEmployee(emp.id, {
      type: type as "scoutRegion" | "scoutPlayer" | "analyzeReports" | "manageClients" | "adminDuties" | "idle",
      targetRegion: region,
      assignedWeek: currentWeek,
      assignedSeason: currentSeason,
    });
  }

  function handleSalarySave() {
    const val = parseInt(salaryInput, 10);
    if (!Number.isFinite(val)) {
      setSalaryError("Enter a valid monthly salary.");
      return;
    }
    if (val < salaryBand.minimum || val > salaryBand.maximum) {
      setSalaryError(
        `Offer must be between £${salaryBand.minimum.toLocaleString()} and £${salaryBand.maximum.toLocaleString()}.`,
      );
      return;
    }
    adjustEmployeeSalary(emp.id, val);
    setSalaryError(null);
    setEditingSalary(false);
  }

  const recentLogs = (emp.weeklyLog ?? []).slice(-4).reverse();
  const isConfirmFire = confirmFireId === emp.id;
  const relationshipProfile = useMemo(() => consequenceState && scoutId
    ? buildStakeholderEcologyProfile({
        state: consequenceState,
        stakeholder: { kind: "employee", id: emp.id },
        now: { week: currentWeek, season: currentSeason },
        scoutId,
        baseTrust: emp.morale,
        baseInfluence: Math.min(100, emp.quality * 5),
      })
    : undefined,
  [consequenceState, scoutId, emp.id, emp.morale, emp.quality, currentWeek, currentSeason]);

  return (
    <div className="rounded-lg border border-zinc-800 p-3 space-y-2">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-white truncate">{emp.name}</span>
            <Badge variant="secondary" className="text-[10px] shrink-0">
              {ROLE_LABELS[emp.role]}
            </Badge>
            {emp.onLeave && (
              <Badge className="text-[10px] shrink-0 bg-amber-500/20 text-amber-400 border-amber-500/30">
                <BedDouble size={9} className="mr-1" aria-hidden="true" />
                On Leave
              </Badge>
            )}
          </div>
          <p className="text-[10px] text-zinc-600 mt-0.5">
            Hired {tenureWeeks <= 0 ? "this week" : `${tenureWeeks}w ago`}
          </p>
        </div>

        {/* Fire button */}
        {isConfirmFire ? (
          <div className="flex gap-1 shrink-0">
            <Button
              size="sm"
              variant="destructive"
              className="h-6 text-xs px-2"
              onClick={() => {
                onFire(emp.id);
                onConfirmFire(null);
              }}
            >
              Confirm
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-xs px-2"
              onClick={() => onConfirmFire(null)}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-red-400 hover:text-red-300 shrink-0"
            onClick={() => onConfirmFire(emp.id)}
            aria-label={`Fire ${emp.name}`}
          >
            <UserMinus size={12} aria-hidden="true" />
          </Button>
        )}
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3 text-xs text-zinc-500 flex-wrap">
        <span>Overall: <span className="text-zinc-300">{emp.quality}/20</span></span>
        <span className={getMoraleColor(emp.morale)}>
          {getMoraleLabel(emp.morale)}
        </span>
        {emp.regionSpecialization && (
          <span className="rounded-full bg-blue-500/10 text-blue-400 px-1.5 py-0.5 text-[10px]">
            {emp.regionSpecialization}
          </span>
        )}
      </div>

      {/* Skill bars */}
      <div className="space-y-1">
        {emp.skills ? (
          <>
            {ROLE_SKILL_NAMES[emp.role].map((skillName, i) => {
              const level = i === 0 ? emp.skills!.skill1 : i === 1 ? emp.skills!.skill2 : emp.skills!.skill3;
              const xp = i === 0 ? emp.skills!.xp1 : i === 1 ? emp.skills!.xp2 : emp.skills!.xp3;
              const threshold = level * 15;
              const xpPct = threshold > 0 ? Math.min(100, (xp / threshold) * 100) : 100;
              return (
                <div key={skillName}>
                  <div className="flex justify-between text-[10px] text-zinc-600 mb-0.5">
                    <span>{skillName}</span>
                    <span className="text-zinc-400">{level}/20</span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${(level / 20) * 100}%` }}
                    />
                  </div>
                  {level < 20 && (
                    <div className="h-0.5 w-full overflow-hidden rounded-full bg-zinc-800/50 mt-0.5">
                      <div
                        className="h-full rounded-full bg-emerald-500/30 transition-all"
                        style={{ width: `${xpPct}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </>
        ) : (
          <>
            <div className="flex justify-between text-[10px] text-zinc-600 mb-0.5">
              <span>Quality</span>
              <span>{emp.quality}/20</span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${(emp.quality / 20) * 100}%` }}
              />
            </div>
          </>
        )}
      </div>

      {/* Salary decision */}
      <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-2 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-zinc-400">Monthly salary</span>
          <Badge variant="outline" className={`text-[10px] ${payPositionClass}`}>
            {payPositionLabel}
          </Badge>
          <span className="text-[10px] text-zinc-400">
            Pay satisfaction {Math.round(emp.paySatisfaction ?? 65)}/100
          </span>
        </div>
        {editingSalary ? (
          <div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-zinc-400">£</span>
              <input
                type="number"
                min={salaryBand.minimum}
                max={salaryBand.maximum}
                step={25}
                value={salaryInput}
                onChange={(event) => {
                  setSalaryInput(event.target.value);
                  setSalaryError(null);
                }}
                className="min-h-11 w-28 rounded border border-zinc-700 bg-zinc-900 px-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                aria-label={`New monthly salary for ${emp.name}`}
                aria-describedby={`salary-guidance-${emp.id} salary-error-${emp.id}`}
                aria-invalid={salaryError !== null}
              />
              <span className="text-xs text-zinc-400">/mo</span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={handleSalarySave}
                className="h-11 w-11 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
                aria-label={`Save salary for ${emp.name}`}
              >
                <Check size={12} aria-hidden="true" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => {
                  setSalaryInput(String(emp.salary));
                  setSalaryError(null);
                  setEditingSalary(false);
                }}
                className="h-11 w-11 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300"
                aria-label={`Cancel salary edit for ${emp.name}`}
              >
                <X size={12} aria-hidden="true" />
              </Button>
            </div>
            <p id={`salary-error-${emp.id}`} className="mt-1 text-[10px] text-red-300" aria-live="polite">
              {salaryError}
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <span className="text-xs text-zinc-200 font-mono">£{emp.salary.toLocaleString()}/mo</span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => {
                setSalaryInput(String(emp.salary));
                setSalaryError(null);
                setEditingSalary(true);
              }}
              className="h-11 w-11 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300"
              aria-label={`Edit ${emp.name}'s salary`}
            >
              <Pencil size={10} aria-hidden="true" />
            </Button>
          </div>
        )}
        <p id={`salary-guidance-${emp.id}`} className="text-xs leading-4 text-zinc-400">
          Contract band £{salaryBand.minimum.toLocaleString()}–£{salaryBand.maximum.toLocaleString()}
          {" · "}fair £{salaryBand.fairMinimum.toLocaleString()}–£{salaryBand.fairMaximum.toLocaleString()}
          {" · "}market £{salaryBand.marketRate.toLocaleString()}
        </p>
        <p className="text-xs leading-4 text-zinc-400">
          Based on {ROLE_LABELS[emp.role]} · {emp.quality}/20 quality · {emp.experience.toLocaleString()} XP · {employerReputation} agency reputation
        </p>
        <p className="text-xs leading-4 text-zinc-400">
          {payEffects.position === "underMarket"
            ? `Saves £${Math.max(0, salaryBand.marketRate - emp.salary).toLocaleString()}/mo; morale ${payEffects.weeklyMoraleDelta}/wk, ${Math.round(payEffects.retentionRisk * 100)}% exit risk and ${Math.round(payEffects.poachingChance * 100)}% poach pressure.`
            : payEffects.position === "premium"
              ? `Costs £${Math.max(0, emp.salary - salaryBand.marketRate).toLocaleString()}/mo above market; improves retention and output up to ${Math.round((payEffects.performanceMultiplier - 1) * 100)}%.`
              : "Stable compensation: low exit pressure without the cost of a premium contract."}
        </p>
      </div>

      {/* Assignment dropdown */}
      {!emp.onLeave && assignmentOpts.length > 0 && (
        <div className="flex items-center gap-2">
          <label htmlFor={`assign-${emp.id}`} className="text-xs text-zinc-500 shrink-0">
            Task:
          </label>
          <select
            id={`assign-${emp.id}`}
            value={assignVal}
            onChange={(e) => handleAssignmentChange(e.target.value)}
            className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-white focus:border-emerald-500 focus:outline-none"
          >
            {assignmentOpts.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Training */}
      {emp.skills && !emp.activeTraining && !emp.onLeave && (
        <div className="space-y-1">
          <span className="text-xs text-zinc-500">Train:</span>
          <div className="flex flex-wrap gap-1">
            {ROLE_SKILL_NAMES[emp.role].map((skillName, i) => {
              const level = i === 0 ? emp.skills!.skill1 : i === 1 ? emp.skills!.skill2 : emp.skills!.skill3;
              if (level >= 20) return null;
              const cost = 300 + level * 150;
              const duration = 2 + Math.floor(level / 5);
              return (
                <Button
                  key={skillName}
                  size="sm"
                  variant="outline"
                  className="h-6 text-[10px] px-1.5 border-zinc-700 text-zinc-400 hover:text-white hover:border-emerald-500/50"
                  onClick={() => onTrain(emp.id, (i + 1) as 1 | 2 | 3)}
                  title={`£${cost} • ${duration}w leave • +1 ${skillName}`}
                >
                  {skillName} (£{cost})
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {/* Active training indicator */}
      {emp.activeTraining && (
        <div className="flex items-center gap-2 text-xs">
          <Badge className="text-[10px] bg-blue-500/20 text-blue-400 border-blue-500/30">
            Training: {emp.activeTraining.skillName}
          </Badge>
          <span className="text-zinc-500">{emp.activeTraining.weeksRemaining}w remaining</span>
        </div>
      )}

      {/* Activity log toggle */}
      {recentLogs.length > 0 && (
        <div>
          <button
            onClick={() => setLogsOpen((o) => !o)}
            className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition"
            aria-expanded={logsOpen}
          >
            {logsOpen ? <ChevronUp size={10} aria-hidden="true" /> : <ChevronDown size={10} aria-hidden="true" />}
            Activity log ({recentLogs.length})
          </button>
          {logsOpen && (
            <ul className="mt-1.5 space-y-1 pl-2 border-l border-zinc-800">
              {recentLogs.map((log, i) => (
                <li key={i} className="text-[10px] text-zinc-500">
                  <span className="text-zinc-600 font-mono">S{log.season}W{log.week}</span>{" "}
                  {log.action}
                  {log.result && (
                    <span className="text-zinc-400"> — {log.result}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {relationshipProfile && (
        <div>
          <button
            type="button"
            onClick={() => setRelationshipOpen((open) => !open)}
            className="flex min-h-11 items-center gap-1 text-xs text-sky-300 transition hover:text-sky-200"
            aria-expanded={relationshipOpen}
            aria-controls={`employee-relationship-${emp.id}`}
          >
            {relationshipOpen
              ? <ChevronUp size={12} aria-hidden="true" />
              : <ChevronDown size={12} aria-hidden="true" />}
            History, promises and trust
            {relationshipProfile.influence.activeObligations > 0 && (
              <Badge className="ml-1 border-amber-400/30 bg-amber-400/10 text-[10px] text-amber-200">
                {relationshipProfile.influence.activeObligations} active
              </Badge>
            )}
          </button>
          {relationshipOpen && (
            <div id={`employee-relationship-${emp.id}`} className="mt-2">
              <StakeholderEcologyPanel
                profile={relationshipProfile}
                title="Employment relationship"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
