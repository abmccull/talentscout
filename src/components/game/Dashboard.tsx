"use client";

import { useState, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
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
import { isBroke, getEquipmentItem, ALL_EQUIPMENT_SLOTS, getSpecIncomeLabel, getSpecTier3Label } from "@/engine/finance";
import { selectLatestReportsByCase } from "@/engine/reports/reportAccountability";
import type { EquipmentSlot } from "@/engine/finance";
import { getSeasonPhase } from "@/engine/core/seasonEvents";
import { isTransferWindowOpen } from "@/engine/core/transferWindow";
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
import { deriveBriefRecruitmentIdentity } from "@/engine/world/recruitmentIdentity";

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatBalance(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}£${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}£${(abs / 1_000).toFixed(0)}K`;
  return `${sign}£${abs}`;
}

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `£${(n / 1_000).toFixed(0)}K`;
  return `£${n}`;
}

function getOrdinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

function threatBadgeVariant(
  quality: number,
): "default" | "warning" | "destructive" | "secondary" {
  if (quality >= 4) return "destructive";
  if (quality >= 3) return "warning";
  if (quality >= 2) return "default";
  return "secondary";
}

function threatLabel(quality: number): string {
  if (quality >= 4) return "High Threat";
  if (quality >= 3) return "Medium";
  if (quality >= 2) return "Low";
  return "Minimal";
}

function sortYouthByEvidence(
  a: {
    observationCount: number;
    intelCount: number;
    reported: boolean;
    buzzLevel: number;
    visibility: number;
  },
  b: {
    observationCount: number;
    intelCount: number;
    reported: boolean;
    buzzLevel: number;
    visibility: number;
  },
): number {
  return (
    b.observationCount - a.observationCount ||
    Number(b.reported) - Number(a.reported) ||
    b.intelCount - a.intelCount ||
    b.buzzLevel - a.buzzLevel ||
    b.visibility - a.visibility
  );
}

// ─── Specialization widget helpers ────────────────────────────────────────────

function priorityBadgeClass(priority: string): string {
  switch (priority) {
    case "critical": return "border-red-500/50 bg-red-500/10 text-red-400";
    case "high":     return "border-amber-500/50 bg-amber-500/10 text-amber-400";
    case "medium":   return "border-blue-500/50 bg-blue-500/10 text-blue-400";
    default:         return "border-zinc-600 bg-zinc-800 text-zinc-400";
  }
}

function performanceRatingColor(rating: number): string {
  if (rating >= 70) return "text-emerald-400";
  if (rating >= 40) return "text-amber-400";
  return "text-red-400";
}

function moraleEmoji(morale: number): string {
  if (morale >= 75) return "😊";
  if (morale >= 50) return "😐";
  if (morale >= 25) return "😕";
  return "😞";
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

// ─── component ────────────────────────────────────────────────────────────────

export function Dashboard() {
  const {
    gameState,
    setScreen,
    getUpcomingFixtures,
    getLeagueStandings,
    requestWeekAdvance,
    scheduleMatch,
    markMessageRead,
    selectPlayer,
    submitLoanMonitoringReport,
  } = useGameStore(useShallow((state) => ({
    gameState: state.gameState,
    setScreen: state.setScreen,
    getUpcomingFixtures: state.getUpcomingFixtures,
    getLeagueStandings: state.getLeagueStandings,
    requestWeekAdvance: state.requestWeekAdvance,
    scheduleMatch: state.scheduleMatch,
    markMessageRead: state.markMessageRead,
    selectPlayer: state.selectPlayer,
    submitLoanMonitoringReport: state.submitLoanMonitoringReport,
  })));
  const [expandedExpenses, setExpandedExpenses] = useState(false);
  const [showSatisfactionHistory, setShowSatisfactionHistory] = useState(false);
  const t = useTranslations("dashboard");
  const tCal = useTranslations("calendar");

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

  if (!gameState) return null;

  const { scout, currentWeek, currentSeason } = gameState;
  const seasonLength = getSeasonLength(gameState.fixtures, currentSeason);
  const upcoming = scout.primarySpecialization !== "youth"
    ? getUpcomingFixtures(currentWeek, 8)
    : [];
  const thisWeekFixtures = upcoming.filter((f) => f.week === currentWeek);
  const unreadMessages = gameState.inbox.filter((m) => !m.read);

  // Board satisfaction history -- most recent 5 entries
  const satisfactionHistory = (gameState.satisfactionHistory ?? []).slice(-5);
  const hasMultipleCountries = gameState.countries.length > 1;
  const { travelBooking } = scout;

  // Phase 2: finances
  const { finances } = gameState;
  const broke = finances ? isBroke(finances) : false;
  const totalExpenses = finances
    ? Object.values(finances.expenses).reduce((s, v) => s + v, 0)
    : 0;

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

  const scheduleActivities = gameState.schedule.activities ?? [];
  const scheduledSlots = scheduleActivities.filter((activity) => activity !== null).length;
  const plannedActivities: Array<{
    key: string;
    dayIndex: number;
    description: string;
    slots: number;
  }> = [];
  const seenScheduleInstances = new Set<string>();
  scheduleActivities.forEach((activity, dayIndex) => {
    if (!activity) return;
    const key = activity.instanceId ?? `${activity.type}-${activity.targetId ?? "none"}-${dayIndex}`;
    if (seenScheduleInstances.has(key)) return;
    seenScheduleInstances.add(key);
    plannedActivities.push({
      key,
      dayIndex,
      description: activity.description,
      slots: activity.slots,
    });
  });

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
  const dueRecommendationReviews = Object.values(gameState.recommendationReviews ?? {}).filter(
    (review) => review.status === "complete"
      && review.completedSeason === currentSeason
      && review.completedWeek === currentWeek,
  );
  const matchForBrief = (brief: (typeof openRecruitmentBriefs)[number]) => observedYouthEvidence
    .filter((entry) =>
      !entry.youth.placed
      && entry.youth.player.age <= brief.maxAge
      && (
        brief.requiredPositions.includes(entry.youth.player.position)
        || entry.youth.player.secondaryPositions.some((position) => brief.requiredPositions.includes(position))
      )
    )
    .sort(sortYouthByEvidence)[0];
  const nextTournament = Object.values(gameState.youthTournaments ?? {})
    .filter(
      (tournament) =>
        tournament.discovered &&
        !tournament.attended &&
        tournament.season === currentSeason &&
        tournament.endWeek >= currentWeek,
    )
    .sort((a, b) => a.startWeek - b.startWeek)[0];
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
            description: "Run the itinerary, collect what the week reveals, then turn those observations into a decision.",
            label: "Advance week",
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
    requestWeekAdvance();
  }

  if (IS_YOUTH_EARLY_ACCESS && specialization === "youth") {
    const club = scout.currentClubId ? gameState.clubs[scout.currentClubId] : undefined;
    const deskProspects = (evidenceQueue.length > 0 ? evidenceQueue : observedYouthEvidence).slice(0, 4);
    const loopSteps = [
      { label: "Find", detail: "Discover a lead", complete: youthDiscoveredCount > 0 },
      { label: "Verify", detail: "Build repeat evidence", complete: multiViewCount > 0 },
      { label: "Recommend", detail: "Back your judgment", complete: youthReportedCount > 0 },
      { label: "Track", detail: "Follow the outcome", complete: placedYouthCount > 0 },
    ];

    return (
      <GameLayout>
        <section
          className="relative min-h-screen overflow-hidden px-4 py-5 sm:px-6 lg:px-8 lg:py-7"
          data-tutorial-id="dashboard-overview"
        >
          <ScreenBackground src="/images/backgrounds/dashboard-office.png" opacity={0.9} />
          <div className="relative z-10 mx-auto max-w-[1480px]">
            <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex items-center gap-3" data-tutorial-id="dashboard-club-header">
                <ScoutAvatar avatarId={scout.avatarId ?? 1} size={48} />
                {club && <ClubCrest clubId={club.id} clubName={club.name} size={48} />}
                <div className="min-w-0">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
                    Youth recruitment room
                  </p>
                  <h1 className="truncate text-2xl font-bold tracking-tight text-white sm:text-3xl">
                    Scouting Desk
                  </h1>
                  <p className="mt-1 text-sm text-zinc-300">
                    {club?.name ?? "Independent assignment"} · Week {currentWeek}, Season {currentSeason}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-semibold ${phaseClass[seasonPhase]}`}>
                  {tCal(`seasonPhases.${seasonPhase}` as Parameters<typeof tCal>[0])}
                </span>
                <Button className="min-h-11" variant="outline" onClick={() => setScreen("calendar")}>
                  <Calendar size={16} className="mr-2" aria-hidden="true" />
                  Planner
                </Button>
                <Button className="min-h-11 border border-white/10 bg-white/5 text-white hover:bg-white/10" variant="secondary" onClick={() => requestWeekAdvance()}>
                  Advance Week
                </Button>
              </div>
            </header>

            <Card className="relative mb-5 overflow-hidden border-emerald-400/25 bg-[#101820]/95 shadow-2xl shadow-black/30">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(52,211,153,0.14),transparent_36%)]" aria-hidden="true" />
              <CardContent className="relative grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)] lg:p-8">
                <div>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <Badge className="border-emerald-400/30 bg-emerald-400/10 text-emerald-200" variant="outline">
                      {youthDeskAction.eyebrow}
                    </Badge>
                    {scheduledSlots > 0 && (
                      <span className="text-xs text-zinc-300">{scheduledSlots}/7 days committed</span>
                    )}
                  </div>
                  <h2 className="max-w-3xl text-2xl font-bold leading-tight text-white sm:text-3xl lg:text-4xl">
                    {youthDeskAction.title}
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300 sm:text-base">
                    {youthDeskAction.description}
                  </p>
                  <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                    <Button className="min-h-11 px-5" onClick={openYouthDeskAction}>
                      {youthDeskAction.label}
                      <ArrowRight size={16} className="ml-2" aria-hidden="true" />
                    </Button>
                    {youthDeskAction.kind !== "planner" && (
                      <Button className="min-h-11" variant="outline" onClick={() => setScreen("calendar")}>
                        Review itinerary
                      </Button>
                    )}
                  </div>
                  <p className="mt-4 text-xs leading-5 text-zinc-400">
                    Advancing resolves every scheduled activity. Unused days produce no evidence and cannot be recovered.
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-4 sm:p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">The scout&apos;s loop</p>
                      <p className="mt-1 text-sm text-zinc-200">Every name must earn the next step.</p>
                    </div>
                    <Target size={20} className="text-emerald-300" aria-hidden="true" />
                  </div>
                  <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
                    {loopSteps.map((step, index) => (
                      <li
                        key={step.label}
                        className={`rounded-lg border p-3 ${
                          step.complete
                            ? "border-emerald-400/30 bg-emerald-400/10"
                            : "border-white/10 bg-white/[0.025]"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                            step.complete ? "bg-emerald-300 text-zinc-950" : "bg-zinc-700 text-zinc-200"
                          }`}>
                            {step.complete ? "✓" : index + 1}
                          </span>
                          <span className="text-xs font-semibold text-white">{step.label}</span>
                        </div>
                        <p className="mt-2 text-[11px] leading-4 text-zinc-400">{step.detail}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              </CardContent>
            </Card>

            {gameState.seasonEvents.length > 0 && (
              <div className="mb-5">
                <SeasonTimeline
                  seasonEvents={gameState.seasonEvents}
                  currentWeek={currentWeek}
                  seasonLength={seasonLength}
                  onResolveEvent={(eventId, choiceIndex) => {
                    useGameStore.getState().resolveSeasonEvent(eventId, choiceIndex);
                  }}
                />
              </div>
            )}

            <section aria-label="Youth pipeline snapshot" className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                { label: "Known prospects", value: youthDiscoveredCount, detail: `${youthList.length} in your active world`, icon: Users, tone: "text-emerald-300" },
                { label: "Repeat looks", value: multiViewCount, detail: `${firmReadCount} with a firm read`, icon: Eye, tone: "text-sky-300" },
                { label: "Decisions ready", value: decisionReadyYouth.length, detail: `${pendingPlacementCount} awaiting club response`, icon: ClipboardList, tone: "text-amber-300" },
                { label: "Placed", value: placedYouthCount, detail: `${gameState.legacyScore.totalScore} legacy points`, icon: Trophy, tone: "text-violet-300" },
              ].map(({ label, value, detail, icon: Icon, tone }) => (
                <Card key={label} className="border-white/10 bg-[#11161c]/90 shadow-lg shadow-black/10">
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">{label}</p>
                        <p className="mt-1 text-2xl font-bold text-white sm:text-3xl">{value}</p>
                      </div>
                      <Icon size={19} className={tone} aria-hidden="true" />
                    </div>
                    <p className="mt-2 text-xs text-zinc-400">{detail}</p>
                  </CardContent>
                </Card>
              ))}
            </section>

            <Card className="mb-5 overflow-hidden border-sky-400/20 bg-[linear-gradient(135deg,rgba(14,116,144,0.12),rgba(17,22,28,0.96)_42%)]">
              <CardHeader className="flex-row items-start justify-between gap-4 space-y-0 p-5 pb-3 sm:p-6 sm:pb-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base text-white">
                    <ClipboardList size={18} className="text-sky-300" aria-hidden="true" />
                    Live academy briefs
                  </CardTitle>
                  <p className="mt-1 text-sm text-zinc-400">Real club needs create the deadline, audience, budget, and risk behind each recommendation.</p>
                </div>
                <Badge variant="secondary" className="shrink-0">{openRecruitmentBriefs.length} open</Badge>
              </CardHeader>
              <CardContent className="p-5 pt-2 sm:p-6 sm:pt-2">
                {openRecruitmentBriefs.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-zinc-400">The current brief cycle is closed. New academy needs will arrive as club squads and deadlines change.</p>
                ) : (
                  <div className="grid gap-3 lg:grid-cols-3">
                    {openRecruitmentBriefs.slice(0, 3).map((brief) => {
                      const match = matchForBrief(brief);
                      const receivingClub = gameState.clubs[brief.clubId];
                      const recruitmentIdentity = receivingClub
                        ? deriveBriefRecruitmentIdentity(receivingClub, brief)
                        : undefined;
                      return (
                        <article key={brief.id} className="flex min-h-48 flex-col rounded-xl border border-white/10 bg-black/20 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-300">{receivingClub?.name ?? "Academy client"}</p>
                              <h3 className="mt-1 text-lg font-bold text-white">{brief.requiredPositions.join("/")} pathway</h3>
                            </div>
                            <Badge variant={brief.competitionPressure >= 70 ? "warning" : "outline"} className="text-[10px]">
                              {brief.competitionPressure} pressure
                            </Badge>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-zinc-300">
                            <span className="rounded-full border border-white/10 px-2 py-1">S{brief.expiresSeason} W{brief.expiresWeek}</span>
                            <span className="rounded-full border border-white/10 px-2 py-1">£{brief.weeklyWageBudget.toLocaleString()}/wk</span>
                            <span className="rounded-full border border-white/10 px-2 py-1 capitalize">{brief.riskTolerance} risk</span>
                          </div>
                          {recruitmentIdentity && (
                            <p className="mt-3 rounded-lg border border-sky-400/15 bg-sky-400/[0.06] px-3 py-2 text-[11px] leading-4 text-sky-100">
                              <span className="font-semibold">{recruitmentIdentity.label}:</span>{" "}
                              this brief weights {brief.developmentPriority.replace(/([A-Z])/g, " $1").toLowerCase()}.
                            </p>
                          )}
                          <p className="mt-3 flex-1 text-xs leading-5 text-zinc-400">
                            {match
                              ? `${match.youth.player.firstName} ${match.youth.player.lastName} is your best known positional match with ${match.observationCount} live look${match.observationCount === 1 ? "" : "s"}.`
                              : "No known prospect currently matches this profile. Finding one now could create first-mover advantage."}
                          </p>
                          <Button
                            className="mt-4 min-h-11 w-full"
                            variant={match ? "outline" : "secondary"}
                            onClick={() => {
                              if (match) {
                                selectPlayer(match.youth.player.id);
                                setScreen("playerProfile");
                              } else {
                                setScreen("calendar");
                              }
                            }}
                          >
                            {match ? "Open matching dossier" : "Plan discovery work"}
                          </Button>
                        </article>
                      );
                    })}
                  </div>
                )}
                {dueRecommendationReviews.length > 0 && (
                  <button
                    onClick={() => setScreen("reportHistory")}
                    className="mt-3 flex min-h-11 w-full items-center justify-between rounded-xl border border-violet-400/25 bg-violet-400/10 px-4 text-left text-sm text-violet-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
                  >
                    <span>{dueRecommendationReviews.length} long-term recommendation review{dueRecommendationReviews.length === 1 ? "" : "s"} completed this week.</span>
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.8fr)]">
              <div className="space-y-5">
                <Card className="border-white/10 bg-[#11161c]/95">
                  <CardHeader className="flex-row items-start justify-between gap-4 space-y-0 p-5 pb-3 sm:p-6 sm:pb-3">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base text-white">
                        <CalendarPlus size={18} className="text-emerald-300" aria-hidden="true" />
                        This week&apos;s itinerary
                      </CardTitle>
                      <p className="mt-1 text-sm text-zinc-400">Your plan is the strategy; simulation reveals the consequences.</p>
                    </div>
                    <Button className="min-h-11 shrink-0" size="sm" variant="outline" onClick={() => setScreen("calendar")}>
                      Edit plan
                    </Button>
                  </CardHeader>
                  <CardContent className="p-5 pt-2 sm:p-6 sm:pt-2">
                    {plannedActivities.length === 0 ? (
                      <button
                        onClick={() => setScreen("calendar")}
                        className="flex min-h-28 w-full flex-col items-center justify-center rounded-xl border border-dashed border-emerald-400/30 bg-emerald-400/[0.04] p-5 text-center transition hover:bg-emerald-400/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
                      >
                        <CalendarPlus size={24} className="mb-2 text-emerald-300" aria-hidden="true" />
                        <span className="font-semibold text-white">Your week is still blank</span>
                        <span className="mt-1 text-sm text-zinc-400">Schedule a venue, follow-up, report, or recovery day.</span>
                      </button>
                    ) : (
                      <ol className="space-y-2">
                        {plannedActivities.slice(0, 6).map((item) => (
                          <li key={item.key} className="flex min-h-14 items-center gap-3 rounded-lg border border-white/10 bg-white/[0.025] px-3 py-2.5">
                            <span className="flex h-9 w-11 shrink-0 items-center justify-center rounded-md bg-zinc-800 text-xs font-bold text-emerald-300">
                              {DAY_NAMES[item.dayIndex]}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-white">{item.description}</p>
                              <p className="mt-0.5 text-xs text-zinc-400">{item.slots} day{item.slots === 1 ? "" : "s"}</p>
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-white/10 bg-[#11161c]/95">
                  <CardHeader className="flex-row items-start justify-between gap-4 space-y-0 p-5 pb-3 sm:p-6 sm:pb-3">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base text-white">
                        <GraduationCap size={18} className="text-amber-300" aria-hidden="true" />
                        Priority prospects
                      </CardTitle>
                      <p className="mt-1 text-sm text-zinc-400">Ranked by evidence need—not hidden potential.</p>
                    </div>
                    <Button className="min-h-11 shrink-0" size="sm" variant="outline" onClick={() => setScreen("youthScouting")}>
                      Open pipeline
                    </Button>
                  </CardHeader>
                  <CardContent className="p-5 pt-2 sm:p-6 sm:pt-2">
                    {deskProspects.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-white/15 p-6 text-center">
                        <Compass size={24} className="mx-auto mb-2 text-zinc-400" aria-hidden="true" />
                        <p className="font-semibold text-white">No names on your board yet</p>
                        <p className="mt-1 text-sm text-zinc-400">Plan a youth event or local visit to create your first lead.</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-white/10">
                        {deskProspects.map((entry) => {
                          const status = entry.reported
                            ? "Recommendation filed"
                            : entry.hasFirmRead
                              ? "Decision ready"
                              : entry.observationCount >= 1
                                ? "Needs another context"
                                : "Unverified lead";
                          return (
                            <button
                              key={entry.youth.id}
                              onClick={() => {
                                selectPlayer(entry.youth.player.id);
                                setScreen("playerProfile");
                              }}
                              className="group flex min-h-16 w-full items-center gap-3 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
                              aria-label={`Open dossier for ${entry.youth.player.firstName} ${entry.youth.player.lastName}`}
                            >
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400/20 to-sky-400/10 font-bold text-emerald-200">
                                {entry.youth.player.firstName[0]}{entry.youth.player.lastName[0]}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="truncate text-sm font-semibold text-white group-hover:text-emerald-200">
                                    {entry.youth.player.firstName} {entry.youth.player.lastName}
                                  </p>
                                  <Badge variant="outline" className="border-white/15 text-[10px] text-zinc-300">
                                    {entry.youth.player.position}
                                  </Badge>
                                </div>
                                <p className="mt-1 text-xs text-zinc-400">
                                  Age {entry.youth.player.age} · {entry.observationCount} look{entry.observationCount === 1 ? "" : "s"} · Buzz {entry.youth.buzzLevel}
                                </p>
                              </div>
                              <div className="hidden text-right sm:block">
                                <p className={`text-xs font-semibold ${entry.hasFirmRead ? "text-amber-300" : "text-zinc-300"}`}>{status}</p>
                                <p className="mt-1 text-[10px] text-zinc-300">{entry.intelCount} contact note{entry.intelCount === 1 ? "" : "s"}</p>
                              </div>
                              <ChevronRight size={17} className="shrink-0 text-zinc-500 transition group-hover:translate-x-0.5 group-hover:text-emerald-300" aria-hidden="true" />
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <aside className="space-y-5" aria-label="Scouting context">
                <Card className="border-amber-400/20 bg-[#151711]/95">
                  <CardHeader className="p-5 pb-3">
                    <CardTitle className="flex items-center gap-2 text-base text-white">
                      <Star size={17} className="text-amber-300" aria-hidden="true" />
                      Opportunity radar
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-5 pt-1">
                    {nextTournament ? (
                      <>
                        <Badge className="mb-3 border-amber-400/25 bg-amber-400/10 text-amber-200" variant="outline">
                          {nextTournament.prestige} · {nextTournament.country}
                        </Badge>
                        <h3 className="text-lg font-bold text-white">{nextTournament.name}</h3>
                        <p className="mt-2 text-sm leading-6 text-zinc-300">
                          {nextTournament.startWeek <= currentWeek
                            ? "The event is live now. Attend before the window closes."
                            : `Starts in week ${nextTournament.startWeek}. Reserve time before another scout gets the first look.`}
                        </p>
                        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-lg bg-black/20 p-3">
                            <p className="text-zinc-400">Talent pool</p>
                            <p className="mt-1 font-semibold text-white">{nextTournament.poolSizeMultiplier.toFixed(1)}× field</p>
                          </div>
                          <div className="rounded-lg bg-black/20 p-3">
                            <p className="text-zinc-400">Observation</p>
                            <p className="mt-1 font-semibold text-white">+{nextTournament.observationBonus} bonus</p>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-sm leading-6 text-zinc-300">No verified tournament is demanding attention yet. Contacts and local familiarity reveal better opportunities over time.</p>
                      </>
                    )}
                    <Button className="mt-4 min-h-11 w-full" variant="outline" onClick={() => setScreen("calendar")}>
                      View planning opportunities
                    </Button>
                  </CardContent>
                </Card>

                <Card className="border-white/10 bg-[#11161c]/95">
                  <CardHeader className="flex-row items-center justify-between space-y-0 p-5 pb-3">
                    <CardTitle className="flex items-center gap-2 text-base text-white">
                      <Mail size={17} className="text-sky-300" aria-hidden="true" />
                      Inbox
                    </CardTitle>
                    {unreadMessages.length > 0 && <Badge variant="secondary">{unreadMessages.length} unread</Badge>}
                  </CardHeader>
                  <CardContent className="p-5 pt-1">
                    {unreadMessages.length === 0 ? (
                      <p className="text-sm text-zinc-400">You are caught up. New club responses and career events will appear here.</p>
                    ) : (
                      <div className="space-y-2">
                        {unreadMessages.slice(0, 3).map((message) => (
                          <button
                            key={message.id}
                            onClick={() => {
                              markMessageRead(message.id);
                              setScreen("inbox");
                            }}
                            className="min-h-14 w-full rounded-lg border border-white/10 bg-white/[0.025] p-3 text-left transition hover:border-sky-400/30 hover:bg-sky-400/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
                          >
                            <p className="line-clamp-1 text-sm font-semibold text-white">{message.title}</p>
                            <p className="mt-1 line-clamp-1 text-xs text-zinc-400">{message.body}</p>
                          </button>
                        ))}
                      </div>
                    )}
                    <Button className="mt-3 min-h-11 w-full" variant="ghost" onClick={() => setScreen("inbox")}>
                      Open inbox
                    </Button>
                  </CardContent>
                </Card>

                <Card className="border-white/10 bg-[#11161c]/95">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Scout condition</p>
                        <p className="mt-1 text-sm font-semibold text-white">Tier {scout.careerTier} · {Math.round(scout.reputation)} reputation</p>
                      </div>
                      <TrendingUp size={19} className="text-emerald-300" aria-hidden="true" />
                    </div>
                    <div className="mt-4">
                      <div className="mb-1.5 flex items-center justify-between text-xs">
                        <span className="text-zinc-400">Fatigue</span>
                        <span className={scout.fatigue >= 70 ? "font-semibold text-red-300" : scout.fatigue >= 40 ? "font-semibold text-amber-300" : "font-semibold text-emerald-300"}>
                          {Math.round(scout.fatigue)}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
                        <div
                          className={`h-full rounded-full ${scout.fatigue >= 70 ? "bg-red-400" : scout.fatigue >= 40 ? "bg-amber-400" : "bg-emerald-400"}`}
                          style={{ width: `${Math.min(100, Math.max(0, scout.fatigue))}%` }}
                        />
                      </div>
                    </div>
                    <Button className="mt-4 min-h-11 w-full" variant="outline" onClick={() => setScreen("career")}>
                      Open career development
                    </Button>
                  </CardContent>
                </Card>
              </aside>
            </div>
          </div>
        </section>
      </GameLayout>
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
            <Button onClick={() => requestWeekAdvance()}>Advance Week</Button>
          </div>
        </div>

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
            <InsightMeter insightState={scout.insightState as any} compact />
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
                      {formatMoney(finances.monthlyIncome)}
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
                        {Object.entries(finances.expenses)
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

        {/* ── Board Satisfaction (F10 — tier 5 only) ──────────────────────── */}
        {specialization === "firstTeam" && gameState.boardProfile && scout.careerTier >= 5 && (
          <div className="mt-6">
            <Card data-tutorial-id="dashboard-board-satisfaction">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Shield size={14} className="text-amber-400" aria-hidden="true" />
                  Board Satisfaction
                  <Badge
                    variant="outline"
                    className={`ml-auto text-[10px] capitalize ${
                      gameState.boardProfile.satisfactionLevel >= 80
                        ? "border-emerald-500/50 text-emerald-400"
                        : gameState.boardProfile.satisfactionLevel >= 50
                          ? "border-amber-500/50 text-amber-400"
                          : gameState.boardProfile.satisfactionLevel >= 25
                            ? "border-orange-500/50 text-orange-400"
                            : "border-red-500/50 text-red-400"
                    }`}
                  >
                    {gameState.boardProfile.personality}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Satisfaction bar */}
                <div>
                  <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
                    <span>Satisfaction</span>
                    <span>{Math.round(gameState.boardProfile.satisfactionLevel)}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        gameState.boardProfile.satisfactionLevel >= 80
                          ? "bg-emerald-500"
                          : gameState.boardProfile.satisfactionLevel >= 50
                            ? "bg-amber-500"
                            : gameState.boardProfile.satisfactionLevel >= 25
                              ? "bg-orange-500"
                              : "bg-red-500"
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, gameState.boardProfile.satisfactionLevel))}%` }}
                    />
                  </div>
                </div>
                {/* Patience bar */}
                <div>
                  <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
                    <span>Patience</span>
                    <span>{Math.round(gameState.boardProfile.patience)}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        gameState.boardProfile.patience >= 60
                          ? "bg-blue-500"
                          : gameState.boardProfile.patience >= 30
                            ? "bg-amber-500"
                            : "bg-red-500"
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, gameState.boardProfile.patience))}%` }}
                    />
                  </div>
                </div>
                {/* Budget multiplier */}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">Budget Multiplier</span>
                  <span className={
                    gameState.boardProfile.budgetMultiplier >= 1.2
                      ? "text-emerald-400 font-semibold"
                      : gameState.boardProfile.budgetMultiplier >= 0.9
                        ? "text-zinc-300"
                        : "text-red-400 font-semibold"
                  }>
                    {gameState.boardProfile.budgetMultiplier.toFixed(2)}x
                  </span>
                </div>
                {/* Ultimatum warning */}
                {gameState.boardProfile.ultimatumIssued && (
                  <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-2">
                    <AlertTriangle size={14} className="text-red-400 shrink-0" aria-hidden="true" />
                    <span className="text-xs text-red-400">
                      Ultimatum active{gameState.boardProfile.ultimatumDeadline
                        ? ` — deadline: week ${gameState.boardProfile.ultimatumDeadline}`
                        : ""}
                    </span>
                  </div>
                )}
                {/* Firing warning */}
                {gameState.boardProfile.satisfactionLevel < 20 && !gameState.boardProfile.ultimatumIssued && (
                  <div className="flex items-center gap-2 rounded-md border border-orange-500/30 bg-orange-500/10 p-2">
                    <AlertTriangle size={14} className="text-orange-400 shrink-0" aria-hidden="true" />
                    <span className="text-xs text-orange-400">
                      Board satisfaction dangerously low. Risk of termination.
                    </span>
                  </div>
                )}
                {/* Meet Board button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => setScreen("career")}
                >
                  <Users size={12} className="mr-1" aria-hidden="true" />
                  Open Board Relations
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── First-Team Scout Widgets ─────────────────────────────────────── */}
        {specialization === "firstTeam" && (activeDirectives.length > 0 || recentTransfers.length > 0) && (
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Active Directives */}
            {activeDirectives.length > 0 && (
              <Card data-tutorial-id="dashboard-directives">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Target size={14} className="text-blue-400" aria-hidden="true" />
                    Active Directives
                    <Badge variant="secondary" className="ml-auto text-[10px]">
                      {gameState.managerDirectives.filter((d) => !d.fulfilled).length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {activeDirectives.map((directive) => (
                    <div
                      key={directive.id}
                      className="rounded-md border border-[#27272a] p-3"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            variant="outline"
                            className={`text-[10px] capitalize shrink-0 ${priorityBadgeClass(directive.priority)}`}
                          >
                            {directive.priority}
                          </Badge>
                          <span className="text-sm font-semibold text-white">{directive.position}</span>
                        </div>
                        <span className="shrink-0 text-[10px] text-zinc-400">
                          {directive.submittedReportIds.length} report{directive.submittedReportIds.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-zinc-400">
                        <span>Age {directive.ageRange[0]}–{directive.ageRange[1]}</span>
                        <span className="text-zinc-400" aria-hidden="true">·</span>
                        <span>{directive.minCAStars}★ min</span>
                        <span className="text-zinc-400" aria-hidden="true">·</span>
                        <span className="text-emerald-400">
                          {directive.budgetAllocation >= 1_000_000
                            ? `£${(directive.budgetAllocation / 1_000_000).toFixed(1)}M`
                            : `£${(directive.budgetAllocation / 1_000).toFixed(0)}K`}
                        </span>
                      </div>
                    </div>
                  ))}
                  {gameState.managerDirectives.filter((d) => !d.fulfilled).length > 4 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs text-zinc-400 hover:text-white"
                      onClick={() => setScreen("career")}
                    >
                      View All
                      <ArrowRight size={12} className="ml-1" aria-hidden="true" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Transfer Tracker */}
            {recentTransfers.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <TrendingUp size={14} className="text-emerald-400" aria-hidden="true" />
                    Transfer Tracker
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {recentTransfers.map((record) => {
                    const player = gameState.players[record.playerId];
                    const fromClub = gameState.clubs[record.fromClubId];
                    const toClub = gameState.clubs[record.toClubId];
                    return (
                      <div key={record.id} className="rounded-md border border-[#27272a] p-3">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className="text-sm font-semibold text-white">
                            {player ? `${player.firstName} ${player.lastName}` : "Unknown Player"}
                          </p>
                          {record.outcome && (
                            <Badge
                              variant="outline"
                              className={`shrink-0 text-[10px] ${
                                record.outcome === "hit"
                                  ? "border-emerald-500/50 text-emerald-400"
                                  : record.outcome === "decent"
                                  ? "border-amber-500/50 text-amber-400"
                                  : record.outcome === "flop"
                                  ? "border-red-500/50 text-red-400"
                                  : "border-zinc-600 text-zinc-400"
                              }`}
                            >
                              {record.outcome}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-zinc-400">
                          {fromClub?.shortName ?? "?"} → {toClub?.shortName ?? "?"}
                          {record.fee > 0 && <span className="ml-1">· £{record.fee.toLocaleString()}</span>}
                        </p>
                        {record.appearances != null && (
                          <p className="mt-1 text-xs text-zinc-400">
                            {record.appearances} appearances · S{record.transferSeason}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ── Data Scout Widgets ────────────────────────────────────────────── */}
        {specialization === "data" && (
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Prediction Tracker */}
            <Card data-tutorial-id="dashboard-predictions">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Brain size={14} className="text-violet-400" aria-hidden="true" />
                  Prediction Tracker
                  {oracleBadge && (
                    <Badge
                      variant="outline"
                      className="ml-auto border-violet-500/50 bg-violet-500/10 text-violet-400 text-[10px]"
                    >
                      Oracle
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Summary */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-md border border-[#27272a] p-2 text-center">
                    <p className="text-lg font-bold text-white">{allPredictions.length}</p>
                    <p className="text-[10px] text-zinc-400">Total</p>
                  </div>
                  <div className="rounded-md border border-[#27272a] p-2 text-center">
                    <p className="text-lg font-bold text-emerald-400">{correctPredictions.length}</p>
                    <p className="text-[10px] text-zinc-400">Correct</p>
                  </div>
                  <div className="rounded-md border border-[#27272a] p-2 text-center">
                    <p className={`text-lg font-bold ${predictionAccuracy >= 70 ? "text-emerald-400" : predictionAccuracy >= 50 ? "text-amber-400" : "text-red-400"}`}>
                      {resolvedPredictions.length > 0 ? `${predictionAccuracy}%` : "—"}
                    </p>
                    <p className="text-[10px] text-zinc-400">Accuracy</p>
                  </div>
                </div>
                {currentStreak > 0 && (
                  <p className="text-xs text-amber-400 font-medium">
                    {currentStreak} correct in a row
                  </p>
                )}

                {/* Recent unresolved predictions */}
                {unresolvedPredictions.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Pending</p>
                    {unresolvedPredictions.map((pred) => {
                      const player = gameState.players[pred.playerId];
                      return (
                        <div key={pred.id} className="rounded-md border border-[#27272a] p-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-white truncate">
                              {player ? `${player.firstName} ${player.lastName}` : "Unknown"}
                            </span>
                            <Badge variant="outline" className="shrink-0 text-[9px] capitalize">
                              {pred.type}
                            </Badge>
                          </div>
                          <p className="mt-0.5 text-[10px] text-zinc-400 line-clamp-1">{pred.statement}</p>
                          <p className="text-[9px] text-zinc-300">Resolves S{pred.resolveBySeason}</p>
                        </div>
                      );
                    })}
                  </div>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs text-zinc-400 hover:text-white"
                  onClick={() => setScreen("career")}
                >
                  View All
                  <ArrowRight size={12} className="ml-1" aria-hidden="true" />
                </Button>
              </CardContent>
            </Card>

            {/* Analytics Team */}
            <Card data-tutorial-id="dashboard-data-analysts">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Users size={14} className="text-blue-400" aria-hidden="true" />
                  Analytics Team
                  <Badge variant="secondary" className="ml-auto text-[10px]">
                    {dataAnalysts.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {dataAnalysts.length === 0 ? (
                  <p className="text-xs text-zinc-400">No analysts hired. Recruit analysts to generate passive reports.</p>
                ) : (
                  dataAnalysts.map((analyst) => {
                    const assignedLeague = analyst.assignedLeagueId
                      ? gameState.leagues[analyst.assignedLeagueId]
                      : undefined;
                    return (
                      <div key={analyst.id} className="rounded-md border border-[#27272a] p-3">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="text-sm font-medium text-white">{analyst.name}</span>
                          <span
                            className="text-base"
                            role="img"
                            aria-label={`Morale: ${analyst.morale}/100`}
                          >
                            {moraleEmoji(analyst.morale)}
                          </span>
                        </div>
                        <div className="mb-1 flex items-center justify-between text-[10px]">
                          <span className="text-zinc-400">Skill {analyst.skill}/20</span>
                          <span className="text-zinc-400 capitalize">{analyst.focus}</span>
                        </div>
                        <div className="h-1 w-full overflow-hidden rounded-full bg-[#27272a]">
                          <div
                            className="h-full rounded-full bg-blue-500 transition-all"
                            style={{ width: `${(analyst.skill / 20) * 100}%` }}
                          />
                        </div>
                        <p className="mt-1 text-[10px] text-zinc-400">
                          {assignedLeague ? assignedLeague.name : "Unassigned"}
                        </p>
                      </div>
                    );
                  })
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs text-zinc-400 hover:text-white"
                  onClick={() => setScreen("career")}
                >
                  Manage
                  <ArrowRight size={12} className="ml-1" aria-hidden="true" />
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Issue 13: Quick Links */}
        <div className="mt-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Quick Links</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => setScreen("discoveries")}
                  className="flex items-center gap-2 rounded-lg border border-[#27272a] bg-[#141414] px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 hover:text-white"
                >
                  <Compass size={15} className="text-emerald-400" aria-hidden="true" />
                  Discoveries
                </button>
                {!IS_YOUTH_EARLY_ACCESS && (
                  <>
                    <button
                      onClick={() => setScreen("leaderboard")}
                      className="flex items-center gap-2 rounded-lg border border-[#27272a] bg-[#141414] px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 hover:text-white"
                    >
                      <Trophy size={15} className="text-amber-400" aria-hidden="true" />
                      Leaderboard
                    </button>
                    <button
                      onClick={() => setScreen("analytics")}
                      className="flex items-center gap-2 rounded-lg border border-[#27272a] bg-[#141414] px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 hover:text-white"
                    >
                      <BarChart3 size={15} className="text-blue-400" aria-hidden="true" />
                      Analytics
                    </button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── T8.6: Rival scouts section ───────────────────────────────────── */}
        {!IS_YOUTH_EARLY_ACCESS && hasRivals && (
          <div className="mt-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Shield size={14} className="text-red-400" aria-hidden="true" />
                  Rival Scouts Activity
                  <Badge variant="secondary" className="ml-auto text-[10px]">
                    {rivalScouts.length} rival{rivalScouts.length !== 1 ? "s" : ""}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {rivalScouts.map((rival) => {
                    const rivalClub = gameState.clubs[rival.clubId];
                    const rivalLeague = rivalClub ? gameState.leagues[rivalClub.leagueId] : undefined;
                    return (
                      <div
                        key={rival.id}
                        className="rounded-lg border border-[#27272a] bg-[#141414] p-3"
                      >
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-white">
                              {rival.name}
                            </p>
                            <p className="text-xs text-zinc-400">
                              {rivalClub?.shortName ?? "Unknown Club"}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <Badge
                              variant={threatBadgeVariant(rival.quality)}
                              className="shrink-0 text-[10px]"
                            >
                              {threatLabel(rival.quality)}
                            </Badge>
                            <Badge variant="outline" className="shrink-0 text-[9px] text-zinc-400 border-zinc-700">
                              {rival.specialization === "firstTeam" ? "First Team"
                               : rival.specialization === "youth" ? "Youth"
                               : rival.specialization === "regional" ? "Regional"
                               : "Data"}
                            </Badge>
                          </div>
                        </div>

                        {/* Quality stars */}
                        <div className="mb-2 flex items-center gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              size={10}
                              aria-hidden="true"
                              className={
                                i < rival.quality
                                  ? "text-amber-400 fill-amber-400"
                                  : "text-zinc-700"
                              }
                            />
                          ))}
                        </div>

                        {rivalLeague && (
                          <p className="text-[10px] text-zinc-400">
                            Active in {rivalLeague.name}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
        {/* League Standings with Relegation/Promotion Zones */}
        {!IS_YOUTH_EARLY_ACCESS && (
          <div className="mt-6">
            <LeagueStandingsWidget />
          </div>
        )}

        {/* Active Loans */}
        {relevantActiveLoans.length > 0 && (
          <div className="mt-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Eye size={14} className="text-sky-400" />
                  Active Loans
                  <Badge variant="outline" className="ml-auto text-[10px]">
                    {relevantActiveLoans.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {relevantActiveLoans.slice(0, 8).map((deal) => {
                  const loanPlayer = gameState.players[deal.playerId];
                  const parentClub = gameState.clubs[deal.parentClubId];
                  const loanClub = gameState.clubs[deal.loanClubId];
                  const perf = deal.performanceRecord;
                  const monitoredThisWeek = (deal.monitoringWeeks ?? []).includes(
                    `${gameState.currentSeason}:${gameState.currentWeek}`,
                  );
                  if (!loanPlayer) return null;
                  return (
                    <div
                      key={deal.id}
                      className="flex items-center justify-between rounded-md border border-[#27272a] bg-[#141414] px-3 py-2 text-xs cursor-pointer hover:border-sky-500/30"
                      onClick={() => {
                        selectPlayer(deal.playerId);
                        setScreen("playerProfile");
                      }}
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-zinc-200 truncate">
                          {loanPlayer.firstName} {loanPlayer.lastName}
                          <span className="ml-1 text-zinc-400">({loanPlayer.age})</span>
                        </p>
                        <p className="text-[10px] text-zinc-400 truncate">
                          {parentClub?.name ?? "?"} → {loanClub?.name ?? "?"}
                          {" · "}Ends S{deal.endSeason} W{deal.endWeek}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {perf && (
                          <>
                            <span className="text-zinc-400">{perf.appearances} apps</span>
                            {perf.avgRating > 0 && (
                              <span className={perf.avgRating >= 7 ? "text-emerald-400" : perf.avgRating >= 6 ? "text-amber-400" : "text-red-400"}>
                                {perf.avgRating.toFixed(1)}
                              </span>
                            )}
                            {perf.developmentDelta !== 0 && (
                              <span className={perf.developmentDelta > 0 ? "text-emerald-400" : "text-red-400"}>
                                {perf.developmentDelta > 0 ? "+" : ""}{perf.developmentDelta} CA
                              </span>
                            )}
                          </>
                        )}
                        {(deal.scoutId === gameState.scout.id ||
                          deal.parentClubId === gameState.scout.currentClubId ||
                          deal.loanClubId === gameState.scout.currentClubId) && (
                          <button
                            className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400 hover:border-sky-500/40 hover:text-sky-400 transition"
                            disabled={monitoredThisWeek}
                            title={monitoredThisWeek ? "Monitoring report already filed this week" : "Submit monitoring report"}
                            onClick={(e) => {
                              e.stopPropagation();
                              submitLoanMonitoringReport(deal.id);
                            }}
                          >
                            <ClipboardList size={10} className="inline mr-0.5" />
                            {monitoredThisWeek ? "Monitored" : "Monitor"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        )}
        </div>
      </div>
    </GameLayout>
  );
}
