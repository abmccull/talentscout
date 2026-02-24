"use client";

import { useMemo, useState } from "react";
import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScreenBackground } from "@/components/ui/screen-background";
import { motion, AnimatePresence } from "framer-motion";
import type { DayResult, ScoutSkill } from "@/engine/core/types";

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
      ? "flex items-center gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5"
      : status === "past"
        ? "flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5"
        : "flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 opacity-50";

  const dayLabelClass =
    status === "current"
      ? "text-xs font-bold text-emerald-400 w-8 shrink-0"
      : status === "past"
        ? "text-xs font-semibold text-zinc-400 w-8 shrink-0"
        : "text-xs font-semibold text-zinc-600 w-8 shrink-0";

  const activityClass =
    status === "current"
      ? "text-xs text-white font-medium truncate"
      : status === "past"
        ? "text-xs text-zinc-400 truncate"
        : "text-xs text-zinc-600 truncate";

  return (
    <div className={containerClass} aria-current={status === "current" ? "step" : undefined}>
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
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
        )}
        {status === "future" && (
          <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
        )}
      </span>

      {/* Activity label */}
      <span className={activityClass} title={activityLabel}>
        {activityLabel}
      </span>

      {/* Visually hidden index for screen readers */}
      <span className="sr-only">Day {dayIndex + 1} of 7</span>
    </div>
  );
}

interface DayCardProps {
  dayResult: DayResult;
  focusCandidates?: DayResult["observations"];
  onChooseInteraction?: (choiceId: string, focusedPlayerIds?: string[]) => void;
}

function DayCard({ dayResult, focusCandidates = [], onChooseInteraction }: DayCardProps) {
  const activityLabel = dayResult.activity
    ? getActivityLabel(dayResult.activity.type)
    : "Free Day";

  const xpEntries = Object.entries(dayResult.xpGained) as [ScoutSkill, number][];
  const fatigue = formatFatigueChange(dayResult.fatigueChange);
  const [isSelectingFocus, setIsSelectingFocus] = useState(false);
  const [pendingFocusIds, setPendingFocusIds] = useState<string[]>([]);

  const availableFocusCandidates = useMemo(() => {
    const byId = new Map<string, DayResult["observations"][number]>();
    for (const obs of focusCandidates.length > 0 ? focusCandidates : dayResult.observations) {
      if (!byId.has(obs.playerId)) {
        byId.set(obs.playerId, obs);
      }
    }
    return [...byId.values()].slice(0, 8);
  }, [dayResult.observations, focusCandidates]);

  const maxFocusPlayers = dayResult.interaction?.maxFocusPlayers ?? 3;

  const toggleFocusCandidate = (playerId: string) => {
    setPendingFocusIds((prev) => {
      if (prev.includes(playerId)) return prev.filter((id) => id !== playerId);
      if (prev.length >= maxFocusPlayers) return prev;
      return [...prev, playerId];
    });
  };

  return (
    <Card className="h-full bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-xl">{dayResult.dayName}</CardTitle>
            <p className="mt-0.5 text-sm text-zinc-400">{activityLabel}</p>
          </div>
          {dayResult.activity && (
            <Badge variant="outline" className="shrink-0 text-xs">
              {dayResult.activity.slots} slot{dayResult.activity.slots !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Narrative */}
        {dayResult.narrative ? (
          <p className="text-sm leading-relaxed text-zinc-300">{dayResult.narrative}</p>
        ) : (
          <p className="text-sm text-zinc-500 italic">No activity scheduled for this day.</p>
        )}

        {/* Stats row */}
        {dayResult.activity && (
          <div className="flex flex-wrap gap-2">
            {dayResult.playersDiscovered > 0 && (
              <span className="inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400">
                {dayResult.playersDiscovered} player{dayResult.playersDiscovered !== 1 ? "s" : ""} discovered
              </span>
            )}
            {dayResult.observations.length > 0 && (
              <span className="inline-flex items-center rounded-md border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-400">
                {dayResult.observations.length} observation{dayResult.observations.length !== 1 ? "s" : ""}
              </span>
            )}
            {dayResult.reportsWritten.length > 0 && (
              <span className="inline-flex items-center rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-400">
                {dayResult.reportsWritten.length} report{dayResult.reportsWritten.length !== 1 ? "s" : ""} written
              </span>
            )}
            {dayResult.profilesGenerated > 0 && (
              <span className="inline-flex items-center rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-xs font-medium text-cyan-400">
                {dayResult.profilesGenerated} profile{dayResult.profilesGenerated !== 1 ? "s" : ""} generated
              </span>
            )}
            {dayResult.anomaliesFound > 0 && (
              <span className="inline-flex items-center rounded-md border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-xs font-medium text-purple-400">
                {dayResult.anomaliesFound} anomal{dayResult.anomaliesFound !== 1 ? "ies" : "y"} flagged
              </span>
            )}
          </div>
        )}

        {/* XP gained */}
        {xpEntries.length > 0 && (
          <section aria-label="Skill XP gained">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Skill XP Gained
            </p>
            <div className="flex flex-wrap gap-1.5">
              {xpEntries.map(([skill, xp]) => (
                <span
                  key={skill}
                  className="inline-flex items-center rounded bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400"
                >
                  {SKILL_SHORT_LABELS[skill] ?? skill} +{xp}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Interactive choice */}
        {dayResult.interaction && (
          <section aria-label="Day interaction choice">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Decision
            </p>
            <p className="mb-2 text-xs text-zinc-400">{dayResult.interaction.prompt}</p>
            {dayResult.interaction.selectedOptionId ? (
              <div className="space-y-2">
                <Badge variant="outline" className="text-[11px]">
                  Selected: {
                    dayResult.interaction.options.find(
                      (opt) => opt.id === dayResult.interaction?.selectedOptionId,
                    )?.label ?? dayResult.interaction.selectedOptionId
                  }
                </Badge>
                {dayResult.interaction.selectedOptionId === "focus" && (
                  <p className="text-[11px] text-zinc-400">
                    Focus targets: {Math.max(
                      dayResult.interaction.focusedPlayerIds?.length ?? 0,
                      dayResult.interaction.focusedPlayerId ? 1 : 0,
                    )}
                  </p>
                )}
              </div>
            ) : (
              isSelectingFocus ? (
                <div className="space-y-3 rounded-md border border-zinc-800 bg-zinc-950/60 p-3">
                  <p className="text-[11px] text-zinc-400">
                    Pick 1-{maxFocusPlayers} players. Fewer targets means deeper scouting reads.
                  </p>
                  {availableFocusCandidates.length > 0 ? (
                    <div className="space-y-2">
                      {availableFocusCandidates.map((candidate) => {
                        const active = pendingFocusIds.includes(candidate.playerId);
                        return (
                          <button
                            key={candidate.playerId}
                            type="button"
                            className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                              active
                                ? "border-amber-400/60 bg-amber-400/10"
                                : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
                            }`}
                            onClick={() => toggleFocusCandidate(candidate.playerId)}
                          >
                            <p className="text-xs font-medium text-white">{candidate.playerName}</p>
                            <p className="text-[11px] text-zinc-400">{candidate.topAttributes}</p>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[11px] text-zinc-500">
                      No clear candidate yet. Confirm focus to lock onto your best available lead.
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="bg-amber-600 hover:bg-amber-700 text-white"
                      onClick={() => onChooseInteraction?.("focus", pendingFocusIds)}
                      disabled={availableFocusCandidates.length > 0 && pendingFocusIds.length === 0}
                    >
                      Confirm Focus
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
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
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {dayResult.interaction.options.map((option) => (
                    <Button
                      key={option.id}
                      variant="outline"
                      size="sm"
                      className="h-auto min-w-0 justify-start overflow-hidden px-3 py-2 text-left"
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
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-white">{option.label}</div>
                        <div className="text-[11px] text-zinc-400 line-clamp-2">{option.description}</div>
                      </div>
                    </Button>
                  ))}
                </div>
              )
            )}
          </section>
        )}

        {/* Fatigue */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Fatigue:</span>
          <span className={`text-xs font-medium ${fatigue.className}`}>
            {fatigue.text}
          </span>
        </div>

        {/* Inbox messages received */}
        {dayResult.inboxMessages.length > 0 && (
          <section aria-label="Messages received">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Messages Received
            </p>
            <div className="space-y-1.5">
              {dayResult.inboxMessages.map((msg) => (
                <div
                  key={msg.id}
                  className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2"
                >
                  <p className="text-xs font-medium text-white">{msg.title}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-zinc-400 line-clamp-2">
                    {msg.body}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Observations detail */}
        {dayResult.observations.length > 0 && (
          <section aria-label="Players observed">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Players Observed
            </p>
            <div className="space-y-1">
              {dayResult.observations.map((obs) => (
                <div
                  key={obs.playerId}
                  className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-950 px-3 py-1.5"
                >
                  <span className="text-xs font-medium text-white">{obs.playerName}</span>
                  <span className="text-[11px] text-zinc-500">{obs.topAttributes}</span>
                </div>
              ))}
            </div>
          </section>
        )}
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
        <p className="text-sm text-zinc-500">No activity scheduled for this day.</p>
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
  const advanceDay = useGameStore((s) => s.advanceDay);
  const chooseSimulationInteraction = useGameStore((s) => s.chooseSimulationInteraction);
  const fastForwardWeek = useGameStore((s) => s.fastForwardWeek);
  const setScreen = useGameStore((s) => s.setScreen);

  // All hooks must be called before any early return
  const currentDay = weekSimulation?.currentDay ?? 0;
  const dayResults = weekSimulation?.dayResults ?? EMPTY_DAY_RESULTS;
  const focusCandidates = useMemo(() => {
    const merged = new Map<string, DayResult["observations"][number]>();
    const upperBound = Math.min(dayResults.length - 1, currentDay);
    for (let i = 0; i <= upperBound; i++) {
      const day = dayResults[i];
      if (!day) continue;
      for (const obs of day.observations) {
        if (!merged.has(obs.playerId)) {
          merged.set(obs.playerId, obs);
        }
      }
    }
    return [...merged.values()].slice(0, 8);
  }, [currentDay, dayResults]);

  if (!weekSimulation) return null;

  const currentDayResult: DayResult | undefined = dayResults[currentDay];
  const isLastDay = currentDay >= dayResults.length - 1;
  const isComplete = currentDay >= 7;
  const interactionPending = !!currentDayResult?.interaction && !currentDayResult.interaction.selectedOptionId;

  const currentBg = currentDayResult?.activity?.type
    ? ACTIVITY_BACKGROUNDS[currentDayResult.activity.type] ?? FREE_DAY_BG
    : FREE_DAY_BG;

  return (
    <GameLayout>
      <div className="relative flex h-full min-h-screen flex-col bg-zinc-950 p-6">
        <ScreenBackground src={currentBg} opacity={0.82} />
        <div className="relative z-10 flex flex-1 flex-col">
        {/* Header */}
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-white">Week in Progress</h1>
          <p className="mt-0.5 text-sm text-zinc-400">
            Day {Math.min(currentDay + 1, 7)} of 7
          </p>
        </header>

        {/* Body: timeline + card */}
        <div className="flex flex-1 gap-6">
          {/* Left: 7-day timeline */}
          <aside
            className="w-52 shrink-0"
            aria-label="Weekly timeline"
          >
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              This Week
            </p>
            <nav className="space-y-1.5" aria-label="Day-by-day progress">
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
            </nav>
          </aside>

          {/* Center: current day card */}
          <main className="flex-1 min-w-0" aria-live="polite" aria-label="Current day details">
            <AnimatePresence mode="wait">
              {isComplete ? (
                <motion.div
                  key="complete"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card className="flex flex-col items-center justify-center p-10 text-center bg-zinc-900 border-zinc-800">
                    <p className="text-4xl mb-4" aria-hidden="true">--</p>
                    <p className="text-xl font-bold text-white">Week Complete</p>
                    <p className="mt-2 text-sm text-zinc-400">
                      All days have been processed. Head to your calendar to review this week&apos;s results.
                    </p>
                  </Card>
                </motion.div>
              ) : (
                <motion.div
                  key={currentDay}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  {currentDayResult ? (
                    <DayCard
                      dayResult={currentDayResult}
                      focusCandidates={focusCandidates}
                      onChooseInteraction={chooseSimulationInteraction}
                    />
                  ) : (
                    <FreeDayCard dayName={DAY_NAMES[currentDay] ?? "Day"} />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </main>
        </div>

        {/* Footer: action buttons */}
        <footer className="mt-6 flex items-center justify-between border-t border-zinc-800 pt-5">
          <div className="flex items-center gap-3">
            {isComplete ? (
              <Button
                size="lg"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => setScreen("calendar")}
              >
                View Calendar
              </Button>
            ) : isLastDay ? (
                <Button
                  size="lg"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={advanceDay}
                  aria-label="Complete the week and process results"
                  disabled={interactionPending}
                >
                  Complete Week
                </Button>
              ) : (
                <>
                <Button
                  size="lg"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={advanceDay}
                    aria-label="Advance to next day"
                    disabled={interactionPending}
                  >
                    Next Day
                  </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={fastForwardWeek}
                  aria-label="Skip remaining days and complete the week"
                >
                  Skip to Results
                </Button>
              </>
            )}
          </div>

          {/* Progress indicator */}
          <div className="flex items-center gap-2" aria-hidden="true">
            {DAY_NAMES.map((name, i) => (
              <div
                key={name}
                className={`h-1.5 w-7 rounded-full transition-colors ${
                  isComplete || i < currentDay
                    ? "bg-emerald-500"
                    : i === currentDay
                      ? "bg-amber-400"
                      : "bg-zinc-800"
                }`}
              />
            ))}
          </div>
        </footer>
        </div>
      </div>
    </GameLayout>
  );
}
