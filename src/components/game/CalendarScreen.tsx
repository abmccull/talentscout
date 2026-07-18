"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
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
} from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import type {
  Activity,
  ActivityType,
  PlacementPitchPosture,
  PlacementSupportCondition,
} from "@/engine/core/types";
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
import { WeeklyStrategyPanel } from "./calendar/WeeklyStrategyPanel";
import { useTranslations } from "next-intl";
import { useAudio } from "@/lib/audio/useAudio";
import { isScoutAbroad } from "@/engine/world/travel";
import { selectLatestReportsByCase } from "@/engine/reports/reportAccountability";
import { generateWeekPreview } from "@/engine/core/weekPreview";
import type { WeekPreview } from "@/engine/core/weekPreview";
import { BatchSummary } from "./BatchSummary";
import { ScreenBackground } from "@/components/ui/screen-background";
import { IS_YOUTH_EARLY_ACCESS } from "@/lib/demo";
import { getEligibleClubsForPlacement } from "@/engine/youth/placement";
import { assessYouthMobility } from "@/engine/youth/youthMobility";
import { projectProspectiveDevelopmentEnvironment } from "@/engine/world/developmentEnvironment";
import { getWorldConditionModifiers } from "@/engine/world";
import { normalizeCountryKey } from "@/lib/country";
import { getSeasonLength } from "@/engine/core/gameDate";
import { normalizeWeeklyStrategyState } from "@/engine/core/weeklyStrategy";

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
    pendingCelebrationTitle,
    dismissWeekSummary,
    getAvailableCalendarActivities,
    pendingCalendarActivity,
    setPendingCalendarActivity,
    autoSchedule,
    setWeeklyIntent,
    setDelegationPolicy,
    batchSummary,
    dismissBatchSummary,
  } = useGameStore(useShallow((state) => ({
    gameState: state.gameState,
    scheduleActivity: state.scheduleActivity,
    unscheduleActivity: state.unscheduleActivity,
    requestWeekAdvance: state.requestWeekAdvance,
    getClub: state.getClub,
    lastWeekSummary: state.lastWeekSummary,
    pendingCelebrationTitle: state.pendingCelebration?.title ?? null,
    dismissWeekSummary: state.dismissWeekSummary,
    getAvailableCalendarActivities: state.getAvailableCalendarActivities,
    pendingCalendarActivity: state.pendingCalendarActivity,
    setPendingCalendarActivity: state.setPendingCalendarActivity,
    autoSchedule: state.autoSchedule,
    setWeeklyIntent: state.setWeeklyIntent,
    setDelegationPolicy: state.setDelegationPolicy,
    batchSummary: state.batchSummary,
    dismissBatchSummary: state.dismissBatchSummary,
  })));

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
  const [previewCollapsed, setPreviewCollapsed] = useState(true);

  // Click-to-place: selected activity + pending day for targetPool activities
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [selectedPendingDay, setSelectedPendingDay] = useState<number | null>(null);
  const [placementYouthId, setPlacementYouthId] = useState<string | null>(null);
  const [placementPitchPosture, setPlacementPitchPosture] = useState<PlacementPitchPosture>("evidenceLed");
  const [placementSupportCondition, setPlacementSupportCondition] = useState<PlacementSupportCondition>("none");

  // Drag-and-drop state
  const [dragOverDay, setDragOverDay] = useState<number | null>(null);

  // Hover state for multi-slot preview during click-to-place
  const [hoverDay, setHoverDay] = useState<number | null>(null);

  // Empty-day warning dialog
  const [showEmptyDayWarning, setShowEmptyDayWarning] = useState(false);
  const weekSummaryDialogRef = useRef<HTMLDivElement>(null);
  const weekSummaryDismissRef = useRef<HTMLButtonElement>(null);
  const emptyDayDialogRef = useRef<HTMLDivElement>(null);
  const emptyDayCancelRef = useRef<HTMLButtonElement>(null);
  const advanceWeekButtonRef = useRef<HTMLButtonElement>(null);

  const closeEmptyDayWarning = useCallback(() => {
    setShowEmptyDayWarning(false);
    window.requestAnimationFrame(() => advanceWeekButtonRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!lastWeekSummary) return;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    weekSummaryDismissRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dismissWeekSummary();
        return;
      }
      if (event.key !== "Tab" || !weekSummaryDialogRef.current) return;
      const focusable = [...weekSummaryDialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )];
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (!pendingCelebrationTitle && previousFocus && document.contains(previousFocus)) {
        window.requestAnimationFrame(() => previousFocus.focus());
      }
    };
  }, [dismissWeekSummary, lastWeekSummary, pendingCelebrationTitle]);

  useEffect(() => {
    if (!showEmptyDayWarning) return;
    emptyDayCancelRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeEmptyDayWarning();
        return;
      }
      if (e.key !== "Tab" || !emptyDayDialogRef.current) return;
      const focusable = [...emptyDayDialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [closeEmptyDayWarning, showEmptyDayWarning]);

  // Escape to deselect click-to-place activity
  useEffect(() => {
    if (!selectedActivity) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedActivity(null);
        setPlacementYouthId(null);
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
  const weeklyStrategy = normalizeWeeklyStrategyState(
    gameState.weeklyStrategy,
    currentWeek,
    currentSeason,
  );
  const seasonLength = getSeasonLength(gameState.fixtures, currentSeason);
  const activities = schedule.activities ?? [];
  const slotsUsed = activities.filter(Boolean).length;
  const maxSlots = 7;
  const severity = fatigueSeverity(scout.fatigue);

  const seasonPhase = getSeasonPhase(currentWeek, seasonLength);
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
  const availableActivities = getAvailableCalendarActivities();
  const engineActivities = availableActivities;
  const selectedPlacementYouth = placementYouthId
    ? Object.values(gameState.unsignedYouth).find(
        (youth) => youth.id === placementYouthId || youth.player.id === placementYouthId,
      )
    : undefined;
  const placementSourceReport = selectedPlacementYouth
    ? selectLatestReportsByCase(
        Object.values(gameState.reports).filter((report) =>
          report.playerId === selectedPlacementYouth.player.id
          && report.scoutId === gameState.scout.id
        ),
      ).sort((left, right) =>
        right.submittedSeason - left.submittedSeason
        || right.submittedWeek - left.submittedWeek
        || (right.revision ?? 1) - (left.revision ?? 1)
        || right.id.localeCompare(left.id)
      )[0]
    : undefined;
  const placementClubShortlist = selectedPlacementYouth
    ? getEligibleClubsForPlacement(
        selectedPlacementYouth,
        Object.values(gameState.clubs),
        gameState.scout,
        gameState.leagues,
        { preferredClubId: placementSourceReport?.intendedClubId },
      ).map((club) => {
        const league = gameState.leagues[club.leagueId];
        const countryKey = normalizeCountryKey(league?.country);
        const regionalKnowledge = countryKey
          ? gameState.regionalKnowledge[countryKey]
            ?? Object.values(gameState.regionalKnowledge).find(
              (knowledge) => normalizeCountryKey(knowledge.countryId) === countryKey,
            )
          : undefined;
        const developmentEnvironment = projectProspectiveDevelopmentEnvironment(
          gameState,
          selectedPlacementYouth.player,
          club.id,
        );
        const mobility = league
          ? assessYouthMobility({
              youth: selectedPlacementYouth,
              targetClub: club,
              targetLeague: league,
              targetRegionalKnowledge: regionalKnowledge,
              worldContext: getWorldConditionModifiers(gameState, league.country),
              developmentEnvironment,
            })
          : undefined;
        const relationship = Math.max(
          0,
          ...Object.values(gameState.contacts)
            .filter((contact) =>
              contact.organization === club.name
              || (countryKey && normalizeCountryKey(contact.country ?? contact.region) === countryKey),
            )
            .map((contact) => contact.relationship),
        );
        const squadCount = club.playerIds.length + (club.academyPlayerIds?.length ?? 0);
        const coverageTier = league?.coverageTier
          ?? (Object.values(gameState.fixtures).some((fixture) => fixture.leagueId === league?.id)
            ? "full"
            : "abstract");
        return {
          club,
          league,
          developmentEnvironment,
          mobility,
          relationship,
          squadCount,
          coverageTier,
        };
      })
    : [];

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
      <div
        data-testid="planner-scroll-region"
        className="relative h-[calc(100dvh_-_8.5rem_-_env(safe-area-inset-bottom))] overflow-y-auto overscroll-contain p-4 md:h-screen md:p-6"
      >
        <ScreenBackground src="/images/backgrounds/dashboard-office.png" opacity={0.85} />
        <div className="relative z-10">
        {/* Week Summary Overlay */}
        {lastWeekSummary && (
          <div
            ref={weekSummaryDialogRef}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="week-summary-title"
          >
            <Card className="w-full max-w-md max-h-[85vh] overflow-y-auto">
              <CardHeader className="pb-3">
                <CardTitle id="week-summary-title" className="text-sm">Week Summary</CardTitle>
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
                    <span className="text-zinc-500">Reputation</span>
                    <span
                      className={
                        lastWeekSummary.reputationChange > 0
                          ? "font-semibold text-emerald-400"
                          : lastWeekSummary.reputationChange < 0
                            ? "font-semibold text-red-400"
                            : "font-semibold text-zinc-300"
                      }
                    >
                      {lastWeekSummary.reputationChange > 0 ? "+" : ""}
                      {lastWeekSummary.reputationChange.toFixed(1)}
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
                <Button
                  ref={weekSummaryDismissRef}
                  className="w-full"
                  onClick={dismissWeekSummary}
                >
                  {pendingCelebrationTitle === "Career Promotion!"
                    ? "Continue to promotion"
                    : pendingCelebrationTitle
                      ? "Continue to milestone"
                      : "Close week summary"}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Header */}
        <div className="mb-4 flex flex-col gap-3 rounded-xl border border-white/10 bg-[#10151b]/92 p-4 shadow-xl shadow-black/20 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300">Weekly command</p>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Planner</h1>
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${SEASON_PHASE_CLASSES[seasonPhase]}`}
              >
                {t(`seasonPhases.${seasonPhase}`)}
              </span>
            </div>
            <p className="text-sm text-zinc-400">
              Week {currentWeek} — Season {currentSeason}
            </p>
            <p className="mt-1 max-w-2xl text-sm text-zinc-300">
              Spend seven finite days on the evidence, access, and recovery that matter most.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 font-semibold text-emerald-200">
                {slotsUsed}/7 days committed
              </span>
              <span className={`rounded-full border px-3 py-1.5 font-semibold ${
                severity === "danger"
                  ? "border-red-400/25 bg-red-400/10 text-red-200"
                  : severity === "warn"
                    ? "border-amber-400/25 bg-amber-400/10 text-amber-200"
                    : "border-sky-400/25 bg-sky-400/10 text-sky-200"
              }`}>
                {Math.round(scout.fatigue)}% fatigue
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-zinc-300">
                {maxSlots - slotsUsed} open day{maxSlots - slotsUsed === 1 ? "" : "s"}
              </span>
            </div>
          </div>
          <div className="w-full sm:w-auto">
            <div className="flex flex-wrap gap-2 sm:justify-end">
              {!IS_YOUTH_EARLY_ACCESS && (
                <Tooltip content="Auto-fill empty days with optimal activities based on your watchlist and priorities." side="bottom">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => autoSchedule()}
                    className="min-w-0 flex-1 gap-1.5 sm:flex-none"
                  >
                    <Wand2 size={14} />
                    Auto-Schedule
                  </Button>
                </Tooltip>
              )}
            </div>
            <Tooltip content="Process all scheduled activities and advance to the next week." side="bottom">
              <Button
                ref={advanceWeekButtonRef}
                onClick={() => {
                  const emptyCount = (gameState.schedule.activities ?? []).filter((a) => a === null).length;
                  if (emptyCount > 0) {
                    setShowEmptyDayWarning(true);
                  } else {
                    playSFX("calendar-slide");
                    requestWeekAdvance();
                  }
                }}
                variant={slotsUsed === maxSlots ? "default" : "outline"}
                className="mt-2 min-h-11 w-full sm:w-auto"
                data-tutorial-id="advance-week"
              >
                Advance Week
              </Button>
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
        {!IS_YOUTH_EARLY_ACCESS && transferWindowActive && currentWindow && (
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

        {/* The itinerary is the Planner's persistent attention budget. It stays
            available while the player compares opportunities below. */}
        <section
          id="planner-itinerary"
          data-tutorial-id="calendar-grid"
          aria-labelledby="itinerary-heading"
          className="sticky -top-4 z-20 -mx-2 mb-4 rounded-xl border border-emerald-400/20 bg-[#0c1217]/95 p-3 shadow-2xl shadow-black/40 backdrop-blur-xl sm:mx-0 md:top-0"
        >
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="itinerary-heading" className="text-sm font-semibold text-white">
                  Weekly itinerary
                </h2>
                <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
                  {slotsUsed}/7 days committed
                </span>
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                  severity === "danger"
                    ? "border-red-400/25 bg-red-400/10 text-red-200"
                    : severity === "warn"
                      ? "border-amber-400/25 bg-amber-400/10 text-amber-200"
                      : "border-sky-400/25 bg-sky-400/10 text-sky-200"
                }`}>
                  {Math.round(scout.fatigue)}% fatigue
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-300" aria-live="polite">
                {selectedActivity
                  ? `${ACTIVITY_DISPLAY[selectedActivity.type]?.label ?? "Selected activity"}: choose a highlighted start day.`
                  : `${maxSlots - slotsUsed} open day${maxSlots - slotsUsed === 1 ? "" : "s"}. Select one opportunity below to compare and place it.`}
              </p>
            </div>
            {selectedActivity && (
              <Button
                className="min-h-11 self-start sm:self-auto"
                variant="outline"
                onClick={() => {
                  setSelectedActivity(null);
                  setPlacementYouthId(null);
                  setHoverDay(null);
                }}
              >
                Clear selection
              </Button>
            )}
          </div>

          <div
            className="flex snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:thin] md:grid md:grid-cols-7 md:overflow-visible md:pb-0"
            tabIndex={0}
            role="region"
            aria-label="Weekly itinerary days. Use left and right arrow keys to scroll."
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              event.preventDefault();
              event.currentTarget.scrollBy({
                left: event.key === "ArrowLeft" ? -160 : 160,
                behavior: "smooth",
              });
            }}
          >
            {DAY_KEYS.map((dayKey, dayIndex) => {
              const activity = activities[dayIndex];
              const display = activity ? ACTIVITY_DISPLAY[activity.type] : null;
              const Icon = display?.icon;
              const canPlaceSelected = !!selectedActivity && canScheduleAt(selectedActivity, dayIndex);
              const isDropTarget = dragOverDay === dayIndex && !activity;

              return (
                <div
                  key={dayKey}
                  className={`relative min-h-[76px] min-w-[112px] snap-start rounded-lg border p-2 transition md:min-w-0 ${
                    activity
                      ? "border-emerald-400/25 bg-emerald-400/[0.06]"
                      : canPlaceSelected || isDropTarget
                        ? "border-blue-400/40 bg-blue-400/[0.08]"
                        : "border-white/10 bg-black/25"
                  }`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setDragOverDay(dayIndex);
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                      setDragOverDay(null);
                    }
                  }}
                  onDrop={(event) => handleDaySlotDrop(event, dayIndex)}
                  onMouseEnter={() => {
                    if (selectedActivity) setHoverDay(dayIndex);
                  }}
                  onMouseLeave={() => {
                    if (selectedActivity) setHoverDay(null);
                  }}
                >
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-400">
                    {t(`dayLabels.${dayKey}`)}
                  </p>
                  {activity && display && Icon ? (
                    <div className="mt-1 flex items-center gap-2 pr-11">
                      <Icon size={15} className={`shrink-0 ${display.color}`} aria-hidden="true" />
                      <span className={`line-clamp-2 text-xs font-semibold leading-4 ${display.color}`}>
                        {display.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => unscheduleActivity(dayIndex)}
                        className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-md text-zinc-400 transition hover:bg-red-500/10 hover:text-red-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
                        aria-label={`Remove ${display.label} from ${t(`dayLabels.${dayKey}`)}`}
                      >
                        <X size={15} aria-hidden="true" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleDaySlotClick(dayIndex)}
                      disabled={!canPlaceSelected}
                      aria-label={
                        selectedActivity
                          ? `Place ${ACTIVITY_DISPLAY[selectedActivity.type]?.label ?? "activity"} on ${DAY_KEYS[dayIndex]}`
                          : `${DAY_KEYS[dayIndex]} open day`
                      }
                      className={`mt-1 min-h-11 w-full rounded-md px-1 text-left text-xs transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 ${
                        canPlaceSelected
                          ? "font-semibold text-blue-100 hover:bg-blue-400/10"
                          : "cursor-default text-zinc-500"
                      }`}
                    >
                      {canPlaceSelected ? "Place here" : "Open day"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {(upcomingEvents.length > 0 || severity !== "ok") && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-white/8 pt-2 text-[11px]">
              {upcomingEvents[0] && (
                <span className="text-zinc-300">
                  Next event: <strong className="font-semibold text-white">{upcomingEvents[0].name}</strong> in W{upcomingEvents[0].startWeek}
                </span>
              )}
              {severity !== "ok" && (
                <span className={severity === "danger" ? "text-red-300" : "text-amber-300"}>
                  {severity === "danger" ? "Accuracy at risk; recovery is urgent." : "Moderate fatigue; protect room for recovery."}
                </span>
              )}
            </div>
          )}
        </section>

        <section data-tutorial-id="calendar-activities" aria-labelledby="planner-opportunity-heading">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="planner-opportunity-heading" className="text-base font-semibold text-white">
                Available opportunities
              </h2>
              <p className="text-sm leading-6 text-zinc-400">
                Compare live opportunities against fatigue, travel room, and your existing commitments before filling the week.
              </p>
            </div>
          </div>
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
            openDayCount={maxSlots - slotsUsed}
            onSelectActivity={(activity) => {
              setSelectedActivity(activity);
            }}
          />
        </section>

        <WeeklyStrategyPanel
          strategy={weeklyStrategy}
          onSelectIntent={setWeeklyIntent}
          onSelectPolicy={setDelegationPolicy}
        />

        {/* Week Preview Panel (F16) */}
        {(weekPreview.relevantMatches.length > 0 || weekPreview.suggestions.length > 0 || weekPreview.fatigueWarning) && (
          <div className="mb-4 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
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

        <details className="mb-4 rounded-xl border border-white/10 bg-[#11161c]/90">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400">
            Detailed schedule and week context
            <span className="text-xs font-normal text-zinc-400">Optional drill-down</span>
          </summary>
          <div className="border-t border-white/8 p-4">
        {/* Upcoming season events */}
        {upcomingEvents.length > 0 && (
          <div className="mb-4 rounded-xl border border-[#27272a] bg-[#141414] p-3">
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
        <div className="mb-4 rounded-xl border border-[#27272a] bg-[#141414] p-4">
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
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#11161c]/90 px-4 py-3">
          <span className="text-sm font-medium text-zinc-300">
            Slots used: {slotsUsed} / {maxSlots}
          </span>
          <div className="flex gap-1" role="img" aria-label={`${slotsUsed} of ${maxSlots} days committed`}>
            {Array.from({ length: maxSlots }).map((_, i) => (
              <div
                key={i}
                className={`h-2 w-6 rounded-sm ${i < slotsUsed ? "bg-emerald-500" : "bg-[#27272a]"}`}
              />
            ))}
          </div>
        </div>

        {/* Responsive itinerary: agenda on phones, dense week grid on larger screens. */}
        <section id="planner-itinerary-details" aria-labelledby="itinerary-details-heading">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="itinerary-details-heading" className="text-lg font-semibold text-white">Week itinerary details</h2>
              <p className="mt-1 text-sm text-zinc-400">
                {selectedActivity
                  ? `Choose an open day for ${ACTIVITY_DISPLAY[selectedActivity.type]?.label ?? "the selected activity"}.`
                  : "Select an opportunity below, then place it on an open day."}
              </p>
            </div>
            {selectedActivity && (
              <Button className="min-h-11 self-start" variant="outline" onClick={() => setSelectedActivity(null)}>
                Clear selection
              </Button>
            )}
          </div>

          <div className="space-y-2 md:hidden">
            {DAY_KEYS.map((dayKey, i) => {
              const activity = activities[i];
              const display = activity ? ACTIVITY_DISPLAY[activity.type] : null;
              const Icon = display?.icon;
              const canPlaceSelected = !!selectedActivity && canScheduleAt(selectedActivity, i);

              return (
                <div
                  key={dayKey}
                  className={`flex min-h-[76px] overflow-hidden rounded-xl border ${
                    activity
                      ? "border-emerald-400/25 bg-emerald-400/[0.06]"
                      : canPlaceSelected
                        ? "border-blue-400/35 bg-blue-400/[0.07]"
                        : "border-white/10 bg-[#11161c]/90"
                  }`}
                >
                  <div className="flex w-16 shrink-0 flex-col items-center justify-center border-r border-white/10 bg-black/20 px-2">
                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-200">{DAY_KEYS[i]}</span>
                    <span className="mt-1 text-[10px] text-zinc-500">Day {i + 1}</span>
                  </div>
                  {activity && display && Icon ? (
                    <div className="flex min-w-0 flex-1 items-center gap-3 p-3">
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/25 ${display.color}`}>
                        <Icon size={18} aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-semibold ${display.color}`}>{display.label}</p>
                        <p className="mt-1 line-clamp-2 text-xs leading-4 text-zinc-300">{activity.description}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => unscheduleActivity(i)}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-red-500/10 hover:text-red-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
                        aria-label={`Remove ${display.label} from ${t(`dayLabels.${dayKey}`)}`}
                      >
                        <X size={17} aria-hidden="true" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleDaySlotClick(i)}
                      disabled={!canPlaceSelected}
                      aria-label={
                        selectedActivity
                          ? `Place ${ACTIVITY_DISPLAY[selectedActivity.type]?.label ?? "activity"} on ${DAY_KEYS[i]}`
                          : `${DAY_KEYS[i]} open day`
                      }
                      className={`min-h-11 min-w-0 flex-1 px-4 py-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 ${
                        canPlaceSelected ? "text-blue-100 hover:bg-blue-400/10" : "cursor-default text-zinc-500"
                      }`}
                    >
                      <span className="block text-sm font-semibold">{canPlaceSelected ? "Place activity here" : "Open day"}</span>
                      <span className="mt-1 block text-xs">{canPlaceSelected ? "Tap to commit this opportunity." : "Recovers a small amount of fatigue."}</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="hidden grid-cols-7 gap-2 md:grid">
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
                  role={!activity ? "button" : undefined}
                  tabIndex={!activity ? 0 : undefined}
                  aria-label={!activity
                    ? selectedActivity
                      ? `Place ${ACTIVITY_DISPLAY[selectedActivity.type]?.label ?? "activity"} on ${DAY_KEYS[i]}`
                      : `${DAY_KEYS[i]} open day`
                    : undefined}
                  onClick={() => handleDaySlotClick(i)}
                  onKeyDown={(event) => {
                    if (!activity && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault();
                      handleDaySlotClick(i);
                    }
                  }}
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
                    <p className={`text-center text-xs mt-2 ${isAnchor || isDragAnchor ? "text-blue-400" : "text-zinc-400"}`}>
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
        </section>
          </div>
        </details>
        </div>
      </div>
      {/* Empty-day warning dialog */}
      {showEmptyDayWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div
            ref={emptyDayDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="empty-day-warning-title"
            aria-describedby="empty-day-warning-description"
            className="mx-4 w-full max-w-sm rounded-lg border border-amber-500/30 bg-zinc-900 p-6 shadow-xl"
          >
            <div className="mb-3 flex items-center gap-2 text-amber-400">
              <AlertTriangle size={18} aria-hidden="true" />
              <h3 id="empty-day-warning-title" className="text-lg font-semibold">Unplanned Days</h3>
            </div>
            <p id="empty-day-warning-description" className="mb-5 text-sm text-zinc-300">
              You have{" "}
              <span className="font-semibold text-amber-400">
                {(gameState.schedule.activities ?? []).filter((a) => a === null).length}
              </span>{" "}
              unplanned day(s). Empty days recover a small amount of fatigue but
              scheduled activities earn XP and progress. Advance anyway?
            </p>
            <div className="flex justify-end gap-3">
              <Button
                ref={emptyDayCancelRef}
                variant="outline"
                onClick={closeEmptyDayWarning}
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
      {/* Batch summary overlay */}
      {batchSummary && (
        <BatchSummary result={batchSummary} onDismiss={dismissBatchSummary} />
      )}
      {/* TargetPicker modal for click-to-place / drag-and-drop with targetPool activities */}
      {selectedActivity && selectedPendingDay != null && selectedActivity.targetPool && !placementYouthId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-4">
            <TargetPicker
              inline
              targets={selectedActivity.targetPool}
              mode={modalPickerMode}
              onSelect={(targetId) => {
                if (selectedActivity.type === "writePlacementReport") {
                  setPlacementYouthId(targetId);
                  return;
                }
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
                setPlacementYouthId(null);
              }}
            />
          </div>
        </div>
      )}
      {selectedActivity?.type === "writePlacementReport" &&
        selectedPendingDay != null &&
        placementYouthId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="placement-shortlist-heading"
              className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-[#2f3338] bg-[#0a0d10] p-4 shadow-2xl shadow-black/60 sm:p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">Placement shortlist</p>
                  <h2 id="placement-shortlist-heading" className="mt-1 text-lg font-bold text-white">Choose the academy and shape the pitch</h2>
                  <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-300">
                    Compare pathway, competition coverage, mobility risk, squad room, and your access. The club receives the filed report; this choice decides how you open the conversation and what support you ask it to guarantee.
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close placement shortlist"
                  onClick={() => {
                    setSelectedActivity(null);
                    setSelectedPendingDay(null);
                    setPlacementYouthId(null);
                  }}
                  className="rounded-lg p-2 text-zinc-400 transition hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300"
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-zinc-300">
                  Pitch posture
                  <select
                    value={placementPitchPosture}
                    onChange={(event) => setPlacementPitchPosture(event.target.value as PlacementPitchPosture)}
                    className="mt-1 min-h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white"
                  >
                    <option value="evidenceLed">Lead with evidence and uncertainty</option>
                    <option value="pathwayLed">Lead with role and pathway fit</option>
                    <option value="relationshipLed">Use trust to secure the hearing</option>
                  </select>
                </label>
                <label className="text-xs font-medium text-zinc-300">
                  Support condition
                  <select
                    value={placementSupportCondition}
                    onChange={(event) => setPlacementSupportCondition(event.target.value as PlacementSupportCondition)}
                    className="mt-1 min-h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white"
                  >
                    <option value="none">No extra condition</option>
                    <option value="educationPlan">Protect the education plan</option>
                    <option value="playingPathway">Require a credible playing pathway</option>
                    <option value="familySupport">Require family and settlement support</option>
                  </select>
                </label>
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                {placementClubShortlist.map((option) => (
                  <article key={option.club.id} className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-white">{option.club.name}</h3>
                        <p className="mt-0.5 text-[11px] text-zinc-400">
                          {option.league?.name ?? "Competition"} · {option.coverageTier === "full" ? "Full match coverage" : option.coverageTier === "abstract" ? "Results and player records" : "Contact coverage only"}
                        </p>
                      </div>
                      <Badge variant={option.mobility?.status === "blocked" ? "destructive" : option.mobility?.status === "conditional" ? "warning" : "outline"} className="text-[9px]">
                        {option.mobility ? `${option.mobility.riskBand} mobility risk` : "Route unclear"}
                      </Badge>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                      <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                        <dt className="text-zinc-500">Development pathway</dt>
                        <dd className="mt-1 font-medium text-zinc-100">{option.developmentEnvironment.headline}</dd>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                        <dt className="text-zinc-500">Squad room</dt>
                        <dd className="mt-1 font-medium text-zinc-100">{Math.max(0, 40 - option.squadCount)} places before capacity</dd>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                        <dt className="text-zinc-500">Academy</dt>
                        <dd className="mt-1 font-medium text-zinc-100">{option.club.youthAcademyRating}/20</dd>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                        <dt className="text-zinc-500">Your access</dt>
                        <dd className="mt-1 font-medium text-zinc-100">{option.relationship > 0 ? `Relationship ${option.relationship}/100` : "No established club contact"}</dd>
                      </div>
                    </dl>
                    {option.mobility?.visibleReasons[0] && (
                      <p className="mt-3 text-[11px] leading-5 text-zinc-400">{option.mobility.visibleReasons[0]}</p>
                    )}
                    <Button
                      className="mt-4 min-h-11 w-full"
                      disabled={option.mobility?.status === "blocked"}
                      onClick={() => {
                        handleSchedule(
                          {
                            ...selectedActivity,
                            targetId: placementYouthId,
                            destinationClubId: option.club.id,
                            placementPitchPosture,
                            placementSupportCondition,
                            targetPool: undefined,
                          },
                          selectedPendingDay,
                        );
                        setSelectedActivity(null);
                        setSelectedPendingDay(null);
                        setPlacementYouthId(null);
                        setHoverDay(null);
                      }}
                    >
                      {option.mobility?.status === "blocked" ? "Resolve route first" : `Pitch ${option.club.name}`}
                    </Button>
                  </article>
                ))}
              </div>
              {placementClubShortlist.length === 0 && (
                <p className="mt-5 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
                  No academy currently offers a credible route for this player. Build access, gather route information, or wait for a better brief.
                </p>
              )}
            </div>
          </div>
        )}
    </GameLayout>
  );
}
