"use client";

import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState, useMemo } from "react";
import { FileText, ArrowLeft, Eye, Star, ArrowUp, ArrowDown, Minus, MessageCircle, GraduationCap, Target, TrendingUp, TrendingDown, AlertTriangle, CalendarPlus, ClipboardList, Phone, Users, HeartPulse, Handshake, Flame, Snowflake, Send, RotateCcw, X, Globe, ChevronRight } from "lucide-react";
import type {
  AttributeReading,
  HiddenIntel,
  Observation,
  SystemFitResult,
  StatisticalProfile,
  AnomalyFlag,
  ScoutSkill,
  DisciplinaryRecord,
  InboxMessage,
  ReflectionFlaggedMomentRecord,
  ReflectionHypothesisRecord,
  ReflectionJournalEntry,
  ScoutingQuestionId,
} from "@/engine/core/types";
import { ATTRIBUTE_DOMAINS } from "@/engine/core/types";
import { calculateConfidenceRange } from "@/engine/scout/perception";
import { StarRating, StarRatingRange } from "@/components/ui/StarRating";
import { getPerceivedAbility } from "@/engine/scout/perceivedAbility";
import { hasObservableRecurringInjuryConcern } from "@/engine/scout/playerFacingIntel";
import { Tooltip } from "@/components/ui/tooltip";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { ClubCrest } from "@/components/game/ClubCrest";
import { ARCHETYPE_LABELS, ARCHETYPE_DESCRIPTIONS } from "@/engine/players/personalityEffects";
import { isTransferWindowOpen } from "@/engine/core/transferWindow";
import { ACTIVITY_SLOT_COSTS } from "@/engine/core/calendar";
import { canAddActivity } from "@/engine/core/calendar";
import { HelpTooltip, AttributeValueTooltip } from "@/components/ui/HelpTooltip";
import { getCountryDisplayName } from "@/engine/network/contacts";
import { formatObservationActivityLabel } from "@/engine/observation/reflection";
import { getHighestValueNextContext } from "@/engine/observation/informationGain";
import { deriveScoutingCaseQuestions } from "@/engine/reports/caseQuestions";
import { getYouthRivalPressure, getYouthRivalPressureBand } from "@/engine/rivals";
import { getScoutHomeCountry } from "@/engine/world/travel";
import { getTransferFlowProbability } from "@/engine/world/transfers";
import { normalizeCountryKey } from "@/lib/country";
import {
  getResolvedContactIntel,
  getResolvedPlayerIds,
  resolvePlayerEntity,
} from "@/lib/playerResolution";
import { EvidenceBoard } from "@/components/game/evidence";
import { getSeasonLength } from "@/engine/core/gameDate";
import {
  projectPlayerDevelopmentEnvironment,
  projectProspectiveDevelopmentEnvironment,
} from "@/engine/world/developmentEnvironment";
import { getWorldConditionModifiers } from "@/engine/world";
import { assessYouthMobility } from "@/engine/youth";
import { useShallow } from "zustand/react/shallow";
import { getActiveToolBonuses } from "@/engine/tools/unlockables";
import { buildObservationTrend } from "@/engine/scout/observationTrend";
import {
  buildPlayerMovementPresentation,
  buildRetirementOutlookPresentation,
} from "@/engine/transfers";
import {
  ObservationsSidebar,
  StatisticalProfileCard,
  SystemFitCard,
} from "@/components/game/player-profile/PlayerProfileEvidenceCards";
import {
  DisciplinaryCard,
  FormPerformanceCard,
  InjuryStatusCard,
  RetirementOutlookCard,
} from "@/components/game/player-profile/PlayerProfileHistoryCards";
import { PlayerProfileTabBar } from "@/components/game/player-profile/PlayerProfileTabBar";
import {
  FormIndicator,
  ReliabilityDots,
} from "@/components/game/player-profile/playerProfileShared";
import {
  attributeValueColor,
  compareSeasonWeekDesc,
  confidenceColor,
  confidenceLabel,
  DOMAIN_LABELS,
  DOMAIN_ORDER,
  formatAttribute,
  formatMarketValue,
  formatMomentType,
  formatSeasonWeekLabel,
  getFlaggedReactionDisplay,
  getHypothesisStateDisplay,
  isQualitativeIntelMessage,
} from "@/components/game/player-profile/playerProfileFormatting";
import {
  evidenceOpportunityLabel,
  PLAYER_PROFILE_TABS,
  selectMostRelevantScoutingCase,
  summarizeUnknownAttributes,
  type PlayerProfileTabId,
} from "@/components/game/player-profile/playerProfilePresentation";

interface PlayerEvidenceEntry
  extends Omit<ReflectionJournalEntry, "flaggedMoments" | "hypotheses"> {
  flaggedMoments: ReflectionFlaggedMomentRecord[];
  hypotheses: ReflectionHypothesisRecord[];
}

function definedQuestionIds(
  questions: Array<{ questionId?: ScoutingQuestionId }> | undefined,
): ScoutingQuestionId[] {
  return (questions ?? [])
    .map((question) => question.questionId)
    .filter((questionId): questionId is ScoutingQuestionId => Boolean(questionId));
}

/** Map each attribute domain to the scout skill that governs its accuracy. */
const DOMAIN_SKILL_MAP: Record<string, ScoutSkill> = {
  technical: "technicalEye",
  physical: "physicalAssessment",
  mental: "psychologicalRead",
  tactical: "tacticalUnderstanding",
  hidden: "psychologicalRead",
};

/** Backward-compat: compute rangeLow/rangeHigh for old saves missing them. */
function ensureRange(reading: AttributeReading, scoutSkill: number): AttributeReading {
  if (reading.rangeLow !== undefined && reading.rangeHigh !== undefined) return reading;
  const [rangeLow, rangeHigh] = calculateConfidenceRange(
    reading.perceivedValue, reading.confidence, scoutSkill, reading.observationCount,
  );
  return { ...reading, rangeLow, rangeHigh };
}

export function PlayerProfile() {
  const {
    gameState,
    selectedPlayerId,
    setScreen,
    getPlayerObservations,
    getPlayerReports,
    startReport,
    getClub,
    getLeague,
    toggleWatchlist,
    setPendingFixtureClubFilter,
    setPendingCalendarActivity,
    setPendingInternationalCountry,
    tapNetworkForPlayer,
    initiateTransferNegotiation,
    recommendPlayerForLoan,
    recallLoanPlayer,
    scheduleActivity,
  } = useGameStore(
    useShallow((state) => ({
      gameState: state.gameState,
      selectedPlayerId: state.selectedPlayerId,
      setScreen: state.setScreen,
      getPlayerObservations: state.getPlayerObservations,
      getPlayerReports: state.getPlayerReports,
      startReport: state.startReport,
      getClub: state.getClub,
      getLeague: state.getLeague,
      toggleWatchlist: state.toggleWatchlist,
      setPendingFixtureClubFilter: state.setPendingFixtureClubFilter,
      setPendingCalendarActivity: state.setPendingCalendarActivity,
      setPendingInternationalCountry: state.setPendingInternationalCountry,
      tapNetworkForPlayer: state.tapNetworkForPlayer,
      initiateTransferNegotiation: state.initiateTransferNegotiation,
      recommendPlayerForLoan: state.recommendPlayerForLoan,
      recallLoanPlayer: state.recallLoanPlayer,
      scheduleActivity: state.scheduleActivity,
    })),
  );

  const [networkIntel, setNetworkIntel] = useState<{ title: string; body: string; contactName?: string } | null>(null);
  const [loanDialogOpen, setLoanDialogOpen] = useState(false);
  const [loanTargetClubId, setLoanTargetClubId] = useState("");
  const [activeTab, setActiveTab] = useState<PlayerProfileTabId>("decision");
  const [expandedUnknownDomains, setExpandedUnknownDomains] = useState<Record<string, boolean>>({});
  const [loanRationale, setLoanRationale] = useState<
    "development" | "playing-time" | "experience" | "squad-depth"
  >("development");
  const [loanDuration, setLoanDuration] = useState(20);

  if (!gameState || !selectedPlayerId) return null;
  const seasonLength = getSeasonLength(
    gameState.fixtures,
    gameState.currentSeason,
  );

  const resolvedPlayer = resolvePlayerEntity(gameState, selectedPlayerId);
  if (!resolvedPlayer) return null;

  const player = resolvedPlayer.player;
  const isRetired = resolvedPlayer.isRetired;
  const developmentEnvironment = isRetired
    ? undefined
    : projectPlayerDevelopmentEnvironment(gameState, player);
  const recurringInjuryConcern = hasObservableRecurringInjuryConcern(player.injuryHistory);
  const canonicalPlayerId = resolvedPlayer.playerId;
  const unsignedYouthRecord = resolvedPlayer.unsignedYouth;
  const relatedPlayerIds = new Set(
    getResolvedPlayerIds(gameState, selectedPlayerId),
  );

  const club = getClub(player.clubId);
  const league = club ? getLeague(club.leagueId) : undefined;
  const observations = getPlayerObservations(canonicalPlayerId);
  const trendHistoryDepth = getActiveToolBonuses(
    gameState.unlockedTools,
  ).trendHistoryDepth;
  const reports = getPlayerReports(canonicalPlayerId);
  const latestAuthoredRole = [...reports]
    .sort((left, right) =>
      right.submittedSeason - left.submittedSeason
      || right.submittedWeek - left.submittedWeek
      || (right.revision ?? 0) - (left.revision ?? 0),
    )
    .find((report) => report.projectedRole)?.projectedRole;
  const inferredRoleScores = new Map<string, { total: number; count: number }>();
  for (const observation of observations) {
    for (const inference of observation.inferredRoleFit ?? []) {
      const aggregate = inferredRoleScores.get(inference.role) ?? { total: 0, count: 0 };
      aggregate.total += inference.suitability;
      aggregate.count += 1;
      inferredRoleScores.set(inference.role, aggregate);
    }
  }
  const inferredRoles = [...inferredRoleScores.entries()]
    .map(([role, aggregate]) => ({
      role,
      suitability: Math.round(aggregate.total / aggregate.count),
    }))
    .sort((left, right) => right.suitability - left.suitability);
  const displayedRoles = latestAuthoredRole
    ? [{ role: latestAuthoredRole, suitability: undefined }]
    : inferredRoles.slice(0, 2);

  // Own-club status controls club actions, never access to engine truth.
  const isOwnClubPlayer = !!(player.clubId && player.clubId === gameState.scout.currentClubId);
  const transferWindowOpen = gameState.transferWindow
    ? isTransferWindowOpen([gameState.transferWindow], gameState.currentWeek)
    : false;
  const ownerClubId = player.contractClubId ?? player.loanParentClubId ?? player.clubId;
  const ownerLeagueId = gameState.clubs[ownerClubId]?.leagueId;
  const ownerCountry = normalizeCountryKey(
    ownerLeagueId ? gameState.leagues[ownerLeagueId]?.country : undefined,
  );
  const loanRouteScore = (clubId: string) => {
    const candidateLeagueId = gameState.clubs[clubId]?.leagueId;
    const candidateCountry = normalizeCountryKey(
      candidateLeagueId ? gameState.leagues[candidateLeagueId]?.country : undefined,
    );
    if (!ownerCountry || !candidateCountry) return 0.5;
    return getTransferFlowProbability(ownerCountry, candidateCountry);
  };
  const isForeignLoanClub = (clubId: string) => {
    const candidateLeagueId = gameState.clubs[clubId]?.leagueId;
    const candidateCountry = normalizeCountryKey(
      candidateLeagueId ? gameState.leagues[candidateLeagueId]?.country : undefined,
    );
    return !!ownerCountry && !!candidateCountry && ownerCountry !== candidateCountry;
  };
  const loanTargetClubs = Object.values(gameState.clubs)
    .filter((candidate) => {
      if (candidate.id === ownerClubId) return false;
      const owner = gameState.clubs[ownerClubId];
      if (!owner) return false;
      const reputationGap = owner.reputation - candidate.reputation;
      if (reputationGap < -10 || reputationGap > 45) return false;
      if (isForeignLoanClub(candidate.id)) {
        if (player.age < 18) return false;
        if (loanRouteScore(candidate.id) < 0.05) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const positionCount = (clubId: string) => gameState.clubs[clubId].playerIds.reduce(
        (count, playerId) => gameState.players[playerId]?.position === player.position ? count + 1 : count,
        0,
      );
      return (
        Number(isForeignLoanClub(a.id)) - Number(isForeignLoanClub(b.id)) ||
        positionCount(a.id) - positionCount(b.id) ||
        loanRouteScore(b.id) - loanRouteScore(a.id) ||
        b.youthAcademyRating - a.youthAcademyRating
      );
    })
    .slice(0, 20);
  const pendingLoanRecommendation = (gameState.loanRecommendations ?? []).some(
    (recommendation) =>
      recommendation.playerId === player.id &&
      (recommendation.status ?? "pending") === "pending",
  );
  const movementHistory = (gameState.playerMovementHistory ?? [])
    .filter((event) => event.playerId === player.id)
    .sort((a, b) => b.season - a.season || b.week - a.week);
  const loanDealsById = new Map(
    [...(gameState.activeLoans ?? []), ...(gameState.loanHistory ?? [])].map((deal) => [deal.id, deal] as const),
  );

  // Aggregate readings from all observations
  const allReadings: AttributeReading[] = observations.flatMap((o) => o.attributeReadings);

  // Merge by attribute (take best observation count, apply backward-compat range)
  const merged = new Map<string, AttributeReading>();
  for (const reading of allReadings) {
    const key = String(reading.attribute);
    const domain = ATTRIBUTE_DOMAINS[reading.attribute];
    const skillKey = DOMAIN_SKILL_MAP[domain] ?? "technicalEye";
    const skillLevel = gameState.scout.skills[skillKey as ScoutSkill];
    const withRange = ensureRange(reading, skillLevel);
    const existing = merged.get(key);
    if (!existing || withRange.observationCount > existing.observationCount) {
      merged.set(key, withRange);
    }
  }

  // Group by domain
  const byDomain = new Map<string, Array<[string, AttributeReading | undefined]>>();
  for (const [attr, domain] of Object.entries(ATTRIBUTE_DOMAINS)) {
    if (!byDomain.has(domain)) byDomain.set(domain, []);
    byDomain.get(domain)!.push([attr, merged.get(attr)]);
  }

  // Aggregate ability readings using shared helper
  const allObs = Object.values(gameState.observations);
  const perceived = getPerceivedAbility(allObs, canonicalPlayerId);

  // Map perceived to the shape used by the UI below
  const aggregatedAbility = perceived
    ? {
        ca: perceived.ca,
        caLow: perceived.caLow,
        caHigh: perceived.caHigh,
        caConfidence: perceived.caConfidence,
        paLow: perceived.paLow,
        paHigh: perceived.paHigh,
        paConfidence: perceived.paConfidence,
      }
    : null;

  const contactIntel: HiddenIntel[] = getResolvedContactIntel(gameState, canonicalPlayerId);
  const npcEvidenceReports = Object.values(gameState.npcReports ?? {})
    .filter((report) => relatedPlayerIds.has(report.playerId));
  const dossierEntries: PlayerEvidenceEntry[] = Object.values(
    gameState.reflectionJournal ?? {},
  )
    .filter((entry) => {
      const hasPlayerLink = entry.playerIds.some((id) => relatedPlayerIds.has(id));
      const hasHypothesis = entry.hypotheses.some((hypothesis) =>
        relatedPlayerIds.has(hypothesis.playerId),
      );
      const hasFlaggedMoment = (entry.flaggedMoments ?? []).some((moment) =>
        relatedPlayerIds.has(moment.playerId),
      );
      return hasPlayerLink || hasHypothesis || hasFlaggedMoment;
    })
    .map((entry) => ({
      ...entry,
      hypotheses: entry.hypotheses.filter((hypothesis) =>
        relatedPlayerIds.has(hypothesis.playerId),
      ),
      flaggedMoments: (entry.flaggedMoments ?? []).filter((moment) =>
        relatedPlayerIds.has(moment.playerId),
      ),
    }))
    .filter(
      (entry) =>
        entry.hypotheses.length > 0 ||
        entry.flaggedMoments.length > 0 ||
        entry.notes.length > 0 ||
        !!entry.summary,
    )
    .sort((left, right) => {
      const seasonWeekDelta = compareSeasonWeekDesc(left, right);
      if (seasonWeekDelta !== 0) return seasonWeekDelta;
      return right.createdAt - left.createdAt;
    });
  const dossierInboxIntel = gameState.inbox
    .filter(
      (message) =>
        !!message.relatedId &&
        relatedPlayerIds.has(message.relatedId) &&
        isQualitativeIntelMessage(message),
    )
    .sort(compareSeasonWeekDesc);
  const scoutHomeCountry = getScoutHomeCountry(gameState.scout);
  const foreignYouthCountry = unsignedYouthRecord && unsignedYouthRecord.country !== scoutHomeCountry
    ? unsignedYouthRecord.country
    : null;

  // Specialization-specific data
  const specialization = gameState.scout.primarySpecialization;
  const reportableEvidenceCount = Object.values(gameState.reflectionJournal ?? {})
    .flatMap((entry) => entry.evidenceCards ?? [])
    .filter((card) => relatedPlayerIds.has(card.playerId)).length;
  const needsReportableYouthEvidence = specialization === "youth"
    && reportableEvidenceCount === 0;
  const canStartReport = !isRetired
    && observations.length > 0
    && !needsReportableYouthEvidence;
  const clubId = gameState.scout.currentClubId ?? "";
  const fitCacheKey = `${canonicalPlayerId}:${clubId}`;
  const systemFit = specialization === "firstTeam"
    ? (gameState.systemFitCache[fitCacheKey] ?? undefined)
    : undefined;
  const statisticalProfile = specialization === "data"
    ? (gameState.statisticalProfiles[canonicalPlayerId] ?? undefined)
    : undefined;
  const playerAnomalies = specialization === "data"
    ? gameState.anomalyFlags.filter((f) => f.playerId === canonicalPlayerId)
    : [];

  const convictionVariant = (c: string) => {
    if (c === "tablePound") return "default" as const;
    if (c === "strongRecommend") return "success" as const;
    if (c === "recommend") return "secondary" as const;
    return "outline" as const;
  };

  const watchlisted = gameState.watchlist.includes(canonicalPlayerId);
  const latestReport = [...reports].sort((left, right) => {
    if ((right.submittedSeason ?? 0) !== (left.submittedSeason ?? 0)) {
      return (right.submittedSeason ?? 0) - (left.submittedSeason ?? 0);
    }
    return (right.submittedWeek ?? 0) - (left.submittedWeek ?? 0);
  })[0];
  const relevantBriefs = unsignedYouthRecord
    ? Object.values(gameState.youthRecruitmentBriefs)
        .filter((brief) =>
          brief.status === "open"
          && player.age <= brief.maxAge
          && (
            brief.requiredPositions.includes(player.position)
            || player.secondaryPositions.some((position) => brief.requiredPositions.includes(position))
          )
        )
        .sort((left, right) => right.competitionPressure - left.competitionPressure)
    : [];
  const mobilityByBriefId = new Map(
    unsignedYouthRecord
      ? relevantBriefs.slice(0, 2).flatMap((brief) => {
          const targetClub = gameState.clubs[brief.clubId];
          const targetLeague = targetClub
            ? gameState.leagues[targetClub.leagueId]
            : undefined;
          if (!targetClub || !targetLeague) return [];
          const targetCountryKey = normalizeCountryKey(targetLeague.country);
          const targetRegionalKnowledge = targetCountryKey
            ? gameState.regionalKnowledge[targetCountryKey]
              ?? Object.values(gameState.regionalKnowledge).find(
                (knowledge) => normalizeCountryKey(knowledge.countryId) === targetCountryKey,
              )
            : undefined;
          return [[brief.id, assessYouthMobility({
            youth: unsignedYouthRecord,
            targetClub,
            targetLeague,
            targetRegionalKnowledge,
            worldContext: getWorldConditionModifiers(gameState, targetLeague.country),
            developmentEnvironment: projectProspectiveDevelopmentEnvironment(
              gameState,
              unsignedYouthRecord.player,
              targetClub.id,
            ),
          })] as const];
        })
      : [],
  );
  const latestHypotheses = (() => {
    const byId = new Map<string, ReflectionHypothesisRecord>();
    [...dossierEntries].reverse().forEach((entry) => entry.hypotheses.forEach((hypothesis) => {
      byId.set(hypothesis.id, hypothesis);
    }));
    return [...byId.values()];
  })();
  const nextObservationContext = unsignedYouthRecord && !unsignedYouthRecord.placed
    ? getHighestValueNextContext({
        observations,
        playerId: canonicalPlayerId,
        candidateContexts: [
          "schoolMatch",
          "grassrootsTournament",
          "academyTrialDay",
          "followUpSession",
          "parentCoachMeeting",
          "trainingGround",
        ],
        targetDomains: latestHypotheses
          .filter((hypothesis) => hypothesis.state !== "confirmed" && hypothesis.state !== "debunked")
          .map((hypothesis) => hypothesis.domain),
      })
    : null;
  const activeScoutingCase = selectMostRelevantScoutingCase(gameState, canonicalPlayerId);
  const caseQuestionSnapshot = activeScoutingCase
    ? deriveScoutingCaseQuestions({
        scoutingCases: gameState.scoutingCases,
        players: gameState.players,
        youthRecruitmentBriefs: gameState.youthRecruitmentBriefs,
        reports: gameState.reports,
        observations: gameState.observations,
        clubDecisions: gameState.clubDecisions,
        recommendationReviews: gameState.recommendationReviews,
        inbox: gameState.inbox,
        reflectionJournal: gameState.reflectionJournal,
      }, activeScoutingCase.id)
    : null;
  const activeCaseQuestion = caseQuestionSnapshot?.activeQuestions[0] ?? null;
  const recommendedCaseContexts = activeCaseQuestion?.recommendedContexts ?? [];
  const trackingYouthRivals = unsignedYouthRecord
    ? Object.values(gameState.rivalScouts)
        .filter((rival) =>
          rival.specialization === "youth"
          && rival.targetPlayerIds.includes(canonicalPlayerId)
        )
        .map((rival) => {
          const pressure = getYouthRivalPressure(rival, unsignedYouthRecord);
          return { rival, pressure, band: getYouthRivalPressureBand(pressure) };
        })
        .sort((left, right) => right.pressure - left.pressure)
    : [];
  const unansweredAttributes = Array.from(byDomain.values()).flatMap((domainAttrs) =>
    domainAttrs
      .filter(([, reading]) => !reading)
      .map(([attr]) => formatAttribute(attr)),
  );
  const evidenceSignals =
    observations.length + dossierEntries.length + dossierInboxIntel.length + contactIntel.length;
  const nextDecision =
    observations.length === 0
      ? "Get a live view before you commit."
      : reports.length === 0 && needsReportableYouthEvidence
      ? "Return with one question to answer."
      : reports.length === 0
      ? "Turn the read into a report."
      : foreignYouthCountry && !unsignedYouthRecord?.placed
      ? `Travel to ${getCountryDisplayName(foreignYouthCountry)} before escalating.`
      : unsignedYouthRecord && !unsignedYouthRecord.placed
      ? "Decide if this prospect is ready for placement."
      : "Choose the most useful follow-up.";
  const nextDecisionReason =
    observations.length === 0
      ? "You still need first-hand evidence."
      : reports.length === 0 && needsReportableYouthEvidence
      ? "The existing view did not leave a classified cue you can defend. Plan a focused observation and save the moment that answers your question."
      : reports.length === 0
      ? `${observations.length} observation${observations.length === 1 ? "" : "s"} and ${reportableEvidenceCount} saved cue${reportableEvidenceCount === 1 ? "" : "s"} are ready to become a report.`
      : unsignedYouthRecord && !unsignedYouthRecord.placed
      ? "Placement is the next professional call in this youth dossier."
      : unansweredAttributes.length > 0
      ? `${unansweredAttributes.length} attribute${unansweredAttributes.length === 1 ? "" : "s"} still need clarity.`
      : "The dossier is broad enough to decide whether to press or pause.";
  const identityLabel = unsignedYouthRecord
    ? unsignedYouthRecord.placed
      ? "Placed youth prospect"
      : "Unsigned youth prospect"
    : isRetired
    ? "Archived player profile"
    : "Active player dossier";

  return (
    <GameLayout>
      <div className="p-4 pb-32 sm:p-6 sm:pb-8 lg:p-8 [&_.text-zinc-500]:text-zinc-400 [&_.text-zinc-600]:text-zinc-400">
        {/* Back button */}
        <button
          onClick={() => setScreen(specialization === "youth" ? "youthScouting" : "playerDatabase")}
          className="mb-4 flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
          aria-label={specialization === "youth" ? "Back to prospects" : "Back to player database"}
        >
          <ArrowLeft size={15} aria-hidden="true" />
          {specialization === "youth" ? "Back to Prospects" : "Back to Players"}
        </button>

        {/* Header */}
        <div className="mb-5 flex flex-col gap-5 rounded-2xl border border-white/10 bg-[#10151b]/95 p-5 shadow-xl shadow-black/20 xl:flex-row xl:items-start xl:justify-between sm:p-6">
          <div className="flex flex-col items-start gap-4 sm:flex-row">
            <PlayerAvatar
              playerId={player.id}
              nationality={player.nationality}
              size={96}
            />
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
                {identityLabel}
              </p>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  {player.firstName} {player.lastName}
                </h1>
                <button
                  onClick={() => toggleWatchlist(canonicalPlayerId)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
                  aria-label={gameState.watchlist.includes(canonicalPlayerId) ? "Remove from watchlist" : "Add to watchlist"}
                >
                  <Star
                    size={18}
                    className={
                      gameState.watchlist.includes(canonicalPlayerId)
                        ? "text-amber-400 fill-amber-400"
                        : "text-zinc-600"
                    }
                  />
                </button>
              </div>
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <Badge variant="secondary">{player.position}</Badge>
                {player.injured && player.currentInjury && (
                  <Badge variant="destructive" className="text-[10px]">
                    <HeartPulse size={10} className="mr-1" />
                    Injured — {player.currentInjury.weeksRemaining}w
                  </Badge>
                )}
                {!player.injured && recurringInjuryConcern && (
                  <Badge className="border-amber-500/40 bg-amber-500/10 text-amber-400 text-[10px]">
                    Recurring Injury History
                  </Badge>
                )}
                <span className="text-sm text-zinc-400">
                  Age {player.age} — {player.nationality}
                </span>
                {unsignedYouthRecord ? (
                  <Badge className="border-amber-500/40 bg-amber-500/10 text-amber-400">
                    Unsigned
                  </Badge>
                ) : club ? (
                  <span className="flex items-center gap-1.5 text-sm text-zinc-400">
                    <ClubCrest clubId={club.id} clubName={club.name} size={32} />
                    {club.name}
                    {league ? ` (${league.shortName})` : ""}
                  </span>
                ) : null}
                {player.onLoan && player.loanParentClubId && (
                  <Badge className="border-sky-500/40 bg-sky-500/10 text-sky-400">
                    On Loan{getClub(player.loanParentClubId) ? ` from ${getClub(player.loanParentClubId)!.name}` : ""}
                  </Badge>
                )}
                <FormIndicator form={player.form} />
                {/* Form momentum badge */}
                {player.formTrend === "rising" && (player.formMomentum ?? 0) > 0 && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400"
                    title={`${(player.formMomentum ?? 0) + 3} consecutive strong performances`}
                  >
                    <Flame size={12} />
                    Hot Streak ({(player.formMomentum ?? 0) + 3} matches)
                  </span>
                )}
                {player.formTrend === "falling" && (player.formMomentum ?? 0) > 0 && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-medium text-sky-400"
                    title={`${(player.formMomentum ?? 0) + 3} consecutive poor performances`}
                  >
                    <Snowflake size={12} />
                    Cold Streak ({(player.formMomentum ?? 0) + 3} matches)
                  </span>
                )}
              </div>
            </div>
        </div>
          <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap xl:max-w-xl xl:justify-end [&>button]:min-h-11 [&>button]:w-full sm:[&>button]:w-auto">
            <Button
              onClick={() => startReport(canonicalPlayerId)}
              disabled={!canStartReport}
              title={needsReportableYouthEvidence ? "Complete a focused observation and save at least one classified cue first." : undefined}
              className="fixed inset-x-3 bottom-[calc(4rem+env(safe-area-inset-bottom)+0.75rem)] z-40 min-h-12 !w-auto shadow-2xl shadow-black/50 sm:static sm:z-auto sm:min-h-10 sm:!w-auto sm:shadow-none"
            >
              <FileText size={14} className="mr-2" />
              {needsReportableYouthEvidence ? "Build report evidence first" : "Write Report"}
            </Button>
            {club && (
              <Button
                variant="outline"
                onClick={() => {
                  setPendingFixtureClubFilter(club.shortName);
                  setScreen("fixtureBrowser");
                }}
              >
                <Eye size={14} className="mr-2" />
                Find Match
              </Button>
            )}
            {/* Tap Network — available for any player with contacts */}
            <Button
              variant="outline"
              onClick={() => {
                const result = tapNetworkForPlayer(canonicalPlayerId);
                if (result) setNetworkIntel(result);
              }}
              disabled={Object.keys(gameState.contacts).length === 0}
            >
              <Phone size={14} className="mr-2" />
              Tap Network
            </Button>
            {/* Negotiate Transfer — first-team scouts with a club can negotiate */}
            {gameState.scout.primarySpecialization === "firstTeam" &&
             gameState.scout.currentClubId &&
             Boolean(player.contractClubId ?? player.clubId) &&
             player.clubId !== gameState.scout.currentClubId &&
             !player.onLoan &&
             !unsignedYouthRecord &&
             !isRetired &&
             transferWindowOpen &&
             !(gameState.activeNegotiations ?? []).some(
               (n) => n.playerId === canonicalPlayerId && n.phase !== "completed" && n.phase !== "collapsed"
             ) && (
              <Button
                variant="outline"
                onClick={() => initiateTransferNegotiation(canonicalPlayerId)}
              >
                <Handshake size={14} className="mr-2" />
                Negotiate Transfer
              </Button>
            )}
            {/* Recommend for Loan — own-club players not on loan, age < 26 */}
            {!isRetired && transferWindowOpen && isOwnClubPlayer && !player.onLoan &&
              player.age < 26 && loanTargetClubs.length > 0 && (
              <Button
                variant="outline"
                disabled={pendingLoanRecommendation}
                onClick={() => {
                  setLoanTargetClubId(loanTargetClubs[0].id);
                  setLoanDuration(Math.round(seasonLength / 2));
                  setLoanDialogOpen(true);
                }}
                title={pendingLoanRecommendation ? "A loan recommendation is awaiting a response" : "Choose a development loan destination"}
              >
                <Send size={14} className="mr-2" />
                {pendingLoanRecommendation ? "Recommendation Pending" : "Recommend for Loan"}
              </Button>
            )}
            {foreignYouthCountry && !unsignedYouthRecord?.placed && (
              <Button
                variant="outline"
                onClick={() => {
                  setPendingInternationalCountry(foreignYouthCountry);
                  setScreen("internationalView");
                }}
              >
                <Globe size={14} className="mr-2" />
                Scout in {getCountryDisplayName(foreignYouthCountry)}
              </Button>
            )}
            {/* Youth-specific quick actions */}
            {unsignedYouthRecord && observations.length > 0 && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    const activity = {
                      type: "followUpSession" as const,
                      slots: ACTIVITY_SLOT_COSTS.followUpSession,
                      targetId: player.id,
                      scoutingQuestionId: activeCaseQuestion?.questionId,
                      scoutingQuestionIds: definedQuestionIds(caseQuestionSnapshot?.activeQuestions),
                      description: `Follow-up session: ${player.firstName} ${player.lastName}`,
                    };
                    // Find first available day slot
                    let scheduled = false;
                    for (let day = 0; day <= 7 - activity.slots; day++) {
                      if (canAddActivity(gameState.schedule, activity, day)) {
                        scheduleActivity(activity, day);
                        scheduled = true;
                        break;
                      }
                    }
                    if (scheduled) {
                      setPendingCalendarActivity({
                        type: "followUpSession",
                        targetId: player.id,
                        label: `Follow-Up: ${player.firstName} ${player.lastName}`,
                      });
                      setScreen("calendar");
                    } else {
                      window.alert("No free day slot available this week. Clear a day on the calendar first.");
                    }
                  }}
                >
                  <CalendarPlus size={14} className="mr-2" />
                  Schedule Follow-Up
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    const activity = {
                      type: "parentCoachMeeting" as const,
                      slots: ACTIVITY_SLOT_COSTS.parentCoachMeeting,
                      targetId: player.id,
                      scoutingQuestionId: activeCaseQuestion?.questionId,
                      scoutingQuestionIds: definedQuestionIds(caseQuestionSnapshot?.activeQuestions),
                      description: `Parent/Coach meeting: ${player.firstName} ${player.lastName}`,
                    };
                    let scheduled = false;
                    for (let day = 0; day <= 7 - activity.slots; day++) {
                      if (canAddActivity(gameState.schedule, activity, day)) {
                        scheduleActivity(activity, day);
                        scheduled = true;
                        break;
                      }
                    }
                    if (scheduled) {
                      setPendingCalendarActivity({
                        type: "parentCoachMeeting",
                        targetId: player.id,
                        label: `Meeting: ${player.firstName} ${player.lastName}`,
                      });
                      setScreen("calendar");
                    } else {
                      window.alert("No free day slot available this week. Clear a day on the calendar first.");
                    }
                  }}
                >
                  <Users size={14} className="mr-2" />
                  Meet Parents/Coach
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="sticky top-2 z-20">
          <PlayerProfileTabBar
            activeTab={activeTab}
            onChange={setActiveTab}
            tabs={PLAYER_PROFILE_TABS}
          />
        </div>

        {activeTab === "decision" && (
          <section
            id="player-profile-panel-decision"
            role="tabpanel"
            aria-labelledby="player-profile-tab-decision"
            className="space-y-5"
          >
        <Card className="mb-5 overflow-hidden border-emerald-400/20 bg-[radial-gradient(circle_at_top_right,rgba(52,211,153,0.1),transparent_42%),rgba(17,22,28,0.96)]">
          <CardContent className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">Next scouting decision</p>
              <h2 className="mt-2 text-xl font-bold text-white sm:text-2xl">{nextDecision}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">{nextDecisionReason}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-zinc-300">
                  {observations.length} live view{observations.length === 1 ? "" : "s"}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-zinc-300">
                  {evidenceSignals} evidence signal{evidenceSignals === 1 ? "" : "s"}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-zinc-300">
                  {reports.length} filed report{reports.length === 1 ? "" : "s"}
                </span>
              </div>
            </div>
            <Button
              className="min-h-11 w-full lg:w-auto"
              onClick={() => {
                if (canStartReport && reports.length === 0) {
                  startReport(canonicalPlayerId);
                  return;
                }
                setScreen("calendar");
              }}
            >
              {observations.length === 0
                ? "Plan first observation"
                : needsReportableYouthEvidence
                  ? "Plan focused observation"
                : reports.length === 0
                  ? "Write the report"
                  : "Plan next action"}
              <ChevronRight size={16} className="ml-2" aria-hidden="true" />
            </Button>
          </CardContent>
        </Card>

        {unsignedYouthRecord && !unsignedYouthRecord.placed && (
          <section className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]" aria-label="Academy case evidence">
            <Card className="border-sky-400/20 bg-[#111820]/95">
              <CardHeader className="p-5 pb-3">
                <CardTitle className="flex items-center gap-2 text-base text-white">
                  <ClipboardList size={17} className="text-sky-300" aria-hidden="true" />
                  Brief fit and opportunity cost
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-5 pt-1">
                {relevantBriefs.length === 0 ? (
                  <p className="text-sm leading-6 text-zinc-400">No open academy brief currently matches this player&apos;s position and age. A speculative report can still preserve the judgment, but it has no immediate club need behind it.</p>
                ) : relevantBriefs.slice(0, 2).map((brief) => {
                  const mobility = mobilityByBriefId.get(brief.id);
                  return (
                  <div key={brief.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-300">{gameState.clubs[brief.clubId]?.name ?? "Academy client"}</p>
                        <p className="mt-1 font-semibold text-white">{brief.requiredPositions.join("/")} · {brief.preferredRole ? formatAttribute(brief.preferredRole) : "Open role"}</p>
                      </div>
                      <Badge variant={brief.competitionPressure >= 70 ? "warning" : "outline"} className="text-[10px]">
                        {brief.competitionPressure}/100 pressure
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-zinc-300">
                      <span className="rounded-full border border-white/10 px-2 py-1">Due S{brief.expiresSeason} W{brief.expiresWeek}</span>
                      <span className="rounded-full border border-white/10 px-2 py-1">£{brief.weeklyWageBudget.toLocaleString()}/wk</span>
                      <span className="rounded-full border border-white/10 px-2 py-1 capitalize">{brief.riskTolerance} risk</span>
                    </div>
                    {mobility && (
                      <div
                        className={`mt-4 rounded-lg border p-3 ${
                          mobility.status === "blocked"
                            ? "border-red-400/30 bg-red-400/[0.08]"
                            : mobility.status === "conditional"
                              ? "border-amber-400/30 bg-amber-400/[0.08]"
                              : "border-emerald-400/25 bg-emerald-400/[0.07]"
                        }`}
                        data-testid={`mobility-route-${brief.id}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
                              Mobility and registration
                            </p>
                            <p className="mt-1 text-xs font-semibold text-white">
                              {mobility.originCountry.label} to {mobility.targetCountry.label}
                            </p>
                          </div>
                          <Badge
                            variant={mobility.status === "blocked" ? "destructive" : mobility.status === "conditional" ? "warning" : "success"}
                            className="text-[10px] capitalize"
                          >
                            {mobility.status} · risk {mobility.overallRiskScore}/100
                          </Badge>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-zinc-300">
                          {mobility.clubDecisionAdjustment.summary}
                        </p>
                        <details className="mt-2 rounded-md border border-white/10 bg-black/15 px-3 py-2 text-xs">
                          <summary className="min-h-7 cursor-pointer select-none py-1 font-medium text-sky-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300">
                            Review route evidence and next step
                          </summary>
                          <ul className="mt-2 space-y-1.5 leading-5 text-zinc-300">
                            {mobility.visibleReasons.slice(0, 3).map((reason) => (
                              <li key={reason} className="flex gap-2">
                                <span className="text-sky-300" aria-hidden="true">•</span>
                                <span>{reason}</span>
                              </li>
                            ))}
                          </ul>
                          {mobility.suggestedMitigationActions[0] && (
                            <p className="mt-3 border-t border-white/10 pt-2 leading-5 text-amber-100">
                              Next step: {mobility.suggestedMitigationActions[0]}
                            </p>
                          )}
                          <p className="mt-2 text-[10px] leading-4 text-zinc-500">
                            {mobility.modelNotice}
                          </p>
                        </details>
                      </div>
                    )}
                  </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card className="border-violet-400/20 bg-[#15131d]/95">
              <CardHeader className="p-5 pb-3">
                <CardTitle className="flex items-center gap-2 text-base text-white">
                  <Target size={17} className="text-violet-300" aria-hidden="true" />
                  Highest-value next evidence
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 pt-1">
                {nextObservationContext ? (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-lg font-bold text-white">{formatAttribute(nextObservationContext.context)}</p>
                        <p className="mt-1 text-xs text-zinc-400">{nextObservationContext.sourceFamily} evidence family</p>
                      </div>
                      <Badge variant={nextObservationContext.gainBand === "high" ? "success" : nextObservationContext.gainBand === "medium" ? "warning" : "outline"}>
                        {evidenceOpportunityLabel(nextObservationContext.gainBand)}
                      </Badge>
                    </div>
                    <ul className="mt-4 space-y-2 text-xs leading-5 text-zinc-300">
                      {nextObservationContext.reasons.slice(0, 3).map((reason) => (
                        <li key={reason} className="flex gap-2"><span className="text-violet-300">•</span><span>{reason}</span></li>
                      ))}
                    </ul>
                    <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-zinc-400">
                      <span>{latestHypotheses.length} preserved hypothes{latestHypotheses.length === 1 ? "is" : "es"}</span>
                      <span>·</span>
                      <span>{nextObservationContext.sameContextIndependentSources} prior independent source{nextObservationContext.sameContextIndependentSources === 1 ? "" : "s"} in this context</span>
                    </div>
                    <Button className="mt-4 min-h-11 w-full" variant="outline" onClick={() => setScreen("calendar")}>Plan this evidence</Button>
                  </>
                ) : (
                  <p className="text-sm text-zinc-400">No further youth evidence is currently required.</p>
                )}
              </CardContent>
            </Card>
            {trackingYouthRivals.length > 0 && (
              <Card className="border-red-400/20 bg-red-400/[0.05] lg:col-span-2">
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-red-300">Contested prospect</p>
                      <h3 className="mt-1 text-base font-bold text-white">Other scouts are building their own case</h3>
                    </div>
                    <Badge variant="destructive">{trackingYouthRivals.length} rival{trackingYouthRivals.length === 1 ? "" : "s"}</Badge>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {trackingYouthRivals.slice(0, 4).map(({ rival, pressure, band }) => (
                      <div key={rival.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-white">{rival.name}</p>
                          <Badge variant={band === "imminent" ? "destructive" : band === "contested" ? "warning" : "outline"} className="text-[10px]">{band}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-zinc-400">{gameState.clubs[rival.clubId]?.name ?? "Rival organization"} · Pressure {pressure}/100</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </section>
        )}
            <details className="group rounded-2xl border border-white/10 bg-[#10151b]/90">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 [&::-webkit-details-marker]:hidden">
                <span>Case reasoning and callbacks</span>
                <span className="text-xs font-normal text-zinc-400 group-open:hidden">Open expert detail</span>
                <span className="hidden text-xs font-normal text-zinc-400 group-open:inline">Hide expert detail</span>
              </summary>
              <div className="space-y-5 border-t border-white/10 p-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-zinc-500">Position</p>
                  <p className="mt-1 font-semibold">{player.position}</p>
                  {displayedRoles[0] && (
                    <p className="mt-1 text-xs text-zinc-400">
                      Best role read: {formatAttribute(displayedRoles[0].role)}
                    </p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-zinc-500">Opportunity</p>
                  <p className="mt-1 font-semibold text-emerald-400">{relevantBriefs.length}</p>
                  <p className="text-xs text-zinc-400">open relevant brief{relevantBriefs.length === 1 ? "" : "s"}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-zinc-500">Open question</p>
                  <p className="mt-1 font-semibold text-white">
                    {caseQuestionSnapshot?.activeQuestions.length ?? (nextObservationContext ? 1 : 0)}
                  </p>
                  <p className="text-xs text-zinc-400">current evidence gap{(caseQuestionSnapshot?.activeQuestions.length ?? 0) === 1 ? "" : "s"}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-zinc-500">Market value</p>
                  <p className="mt-1 font-semibold text-emerald-400">{formatMarketValue(player.marketValue)}</p>
                  <p className="text-xs text-zinc-400">{reports.length} filed report{reports.length === 1 ? "" : "s"}</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
              <Card className="border-emerald-400/20 bg-[#111820]/95">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base text-white">Decision focus</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">Central question</p>
                    <p className="mt-2 text-sm leading-6 text-zinc-200">
                      {caseQuestionSnapshot?.centralQuestion ?? nextDecision}
                    </p>
                  </div>
                  {caseQuestionSnapshot?.activeQuestions.length ? (
                    <div className="space-y-3">
                      {caseQuestionSnapshot.activeQuestions.slice(0, 2).map((question) => (
                        <div key={question.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-white">{question.prompt}</p>
                            <Badge variant="outline" className="text-[10px] capitalize">
                              {question.family}
                            </Badge>
                          </div>
                          <p className="mt-2 text-xs leading-5 text-zinc-400">{question.whyNow}</p>
                          <p className="mt-2 text-xs text-amber-200/80">Gap: {question.evidenceGap}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-300">
                      No formal scouting case is driving this profile yet. The next step is still to preserve a changed-context judgment.
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      className="min-h-11"
                      onClick={() => startReport(canonicalPlayerId)}
                      disabled={!canStartReport}
                      title={needsReportableYouthEvidence ? "Complete a focused observation and save at least one classified cue first." : undefined}
                    >
                      <FileText size={14} className="mr-2" />
                      Write Report
                    </Button>
                    <Button className="min-h-11" variant="outline" onClick={() => setScreen("calendar")}>
                      <CalendarPlus size={14} className="mr-2" />
                      Plan next action
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-violet-400/20 bg-[#15131d]/95">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base text-white">Best next evidence</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {recommendedCaseContexts.length > 0 ? (
                    <>
                      {recommendedCaseContexts.map((entry) => (
                        <div key={entry.context} className="rounded-xl border border-white/10 bg-black/20 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-white">{formatAttribute(entry.context)}</p>
                            <Badge variant={entry.score >= 78 ? "success" : entry.score >= 52 ? "warning" : "outline"}>
                              {entry.score >= 78
                                ? "Strong fit"
                                : entry.score >= 52
                                  ? "Useful fit"
                                  : "Exploratory"}
                            </Badge>
                          </div>
                          <p className="mt-2 text-xs leading-5 text-zinc-400">{entry.reason}</p>
                        </div>
                      ))}
                    </>
                  ) : nextObservationContext ? (
                    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-white">{formatAttribute(nextObservationContext.context)}</p>
                        <Badge variant={nextObservationContext.gainBand === "high" ? "success" : nextObservationContext.gainBand === "medium" ? "warning" : "outline"}>
                          {evidenceOpportunityLabel(nextObservationContext.gainBand)}
                        </Badge>
                      </div>
                      <ul className="mt-3 space-y-2 text-xs leading-5 text-zinc-400">
                        {nextObservationContext.reasons.slice(0, 3).map((reason) => (
                          <li key={reason} className="flex gap-2"><span className="text-violet-300">•</span><span>{reason}</span></li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-300">
                      No additional context currently outranks the existing file.
                    </div>
                  )}
                  {(caseQuestionSnapshot?.callbacks.length ?? 0) > 0 && (
                    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Recent callbacks</p>
                      <div className="mt-3 space-y-2">
                        {caseQuestionSnapshot?.callbacks.slice(0, 3).map((callback) => (
                          <div key={callback.id}>
                            <p className="text-sm font-semibold text-white">{callback.title}</p>
                            <p className="text-xs leading-5 text-zinc-400">{callback.summary}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
              </div>
            </details>
          </section>
        )}

        {activeTab === "development" && (
          <section
            id="player-profile-panel-development"
            role="tabpanel"
            aria-labelledby="player-profile-tab-development"
          >
        {/* Overview */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-zinc-500">Position</p>
              <p className="mt-1 font-semibold">{player.position}</p>
              {player.secondaryPositions.length > 0 && (
                <p className="text-xs text-zinc-500">{player.secondaryPositions.join(", ")}</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-zinc-500">Preferred Foot</p>
              <p className="mt-1 font-semibold capitalize">{player.preferredFoot}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-zinc-500">Market Value</p>
              <p className="mt-1 font-semibold text-emerald-400">
                {formatMarketValue(player.marketValue)}
              </p>
            </CardContent>
          </Card>
          {!isRetired && player.clubId && player.contractExpiry > 0 && (
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-zinc-500">Contract Expires</p>
                <p className="mt-1 font-semibold">Season {player.contractExpiry}</p>
              </CardContent>
            </Card>
          )}
          {/* Loan Status */}
          {!isRetired && player.onLoan && player.loanParentClubId && (
            <Card className="border-sky-500/20 bg-sky-500/5">
              <CardContent className="p-4">
                <p className="text-xs text-sky-400">On Loan</p>
                <p className="mt-1 text-sm font-semibold text-zinc-200">
                  From {getClub(player.loanParentClubId)?.name ?? "Unknown"}
                </p>
                {player.loanEndWeek != null && player.loanEndSeason != null && (
                  <p className="mt-0.5 text-xs text-zinc-400">
                    Returns: Season {player.loanEndSeason}, Week {player.loanEndWeek}
                  </p>
                )}
                {/* Recall from Loan button */}
                {(() => {
                  const deal = (gameState.activeLoans ?? []).find((l) => l.playerId === player.id);
                  if (!deal?.recallClause) return null;
                  const windowOpen = gameState.transferWindow
                    ? isTransferWindowOpen([gameState.transferWindow], gameState.currentWeek)
                    : false;
                  return (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 w-full border-sky-500/30 text-sky-400 hover:bg-sky-500/10"
                      disabled={!windowOpen}
                      onClick={() => recallLoanPlayer(deal.id)}
                      title={windowOpen ? "Recall player from loan" : "Transfer window is closed"}
                    >
                      <RotateCcw size={12} className="mr-1.5" />
                      {windowOpen ? "Recall from Loan" : "Window Closed"}
                    </Button>
                  );
                })()}
              </CardContent>
            </Card>
          )}
          {/* Free Agent Badge */}
          {!isRetired && !player.clubId && player.contractExpiry === 0 && gameState.freeAgentPool?.agents.some(
            (a) => a.playerId === player.id && a.status === "available"
          ) && (
            <Card className="border-emerald-500/20 bg-emerald-500/5">
              <CardContent className="p-4">
                <p className="text-xs text-emerald-400">Free Agent</p>
                <p className="mt-1 text-sm text-zinc-300">Available to sign</p>
              </CardContent>
            </Card>
          )}
          {isRetired && (
            <Card className="border-zinc-500/30 bg-zinc-500/5">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-zinc-300">Retired</p>
                <p className="mt-1 text-sm text-zinc-500">Career record preserved</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Unsigned Youth Details */}
        {unsignedYouthRecord && (
          <div className="mb-6">
            <Card className="border-amber-500/20 bg-amber-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm text-amber-400">
                  <GraduationCap size={14} aria-hidden="true" />
                  Unsigned Youth Prospect
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {/* Buzz level */}
                  <div>
                    <p className="mb-1 text-xs text-zinc-500">Buzz Level</p>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-amber-400 transition-all"
                        style={{ width: `${unsignedYouthRecord.buzzLevel}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs font-medium text-white">{unsignedYouthRecord.buzzLevel}/100</p>
                  </div>

                  {/* Visibility */}
                  <div>
                    <p className="mb-1 text-xs text-zinc-500">Visibility</p>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${unsignedYouthRecord.visibility}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs font-medium text-white">{unsignedYouthRecord.visibility}/100</p>
                  </div>

                  {/* Discovered by */}
                  <div>
                    <p className="mb-1 text-xs text-zinc-500">Discovered By</p>
                    <p className="text-lg font-medium text-white">
                      {unsignedYouthRecord.discoveredBy.length}
                      <span className="ml-1 text-xs text-zinc-500">scout{unsignedYouthRecord.discoveredBy.length !== 1 ? "s" : ""}</span>
                    </p>
                  </div>

                  {/* Status */}
                  <div>
                    <p className="mb-1 text-xs text-zinc-500">Status</p>
                    <p className="text-sm font-medium">
                      {unsignedYouthRecord.placed ? (
                        <span className="text-emerald-400">Placed</span>
                      ) : (
                        <span className="text-amber-400">Available</span>
                      )}
                    </p>
                  </div>
                </div>

                <p className="mt-4 text-xs text-zinc-400">
                  Based in <span className="font-medium text-white">{getCountryDisplayName(unsignedYouthRecord.country)}</span>
                  {foreignYouthCountry ? " — you will need to travel there to scout in person." : "."}
                </p>

                {!unsignedYouthRecord.placed && latestReport && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 min-h-11 border-amber-500/40 text-amber-300 hover:border-amber-400 hover:text-amber-200"
                    onClick={() => {
                      setPendingCalendarActivity({
                        type: "writePlacementReport",
                        targetId: unsignedYouthRecord.player.id,
                        label: `Placement: ${unsignedYouthRecord.player.firstName} ${unsignedYouthRecord.player.lastName}`,
                      });
                      setScreen("calendar");
                    }}
                  >
                    <FileText size={12} className="mr-1.5" aria-hidden="true" />
                    Pitch Filed Report
                  </Button>
                )}
                {!unsignedYouthRecord.placed && !latestReport && canStartReport && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 min-h-11 border-emerald-500/40 text-emerald-300 hover:border-emerald-400 hover:text-emerald-200"
                    onClick={() => startReport(canonicalPlayerId)}
                  >
                    <FileText size={12} className="mr-1.5" aria-hidden="true" />
                    File Report First
                  </Button>
                )}
                {!unsignedYouthRecord.placed && !latestReport && !canStartReport && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 min-h-11"
                    onClick={() => setScreen("calendar")}
                  >
                    {observations.length === 0 ? "Plan First Observation" : "Plan Focused Observation"}
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        </section>
        )}

        {/* Ability Assessment */}
        <div hidden={activeTab !== "evidence"}>
        {aggregatedAbility && (
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="flex items-center gap-1 text-xs text-zinc-500">
                    Current Ability
                    <HelpTooltip text="A player's current ability level on a 1-5 star scale. Higher stars = better player right now." />
                  </p>
                  <div
                    className={`h-2 w-2 rounded-full ${confidenceColor(aggregatedAbility.caConfidence)}`}
                    title={`${confidenceLabel(aggregatedAbility.caConfidence)} confidence`}
                  />
                </div>
                <StarRatingRange
                  low={aggregatedAbility.caLow}
                  high={aggregatedAbility.caHigh}
                  confidence={aggregatedAbility.caConfidence}
                  size="lg"
                />
                {aggregatedAbility.caConfidence < 0.5 && (
                  <p className="mt-2 text-[10px] text-zinc-500">
                    More observations will narrow this range
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-zinc-500">Potential</p>
                  <div
                    className={`h-2 w-2 rounded-full ${confidenceColor(aggregatedAbility.paConfidence)}`}
                    title={`${confidenceLabel(aggregatedAbility.paConfidence)} confidence`}
                  />
                </div>
                <StarRatingRange
                  low={aggregatedAbility.paLow}
                  high={aggregatedAbility.paHigh}
                  confidence={aggregatedAbility.paConfidence}
                  size="lg"
                />
                {player.age <= 21 &&
                  aggregatedAbility.paHigh - aggregatedAbility.paLow > 1.0 && (
                    <p className="mt-2 text-[10px] text-zinc-500">
                      More observations will narrow this range
                    </p>
                  )}
              </CardContent>
            </Card>
          </div>
        )}
        </div>

        <section
          id={activeTab === "history" ? "player-profile-panel-history" : "player-profile-panel-evidence"}
          role="tabpanel"
          aria-labelledby={activeTab === "history" ? "player-profile-tab-history" : "player-profile-tab-evidence"}
          aria-label={activeTab === "history" ? "Player history" : "Player evidence"}
          hidden={activeTab !== "evidence" && activeTab !== "history"}
          className={activeTab === "evidence" ? "grid grid-cols-1 gap-6 lg:grid-cols-3" : ""}
        >
          {/* Attribute table */}
          <div className={activeTab === "evidence" ? "space-y-4 lg:col-span-2" : "hidden"}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-zinc-500">
                Scouting Data
                <HelpTooltip text="Confidence shows how certain you are about this player's attributes. Higher confidence means more accurate readings. Observe in multiple contexts to increase confidence." />
              </h2>
            </div>
            {DOMAIN_ORDER.map((domain) => {
              const domainAttrs = byDomain.get(domain) ?? [];
              if (domainAttrs.length === 0) return null;
              const hasAny = domainAttrs.some(([, r]) => !!r);
              if (!hasAny) return null;
              const unknownSummary = summarizeUnknownAttributes(
                domainAttrs.map(([attr, reading]) => [formatAttribute(attr), reading]),
              );
              const showUnknown = expandedUnknownDomains[domain] ?? false;
              const visibleDomainAttrs = showUnknown
                ? domainAttrs
                : domainAttrs.filter(([, reading]) => Boolean(reading));
              return (
                <Card key={domain}>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className="text-sm">{DOMAIN_LABELS[domain]}</CardTitle>
                      {unknownSummary.hiddenCount > 0 && (
                        <button
                          type="button"
                          onClick={() => setExpandedUnknownDomains((current) => ({
                            ...current,
                            [domain]: !showUnknown,
                          }))}
                          className="text-[11px] font-medium text-zinc-400 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
                        >
                          {showUnknown
                            ? `Hide ${unknownSummary.hiddenCount} unknown`
                            : `Show ${unknownSummary.hiddenCount} unknown`}
                        </button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className="space-y-2">
                      {visibleDomainAttrs.map(([attr, reading]) => (
                        <div key={attr} className="flex items-center gap-3">
                          <Tooltip content="Your estimated reading of this attribute. Accuracy depends on observations, lens focus, and scout skills." side="right">
                            <span className="w-32 shrink-0 text-xs capitalize text-zinc-400">
                              {attr.replace(/([A-Z])/g, " $1").trim()}
                            </span>
                          </Tooltip>
                          {reading ? (
                            <>
                              <div className="flex-1 relative h-1.5 rounded-full bg-[#27272a] overflow-hidden">
                                <div
                                  className={`absolute top-0 h-full rounded-full ${attributeValueColor(reading.perceivedValue)}`}
                                  style={{
                                    left: `${(((reading.rangeLow ?? reading.perceivedValue) - 1) / 19) * 100}%`,
                                    width: `${((((reading.rangeHigh ?? reading.perceivedValue) - (reading.rangeLow ?? reading.perceivedValue)) || 1) / 19) * 100}%`,
                                  }}
                                />
                              </div>
                              <AttributeValueTooltip value={reading.perceivedValue} confidence={reading.confidence}>
                                <span className="w-10 shrink-0 text-right text-xs font-mono font-medium text-white cursor-help">
                                  {reading.rangeLow != null && reading.rangeHigh != null && reading.rangeLow !== reading.rangeHigh
                                    ? `${reading.rangeLow}-${reading.rangeHigh}`
                                    : reading.perceivedValue}
                                </span>
                              </AttributeValueTooltip>
                              <span className="w-6 shrink-0 text-right text-[10px] text-zinc-500" title={`${reading.observationCount} observation${reading.observationCount !== 1 ? "s" : ""}`}>
                                {reading.observationCount}x
                              </span>
                            </>
                          ) : (
                            <>
                              <div className="flex-1 h-1.5 rounded-full bg-[#27272a]" />
                              <span className="w-8 shrink-0 text-right text-xs text-zinc-600">?</span>
                              <div className="h-2 w-2 shrink-0 rounded-full bg-zinc-700" />
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                    {!showUnknown && unknownSummary.hiddenCount > 0 && (
                      <p className="mt-3 text-[11px] leading-5 text-zinc-500">
                        Hidden by default: {unknownSummary.hiddenLabels.slice(0, 4).join(", ")}
                        {unknownSummary.hiddenLabels.length > 4 ? ` and ${unknownSummary.hiddenLabels.length - 4} more.` : "."}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}

            {observations.length === 0 && (
              <div className="rounded-lg border border-[#27272a] bg-[#141414] p-6 text-center">
                <Eye size={24} className="mx-auto mb-2 text-zinc-600" aria-hidden="true" />
                <p className="text-sm text-zinc-500">No observations recorded yet.</p>
                <p className="text-xs text-zinc-600 mt-1">
                  Attend a match and focus on this player to gather data.
                </p>
              </div>
            )}

            {/* Personality Profile */}
            {player.personalityProfile && (
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-3">
                  Character Profile
                </h2>
                <Card>
                  <CardContent className="px-4 pb-4 pt-4">
                    {player.personalityProfile.hiddenUntilRevealed ? (
                      <div className="text-center py-2">
                        <p className="text-xs text-zinc-500">
                          Character type not yet identified. Continue observing to uncover their personality.
                        </p>
                        {player.personalityProfile.revealedTraits.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2 justify-center">
                            {player.personalityProfile.revealedTraits.map((trait) => (
                              <span
                                key={trait}
                                className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-300"
                              >
                                {trait.replace(/([A-Z])/g, " $1").trim()}
                              </span>
                            ))}
                          </div>
                        )}
                        {player.personalityProfile.traits.length > player.personalityProfile.revealedTraits.length && (
                          <div className="mt-2 flex justify-center gap-1">
                            {Array.from({ length: player.personalityProfile.traits.length - player.personalityProfile.revealedTraits.length }).map((_, i) => (
                              <span
                                key={`q-${i}`}
                                className="rounded-full bg-zinc-700/50 px-3 py-1 text-xs font-medium text-zinc-500"
                              >
                                ?
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <Tooltip content={ARCHETYPE_DESCRIPTIONS[player.personalityProfile.archetype]} side="top">
                            <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400 cursor-help underline decoration-dotted underline-offset-2">
                              {ARCHETYPE_LABELS[player.personalityProfile.archetype]}
                            </span>
                          </Tooltip>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {player.personalityProfile.revealedTraits.map((trait) => (
                            <span
                              key={trait}
                              className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-300"
                            >
                              {trait.replace(/([A-Z])/g, " $1").trim()}
                            </span>
                          ))}
                          {player.personalityProfile.traits.length > player.personalityProfile.revealedTraits.length && (
                            Array.from({ length: player.personalityProfile.traits.length - player.personalityProfile.revealedTraits.length }).map((_, i) => (
                              <span
                                key={`h-${i}`}
                                className="rounded-full bg-zinc-700/50 px-3 py-1 text-xs font-medium text-zinc-500"
                              >
                                ?
                              </span>
                            ))
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-zinc-500">Transfer Willingness</span>
                            <span className={`text-xs font-medium ${player.personalityProfile.transferWillingness >= 0.7 ? "text-red-400" : player.personalityProfile.transferWillingness >= 0.4 ? "text-amber-400" : "text-emerald-400"}`}>
                              {player.personalityProfile.transferWillingness >= 0.7 ? "High" : player.personalityProfile.transferWillingness >= 0.4 ? "Medium" : "Low"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-zinc-500">Dressing Room</span>
                            <span className={`text-xs font-medium ${player.personalityProfile.dressingRoomImpact >= 2 ? "text-emerald-400" : player.personalityProfile.dressingRoomImpact >= 0 ? "text-zinc-300" : "text-red-400"}`}>
                              {player.personalityProfile.dressingRoomImpact >= 2 ? "Positive" : player.personalityProfile.dressingRoomImpact >= 0 ? "Neutral" : "Negative"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-zinc-500">Consistency</span>
                            <span className={`text-xs font-medium ${player.personalityProfile.formVolatility <= 0.3 ? "text-emerald-400" : player.personalityProfile.formVolatility <= 0.6 ? "text-amber-400" : "text-red-400"}`}>
                              {player.personalityProfile.formVolatility <= 0.3 ? "Very Consistent" : player.personalityProfile.formVolatility <= 0.6 ? "Moderate" : "Volatile"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-zinc-500">Big Match</span>
                            <span className={`text-xs font-medium ${player.personalityProfile.bigMatchModifier >= 1 ? "text-emerald-400" : player.personalityProfile.bigMatchModifier >= 0 ? "text-zinc-300" : "text-red-400"}`}>
                              {player.personalityProfile.bigMatchModifier >= 2 ? "Thrives" : player.personalityProfile.bigMatchModifier >= 1 ? "Rises" : player.personalityProfile.bigMatchModifier >= 0 ? "Neutral" : "Struggles"}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Behavioral Traits */}
            {(player.playerTraitsRevealed?.length ?? 0) > 0 && (
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-3">
                  Behavioral Traits
                </h2>
                <div className="flex flex-wrap gap-2">
                  {player.playerTraitsRevealed!.map((trait) => (
                    <span
                      key={trait}
                      className="rounded-full bg-violet-500/15 px-3 py-1 text-xs font-medium text-violet-300"
                    >
                      {trait.replace(/([A-Z])/g, " $1").trim()}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Tactical-role conclusions must come from authored or observed evidence. */}
            {displayedRoles.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-3">
                  Tactical Role
                </h2>
                <Card>
                  <CardContent className="px-4 pb-4 pt-4">
                    <div className="space-y-2">
                      {displayedRoles.map((role, index) => (
                        <div className="flex items-center gap-3" key={role.role}>
                          <span className="text-xs text-zinc-400">
                            {index === 0 ? "Best evidence" : "Alternative"}
                          </span>
                          <span className="rounded bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-400">
                            {role.role.replace(/([A-Z])/g, " $1").trim()}
                          </span>
                          {role.suitability !== undefined && (
                            <span className="text-[10px] text-zinc-500">
                              {role.suitability}% observed fit
                            </span>
                          )}
                        </div>
                      ))}
                      <p className="text-[10px] text-zinc-500">
                        {latestAuthoredRole
                          ? "From your latest submitted role projection."
                          : "Aggregated from role-fit evidence in your observations."}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
                Evidence Board
              </h2>
              <EvidenceBoard
                playerName={`${player.firstName} ${player.lastName}`}
                observations={observations}
                contactIntel={contactIntel}
                npcReports={npcEvidenceReports}
                currentWeek={gameState.currentWeek}
                currentSeason={gameState.currentSeason}
                seasonLength={seasonLength}
                messages={dossierInboxIntel.map((message) => ({
                  id: message.id,
                  title: message.title,
                  body: message.body,
                  week: message.week,
                  season: message.season,
                }))}
                flaggedMoments={dossierEntries.flatMap((entry) => entry.flaggedMoments)}
                hypotheses={latestHypotheses}
                reports={reports}
                unknowns={unansweredAttributes.slice(0, 6).map((attribute) =>
                  `${attribute} has not been observed with enough clarity.`,
                )}
                onStartReport={canStartReport ? () => startReport(canonicalPlayerId) : undefined}
              />
            </div>

            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-3">
                Evidence Log
              </h2>
              <Card>
                <CardContent className="px-4 pb-4 pt-4">
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                    <section aria-label="Reflection journal evidence" className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <FileText size={13} className="text-sky-400" aria-hidden="true" />
                          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                            Journal
                          </p>
                        </div>
                        <span className="text-[10px] text-zinc-600">
                          {dossierEntries.length} saved
                        </span>
                      </div>

                      {dossierEntries.length === 0 ? (
                        <div className="rounded-md border border-dashed border-[#27272a] bg-[#111111] px-3 py-4">
                          <p className="text-xs text-zinc-500">
                            No durable reflection entries saved for this player yet.
                          </p>
                        </div>
                      ) : (
                        dossierEntries.slice(0, 3).map((entry) => (
                          <article
                            key={entry.id}
                            className="rounded-md border border-[#27272a] bg-[#141414] p-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-medium text-white">
                                  {formatObservationActivityLabel(entry.activityType)}
                                </p>
                                <p className="mt-0.5 text-[10px] text-zinc-500">
                                  {formatSeasonWeekLabel(entry.season, entry.week)}
                                </p>
                              </div>
                              <div className="flex flex-wrap justify-end gap-1">
                                {entry.flaggedMoments.length > 0 && (
                                  <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-amber-300">
                                    {entry.flaggedMoments.length} moment{entry.flaggedMoments.length === 1 ? "" : "s"}
                                  </span>
                                )}
                                {entry.hypotheses.length > 0 && (
                                  <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-sky-300">
                                    {entry.hypotheses.length} hypothes{entry.hypotheses.length === 1 ? "is" : "es"}
                                  </span>
                                )}
                              </div>
                            </div>

                            {entry.summary && (
                              <p className="mt-2 text-xs leading-relaxed text-zinc-300">
                                {entry.summary}
                              </p>
                            )}

                            {entry.flaggedMoments.length > 0 && (
                              <div className="mt-3 space-y-2">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                                  Flagged Moments
                                </p>
                                {entry.flaggedMoments.slice(0, 2).map((moment) => {
                                  const reactionDisplay = getFlaggedReactionDisplay(moment.reaction);
                                  return (
                                    <div key={moment.id} className="rounded-md border border-[#202020] bg-[#101010] p-2.5">
                                      <div className="flex items-center justify-between gap-2">
                                        <p className="text-[10px] text-zinc-500">
                                          {moment.minute}&apos; · {formatMomentType(moment.momentType)}
                                          {moment.pressureContext ? " · Under pressure" : ""}
                                        </p>
                                        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide ${reactionDisplay.className}`}>
                                          {reactionDisplay.label}
                                        </span>
                                      </div>
                                      <p className="mt-1 text-xs leading-relaxed text-zinc-300">
                                        {moment.description}
                                      </p>
                                      {moment.note && (
                                        <p className="mt-1 text-[11px] text-zinc-500">
                                          Note: {moment.note}
                                        </p>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {entry.hypotheses.length > 0 && (
                              <div className="mt-3 space-y-2">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                                  Hypotheses
                                </p>
                                {entry.hypotheses.slice(0, 2).map((hypothesis) => {
                                  const hypothesisDisplay = getHypothesisStateDisplay(hypothesis.state);
                                  const forEvidence = (hypothesis.evidence ?? []).filter((item) => item.direction === "for");
                                  const againstEvidence = (hypothesis.evidence ?? []).filter((item) => item.direction === "against");
                                  const evidence = hypothesis.evidence ?? [];
                                  const latestEvidence = evidence[evidence.length - 1];

                                  return (
                                    <div key={hypothesis.id} className="rounded-md border border-[#202020] bg-[#101010] p-2.5">
                                      <div className="flex items-start justify-between gap-2">
                                        <p className="text-xs leading-relaxed text-zinc-300">
                                          {hypothesis.text}
                                        </p>
                                        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide ${hypothesisDisplay.className}`}>
                                          {hypothesisDisplay.label}
                                        </span>
                                      </div>
                                      <p className="mt-1 text-[10px] text-zinc-500">
                                        {formatAttribute(hypothesis.domain)} · {forEvidence.length} for · {againstEvidence.length} against
                                      </p>
                                      {latestEvidence && (
                                        <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
                                          Latest evidence: {latestEvidence.description}
                                        </p>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {entry.notes.length > 0 && (
                              <div className="mt-3 space-y-1.5">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                                  Notes
                                </p>
                                {entry.notes.slice(0, 2).map((note, noteIndex) => (
                                  <p key={`${entry.id}-note-${noteIndex}`} className="text-[11px] leading-relaxed text-zinc-400">
                                    {note}
                                  </p>
                                ))}
                              </div>
                            )}
                          </article>
                        ))
                      )}
                    </section>

                    <section aria-label="Linked inbox intelligence" className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Users size={13} className="text-violet-400" aria-hidden="true" />
                          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                            Linked Intel
                          </p>
                        </div>
                        <span className="text-[10px] text-zinc-600">
                          {dossierInboxIntel.length} linked
                        </span>
                      </div>

                      {dossierInboxIntel.length === 0 ? (
                        <div className="rounded-md border border-dashed border-[#27272a] bg-[#111111] px-3 py-4">
                          <p className="text-xs text-zinc-500">
                            No player-linked inbox intel saved yet.
                          </p>
                        </div>
                      ) : (
                        dossierInboxIntel.slice(0, 4).map((message) => (
                          <article
                            key={message.id}
                            className="rounded-md border border-[#27272a] bg-[#141414] p-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-medium text-white">{message.title}</p>
                                <p className="mt-0.5 text-[10px] text-zinc-500">
                                  {formatSeasonWeekLabel(message.season, message.week)}
                                </p>
                              </div>
                              <Badge variant="outline" className="text-[9px] uppercase tracking-wide text-zinc-300">
                                {formatAttribute(message.type)}
                              </Badge>
                            </div>
                            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                              {message.body}
                            </p>
                          </article>
                        ))
                      )}
                    </section>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Contact Intel */}
            {contactIntel.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-3 flex items-center gap-1.5">
                  <MessageCircle size={13} aria-hidden="true" />
                  Contact Intel
                </h2>
                <Card>
                  <CardContent className="px-4 pb-4 pt-4">
                    <div className="space-y-3">
                      {contactIntel.map((intel, i) => (
                        <div key={i} className="rounded-md border border-[#27272a] bg-[#141414] p-3">
                          <div className="flex items-start justify-between gap-3 mb-1.5">
                            <span className="text-xs font-medium text-violet-300">
                              {formatAttribute(intel.attribute)}
                            </span>
                            <ReliabilityDots reliability={intel.reliability} />
                          </div>
                          <p className="text-xs text-zinc-400 leading-relaxed">{intel.hint}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>

          {/* Sidebar: observations & reports */}
          <div className={activeTab === "history" ? "grid gap-4 md:grid-cols-2 xl:grid-cols-3" : "space-y-4"}>
            {activeTab === "evidence" && (
              <>
            {/* Observation history */}
            <ObservationsSidebar
              observations={observations}
              trendHistoryDepth={trendHistoryDepth}
            />

            {/* First-team: System Fit */}
            {specialization === "firstTeam" && (
              <SystemFitCard fit={systemFit} />
            )}

            {/* Data scout: Statistical Profile */}
            {specialization === "data" && (
              <StatisticalProfileCard
                profile={statisticalProfile}
                anomalies={playerAnomalies}
              />
            )}
              </>
            )}

            {activeTab === "history" && (
              <>
            {/* Injury Status & History */}
            <InjuryStatusCard player={player} />

            {/* Form & Performance */}
            <FormPerformanceCard player={player} />

            <RetirementOutlookCard
              player={player}
              currentSeason={gameState.currentSeason}
            />

            {/* Discipline */}
            <DisciplinaryCard
              record={player.disciplinaryRecord ?? (gameState.disciplinaryRecords ?? {})[player.id]}
              gameState={gameState}
            />

            {movementHistory.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Career Journey</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {movementHistory.slice(0, 12).map((event) => {
                    const fromName = event.fromClubId ? gameState.clubs[event.fromClubId]?.name : undefined;
                    const toName = event.toClubId ? gameState.clubs[event.toClubId]?.name : undefined;
                    const presentation = buildPlayerMovementPresentation({
                      movement: event,
                      loanDeal: event.loanDealId ? loanDealsById.get(event.loanDealId) : undefined,
                      resolveClubName: (clubId) => clubId ? gameState.clubs[clubId]?.name : undefined,
                    });
                    const route = fromName && toName
                      ? `${fromName} → ${toName}`
                      : undefined;
                    return (
                      <div key={event.id} className="rounded-md border border-[#27272a] bg-[#111] px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-medium text-zinc-200">{presentation.title}</p>
                          <span className="text-[10px] text-zinc-500">S{event.season} W{event.week}</span>
                        </div>
                        <p className="mt-1 text-[11px] text-zinc-400">{presentation.summary}</p>
                        {presentation.details.map((detail, index) => (
                          <p
                            key={`${event.id}-detail-${index}`}
                            className="mt-1 text-[10px] text-zinc-500"
                          >
                            {detail}
                          </p>
                        ))}{/*
                            {route}{route && event.fee !== undefined ? " · " : ""}
                            {event.fee !== undefined ? formatMarketValue(event.fee) : ""}
                          </p>
                        )}
                        */}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {/* Reports */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Reports ({reports.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {reports.length === 0 ? (
                  <p className="text-xs text-zinc-500">No reports filed yet.</p>
                ) : (
                  <div className="space-y-2">
                    {reports.map((r) => (
                      <div
                        key={r.id}
                        className="rounded-md border border-[#27272a] p-2"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <Badge
                            variant={convictionVariant(r.conviction)}
                            className="text-[10px]"
                          >
                            {r.conviction === "tablePound"
                              ? "TABLE POUND"
                              : r.conviction === "strongRecommend"
                              ? "Strong Rec"
                              : r.conviction === "recommend"
                              ? "Recommend"
                              : "Note"}
                          </Badge>
                          <span className="text-xs text-zinc-500">W{r.submittedWeek}</span>
                        </div>
                        <p className="flex items-center gap-1 text-xs text-zinc-400">
                          Quality: {r.qualityScore}/100
                          <HelpTooltip text="Report craft is based on evidence depth, confidence, detail, and conviction calibration. Strong work improves market value, while reputation ultimately follows distinct cases and their outcomes." />
                        </p>
                        {r.clubResponse && (
                          <p className="text-xs text-zinc-500 capitalize mt-0.5">
                            Club: {r.clubResponse}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            {(caseQuestionSnapshot?.callbacks.length ?? 0) > 0 && (
              <Card className="border-violet-400/20 bg-violet-400/[0.04]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Evidence Callbacks</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {caseQuestionSnapshot?.callbacks.slice(0, 6).map((callback) => (
                    <div key={callback.id} className="rounded-md border border-white/10 bg-black/20 px-3 py-2">
                      <p className="text-xs font-medium text-zinc-200">{callback.title}</p>
                      <p className="mt-1 text-[11px] leading-5 text-zinc-400">{callback.summary}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
              </>
            )}
          </div>
        </section>
      </div>
      {loanDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setLoanDialogOpen(false)}>
          <div
            className="mx-4 w-full max-w-lg rounded-xl border border-[#27272a] bg-[#0c0c0c] p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-white">Build a loan development plan</h3>
                <p className="mt-1 text-xs text-zinc-400">
                  Choose the club, purpose, and duration. The target club will respond when the week advances.
                </p>
              </div>
              <button onClick={() => setLoanDialogOpen(false)} className="text-zinc-500 hover:text-white" aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-4">
              <label className="block text-xs text-zinc-400">
                Destination club
                <select
                  value={loanTargetClubId}
                  onChange={(event) => setLoanTargetClubId(event.target.value)}
                  className="mt-1.5 w-full rounded-md border border-[#27272a] bg-[#141414] px-3 py-2 text-sm text-white"
                >
                  {loanTargetClubs.map((candidate) => {
                    const leagueName = gameState.leagues[candidate.leagueId]?.name ?? "Unknown league";
                    return (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.name} · {leagueName} · Academy {candidate.youthAcademyRating}/20
                      </option>
                    );
                  })}
                </select>
              </label>
              <label className="block text-xs text-zinc-400">
                Development objective
                <select
                  value={loanRationale}
                  onChange={(event) => setLoanRationale(event.target.value as typeof loanRationale)}
                  className="mt-1.5 w-full rounded-md border border-[#27272a] bg-[#141414] px-3 py-2 text-sm text-white"
                >
                  <option value="development">Coaching and development</option>
                  <option value="playing-time">Guaranteed playing time</option>
                  <option value="experience">Senior football experience</option>
                  <option value="squad-depth">Fill a clear squad need</option>
                </select>
              </label>
              <label className="block text-xs text-zinc-400">
                Duration
                <select
                  value={loanDuration}
                  onChange={(event) => setLoanDuration(Number(event.target.value))}
                  className="mt-1.5 w-full rounded-md border border-[#27272a] bg-[#141414] px-3 py-2 text-sm text-white"
                >
                  <option value={12}>12 weeks · short-term test</option>
                  <option value={Math.round(seasonLength / 2)}>
                    {Math.round(seasonLength / 2)} weeks · half season
                  </option>
                  <option value={seasonLength}>{seasonLength} weeks · full season</option>
                </select>
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setLoanDialogOpen(false)}>Cancel</Button>
              <Button
                disabled={!loanTargetClubId}
                onClick={() => {
                  recommendPlayerForLoan(player.id, loanTargetClubId, loanRationale, loanDuration);
                  setLoanDialogOpen(false);
                }}
              >
                Submit Recommendation
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Network Intel Popup */}
      {networkIntel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setNetworkIntel(null)}>
          <div
            className="relative mx-4 w-full max-w-md rounded-xl border border-[#27272a] bg-[#0c0c0c] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setNetworkIntel(null)}
              className="absolute right-3 top-3 text-zinc-500 hover:text-white transition"
              aria-label="Close"
            >
              <X size={16} />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15">
                <Phone size={18} className="text-emerald-400" />
              </div>
              <h3 className="text-sm font-semibold text-white">{networkIntel.title}</h3>
            </div>
            <p className="text-sm text-zinc-300 leading-relaxed mb-4">{networkIntel.body}</p>
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>+3 fatigue{networkIntel.contactName ? ` · ${networkIntel.contactName} relationship −2` : ""}</span>
              <Button size="sm" variant="outline" onClick={() => setNetworkIntel(null)}>
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      )}
    </GameLayout>
  );
}
