"use client";

import { useCallback, useState } from "react";
import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  X,
  AlertTriangle,
  Info,
  CalendarDays,
} from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import type { Activity, ActivityType } from "@/engine/core/types";
import {
  getUpcomingSeasonEvents,
  isInternationalBreak,
  getSeasonPhase,
} from "@/engine/core/seasonEvents";
import { ACTIVITY_DISPLAY } from "./calendar/ActivityCard";
import { ActivityPanel } from "./calendar/ActivityPanel";
import { useTranslations } from "next-intl";
import { useAudio } from "@/lib/audio/useAudio";

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

const SEASON_PHASE_CLASSES: Record<
  "preseason" | "earlyseason" | "midseason" | "lateseason" | "endseason",
  string
> = {
  preseason:   "bg-sky-500/15 text-sky-400 border-sky-500/30",
  earlyseason: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  midseason:   "bg-blue-500/15 text-blue-400 border-blue-500/30",
  lateseason:  "bg-amber-500/15 text-amber-400 border-amber-500/30",
  endseason:   "bg-red-500/15 text-red-400 border-red-500/30",
};

function fatigueSeverity(fatigue: number): "ok" | "warn" | "danger" {
  if (fatigue >= 75) return "danger";
  if (fatigue >= 50) return "warn";
  return "ok";
}


export function CalendarScreen() {
  const {
    gameState,
    scheduleActivity,
    unscheduleActivity,
    advanceWeek,
    getClub,
    lastWeekSummary,
    dismissWeekSummary,
    getAvailableCalendarActivities,
  } = useGameStore();

  const t = useTranslations("calendar");
  const { playSFX } = useAudio();

  // League filter for fixture activities — must be called before early return
  const [selectedLeagueId, setSelectedLeagueId] = useState<string>("all");

  // Stable callback for resolving club IDs to names in ActivityPanel
  const resolveClubName = useCallback(
    (id: string) => getClub(id)?.name ?? id,
    [getClub],
  );

  if (!gameState) return null;

  const { schedule, currentWeek, currentSeason, scout } = gameState;
  const activities = schedule.activities ?? [];
  const slotsUsed = activities.filter(Boolean).length;
  const maxSlots = 7;
  const severity = fatigueSeverity(scout.fatigue);

  const seasonPhase = getSeasonPhase(currentWeek);
  const upcomingEvents = getUpcomingSeasonEvents(gameState.seasonEvents, currentWeek, 3);
  const internationalBreak = isInternationalBreak(gameState.seasonEvents, currentWeek);

  const allLeagues = Object.values(gameState.leagues);

  // Engine-driven activities — specialization-aware, properly gated
  const engineActivities = getAvailableCalendarActivities();

  const canScheduleAt = (activity: Activity, dayIndex: number): boolean => {
    if (dayIndex + activity.slots > maxSlots) return false;
    for (let i = dayIndex; i < dayIndex + activity.slots; i++) {
      if (activities[i]) return false;
    }
    return true;
  };

  const handleSchedule = (activity: Activity, dayIndex: number) => {
    if (!canScheduleAt(activity, dayIndex)) return;
    scheduleActivity(activity, dayIndex);
  };

  return (
    <GameLayout>
      <div className="p-6 relative">
        {/* Week Summary Overlay */}
        {lastWeekSummary && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <Card className="w-full max-w-md max-h-[85vh] overflow-y-auto">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Week Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Activity Results */}
                {lastWeekSummary.activityQualities.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-2">Activity Results</p>
                    <div className="space-y-2">
                      {lastWeekSummary.activityQualities.map((aq, i) => {
                        const cfg = ACTIVITY_DISPLAY[aq.activityType as ActivityType];
                        const label = cfg?.label ?? aq.activityType;
                        const tierColors: Record<string, string> = {
                          poor: "bg-red-500/15 text-red-400 border-red-500/30",
                          average: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
                          good: "bg-blue-500/15 text-blue-400 border-blue-500/30",
                          excellent: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
                          exceptional: "bg-amber-500/15 text-amber-400 border-amber-500/30",
                        };
                        const tierClass = tierColors[aq.tier] ?? tierColors.average;
                        return (
                          <div key={i} className="rounded-md border border-[#27272a] px-3 py-2">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-medium text-white">{label}</span>
                              <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${tierClass}`}>
                                {aq.tier.charAt(0).toUpperCase() + aq.tier.slice(1)}
                              </span>
                            </div>
                            <p className="text-[11px] text-zinc-400 leading-snug">{aq.narrative}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center justify-between rounded-md border border-[#27272a] px-3 py-2">
                    <span className="text-zinc-500">Fatigue</span>
                    <span className={lastWeekSummary.fatigueChange >= 0 ? "text-red-400 font-semibold" : "text-emerald-400 font-semibold"}>
                      {lastWeekSummary.fatigueChange >= 0 ? "+" : ""}{lastWeekSummary.fatigueChange}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-[#27272a] px-3 py-2">
                    <span className="text-zinc-500">Matches</span>
                    <span className="text-white font-semibold">{lastWeekSummary.matchesAttended}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-[#27272a] px-3 py-2">
                    <span className="text-zinc-500">Reports</span>
                    <span className="text-white font-semibold">{lastWeekSummary.reportsWritten}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-[#27272a] px-3 py-2">
                    <span className="text-zinc-500">Meetings</span>
                    <span className="text-white font-semibold">{lastWeekSummary.meetingsHeld}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-[#27272a] px-3 py-2">
                    <span className="text-zinc-500">New Messages</span>
                    <span className="text-white font-semibold">{lastWeekSummary.newMessages}</span>
                  </div>
                  {lastWeekSummary.rivalAlerts > 0 && (
                    <div className="flex items-center justify-between rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
                      <span className="text-amber-400">Rival Alerts</span>
                      <span className="text-amber-400 font-semibold">{lastWeekSummary.rivalAlerts}</span>
                    </div>
                  )}
                  {lastWeekSummary.playersDiscovered > 0 && (
                    <div className="flex items-center justify-between rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
                      <span className="text-emerald-400">Players Discovered</span>
                      <span className="text-emerald-400 font-semibold">{lastWeekSummary.playersDiscovered}</span>
                    </div>
                  )}
                  {lastWeekSummary.observationsGenerated > 0 && (
                    <div className="flex items-center justify-between rounded-md border border-blue-500/30 bg-blue-500/5 px-3 py-2">
                      <span className="text-blue-400">New Observations</span>
                      <span className="text-blue-400 font-semibold">{lastWeekSummary.observationsGenerated}</span>
                    </div>
                  )}
                </div>
                {/* XP gains */}
                {Object.keys(lastWeekSummary.skillXpGained).length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-1">Skill XP</p>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(lastWeekSummary.skillXpGained).map(([skill, xp]) => (
                        <Badge key={skill} variant="secondary" className="text-[10px]">
                          {t(`skills.${skill}` as Parameters<typeof t>[0])} +{xp}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {Object.keys(lastWeekSummary.attributeXpGained).length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-1">Attribute XP</p>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(lastWeekSummary.attributeXpGained).map(([attr, xp]) => (
                        <Badge key={attr} variant="secondary" className="text-[10px]">
                          {t(`attributes.${attr}` as Parameters<typeof t>[0])} +{xp}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {/* Finance summary */}
                {lastWeekSummary.financeSummary && (
                  <div className="rounded-md border border-[#27272a] px-3 py-2 text-xs">
                    <p className="text-zinc-500 mb-1">Monthly Pay</p>
                    <p className="text-white">
                      <span className="text-emerald-400">+£{lastWeekSummary.financeSummary.income}</span>
                      {" income, "}
                      <span className="text-red-400">-£{lastWeekSummary.financeSummary.expenses}</span>
                      {" expenses"}
                    </p>
                  </div>
                )}
                <Button className="w-full" onClick={dismissWeekSummary}>
                  Continue
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <h1 className="text-2xl font-bold">Weekly Planner</h1>
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${SEASON_PHASE_CLASSES[seasonPhase]}`}
              >
                {t(`seasonPhases.${seasonPhase}`)}
              </span>
            </div>
            <p className="text-sm text-zinc-400">
              Week {currentWeek} — Season {currentSeason}
            </p>
          </div>
          <Tooltip content="Process all scheduled activities and advance to the next week." side="bottom">
            <Button onClick={() => { playSFX("calendar-slide"); advanceWeek(); }} data-tutorial-id="advance-week">Advance Week</Button>
          </Tooltip>
        </div>

        {/* International break banner */}
        {internationalBreak && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-sky-500/30 bg-sky-500/10 px-4 py-2.5 text-sm text-sky-300">
            <Info size={14} className="shrink-0" aria-hidden="true" />
            International Break — League matches suspended
          </div>
        )}

        {/* Upcoming season events */}
        {upcomingEvents.length > 0 && (
          <div className="mb-6 rounded-lg border border-[#27272a] bg-[#141414] p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              <CalendarDays size={12} aria-hidden="true" />
              Upcoming Events
            </div>
            <ul className="space-y-1">
              {upcomingEvents.map((event) => (
                <li key={event.id} className="flex items-center justify-between text-xs">
                  <span className="text-zinc-300">{event.name}</span>
                  <span className="text-zinc-500">
                    Week {event.startWeek}
                    {event.endWeek !== event.startWeek ? `–${event.endWeek}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Fatigue meter */}
        <div className="mb-6 rounded-lg border border-[#27272a] bg-[#141414] p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">Fatigue</span>
            <span
              className={
                severity === "danger"
                  ? "text-red-400 text-sm font-semibold"
                  : severity === "warn"
                  ? "text-amber-400 text-sm font-semibold"
                  : "text-emerald-400 text-sm font-semibold"
              }
            >
              {Math.round(scout.fatigue)}%
            </span>
          </div>
          <Progress
            value={scout.fatigue}
            max={100}
            indicatorClassName={
              severity === "danger"
                ? "bg-red-500"
                : severity === "warn"
                ? "bg-amber-500"
                : "bg-emerald-500"
            }
          />
          {severity === "danger" && (
            <p className="mt-2 flex items-center gap-1 text-xs text-red-400">
              <AlertTriangle size={12} />
              High fatigue — accuracy will be significantly reduced. Consider resting.
            </p>
          )}
          {severity === "warn" && (
            <p className="mt-2 flex items-center gap-1 text-xs text-amber-400">
              <AlertTriangle size={12} />
              Moderate fatigue — consider scheduling a rest day.
            </p>
          )}
        </div>

        {/* Slot usage */}
        <div className="mb-4 flex items-center gap-3">
          <span className="text-sm text-zinc-400">
            Slots used: {slotsUsed} / {maxSlots}
          </span>
          <div className="flex gap-1">
            {Array.from({ length: maxSlots }).map((_, i) => (
              <div
                key={i}
                className={`h-2 w-6 rounded-sm ${i < slotsUsed ? "bg-emerald-500" : "bg-[#27272a]"}`}
              />
            ))}
          </div>
        </div>

        {/* 7-day grid */}
        <div className="mb-6 grid grid-cols-7 gap-2" data-tutorial-id="calendar-grid">
          {DAY_KEYS.map((dayKey, i) => {
            const activity = activities[i];
            const display = activity ? ACTIVITY_DISPLAY[activity.type] : null;
            const Icon = display?.icon;
            return (
              <div key={dayKey} className="flex flex-col gap-1">
                <p className="text-center text-xs font-semibold text-zinc-500">{t(`dayLabels.${dayKey}`)}</p>
                <Tooltip content="Drag or click to assign an activity for this day." side="top">
                <div
                  className={`min-h-[80px] rounded-lg border p-2 transition ${
                    activity
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : "border-[#27272a] bg-[#141414]"
                  }`}
                >
                  {activity && display && Icon ? (
                    <div className="relative flex h-full flex-col gap-1">
                      <button
                        onClick={() => unscheduleActivity(i)}
                        className="absolute right-0 top-0 text-zinc-600 hover:text-red-400 transition"
                        aria-label={`Remove ${display.label} from ${t(`dayLabels.${dayKey}`)}`}
                      >
                        <X size={12} />
                      </button>
                      <Icon size={16} className={display.color} aria-hidden="true" />
                      <p className={`text-xs font-medium leading-tight ${display.color}`}>
                        {display.label}
                      </p>
                      {activity.description && (
                        <p className="text-[10px] text-zinc-500 leading-tight line-clamp-2">
                          {activity.description}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-center text-xs text-zinc-600 mt-2">Empty</p>
                  )}
                </div>
                </Tooltip>
              </div>
            );
          })}
        </div>

        {/* Available activities — grouped by category, specialization-aware */}
        <div data-tutorial-id="calendar-activities">
        <ActivityPanel
          activities={engineActivities}
          specialization={scout.primarySpecialization}
          canScheduleAt={canScheduleAt}
          onSchedule={handleSchedule}
          leagueFilter={selectedLeagueId}
          allLeagues={allLeagues}
          onLeagueFilterChange={setSelectedLeagueId}
          resolveClubName={resolveClubName}
        />
        </div>
      </div>
    </GameLayout>
  );
}
