"use client";

import { useState } from "react";
import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Briefcase,
  TrendingUp,
  Star,
  AlertTriangle,
  CheckCircle,
  Users,
  Wrench,
  BookOpen,
  Lock,
  Target,
  Brain,
  ArrowRight,
  ChevronRight,
  TrendingDown,
  Minus,
  BarChart3,
  Shield,
  Swords,
  Trophy,
  Building2,
} from "lucide-react";
import { HelpTooltip } from "@/components/ui/HelpTooltip";
import type {
  DiscoveryRecord,
  JobOffer,
  PerformanceReview,
  ScoutSkill,
  ScoutAttribute,
  Specialization,
  ManagerMeetingApproach,
  BoardMeetingApproach,
  Scout,
} from "@/engine/core/types";
import { MASTERY_PERKS, checkMasteryPerkUnlocks } from "@/engine/specializations/masteryPerks";
import { TOOL_DEFINITIONS, getToolDefinition, getActiveToolBonuses } from "@/engine/tools/index";
// EquipmentPanel now has its own dedicated screen
import { Tooltip } from "@/components/ui/tooltip";
import { ScoutAvatar } from "@/components/game/ScoutAvatar";
import { canChooseIndependentPath } from "@/engine/career/pathChoice";
import { COURSE_CATALOG } from "@/engine/career/courses";
import { calculatePreferenceAlignment } from "@/engine/analytics/dataTension";
import {
  getBoardMeetingEligibility,
  getManagerMeetingEligibility,
} from "@/engine/career/politicalMeetings";
import { LIFESTYLE_TIERS } from "@/engine/finance/lifestyle";
import type { CareerPath, LifestyleLevel } from "@/engine/core/types";
import { ScreenBackground } from "@/components/ui/screen-background";
import {
  formatRunFingerprint,
  getWorldTraitDefinitions,
} from "@/engine/run";
import { ConsequenceCinema } from "./consequence-cinema/ConsequenceCinema";
import { LeadershipPortfolioPanel } from "./career/LeadershipPortfolioPanel";
import { CareerRecoveryPanel } from "./career/CareerRecoveryPanel";
import { WorldConditionPanel } from "./career/WorldConditionPanel";
import { getPlayerFacingDiscoverySummaries } from "@/engine/career/playerFacingDiscovery";
import {
  TOTAL_ACHIEVEMENT_COUNT,
  useAchievementStore,
} from "@/stores/achievementStore";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { isAchievementAvailableForBuild } from "@/stores/gameScreenScope";
import {
  CAREER_FINANCE_DRILLDOWN,
  CAREER_RECORD_DRILLDOWNS,
} from "./career/careerDrilldowns";
import { PoliticalMeetingCards } from "./career/PoliticalMeetingCards";

// ─── Labels ──────────────────────────────────────────────────────────────────

const SKILL_LABELS: Record<ScoutSkill, string> = {
  technicalEye: "Technical Eye",
  physicalAssessment: "Physical Assessment",
  psychologicalRead: "Psychological Read",
  tacticalUnderstanding: "Tactical Understanding",
  dataLiteracy: "Data Literacy",
  playerJudgment: "Player Judgment",
  potentialAssessment: "Potential Assessment",
};

const ATTRIBUTE_LABELS: Record<ScoutAttribute, string> = {
  networking: "Networking",
  persuasion: "Persuasion",
  endurance: "Endurance",
  adaptability: "Adaptability",
  memory: "Memory",
  intuition: "Intuition",
};

const TIER_LABELS: Record<number, string> = {
  1: "Freelance Scout",
  2: "Part-Time Regional Scout",
  3: "Full-Time Club Scout",
  4: "Head of Scouting",
  5: "Director of Football",
};

const SPEC_LABELS: Record<string, string> = {
  youth: "Youth Scout",
  firstTeam: "First Team Scout",
  regional: "Regional Expert",
  data: "Data Scout",
};

type CareerWorkspaceTab = "overview" | "development" | "trackRecord" | "finances";

interface CareerMetricTileProps {
  label: string;
  value: string;
  helper?: string;
  tone?: "default" | "emerald" | "amber" | "blue" | "red";
}

interface CareerTimelineEntry {
  id: string;
  season: number;
  week: number;
  label: string;
  title: string;
  description: string;
  tone: "default" | "emerald" | "amber" | "blue" | "red";
}

const CAREER_TAB_ITEMS: Array<{ value: CareerWorkspaceTab; label: string }> = [
  { value: "overview", label: "Overview" },
  { value: "development", label: "Development" },
  { value: "trackRecord", label: "Track Record" },
  { value: "finances", label: "Finances" },
];

// ─── Formatters ──────────────────────────────────────────────────────────────

function formatSalary(salary: number): string {
  if (salary >= 1000) return `£${(salary / 1000).toFixed(1)}K/wk`;
  return `£${salary}/wk`;
}

function formatSavings(savings: number): string {
  if (savings >= 1_000_000) return `£${(savings / 1_000_000).toFixed(2)}M`;
  if (savings >= 1_000) return `£${(savings / 1_000).toFixed(0)}K`;
  return `£${savings}`;
}

function formatBalance(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}£${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}£${(abs / 1_000).toFixed(0)}K`;
  return `${sign}£${abs}`;
}

function formatWeekSeason(season: number, week: number): string {
  return `S${season} W${week}`;
}

function formatExpenseLabel(label: string): string {
  return label
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase());
}

function formatMovementLabel(type: string): string {
  switch (type) {
    case "permanentTransfer":
      return "Transfer";
    case "loanStart":
      return "Loan move";
    case "loanReturn":
      return "Loan return";
    case "loanRecall":
      return "Loan recall";
    case "loanBuyOption":
      return "Loan option";
    case "release":
      return "Released";
    case "freeAgentSigning":
      return "Free signing";
    case "contractRenewal":
      return "Renewed";
    case "retirement":
      return "Retired";
    case "footballExit":
      return "Exited football";
    case "youthSigning":
      return "Academy intake";
    default:
      return type.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
  }
}

function metricToneClass(tone: CareerMetricTileProps["tone"]): string {
  switch (tone) {
    case "emerald":
      return "text-emerald-300";
    case "amber":
      return "text-amber-300";
    case "blue":
      return "text-blue-300";
    case "red":
      return "text-red-300";
    default:
      return "text-white";
  }
}

function timelineToneClasses(tone: CareerTimelineEntry["tone"]): string {
  switch (tone) {
    case "emerald":
      return "border-emerald-500/30 bg-emerald-500/8";
    case "amber":
      return "border-amber-500/30 bg-amber-500/8";
    case "blue":
      return "border-blue-500/30 bg-blue-500/8";
    case "red":
      return "border-red-500/30 bg-red-500/8";
    default:
      return "border-[#27272a] bg-black/20";
  }
}

function CareerMetricTile({
  label,
  value,
  helper,
  tone = "default",
}: CareerMetricTileProps) {
  return (
    <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </p>
      <p className={`mt-2 text-xl font-semibold ${metricToneClass(tone)}`}>{value}</p>
      {helper && <p className="mt-1 text-xs text-zinc-400">{helper}</p>}
    </div>
  );
}

// ─── Outcome helpers ─────────────────────────────────────────────────────────

function outcomeColor(outcome: PerformanceReview["outcome"]): string {
  switch (outcome) {
    case "promoted": return "text-emerald-400";
    case "retained": return "text-blue-400";
    case "warning":  return "text-amber-400";
    case "fired":    return "text-red-400";
  }
}

function outcomeIcon(outcome: PerformanceReview["outcome"]) {
  switch (outcome) {
    case "promoted":
      return <TrendingUp size={14} className="text-emerald-400" aria-hidden="true" />;
    case "retained":
      return <CheckCircle size={14} className="text-blue-400" aria-hidden="true" />;
    case "warning":
      return <AlertTriangle size={14} className="text-amber-400" aria-hidden="true" />;
    case "fired":
      return <AlertTriangle size={14} className="text-red-400" aria-hidden="true" />;
  }
}

// ─── JobOfferCard ─────────────────────────────────────────────────────────────

interface JobOfferCardProps {
  offer: JobOffer;
  clubName: string;
  onAccept: () => void;
  onDecline: () => void;
}

function JobOfferCard({ offer, clubName, onAccept, onDecline }: JobOfferCardProps) {
  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <p className="font-semibold text-white">{clubName}</p>
          <p className="text-sm text-zinc-400">{offer.role}</p>
        </div>
        <Badge variant="secondary">Tier {offer.tier}</Badge>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-zinc-500">Salary: </span>
          <span className="text-emerald-400 font-semibold">{formatSalary(offer.salary)}</span>
        </div>
        <div>
          <span className="text-zinc-500">Contract: </span>
          <span className="text-white">
            {offer.contractLength} season{offer.contractLength !== 1 ? "s" : ""}
          </span>
        </div>
        {offer.territory && (
          <div className="col-span-2">
            <span className="text-zinc-500">Territory: </span>
            <span className="text-white">{offer.territory}</span>
          </div>
        )}
        <div className="col-span-2">
          <span className="text-zinc-500">Expires: </span>
          <span className="text-amber-400">Week {offer.expiresWeek}</span>
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" className="flex-1" onClick={onAccept}>
          Accept
        </Button>
        <Button size="sm" variant="outline" className="flex-1" onClick={onDecline}>
          Decline
        </Button>
      </div>
    </div>
  );
}

// ─── CareerScreen ─────────────────────────────────────────────────────────────

export function CareerScreen() {
  const gameState = useGameStore((state) => state.gameState);
  const acceptJob = useGameStore((state) => state.acceptJob);
  const declineJob = useGameStore((state) => state.declineJob);
  const getClub = useGameStore((state) => state.getClub);
  const setScreen = useGameStore((state) => state.setScreen);
  const selectPlayer = useGameStore((state) => state.selectPlayer);
  const unlockSecondarySpecialization = useGameStore(
    (state) => state.unlockSecondarySpecialization,
  );
  const meetManager = useGameStore((state) => state.meetManager);
  const meetBoard = useGameStore((state) => state.meetBoard);
  const resolveLeadershipResponsibility = useGameStore(
    (state) => state.resolveLeadershipResponsibility,
  );
  const chooseCareerRecovery = useGameStore((state) => state.chooseCareerRecovery);
  const unlockedAchievements = useAchievementStore(
    (state) => state.unlockedAchievements,
  );

  const { scout, currentSeason, jobOffers, performanceReviews } = gameState ?? {
    scout: undefined,
    currentSeason: undefined,
    jobOffers: [] as JobOffer[],
    performanceReviews: [] as PerformanceReview[],
  };

  const currentClub = scout?.currentClubId ? getClub(scout.currentClubId) : undefined;
  const skillEntries = scout
    ? (Object.entries(scout.skills) as [ScoutSkill, number][])
    : [];
  const attrEntries = scout
    ? (Object.entries(scout.attributes) as [ScoutAttribute, number][])
    : [];

  // Phase 1: mastery perks, NPC scouts, unreviewed reports
  const unlockedMasteryPerks = scout ? checkMasteryPerkUnlocks(scout) : [];
  const unlockedMasteryPerkIds = new Set(unlockedMasteryPerks.map((p) => p.id));
  const npcScoutCount = scout
    ? Object.values(gameState?.npcScouts ?? {}).length
    : 0;
  const unreviewedNPCReportCount = scout
    ? Object.values(gameState?.npcReports ?? {}).filter((r) => !r.reviewed).length
    : 0;

  // Phase 2: tools and finances — call hooks/derived values before early return
  const unlockedTools = gameState?.unlockedTools ?? [];
  const finances = gameState?.finances ?? null;

  // Career path choice eligibility — derive before early return
  const showPathChoice =
    scout?.careerPathChosen !== true &&
    finances !== null &&
    scout !== undefined &&
    canChooseIndependentPath(scout, finances);

  // Specialization career details — derive before early return
  const specialization = scout?.primarySpecialization;
  const transferRecords = gameState?.transferRecords ?? [];
  const predictions = gameState?.predictions ?? [];

  // firstTeam: hit rate
  const completedTransfers = transferRecords.filter(
    (r) => r.outcome === "hit" || r.outcome === "decent" || r.outcome === "flop",
  );
  const hitCount = transferRecords.filter((r) => r.outcome === "hit").length;
  const hitRate = completedTransfers.length > 0
    ? Math.round((hitCount / completedTransfers.length) * 100)
    : null;

  // data: prediction oracle status
  const resolvedPredictions = predictions.filter((p) => p.resolved);
  const correctPredictions = resolvedPredictions.filter((p) => p.wasCorrect === true);
  const predictionAccuracy = resolvedPredictions.length > 0
    ? Math.round((correctPredictions.length / resolvedPredictions.length) * 100)
    : null;
  const oracleStreak = (() => {
    let streak = 0;
    const sorted = [...resolvedPredictions].sort(
      (a, b) => b.madeInSeason - a.madeInSeason || b.madeInWeek - a.madeInWeek,
    );
    for (const p of sorted) {
      if (p.wasCorrect === true) streak++;
      else break;
    }
    return streak;
  })();
  const isOracle = predictionAccuracy !== null && predictionAccuracy >= 70 && resolvedPredictions.length >= 10;

  // Manager alignment (data tension) — derive before early return
  const currentClubManager = scout?.currentClubId
    ? gameState?.managerProfiles?.[scout.currentClubId]
    : undefined;
  const managerAlignment = scout && currentClubManager
    ? calculatePreferenceAlignment(scout, currentClubManager)
    : null;

  const [managerMeetingApproach, setManagerMeetingApproach] =
    useState<ManagerMeetingApproach>("listen");
  const [boardMeetingApproach, setBoardMeetingApproach] =
    useState<BoardMeetingApproach>("accountability");
  const managerMeetingEligibility = gameState
    ? getManagerMeetingEligibility(gameState)
    : null;
  const boardMeetingEligibility = gameState
    ? getBoardMeetingEligibility(gameState)
    : null;

  if (!gameState || !scout) return null;

  const runTraits = getWorldTraitDefinitions(gameState.runManifest.worldTraitIds);
  const consequenceCinemaSource = {
    rootSeed: gameState.runManifest.rootSeed,
    players: gameState.players,
    retiredPlayers: gameState.retiredPlayers,
    clubs: gameState.clubs,
    contacts: gameState.contacts,
    rivalScouts: gameState.rivalScouts,
    rivalOrganizations: gameState.rivalOrganizationState?.organizations ?? {},
    reports: gameState.reports,
    recommendationReviews: gameState.recommendationReviews,
    discoveryRecords: gameState.discoveryRecords,
    playerMovementHistory: gameState.playerMovementHistory,
    consequenceState: gameState.consequenceState,
  };
  const activeObligations = Object.values(gameState.consequenceState.obligations)
    .filter((obligation) => obligation.status === "active")
    .sort((left, right) =>
      (left.dueAt?.season ?? Number.MAX_SAFE_INTEGER) - (right.dueAt?.season ?? Number.MAX_SAFE_INTEGER)
      || (left.dueAt?.week ?? Number.MAX_SAFE_INTEGER) - (right.dueAt?.week ?? Number.MAX_SAFE_INTEGER),
    );
  const recentDecisions = Object.values(gameState.consequenceState.decisions)
    .filter((decision) => decision.selectedOptionId)
    .sort((left, right) =>
      (right.selectedAt?.season ?? right.offeredAt.season) - (left.selectedAt?.season ?? left.offeredAt.season)
      || (right.selectedAt?.week ?? right.offeredAt.week) - (left.selectedAt?.week ?? left.offeredAt.week),
    )
    .slice(0, 8);
  const rivalOrganizationCount = Object.keys(
    gameState.rivalOrganizationState?.organizations ?? {},
  ).length;
  const openRivalOpportunityCount = Object.values(
    gameState.rivalOrganizationState?.opportunities ?? {},
  ).filter((opportunity) => opportunity.status === "open").length;

  const youthPlacementReports = Object.values(gameState.placementReports ?? {}).filter(
    (report) => report.scoutId === scout.id,
  );
  const acceptedPlacements = youthPlacementReports.filter(
    (report) => report.clubResponse === "accepted" || report.clubResponse === "trial",
  ).length;
  const pendingPlacements = youthPlacementReports.filter(
    (report) => !report.clubResponse || report.clubResponse === "pending",
  ).length;
  const youthDiscoveryRecords: DiscoveryRecord[] = gameState.discoveryRecords ?? [];
  const playerFacingDiscoveryById = new Map(
    getPlayerFacingDiscoverySummaries(gameState).map((summary) => [summary.playerId, summary]),
  );
  const discoveredPlayerIds = new Set(youthDiscoveryRecords.map((record) => record.playerId));
  const averageSkill = skillEntries.length > 0
    ? skillEntries.reduce((sum, [, value]) => sum + value, 0) / skillEntries.length
    : 0;
  const developmentPriority = [...skillEntries].sort((a, b) => a[1] - b[1])[0];
  const monthlyExpenses = finances
    ? Object.values(finances.expenses).reduce((sum, amount) => sum + amount, 0)
    : 0;
  const currentBuildAchievementCount = ACHIEVEMENTS.filter(
    (achievement) =>
      isAchievementAvailableForBuild(achievement.id) &&
      unlockedAchievements.has(achievement.id),
  ).length;
  const latestPerformanceReview = performanceReviews.at(-1);
  const careerTimeline: CareerTimelineEntry[] = [
    ...youthDiscoveryRecords.map((record) => {
      const player = gameState.players[record.playerId] ?? gameState.retiredPlayers?.[record.playerId];
      const summary = playerFacingDiscoveryById.get(record.playerId);
      return {
        id: `discovery-${record.playerId}`,
        season: record.discoveredSeason,
        week: record.discoveredWeek,
        label: "Discovery",
        title: player ? `${player.firstName} ${player.lastName}` : "Youth prospect",
        description: summary?.isHighUpsideProjection
          ? "Your original report projected high upside."
          : "Added to your professional scouting record.",
        tone: summary?.isHighUpsideProjection ? "amber" as const : "emerald" as const,
      };
    }),
    ...youthDiscoveryRecords
      .filter((record) => record.placementSeason != null && record.placementWeek != null)
      .map((record) => {
        const player = gameState.players[record.playerId] ?? gameState.retiredPlayers?.[record.playerId];
        const club = record.placementClubId ? gameState.clubs[record.placementClubId] : undefined;
        return {
          id: `placement-${record.playerId}-${record.placementSeason}-${record.placementWeek}`,
          season: record.placementSeason!,
          week: record.placementWeek!,
          label: "Placement",
          title: player ? `${player.firstName} ${player.lastName}` : "Youth prospect",
          description: `Placed with ${club?.name ?? "a professional academy"}${record.placementType ? ` via ${record.placementType === "academyIntake" ? "academy intake" : "youth contract"}` : ""}.`,
          tone: "blue" as const,
        };
      }),
    ...(gameState.playerMovementHistory ?? [])
      .filter((movement) => discoveredPlayerIds.has(movement.playerId))
      .map((movement) => {
        const player = gameState.players[movement.playerId] ?? gameState.retiredPlayers?.[movement.playerId];
        const fromClub = movement.fromClubId ? gameState.clubs[movement.fromClubId] : undefined;
        const toClub = movement.toClubId ? gameState.clubs[movement.toClubId] : undefined;
        const route = fromClub || toClub
          ? `${fromClub?.shortName ?? "Free agent"} to ${toClub?.shortName ?? "out of football"}`
          : movement.reason ?? "Career status updated";
        return {
          id: `movement-${movement.id}`,
          season: movement.season,
          week: movement.week,
          label: formatMovementLabel(movement.type),
          title: player ? `${player.firstName} ${player.lastName}` : "Tracked prospect",
          description: `${route}${movement.fee ? ` for ${formatBalance(movement.fee)}` : ""}.`,
          tone: movement.type === "retirement" || movement.type === "footballExit"
            ? "default" as const
            : movement.type === "release"
              ? "red" as const
              : "blue" as const,
        };
      }),
  ].sort((a, b) => b.season - a.season || b.week - a.week).slice(0, 40);

  if (scout.primarySpecialization === "youth") {
    return (
      <GameLayout>
        <div className="relative min-h-screen p-4 sm:p-6 lg:p-8 [&_.text-zinc-500]:text-zinc-400 [&_.text-zinc-600]:text-zinc-400">
          <ScreenBackground src="/images/backgrounds/career-journey.png" opacity={0.88} />
          <div className="relative z-10 mx-auto max-w-[1480px]">
            <div className="mb-5 overflow-hidden rounded-2xl border border-emerald-400/20 bg-[radial-gradient(circle_at_top_right,rgba(52,211,153,0.13),transparent_38%),rgba(16,21,27,0.96)] p-5 shadow-2xl shadow-black/25 sm:p-6 lg:p-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <ScoutAvatar avatarId={scout.avatarId ?? 1} size={96} />
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300">Professional record</p>
                    <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                      {scout.firstName} {scout.lastName}
                    </h1>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-zinc-300">
                      <span>{TIER_LABELS[scout.careerTier]}</span>
                      <span aria-hidden="true" className="text-zinc-600">·</span>
                      <span>{currentClub?.name ?? "Independent"}</span>
                      <span aria-hidden="true" className="text-zinc-600">·</span>
                      <span>Season {currentSeason}</span>
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 font-semibold text-emerald-200">
                        Tier {scout.careerTier}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-zinc-300">
                        {Math.round(scout.reputation)} reputation
                      </span>
                      <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1.5 text-amber-200">
                        Youth mastery {scout.specializationLevel}/20
                      </span>
                    </div>
                  </div>
                </div>
                <div className="w-full rounded-xl border border-white/10 bg-black/20 p-4 lg:max-w-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Next development edge</p>
                  <p className="mt-2 text-lg font-bold text-white">
                    {developmentPriority ? SKILL_LABELS[developmentPriority[0]] : "Build experience"}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-zinc-400">
                    {developmentPriority
                      ? `Currently ${developmentPriority[1]}/20. Choose weekly work that trains this weakness instead of chasing XP in the abstract.`
                      : "Complete scouting work to reveal your development priorities."}
                  </p>
                  <Button className="mt-4 min-h-11 w-full" onClick={() => setScreen("calendar")}>
                    Plan development work
                    <ArrowRight size={16} className="ml-2" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </div>

            <Tabs defaultValue="overview">
              <TabsList className="mb-5 grid h-auto min-h-12 w-full grid-cols-2 gap-1 overflow-hidden rounded-xl border border-white/10 bg-[#11161c]/95 p-1 sm:grid-cols-4">
                {CAREER_TAB_ITEMS.map((item) => (
                  <TabsTrigger key={item.value} value={item.value} className="min-h-11 rounded-lg px-3 py-2.5">
                    {item.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="overview" className="mt-0 space-y-5" data-tutorial-id="career-overview">
                <h2 className="sr-only">Career overview</h2>
                <CareerRecoveryPanel state={gameState} onChoose={chooseCareerRecovery} />
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <CareerMetricTile label="Reputation" value={`${Math.round(scout.reputation)}/100`} helper="Trust earned through decisions" tone="emerald" />
                  <CareerMetricTile label="Placements" value={`${acceptedPlacements}`} helper={`${pendingPlacements} awaiting response`} tone="blue" />
                  <CareerMetricTile label="Discoveries" value={`${youthDiscoveryRecords.length}`} helper={`${scout.discoveryCredits.length} credited outcomes`} tone="amber" />
                  <CareerMetricTile label="Skill Average" value={`${averageSkill.toFixed(1)}/20`} helper={`${scout.reportsSubmitted} reports submitted`} />
                </div>

                <Card className="border-fuchsia-400/20 bg-[radial-gradient(circle_at_top_right,rgba(217,70,239,0.09),transparent_42%),rgba(17,22,28,0.95)]">
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Shield size={17} className="text-fuchsia-300" aria-hidden="true" />
                          This career&apos;s world conditions
                        </CardTitle>
                        <p className="mt-1 text-sm leading-6 text-zinc-400">
                          These seed-locked conditions shape talent, competition, markets, and story pacing for the full career.
                        </p>
                      </div>
                      <Badge variant="outline" className="border-fuchsia-400/25 font-mono text-[10px] text-fuchsia-200">
                        {formatRunFingerprint(gameState.runManifest.fingerprint)}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-3 md:grid-cols-3">
                    {runTraits.length === 0 ? (
                      <p className="text-sm text-zinc-400 md:col-span-3">
                        This imported career predates seeded world conditions, so its original simulation rules are preserved.
                      </p>
                    ) : runTraits.map((trait) => (
                      <div key={trait.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-fuchsia-300">
                          {trait.dimension}
                        </p>
                        <p className="mt-1 font-semibold text-white">{trait.name}</p>
                        <p className="mt-2 text-xs leading-5 text-zinc-400">{trait.description}</p>
                        <ul className="mt-3 space-y-1 text-[11px] leading-5 text-zinc-300">
                          {trait.playerFacingEffects.map((effect) => (
                            <li key={effect} className="flex gap-2">
                              <span aria-hidden="true" className="text-fuchsia-300">&bull;</span>
                              <span>{effect}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                    <WorldConditionPanel state={gameState} />
                    {rivalOrganizationCount > 0 && (
                      <div className="flex flex-col gap-3 rounded-xl border border-fuchsia-400/15 bg-fuchsia-400/[0.04] p-4 md:col-span-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="flex items-center gap-2 text-sm font-semibold text-white">
                            <Swords size={15} className="text-fuchsia-300" aria-hidden="true" />
                            Competitive recruitment landscape
                          </p>
                          <p className="mt-1 text-xs leading-5 text-zinc-400">
                            {rivalOrganizationCount} persistent organization{rivalOrganizationCount === 1 ? "" : "s"} are pursuing their own agendas
                            {openRivalOpportunityCount > 0
                              ? `, with ${openRivalOpportunityCount} opening${openRivalOpportunityCount === 1 ? "" : "s"} available now.`
                              : "."}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant={openRivalOpportunityCount > 0 ? "default" : "outline"}
                          className="min-h-11 shrink-0"
                          onClick={() => setScreen("rivals")}
                        >
                          {openRivalOpportunityCount > 0 ? "Respond to openings" : "View rival landscape"}
                          <ArrowRight size={15} className="ml-2" aria-hidden="true" />
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {scout.careerTier >= 4 && (
                  <LeadershipPortfolioPanel
                    portfolio={gameState.leadershipPortfolio}
                    players={gameState.players}
                    npcScouts={gameState.npcScouts}
                    npcDelegations={gameState.npcDelegations}
                    onChoice={resolveLeadershipResponsibility}
                    onOpenPlayer={(playerId) => {
                      selectPlayer(playerId);
                      setScreen("playerProfile");
                    }}
                    onOpenNpcManagement={() => setScreen("npcManagement")}
                  />
                )}

                {showPathChoice && finances && (
                  <Card className="border-amber-400/25 bg-amber-400/[0.06]">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base text-amber-200">Choose your career path</CardTitle>
                      <p className="text-sm leading-6 text-zinc-300">This determines how you earn, who you answer to, and which long-term systems open up.</p>
                    </CardHeader>
                    <CardContent className="grid gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => useGameStore.getState().chooseCareerPath("club" as CareerPath)}
                        className="min-h-24 rounded-xl border border-sky-400/25 bg-sky-400/[0.06] p-4 text-left transition hover:bg-sky-400/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
                      >
                        <span className="font-semibold text-sky-200">Club Scout</span>
                        <span className="mt-1 block text-sm leading-5 text-zinc-400">Stable salary, internal influence, and an employer&apos;s priorities.</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => useGameStore.getState().chooseCareerPath("independent" as CareerPath)}
                        className="min-h-24 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] p-4 text-left transition hover:bg-emerald-400/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
                      >
                        <span className="font-semibold text-emerald-200">Independent Scout</span>
                        <span className="mt-1 block text-sm leading-5 text-zinc-400">Sell expertise, build retainers, and own the financial risk.</span>
                      </button>
                    </CardContent>
                  </Card>
                )}

                <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
                  <Card className="border-white/10 bg-[#11161c]/95">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Briefcase size={17} className="text-emerald-300" aria-hidden="true" />
                        Career opportunities
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {jobOffers.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-white/15 p-6 text-center">
                          <p className="font-semibold text-white">No offers on the table</p>
                          <p className="mt-1 text-sm text-zinc-400">Reputation, successful placements, and strong reviews create better roles over time.</p>
                        </div>
                      ) : (
                        <div className="grid gap-3 md:grid-cols-2">
                          {jobOffers.map((offer) => (
                            <JobOfferCard
                              key={offer.id}
                              offer={offer}
                              clubName={getClub(offer.clubId)?.name ?? "Unknown club"}
                              onAccept={() => acceptJob(offer.id)}
                              onDecline={() => declineJob(offer.id)}
                            />
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-white/10 bg-[#11161c]/95">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Recent reviews</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {performanceReviews.length === 0 ? (
                        <p className="text-sm leading-6 text-zinc-400">Your first formal review arrives after enough work has accumulated to judge.</p>
                      ) : (
                        [...performanceReviews].reverse().slice(0, 4).map((review) => (
                          <div key={review.season} className="rounded-xl border border-white/10 bg-black/20 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className={`flex items-center gap-2 text-sm font-semibold ${outcomeColor(review.outcome)}`}>
                                {outcomeIcon(review.outcome)} {review.outcome}
                              </span>
                              <span className="text-xs text-zinc-500">Season {review.season}</span>
                            </div>
                            <p className="mt-2 text-xs leading-5 text-zinc-400">
                              {review.reportsSubmitted} reports · {Math.round(review.averageQuality)} average craft · {review.successfulRecommendations} successful recommendations
                            </p>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                </div>

                {(scout.managerRelationship || scout.careerTier >= 5) && (
                  <section aria-labelledby="club-politics-title" className="space-y-3">
                    <div>
                      <h2 id="club-politics-title" className="text-base font-semibold text-white">
                        Club politics
                      </h2>
                      <p className="mt-1 text-sm leading-6 text-zinc-400">
                        Choose how you use evidence, trust, and accountability. These conversations create
                        directives, memories, fatigue, and future access.
                      </p>
                    </div>
                    <div className="grid gap-5 lg:grid-cols-2">
                      <PoliticalMeetingCards
                        scout={scout}
                        managerProfile={currentClubManager}
                        boardProfile={gameState.boardProfile}
                        managerApproach={managerMeetingApproach}
                        boardApproach={boardMeetingApproach}
                        managerEligibility={managerMeetingEligibility}
                        boardEligibility={boardMeetingEligibility}
                        onManagerApproachChange={setManagerMeetingApproach}
                        onBoardApproachChange={setBoardMeetingApproach}
                        onMeetManager={() => meetManager(managerMeetingApproach)}
                        onMeetBoard={() => meetBoard(boardMeetingApproach)}
                      />
                    </div>
                  </section>
                )}
              </TabsContent>

              <TabsContent value="development" className="mt-0 space-y-5" data-tutorial-id="career-skills">
                <h2 className="sr-only">Scout development</h2>
                <div className="grid gap-5 xl:grid-cols-2">
                  <Card className="border-white/10 bg-[#11161c]/95">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Scouting skills</CardTitle>
                      <p className="text-sm text-zinc-400">Skills improve through relevant weekly work. The thin bar is XP toward the next level.</p>
                    </CardHeader>
                    <CardContent className="grid gap-4 sm:grid-cols-2">
                      {skillEntries.map(([skill, value]) => {
                        const xp = scout.skillXp?.[skill] ?? 0;
                        const threshold = Math.max(1, value * 10);
                        return (
                          <div key={skill} className="rounded-xl border border-white/10 bg-black/20 p-4">
                            <div className="flex items-center justify-between gap-2 text-sm">
                              <span className="font-medium text-zinc-200">{SKILL_LABELS[skill]}</span>
                              <span className="font-mono font-bold text-white">{value}/20</span>
                            </div>
                            <Progress value={value} max={20} indicatorClassName={value >= 15 ? "bg-emerald-400" : value >= 10 ? "bg-amber-400" : "bg-sky-400"} className="mt-3" />
                            <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-400">
                              <span>{xp}/{threshold} XP</span>
                              <span>{value >= 20 ? "Mastered" : `${Math.max(0, threshold - xp)} to level`}</span>
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>

                  <Card className="border-white/10 bg-[#11161c]/95">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Professional attributes</CardTitle>
                      <p className="text-sm text-zinc-400">These shape relationships, stamina, memory, intuition, and how convincingly you act on a read.</p>
                    </CardHeader>
                    <CardContent className="grid gap-4 sm:grid-cols-2">
                      {attrEntries.map(([attribute, value]) => (
                        <div key={attribute} className="rounded-xl border border-white/10 bg-black/20 p-4">
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <span className="font-medium text-zinc-200">{ATTRIBUTE_LABELS[attribute]}</span>
                            <span className="font-mono font-bold text-white">{value}/20</span>
                          </div>
                          <Progress value={value} max={20} indicatorClassName="bg-violet-400" className="mt-3" />
                          <p className="mt-2 text-[11px] text-zinc-400">{scout.attributeXp?.[attribute] ?? 0} XP banked</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-5 lg:grid-cols-3">
                  <Card className="border-white/10 bg-[#11161c]/95 lg:col-span-2" data-tutorial-id="career-perk-tree">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Star size={17} className="text-amber-300" aria-hidden="true" />
                        Youth specialization
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="mb-4 flex items-center justify-between text-sm">
                        <span className="text-zinc-300">Mastery level</span>
                        <span className="font-semibold text-amber-200">{scout.specializationLevel}/20</span>
                      </div>
                      <Progress value={scout.specializationLevel} max={20} indicatorClassName="bg-amber-400" />
                      <div className="mt-4 flex flex-wrap gap-2">
                        {scout.unlockedPerks.length === 0 ? (
                          <p className="text-sm text-zinc-400">Perks unlock as your specialization grows.</p>
                        ) : scout.unlockedPerks.map((perk) => (
                          <Badge key={perk} variant="outline" className="border-amber-400/20 bg-amber-400/10 text-amber-200">{perk}</Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                  <div className="space-y-3">
                    <button onClick={() => setScreen("training")} className="flex min-h-20 w-full items-center justify-between rounded-xl border border-white/10 bg-[#11161c]/95 p-4 text-left transition hover:border-amber-400/25 hover:bg-amber-400/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400">
                      <span><span className="block font-semibold text-white">Courses & qualifications</span><span className="mt-1 block text-xs text-zinc-400">{finances?.activeEnrollment ? "Training in progress" : `${finances?.completedCourses.length ?? 0} completed`}</span></span>
                      <ChevronRight size={18} className="text-zinc-400" aria-hidden="true" />
                    </button>
                    <button onClick={() => setScreen("equipment")} className="flex min-h-20 w-full items-center justify-between rounded-xl border border-white/10 bg-[#11161c]/95 p-4 text-left transition hover:border-emerald-400/25 hover:bg-emerald-400/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400">
                      <span><span className="block font-semibold text-white">Equipment loadout</span><span className="mt-1 block text-xs text-zinc-400">Tools that change real activity outcomes</span></span>
                      <ChevronRight size={18} className="text-zinc-400" aria-hidden="true" />
                    </button>
                    <button onClick={() => setScreen("agency")} className="flex min-h-20 w-full items-center justify-between rounded-xl border border-white/10 bg-[#11161c]/95 p-4 text-left transition hover:border-sky-400/25 hover:bg-sky-400/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400">
                      <span className="flex min-w-0 items-center gap-3">
                        <Building2 size={18} className="shrink-0 text-sky-300" aria-hidden="true" />
                        <span>
                          <span className="block font-semibold text-white">Agency &amp; regional presence</span>
                          <span className="mt-1 block text-xs text-zinc-400">
                            {finances?.satelliteOffices.length
                              ? `${finances.satelliteOffices.length} regional office${finances.satelliteOffices.length === 1 ? "" : "s"} active`
                              : "Infrastructure, assistants, clients, and offices"}
                          </span>
                        </span>
                      </span>
                      <ChevronRight size={18} className="shrink-0 text-zinc-400" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="trackRecord" className="mt-0 space-y-5">
                <h2 className="sr-only">Career track record</h2>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <CareerMetricTile label="Reports Filed" value={`${youthPlacementReports.length}`} helper="Placement recommendations" />
                  <CareerMetricTile label="Accepted" value={`${acceptedPlacements}`} helper="Trials and academy offers" tone="emerald" />
                  <CareerMetricTile label="Tracked Players" value={`${discoveredPlayerIds.size}`} helper="Across full careers" tone="blue" />
                  <CareerMetricTile label="Legacy" value={`${gameState.legacyScore.totalScore}`} helper="Outcome-weighted impact" tone="amber" />
                </div>
                <section
                  aria-labelledby="career-records-relationships-title"
                  className="rounded-2xl border border-white/10 bg-[#11161c]/95 p-4 sm:p-5"
                  data-testid="career-record-drilldowns"
                >
                  <div className="mb-4">
                    <h3 id="career-records-relationships-title" className="font-semibold text-white">
                      Records &amp; relationships
                    </h3>
                    <p className="mt-1 text-sm text-zinc-400">
                      Reopen the people and evidence behind your reputation at any time.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {CAREER_RECORD_DRILLDOWNS.map((item) => {
                      const status = item.screen === "network"
                        ? `${Object.keys(gameState.contacts).length} known contacts`
                        : item.screen === "alumniDashboard"
                          ? `${gameState.alumniRecords.length} placed prospects`
                          : item.screen === "performance"
                            ? latestPerformanceReview
                              ? `Latest review: ${latestPerformanceReview.outcome}`
                              : `${scout.reportsSubmitted} reports on record`
                            : `${currentBuildAchievementCount}/${TOTAL_ACHIEVEMENT_COUNT} unlocked`;
                      const Icon = item.screen === "network"
                        ? Users
                        : item.screen === "alumniDashboard"
                          ? Trophy
                          : item.screen === "performance"
                            ? BarChart3
                            : Star;

                      return (
                        <button
                          key={item.screen}
                          type="button"
                          onClick={() => setScreen(item.screen)}
                          className="flex min-h-28 w-full items-start justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-emerald-400/30 hover:bg-emerald-400/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
                        >
                          <span className="min-w-0">
                            <span className="flex items-center gap-2 font-semibold text-white">
                              <Icon size={17} className="shrink-0 text-emerald-300" aria-hidden="true" />
                              {item.label}
                            </span>
                            <span className="mt-2 block text-xs leading-5 text-zinc-400">
                              {item.description}
                            </span>
                            <span className="mt-2 block text-[11px] font-medium text-emerald-200">
                              {status}
                            </span>
                          </span>
                          <ChevronRight size={17} className="mt-0.5 shrink-0 text-zinc-400" aria-hidden="true" />
                        </button>
                      );
                    })}
                  </div>
                </section>
                <ConsequenceCinema
                  source={consequenceCinemaSource}
                  onOpenPlayer={(playerId) => {
                    selectPlayer(playerId);
                    setScreen("playerProfile");
                  }}
                  onOpenReport={() => setScreen("reportHistory")}
                />
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
                  <Card className="border-white/10 bg-[#11161c]/95">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Shield size={17} className="text-fuchsia-300" aria-hidden="true" />
                        Decision legacy
                      </CardTitle>
                      <p className="text-sm text-zinc-400">The calls you made, the alternatives you closed, and whether their consequences have finished unfolding.</p>
                    </CardHeader>
                    <CardContent>
                      {recentDecisions.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-zinc-400">Your consequential choices will be recorded here.</p>
                      ) : (
                        <ol className="space-y-2">
                          {recentDecisions.map((decision) => {
                            const selected = decision.options.find((option) => option.id === decision.selectedOptionId);
                            const date = decision.selectedAt ?? decision.offeredAt;
                            return (
                              <li key={decision.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="font-semibold text-white">{String(decision.metadata?.title ?? selected?.label ?? "Career decision")}</p>
                                  <Badge variant="outline" className={decision.status === "resolved" ? "border-emerald-400/25 text-emerald-200" : "border-amber-400/25 text-amber-200"}>
                                    {decision.status}
                                  </Badge>
                                </div>
                                <p className="mt-1 text-sm text-zinc-300">{selected?.label ?? decision.selectedOptionId}</p>
                                <p className="mt-2 text-[11px] text-zinc-500">
                                  {formatWeekSeason(date.season, date.week)} &middot; {decision.selectionKind === "default" ? "Deadline decision" : "Chosen by you"} &middot; {Math.max(0, decision.options.length - 1)} alternatives closed
                                </p>
                              </li>
                            );
                          })}
                        </ol>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-white/10 bg-[#11161c]/95">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Promises &amp; obligations</CardTitle>
                      <p className="text-sm text-zinc-400">Access creates debts. Future opportunities may force you to choose between keeping a promise and advancing your career.</p>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {activeObligations.length === 0 ? (
                        <p className="text-sm leading-6 text-zinc-400">No active promises. Relationship choices can create duties that persist beyond the original event.</p>
                      ) : activeObligations.map((obligation) => (
                        <div key={obligation.id} className="rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-3">
                          <p className="text-sm font-semibold capitalize text-amber-100">{obligation.kind.replace(/([A-Z])/g, " $1")}</p>
                          <p className="mt-1 text-xs leading-5 text-zinc-300">{obligation.terms}</p>
                          <p className="mt-2 text-[11px] text-zinc-500">
                            {obligation.dueAt ? `Due ${formatWeekSeason(obligation.dueAt.season, obligation.dueAt.week)}` : "Ongoing"}
                          </p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
                <Card className="border-white/10 bg-[#11161c]/95">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Trophy size={17} className="text-amber-300" aria-hidden="true" />
                      Career timeline
                    </CardTitle>
                    <p className="text-sm text-zinc-400">Your discoveries remain connected to signings, loans, transfers, releases, and retirement.</p>
                  </CardHeader>
                  <CardContent>
                    {careerTimeline.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-white/15 p-8 text-center">
                        <p className="font-semibold text-white">Your record starts with the first name you back</p>
                        <p className="mt-1 text-sm text-zinc-400">Discover a prospect, build evidence, recommend a destination, then watch the career unfold.</p>
                      </div>
                    ) : (
                      <ol className="space-y-3">
                        {careerTimeline.map((entry) => (
                          <li key={entry.id} className={`rounded-xl border p-4 ${timelineToneClasses(entry.tone)}`}>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge variant="outline" className="border-white/15 text-[10px] text-zinc-300">{entry.label}</Badge>
                                  <h3 className="font-semibold text-white">{entry.title}</h3>
                                </div>
                                <p className="mt-2 text-sm leading-6 text-zinc-300">{entry.description}</p>
                              </div>
                              <span className="shrink-0 text-xs font-medium text-zinc-400">{formatWeekSeason(entry.season, entry.week)}</span>
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="finances" className="mt-0 space-y-5">
                <h2 className="sr-only">Career finances</h2>
                {!finances ? (
                  <Card><CardContent className="p-8 text-center text-sm text-zinc-400">Financial records are not available in this save.</CardContent></Card>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                      <CareerMetricTile label="Balance" value={formatBalance(finances.balance)} helper="Available cash" tone={finances.balance >= 0 ? "emerald" : "red"} />
                      <CareerMetricTile label="Monthly Income" value={formatBalance(finances.monthlyIncome)} helper={scout.careerPath === "independent" ? "Reports and retainers" : "Salary and bonuses"} tone="emerald" />
                      <CareerMetricTile label="Monthly Costs" value={formatBalance(monthlyExpenses)} helper="Lifestyle, travel, and tools" tone="red" />
                      <CareerMetricTile label="Personal Savings" value={formatSavings(scout.savings)} helper={formatSalary(scout.salary)} />
                    </div>
                    <button
                      type="button"
                      onClick={() => setScreen(CAREER_FINANCE_DRILLDOWN.screen)}
                      className="flex min-h-20 w-full items-center justify-between gap-4 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] p-4 text-left transition hover:border-emerald-400/40 hover:bg-emerald-400/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
                      data-testid="career-finance-drilldown"
                    >
                      <span>
                        <span className="block font-semibold text-emerald-100">
                          {CAREER_FINANCE_DRILLDOWN.label}
                        </span>
                        <span className="mt-1 block text-sm text-zinc-400">
                          {CAREER_FINANCE_DRILLDOWN.description}
                        </span>
                      </span>
                      <ChevronRight size={18} className="shrink-0 text-emerald-300" aria-hidden="true" />
                    </button>
                    <div className="grid gap-5 lg:grid-cols-2">
                      <Card className="border-white/10 bg-[#11161c]/95">
                        <CardHeader className="pb-3"><CardTitle className="text-base">Monthly commitments</CardTitle></CardHeader>
                        <CardContent className="space-y-2">
                          {Object.entries(finances.expenses).map(([label, amount]) => (
                            <div key={label} className="flex min-h-11 items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 text-sm">
                              <span className="text-zinc-300">{formatExpenseLabel(label)}</span>
                              <span className="font-semibold text-red-300">{formatBalance(amount)}</span>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                      <Card className="border-white/10 bg-[#11161c]/95">
                        <CardHeader className="pb-3"><CardTitle className="text-base">Lifestyle</CardTitle><p className="text-sm text-zinc-400">Comfort changes monthly costs and recovery. Choose deliberately.</p></CardHeader>
                        <CardContent className="space-y-2">
                          {(Object.entries(LIFESTYLE_TIERS) as [string, (typeof LIFESTYLE_TIERS)[LifestyleLevel]][]).map(([levelString, tier]) => {
                            const level = Number(levelString) as LifestyleLevel;
                            const active = finances.lifestyle.level === level;
                            return (
                              <button
                                key={level}
                                type="button"
                                onClick={() => useGameStore.getState().changeLifestyle(level)}
                                aria-pressed={active}
                                className={`flex min-h-14 w-full items-center justify-between rounded-xl border px-4 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 ${active ? "border-emerald-400/35 bg-emerald-400/10" : "border-white/10 bg-black/20 hover:border-white/20"}`}
                              >
                                <span><span className="block text-sm font-semibold text-white">{tier.name}</span><span className="mt-0.5 block text-xs text-zinc-400">Monthly comfort level</span></span>
                                <span className={active ? "font-semibold text-emerald-200" : "text-zinc-300"}>{formatBalance(tier.config.monthlyCost)}/mo</span>
                              </button>
                            );
                          })}
                        </CardContent>
                      </Card>
                    </div>
                  </>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </GameLayout>
    );
  }

  return (
    <GameLayout>
      <div className="relative p-4 sm:p-6 [&_.text-zinc-500]:text-zinc-400 [&_.text-zinc-600]:text-zinc-400">
        <ScreenBackground src="/images/backgrounds/career-journey.png" opacity={0.80} />
        <div className="relative z-10">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Career</h1>
          <p className="text-sm text-zinc-400">Season {currentSeason}</p>
        </div>

        {gameState.careerRecovery?.current && (
          <div className="mb-6">
            <CareerRecoveryPanel state={gameState} onChoose={chooseCareerRecovery} />
          </div>
        )}

        {/* ── Career path choice (tier 2+, club default, eligible) ──────── */}
        {showPathChoice && (
          <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
            <div className="mb-3">
              <p className="text-sm font-semibold text-amber-400">Career Path Choice Available</p>
              <p className="mt-0.5 text-xs text-zinc-400">
                You have earned enough reputation to choose your career direction. This choice shapes
                how you earn and grow going forward.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => useGameStore.getState().chooseCareerPath("club" as CareerPath)}
                className="cursor-pointer rounded-md border border-blue-500/30 bg-blue-500/5 p-3 text-left transition hover:border-blue-500/60 hover:bg-blue-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
              >
                <p className="mb-1 text-sm font-semibold text-blue-300">Club Scout</p>
                <p className="text-xs text-zinc-400">
                  Stable salary, performance bonuses, work within a club&apos;s scouting department
                </p>
              </button>
              <button
                type="button"
                onClick={() => useGameStore.getState().chooseCareerPath("independent" as CareerPath)}
                className="cursor-pointer rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-left transition hover:border-emerald-500/60 hover:bg-emerald-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500"
              >
                <p className="mb-1 text-sm font-semibold text-emerald-300">Independent Scout</p>
                <p className="text-xs text-zinc-400">
                  Sell reports on the marketplace, build retainer contracts, grow your own agency
                </p>
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3" data-tutorial-id="career-overview">
          {/* ── Left column ─────────────────────────────────────────────── */}
          <div className="space-y-4">
            {/* Scout profile */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Scout Profile</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-4">
                  <ScoutAvatar avatarId={scout.avatarId ?? 1} size={96} />
                  <div>
                    <p className="text-lg font-bold">
                      {scout.firstName} {scout.lastName}
                    </p>
                    <p className="text-sm text-zinc-400">Age {scout.age}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <Tooltip content="Your scouting career level. Higher tiers unlock new activities, contacts, and responsibilities." side="top">
                      <span className="text-zinc-500">Tier: </span>
                    </Tooltip>
                    <span className="text-white font-medium">{scout.careerTier}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500">Role: </span>
                    <span className="text-white font-medium">
                      {TIER_LABELS[scout.careerTier]}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500">Club: </span>
                    <span className="text-white font-medium">
                      {currentClub?.shortName ?? "Freelance"}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500">Spec: </span>
                    <span className="text-white font-medium">
                      {SPEC_LABELS[scout.primarySpecialization] ??
                        scout.primarySpecialization}
                    </span>
                  </div>
                </div>

                {/* Reputation */}
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <Tooltip content="Reputation grows from accurate reports and successful player placements." side="top">
                      <span className="text-zinc-500">Reputation</span>
                    </Tooltip>
                    <span className="text-emerald-400 font-semibold">
                      {Math.round(scout.reputation)}/100
                    </span>
                  </div>
                  <Progress
                    value={scout.reputation}
                    max={100}
                    indicatorClassName="bg-emerald-500"
                  />
                </div>

                {/* Club trust */}
                {currentClub && (
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1 text-zinc-500">
                        Club Trust
                        <HelpTooltip text="How happy your employer is with your work. Drops from idle weeks, rises from quality reports and successful signings." />
                      </span>
                      <span className="text-blue-400 font-semibold">
                        {Math.round(scout.clubTrust)}/100
                      </span>
                    </div>
                    <Progress
                      value={scout.clubTrust}
                      max={100}
                      indicatorClassName="bg-blue-500"
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Financial */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Finances</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">Weekly Salary</span>
                  <span className="text-emerald-400 font-semibold text-sm">
                    {scout.salary > 0 ? formatSalary(scout.salary) : "Freelance"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">Savings</span>
                  <span className="text-white font-semibold text-sm">
                    {formatSavings(scout.savings)}
                  </span>
                </div>
                {/* Phase 2: finances balance */}
                {finances && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500">Balance</span>
                    <span
                      className={`font-semibold text-sm ${
                        finances.balance >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {formatBalance(finances.balance)}
                    </span>
                  </div>
                )}
                {scout.contractEndSeason && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500">Contract Ends</span>
                    <span className="text-amber-400 text-sm">
                      Season {scout.contractEndSeason}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Lifestyle selector */}
            {finances && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Lifestyle</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {(Object.entries(LIFESTYLE_TIERS) as [string, (typeof LIFESTYLE_TIERS)[LifestyleLevel]][]).map(
                    ([levelStr, tier]) => {
                      const level = Number(levelStr) as LifestyleLevel;
                      const isActive = finances.lifestyle.level === level;
                      return (
                        <button
                          key={level}
                          type="button"
                          onClick={() => useGameStore.getState().changeLifestyle(level)}
                          aria-pressed={isActive}
                          className={`flex w-full cursor-pointer items-center justify-between rounded-md border px-3 py-2 text-xs transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500 ${
                            isActive
                              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                              : "border-[#27272a] text-zinc-400 hover:border-zinc-600 hover:text-zinc-300"
                          }`}
                        >
                          <span className="font-medium">{tier.name}</span>
                          <span
                            className={isActive ? "text-emerald-400" : "text-zinc-500"}
                          >
                            £{tier.config.monthlyCost.toLocaleString()}/mo
                          </span>
                        </button>
                      );
                    },
                  )}
                </CardContent>
              </Card>
            )}

            {/* Career stats */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Career Statistics</CardTitle>
                  <button
                    type="button"
                    className="text-blue-400 hover:text-blue-300 text-sm cursor-pointer"
                    onClick={() => setScreen("analytics")}
                  >
                    View Analytics
                  </button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">Reports Submitted</span>
                  <span className="text-white font-semibold">{scout.reportsSubmitted}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">Successful Finds</span>
                  <span className="text-white font-semibold">{scout.successfulFinds}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">Discovery Credits</span>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-semibold">{scout.discoveryCredits.length}</span>
                    <button
                      type="button"
                      className="text-blue-400 hover:text-blue-300 text-sm cursor-pointer"
                      onClick={() => setScreen("discoveries")}
                    >
                      View Discoveries
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Hall of Fame — tier 3+ */}
            {scout.careerTier >= 3 && (
              <Card
                className="cursor-pointer hover:border-amber-500/30 transition"
                onClick={() => setScreen("hallOfFame")}
              >
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Trophy size={16} className="text-amber-400" aria-hidden="true" />
                    <span className="text-sm font-medium">View Hall of Fame Snapshot</span>
                  </div>
                  <ChevronRight size={14} className="text-zinc-500" />
                </CardContent>
              </Card>
            )}

            {/* Manager Alignment (Data Tension) */}
            {managerAlignment !== null && currentClubManager && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart3 size={14} className="text-cyan-400" aria-hidden="true" />
                    Manager Alignment
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500">
                      {currentClubManager.managerName}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] capitalize ${
                        managerAlignment >= 80
                          ? "border-emerald-500/50 text-emerald-400"
                          : managerAlignment >= 50
                            ? "border-amber-500/50 text-amber-400"
                            : "border-red-500/50 text-red-400"
                      }`}
                    >
                      {currentClubManager.preference.replace(/([A-Z])/g, " $1").trim()}
                    </Badge>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-zinc-500">Alignment</span>
                      <span
                        className={`font-semibold ${
                          managerAlignment >= 80
                            ? "text-emerald-400"
                            : managerAlignment >= 50
                              ? "text-amber-400"
                              : "text-red-400"
                        }`}
                      >
                        {managerAlignment}/100
                      </span>
                    </div>
                    <Progress
                      value={managerAlignment}
                      max={100}
                      indicatorClassName={
                        managerAlignment >= 80
                          ? "bg-emerald-500"
                          : managerAlignment >= 50
                            ? "bg-amber-500"
                            : "bg-red-500"
                      }
                    />
                  </div>
                  <p className="text-[10px] text-zinc-600">
                    {managerAlignment >= 80
                      ? "Your approach aligns well — reports carry extra weight."
                      : managerAlignment >= 50
                        ? "Reasonable fit — your reports are fairly valued."
                        : "Style clash — your reports may be discounted."}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* ── Center column ────────────────────────────────────────────── */}
          <div className="space-y-4">
            {/* Skills */}
            <Card data-tutorial-id="career-skills">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Observation Skills</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {skillEntries.map(([skill, value]) => {
                  const xp = scout.skillXp?.[skill] ?? 0;
                  const threshold = value * 10;
                  const xpPct =
                    value >= 20 ? 100 : Math.round((xp / threshold) * 100);
                  return (
                    <div key={skill}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="text-zinc-400">
                          {SKILL_LABELS[skill] ?? skill}
                        </span>
                        <span className="font-mono font-bold text-white">
                          {value}/20
                        </span>
                      </div>
                      <Progress
                        value={value}
                        max={20}
                        indicatorClassName={
                          value >= 15
                            ? "bg-emerald-500"
                            : value >= 10
                              ? "bg-amber-500"
                              : "bg-zinc-500"
                        }
                      />
                      {value < 20 && (
                        <div className="mt-0.5 flex items-center gap-1">
                          <div className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-800">
                            <div
                              className="h-full rounded-full bg-zinc-600 transition-all"
                              style={{ width: `${xpPct}%` }}
                            />
                          </div>
                          <span className="text-[9px] text-zinc-600">
                            {xp}/{threshold} XP
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Personality attributes */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Personality Attributes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {attrEntries.map(([attr, value]) => {
                  const xp = scout.attributeXp?.[attr] ?? 0;
                  const threshold = value * 10;
                  const xpPct =
                    value >= 20 ? 100 : Math.round((xp / threshold) * 100);
                  return (
                    <div key={attr}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="text-zinc-400">
                          {ATTRIBUTE_LABELS[attr] ?? attr}
                        </span>
                        <span className="font-mono font-bold text-white">
                          {value}/20
                        </span>
                      </div>
                      <Progress
                        value={value}
                        max={20}
                        indicatorClassName="bg-purple-500"
                      />
                      {value < 20 && (
                        <div className="mt-0.5 flex items-center gap-1">
                          <div className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-800">
                            <div
                              className="h-full rounded-full bg-purple-900 transition-all"
                              style={{ width: `${xpPct}%` }}
                            />
                          </div>
                          <span className="text-[9px] text-zinc-600">
                            {xp}/{threshold} XP
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* ── T8.5: Tools panel ──────────────────────────────────────── */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Wrench size={14} className="text-zinc-400" aria-hidden="true" />
                  Scout Tools
                  <Badge variant="secondary" className="ml-auto text-[10px]">
                    {unlockedTools.length}/{TOOL_DEFINITIONS.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Active bonus summary */}
                {unlockedTools.length > 0 && (() => {
                  const bonuses = getActiveToolBonuses(unlockedTools);
                  const parts: string[] = [];
                  if (bonuses.accuracyBonus) parts.push(`+${Math.round(bonuses.accuracyBonus * 100)}% accuracy`);
                  if (bonuses.confidenceBonus) parts.push(`+${Math.round(bonuses.confidenceBonus * 100)}% confidence`);
                  if (bonuses.fatigueReduction) parts.push(`-${bonuses.fatigueReduction} fatigue/report`);
                  if (bonuses.travelFatigueReduction) parts.push(`-${Math.round(bonuses.travelFatigueReduction * 100)}% travel fatigue`);
                  if (bonuses.relationshipGainBonus) parts.push(`+${Math.round(bonuses.relationshipGainBonus * 100)}% relationship gains`);
                  if (parts.length === 0) return null;
                  return (
                    <div className="mb-3 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
                      <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mb-1">Active Bonuses</p>
                      <p className="text-xs text-emerald-300">{parts.join(" | ")}</p>
                    </div>
                  );
                })()}
                <div className="grid grid-cols-1 gap-2">
                  {TOOL_DEFINITIONS.map((tool) => {
                    const isUnlocked = unlockedTools.includes(tool.id);
                    const def = getToolDefinition(tool.id);
                    const req = tool.requirements;

                    return (
                      <div
                        key={tool.id}
                        className={`rounded-md border p-3 transition ${
                          isUnlocked
                            ? "border-emerald-500/30 bg-emerald-500/5"
                            : "border-zinc-700 bg-[#0d1116]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              {isUnlocked ? (
                                <Badge
                                  variant="success"
                                  className="text-[9px] border-emerald-500/50 bg-emerald-500/10 text-emerald-400 shrink-0"
                                >
                                  Unlocked
                                </Badge>
                              ) : (
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-zinc-600 bg-zinc-900 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-300">
                                  <Lock size={10} aria-hidden="true" />
                                  Locked
                                </span>
                              )}
                              <span
                                className={`text-xs font-semibold truncate ${
                                  isUnlocked ? "text-white" : "text-zinc-300"
                                }`}
                              >
                                {def?.name ?? tool.id}
                              </span>
                            </div>
                            {isUnlocked && def && (
                              <p className="text-[10px] text-emerald-400 leading-relaxed">
                                {def.bonus}
                              </p>
                            )}
                            {!isUnlocked && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {req.minTier !== undefined && (
                                  <span className="text-[9px] text-zinc-400">
                                    Tier {req.minTier}+
                                  </span>
                                )}
                                {req.minReputation !== undefined && (
                                  <span className="text-[9px] text-zinc-400">
                                    Rep {req.minReputation}+
                                  </span>
                                )}
                                {req.minSkillLevel !== undefined && (
                                  <span className="text-[9px] text-zinc-400">
                                    {req.minSkillLevel.skill} {req.minSkillLevel.level}+
                                  </span>
                                )}
                                {req.minReportsSubmitted !== undefined && (
                                  <span className="text-[9px] text-zinc-400">
                                    {req.minReportsSubmitted} reports
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Equipment loadout — link to dedicated screen */}
                <div className="mt-4 space-y-2">
                  <Card
                    className="cursor-pointer hover:border-zinc-600 transition"
                    onClick={() => setScreen("equipment")}
                  >
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Wrench size={14} className="text-emerald-400" />
                        <span className="text-sm font-medium">Equipment Loadout</span>
                      </div>
                      <ChevronRight size={14} className="text-zinc-500" />
                    </CardContent>
                  </Card>

                  {/* Training — link to courses screen */}
                  <Card
                    className="cursor-pointer hover:border-zinc-600 transition"
                    onClick={() => setScreen("training")}
                  >
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <BookOpen size={14} className="text-amber-400" />
                        <span className="text-sm font-medium">
                          {gameState.finances?.activeEnrollment
                            ? "Training — In Progress"
                            : "Training & Courses"}
                        </span>
                      </div>
                      <ChevronRight size={14} className="text-zinc-500" />
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Right column ─────────────────────────────────────────────── */}
          <div className="space-y-4">
            {/* Specialization */}
            <Card data-tutorial-id="career-perk-tree">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Star size={14} className="text-amber-400" aria-hidden="true" />
                  Specialization
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {SPEC_LABELS[scout.primarySpecialization]}
                  </span>
                  <Badge variant="warning">Level {scout.specializationLevel}</Badge>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-zinc-500">Specialization Mastery</span>
                    <span className="text-amber-400">{scout.specializationLevel}/20</span>
                  </div>
                  <Progress
                    value={scout.specializationLevel}
                    max={20}
                    indicatorClassName="bg-amber-500"
                  />
                </div>
                {scout.unlockedPerks.length > 0 && (
                  <div>
                    <p className="text-xs text-zinc-500 mb-2 uppercase tracking-wider font-semibold">
                      Unlocked Perks
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {scout.unlockedPerks.map((perk) => (
                        <Badge
                          key={perk}
                          variant="secondary"
                          className="text-[10px] capitalize"
                        >
                          {perk.replace(/([A-Z])/g, " $1").trim()}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Secondary specialization — tier 3+ */}
            {scout.careerTier >= 3 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Star size={14} className="text-blue-400" aria-hidden="true" />
                    Secondary Specialization
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {scout.secondarySpecialization ? (
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {SPEC_LABELS[scout.secondarySpecialization] ??
                          scout.secondarySpecialization}
                      </Badge>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Badge
                        variant="outline"
                        className="border-blue-500/50 text-blue-400 text-[10px]"
                      >
                        Secondary Spec Available
                      </Badge>
                      <div className="grid grid-cols-2 gap-1">
                        {(Object.keys(SPEC_LABELS) as Specialization[])
                          .filter((s) => s !== scout.primarySpecialization)
                          .map((spec) => (
                            <Button
                              key={spec}
                              size="sm"
                              variant="outline"
                              className="text-[10px] h-7 px-2"
                              onClick={() => unlockSecondarySpecialization(spec)}
                            >
                              {SPEC_LABELS[spec]}
                            </Button>
                          ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Mastery perks — tier 3+ */}
            {scout.careerTier >= 3 && (
              <Card data-tutorial-id="career-tier-benefits">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Mastery Perks</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1.5">
                    {MASTERY_PERKS.map((perk) => {
                      const isUnlocked = unlockedMasteryPerkIds.has(perk.id);
                      return (
                        <Badge
                          key={perk.id}
                          variant={isUnlocked ? "success" : "secondary"}
                          className={`text-[10px] ${
                            isUnlocked
                              ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                              : "border-zinc-700 bg-zinc-800 text-zinc-500"
                          }`}
                          title={`${perk.requiredSkill} ≥ ${perk.requiredLevel}`}
                        >
                          {perk.name}
                        </Badge>
                      );
                    })}
                  </div>
                  {unlockedMasteryPerks.length === 0 && (
                    <p className="mt-2 text-xs text-zinc-600">
                      Reach skill level 15+ to unlock mastery perks.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* NPC scout summary — tier 4+ */}
            {scout.careerTier >= 4 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Users size={14} aria-hidden="true" />
                    Scouting Network
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center justify-between rounded-md border border-[#27272a] px-2 py-1.5">
                      <span className="text-zinc-500">Scouts</span>
                      <span className="font-semibold text-white">{npcScoutCount}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-md border border-[#27272a] px-2 py-1.5">
                      <span className="text-zinc-500">Pending</span>
                      <span
                        className={`font-semibold ${
                          unreviewedNPCReportCount > 0
                            ? "text-amber-400"
                            : "text-white"
                        }`}
                      >
                        {unreviewedNPCReportCount}
                      </span>
                    </div>
                  </div>
                  {unreviewedNPCReportCount > 0 && (
                    <p className="text-xs text-amber-400">
                      {unreviewedNPCReportCount} report
                      {unreviewedNPCReportCount !== 1 ? "s" : ""} awaiting review
                    </p>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => setScreen("npcManagement")}
                  >
                    Manage Scouts
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Club politics use the same authoritative controls as the Youth career hub. */}
            <PoliticalMeetingCards
              scout={scout}
              managerProfile={currentClubManager}
              boardProfile={gameState.boardProfile}
              managerApproach={managerMeetingApproach}
              boardApproach={boardMeetingApproach}
              managerEligibility={managerMeetingEligibility}
              boardEligibility={boardMeetingEligibility}
              onManagerApproachChange={setManagerMeetingApproach}
              onBoardApproachChange={setBoardMeetingApproach}
              onMeetManager={() => meetManager(managerMeetingApproach)}
              onMeetBoard={() => meetBoard(boardMeetingApproach)}
            />

            {/* Job offers */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Briefcase size={14} aria-hidden="true" />
                  Job Offers
                  {jobOffers.length > 0 && (
                    <Badge className="ml-auto text-[10px]">{jobOffers.length}</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {jobOffers.length === 0 ? (
                  <p className="text-xs text-zinc-500">
                    No active offers. Build your reputation to attract clubs.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {jobOffers.map((offer) => {
                      const club = getClub(offer.clubId);
                      return (
                        <JobOfferCard
                          key={offer.id}
                          offer={offer}
                          clubName={club?.name ?? offer.clubId}
                          onAccept={() => acceptJob(offer.id)}
                          onDecline={() => declineJob(offer.id)}
                        />
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Performance reviews */}
            {performanceReviews.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Performance History</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {[...performanceReviews].reverse().map((review, i) => (
                      <div
                        key={i}
                        className="rounded-md border border-[#27272a] p-3"
                      >
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-xs text-zinc-500">
                            Season {review.season}
                          </span>
                          <div className="flex items-center gap-1">
                            {outcomeIcon(review.outcome)}
                            <span
                              className={`text-xs font-semibold capitalize ${outcomeColor(review.outcome)}`}
                            >
                              {review.outcome}
                            </span>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-1 text-xs text-zinc-400">
                          <span>Reports: {review.reportsSubmitted}</span>
                          <span>Avg Quality: {review.averageQuality}</span>
                          <span>Recs: {review.successfulRecommendations}</span>
                          <span>
                            Rep:{" "}
                            {review.reputationChange > 0 ? "+" : ""}
                            {review.reputationChange}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* ── First-Team: Transfer Career Section ──────────────────────────── */}
        {specialization === "firstTeam" && transferRecords.length > 0 && (
          <div className="mt-6">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-zinc-500">
              <Target size={13} className="text-blue-400" aria-hidden="true" />
              Transfer Career
            </h2>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Hit rate summary */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Scout Hit Rate</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-end gap-2">
                    <p className="text-3xl font-bold text-white">{hitCount}</p>
                    <p className="mb-1 text-sm text-zinc-500">
                      hits / {completedTransfers.length} rated
                    </p>
                  </div>
                  {hitRate !== null && (
                    <>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-[#27272a]">
                        <div
                          className={`h-full rounded-full transition-all ${
                            hitRate >= 60 ? "bg-emerald-500" : hitRate >= 40 ? "bg-amber-500" : "bg-red-500"
                          }`}
                          style={{ width: `${hitRate}%` }}
                        />
                      </div>
                      <p className={`text-sm font-semibold ${hitRate >= 60 ? "text-emerald-400" : hitRate >= 40 ? "text-amber-400" : "text-red-400"}`}>
                        {hitRate}% hit rate
                      </p>
                    </>
                  )}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-1.5">
                      <p className="font-bold text-emerald-400">{hitCount}</p>
                      <p className="text-zinc-500">Hits</p>
                    </div>
                    <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-1.5">
                      <p className="font-bold text-amber-400">{transferRecords.filter((r) => r.outcome === "decent").length}</p>
                      <p className="text-zinc-500">Decent</p>
                    </div>
                    <div className="rounded-md border border-red-500/20 bg-red-500/5 p-1.5">
                      <p className="font-bold text-red-400">{transferRecords.filter((r) => r.outcome === "flop").length}</p>
                      <p className="text-zinc-500">Flops</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Transfer record list */}
              <div className="lg:col-span-2">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Transfer Records ({transferRecords.length})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {[...transferRecords]
                        .sort((a, b) => b.transferSeason - a.transferSeason || b.transferWeek - a.transferWeek)
                        .map((record) => {
                          const player = gameState.players[record.playerId];
                          const fromClub = gameState.clubs[record.fromClubId];
                          const toClub = gameState.clubs[record.toClubId];
                          return (
                            <div key={record.id} className="rounded-md border border-[#27272a] p-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-semibold text-white">
                                    {player ? `${player.firstName} ${player.lastName}` : "Unknown Player"}
                                  </p>
                                  <p className="text-xs text-zinc-500">
                                    {fromClub?.shortName ?? "?"} → {toClub?.shortName ?? "?"} · S{record.transferSeason}
                                    {record.fee > 0 && <span className="ml-1 text-zinc-400">£{record.fee.toLocaleString()}</span>}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {record.appearances != null && (
                                    <span className="text-xs text-zinc-500">
                                      {record.appearances} apps
                                    </span>
                                  )}
                                  {record.outcome && (
                                    <Badge
                                      variant="outline"
                                      className={`text-[10px] ${
                                        record.outcome === "hit"
                                          ? "border-emerald-500/50 text-emerald-400"
                                          : record.outcome === "decent"
                                          ? "border-amber-500/50 text-amber-400"
                                          : record.outcome === "flop"
                                          ? "border-red-500/50 text-red-400"
                                          : "border-zinc-600 text-zinc-500"
                                      }`}
                                    >
                                      {record.outcome}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}

        {/* ── Data Scout: Oracle Career Section ────────────────────────────── */}
        {specialization === "data" && predictions.length > 0 && (
          <div className="mt-6">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-zinc-500">
              <Brain size={13} className="text-violet-400" aria-hidden="true" />
              Prediction Career
            </h2>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Oracle status summary */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    Oracle Status
                    {isOracle && (
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
                  <div className="flex items-end gap-2">
                    <p className="text-3xl font-bold text-white">
                      {predictionAccuracy !== null ? `${predictionAccuracy}%` : "—"}
                    </p>
                    <p className="mb-1 text-sm text-zinc-500">accuracy</p>
                  </div>
                  {predictionAccuracy !== null && (
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[#27272a]">
                      <div
                        className={`h-full rounded-full transition-all ${
                          predictionAccuracy >= 70 ? "bg-emerald-500" : predictionAccuracy >= 50 ? "bg-amber-500" : "bg-red-500"
                        }`}
                        style={{ width: `${predictionAccuracy}%` }}
                      />
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-md border border-[#27272a] p-1.5">
                      <p className="font-bold text-white">{predictions.length}</p>
                      <p className="text-zinc-500">Total</p>
                    </div>
                    <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-1.5">
                      <p className="font-bold text-emerald-400">{correctPredictions.length}</p>
                      <p className="text-zinc-500">Correct</p>
                    </div>
                    <div className="rounded-md border border-[#27272a] p-1.5">
                      <p className="font-bold text-amber-400">{oracleStreak}</p>
                      <p className="text-zinc-500">Streak</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Recent predictions list */}
              <div className="lg:col-span-2">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Predictions ({predictions.length})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {[...predictions]
                        .sort((a, b) => b.madeInSeason - a.madeInSeason || b.madeInWeek - a.madeInWeek)
                        .map((pred) => {
                          const player = gameState.players[pred.playerId];
                          return (
                            <div key={pred.id} className="rounded-md border border-[#27272a] p-3">
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-semibold text-white truncate">
                                      {player ? `${player.firstName} ${player.lastName}` : "Unknown"}
                                    </span>
                                    <Badge variant="outline" className="shrink-0 text-[9px] capitalize">
                                      {pred.type}
                                    </Badge>
                                  </div>
                                  <p className="mt-0.5 text-[10px] text-zinc-400 line-clamp-2">{pred.statement}</p>
                                </div>
                                <div className="shrink-0 ml-2">
                                  {pred.resolved ? (
                                    pred.wasCorrect === true ? (
                                      <CheckCircle size={16} className="text-emerald-400" aria-label="Correct" />
                                    ) : (
                                      <AlertTriangle size={16} className="text-red-400" aria-label="Incorrect" />
                                    )
                                  ) : (
                                    <div className="h-4 w-4 rounded-full border border-zinc-600" aria-label="Pending" />
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-3 text-[9px] text-zinc-600">
                                <span>S{pred.madeInSeason} W{pred.madeInWeek}</span>
                                <span>Resolves S{pred.resolveBySeason}</span>
                                <span>{Math.round(pred.confidence * 100)}% confidence</span>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    </GameLayout>
  );
}
