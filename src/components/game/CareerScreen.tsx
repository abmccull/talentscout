"use client";

import { useState } from "react";
import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
  ChevronRight,
  TrendingDown,
  Minus,
  BarChart3,
  Trophy,
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
  CourseEnrollment,
} from "@/engine/core/types";
import { MASTERY_PERKS, checkMasteryPerkUnlocks } from "@/engine/specializations/masteryPerks";
import { TOOL_DEFINITIONS, getToolDefinition, getActiveToolBonuses } from "@/engine/tools/index";
// EquipmentPanel now has its own dedicated screen
import { Tooltip } from "@/components/ui/tooltip";
import { ScoutAvatar } from "@/components/game/ScoutAvatar";
import { canChooseIndependentPath } from "@/engine/career/pathChoice";
import {
  countScheduledStudySessions,
  COURSE_CATALOG,
  getCoursePlannerStatusModel,
} from "@/engine/career/courses";
import { calculatePreferenceAlignment } from "@/engine/analytics/dataTension";
import {
  getBoardMeetingEligibility,
  getManagerMeetingEligibility,
} from "@/engine/career/politicalMeetings";
import { LIFESTYLE_TIERS } from "@/engine/finance/lifestyle";
import { calculateMonthlyRunRate } from "@/engine/finance/dashboard";
import type { CareerPath, LifestyleLevel } from "@/engine/core/types";
import { ScreenBackground } from "@/components/ui/screen-background";
import { getSeasonLength } from "@/engine/core/gameDate";
import { deriveCareerRolePackage } from "@/engine/career/rolePackages";
import { ConsequenceCinema } from "./consequence-cinema/ConsequenceCinema";
import { LeadershipPortfolioPanel } from "./career/LeadershipPortfolioPanel";
import { CareerRecoveryPanel } from "./career/CareerRecoveryPanel";
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
import { usePersistentDisclosure } from "@/lib/usePersistentDisclosure";
import { deriveCareerRoleProfile } from "@/engine/career/roleProfile";
import {
  AGENCY_POLICY_DEFINITIONS,
  canChangeAgencyOperatingPolicy,
  deriveAgencyStrategicPressure,
  normalizeAgencyStrategyState,
} from "@/engine/finance/agencyStrategy";
import {
  buildCareerWorkspaceViewModel,
  type CareerBridgeHighlight,
} from "./career/careerWorkspaceModel";
import CareerEraThread from "./workspace/CareerEraThread";
import {
  deriveCareerFingerprintAuthority,
  deriveCareerFingerprintProjection,
} from "@/engine/career/fingerprint";
import { projectDevelopmentPressureForState } from "@/engine/career/developmentPressure";
import { deriveSeasonReviewMetrics } from "@/engine/career/seasonReviewContext";
import { CareerYouthWorkspace } from "./career/CareerYouthWorkspace";
import {
  ATTRIBUTE_LABELS,
  type CareerMetricTileProps,
  type CareerTimelineEntry,
  SKILL_LABELS,
  SPEC_LABELS,
  buildCareerTimeline as buildCareerTimelineModel,
  derivePredictionCareerStats,
  deriveTransferCareerStats,
  getCareerCourseSummary as getCareerCourseSummaryModel,
} from "./career/careerScreenModel";

// ─── Labels ──────────────────────────────────────────────────────────────────

// ─── Formatters ──────────────────────────────────────────────────────────────

function formatSalary(salary: number): string {
  if (salary >= 1000) return `£${(salary / 1000).toFixed(1)}K/wk`;
  return `£${salary}/wk`;
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

function getCareerBaseLabel(scout: Scout, clubName?: string): string {
  if (clubName) return clubName;
  return scout.careerPath === "independent" ? "Own practice" : "Available";
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
    case "violet":
      return "text-violet-300";
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
        <div className="flex gap-1.5">
          {offer.renewalOfContractId && <Badge variant="outline">Renewal</Badge>}
          <Badge variant="secondary">Tier {offer.tier}</Badge>
        </div>
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
      {offer.objectives && (
        <div className="mb-3 rounded-md border border-white/10 bg-black/20 p-2.5">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Success measures
          </p>
          <div className="grid grid-cols-3 gap-2 text-[10px] text-zinc-300">
            <span>{offer.objectives.reportsPerSeason} reports</span>
            <span>{offer.objectives.minimumAverageQuality}+ quality</span>
            <span>{offer.objectives.successfulRecommendations} signings</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-zinc-500">
            {(offer.signingBonus ?? 0) > 0 && <span>{formatBalance(offer.signingBonus ?? 0)} signing bonus</span>}
            <span>{Math.round((offer.performanceBonusRate ?? 0) * 100)}% performance upside</span>
            <span>{offer.educationBudget ? `${formatBalance(offer.educationBudget)} education` : "No education budget"}</span>
            <span>{offer.severanceWeeks ?? 0} weeks severance</span>
          </div>
        </div>
      )}
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
  const [careerMetricsOpen, setCareerMetricsOpen] = usePersistentDisclosure(
    "career.record-summary",
  );

  const { scout, currentSeason, jobOffers, performanceReviews } = gameState ?? {
    scout: undefined,
    currentSeason: undefined,
    jobOffers: [] as JobOffer[],
    performanceReviews: [] as PerformanceReview[],
  };
  const [careerInventoryOpen, setCareerInventoryOpen] = usePersistentDisclosure(
    "career.lower-overview",
    jobOffers.length > 0,
  );
  const [careerPoliticsOpen, setCareerPoliticsOpen] = usePersistentDisclosure(
    "career.club-politics",
  );

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
  const scheduledStudySessions = gameState
    ? countScheduledStudySessions(gameState.schedule)
    : 0;
  const activeCourseDurationWeeks = finances?.activeEnrollment
    ? COURSE_CATALOG.find((course) => course.id === finances.activeEnrollment?.courseId)?.durationWeeks
    : undefined;
  const courseSummary = gameState
    ? getCareerCourseSummaryModel({
      activeCourseDurationWeeks,
      activeEnrollment: finances?.activeEnrollment,
      completedCourseCount: finances?.completedCourses.length ?? 0,
      currentWeek: gameState.currentWeek,
      currentSeason: gameState.currentSeason,
      scheduledStudySessions,
      seasonLength: getSeasonLength(gameState.fixtures, gameState.currentSeason),
    })
    : "0 completed";

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

  const {
    completedTransfers,
    hitCount,
    hitRate,
    decentCount,
    flopCount,
  } = deriveTransferCareerStats(transferRecords);
  const {
    correctPredictions,
    predictionAccuracy,
    oracleStreak,
    isOracle,
  } = derivePredictionCareerStats(predictions);

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

  const roleProfile = deriveCareerRoleProfile({
    scout,
    finances: finances ?? undefined,
    club: currentClub,
  });
  const careerRoleLabel = roleProfile.title;
  const careerBaseLabel = getCareerBaseLabel(scout, currentClub?.name);
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
    careerStoryArchive: gameState.careerStoryArchive,
    careerMoments: gameState.careerMoments?.history
      .filter((delivery) => delivery.status === "presented")
      .map((delivery) => delivery.moment),
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
  const careerMonthlyRunRate = finances
    ? calculateMonthlyRunRate(finances, scout)
    : undefined;
  const monthlyExpenses = careerMonthlyRunRate?.totalExpenses ?? 0;
  const monthlyIncome = careerMonthlyRunRate?.totalIncome ?? 0;
  const currentBuildAchievementCount = ACHIEVEMENTS.filter(
    (achievement) =>
      isAchievementAvailableForBuild(achievement.id) &&
      unlockedAchievements.has(achievement.id),
  ).length;
  const latestPerformanceReview = performanceReviews.at(-1);
  const rolePackage = deriveCareerRolePackage({
    scout,
    finances: finances ?? undefined,
    club: currentClub,
    leadershipPortfolio: gameState.leadershipPortfolio,
  });
  const developmentPressure = projectDevelopmentPressureForState(
    gameState,
    getSeasonLength(gameState.fixtures, gameState.currentSeason),
    deriveSeasonReviewMetrics(gameState, gameState.currentSeason),
  );
  const leadDevelopmentPressure = developmentPressure.fronts[0];
  const agencyStrategy = finances
    ? normalizeAgencyStrategyState(finances.agencyStrategyState)
    : undefined;
  const agencyPressure = scout.careerPath === "independent" && finances
    ? deriveAgencyStrategicPressure(finances, scout)
    : null;
  const agencyPolicyChangeAvailable = finances
    ? canChangeAgencyOperatingPolicy(
        finances,
        { week: gameState.currentWeek, season: gameState.currentSeason },
      )
    : false;
  const leadPressure = rolePackage.pressures[0];
  const careerTimeline: CareerTimelineEntry[] = buildCareerTimelineModel({
    discoveryRecords: youthDiscoveryRecords,
    discoveredPlayerIds,
    gameState,
    playerFacingDiscoveryById,
  });
  const pressureHighlight: CareerBridgeHighlight | null = activeObligations[0]
    ? {
        id: `obligation-${activeObligations[0].id}`,
        label: "Current pressure",
        title: activeObligations[0].terms,
        body: activeObligations[0].dueAt
          ? `Due ${formatWeekSeason(activeObligations[0].dueAt.season, activeObligations[0].dueAt.week)}. Breaching it becomes part of your record.`
          : "This promise is still active and can return through trust, access, or fallout.",
        meta: activeObligations[0].kind,
        tone: "amber",
      }
    : leadDevelopmentPressure
      ? {
          id: leadDevelopmentPressure.id,
          label: "Current pressure",
          title: leadDevelopmentPressure.title,
          body: [
            leadDevelopmentPressure.cause,
            leadDevelopmentPressure.consequence,
            developmentPressure.youthPayoffSummary,
          ].filter(Boolean).join(" "),
          meta: leadDevelopmentPressure.actionLabel,
          tone: leadDevelopmentPressure.severity === "critical"
            ? "red"
            : leadDevelopmentPressure.severity === "high"
              ? "amber"
              : "sky",
        }
    : leadPressure
      ? {
          id: `role-pressure-${leadPressure.id}`,
          label: "Current pressure",
          title: leadPressure.label,
          body: leadPressure.reason,
          meta: `Mitigation: ${leadPressure.mitigation}`,
          tone: leadPressure.severity === "high"
            ? "red"
            : leadPressure.severity === "medium"
              ? "amber"
              : "sky",
        }
      : null;
  const opportunityHighlight: CareerBridgeHighlight | null = openRivalOpportunityCount > 0
    ? {
        id: "rival-openings",
        label: "Live opportunity",
        title: `${openRivalOpportunityCount} rival opening${openRivalOpportunityCount === 1 ? "" : "s"} can still reshape this season`,
        body: "Persistent organizations are moving on their own timelines. Waiting means giving up initiative, not pausing the world.",
        meta: `${rivalOrganizationCount} rival organization${rivalOrganizationCount === 1 ? "" : "s"} active`,
        tone: "violet",
      }
    : null;
  const latestTrackedPlayerTitle = careerTimeline[0]?.title ?? null;
  const careerFingerprint = deriveCareerFingerprintProjection(
    deriveCareerFingerprintAuthority(gameState),
  );
  const careerWorkspaceViewModel = buildCareerWorkspaceViewModel({
    scout,
    finances,
    currentSeason,
    currentWeek: gameState.currentWeek,
    roleProfile,
    roleBase: careerBaseLabel,
    monthlyIncome,
    monthlyExpenses,
    latestReview: latestPerformanceReview,
    showPathChoice,
    jobOffers,
    pressureHighlight: pressureHighlight ?? undefined,
    opportunityHighlight: opportunityHighlight ?? undefined,
    timelinePreview: careerTimeline.slice(0, 3).map((entry) => ({
      id: entry.id,
      label: entry.label,
      title: entry.title,
      description: entry.description,
      when: formatWeekSeason(entry.season, entry.week),
    })),
    managerProfile: currentClubManager,
    boardProfile: gameState.boardProfile,
    latestTrackedPlayerTitle,
  });

  if (scout.primarySpecialization === "youth") {
    return (
      <CareerYouthWorkspace
        acceptedPlacements={acceptedPlacements}
        activeObligations={activeObligations}
        agencyPolicyChangeAvailable={agencyPolicyChangeAvailable}
        agencyPressure={agencyPressure}
        agencyStrategy={agencyStrategy}
        attrEntries={attrEntries}
        averageSkill={averageSkill}
        careerBaseLabel={careerBaseLabel}
        careerCommandBridgeProps={{
          avatarId: scout.avatarId ?? 1,
          scoutName: `${scout.firstName} ${scout.lastName}`,
          specializationLevel: scout.specializationLevel,
          reputation: scout.reputation,
          careerTier: scout.careerTier,
          viewModel: careerWorkspaceViewModel,
          fingerprint: careerFingerprint,
          onPlanWeek: () => setScreen("calendar"),
          ...(openRivalOpportunityCount > 0
            ? {
                opportunityActionLabel: "Open rivals",
                onOpportunityAction: () => setScreen("rivals"),
              }
            : {}),
          currentThread: (
            <CareerEraThread
              era={gameState.careerEraDirectorState?.current}
              variant="career"
              onOpenProspect={(playerId) => {
                selectPlayer(playerId);
                setScreen("playerProfile");
              }}
              onOpenWorld={() => setScreen("internationalView")}
            />
          ),
        }}
        careerInventoryOpen={careerInventoryOpen}
        careerMetricsOpen={careerMetricsOpen}
        careerPoliticsOpen={careerPoliticsOpen}
        careerTimeline={careerTimeline}
        consequenceCinemaProps={{
          source: consequenceCinemaSource,
          onOpenPlayer: (playerId) => {
            selectPlayer(playerId);
            setScreen("playerProfile");
          },
          onOpenReport: () => setScreen("reportHistory"),
        }}
        courseSummary={courseSummary}
        currentBuildAchievementCount={currentBuildAchievementCount}
        finances={finances}
        gameState={gameState}
        getClubName={(clubId) => getClub(clubId)?.name ?? "Unknown club"}
        jobOffers={jobOffers}
        latestPerformanceReview={latestPerformanceReview}
        leadershipPortfolioProps={scout.careerTier >= 4 ? {
          portfolio: gameState.leadershipPortfolio,
          players: gameState.players,
          npcScouts: gameState.npcScouts,
          npcDelegations: gameState.npcDelegations,
          onChoice: resolveLeadershipResponsibility,
          onOpenPlayer: (playerId) => {
            selectPlayer(playerId);
            setScreen("playerProfile");
          },
          onOpenNpcManagement: () => setScreen("npcManagement"),
        } : null}
        monthlyExpenses={monthlyExpenses}
        monthlyIncome={monthlyIncome}
        onAcceptJob={acceptJob}
        onDeclineJob={declineJob}
        onCareerInventoryToggle={setCareerInventoryOpen}
        onCareerMetricsToggle={setCareerMetricsOpen}
        onCareerPoliticsToggle={setCareerPoliticsOpen}
        onChangeLifestyle={(level) => useGameStore.getState().changeLifestyle(level as LifestyleLevel)}
        onChooseCareerRecovery={chooseCareerRecovery}
        onChooseClubPath={() => useGameStore.getState().chooseCareerPath("club" as CareerPath)}
        onChooseIndependentPath={() => useGameStore.getState().chooseCareerPath("independent" as CareerPath)}
        onOpenPlayerProfile={(playerId) => {
          selectPlayer(playerId);
          setScreen("playerProfile");
        }}
        onSetScreen={(screen) => setScreen(screen as never)}
        pendingPlacements={pendingPlacements}
        performanceReviews={performanceReviews}
        politicalMeetingProps={{
          scout,
          managerProfile: currentClubManager,
          boardProfile: gameState.boardProfile,
          managerApproach: managerMeetingApproach,
          boardApproach: boardMeetingApproach,
          managerEligibility: managerMeetingEligibility,
          boardEligibility: boardMeetingEligibility,
          onManagerApproachChange: setManagerMeetingApproach,
          onBoardApproachChange: setBoardMeetingApproach,
          onMeetManager: () => meetManager(managerMeetingApproach),
          onMeetBoard: () => meetBoard(boardMeetingApproach),
        }}
        recentDecisions={recentDecisions}
        rivalOrganizationCount={rivalOrganizationCount}
        scout={scout}
        showPathChoice={showPathChoice}
        skillEntries={skillEntries}
        youthDiscoveryRecords={youthDiscoveryRecords}
        youthPlacementReportCount={youthPlacementReports.length}
      />
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
                      {careerRoleLabel}
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
                {scout.employmentContract && (
                  <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-500">Season target</span>
                      <span className="text-zinc-200">
                        {scout.employmentContract.objectives.reportsPerSeason} reports
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-500">Quality floor</span>
                      <span className="text-zinc-200">
                        {scout.employmentContract.objectives.minimumAverageQuality}/100
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-500">Education budget</span>
                      <span className="text-emerald-300">
                        {formatBalance(scout.employmentContract.educationBudget)}
                      </span>
                    </div>
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
                  if (bonuses.workflowFatigueReduction) parts.push(`-${bonuses.workflowFatigueReduction} fatigue in busy weeks`);
                  if (bonuses.youthDiscoveryBonus) parts.push(`+${bonuses.youthDiscoveryBonus} youth candidate/search`);
                  if (bonuses.trendHistoryDepth) parts.push(`${bonuses.trendHistoryDepth}-season evidence trends`);
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
                        {review.contractSummary && (
                          <p className={`mt-2 text-[10px] ${review.contractSummary.objectivesMet === review.contractSummary.objectivesTotal ? "text-emerald-300" : "text-amber-300"}`}>
                            Contract objectives: {review.contractSummary.objectivesMet}/{review.contractSummary.objectivesTotal} met · targets {review.contractSummary.reportsTarget} reports, {review.contractSummary.qualityTarget} quality, {review.contractSummary.recommendationsTarget} signings
                          </p>
                        )}
                        {review.developmentSummary && (
                          <p className="mt-2 text-[10px] leading-4 text-amber-300">
                            Development pressure: -{review.developmentSummary.pressurePenalty} points
                            {review.developmentSummary.youthPayoffOffset > 0
                              ? ` after ${review.developmentSummary.youthPayoffOffset} points of youth-outcome relief`
                              : ""}. {review.developmentSummary.reasons[0]}
                          </p>
                        )}
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
