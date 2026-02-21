"use client";

import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Eye,
  Video,
  FileText,
  Users,
  Book,
  Moon,
  GraduationCap,
  Trophy,
  X,
  AlertTriangle,
  ChevronRight,
  Info,
  CalendarDays,
} from "lucide-react";
import type { Activity, ActivityType } from "@/engine/core/types";
import {
  getUpcomingSeasonEvents,
  isInternationalBreak,
  getSeasonPhase,
} from "@/engine/core/seasonEvents";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const SEASON_PHASE_CONFIG: Record<
  "preseason" | "earlyseason" | "midseason" | "lateseason" | "endseason",
  { label: string; className: string }
> = {
  preseason:   { label: "Preseason",    className: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  earlyseason: { label: "Early Season", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  midseason:   { label: "Midseason",    className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  lateseason:  { label: "Late Season",  className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  endseason:   { label: "End of Season", className: "bg-red-500/15 text-red-400 border-red-500/30" },
};

const ACTIVITY_CONFIG: Record<
  ActivityType,
  { label: string; icon: React.ElementType; slots: number; color: string }
> = {
  attendMatch: { label: "Attend Match", icon: Eye, slots: 2, color: "text-emerald-400" },
  watchVideo: { label: "Watch Video", icon: Video, slots: 1, color: "text-blue-400" },
  writeReport: { label: "Write Report", icon: FileText, slots: 1, color: "text-amber-400" },
  networkMeeting: { label: "Network Meeting", icon: Users, slots: 1, color: "text-purple-400" },
  trainingVisit: { label: "Training Visit", icon: Eye, slots: 2, color: "text-orange-400" },
  travel: { label: "Travel", icon: ChevronRight, slots: 1, color: "text-zinc-400" },
  study: { label: "Study", icon: Book, slots: 1, color: "text-cyan-400" },
  rest: { label: "Rest", icon: Moon, slots: 1, color: "text-zinc-400" },
  academyVisit: { label: "Academy Visit", icon: GraduationCap, slots: 2, color: "text-pink-400" },
  youthTournament: { label: "Youth Tournament", icon: Trophy, slots: 2, color: "text-yellow-400" },
  reviewNPCReport: { label: "Review NPC Report", icon: FileText, slots: 1, color: "text-teal-400" },
  managerMeeting: { label: "Manager Meeting", icon: Users, slots: 1, color: "text-rose-400" },
  boardPresentation: { label: "Board Presentation", icon: Users, slots: 2, color: "text-indigo-400" },
  assignTerritory: { label: "Assign Territory", icon: ChevronRight, slots: 1, color: "text-lime-400" },
  internationalTravel: { label: "International Travel", icon: ChevronRight, slots: 2, color: "text-sky-400" },
};

function fatigueSeverity(fatigue: number): "ok" | "warn" | "danger" {
  if (fatigue >= 75) return "danger";
  if (fatigue >= 50) return "warn";
  return "ok";
}

const SKILL_LABELS: Record<string, string> = {
  technicalEye: "Technical Eye",
  physicalAssessment: "Physical Assessment",
  psychologicalRead: "Psychological Read",
  tacticalUnderstanding: "Tactical Understanding",
  dataLiteracy: "Data Literacy",
};

const ATTR_LABELS: Record<string, string> = {
  networking: "Networking",
  persuasion: "Persuasion",
  endurance: "Endurance",
  adaptability: "Adaptability",
  memory: "Memory",
  intuition: "Intuition",
};

export function CalendarScreen() {
  const {
    gameState,
    scheduleActivity,
    unscheduleActivity,
    advanceWeek,
    getUpcomingFixtures,
    getClub,
    getLeague,
    lastWeekSummary,
    dismissWeekSummary,
  } = useGameStore();

  if (!gameState) return null;

  const { schedule, currentWeek, currentSeason, scout } = gameState;
  const activities = schedule.activities ?? [];
  const slotsUsed = activities.filter(Boolean).length;
  const maxSlots = 7;
  const severity = fatigueSeverity(scout.fatigue);

  const upcomingFixtures = getUpcomingFixtures(currentWeek, 10).filter(
    (f) => f.week === currentWeek
  );

  const seasonPhase = getSeasonPhase(currentWeek);
  const upcomingEvents = getUpcomingSeasonEvents(gameState.seasonEvents, currentWeek, 3);
  const internationalBreak = isInternationalBreak(gameState.seasonEvents, currentWeek);

  const availableActivities: Array<{ activity: Activity; label: string }> = [
    ...upcomingFixtures.map((f) => {
      const home = getClub(f.homeClubId);
      const away = getClub(f.awayClubId);
      const league = getLeague(f.leagueId);
      const weatherStr = f.weather ? ` — ${f.weather.replace(/([A-Z])/g, " $1").trim()}` : "";
      return {
        activity: {
          type: "attendMatch" as ActivityType,
          slots: 2,
          targetId: f.id,
          description: `${home?.shortName ?? "?"} vs ${away?.shortName ?? "?"} (${league?.shortName ?? "?"})${weatherStr}`,
        } satisfies Activity,
        label: `${home?.shortName ?? "?"} vs ${away?.shortName ?? "?"}`,
      };
    }),
    {
      activity: { type: "watchVideo", slots: 1, description: "Review video footage" },
      label: "Watch Video",
    },
    {
      activity: { type: "writeReport", slots: 1, description: "Write a scouting report" },
      label: "Write Report",
    },
    {
      activity: { type: "networkMeeting", slots: 1, description: "Meet with a contact" },
      label: "Network Meeting",
    },
    {
      activity: { type: "study", slots: 1, description: "Study tactics and improve skills" },
      label: "Study",
    },
    {
      activity: { type: "rest", slots: 1, description: "Rest and recover fatigue" },
      label: "Rest",
    },
    {
      activity: { type: "trainingVisit", slots: 2, description: "Visit training ground" },
      label: "Training Visit (2 slots)",
    },
    {
      activity: { type: "academyVisit", slots: 2, description: "Visit youth academy" },
      label: "Academy Visit (2 slots)",
    },
    {
      activity: { type: "youthTournament", slots: 2, description: "Attend youth tournament" },
      label: "Youth Tournament (2 slots)",
    },
    ...(scout.careerTier >= 5
      ? [
          {
            activity: {
              type: "boardPresentation" as ActivityType,
              slots: 2,
              description: "Present scouting strategy to the board",
            } satisfies Activity,
            label: "Board Presentation (2 slots)",
          },
        ]
      : []),
  ];

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
            <Card className="w-full max-w-md">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Week Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
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
                </div>
                {/* XP gains */}
                {Object.keys(lastWeekSummary.skillXpGained).length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-1">Skill XP</p>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(lastWeekSummary.skillXpGained).map(([skill, xp]) => (
                        <Badge key={skill} variant="secondary" className="text-[10px]">
                          {SKILL_LABELS[skill] ?? skill} +{xp}
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
                          {ATTR_LABELS[attr] ?? attr} +{xp}
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
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${SEASON_PHASE_CONFIG[seasonPhase].className}`}
              >
                {SEASON_PHASE_CONFIG[seasonPhase].label}
              </span>
            </div>
            <p className="text-sm text-zinc-400">
              Week {currentWeek} — Season {currentSeason}
            </p>
          </div>
          <Button onClick={advanceWeek}>Advance Week</Button>
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
        <div className="mb-6 grid grid-cols-7 gap-2">
          {DAY_LABELS.map((day, i) => {
            const activity = activities[i];
            const config = activity ? ACTIVITY_CONFIG[activity.type] : null;
            const Icon = config?.icon;
            return (
              <div key={day} className="flex flex-col gap-1">
                <p className="text-center text-xs font-semibold text-zinc-500">{day}</p>
                <div
                  className={`min-h-[80px] rounded-lg border p-2 transition ${
                    activity
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : "border-[#27272a] bg-[#141414]"
                  }`}
                >
                  {activity && config && Icon ? (
                    <div className="relative flex h-full flex-col gap-1">
                      <button
                        onClick={() => unscheduleActivity(i)}
                        className="absolute right-0 top-0 text-zinc-600 hover:text-red-400 transition"
                        aria-label={`Remove ${config.label} from ${day}`}
                      >
                        <X size={12} />
                      </button>
                      <Icon size={16} className={config.color} aria-hidden="true" />
                      <p className={`text-xs font-medium leading-tight ${config.color}`}>
                        {config.label}
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
              </div>
            );
          })}
        </div>

        {/* Available activities */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Available Activities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {availableActivities.map((item, idx) => {
                const config = ACTIVITY_CONFIG[item.activity.type];
                const Icon = config.icon;
                return (
                  <div
                    key={`${item.activity.type}-${idx}`}
                    className="rounded-md border border-[#27272a] bg-[#141414] p-3"
                  >
                    <div className="mb-2 flex items-start justify-between">
                      <Icon size={14} className={config.color} aria-hidden="true" />
                      <Badge variant="outline" className="text-[10px]">
                        {item.activity.slots} slot{item.activity.slots > 1 ? "s" : ""}
                      </Badge>
                    </div>
                    <p className={`mb-2 text-xs font-medium ${config.color}`}>
                      {item.label}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {DAY_LABELS.map((day, dayIdx) => {
                        const canPlace = canScheduleAt(item.activity, dayIdx);
                        return (
                          <button
                            key={day}
                            disabled={!canPlace}
                            onClick={() => handleSchedule(item.activity, dayIdx)}
                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition ${
                              !canPlace
                                ? "cursor-not-allowed bg-[#27272a] text-zinc-600"
                                : "bg-[#27272a] text-zinc-300 hover:bg-emerald-500/20 hover:text-emerald-400"
                            }`}
                            aria-label={`Schedule ${item.label} on ${day}`}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </GameLayout>
  );
}
