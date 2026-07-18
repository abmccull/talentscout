"use client";

import { useMemo, useState } from "react";
import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScreenBackground } from "@/components/ui/screen-background";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import type { DayResult, GameState, ScoutSkill } from "@/engine/core/types";
import { INTERACTIVE_ACTIVITIES } from "@/engine/observation/types";
import { getInteractiveActivityCompletionKey } from "@/lib/activityCompletion";
import { resolvePlayerEntity } from "@/lib/playerResolution";
import { useAudio } from "@/lib/audio/useAudio";
import { DELEGATION_POLICIES } from "@/engine/core/weeklyStrategy";
import {
  WeekJourney,
  WeekJourneyBeat,
  WeekProgressMeter,
} from "./week-journey/WeekJourney";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const EMPTY_DAY_RESULTS: DayResult[] = [];

const ACTIVITY_LABELS: Record<string, string> = {
  attendMatch:            "Match Attendance",
  watchVideo:             "Video Analysis",
  writeReport:            "Report Writing",
  networkMeeting:         "Network Meeting",
  trainingVisit:          "Training Visit",
  study:                  "Study Session",
  rest:                   "Rest Day",
  academyVisit:           "Academy Visit",
  youthTournament:        "Youth Tournament",
  schoolMatch:            "School Match",
  grassrootsTournament:   "Grassroots Tournament",
  streetFootball:         "Street Football",
  academyTrialDay:        "Academy Trial Day",
  youthFestival:          "Youth Festival",
  followUpSession:        "Follow-Up Session",
  parentCoachMeeting:     "Parent/Coach Meeting",
  writePlacementReport:   "Placement Report",
  reserveMatch:           "Reserve Match",
  scoutingMission:        "Scouting Mission",
  oppositionAnalysis:     "Opposition Analysis",
  agentShowcase:          "Agent Showcase",
  trialMatch:             "Trial Match",
  contractNegotiation:    "Contract Negotiation",
  databaseQuery:          "Database Query",
  deepVideoAnalysis:      "Deep Video Analysis",
  statsBriefing:          "Stats Briefing",
  dataConference:         "Data Conference",
  algorithmCalibration:   "Algorithm Calibration",
  marketInefficiency:     "Market Inefficiency Scan",
  analyticsTeamMeeting:   "Analytics Team Meeting",
  travel:                 "Travel",
  internationalTravel:    "International Travel",
  agencyShowcase:         "Agency Showcase",
  freeAgentOutreach:      "Free Agent Outreach",
  loanMonitoring:         "Loan Monitoring",
  loanRecommendation:     "Loan Recommendation",
  reviewNPCReport:        "NPC Report Review",
  managerMeeting:         "Manager Meeting",
  boardPresentation:      "Board Presentation",
  assignTerritory:        "Territory Assignment",
};

// ---------------------------------------------------------------------------
// Activity → background image mapping
// ---------------------------------------------------------------------------

const FREE_DAY_BG = "/images/backgrounds/activities/free-day.png";

const ACTIVITY_BACKGROUNDS: Record<string, string> = {
  // Matches → stadium atmosphere
  attendMatch:            "/images/backgrounds/match-atmosphere.png",
  reserveMatch:           "/images/backgrounds/match-atmosphere.png",
  trialMatch:             "/images/backgrounds/match-atmosphere.png",
  // Youth scouting venues
  schoolMatch:            "/images/backgrounds/activities/school-match.png",
  grassrootsTournament:   "/images/backgrounds/activities/grassroots.png",
  streetFootball:         "/images/backgrounds/activities/street-football.png",
  youthFestival:          "/images/backgrounds/activities/youth-festival.png",
  youthTournament:        "/images/backgrounds/activities/youth-festival.png",
  // Academy
  academyVisit:           "/images/backgrounds/activities/academy.png",
  academyTrialDay:        "/images/backgrounds/activities/academy.png",
  followUpSession:        "/images/backgrounds/activities/academy.png",
  // Training
  trainingVisit:          "/images/backgrounds/activities/training.png",
  scoutingMission:        "/images/backgrounds/activities/training.png",
  // Video analysis
  watchVideo:             "/images/backgrounds/activities/video-room.png",
  deepVideoAnalysis:      "/images/backgrounds/activities/video-room.png",
  oppositionAnalysis:     "/images/backgrounds/activities/video-room.png",
  // Meetings
  networkMeeting:         "/images/backgrounds/activities/meeting.png",
  parentCoachMeeting:     "/images/backgrounds/activities/meeting.png",
  agentShowcase:          "/images/backgrounds/activities/meeting.png",
  contractNegotiation:    "/images/backgrounds/activities/meeting.png",
  // Data & analytics
  databaseQuery:          "/images/backgrounds/activities/data-room.png",
  statsBriefing:          "/images/backgrounds/activities/data-room.png",
  algorithmCalibration:   "/images/backgrounds/activities/data-room.png",
  marketInefficiency:     "/images/backgrounds/activities/data-room.png",
  analyticsTeamMeeting:   "/images/backgrounds/activities/data-room.png",
  // Conferences
  dataConference:         "/images/backgrounds/activities/conference.png",
  boardPresentation:      "/images/backgrounds/activities/conference.png",
  // Agency & management activities
  agencyShowcase:         "/images/backgrounds/activities/youth-festival.png",
  freeAgentOutreach:      "/images/backgrounds/activities/training.png",
  loanMonitoring:         "/images/backgrounds/activities/data-room.png",
  loanRecommendation:     "/images/backgrounds/activities/meeting.png",
  reviewNPCReport:        "/images/backgrounds/activities/rest.png",
  managerMeeting:         "/images/backgrounds/activities/meeting.png",
  assignTerritory:        "/images/backgrounds/activities/data-room.png",
  // Reports & study → existing desk
  writeReport:            "/images/backgrounds/reports-desk.png",
  writePlacementReport:   "/images/backgrounds/reports-desk.png",
  study:                  "/images/backgrounds/reports-desk.png",
  // Travel → existing international
  travel:                 "/images/backgrounds/international.png",
  internationalTravel:    "/images/backgrounds/international.png",
  // Rest
  rest:                   "/images/backgrounds/activities/rest.png",
};

const SKILL_SHORT_LABELS: Record<ScoutSkill, string> = {
  technicalEye:           "Tech Eye",
  physicalAssessment:     "Physical",
  psychologicalRead:      "Psych Read",
  tacticalUnderstanding:  "Tactical",
  dataLiteracy:           "Data Lit",
  playerJudgment:         "Judgment",
  potentialAssessment:    "Potential",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getActivityLabel(activityType: string | undefined): string {
  if (!activityType) return "Free Day";
  return ACTIVITY_LABELS[activityType] ?? activityType;
}

function formatFatigueChange(change: number): { text: string; className: string } {
  if (change === 0) return { text: "No fatigue change", className: "text-zinc-400" };
  if (change < 0) {
    return { text: `${change} fatigue (recovered)`, className: "text-emerald-400" };
  }
  if (change <= 5) {
    return { text: `+${change} fatigue`, className: "text-zinc-400" };
  }
  if (change <= 8) {
    return { text: `+${change} fatigue`, className: "text-amber-400" };
  }
  return { text: `+${change} fatigue`, className: "text-red-400" };
}

type SessionPlayerPoolEntry = {
  playerId: string;
  name: string;
  position: string;
};

function buildInteractivePlayerPool(
  dayResult: DayResult | undefined,
  gameState: GameState | null,
): SessionPlayerPoolEntry[] {
  if (!dayResult?.activity || !gameState) return [];

  const poolById = new Map<string, SessionPlayerPoolEntry>();
  const addPlayer = (
    playerId: string | undefined,
    name: string | undefined,
    position: string | undefined,
  ) => {
    if (!playerId || !name || !position) return;
    if (!poolById.has(playerId)) {
      poolById.set(playerId, { playerId, name, position });
    }
  };

  for (const obs of dayResult.observations) {
    addPlayer(obs.playerId, obs.playerName, obs.position ?? "UNK");
  }

  const targetId = dayResult.activity.targetId;
  if (targetId && dayResult.activity.type !== "attendMatch") {
    const resolved = resolvePlayerEntity(gameState, targetId);
    if (resolved) {
      addPlayer(
        resolved.player.id,
        `${resolved.player.firstName} ${resolved.player.lastName}`,
        resolved.player.position,
      );
    }
  }

  const focusedIds = dayResult.interaction?.focusedPlayerIds
    ?? (dayResult.interaction?.focusedPlayerId ? [dayResult.interaction.focusedPlayerId] : []);
  for (const focusedId of focusedIds) {
    const resolved = resolvePlayerEntity(gameState, focusedId);
    if (resolved) {
      addPlayer(
        resolved.player.id,
        `${resolved.player.firstName} ${resolved.player.lastName}`,
        resolved.player.position,
      );
    }
  }

  // Fallback for analysis/non-match activities: seed from known players
  if (poolById.size === 0) {
    const youthEntries = Object.values(gameState.unsignedYouth);
    if (youthEntries.length > 0) {
      for (const entry of youthEntries.slice(0, 12)) {
        const p = entry.player;
        addPlayer(p.id, `${p.firstName} ${p.lastName}`, p.position);
      }
    } else {
      for (const p of Object.values(gameState.players).slice(0, 12)) {
        addPlayer(p.id, `${p.firstName} ${p.lastName}`, p.position);
      }
    }
  }

  const obsCounts = new Map<string, number>();
  for (const obs of Object.values(gameState.observations)) {
    obsCounts.set(obs.playerId, (obsCounts.get(obs.playerId) ?? 0) + 1);
  }

  // Fallback: use previously observed players only (never random global pool).
  if (poolById.size === 0) {
    const fallbackIds = [...obsCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([id]) => id);
    for (const playerId of fallbackIds) {
      const resolved = resolvePlayerEntity(gameState, playerId);
      if (resolved) {
        addPlayer(
          resolved.player.id,
          `${resolved.player.firstName} ${resolved.player.lastName}`,
          resolved.player.position,
        );
      }
    }
  }

  return [...poolById.values()].slice(0, 16);
}

function resolveSessionTargetId(
  dayResult: DayResult | undefined,
  playerPool: SessionPlayerPoolEntry[],
): string | undefined {
  if (!dayResult?.activity || playerPool.length === 0) return undefined;
  const allowed = new Set(playerPool.map((p) => p.playerId));
  const selectedFocusIds = dayResult.interaction?.focusedPlayerIds ?? [];
  for (const focusId of selectedFocusIds) {
    if (allowed.has(focusId)) return focusId;
  }
  if (dayResult.interaction?.focusedPlayerId && allowed.has(dayResult.interaction.focusedPlayerId)) {
    return dayResult.interaction.focusedPlayerId;
  }
  if (dayResult.activity.targetId && allowed.has(dayResult.activity.targetId)) {
    return dayResult.activity.targetId;
  }
  if (dayResult.observations[0]?.playerId && allowed.has(dayResult.observations[0].playerId)) {
    return dayResult.observations[0].playerId;
  }
  return playerPool[0]?.playerId;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface TimelineDayProps {
  dayName: string;
  activityLabel: string;
  status: "past" | "current" | "future";
  dayIndex: number;
}

function TimelineDay({ dayName, activityLabel, status, dayIndex }: TimelineDayProps) {
  const shortDay = dayName.slice(0, 3);

  const containerClass =
    status === "current"
      ? "flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg border border-emerald-400/50 bg-emerald-400/12 px-1 py-2 shadow-[0_0_24px_rgba(52,211,153,0.08)] md:flex-row md:justify-start md:gap-3 md:px-3 md:py-2.5"
      : status === "past"
        ? "flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg border border-zinc-700/80 bg-zinc-900/90 px-1 py-2 md:flex-row md:justify-start md:gap-3 md:px-3 md:py-2.5"
        : "flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950/70 px-1 py-2 md:flex-row md:justify-start md:gap-3 md:px-3 md:py-2.5";

  const dayLabelClass =
    status === "current"
      ? "text-[11px] font-bold text-emerald-300 md:w-8 md:shrink-0 md:text-xs"
      : status === "past"
        ? "text-[11px] font-semibold text-zinc-300 md:w-8 md:shrink-0 md:text-xs"
        : "text-[11px] font-semibold text-zinc-400 md:w-8 md:shrink-0 md:text-xs";

  const activityClass =
    status === "current"
      ? "hidden min-w-0 truncate text-xs font-medium text-white md:block"
      : status === "past"
        ? "hidden min-w-0 truncate text-xs text-zinc-300 md:block"
        : "hidden min-w-0 truncate text-xs text-zinc-400 md:block";

  return (
    <li
      className={containerClass}
      aria-current={status === "current" ? "step" : undefined}
      aria-label={`${dayName}: ${activityLabel}. ${status === "past" ? "Completed" : status === "current" ? "Current day" : "Upcoming"}`}
    >
      {/* Day label */}
      <span className={dayLabelClass} aria-label={dayName}>
        {shortDay}
      </span>

      {/* Status indicator */}
      <span
        className="shrink-0 w-4 h-4 flex items-center justify-center"
        aria-hidden="true"
      >
        {status === "past" && (
          <span className="w-3 h-3 rounded-full bg-emerald-500 flex items-center justify-center">
            <svg
              width="8"
              height="8"
              viewBox="0 0 8 8"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M1.5 4L3 5.5L6.5 2"
                stroke="black"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        )}
        {status === "current" && (
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300 motion-safe:animate-pulse" />
        )}
        {status === "future" && (
          <span className="h-2.5 w-2.5 rounded-full border border-zinc-500 bg-zinc-800" />
        )}
      </span>

      {/* Activity label */}
      <span className={activityClass} title={activityLabel}>
        {activityLabel}
      </span>

      {/* Visually hidden index for screen readers */}
      <span className="sr-only">Day {dayIndex + 1} of 7</span>
    </li>
  );
}

interface DayCardProps {
  dayResult: DayResult;
  /** All day results for the week — used to gather observations from earlier days of the same event. */
  allDayResults: DayResult[];
  currentDay: number;
  onChooseInteraction?: (choiceId: string, focusedPlayerIds?: string[]) => void;
  canLaunchInteractiveSession?: boolean;
  interactiveSessionCompleted?: boolean;
  onLaunchInteractiveSession?: () => void;
}

function DayCard({
  dayResult,
  allDayResults,
  currentDay,
  onChooseInteraction,
  canLaunchInteractiveSession,
  interactiveSessionCompleted,
  onLaunchInteractiveSession,
}: DayCardProps) {
  const activityLabel = dayResult.activity
    ? getActivityLabel(dayResult.activity.type)
    : "Free Day";

  const xpEntries = Object.entries(dayResult.xpGained) as [ScoutSkill, number][];
  const fatigue = formatFatigueChange(dayResult.fatigueChange);
  const [isSelectingFocus, setIsSelectingFocus] = useState(false);
  const [pendingFocusIds, setPendingFocusIds] = useState<string[]>([]);

  const availableFocusCandidates = useMemo(() => {
    // Collect observations from all days of the SAME event (same instanceId).
    // A 3-day tournament lets you focus on anyone seen at that tournament so far.
    const byId = new Map<string, DayResult["observations"][number]>();
    const instanceId = dayResult.activity?.instanceId;

    for (let i = 0; i <= currentDay; i++) {
      const day = allDayResults[i];
      if (!day) continue;
      // Same event: matching instanceId, or same activity type on adjacent days if no instanceId
      const sameEvent = instanceId
        ? day.activity?.instanceId === instanceId
        : day.activity?.type === dayResult.activity?.type && day.activity?.type != null;
      if (!sameEvent) continue;
      for (const obs of day.observations) {
        if (!byId.has(obs.playerId)) byId.set(obs.playerId, obs);
      }
    }
    return [...byId.values()];
  }, [dayResult, allDayResults, currentDay]);

  const maxFocusPlayers = dayResult.interaction?.maxFocusPlayers ?? 3;
  const narrativeParts = dayResult.narrative
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
  const selectedInteraction = dayResult.interaction?.options.find(
    (option) => option.id === dayResult.interaction?.selectedOptionId,
  );
  const delegatedPolicy = DELEGATION_POLICIES.find(
    (policy) => policy.id === dayResult.interaction?.delegationPolicyId,
  );
  const hasRecordedOutcome =
    dayResult.playersDiscovered > 0
    || dayResult.observations.length > 0
    || dayResult.reportsWritten.length > 0
    || dayResult.profilesGenerated > 0
    || dayResult.anomaliesFound > 0
    || xpEntries.length > 0
    || dayResult.inboxMessages.length > 0
    || dayResult.fatigueChange !== 0;
  const isConsequenceResolved = !dayResult.interaction
    || Boolean(dayResult.interaction.selectedOptionId)
    || Boolean(interactiveSessionCompleted);

  const toggleFocusCandidate = (playerId: string) => {
    setPendingFocusIds((prev) => {
      if (prev.includes(playerId)) return prev.filter((id) => id !== playerId);
      if (prev.length >= maxFocusPlayers) return prev;
      return [...prev, playerId];
    });
  };

  return (
    <Card className="h-full min-w-0 overflow-hidden border-white/10 bg-zinc-900/88 shadow-2xl backdrop-blur-md">
      <CardHeader className="border-b border-white/10 bg-gradient-to-r from-white/[0.05] to-transparent pb-4">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">
              Today&apos;s scouting route
            </p>
            <CardTitle className="mt-1 text-2xl text-white">{dayResult.dayName}</CardTitle>
            <p className="mt-0.5 truncate text-sm text-zinc-300">{activityLabel}</p>
          </div>
          {dayResult.activity && (
            <Badge variant="outline" className="shrink-0 border-white/15 bg-black/20 text-xs text-zinc-200">
              {dayResult.activity.slots} slot{dayResult.activity.slots !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-3 sm:p-5">
        <WeekJourney label={`${dayResult.dayName} scouting journey`}>
          <WeekJourneyBeat step={1} eyebrow="Commitment" title="What you set out to do" tone="plan">
            <div className="grid min-w-0 gap-2 sm:grid-cols-2">
              <div className="min-w-0 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Activity</p>
                <p className="mt-1 truncate text-sm font-medium text-white">{activityLabel}</p>
              </div>
              <div className="min-w-0 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Attention cost</p>
                <p className="mt-1 text-sm font-medium text-white">
                  {dayResult.activity
                    ? `${dayResult.activity.slots} schedule slot${dayResult.activity.slots !== 1 ? "s" : ""}`
                    : "Protected recovery time"}
                </p>
              </div>
            </div>
          </WeekJourneyBeat>

          <WeekJourneyBeat step={2} eyebrow="Context" title="What unfolded" tone="context">
            <div className="space-y-4">
              <div className="space-y-2">
                {narrativeParts.length > 0 ? (
                  narrativeParts.map((part, index) => (
                    <p
                      key={`${part.slice(0, 24)}-${index}`}
                      className={index === narrativeParts.length - 1 && selectedInteraction
                        ? "rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-sm leading-relaxed text-amber-100"
                        : "text-sm leading-relaxed text-zinc-300"}
                    >
                      {part}
                    </p>
                  ))
                ) : (
                  <p className="text-sm italic text-zinc-400">No activity was scheduled for this day.</p>
                )}
              </div>

              {dayResult.interaction && (
                <section aria-labelledby={`decision-${dayResult.dayIndex}`}>
                  <h4 id={`decision-${dayResult.dayIndex}`} className="text-xs font-semibold uppercase tracking-[0.14em] text-white">
                    Your call
                  </h4>
                  <p className="mb-3 mt-1 text-sm text-zinc-300">{dayResult.interaction.prompt}</p>
                  {dayResult.interaction.selectedOptionId ? (
                    <div className="rounded-lg border border-emerald-400/25 bg-emerald-400/[0.07] px-3 py-2.5" role="status">
                      <p className="text-xs font-semibold text-emerald-200">
                        Approach locked: {selectedInteraction?.label ?? dayResult.interaction.selectedOptionId}
                      </p>
                      {dayResult.interaction.resolutionMode === "delegated" && (
                        <p className="mt-1 text-xs font-medium text-amber-200">
                          Delegated by standing order: {delegatedPolicy?.label ?? "Desk instructions"}
                        </p>
                      )}
                      {selectedInteraction?.description && (
                        <p className="mt-1 text-xs leading-relaxed text-zinc-300">{selectedInteraction.description}</p>
                      )}
                      {dayResult.interaction.selectedOptionId === "focus" && (
                        <p className="mt-1 text-xs text-zinc-300">
                          Focus targets: {Math.max(
                            dayResult.interaction.focusedPlayerIds?.length ?? 0,
                            dayResult.interaction.focusedPlayerId ? 1 : 0,
                          )}
                        </p>
                      )}
                    </div>
                  ) : isSelectingFocus ? (
                    <div className="space-y-3 rounded-lg border border-amber-400/25 bg-zinc-950/75 p-3">
                      <p className="text-xs leading-relaxed text-zinc-300">
                        Pick 1-{maxFocusPlayers} players. Fewer targets means deeper scouting reads.
                      </p>
                      {availableFocusCandidates.length > 0 ? (
                        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                          {availableFocusCandidates.map((candidate) => {
                            const active = pendingFocusIds.includes(candidate.playerId);
                            return (
                              <button
                                key={candidate.playerId}
                                type="button"
                                aria-pressed={active}
                                className={`min-h-11 w-full rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 ${
                                  active
                                    ? "border-amber-400/60 bg-amber-400/10"
                                    : "border-zinc-700 bg-zinc-900 hover:border-zinc-500"
                                }`}
                                onClick={() => toggleFocusCandidate(candidate.playerId)}
                              >
                                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                                  <span className="min-w-0 break-words text-xs font-medium text-white">{candidate.playerName}</span>
                                  {(candidate.age || candidate.position) && (
                                    <span className="text-[10px] text-zinc-300">
                                      {candidate.position}{candidate.age ? `, ${candidate.age}` : ""}
                                    </span>
                                  )}
                                </div>
                                <p className="mt-0.5 break-words text-[11px] text-zinc-300">{candidate.topAttributes}</p>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-zinc-300">
                          No clear candidate yet. Confirm focus to lock onto your best available lead.
                        </p>
                      )}
                      <div className="grid grid-cols-1 gap-2 sm:flex">
                        <Button
                          size="sm"
                          className="min-h-11 bg-amber-600 text-white hover:bg-amber-700"
                          onClick={() => onChooseInteraction?.("focus", pendingFocusIds)}
                          disabled={availableFocusCandidates.length > 0 && pendingFocusIds.length === 0}
                        >
                          Confirm Focus
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="min-h-11"
                          onClick={() => {
                            setIsSelectingFocus(false);
                            setPendingFocusIds([]);
                          }}
                        >
                          Back
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        {dayResult.interaction.options.map((option) => (
                          <Button
                            key={option.id}
                            variant="outline"
                            size="sm"
                            className="h-auto min-h-12 min-w-0 justify-start whitespace-normal border-zinc-700 bg-zinc-950/45 px-3 py-2.5 text-left hover:border-amber-400/40 hover:bg-amber-400/[0.06]"
                            onClick={() => {
                              if (option.id === "focus") {
                                if (availableFocusCandidates.length > 0) {
                                  setIsSelectingFocus(true);
                                  setPendingFocusIds((prev) =>
                                    prev.length > 0 ? prev : [availableFocusCandidates[0].playerId],
                                  );
                                  return;
                                }
                                onChooseInteraction?.("focus");
                                return;
                              }
                              onChooseInteraction?.(option.id);
                            }}
                          >
                            <span className="min-w-0">
                              <span className="block text-xs font-semibold text-white">{option.label}</span>
                              <span className="mt-0.5 block text-[11px] leading-snug text-zinc-300">{option.description}</span>
                            </span>
                          </Button>
                        ))}
                      </div>
                      <p className="text-xs text-amber-200" role="status">
                        Choose an approach to continue. Skip to Results follows your standing instructions and locks in the tradeoff.
                      </p>
                    </div>
                  )}
                </section>
              )}

              {(canLaunchInteractiveSession || interactiveSessionCompleted) && (
                <section className="rounded-lg border border-blue-400/20 bg-blue-400/[0.05] p-3" aria-label="Live observation session">
                  <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-200">Live observation</h4>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-300">
                    Step into the session for deeper reads, extra insight points, and stronger activity outcomes.
                  </p>
                  {interactiveSessionCompleted ? (
                    <Badge variant="outline" className="mt-2 border-emerald-500/30 text-emerald-300">
                      Session completed
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      className="mt-3 min-h-11 bg-blue-600 text-white hover:bg-blue-700"
                      onClick={onLaunchInteractiveSession}
                      disabled={!canLaunchInteractiveSession}
                    >
                      Launch Live Session
                    </Button>
                  )}
                </section>
              )}
            </div>
          </WeekJourneyBeat>

          <WeekJourneyBeat
            step={3}
            eyebrow="Consequence"
            title={isConsequenceResolved ? "What changed" : "Outcome waiting on your call"}
            tone="outcome"
          >
            {isConsequenceResolved ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-5" role="group" aria-label="Day outcome summary">
                  {dayResult.playersDiscovered > 0 && (
                    <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.07] px-3 py-2">
                      <p className="text-lg font-bold text-emerald-300">{dayResult.playersDiscovered}</p>
                      <p className="text-[11px] text-zinc-300">Discovered</p>
                    </div>
                  )}
                  {dayResult.observations.length > 0 && (
                    <div className="rounded-lg border border-blue-500/25 bg-blue-500/[0.07] px-3 py-2">
                      <p className="text-lg font-bold text-blue-300">{dayResult.observations.length}</p>
                      <p className="text-[11px] text-zinc-300">Observations</p>
                    </div>
                  )}
                  {dayResult.reportsWritten.length > 0 && (
                    <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2">
                      <p className="text-lg font-bold text-amber-300">{dayResult.reportsWritten.length}</p>
                      <p className="text-[11px] text-zinc-300">Reports</p>
                    </div>
                  )}
                  {dayResult.profilesGenerated > 0 && (
                    <div className="rounded-lg border border-cyan-500/25 bg-cyan-500/[0.07] px-3 py-2">
                      <p className="text-lg font-bold text-cyan-300">{dayResult.profilesGenerated}</p>
                      <p className="text-[11px] text-zinc-300">Profiles</p>
                    </div>
                  )}
                  {dayResult.anomaliesFound > 0 && (
                    <div className="rounded-lg border border-purple-500/25 bg-purple-500/[0.07] px-3 py-2">
                      <p className="text-lg font-bold text-purple-300">{dayResult.anomaliesFound}</p>
                      <p className="text-[11px] text-zinc-300">Anomalies</p>
                    </div>
                  )}
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                    <p className={`text-sm font-semibold ${fatigue.className}`}>{fatigue.text}</p>
                    <p className="text-[11px] text-zinc-300">Fatigue</p>
                  </div>
                </div>

                {!hasRecordedOutcome && (
                  <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-300">
                    Nothing shifted immediately. That protected time still keeps you fresh for later commitments.
                  </p>
                )}

              {xpEntries.length > 0 && (
                <section aria-label="Skill XP gained">
                  <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-300">Skill growth</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {xpEntries.map(([skill, xp]) => (
                      <span key={skill} className="inline-flex items-center rounded-md border border-blue-400/20 bg-blue-400/[0.08] px-2 py-1 text-xs font-medium text-blue-300">
                        {SKILL_SHORT_LABELS[skill] ?? skill} +{xp}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {dayResult.inboxMessages.length > 0 && (
                <section aria-label="Messages received">
                  <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-300">New messages</h4>
                  <div className="space-y-2">
                    {dayResult.inboxMessages.map((msg) => (
                      <div key={msg.id} className="min-w-0 rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2.5">
                        <p className="break-words text-xs font-medium text-white">{msg.title}</p>
                        <p className="mt-1 line-clamp-2 break-words text-xs leading-relaxed text-zinc-300">{msg.body}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {dayResult.observations.length > 0 && (
                <section aria-label="Players observed">
                  <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-300">Evidence gathered</h4>
                  <div className="space-y-2">
                    {dayResult.observations.map((obs) => (
                      <div key={obs.playerId} className="grid min-w-0 gap-1 rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2.5 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] sm:items-center sm:gap-3">
                        <span className="min-w-0 break-words text-xs font-medium text-white">{obs.playerName}</span>
                        <span className="min-w-0 break-words text-xs text-zinc-300 sm:text-right">{obs.topAttributes}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              </div>
            ) : (
              <div
                className="rounded-lg border border-dashed border-amber-400/35 bg-amber-400/[0.05] px-4 py-4"
                data-testid="unresolved-day-consequence"
              >
                <p className="text-sm font-medium text-amber-100">
                  This day&apos;s consequences are still unresolved.
                </p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-300">
                  {canLaunchInteractiveSession
                    ? "Choose your approach or complete the live observation before the evidence, fatigue, and skill growth are revealed."
                    : "Choose your approach before the evidence, fatigue, and skill growth are revealed."}
                </p>
              </div>
            )}
          </WeekJourneyBeat>
        </WeekJourney>
      </CardContent>
    </Card>
  );
}

function FreeDayCard({ dayName }: { dayName: string }) {
  return (
    <Card className="h-full bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-xl">{dayName}</CardTitle>
        <p className="mt-0.5 text-sm text-zinc-400">Free Day</p>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-zinc-400">No activity scheduled for this day.</p>
        <p className="mt-2 text-xs text-zinc-600">
          Use free days to recover fatigue naturally.
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export function WeekSimulationScreen() {
  const weekSimulation = useGameStore((s) => s.weekSimulation);
  const gameState = useGameStore((s) => s.gameState);
  const advanceDay = useGameStore((s) => s.advanceDay);
  const chooseSimulationInteraction = useGameStore((s) => s.chooseSimulationInteraction);
  const fastForwardWeek = useGameStore((s) => s.fastForwardWeek);
  const isAdvancingWeek = useGameStore((s) => s.isAdvancingWeek);
  const weeklyTransactionError = useGameStore((s) => s.weeklyTransactionError);
  const startObservationSession = useGameStore((s) => s.startObservationSession);
  const setScreen = useGameStore((s) => s.setScreen);
  const { playSFX } = useAudio();
  const prefersReducedMotion = useReducedMotion();

  // All hooks must be called before any early return
  const currentDay = weekSimulation?.currentDay ?? 0;
  const dayResults = weekSimulation?.dayResults ?? EMPTY_DAY_RESULTS;

  const currentDayResult: DayResult | undefined = dayResults[currentDay];
  const isLastDay = currentDay >= dayResults.length - 1;
  const isComplete = currentDay >= 7;
  const interactivePlayerPool = useMemo(
    () => buildInteractivePlayerPool(currentDayResult, gameState),
    [currentDayResult, gameState],
  );
  const interactiveActivitySupported = !!currentDayResult?.activity
    && currentDayResult.activity.type !== "attendMatch"
    && INTERACTIVE_ACTIVITIES.has(currentDayResult.activity.type);
  const currentActivityInstanceKey = currentDayResult?.activity
    ? getInteractiveActivityCompletionKey(currentDayResult.activity, currentDayResult.dayIndex)
    : undefined;
  const completedInteractiveSet = useMemo(
    () => new Set(gameState?.completedInteractiveSessions ?? []),
    [gameState?.completedInteractiveSessions],
  );
  const interactiveSessionCompleted = !!currentActivityInstanceKey
    && completedInteractiveSet.has(currentActivityInstanceKey);
  const canLaunchInteractiveSession = interactiveActivitySupported
    && interactivePlayerPool.length > 0
    && !interactiveSessionCompleted;
  // If the interactive session is already completed, the decision is optional
  const interactionPending = !!currentDayResult?.interaction
    && !currentDayResult.interaction.selectedOptionId
    && !interactiveSessionCompleted;
  const journeyStatus = weeklyTransactionError
    ? `The week could not be completed. ${weeklyTransactionError}`
    : isAdvancingWeek
    ? "The football world is being simulated. Your completed week is committing now."
    : isComplete
    ? "Week complete. All seven days have resolved."
    : interactionPending
      ? `Viewing ${currentDayResult?.dayName ?? DAY_NAMES[currentDay]}, day ${currentDay + 1} of 7. Decision required before consequences are revealed.`
      : `Viewing ${currentDayResult?.dayName ?? DAY_NAMES[currentDay]}, day ${currentDay + 1} of 7. Consequences revealed.`;

  const launchInteractiveSession = () => {
    if (!currentDayResult?.activity || !canLaunchInteractiveSession) return;
    playSFX("click");
    const targetPlayerId = resolveSessionTargetId(currentDayResult, interactivePlayerPool);
    startObservationSession(
      currentDayResult.activity.type,
      interactivePlayerPool,
      targetPlayerId,
      {
        activityInstanceId: getInteractiveActivityCompletionKey(
          currentDayResult.activity,
          currentDayResult.dayIndex,
        ),
        returnScreen: "weekSimulation",
        contactId: currentDayResult.activity.targetId
          && gameState?.contacts[currentDayResult.activity.targetId]
            ? currentDayResult.activity.targetId
            : undefined,
      },
    );
  };

  const chooseInteractionWithFeedback = (choiceId: string, focusedPlayerIds?: string[]) => {
    playSFX("click");
    chooseSimulationInteraction(choiceId, focusedPlayerIds);
  };

  const advanceDayWithFeedback = () => {
    playSFX("calendar-slide");
    advanceDay();
  };

  const fastForwardWithFeedback = () => {
    playSFX("page-turn");
    fastForwardWeek();
  };

  const currentBg = currentDayResult?.activity?.type
    ? ACTIVITY_BACKGROUNDS[currentDayResult.activity.type] ?? FREE_DAY_BG
    : FREE_DAY_BG;

  if (!weekSimulation) return null;

  return (
    <GameLayout>
      <div
        data-testid="week-journey-screen"
        data-reduced-motion={prefersReducedMotion ? "true" : "false"}
        className="relative min-h-[calc(100dvh-7.5rem)] min-w-0 overflow-x-hidden bg-zinc-950 px-4 py-5 sm:p-6 md:h-screen md:min-h-0 md:overflow-hidden"
      >
        <ScreenBackground src={currentBg} opacity={0.78} />
        <div className="relative z-10 mx-auto flex min-h-0 w-full max-w-7xl flex-col md:h-full">
          <header className="mb-4 flex shrink-0 flex-col gap-3 rounded-xl border border-white/10 bg-black/25 p-4 backdrop-blur-sm sm:flex-row sm:items-end sm:justify-between sm:gap-6">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300">The week unfolds</p>
              <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">Week in Progress</h1>
              <p className="mt-1 text-sm text-zinc-300">Commit, read the context, then live with the outcome.</p>
            </div>
            <WeekProgressMeter currentDay={currentDay} isComplete={isComplete} />
          </header>

          <p
            className="sr-only"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            data-testid="week-journey-status"
          >
            {journeyStatus}
          </p>

          <div className="grid min-w-0 flex-1 grid-cols-1 gap-4 md:min-h-0 md:grid-cols-[13.5rem_minmax(0,1fr)] md:gap-6">
            <aside className="min-w-0" aria-label="Weekly timeline" data-testid="week-timeline">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-300">Seven-day route</p>
              <ol className="grid min-w-0 grid-cols-7 gap-1 md:block md:space-y-1.5" aria-label="Day-by-day progress">
                {DAY_NAMES.map((dayName, i) => {
                  const dayResult = dayResults[i];
                  const activityLabel = dayResult
                    ? getActivityLabel(dayResult.activity?.type)
                    : "Free Day";

                  let status: "past" | "current" | "future";
                  if (isComplete || i < currentDay) {
                    status = "past";
                  } else if (i === currentDay) {
                    status = "current";
                  } else {
                    status = "future";
                  }

                  return (
                    <TimelineDay
                      key={dayName}
                      dayName={dayName}
                      activityLabel={activityLabel}
                      status={status}
                      dayIndex={i}
                    />
                  );
                })}
              </ol>
            </aside>

            <section
              className="min-w-0 overflow-visible md:overflow-y-auto md:pr-1"
              aria-labelledby="current-day-journey-heading"
              data-testid="current-day-journey"
            >
              <h2 id="current-day-journey-heading" className="sr-only">Current day details</h2>
              <AnimatePresence mode="wait" initial={false}>
                {weeklyTransactionError ? (
                  <Card className="flex min-h-64 flex-col items-center justify-center border-red-400/30 bg-zinc-900/90 p-8 text-center shadow-2xl">
                    <p className="text-xl font-bold text-white">The week could not be completed</p>
                    <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-300">
                      Your pre-week state is still intact. Retry when you are ready.
                    </p>
                  </Card>
                ) : isAdvancingWeek ? (
                  <Card className="flex min-h-64 flex-col items-center justify-center border-emerald-400/20 bg-zinc-900/90 p-8 text-center shadow-2xl">
                    <div
                      className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-300 border-r-transparent motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                    <p className="mt-5 text-xl font-bold text-white">Simulating the football world</p>
                    <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-300">
                      Resolving matches, careers, relationships, finances, and the consequences of your choices.
                    </p>
                  </Card>
                ) : isComplete ? (
                  <motion.div
                    key="complete"
                    initial={prefersReducedMotion ? false : { opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={prefersReducedMotion ? undefined : { opacity: 0, x: -16 }}
                    transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
                  >
                    <Card className="flex flex-col items-center justify-center border-emerald-400/20 bg-zinc-900/90 p-8 text-center shadow-2xl sm:p-10">
                      <p className="text-xl font-bold text-white">Week Complete</p>
                      <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-300">
                        All seven commitments have resolved. Review the new world state and decide what deserves your attention next.
                      </p>
                    </Card>
                  </motion.div>
                ) : (
                  <motion.div
                    key={currentDay}
                    initial={prefersReducedMotion ? false : { opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={prefersReducedMotion ? undefined : { opacity: 0, x: -16 }}
                    transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
                    className="min-w-0"
                  >
                    {currentDayResult ? (
                      <DayCard
                        dayResult={currentDayResult}
                        allDayResults={dayResults}
                        currentDay={currentDay}
                        onChooseInteraction={chooseInteractionWithFeedback}
                        canLaunchInteractiveSession={canLaunchInteractiveSession}
                        interactiveSessionCompleted={interactiveSessionCompleted}
                        onLaunchInteractiveSession={launchInteractiveSession}
                      />
                    ) : (
                      <FreeDayCard dayName={DAY_NAMES[currentDay] ?? "Day"} />
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          </div>

          <footer className="mt-4 flex shrink-0 flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:items-center">
              {isComplete ? (
                <Button
                  size="lg"
                  className="min-h-11 w-full bg-emerald-700 text-white hover:bg-emerald-800 sm:w-auto"
                  onClick={weeklyTransactionError ? fastForwardWithFeedback : () => setScreen("calendar")}
                  disabled={isAdvancingWeek}
                >
                  {weeklyTransactionError ? "Retry Week" : "View Calendar"}
                </Button>
              ) : isLastDay ? (
                <Button
                  size="lg"
                  className="min-h-11 w-full bg-emerald-700 text-white hover:bg-emerald-800 sm:w-auto"
                  onClick={advanceDayWithFeedback}
                  aria-label="Complete the week and process results"
                  disabled={interactionPending || isAdvancingWeek}
                >
                  {isAdvancingWeek ? "Simulating…" : "Complete Week"}
                </Button>
              ) : (
                <>
                  <Button
                    size="lg"
                    className="min-h-11 w-full bg-emerald-700 text-white hover:bg-emerald-800 sm:w-auto"
                    onClick={advanceDayWithFeedback}
                    aria-label="Advance to next day"
                    disabled={interactionPending || isAdvancingWeek}
                  >
                    Next Day
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="min-h-11 w-full border-zinc-600 bg-black/25 sm:w-auto"
                    onClick={fastForwardWithFeedback}
                    aria-label="Skip remaining days and complete the week"
                    disabled={isAdvancingWeek}
                  >
                    Skip to Results
                  </Button>
                </>
              )}
            </div>
            {!isComplete && (
              <p className="text-xs leading-relaxed text-zinc-300 sm:max-w-xs sm:text-right">
                {interactionPending
                  ? "Your current decision must be resolved before moving one day at a time."
                  : "The next day preserves every result and consequence already revealed."}
              </p>
            )}
          </footer>
        </div>
      </div>
    </GameLayout>
  );
}
