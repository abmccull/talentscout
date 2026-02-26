"use client";

import { useGameStore } from "@/stores/gameStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, CheckCircle } from "lucide-react";
import type { EmployeeEvent, AgencyEmployee } from "@/engine/core/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getEventTypeColor(type: EmployeeEvent["type"]): string {
  switch (type) {
    case "poaching": return "border-red-500/30 bg-red-500/5";
    case "trainingRequest": return "border-blue-500/30 bg-blue-500/5";
    case "personalIssue": return "border-amber-500/30 bg-amber-500/5";
    case "breakthrough": return "border-emerald-500/30 bg-emerald-500/5";
    default: return "border-zinc-700 bg-zinc-800/30";
  }
}

function getEventTypeLabel(type: EmployeeEvent["type"]): string {
  switch (type) {
    case "poaching": return "Poaching Attempt";
    case "trainingRequest": return "Training Request";
    case "personalIssue": return "Personal Issue";
    case "breakthrough": return "Breakthrough";
    default: return "Event";
  }
}

function getMoraleChangeColor(delta: number): string {
  if (delta > 0) return "text-emerald-400";
  if (delta < 0) return "text-red-400";
  return "text-zinc-400";
}

// ─── Component ────────────────────────────────────────────────────────────────

interface EventsTabProps {
  pendingEvents: EmployeeEvent[];
  employees: AgencyEmployee[];
  currentWeek: number;
  currentSeason: number;
}

export function EventsTab({ pendingEvents, employees, currentWeek, currentSeason }: EventsTabProps) {
  const resolveAgencyEmployeeEvent = useGameStore((s) => s.resolveAgencyEmployeeEvent);

  const employeeMap = new Map(employees.map((e) => [e.id, e]));

  function weeksRemaining(event: EmployeeEvent): number {
    const currentTotal = currentSeason * 52 + currentWeek;
    const deadlineTotal = event.deadlineSeason * 52 + event.deadline;
    return Math.max(0, deadlineTotal - currentTotal);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Bell size={14} className="text-zinc-400" aria-hidden="true" />
          Pending Events
          {pendingEvents.length > 0 && (
            <span className="ml-auto rounded-full bg-amber-500/20 text-amber-400 text-[10px] px-1.5 py-0.5 font-medium">
              {pendingEvents.length}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {pendingEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle size={28} className="text-zinc-700 mb-2" aria-hidden="true" />
            <p className="text-sm text-zinc-400">No pending events</p>
            <p className="text-xs text-zinc-600 mt-1">
              Employee events appear here when they need your attention. Events expire after a few weeks if unresolved.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingEvents.map((event) => {
              const emp = employeeMap.get(event.employeeId);
              const weeksLeft = weeksRemaining(event);
              return (
                <div
                  key={event.id}
                  className={`rounded-lg border p-3 space-y-2 ${getEventTypeColor(event.type)}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-zinc-200">
                          {getEventTypeLabel(event.type)}
                        </span>
                        {emp && (
                          <span className="text-[10px] text-zinc-500">{emp.name}</span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-400 mt-1">{event.description}</p>
                    </div>
                    <span
                      className={`shrink-0 text-[10px] font-mono rounded-full px-1.5 py-0.5 ${
                        weeksLeft <= 1
                          ? "bg-red-500/20 text-red-400"
                          : weeksLeft <= 2
                            ? "bg-amber-500/20 text-amber-400"
                            : "bg-zinc-800 text-zinc-500"
                      }`}
                    >
                      {weeksLeft}w left
                    </span>
                  </div>

                  {/* Options */}
                  <div className="flex flex-col gap-1.5">
                    {event.options.map((opt, idx) => (
                      <button
                        key={idx}
                        onClick={() => resolveAgencyEmployeeEvent(event.id, idx)}
                        className="w-full rounded border border-zinc-700 bg-zinc-900/50 px-3 py-2 text-left hover:border-emerald-600/50 hover:bg-emerald-950/10 transition"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-zinc-200">{opt.label}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            {opt.cost !== undefined && opt.cost > 0 && (
                              <span className="text-[10px] text-amber-400 font-mono">
                                -£{opt.cost.toLocaleString()}
                              </span>
                            )}
                            {opt.moraleChange !== 0 && (
                              <span className={`text-[10px] font-mono ${getMoraleChangeColor(opt.moraleChange)}`}>
                                {opt.moraleChange > 0 ? "+" : ""}{opt.moraleChange} morale
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
