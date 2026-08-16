"use client";

import { useEffect, useState, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useGameStore } from "@/stores/gameStore";
import {
  useGuardedWeekAdvance,
  WeekAdvanceConfirmDialog,
} from "./settings/useGuardedWeekAdvance";
import { GameLayout } from "./GameLayout";
import { isYouthFirstHour } from "@/lib/youthFirstHour";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  CalendarPlus,
  Eye,
  FileText,
  TrendingUp,
  Mail,
  DollarSign,
  AlertTriangle,
  Star,
  Shield,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Bookmark,
  Compass,
  Trophy,
  BarChart3,
  GraduationCap,
  Target,
  ArrowRight,
  Users,
  Brain,
  BookOpen,
  Monitor,
  Plane,
  ClipboardList,
} from "lucide-react";
import { ClubCrest } from "@/components/game/ClubCrest";
import { ScoutAvatar } from "@/components/game/ScoutAvatar";
import { Tooltip } from "@/components/ui/tooltip";
import { calculateMonthlyRunRate, isBroke, getEquipmentItem, ALL_EQUIPMENT_SLOTS, getSpecIncomeLabel, getSpecTier3Label } from "@/engine/finance";
import { selectLatestReportsByCase } from "@/engine/reports/reportAccountability";
import type { EquipmentSlot } from "@/engine/finance";
import { getSeasonPhase } from "@/engine/core/seasonEvents";
import { isTransferWindowOpen } from "@/engine/core/transferWindow";
import { countOpenScheduleDays } from "@/engine/core/calendar";
import { SeasonTimeline } from "./SeasonTimeline";
import { InsightMeter } from "./InsightMeter";
import { ConnectedScenarioProgressPanel } from "./ScenarioProgressPanel";
import { HelpTooltip } from "@/components/ui/HelpTooltip";
import { LeagueStandingsWidget } from "./LeagueStandingsWidget";
import { useTranslations } from "next-intl";
import { ScreenBackground } from "@/components/ui/screen-background";
import { IS_YOUTH_EARLY_ACCESS } from "@/lib/demo";
import { getPerceivedAbility } from "@/engine/scout/perceivedAbility";
import { getSeasonLength } from "@/engine/core/gameDate";
import { buildYouthActiveCaseModel } from "./workspace/desk/youthDeskModel";
import { DashboardSupplementalSections } from "./dashboard/DashboardSupplementalSections";
import type { DashboardActionTarget } from "./dashboard/dashboardPriorityModel";
import { buildDashboardWorkspaceModel } from "./dashboard/dashboardWorkspaceModel";
import {
  formatBalance,
  formatMoney,
  getOrdinal,
  moraleEmoji,
  priorityBadgeClass,
  sortYouthByEvidence,
  threatBadgeVariant,
  threatLabel,
} from "./dashboard/helpers";
import { YouthDeskDashboard } from "./dashboard/YouthDeskDashboard";
import { DashboardCommandCenter } from "./dashboard/DashboardCommandCenter";

// ─── component ────────────────────────────────────────────────────────────────

export function Dashboard() {
  const {
    gameState,
    setScreen,
    openDashboardTarget,
    getUpcomingFixtures,
    getLeagueStandings,
    scheduleMatch,
    markMessageRead,
    selectPlayer,
    submitLoanMonitoringReport,
    pendingListingReportId,
    markDashboardItemViewed,
    snoozeDashboardItemUntilNextWeek,
    toggleDashboardItemPinned,
    dismissDashboardItem,
    syncDashboardVisibleItems,
    dismissDashboardInsight,
    syncDashboardInsights,
  } = useGameStore(useShallow((state) => ({
    gameState: state.gameState,
    setScreen: state.setScreen,
    openDashboardTarget: state.openDashboardTarget,
    getUpcomingFixtures: state.getUpcomingFixtures,
    getLeagueStandings: state.getLeagueStandings,
    scheduleMatch: state.scheduleMatch,
    markMessageRead: state.markMessageRead,
    selectPlayer: state.selectPlayer,
    submitLoanMonitoringReport: state.submitLoanMonitoringReport,
    pendingListingReportId: state.pendingListingReportId,
    markDashboardItemViewed: state.markDashboardItemViewed,
    snoozeDashboardItemUntilNextWeek: state.snoozeDashboardItemUntilNextWeek,
    toggleDashboardItemPinned: state.toggleDashboardItemPinned,
    dismissDashboardItem: state.dismissDashboardItem,
    syncDashboardVisibleItems: state.syncDashboardVisibleItems,
    dismissDashboardInsight: state.dismissDashboardInsight,
    syncDashboardInsights: state.syncDashboardInsights,
  })));
  const [expandedExpenses, setExpandedExpenses] = useState(false);
  const [showSatisfactionHistory, setShowSatisfactionHistory] = useState(false);
  const t = useTranslations("dashboard");
  const tCal = useTranslations("calendar");

  const {
    request: requestWeekAdvance,
    pending: weekAdvancePending,
    confirm: confirmWeekAdvance,
    cancel: cancelWeekAdvance,
  } = useGuardedWeekAdvance();

  // useMemo hooks MUST be called before any early return to satisfy React's
  // Rules of Hooks (hooks must be called in the same order every render).
  const recentReports = useMemo(
    () =>
      gameState
        ? selectLatestReportsByCase(Object.values(gameState.reports))
            .sort((a, b) =>
              b.submittedSeason - a.submittedSeason
              || b.submittedWeek - a.submittedWeek
              || (b.revision ?? 1) - (a.revision ?? 1)
              || b.id.localeCompare(a.id)
            )
            .slice(0, 5)
        : [],
    [gameState],
  );
  const observedPlayerCount = useMemo(
    () =>
      gameState
        ? new Set(
            Object.values(gameState.observations).map((o) => o.playerId),
          ).size
        : 0,
    [gameState],
  );
  const unreviewedNPCReports = useMemo(
    () =>
      gameState
        ? Object.values(gameState.npcReports).filter((r) => !r.reviewed)
        : [],
    [gameState],
  );
  const firstHourDesk = isYouthFirstHour(gameState);
  const dashboardWorkspace = useMemo(
    () =>
      gameState && !firstHourDesk
        ? buildDashboardWorkspaceModel({
            gameState,
            pendingListingReportId,
          })
        : null,
    [firstHourDesk, gameState, pendingListingReportId],
  );
  useEffect(() => {
    if (!dashboardWorkspace) return;
    syncDashboardVisibleItems(dashboardWorkspace.activeItemIds);
  }, [dashboardWorkspace, syncDashboardVisibleItems]);
  useEffect(() => {
    if (!dashboardWorkspace) return;
    syncDashboardInsights(
      dashboardWorkspace.insights.map((insight) => ({
        id: insight.id,
        fingerprint: insight.fingerprint,
      })),
    );
  }, [dashboardWorkspace, syncDashboardInsights]);

  if (!gameState) return null;

  const { scout, currentWeek, currentSeason } = gameState;
  const seasonLength = getSeasonLength(gameState.fixtures, currentSeason);
  const upcoming = scout.primarySpecialization !== "youth"
    ? getUpcomingFixtures(currentWeek, 8)
    : [];
  const thisWeekFixtures = upcoming.filter((f) => f.week === currentWeek);
  const unreadMessages = gameState.inbox.filter((m) => !m.read);
  const currentCareerEra = gameState.careerEraDirectorState?.current;

  // Board satisfaction history -- most recent 5 entries
  const satisfactionHistory = (gameState.satisfactionHistory ?? []).slice(-5);
  const hasMultipleCountries = gameState.countries.length > 1;
  const { travelBooking } = scout;

  // Phase 2: finances
  const { finances } = gameState;
  const broke = finances ? isBroke(finances) : false;
  const monthlyRunRate = finances
    ? calculateMonthlyRunRate(finances, gameState.scout)
    : undefined;
  const totalExpenses = monthlyRunRate?.totalExpenses ?? 0;
  const recurringMonthlyIncome = monthlyRunRate?.totalIncome ?? 0;

  // Career path
  const careerPath = scout.careerPath ?? "club";

  // Specialization-specific data
  const specialization = scout.primarySpecialization;
  const relevantActiveLoans = (gameState.activeLoans ?? []).filter(
    (deal) =>
      deal.scoutId === scout.id ||
      deal.parentClubId === scout.currentClubId ||
      deal.loanClubId === scout.currentClubId,
  );

  // Youth scout data
  const youthList = specialization === "youth" ? Object.values(gameState.unsignedYouth) : [];
  const youthDiscoveredCount = youthList.filter((y) =>
    y.discoveredBy.includes(scout.id),
  ).length;
  const youthReportedIds = specialization === "youth"
    ? new Set(
        Object.values(gameState.placementReports ?? {})
          .filter((r) => r.scoutId === scout.id)
          .map((r) => r.unsignedYouthId),
      )
    : new Set<string>();
  const youthReportedCount = youthReportedIds.size;
  const observations = Object.values(gameState.observations);
  const observationCountByPlayer = new Map<string, number>();
  for (const observation of observations) {
    observationCountByPlayer.set(
      observation.playerId,
      (observationCountByPlayer.get(observation.playerId) ?? 0) + 1,
    );
  }
  const observedYouthEvidence = specialization === "youth"
    ? youthList
        .filter((y) => y.discoveredBy.includes(scout.id))
        .map((y) => {
          const perceived = getPerceivedAbility(observations, y.player.id);
          return {
            youth: y,
            observationCount: observationCountByPlayer.get(y.player.id) ?? 0,
            intelCount: gameState.contactIntel[y.player.id]?.length ?? 0,
            reported: youthReportedIds.has(y.id),
            buzzLevel: y.buzzLevel,
            visibility: y.visibility,
            hasFirmRead:
              perceived != null &&
              perceived.observationCount >= 2 &&
              (perceived.caConfidence >= 0.7 || perceived.paConfidence >= 0.7),
          };
        })
    : [];
  const multiViewCount = observedYouthEvidence.filter((entry) => entry.observationCount >= 2).length;
  const firmReadCount = observedYouthEvidence.filter((entry) => entry.hasFirmRead).length;
  const mostWatchedYouth = [...observedYouthEvidence].sort(sortYouthByEvidence)[0];

  // Phase 2: rival scouts — filtered to matching specialization
  const allRivals = Object.values(gameState.rivalScouts);
  const rivalScouts = allRivals.filter(r => r.specialization === specialization);
  const hasRivals = rivalScouts.length > 0;

  // firstTeam: active (unfulfilled) directives
  const activeDirectives = specialization === "firstTeam"
    ? gameState.managerDirectives.filter((d) => !d.fulfilled).slice(0, 4)
    : [];

  // firstTeam: recent transfer records (max 3)
  const recentTransfers = specialization === "firstTeam"
    ? [...gameState.transferRecords]
        .sort((a, b) => b.transferSeason - a.transferSeason || b.transferWeek - a.transferWeek)
        .slice(0, 3)
    : [];

  // data: prediction accuracy summary
  const allPredictions = specialization === "data" ? gameState.predictions : [];
  const resolvedPredictions = allPredictions.filter((p) => p.resolved);
  const correctPredictions = resolvedPredictions.filter((p) => p.wasCorrect === true);
  const predictionAccuracy = resolvedPredictions.length > 0
    ? Math.round((correctPredictions.length / resolvedPredictions.length) * 100)
    : 0;
  const currentStreak = (() => {
    if (specialization !== "data") return 0;
    let streak = 0;
    const sorted = [...resolvedPredictions].sort((a, b) => b.madeInSeason - a.madeInSeason || b.madeInWeek - a.madeInWeek);
    for (const p of sorted) {
      if (p.wasCorrect === true) streak++;
      else break;
    }
    return streak;
  })();
  const oracleBadge = predictionAccuracy >= 70 && resolvedPredictions.length >= 10;
  const unresolvedPredictions = allPredictions.filter((p) => !p.resolved).slice(0, 3);

  // data: analysts
  const dataAnalysts = specialization === "data" ? gameState.dataAnalysts : [];

  // Transfer window
  const twArray = gameState.transferWindow ? [gameState.transferWindow] : [];
  const transferWindowActive = isTransferWindowOpen(twArray, currentWeek);

  // Issue 9: season phase badge
  const seasonPhase = getSeasonPhase(currentWeek, seasonLength);
  // Season phase labels are only used once, so no need for a constant — but
  // keeping a record satisfies the exhaustiveness check and reads clearly.
  const phaseClass: Record<typeof seasonPhase, string> = {
    preseason: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    earlyseason: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    midseason: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    lateseason: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    endseason: "bg-red-500/15 text-red-400 border-red-500/30",
  };
  const phaseBadgeClassName = phaseClass[seasonPhase];
  const phaseLabel = tCal(`seasonPhases.${seasonPhase}` as Parameters<typeof tCal>[0]);

  const scheduleActivities = gameState.schedule.activities ?? [];
  const scheduledSlots = scheduleActivities.filter((activity) => activity !== null).length;
  const openDayCount = countOpenScheduleDays(gameState.schedule);
  const needsPlannerBeforeAdvance = openDayCount > 0;

  const decisionReadyYouth = observedYouthEvidence
    .filter((entry) => entry.hasFirmRead && !entry.reported && !entry.youth.placed)
    .sort(sortYouthByEvidence);
  const evidenceQueue = observedYouthEvidence
    .filter((entry) => !entry.reported && !entry.youth.placed)
    .sort(sortYouthByEvidence);
  const nextProspect = decisionReadyYouth[0] ?? evidenceQueue[0];
  const placedYouthCount = Object.values(gameState.placementReports ?? {}).filter(
    (report) => report.scoutId === scout.id && report.clubResponse === "accepted",
  ).length;
  const pendingPlacementCount = Object.values(gameState.placementReports ?? {}).filter(
    (report) => report.scoutId === scout.id && (!report.clubResponse || report.clubResponse === "pending"),
  ).length;
  const openRecruitmentBriefs = Object.values(gameState.youthRecruitmentBriefs ?? {})
    .filter((brief) => brief.status === "open")
    .sort((left, right) =>
      right.competitionPressure - left.competitionPressure
      || left.expiresSeason - right.expiresSeason
      || left.expiresWeek - right.expiresWeek
    );
  const youthDeskAction = decisionReadyYouth.length > 0
    ? {
        eyebrow: "Decision ready",
        title: `Make the call on ${decisionReadyYouth[0]!.youth.player.firstName} ${decisionReadyYouth[0]!.youth.player.lastName}`,
        description: "You have enough repeat evidence for a defensible placement recommendation. Review the dossier before the trail cools.",
        label: "Review decision",
        kind: "prospect" as const,
      }
    : scheduledSlots === 0
      ? {
          eyebrow: "Week not planned",
          title: "Build a week that can change a career",
          description: "Choose where to look, what evidence to deepen, and when to recover. Empty days create no new information.",
          label: "Open planner",
          kind: "planner" as const,
        }
      : nextProspect
        ? {
            eyebrow: "Evidence gap",
            title: `Get another look at ${nextProspect.youth.player.firstName} ${nextProspect.youth.player.lastName}`,
            description: "One impression is a lead, not a judgment. Compare another context before committing your reputation.",
            label: "Open dossier",
            kind: "prospect" as const,
          }
        : {
            eyebrow: "Ready to simulate",
            title: "Your week has a purpose",
            description: needsPlannerBeforeAdvance
              ? "The week is not fully committed yet. Review the itinerary before you simulate so the tradeoffs are intentional."
              : "Run the itinerary, collect what the week reveals, then turn those observations into a decision.",
            label: needsPlannerBeforeAdvance ? "Finish in planner" : "Advance week",
            kind: "advance" as const,
          };

  function openYouthDeskAction(): void {
    if (youthDeskAction.kind === "planner") {
      setScreen("calendar");
      return;
    }
    if (youthDeskAction.kind === "prospect" && nextProspect) {
      selectPlayer(nextProspect.youth.player.id);
      setScreen("playerProfile");
      return;
    }
    if (needsPlannerBeforeAdvance) {
      setScreen("calendar");
      return;
    }
    requestWeekAdvance();
  }

  function openDashboardAction(target: DashboardActionTarget): void {
    openDashboardTarget(target);
  }

  if (IS_YOUTH_EARLY_ACCESS && specialization === "youth") {
    const activeCaseModel = buildYouthActiveCaseModel({
      decisionReadyYouth,
      evidenceQueue,
      observedYouthEvidence,
      openRecruitmentBriefs,
      pendingPlacementCount,
      scheduledSlots,
      openDayCount,
    });
    if (!firstHourDesk && !dashboardWorkspace) {
      return null;
    }
    return (
      <YouthDeskDashboard
        gameState={gameState}
        scout={scout}
        currentWeek={currentWeek}
        currentSeason={currentSeason}
        seasonLength={seasonLength}
        phaseBadgeClassName={phaseBadgeClassName}
        phaseLabel={phaseLabel}
        scheduledSlots={scheduledSlots}
        youthDeskAction={youthDeskAction}
        activeCaseModel={activeCaseModel}
        currentCareerEra={currentCareerEra}
        dashboardWorkspace={dashboardWorkspace}
        onDashboardAction={openDashboardAction}
        onMarkReviewed={(item) => markDashboardItemViewed(item.id, item.fingerprint)}
        onSnooze={(item) => snoozeDashboardItemUntilNextWeek(item.id, item.fingerprint)}
        onTogglePin={(item) => toggleDashboardItemPinned(item.id, item.fingerprint)}
        onDismiss={(item) => dismissDashboardItem(item.id, item.fingerprint)}
        onDismissInsight={dismissDashboardInsight}
        onPrimaryAction={openYouthDeskAction}
        setScreen={setScreen}
        selectPlayer={selectPlayer}
      />
    );
  }

  return (
    <GameLayout>
      <div className="relative p-4 md:p-6" data-tutorial-id="dashboard-overview">
        <ScreenBackground src="/images/backgrounds/dashboard-office.png" opacity={0.82} />
        <div className="relative z-10">
        {/* Header */}
        <div className="mb-4 md:mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3" data-tutorial-id="dashboard-club-header">
              <ScoutAvatar avatarId={scout.avatarId ?? 1} size={48} />
              {scout.currentClubId && gameState.clubs[scout.currentClubId] && (
                <ClubCrest
                  clubId={scout.currentClubId}
                  clubName={gameState.clubs[scout.currentClubId]!.name}
                  size={48}
                />
              )}
              <div>
                <h1 className="text-xl md:text-2xl font-bold">Dashboard</h1>
                {scout.currentClubId && gameState.clubs[scout.currentClubId] && (
                  <p className="text-xs text-zinc-400">
                    {gameState.clubs[scout.currentClubId]!.name}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <Tooltip content="The current simulation week. Each week, you schedule activities and advance." side="bottom">
                <p className="text-sm text-zinc-400">
                  {t("week", { number: currentWeek })} — {t("season", { number: currentSeason })}
                </p>
              </Tooltip>
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${phaseClass[seasonPhase]}`}
              >
                {tCal(`seasonPhases.${seasonPhase}` as Parameters<typeof tCal>[0])}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setScreen("calendar")}>
              <Calendar size={16} className="mr-2" aria-hidden="true" />
              Planner
            </Button>
            <Button onClick={() => (needsPlannerBeforeAdvance ? setScreen("calendar") : requestWeekAdvance())}>
              {needsPlannerBeforeAdvance ? "Finish in Planner" : "Advance Week"}
            </Button>
          </div>
        </div>

        {dashboardWorkspace && (
          <div className="mb-6">
            <DashboardCommandCenter
              model={dashboardWorkspace}
              onAction={openDashboardAction}
              onOpenPlanner={() => setScreen("calendar")}
              onMarkReviewed={(item) => markDashboardItemViewed(item.id, item.fingerprint)}
              onSnooze={(item) => snoozeDashboardItemUntilNextWeek(item.id, item.fingerprint)}
              onTogglePin={(item) => toggleDashboardItemPinned(item.id, item.fingerprint)}
              onDismiss={(item) => dismissDashboardItem(item.id, item.fingerprint)}
              onDismissInsight={dismissDashboardInsight}
            />
          </div>
        )}

        {/* Season Timeline */}
        {gameState.seasonEvents.length > 0 && (
          <SeasonTimeline
            seasonEvents={gameState.seasonEvents}
            currentWeek={currentWeek}
            seasonLength={seasonLength}
            onResolveEvent={(eventId, choiceIndex) => {
              useGameStore.getState().resolveSeasonEvent(eventId, choiceIndex);
            }}
          />
        )}

        {/* Transfer window alert */}
        {!IS_YOUTH_EARLY_ACCESS && transferWindowActive && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
            <AlertTriangle size={14} className="shrink-0" aria-hidden="true" />
            Transfer Window Active — Check Inbox for urgent assessments
          </div>
        )}

        {/* Free agent alert */}
        {!IS_YOUTH_EARLY_ACCESS && gameState.freeAgentPool?.agents.some(
          (a) => a.discoveredByScout && a.status === "available"
        ) && (
          <button
            onClick={() => setScreen("freeAgents")}
            className="mb-4 flex w-full items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-left text-sm text-emerald-300 transition hover:border-emerald-500/50"
          >
            <Users size={14} className="shrink-0" aria-hidden="true" />
            Free agents discovered — View available players
          </button>
        )}

        {/* Scenario Progress — only shown when a scenario is active */}
        {!IS_YOUTH_EARLY_ACCESS && <ConnectedScenarioProgressPanel />}

        {/* Quick Stats */}
        <div className="mb-4 md:mb-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card
            data-tutorial-id="dashboard-reputation"
            className="cursor-pointer hover:border-zinc-600 transition"
            onClick={() => setScreen("handbook")}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <Tooltip content="Your standing in the scouting world. Higher reputation unlocks better job offers and contact access." side="bottom">
                    <p className="text-xs text-zinc-400">{t("reputation")}</p>
                  </Tooltip>
                  <p className="text-2xl font-bold text-emerald-400">
                    {Math.round(scout.reputation)}
                  </p>
                </div>
                <TrendingUp className="text-emerald-500" size={20} aria-hidden="true" />
              </div>
              {/* Expandable satisfaction history */}
              {satisfactionHistory.length > 0 && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowSatisfactionHistory(!showSatisfactionHistory);
                    }}
                    className="mt-2 flex w-full items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-300 transition"
                    aria-expanded={showSatisfactionHistory}
                    aria-label="Toggle reputation change history"
                  >
                    {showSatisfactionHistory ? (
                      <ChevronUp size={10} aria-hidden="true" />
                    ) : (
                      <ChevronDown size={10} aria-hidden="true" />
                    )}
                    Recent changes
                  </button>
                  {showSatisfactionHistory && (
                    <div className="mt-1.5 space-y-1">
                      {satisfactionHistory
                        .slice()
                        .reverse()
                        .map((entry, i) => (
                          <div
                            key={`${entry.week}-${entry.season}-${i}`}
                            className="flex items-center justify-between text-[10px]"
                          >
                            <span className="text-zinc-400 truncate mr-2">
                              {entry.reason}
                            </span>
                            <span
                              className={`shrink-0 font-semibold ${
                                entry.delta > 0
                                  ? "text-emerald-400"
                                  : "text-red-400"
                              }`}
                            >
                              {entry.delta > 0 ? "+" : ""}
                              {entry.delta}
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer hover:border-zinc-600 transition"
            onClick={() => setScreen(specialization === "youth" ? "youthScouting" : "playerDatabase")}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-zinc-400">
                    {specialization === "youth" ? "Youth Discovered" : "Reports Filed"}
                  </p>
                  <p className="text-2xl font-bold">
                    {specialization === "youth" ? youthDiscoveredCount : scout.reportsSubmitted}
                  </p>
                </div>
                {specialization === "youth"
                  ? <Users className="text-emerald-500" size={20} aria-hidden="true" />
                  : <FileText className="text-zinc-400" size={20} aria-hidden="true" />
                }
              </div>
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer hover:border-zinc-600 transition"
            onClick={() => setScreen(specialization === "youth" ? "youthScouting" : "playerDatabase")}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-zinc-400">
                    {specialization === "youth" ? "Legacy Score" : "Players Scouted"}
                  </p>
                  <p className={`text-2xl font-bold ${specialization === "youth" ? "text-amber-400" : ""}`}>
                    {specialization === "youth" ? gameState.legacyScore.totalScore : observedPlayerCount}
                  </p>
                </div>
                {specialization === "youth"
                  ? <Star className="text-amber-500" size={20} aria-hidden="true" />
                  : <Eye className="text-zinc-400" size={20} aria-hidden="true" />
                }
              </div>
            </CardContent>
          </Card>
          <Card
            data-tutorial-id="dashboard-fatigue"
            className="cursor-pointer hover:border-zinc-600 transition"
            onClick={() => setScreen("calendar")}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <Tooltip content="Physical and mental exhaustion. High fatigue reduces observation accuracy and increases injury risk." side="bottom">
                    <p className="text-xs text-zinc-400">{t("fatigue")}</p>
                  </Tooltip>
                  <p className="text-2xl font-bold">
                    {Math.round(scout.fatigue)}%
                  </p>
                </div>
                <div
                  aria-hidden="true"
                  className={`h-3 w-3 rounded-full ${
                    scout.fatigue > 70
                      ? "bg-red-500"
                      : scout.fatigue > 40
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                  }`}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Insight Meter ─────────────────────────────────────────────────── */}
        {scout.insightState && scout.insightState.points > 0 && (
          <div className="mb-6">
            <InsightMeter insightState={scout.insightState} compact />
          </div>
        )}

        {/* ── T8.2: Financial summary card ─────────────────────────────────── */}
        {finances && (
          <div className="mb-6">
            <Card
              data-tutorial-id="dashboard-finances"
              className={
                broke
                  ? "border-red-500/40 bg-red-500/5"
                  : "border-[#27272a]"
              }
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <DollarSign size={14} className="text-emerald-400" aria-hidden="true" />
                  Finances
                  <HelpTooltip text="Your weekly budget comes from salary, report sales, and placement fees. Manage expenses to build savings." />
                  {broke && (
                    <Badge variant="destructive" className="ml-auto text-[10px]">
                      <AlertTriangle size={10} className="mr-1" aria-hidden="true" />
                      Broke
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-4">
                  {/* Balance */}
                  <div>
                    <p className="text-xs text-zinc-400 mb-1">Balance</p>
                    <p
                      className={`text-lg font-bold ${
                        finances.balance >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {formatBalance(finances.balance)}
                    </p>
                  </div>

                  {/* Monthly income */}
                  <div>
                    <p className="text-xs text-zinc-400 mb-1">Monthly Income</p>
                    <p className="text-lg font-bold text-white">
                      {formatMoney(recurringMonthlyIncome)}
                    </p>
                  </div>

                  {/* Monthly expenses — expandable */}
                  <div>
                    <button
                      onClick={() => setExpandedExpenses((prev) => !prev)}
                      className="flex items-center gap-1 text-xs text-zinc-400 mb-1 hover:text-zinc-300 transition"
                    >
                      Monthly Expenses
                      {expandedExpenses ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                    </button>
                    <p className="text-lg font-bold text-red-400">
                      {formatMoney(totalExpenses)}
                    </p>
                    {expandedExpenses && (
                      <div className="mt-2 space-y-1">
                        {Object.entries(monthlyRunRate?.expenseBreakdown ?? finances.expenses)
                          .filter(([, val]) => val > 0)
                          .map(([category, amount]) => (
                            <div
                              key={category}
                              className="flex items-center justify-between text-xs"
                            >
                              <span className="text-zinc-400 capitalize">
                                {category.replace(/([A-Z])/g, " $1").trim()}
                              </span>
                              <span className="text-red-400">{formatMoney(amount)}</span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>

                  {/* Equipment loadout */}
                  <div>
                    <p className="text-xs text-zinc-400 mb-1">Equipment</p>
                    <div className="flex items-center gap-1">
                      {ALL_EQUIPMENT_SLOTS.map((slot) => {
                        const itemId = finances.equipment?.loadout[slot];
                        const item = itemId ? getEquipmentItem(itemId) : null;
                        const tier = item?.tier ?? 1;
                        const isSpecialist = !!item?.specialization;
                        const SlotIcon = (
                          { notebook: BookOpen, video: Monitor, travel: Plane, network: Users, analysis: BarChart3 } as Record<EquipmentSlot, React.ElementType>
                        )[slot];
                        const tierColor = isSpecialist
                          ? "text-purple-400 ring-1 ring-purple-500/50"
                          : tier === 4
                            ? "text-emerald-400"
                            : tier === 3
                              ? "text-amber-400"
                              : tier === 2
                                ? "text-blue-400"
                                : "text-zinc-500";
                        return (
                          <div
                            key={slot}
                            className={`rounded p-0.5 ${tierColor}`}
                            title={item?.name ?? slot}
                          >
                            <SlotIcon size={14} aria-hidden="true" />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Specialization income bonuses (B9) */}
                {(() => {
                  const specBonus = finances.specBonusApplied ?? 0;
                  const specUnique = finances.specUniqueIncome ?? 0;
                  const totalSpec = specBonus + specUnique;
                  if (totalSpec === 0 && scout.careerTier < 3) return null;
                  return (
                    <div className="mt-3 rounded-md border border-[#27272a] bg-[#0f0f0f] p-3">
                      <p className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold mb-2">
                        Specialization Income
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <Badge variant="secondary" className="text-[10px]">
                          {getSpecIncomeLabel(scout.primarySpecialization)}
                        </Badge>
                        {specBonus !== 0 && (
                          <span className={specBonus >= 0 ? "text-emerald-400" : "text-red-400"}>
                            {specBonus >= 0 ? "+" : ""}{formatMoney(Math.abs(specBonus))}/mo bonus
                          </span>
                        )}
                        {scout.careerTier >= 3 && (
                          <>
                            <span className="text-zinc-400" aria-hidden="true">|</span>
                            <span className="text-blue-400">
                              {getSpecTier3Label(scout.primarySpecialization)}
                            </span>
                            {specUnique > 0 && (
                              <span className="text-emerald-400">
                                +{formatMoney(specUnique)}/mo
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {broke && (
                  <p className="mt-3 text-xs text-red-400">
                    Your balance is critically low. Reduce expenses or seek new contracts.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Phase 1 alert widgets */}
        {(hasMultipleCountries || (!IS_YOUTH_EARLY_ACCESS && unreviewedNPCReports.length > 0)) && (
          <div className="mb-6 flex flex-wrap gap-4">
            {/* NPC report queue */}
            {!IS_YOUTH_EARLY_ACCESS && unreviewedNPCReports.length > 0 && (
              <Card className="flex-1 min-w-[220px]">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs text-zinc-400">NPC Reports</p>
                      <p className="text-sm font-semibold text-amber-400">
                        {unreviewedNPCReports.length} pending review
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setScreen("npcManagement")}
                    >
                      Review
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* International status */}
            {hasMultipleCountries && (
              <Card className="flex-1 min-w-[220px]">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs text-zinc-400">International</p>
                      {travelBooking?.isAbroad ? (
                        <p className="text-sm font-semibold text-blue-400">
                          In {travelBooking.destinationCountry} — returns wk{" "}
                          {travelBooking.returnWeek}
                        </p>
                      ) : (
                        <p className="text-sm font-semibold text-white">
                          At home base
                        </p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setScreen("internationalView")}
                    >
                      View
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Agency Business summary — independent path only */}
        {!IS_YOUTH_EARLY_ACCESS && careerPath === "independent" && gameState.finances && (
          <div className="mb-6">
            <Card className="col-span-full">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white">Agency Business</h3>
                  <button
                    onClick={() => setScreen("agency")}
                    className="text-xs text-emerald-400 hover:text-emerald-300 transition"
                  >
                    View Agency →
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                  {[
                    { label: "Balance", value: `£${gameState.finances.balance.toLocaleString()}`, color: gameState.finances.balance >= 0 ? "text-emerald-400" : "text-red-400" },
                    { label: "Retainers", value: `${gameState.finances.retainerContracts.filter((r: { status: string }) => r.status === "active").length} active`, color: "text-blue-400" },
                    { label: "Employees", value: `${gameState.finances.employees.length}/${gameState.finances.office.maxEmployees}`, color: "text-purple-400" },
                    { label: "Office", value: gameState.finances.office.tier === "home" ? "Home" : gameState.finances.office.tier.charAt(0).toUpperCase() + gameState.finances.office.tier.slice(1), color: "text-amber-400" },
                    { label: "Tier", value: `${gameState.scout.independentTier ?? 1}/5`, color: "text-emerald-400" },
                    { label: "Pending Offers", value: `${(gameState.finances.pendingRetainerOffers?.length ?? 0) + (gameState.finances.pendingConsultingOffers?.length ?? 0)}`, color: "text-teal-400" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="rounded-md border border-zinc-800 bg-zinc-900/50 p-2.5">
                      <p className="text-[10px] text-zinc-400 uppercase tracking-wider">{label}</p>
                      <p className={`text-sm font-semibold ${color}`}>{value}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid grid-cols-3 gap-6">
          {/* This Week's Fixtures / Youth Pipeline */}
          {specialization === "youth" ? (
            /* Youth Pipeline card */
            <Card className="col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <GraduationCap size={16} className="text-emerald-400" aria-hidden="true" />
                    Youth Pipeline
                  </span>
                  <Badge variant="secondary">{youthList.length} total</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Pipeline stages */}
                <div className="mb-4 grid grid-cols-4 gap-3">
                  {([
                    { label: "New", count: youthList.length - youthDiscoveredCount, color: "text-zinc-400", bg: "bg-zinc-800" },
                    { label: "Observed", count: youthDiscoveredCount, color: "text-emerald-400", bg: "bg-emerald-500/10" },
                    { label: "Reported", count: youthReportedCount, color: "text-blue-400", bg: "bg-blue-500/10" },
                    { label: "Placed", count: placedYouthCount, color: "text-amber-400", bg: "bg-amber-500/10" },
                  ] as const).map((stage) => (
                    <button
                      key={stage.label}
                      onClick={() => setScreen("youthScouting")}
                      className={`rounded-md border border-[#27272a] p-3 text-center cursor-pointer hover:border-zinc-600 transition w-full ${stage.bg}`}
                    >
                      <p className={`text-lg font-bold ${stage.color}`}>{stage.count}</p>
                      <p className="text-[10px] text-zinc-400">{stage.label}</p>
                    </button>
                  ))}
                </div>

                {/* Top prospects */}
                {(() => {
                  const observed = youthList
                    .filter((y) => y.discoveredBy.includes(scout.id))
                    .sort((a, b) => b.buzzLevel - a.buzzLevel)
                    .slice(0, 3);
                  if (observed.length === 0) return (
                    <p className="text-sm text-zinc-400">No youth observed yet. Visit youth venues to discover talent.</p>
                  );
                  return (
                    <div className="space-y-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Buzz Leaders</p>
                      {observed.map((y) => (
                        <button
                          key={y.id}
                          onClick={() => { selectPlayer(y.player.id); setScreen("playerProfile"); }}
                          className="flex w-full items-center gap-3 rounded-md border border-[#27272a] p-2.5 text-left transition hover:border-zinc-600"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">
                              {y.player.firstName} {y.player.lastName}
                            </p>
                            <p className="text-[10px] text-zinc-400">{y.player.position} · {y.player.nationality}</p>
                          </div>
                          <div className="w-16">
                            <div className="mb-0.5 text-right text-[10px] text-zinc-400">{y.buzzLevel}%</div>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                              <div
                                className={`h-full rounded-full ${y.buzzLevel >= 70 ? "bg-emerald-500" : y.buzzLevel >= 40 ? "bg-amber-500" : "bg-zinc-600"}`}
                                style={{ width: `${y.buzzLevel}%` }}
                              />
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  );
                })()}

                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 w-full"
                  onClick={() => setScreen("youthScouting")}
                >
                  View Youth Hub
                  <ArrowRight size={12} className="ml-1" aria-hidden="true" />
                </Button>
              </CardContent>
            </Card>
          ) : (
            /* Original Fixtures card for non-youth scouts */
            <Card className="col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>This Week&apos;s Fixtures</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{thisWeekFixtures.length} matches</Badge>
                    <Button size="sm" variant="ghost" onClick={() => setScreen("fixtureBrowser")} className="text-xs text-zinc-400 hover:text-white">
                      Browse All
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {thisWeekFixtures.length === 0 ? (
                  <p className="text-sm text-zinc-400">No fixtures this week.</p>
                ) : (
                  <div className="space-y-2">
                    {thisWeekFixtures.slice(0, 6).map((fixture) => {
                      const homeClub = gameState.clubs[fixture.homeClubId];
                      const awayClub = gameState.clubs[fixture.awayClubId];
                      const league = gameState.leagues[fixture.leagueId];
                      // Get standings positions
                      const standings = league ? getLeagueStandings(league.id) : [];
                      const homePos = standings.findIndex((s) => s.clubId === fixture.homeClubId) + 1;
                      const awayPos = standings.findIndex((s) => s.clubId === fixture.awayClubId) + 1;
                      const weather = fixture.weather;
                      return (
                        <div
                          key={fixture.id}
                          className="flex items-center justify-between rounded-md border border-[var(--border)] p-3"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">
                                {homeClub?.name || "?"}
                                {homePos > 0 && <span className="text-zinc-400 text-xs"> ({getOrdinal(homePos)})</span>}
                                {" vs "}
                                {awayClub?.name || "?"}
                                {awayPos > 0 && <span className="text-zinc-400 text-xs"> ({getOrdinal(awayPos)})</span>}
                              </span>
                              {weather && (
                                <span className="text-[10px] text-zinc-400 capitalize">{weather.replace(/([A-Z])/g, " $1").trim()}</span>
                              )}
                              <Badge variant="outline" className="text-[10px]">
                                {league?.shortName}
                              </Badge>
                            </div>
                          </div>
                          {scout.primarySpecialization !== "youth" && (() => {
                            const scheduled = gameState.schedule.activities.some(
                              (a) => a !== null && a.type === "attendMatch" && a.targetId === fixture.id,
                            );
                            if (scheduled) {
                              return (
                                <Badge variant="outline" className="text-emerald-400 border-emerald-500/40">
                                  Scheduled
                                </Badge>
                              );
                            }
                            return (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  const ok = scheduleMatch(fixture.id);
                                  if (!ok) { /* calendar full — button state will reflect on re-render */ }
                                }}
                              >
                                <CalendarPlus size={14} className="mr-1" aria-hidden="true" />
                                Schedule
                              </Button>
                            );
                          })()}
                        </div>
                      );
                    })}
                  </div>
                )}
                {thisWeekFixtures.length > 6 && (
                  <p className="mt-2 text-xs text-zinc-400">
                    +{thisWeekFixtures.length - 6} more fixtures
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Inbox & Recent Activity */}
          <div className="space-y-6">
            {/* Inbox */}
            <Card
              className="cursor-pointer hover:border-zinc-600 transition"
              onClick={() => setScreen("inbox")}
            >
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Mail size={16} aria-hidden="true" />
                    {t("inbox")}
                  </span>
                  {unreadMessages.length > 0 && (
                    <Badge>{unreadMessages.length}</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {unreadMessages.length === 0 ? (
                  <p className="text-sm text-zinc-400">All caught up.</p>
                ) : (
                  <div className="space-y-2">
                    {unreadMessages.slice(0, 4).map((msg) => (
                      <button
                        key={msg.id}
                        onClick={() => {
                          markMessageRead(msg.id);
                          setScreen("inbox");
                        }}
                        className="w-full cursor-pointer rounded-md border border-[var(--border)] p-2 text-left hover:border-zinc-600 transition"
                      >
                        <p className="text-sm font-medium">{msg.title}</p>
                        <p className="text-xs text-zinc-400 line-clamp-1">
                          {msg.body}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 w-full"
                  onClick={() => setScreen("inbox")}
                >
                  View All
                </Button>
              </CardContent>
            </Card>

            {/* Recent Reports */}
            <Card>
              <CardHeader>
                <CardTitle>{t("recentReports")}</CardTitle>
              </CardHeader>
              <CardContent>
                {recentReports.length === 0 ? (
                  <p className="text-sm text-zinc-400">{t("noReports")}</p>
                ) : (
                  <div className="space-y-2">
                    {recentReports.map((report) => {
                      const player = gameState.players[report.playerId];
                      return (
                        <button
                          key={report.id}
                          onClick={() => {
                            selectPlayer(report.playerId);
                            setScreen("playerProfile");
                          }}
                          className="w-full cursor-pointer rounded-md border border-[var(--border)] p-2 text-left hover:border-zinc-600 transition"
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium">
                              {player?.firstName} {player?.lastName}
                            </p>
                            <Badge
                              variant={
                                report.conviction === "tablePound"
                                  ? "default"
                                  : report.conviction === "strongRecommend"
                                    ? "success"
                                    : "secondary"
                              }
                              className="text-[10px]"
                            >
                              {report.conviction === "tablePound"
                                ? "TABLE POUND"
                                : report.conviction === "strongRecommend"
                                  ? "Strong Rec"
                                  : report.conviction === "recommend"
                                    ? "Recommend"
                                    : "Note"}
                            </Badge>
                          </div>
                          <p className="text-xs text-zinc-400">
                            Quality: {report.qualityScore}/100 — Week{" "}
                            {report.submittedWeek}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Watchlist widget */}
            {gameState.watchlist.length > 0 && (
              <Card
                className="cursor-pointer hover:border-zinc-600 transition"
                onClick={() => setScreen("playerDatabase")}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Bookmark size={14} className="text-amber-400" aria-hidden="true" />
                    Watchlist
                    <Badge variant="secondary" className="ml-auto text-[10px]">
                      {gameState.watchlist.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {gameState.watchlist.slice(0, 5).map((pid) => {
                      const p = gameState.players[pid];
                      if (!p) return null;
                      return (
                        <button
                          key={pid}
                          onClick={() => {
                            selectPlayer(pid);
                            setScreen("playerProfile");
                          }}
                          className="flex w-full items-center justify-between rounded-md border border-[var(--border)] p-2 text-left hover:border-zinc-600 transition"
                        >
                          <span className="text-sm font-medium text-white truncate">
                            {p.firstName} {p.lastName}
                          </span>
                          <Badge variant="outline" className="text-[10px] shrink-0 ml-2">
                            {p.position}
                          </Badge>
                        </button>
                      );
                    })}
                  </div>
                  {gameState.watchlist.length > 5 && (
                    <p className="mt-1 text-xs text-zinc-400">
                      +{gameState.watchlist.length - 5} more
                    </p>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 w-full"
                    onClick={() => setScreen("playerDatabase")}
                  >
                    View All
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Youth Scouting */}
            {Object.keys(gameState.unsignedYouth).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <GraduationCap size={16} className="text-emerald-400" aria-hidden="true" />
                    Youth Scouting
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-zinc-400">Unsigned Youth</p>
                      <p className="text-lg font-medium">{Object.keys(gameState.unsignedYouth).length}</p>
                    </div>
                    <div>
                      <p className="text-zinc-400">Discovered</p>
                      <p className="text-lg font-medium">
                        {Object.values(gameState.unsignedYouth).filter((y) =>
                          y.discoveredBy.includes(gameState.scout.id ?? ""),
                        ).length}
                      </p>
                    </div>
                    <div>
                      <p className="text-zinc-400">Placed</p>
                      <p className="text-lg font-medium">
                        {placedYouthCount}
                      </p>
                    </div>
                    <div>
                      <p className="text-zinc-400">Legacy Score</p>
                      <p className="text-lg font-medium text-emerald-400">{gameState.legacyScore.totalScore}</p>
                    </div>
                  </div>
                  {specialization === "youth" && (() => {
                    return (
                      <div className="mt-3 space-y-2 border-t border-[#27272a] pt-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-zinc-400">Multi-view files</span>
                          <span className="font-medium text-emerald-400">{multiViewCount}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-zinc-400">Firm reads</span>
                          <span className="font-medium text-blue-400">{firmReadCount}</span>
                        </div>
                        {mostWatchedYouth && (
                          <div className="text-sm">
                            <p className="text-zinc-400 text-xs">Most Watched File</p>
                            <p className="font-medium text-white">
                              {mostWatchedYouth.youth.player.firstName} {mostWatchedYouth.youth.player.lastName}
                              <span className="ml-1 text-xs text-zinc-400">{mostWatchedYouth.youth.player.position}</span>
                            </p>
                            <p className="text-xs text-zinc-300">
                              {mostWatchedYouth.observationCount} look{mostWatchedYouth.observationCount === 1 ? "" : "s"}
                              {" · "}
                              {mostWatchedYouth.intelCount} intel note{mostWatchedYouth.intelCount === 1 ? "" : "s"}
                              {" · Buzz "}
                              {mostWatchedYouth.buzzLevel}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full"
                    onClick={() => setScreen("youthScouting")}
                  >
                    View Youth Hub
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Placement Reports (Youth scouts) */}
            {specialization === "youth" && (() => {
              const reports = Object.values(gameState.placementReports ?? {})
                .filter((r) => r.scoutId === scout.id)
                .sort((a, b) => b.season - a.season || b.week - a.week)
                .slice(0, 3);
              if (reports.length === 0) return null;
              const statusColors: Record<string, string> = {
                accepted: "border-emerald-500/50 bg-emerald-500/10 text-emerald-400",
                rejected: "border-red-500/50 bg-red-500/10 text-red-400",
                trial: "border-amber-500/50 bg-amber-500/10 text-amber-400",
                pending: "border-zinc-600 bg-zinc-800 text-zinc-400",
              };
              return (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <ClipboardList size={16} className="text-blue-400" aria-hidden="true" />
                      Placement Reports
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {reports.map((r) => {
                      const youth = gameState.unsignedYouth[r.unsignedYouthId];
                      const playerId = youth?.player.id
                        ?? (r.reportId ? gameState.reports[r.reportId]?.playerId : undefined)
                        ?? (r.caseId ? gameState.scoutingCases[r.caseId]?.playerId : undefined)
                        ?? gameState.alumniRecords.find(
                          (record) => record.placementReportId === r.id,
                        )?.playerId
                        ?? r.unsignedYouthId;
                      const player = youth?.player
                        ?? (playerId ? gameState.players[playerId] : undefined)
                        ?? (playerId ? gameState.retiredPlayers?.[playerId] : undefined);
                      const club = gameState.clubs[r.targetClubId];
                      const status = r.clubResponse ?? "pending";
                      return (
                        <div key={r.id} className="rounded-md border border-[#27272a] p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-white truncate">
                              {player?.firstName ?? "Archived"} {player?.lastName ?? "prospect"}
                            </p>
                            <Badge className={`shrink-0 text-[10px] capitalize ${statusColors[status] ?? statusColors.pending}`}>
                              {status}
                            </Badge>
                          </div>
                          <p className="text-[10px] text-zinc-400">{club?.shortName ?? "Unknown Club"}</p>
                        </div>
                      );
                    })}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs text-zinc-400 hover:text-white"
                      onClick={() => setScreen("youthScouting")}
                    >
                      View All
                    </Button>
                  </CardContent>
                </Card>
              );
            })()}
          </div>
        </div>

        <DashboardSupplementalSections
          gameState={gameState}
          scout={scout}
          specialization={specialization}
          activeDirectives={activeDirectives}
          recentTransfers={recentTransfers}
          allPredictions={allPredictions}
          resolvedPredictions={resolvedPredictions}
          correctPredictions={correctPredictions}
          predictionAccuracy={predictionAccuracy}
          currentStreak={currentStreak}
          oracleBadge={oracleBadge}
          unresolvedPredictions={unresolvedPredictions}
          dataAnalysts={dataAnalysts}
          hasRivals={hasRivals}
          rivalScouts={rivalScouts}
          relevantActiveLoans={relevantActiveLoans}
          setScreen={setScreen}
          selectPlayer={selectPlayer}
          submitLoanMonitoringReport={submitLoanMonitoringReport}
        />
        </div>
      </div>
      <WeekAdvanceConfirmDialog
        open={weekAdvancePending}
        onConfirm={confirmWeekAdvance}
        onCancel={cancelWeekAdvance}
      />
    </GameLayout>
  );
}
