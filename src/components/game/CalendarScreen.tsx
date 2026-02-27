"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  MapPin,
  Eye,
  Target,
  Zap,
  Sparkles,
  Wand2,
  FastForward,
} from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import type { Activity, ActivityType } from "@/engine/core/types";
import {
  getUpcomingSeasonEvents,
  isInternationalBreak,
  getSeasonPhase,
} from "@/engine/core/seasonEvents";
import {
  isTransferWindowOpen,
  getCurrentTransferWindow,
  isDeadlineDayPressure,
} from "@/engine/core/transferWindow";
import { ACTIVITY_DISPLAY } from "./calendar/ActivityCard";
import { ActivityPanel } from "./calendar/ActivityPanel";
import { TargetPicker } from "./calendar/TargetPicker";
import { useTranslations } from "next-intl";
import { useAudio } from "@/lib/audio/useAudio";
import { isScoutAbroad } from "@/engine/world/travel";
import { generateWeekPreview } from "@/engine/core/weekPreview";
import type { WeekPreview } from "@/engine/core/weekPreview";
import { BatchSummary } from "./BatchSummary";
import { ScreenBackground } from "@/components/ui/screen-background";

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
    requestWeekAdvance,
    getClub,
    lastWeekSummary,
    dismissWeekSummary,
    getAvailableCalendarActivities,
    pendingCalendarActivity,
    setPendingCalendarActivity,
    autoSchedule,
    batchAdvance,
    batchSummary,
    dismissBatchSummary,
  } = useGameStore();

  const t = useTranslations("calendar");
  const { playSFX } = useAudio();

  // League filter for fixture activities — must be called before early return
  const [selectedLeagueId, setSelectedLeagueId] = useState<string>("all");

  // When navigating from PlayerProfile quick actions, clear pending on unmount
  // so it doesn't persist if the user navigates away without scheduling.
  // The pending activity is surfaced in the ActivityPanel as a highlighted suggestion.
  useEffect(() => {
    return () => { setPendingCalendarActivity(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Week preview panel collapsed state
  const [previewCollapsed, setPreviewCollapsed] = useState(false);

  // Click-to-place: selected activity + pending day for targetPool activities
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [selectedPendingDay, setSelectedPendingDay] = useState<number | null>(null);

  // Drag-and-drop state
  const [dragOverDay, setDragOverDay] = useState<number | null>(null);

  // Hover state for multi-slot preview during click-to-place
  const [hoverDay, setHoverDay] = useState<number | null>(null);

  // Batch advance dialog state
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  const [batchWeeks, setBatchWeeks] = useState(4);

  // Empty-day warning dialog
  const [showEmptyDayWarning, setShowEmptyDayWarning] = useState(false);

  useEffect(() => {
    if (!showEmptyDayWarning) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowEmptyDayWarning(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showEmptyDayWarning]);

  // Escape to deselect click-to-place activity
  useEffect(() => {
    if (!selectedActivity) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedActivity(null);
        setHoverDay(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedActivity]);

  // Stable callback for resolving club IDs to names in ActivityPanel
  const resolveClubName = useCallback(
    (id: string) => getClub(id)?.name ?? id,
    [getClub],
  );

  // Week preview — computed once per render from game state.
  // Must be called before any early return to satisfy Rules of Hooks.
  // Returns a stub when gameState is null; keeps hooks unconditional.
  const weekPreview: WeekPreview = useMemo(
    () =>
      gameState
        ? generateWeekPreview(gameState)
        : { relevantMatches: [], totalFixtures: 0, congestion: "light" as const, fatigueWarning: false, isAbroad: false, suggestions: [] },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gameState?.currentWeek, gameState?.watchlist, gameState?.managerDirectives, gameState?.scout?.fatigue],
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
  const abroad = isScoutAbroad(scout, currentWeek);
  const abroadCountry = abroad ? scout.travelBooking!.destinationCountry : null;

  // Transfer window state
  const twArray = gameState.transferWindow ? [gameState.transferWindow] : [];
  const transferWindowActive = isTransferWindowOpen(twArray, currentWeek);
  const currentWindow = getCurrentTransferWindow(twArray, currentWeek);
  const isDeadlineDay = currentWindow ? isDeadlineDayPressure(currentWindow, currentWeek) : false;

  const allLeagues = Object.values(gameState.leagues);
  const fixtureLeagueById: Record<string, string> = {};
  for (const fixture of Object.values(gameState.fixtures)) {
    fixtureLeagueById[fixture.id] = fixture.leagueId;
  }

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

  const handleApplySuggestions = () => {
    for (const suggestion of weekPreview?.suggestions ?? []) {
      if (canScheduleAt(suggestion.activity, suggestion.dayIndex)) {
        scheduleActivity(suggestion.activity, suggestion.dayIndex);
      }
    }
  };

  // Click-to-place: user clicked an empty day slot while an activity is selected
  const handleDaySlotClick = (dayIndex: number) => {
    if (!selectedActivity) return;
    if (!canScheduleAt(selectedActivity, dayIndex)) return;

    if (selectedActivity.targetPool && selectedActivity.targetPool.length > 0) {
      // Defer to TargetPicker modal
      setSelectedPendingDay(dayIndex);
      return;
    }

    handleSchedule(selectedActivity, dayIndex);
    setSelectedActivity(null);
    setHoverDay(null);
  };

  // Drag-and-drop: user dropped an activity on a day slot
  const handleDaySlotDrop = (e: React.DragEvent, dayIndex: number) => {
    e.preventDefault();
    setDragOverDay(null);
    try {
      const droppedActivity: Activity = JSON.parse(
        e.dataTransfer.getData("application/json"),
      );
      if (!canScheduleAt(droppedActivity, dayIndex)) return;

      if (droppedActivity.targetPool && droppedActivity.targetPool.length > 0) {
        // Defer to TargetPicker modal
        setSelectedActivity(droppedActivity);
        setSelectedPendingDay(dayIndex);
        return;
      }

      handleSchedule(droppedActivity, dayIndex);
    } catch { /* ignore invalid drag data */ }
  };

  // Determine picker mode for the TargetPicker modal
  const CONTACT_TYPES = new Set(["networkMeeting"]);
  const OPTION_TYPES = new Set(["watchVideo"]);
  const modalPickerMode: "player" | "contact" | "option" =
    selectedActivity && CONTACT_TYPES.has(selectedActivity.type) ? "contact"
    : selectedActivity && OPTION_TYPES.has(selectedActivity.type) ? "option"
    : "player";

  return (
    <GameLayout>
      <div className="p-4 md:p-6 relative">
        <ScreenBackground src="/images/backgrounds/dashboard-office.png" opacity={0.85} />
        <div className="relative z-10">
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
          <div className="flex items-center gap-2">
            <Tooltip content="Auto-fill empty days with optimal activities based on your watchlist and priorities." side="bottom">
              <Button variant="outline" size="sm" onClick={() => autoSchedule()} className="gap-1.5">
                <Wand2 size={14} />
                Auto-Schedule
              </Button>
            </Tooltip>
            <Tooltip content="Auto-schedule and advance multiple weeks at once." side="bottom">
              <Button variant="outline" size="sm" onClick={() => setShowBatchDialog(true)} className="gap-1.5">
                <FastForward size={14} />
                Batch
              </Button>
            </Tooltip>
            <Tooltip content="Process all scheduled activities and advance to the next week." side="bottom">
              <Button onClick={() => {
                const emptyCount = (gameState.schedule.activities ?? []).filter((a) => a === null).length;
                if (emptyCount > 0) {
                  setShowEmptyDayWarning(true);
                } else {
                  playSFX("calendar-slide");
                  requestWeekAdvance();
                }
              }} data-tutorial-id="advance-week">Advance Week</Button>
            </Tooltip>
          </div>
        </div>

        {/* Abroad location indicator */}
        {abroadCountry && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-blue-500/30 bg-blue-500/10 px-4 py-2.5 text-sm text-blue-300">
            <MapPin size={14} className="shrink-0" aria-hidden="true" />
            Currently in: <span className="font-semibold text-white">{abroadCountry.charAt(0).toUpperCase() + abroadCountry.slice(1)}</span> — scouting activities will target this country
          </div>
        )}

        {/* International break banner */}
        {internationalBreak && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-sky-500/30 bg-sky-500/10 px-4 py-2.5 text-sm text-sky-300">
            <Info size={14} className="shrink-0" aria-hidden="true" />
            International Break — League matches suspended
          </div>
        )}

        {/* Transfer window banner */}
        {transferWindowActive && currentWindow && (
          <div
            className={`mb-4 rounded-md border px-4 py-2.5 text-sm ${
              isDeadlineDay
                ? "border-red-500/30 bg-red-500/10 text-red-300"
                : "border-amber-500/30 bg-amber-500/10 text-amber-300"
            }`}
          >
            <div className="flex items-center gap-2 font-semibold mb-0.5">
              <AlertTriangle size={14} className="shrink-0" aria-hidden="true" />
              {isDeadlineDay
                ? "DEADLINE DAY — Final week of transfer window!"
                : `TRANSFER WINDOW ACTIVE — W${currentWindow.openWeek}–W${currentWindow.closeWeek}`}
            </div>
            <p className="text-xs opacity-80">
              {isDeadlineDay
                ? "Assessment requests are more frequent. Don't miss any."
                : "Clubs are making signings. Check your Inbox for urgent assessment requests (+3 reputation)."}
            </p>
          </div>
        )}

        {/* Week Preview Panel (F16) */}
        {(weekPreview.relevantMatches.length > 0 || weekPreview.suggestions.length > 0 || weekPreview.fatigueWarning) && (
          <div className="mb-6 rounded-lg border border-violet-500/20 bg-violet-500/5 p-4">
            <button
              onClick={() => setPreviewCollapsed(!previewCollapsed)}
              className="mb-2 flex w-full items-center justify-between text-left"
            >
              <div className="flex items-center gap-2">
                <Eye size={14} className="text-violet-400" aria-hidden="true" />
                <span className="text-sm font-semibold text-violet-300">Week Preview</span>
                <Badge variant="outline" className="text-[10px] border-violet-500/30 text-violet-400">
                  {weekPreview.totalFixtures} fixture{weekPreview.totalFixtures !== 1 ? "s" : ""}
                </Badge>
                {weekPreview.relevantMatches.length > 0 && (
                  <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400">
                    {weekPreview.relevantMatches.length} with targets
                  </Badge>
                )}
                {weekPreview.congestion === "heavy" && (
                  <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400">
                    Heavy schedule
                  </Badge>
                )}
              </div>
              <span className="text-xs text-zinc-500">{previewCollapsed ? "Show" : "Hide"}</span>
            </button>

            {!previewCollapsed && (
              <div className="space-y-3">
                {/* Congestion / fatigue alerts */}
                {weekPreview.fatigueWarning && (
                  <div className="flex items-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
                    <AlertTriangle size={12} className="shrink-0" aria-hidden="true" />
                    High fatigue ({Math.round(scout.fatigue)}%) — consider scheduling a rest day for recovery.
                  </div>
                )}
                {weekPreview.congestion === "heavy" && (
                  <div className="flex items-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
                    <Zap size={12} className="shrink-0" aria-hidden="true" />
                    Heavy fixture congestion ({weekPreview.totalFixtures} matches) — many scouting opportunities but watch your fatigue.
                  </div>
                )}

                {/* Relevant matches */}
                {weekPreview.relevantMatches.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      Key Matches This Week
                    </p>
                    <div className="space-y-1.5">
                      {weekPreview.relevantMatches.slice(0, 5).map((pm) => {
                        const home = gameState.clubs[pm.homeClubId];
                        const away = gameState.clubs[pm.awayClubId];
                        const league = gameState.leagues[pm.leagueId];
                        return (
                          <div
                            key={pm.fixtureId}
                            className="flex items-center justify-between rounded-md border border-[#27272a] bg-[#0a0a0a] px-3 py-2"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-white">
                                {home?.shortName ?? "?"} vs {away?.shortName ?? "?"}
                              </span>
                              {league && (
                                <Badge variant="outline" className="text-[9px]">
                                  {league.shortName}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              {pm.watchlistPlayerIds.length > 0 && (
                                <Tooltip
                                  content={`Watchlist: ${pm.watchlistPlayerIds
                                    .map((pid) => {
                                      const p = gameState.players[pid];
                                      return p ? `${p.firstName} ${p.lastName}` : pid.slice(0, 8);
                                    })
                                    .join(", ")}`}
                                  side="top"
                                >
                                  <span className="inline-flex items-center gap-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-400">
                                    <Target size={10} aria-hidden="true" />
                                    {pm.watchlistPlayerIds.length}
                                  </span>
                                </Tooltip>
                              )}
                              {pm.directivePlayerIds.length > 0 && (
                                <Tooltip
                                  content={`Directive targets: ${pm.directivePlayerIds
                                    .map((pid) => {
                                      const p = gameState.players[pid];
                                      return p ? `${p.firstName} ${p.lastName}` : pid.slice(0, 8);
                                    })
                                    .join(", ")}`}
                                  side="top"
                                >
                                  <span className="inline-flex items-center gap-0.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-400">
                                    <Sparkles size={10} aria-hidden="true" />
                                    {pm.directivePlayerIds.length}
                                  </span>
                                </Tooltip>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Suggested schedule */}
                {weekPreview.suggestions.length > 0 && (
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                        Suggested Schedule
                      </p>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-6 px-2 text-[10px]"
                        onClick={handleApplySuggestions}
                      >
                        Apply All
                      </Button>
                    </div>
                    <div className="space-y-1">
                      {weekPreview.suggestions.map((s, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between rounded-md border border-[#27272a] bg-[#0a0a0a] px-3 py-1.5"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-semibold text-zinc-500 uppercase w-6">
                              {DAY_KEYS[s.dayIndex] ?? `D${s.dayIndex}`}
                            </span>
                            <span className="text-xs text-white">{s.activity.description}</span>
                          </div>
                          <Tooltip content={s.reason} side="left">
                            <span className="max-w-[180px] truncate text-[10px] text-zinc-500">
                              {s.reason}
                            </span>
                          </Tooltip>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
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

            // Determine the "active" activity for hover/drag preview
            const anchorDay = hoverDay ?? dragOverDay;
            const activeAct = selectedActivity ?? (dragOverDay != null ? selectedActivity : null);

            // Slot highlighting for click-to-place and drag-and-drop
            const isEmpty = !activity;
            const isAnchor = anchorDay === i && isEmpty && activeAct && canScheduleAt(activeAct, i);
            const isMultiSlotGhost = activeAct && anchorDay != null && isEmpty
              && i > anchorDay && i < anchorDay + activeAct.slots
              && canScheduleAt(activeAct, anchorDay);
            const isInvalidDrop = activeAct && anchorDay === i && isEmpty && !canScheduleAt(activeAct, i);

            // Also highlight when dragging (dragOverDay is independent of selectedActivity)
            const isDragAnchor = dragOverDay === i && isEmpty;
            const dragActivity = isDragAnchor ? activeAct : null;
            // For drag, we need to check multi-slot even without selectedActivity
            // since the dragged activity comes from dataTransfer (not available during dragOver)
            // We'll highlight the anchor slot on dragOver; multi-slot ghost requires selectedActivity

            const slotClass = activity
              ? "border-emerald-500/30 bg-emerald-500/5"
              : isAnchor || isDragAnchor
                ? "border-blue-500/50 bg-blue-500/10 ring-1 ring-blue-500/30 cursor-pointer"
                : isMultiSlotGhost
                  ? "border-blue-500/30 bg-blue-500/5"
                  : isInvalidDrop
                    ? "border-red-500/30 bg-red-500/5"
                    : selectedActivity && isEmpty
                      ? "border-[#27272a] bg-[#141414] cursor-pointer hover:border-blue-500/30 hover:bg-blue-500/5"
                      : "border-[#27272a] bg-[#141414]";

            return (
              <div key={dayKey} className="flex flex-col gap-1">
                <p className="text-center text-xs font-semibold text-zinc-500">{t(`dayLabels.${dayKey}`)}</p>
                <Tooltip content={selectedActivity ? `Click to place ${ACTIVITY_DISPLAY[selectedActivity.type]?.label ?? "activity"} here` : "Drag or click an activity card, then place it here."} side="top">
                <div
                  className={`min-h-[80px] rounded-lg border p-2 transition ${slotClass}`}
                  onClick={() => handleDaySlotClick(i)}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                  onDragEnter={(e) => { e.preventDefault(); setDragOverDay(i); }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverDay(null);
                  }}
                  onDrop={(e) => handleDaySlotDrop(e, i)}
                  onMouseEnter={() => { if (selectedActivity) setHoverDay(i); }}
                  onMouseLeave={() => { if (selectedActivity) setHoverDay(null); }}
                >
                  {activity && display && Icon ? (
                    <div className="relative flex h-full flex-col gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); unscheduleActivity(i); }}
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
                    <p className={`text-center text-xs mt-2 ${isAnchor || isDragAnchor ? "text-blue-400" : "text-zinc-600"}`}>
                      {isAnchor || isDragAnchor ? "Drop here" : "Empty"}
                    </p>
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
          fixtureLeagueById={fixtureLeagueById}
          onLeagueFilterChange={setSelectedLeagueId}
          resolveClubName={resolveClubName}
          highlightTargetId={pendingCalendarActivity?.targetId}
          selectedActivity={selectedActivity}
          onSelectActivity={setSelectedActivity}
        />
        </div>
        </div>
      </div>
      {/* Empty-day warning dialog */}
      {showEmptyDayWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" className="mx-4 w-full max-w-sm rounded-lg border border-amber-500/30 bg-zinc-900 p-6 shadow-xl">
            <div className="mb-3 flex items-center gap-2 text-amber-400">
              <AlertTriangle size={18} />
              <h3 className="text-lg font-semibold">Unplanned Days</h3>
            </div>
            <p className="mb-5 text-sm text-zinc-300">
              You have{" "}
              <span className="font-semibold text-amber-400">
                {(gameState.schedule.activities ?? []).filter((a) => a === null).length}
              </span>{" "}
              unplanned day(s). Empty days recover a small amount of fatigue but
              scheduled activities earn XP and progress. Advance anyway?
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowEmptyDayWarning(false)}
              >
                Go Back
              </Button>
              <Button
                onClick={() => {
                  setShowEmptyDayWarning(false);
                  playSFX("calendar-slide");
                  requestWeekAdvance();
                }}
              >
                Advance
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Batch advance dialog */}
      {showBatchDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" className="mx-4 w-full max-w-sm rounded-lg border border-blue-500/30 bg-zinc-900 p-6 shadow-xl">
            <div className="mb-3 flex items-center gap-2 text-blue-400">
              <FastForward size={18} />
              <h3 className="text-lg font-semibold">Batch Advance</h3>
            </div>
            <p className="mb-4 text-sm text-zinc-300">
              Auto-schedule and advance multiple weeks. Activities are chosen based
              on your watchlist and current priorities.
            </p>
            <div className="mb-5">
              <label className="mb-1 block text-xs text-zinc-500">Weeks to advance</label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={8}
                  value={batchWeeks}
                  onChange={(e) => setBatchWeeks(Number(e.target.value))}
                  className="flex-1 accent-blue-500"
                />
                <span className="min-w-[2rem] text-center text-lg font-bold text-white">{batchWeeks}</span>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowBatchDialog(false)}>
                Cancel
              </Button>
              <Button onClick={() => {
                setShowBatchDialog(false);
                batchAdvance(batchWeeks);
              }}>
                Advance {batchWeeks} Week{batchWeeks !== 1 ? "s" : ""}
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Batch summary overlay */}
      {batchSummary && (
        <BatchSummary result={batchSummary} onDismiss={dismissBatchSummary} />
      )}
      {/* TargetPicker modal for click-to-place / drag-and-drop with targetPool activities */}
      {selectedActivity && selectedPendingDay != null && selectedActivity.targetPool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-4">
            <TargetPicker
              inline
              targets={selectedActivity.targetPool}
              mode={modalPickerMode}
              onSelect={(targetId) => {
                handleSchedule(
                  { ...selectedActivity, targetId, targetPool: undefined },
                  selectedPendingDay,
                );
                setSelectedActivity(null);
                setSelectedPendingDay(null);
                setHoverDay(null);
              }}
              onClose={() => {
                setSelectedPendingDay(null);
              }}
            />
          </div>
        </div>
      )}
    </GameLayout>
  );
}
