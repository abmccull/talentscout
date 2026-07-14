/**
 * Weekly cycle, calendar scheduling, match, day simulation, and season
 * transition actions extracted from gameStore.
 *
 * Handles scheduleActivity, advanceWeek (the giant weekly processing loop),
 * startWeekSimulation, advanceDay, match lifecycle, autoSchedule, batchAdvance,
 * delegation, fast-forward, and related helpers.
 */
import type { GetState, SetState } from "./types";
import type { GameScreen, WeekSummary } from "../gameStoreTypes";
import { createWeekSimulationActions } from "./weekSimulationActions";
import { createMatchActions } from "./matchActions";
import { processWeeklyEconomy } from "./weeklyEconomy";
import { clearTerminalNarrativeInboxActions } from "./narrativeInboxState";
import { createAutosaveQueue, scheduleAfterPaint } from "./autosaveQueue";
import type {
  GameState,
  Activity,
  WeekSchedule,
  Player,
  Club,
  League,
  Fixture,
  Observation,
  ScoutReport,
  Contact,
  InboxMessage,
  JobOffer,
  FocusSelection,
  MatchPhase,
  NPCScout,
  NPCScoutReport,
  Territory,
  Specialization,
  NarrativeEvent,
  RivalScout,
  SeasonEvent,
  DiscoveryRecord,
  ScoutPerformanceSnapshot,
  HiddenIntel,
  UnsignedYouth,
  AnomalyFlag,
  ManagerDirective,
  DayResult,
  LeaderboardEntry,
  PlayerMatchRating,
  BatchAdvanceResult,
  BatchWeekSummary,
  QuickScoutPriorities,
  GutFeeling,
  CareerTier,
  LegacyProfile,
  TransferRecord,
  ConvictionLevel,
  Scout,
  ClubDecision,
} from "@/engine/core/types";
import type { ActivityQualityResult, ActivityQualityTier } from "@/engine/core/activityQuality";
import type { ScenarioProgress } from "@/engine/scenarios";
import { type TierReviewContext } from "@/engine/career/progression";
import {
  type ActivityChoiceId,
  buildActivityInteractionState,
  getActivityInteractionEffect,
} from "@/engine/core/activityInteractions";
import { createRNG } from "@/engine/rng";
import {
  appendDecisionConsequence,
  createAcademyClubDecisionMemory,
  ensureNarrativeDecision,
  expireDueDecisions,
  maintainConsequenceLifecycle,
  processDueConsequences,
  projectConsequenceMetrics,
  recordStakeholderMemory,
  synchronizeConsequenceMetrics,
} from "@/engine/consequences";
import { getDifficultyModifiers } from "@/engine/core/difficulty";
import { getRunSimulationModifiers } from "@/engine/run";
import { rollActivityQuality } from "@/engine/core/activityQuality";
import {
  generateSeasonEvents,
  getActiveSeasonEvents,
} from "@/engine/core/seasonEvents";
import { resolveSeasonEventChoice } from "@/engine/core/seasonEventEffects";
import {
  initializeTransferWindows,
  isTransferWindowOpen,
  getCurrentTransferWindow,
  generateUrgentAssessment,
  isDeadlineDayPressure,
} from "@/engine/core/transferWindow";
import {
  processWeeklyTick,
  advanceWeek as advanceWeekEngine,
  getSeasonLength,
} from "@/engine/core/gameLoop";
import { gameWeeksBetween } from "@/engine/core/gameDate";
import {
  autoScheduleWeek,
  delegateScoutingTask,
  buildDefaultPriorities,
  processNPCDelegations,
} from "@/engine/core/quickScout";
import {
  getDelegationPolicyModifier,
  getWeeklyIntentActivityModifier,
  normalizeWeeklyStrategyState,
  recordWeeklyStrategyOutcome,
  selectDelegationPolicy,
  selectWeeklyIntent,
  type DelegationPolicyId,
  type WeeklyIntentId,
  type WeeklyStrategyModifier,
} from "@/engine/core/weeklyStrategy";
import {
  createObservationEvidenceIndex,
  getPlayerObservationEvidence,
  observePlayerLight,
  upsertObservationEvidence,
} from "@/engine/scout/perception";
import { getPerceivedAbility } from "@/engine/scout/perceivedAbility";
import {
  calculatePerformanceReview,
  expireJobOffersAtWeekEnd,
  generateJobOffers,
  updateReputation,
} from "@/engine/career/progression";
import { deriveSeasonReviewMetrics } from "@/engine/career/seasonReviewContext";
import {
  meetContact,
  generateContactForType,
  getContactCoverageCountry,
} from "@/engine/network/contacts";
import {
  createWeekSchedule,
  addActivity,
  removeActivity,
  canAddActivity,
  getAvailableActivities,
  getScheduledActivityInstances,
  processCompletedWeek,
  applyWeekResults,
  ACTIVITY_SLOT_COSTS,
  ACTIVITY_SKILL_XP as ACTIVITY_SKILL_XP_MAP,
  ACTIVITY_FATIGUE_COSTS as ACTIVITY_FATIGUE_COSTS_MAP,
} from "@/engine/core/calendar";
import {
  generateBoardDirectives,
  processSeasonDiscoveries,
  processMonthlySnapshot,
  ensureLeadershipDelegationTeam,
} from "@/engine/career/index";
import { applyCareerPathTransition } from "@/engine/career/transitions";
import {
  isCareerRecoveryBlockingOffers,
  openCareerSetback,
  processCareerRecoveryWeek,
} from "@/engine/career/recovery";
import {
  chooseLeadershipResponsibility,
  processLeadershipPortfolioWeek,
  type LeadershipResponsibilityChoice,
} from "@/engine/career/leadership";
import {
  generateLegacyProfile as generateLegacyProfileEngine,
  applyLegacyPerks as applyLegacyPerksEngine,
  hasRepresentedCareerCompletionState,
  getCareerSeasonOrdinal,
  readLegacyProfile,
  writeLegacyProfile,
} from "@/engine/career/legacy";
import { isBankruptcyRecoveryActive } from "@/engine/finance/distress";
import {
  hasRequiredCoursesForTier,
} from "@/engine/career/courses";
import {
  createLeaderboardEntry,
  submitLeaderboardEntry,
} from "@/lib/leaderboard";
import {
  bookTravel,
  getTravelDuration,
  getScoutHomeCountry as getScoutHome,
  isScoutAbroad,
  processInternationalWeek,
  classifyStandingZone,
  deriveRegionalPresence,
  getActiveWorldConditionNames,
  getWorldConditionModifiers,
  applyRegionalPresenceToObservation,
  getPlayerScoutingCountry,
} from "@/engine/world/index";
import {
  resolveInternationalAssignment,
  synchronizeInternationalAssignmentProgress,
} from "@/engine/world/internationalDeliverables";
import { initializeRegionalKnowledge } from "@/engine/specializations/regionalKnowledge";
import { ALL_PERKS } from "@/engine/specializations/perks";
import { ensureSeasonFixtures } from "@/engine/world/fixtures";
import {
  getLifecycleWorld,
  resolvePlayerMovements,
  withLifecycleWorld,
} from "@/engine/world/playerLifecycle";
import {
  initializeFinances,
  processWeeklyFinances,
  sumOperatingExpenses,
  applyDifficultyFinancialAdjustments,
  getActiveEquipmentBonuses,
  migrateEquipmentLevel,
  negotiateRetainerTerms,
  processAnnualAwards,
  calculatePerformanceBonusAmount,
  calculateSigningBonus,
  calculateDiscoveryBonus,
  calculateDepartmentBonusPool,
  calculateGoldenParachute,
  triggerPlacementFee,
  processSellOnClauses,
  checkPlacementFeeEligibility,
  calculatePlacementFee,
  calculateSellOnPercentage,
  getLifestyleNetworkingBonus,
  processAssistantScoutWeek,
  processWeeklyInfrastructureCosts,
  calculateInfrastructureEffects,
  processStarterStipend,
} from "@/engine/finance";
import { processMonthlyCredit, getCreditScore } from "@/engine/finance/creditScore";
import { processDistress } from "@/engine/finance/distress";
import { shouldGeneratePulse, generatePerformancePulse, applyPulseConsequences } from "@/engine/career/performancePulse";
import { evaluateFatigueConsequences, rollBurnoutIllness } from "@/engine/core/calendar";
import { checkRetainerDeliverables } from "@/engine/finance/clientRelationships";
import { getLifestyleEffects } from "@/engine/finance/expenses";
import {
  directWeeklyNarrativeEvent,
  resolveEventChoice,
  acknowledgeEvent,
  checkStorylineTriggers,
  processActiveStorylines,
  advanceChain,
  computeChainChoiceEffects,
  resolveChainChoice,
  resolveStorylineChoice,
} from "@/engine/events";
import {
  applyConsequences,
  applyNarrativeRelationshipChoice,
  applyRivalPoachBidConcession,
} from "./progressionActions";
import {
  generateRivalScouts,
  processRivalScoutWeek,
  generateRivalIntelligence,
  resolveRivalSigningAttempt,
  getPoachCounterBidEligibility,
  advanceYouthRivalPressure,
  resolveRivalYouthClaim,
  selectYouthRivalTarget,
  migrateRivalOrganizationState,
  processRivalOrganizationWeek,
} from "@/engine/rivals";
import { checkToolUnlocks } from "@/engine/tools";
import { getActiveToolBonuses } from "@/engine/tools/unlockables";
import { generateManagerProfiles } from "@/engine/analytics";
import { generateRegionalYouth, generateAcademyIntake } from "@/engine/youth/generation";
import {
  generatePlacementReport,
  getEligibleClubsForPlacement,
  processPlacementOutcome,
  createAlumniRecord,
  generateSeasonTournaments,
  discoverTournamentsPassive,
  processContactTournamentTip,
  rollGutFeeling,
  formatGutFeelingWithPA,
  advanceYouthRecruitmentBriefs,
  fulfillYouthRecruitmentBrief,
  generateYouthRecruitmentBriefs,
  scoreAcademyClubDecision,
} from "@/engine/youth";
import {
  completeAcademyRecommendationReview,
  scheduleAcademyRecommendationReviews,
} from "@/engine/youth/recommendationReviews";
import { calibrateSourceEvidenceFromReview } from "@/engine/scout/sourceCalibration";
import {
  getYouthVenuePool,
  processVenueObservation,
  processParentCoachMeeting,
  mapVenueTypeToContext,
  type ScoutQualityData,
} from "@/engine/youth/venues";
import { getCountryDataSync, getSecondaryCountries, getAvailableCountries } from "@/data/index";
import { useTutorialStore, resolveOnboardingSequence } from "@/stores/tutorialStore";
import { evaluateHints } from "@/components/game/tutorial/hintConditions";
import { IS_DEMO, isDemoLimitReached, DEMO_ALLOWED_SPECS } from "@/lib/demo";
import { getInteractiveActivityCompletionKey } from "@/lib/activityCompletion";
import {
  resolvePlayerEntity,
  resolveUnsignedYouth,
} from "@/lib/playerResolution";
import { countryKeyFromNationality, normalizeCountryKey } from "@/lib/country";
import {
  applyScenarioOverrides,
  checkScenarioObjectives,
  resolveScenarioOutcome,
} from "@/engine/scenarios";
import { ACTIVITY_MODE_MAP } from "@/engine/observation/types";
import { starsToAbility } from "@/engine/scout/starRating";

const YOUTH_SUMMARY_ACTIVITY_TYPES = new Set<Activity["type"]>([
  "schoolMatch",
  "grassrootsTournament",
  "streetFootball",
  "academyTrialDay",
  "youthFestival",
  "youthTournament",
  "academyVisit",
  "watchVideo",
  "followUpSession",
  "parentCoachMeeting",
  "trainingVisit",
]);

/** The loan hint lives in the Prospects workspace in the Youth EA build. */
export function hasBrowsedYouthLoanWorkspace(
  visitedScreens: ReadonlySet<string>,
): boolean {
  return visitedScreens.has("youthScouting");
}

function synchronizeDiscoveryAccuracyWithReports(
  discoveries: DiscoveryRecord[],
  reports: Record<string, ScoutReport>,
): DiscoveryRecord[] {
  const ratingsByPlayerId = new Map<string, number[]>();
  const latestValidatedReports = selectLatestReportsByCase(
    Object.values(reports).filter(
      (report) => report.postTransferRating !== undefined,
    ),
  );
  for (const report of latestValidatedReports) {
    if (report.postTransferRating === undefined) continue;
    const ratings = ratingsByPlayerId.get(report.playerId) ?? [];
    ratings.push(report.postTransferRating);
    ratingsByPlayerId.set(report.playerId, ratings);
  }

  return discoveries.map((discovery) => {
    const ratings = ratingsByPlayerId.get(discovery.playerId);
    const predictionAccuracy = ratings && ratings.length > 0
      ? Math.round(ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length)
      : undefined;
    return { ...discovery, predictionAccuracy };
  });
}

/**
 * Return narrative age for the bounded retention window without walking every
 * prior season. The calendar guarantees at least 38 weeks per season, so an
 * event older than the immediately previous season is necessarily outside the
 * ten-week archive window. Future-dated records retain the legacy negative-age
 * behavior and are not pruned as stale.
 */
export function getNarrativeRetentionAge(
  event: Pick<NarrativeEvent, "season" | "week">,
  current: { season: number; week: number },
  previousSeasonLength: number,
): number {
  if (event.season > current.season) return Number.NEGATIVE_INFINITY;
  if (event.season === current.season) return current.week - event.week;
  if (event.season === current.season - 1) {
    return previousSeasonLength - event.week + current.week;
  }
  return Number.POSITIVE_INFINITY;
}

import { generateSeasonAwardsData } from "@/engine/core/seasonAwards";
import {
  generateDirectives,
  processTrialOutcome,
  updateTransferRecords,
  linkReportsToTransfers,
  applyScoutAccountability,
} from "@/engine/firstTeam";
import { processContactFreeAgentTip } from "@/engine/freeAgents/discovery";
import { generateBoardProfile } from "@/engine/firstTeam/boardAI";
import { deriveTacticalStyleFromPhilosophy } from "@/engine/firstTeam/tacticalStyle";
import {
  executeDatabaseQuery,
  executeDeepVideoAnalysis,
  generateStatsBriefing,
  resolvePredictions,
  generateAnalystReport,
  updateAnalystMorale,
  generateAnalystCandidate,
  createPrediction,
  generatePredictionSuggestions,
} from "@/engine/data";
import { createInsightState, accumulateInsight, calculateCapacity, tickCooldown } from "@/engine/insight/insight";
import {
  conductBoardMeeting,
  conductManagerMeeting,
  recordDiscovery,
} from "@/engine/career/index";
import {
  calculateReportCraftQualityDetailed,
  finalizeReport,
  generateReportContent,
  trackPostTransfer,
} from "@/engine/reports/reporting";
import {
  attachReportEvidence,
  getFreshReportObservationIds,
  getLatestReportInScope,
  groupReportRevisionsByCase,
  selectLatestReportsByCase,
} from "@/engine/reports/reportAccountability";
import {
  ensureScoutingCaseForReport,
  isGameDateDue,
  nextGameWeek,
  recordDirectPlacementDelivery,
  resolveClubDecision,
} from "@/engine/reports/scoutingCases";
import { getScenarioById } from "@/engine/scenarios/scenarioSetup";
import { compactLongCareerHistory } from "@/engine/world/saveRetention";
import { getActiveSaveProvider } from "@/lib/activeSaveProvider";

// ── Module-level state ─────────────────────────────────────────────────────
// A batch is one player command even though it commits multiple canonical
// weeks. Persist it once instead of serializing the full growing state twice
// for every simulated week.
let _batchAdvanceDepth = 0;

// ── Local type alias ───────────────────────────────────────────────────────
type SimulationChoiceId = ActivityChoiceId;
type CelebrationPayload = {
  tier: "minor" | "major" | "epic";
  title: string;
  description: string;
};

// ── Helper functions ───────────────────────────────────────────────────────

function buildDaySpanInfo(
  schedule: WeekSchedule,
): Map<number, { totalDays: number; occurrenceIndex: number }> {
  const info = new Map<number, { totalDays: number; occurrenceIndex: number }>();
  for (const instance of getScheduledActivityInstances(schedule)) {
    const ordered = [...instance.slotIndexes].sort((a, b) => a - b);
    ordered.forEach((slotIndex, occurrenceIndex) => {
      info.set(slotIndex, {
        totalDays: ordered.length,
        occurrenceIndex,
      });
    });
  }
  return info;
}

function processInternationalTravelLifecycle(state: GameState): GameState {
  const booking = state.scout.travelBooking;
  if (!booking) return state;

  const currentlyAbroad = isScoutAbroad(state.scout, state.currentWeek);

  if (!currentlyAbroad && !booking.isAbroad) {
    return state;
  }

  if (currentlyAbroad) {
    if (booking.isAbroad) return state;
    return {
      ...state,
      scout: {
        ...state.scout,
        travelBooking: {
          ...booking,
          isAbroad: true,
        },
      },
    };
  }

  const updatedState: GameState = {
    ...state,
    scout: {
      ...state.scout,
      travelBooking: undefined,
    },
  };

  const assignment = state.activeInternationalAssignment;
  return assignment
    ? resolveInternationalAssignment(updatedState, assignment)
    : updatedState;
}

function buildDayInteraction(activity: Activity | null, careerPath?: import("@/engine/core/types").CareerPath): DayResult["interaction"] | undefined {
  return buildActivityInteractionState(activity, careerPath);
}

function isQualityRelevantActivity(activity: Activity | null): activity is Activity {
  if (!activity) return false;
  return (
    activity.type !== "rest" &&
    activity.type !== "travel" &&
    activity.type !== "internationalTravel"
  );
}

function getQualityKey(activity: Activity, dayIndex: number): string {
  const base = activity.instanceId ?? activity.type;
  return `${base}-d${dayIndex}`;
}

function rollDayActivityQuality(
  gameState: GameState,
  activity: Activity,
  dayIndex: number,
): ActivityQualityResult {
  const qualityRng = createRNG(
    `${gameState.seed}-quality-${gameState.currentWeek}-${gameState.currentSeason}-${getQualityKey(activity, dayIndex)}`,
  );
  return rollActivityQuality(qualityRng, activity.type, gameState.scout, gameState.scout.careerPath);
}

function deriveScenarioState(
  state: GameState,
): {
  scenarioProgressUpdate: ScenarioProgress | null;
  scenarioOutcomeUpdate: "victory" | "failure" | null;
} {
  const scenarioId = state.activeScenarioId;
  if (!scenarioId) {
    return {
      scenarioProgressUpdate: null,
      scenarioOutcomeUpdate: null,
    };
  }

  const progress = checkScenarioObjectives(state, scenarioId);
  return {
    scenarioProgressUpdate: progress,
    scenarioOutcomeUpdate: progress.valid && progress.allRequiredComplete
      ? "victory"
      : progress.failed
        ? "failure"
        : null,
  };
}

function derivePendingCelebration(
  previousState: GameState,
  nextState: GameState,
  scenarioOutcomeUpdate: "victory" | "failure" | null,
  newlyUnlocked: string[],
): CelebrationPayload | null {
  const prevDiscoveryIds = new Set(previousState.discoveryRecords.map((d) => d.playerId));
  const newDiscoveries = nextState.discoveryRecords.filter(
    (discovery) => !prevDiscoveryIds.has(discovery.playerId),
  );

  if (newDiscoveries.length > 0) {
    const first = newDiscoveries[0];
    const resolvedPlayer = first
      ? resolvePlayerEntity(nextState, first.playerId)?.player
      : undefined;
    const playerName = resolvedPlayer
      ? `${resolvedPlayer.firstName} ${resolvedPlayer.lastName}`
      : "a new prospect";
    return {
      tier: "minor",
      title: "Prospect File Opened",
      description: `You logged your first evidence on ${playerName}. It is a lead, not a verdict—follow up before making the call.`,
    };
  }

  if (nextState.scout.careerTier > previousState.scout.careerTier) {
    return {
      tier: "major",
      title: "Career Promotion!",
      description: `You've been promoted to Tier ${nextState.scout.careerTier}. New opportunities await.`,
    };
  }

  if (scenarioOutcomeUpdate === "victory") {
    const scenarioId = nextState.activeScenarioId;
    const victoryScenario = scenarioId ? getScenarioById(scenarioId) : undefined;
    return {
      tier: "major",
      title: "Scenario Complete!",
      description: victoryScenario
        ? `You completed "${victoryScenario.name}". All objectives achieved.`
        : "All scenario objectives achieved!",
    };
  }

  if (newlyUnlocked.length > 0) {
    return {
      tier: "minor",
      title: "New Tool Unlocked",
      description: `You unlocked a new scouting tool: ${newlyUnlocked[0]}.`,
    };
  }

  return null;
}

interface AutosaveRequest {
  state: GameState;
  set: SetState;
}

const autosaveQueue = createAutosaveQueue<AutosaveRequest>({
  schedule: scheduleAfterPaint,
  onRequest: ({ set }) => set({ autosaveError: null }),
  persist: async ({ state }) => {
    const provider = await getActiveSaveProvider();
    await provider.save("autosave", JSON.stringify(state), "Autosave");
  },
  onError: (error, { set }) => {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("Autosave failed:", error);
    set({ autosaveError: message });
  },
});

function queueAutosave(newState: GameState, set: SetState): void {
  // A single player command can request both a checkpoint and a final save.
  // Coalesce those synchronous requests before JSON migration starts, then
  // serialize off the interaction task so the committed week can paint first.
  autosaveQueue.request({ state: newState, set });
}

function registerNarrativeDecisions(
  state: GameState,
  events: NarrativeEvent[],
): GameState {
  return events.reduce(
    (current, event) => ensureNarrativeDecision(current, event),
    state,
  );
}

/**
 * Project deadline-selected narrative defaults through the same domain effects
 * as a manual click. The generic decision engine owns option selection; this
 * adapter owns narrative, chain, storyline, contact, and obligation state.
 */
export function projectExpiredNarrativeDefaults(
  state: GameState,
  expiredDecisionIds: readonly string[],
): GameState {
  let updated = state;
  // Reconcile saves written after the generic deadline engine selected a
  // default but before narrative-domain projection existed. Fresh expiries are
  // included explicitly; persisted default selections are recovered from the
  // ledger so an already-selected decision cannot strand an unresolved event.
  const candidateDecisionIds = [...new Set([
    ...expiredDecisionIds,
    ...Object.values(state.consequenceState.decisions)
      .filter((decision) =>
        decision.selectionKind === "default"
        && Boolean(decision.selectedOptionId)
        && decision.source.kind === "narrativeEvent"
      )
      .map((decision) => decision.id),
  ])].sort();

  for (const decisionId of candidateDecisionIds) {
    const decision = updated.consequenceState.decisions[decisionId];
    if (
      !decision
      || decision.selectionKind !== "default"
      || !decision.selectedOptionId
      || decision.source.kind !== "narrativeEvent"
    ) continue;

    const event = updated.narrativeEvents.find(
      (candidate) => candidate.id === decision.source.id,
    );
    if (!event || event.selectedChoice !== undefined || !event.choices) continue;
    const choiceIndex = decision.options.findIndex(
      (option) => option.id === decision.selectedOptionId,
    );
    if (choiceIndex < 0 || !event.choices[choiceIndex]) continue;

    const resolveRng = createRNG(
      `${updated.seed}-event-resolve-${event.id}-${choiceIndex}`,
    );
    let eventResult;
    try {
      eventResult = resolveEventChoice(event, choiceIndex, updated, resolveRng);
    } catch {
      continue;
    }

    let reputationChange = eventResult.reputationChange;
    let fatigueChange = eventResult.fatigueChange;
    let chainReputationChange = 0;
    let chainFatigueChange = 0;
    let updatedChains = updated.eventChains ?? [];
    if (event.chainId) {
      const chain = updatedChains.find((candidate) => candidate.id === event.chainId);
      if (chain) {
        const stepIndex = event.chainStep !== undefined
          ? Math.max(0, event.chainStep - 1)
          : undefined;
        const chainEffects = computeChainChoiceEffects(
          chain,
          choiceIndex,
          resolveRng,
          stepIndex,
        );
        chainReputationChange = chainEffects.reputationChange;
        chainFatigueChange = chainEffects.fatigueChange;
        reputationChange += chainReputationChange;
        fatigueChange += chainFatigueChange;
        const resolvedChain = resolveChainChoice(
          chain,
          event.id,
          choiceIndex,
          stepIndex,
        );
        updatedChains = updatedChains.map((candidate) =>
          candidate.id === chain.id ? resolvedChain : candidate,
        );
      }
    }

    let updatedStorylines = updated.activeStorylines;
    let storylineMessage: InboxMessage | undefined;
    if (event.storylineId) {
      const storyline = updatedStorylines.find(
        (candidate) => candidate.id === event.storylineId,
      );
      if (storyline) {
        const storylineResult = resolveStorylineChoice(
          storyline,
          event.storylineStage ?? Math.max(0, storyline.currentStage - 1),
          choiceIndex,
          resolveRng,
          event.id,
        );
        reputationChange = storylineResult.reputationChange + chainReputationChange;
        fatigueChange = storylineResult.fatigueChange + chainFatigueChange;
        updatedStorylines = updatedStorylines.map((candidate) =>
          candidate.id === storyline.id ? storylineResult.storyline : candidate,
        );
        if (storylineResult.message) {
          storylineMessage = {
            id: `storyline-choice-${event.id}-${choiceIndex}`,
            week: updated.currentWeek,
            season: updated.currentSeason,
            type: "feedback",
            title: `${storyline.name}: Deadline Decision Recorded`,
            body: storylineResult.message,
            read: false,
            actionRequired: false,
            relatedId: event.id,
            relatedEntityType: "narrative",
          };
        }
      }
    }

    const reputationMetric = "scout:reputation";
    const fatigueMetric = "scout:fatigue";
    const now = { week: updated.currentWeek, season: updated.currentSeason };
    const causalBase = {
      ...updated.consequenceState,
      metrics: {
        ...updated.consequenceState.metrics,
        [reputationMetric]: updated.scout.reputation,
        [fatigueMetric]: updated.scout.fatigue,
      },
    };
    const appended = appendDecisionConsequence(
      causalBase,
      decisionId,
      "narrative-default-core-outcome",
      [
        {
          id: `effect:${decisionId}:default-reputation`,
          type: "adjustMetric",
          metricKey: reputationMetric,
          delta: reputationChange,
          min: 0,
          max: 100,
        },
        {
          id: `effect:${decisionId}:default-fatigue`,
          type: "adjustMetric",
          metricKey: fatigueMetric,
          delta: fatigueChange,
          min: 0,
          max: 100,
        },
      ],
      now,
      { tags: ["narrative", event.type, "deadline-default"] },
    );
    if (appended.error) continue;
    const processed = processDueConsequences(
      appended.state,
      now,
      getSeasonLength(updated.fixtures, updated.currentSeason),
    );
    if (processed.errors.length > 0) continue;

    updated = {
      ...updated,
      consequenceState: processed.state,
      narrativeEvents: updated.narrativeEvents.map((candidate) =>
        candidate.id === event.id ? eventResult.updatedEvent : candidate,
      ),
      eventChains: updatedChains,
      activeStorylines: updatedStorylines,
      scout: {
        ...updated.scout,
        reputation: Math.round(processed.state.metrics[reputationMetric]),
        fatigue: Math.round(processed.state.metrics[fatigueMetric]),
      },
      inbox: [
        ...updated.inbox,
        ...(storylineMessage ? [storylineMessage] : eventResult.messages),
      ],
    };
    if (eventResult.updatedEvent.consequences?.length) {
      updated = applyConsequences(updated, eventResult.updatedEvent.consequences);
    }
    updated = applyNarrativeRelationshipChoice(updated, event, choiceIndex);
    updated = applyRivalPoachBidConcession(updated, event, choiceIndex);
  }

  const repairedInbox = clearTerminalNarrativeInboxActions(
    updated.inbox,
    updated.narrativeEvents,
  );
  return repairedInbox === updated.inbox
    ? updated
    : { ...updated, inbox: repairedInbox };
}

function humanizeIdentifier(value: string): string {
  return value
    .replace(/([A-Z])/g, " $1")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function pickRandomIds(rng: ReturnType<typeof createRNG>, pool: string[], count: number): string[] {
  const available = [...pool];
  const picked: string[] = [];

  while (picked.length < count && available.length > 0) {
    const idx = rng.nextInt(0, available.length - 1);
    picked.push(available[idx]);
    available.splice(idx, 1);
  }

  return picked;
}

function seedKnownPlayersForContact(
  rng: ReturnType<typeof createRNG>,
  contact: Contact,
  state: GameState,
): string[] {
  const knownCount = rng.nextInt(3, 7);
  const coverageCountry = getContactCoverageCountry(contact, getScoutHome(state.scout));
  const isYouthContact = new Set<Contact["type"]>([
    "academyCoach",
    "grassrootsOrganizer",
    "schoolCoach",
    "youthAgent",
    "academyDirector",
    "localScout",
  ]).has(contact.type) && state.scout.primarySpecialization === "youth";

  if (isYouthContact) {
    const youthPool = Object.values(state.unsignedYouth)
      .filter((youth) => !youth.placed && !youth.retired)
      .filter((youth) => !coverageCountry || youth.country === coverageCountry)
      .map((youth) => youth.id);
    return pickRandomIds(
      rng,
      youthPool.length > 0 ? youthPool : Object.keys(state.unsignedYouth),
      knownCount,
    );
  }

  const allPlayerIds = Object.keys(state.players);
  const seniorPool = coverageCountry
    ? allPlayerIds.filter((id) => {
        const player = state.players[id];
        const club = player ? state.clubs[player.clubId] : undefined;
        const league = club ? state.leagues[club.leagueId] : undefined;
        return league?.country === coverageCountry;
      })
    : [];

  return pickRandomIds(
    rng,
    seniorPool.length > 0 ? seniorPool : allPlayerIds,
    knownCount,
  );
}

function tierFromMultiplier(multiplier: number): ActivityQualityTier {
  if (multiplier >= 1.8) return "exceptional";
  if (multiplier >= 1.25) return "excellent";
  if (multiplier >= 0.9) return "good";
  if (multiplier >= 0.6) return "average";
  return "poor";
}

function aggregateQualityForType(
  activityType: Activity["type"],
  rolls: ActivityQualityResult[],
): ActivityQualityResult {
  const avgMultiplier =
    rolls.reduce((sum, roll) => sum + roll.multiplier, 0) / rolls.length;
  const totalDiscoveryModifier = rolls.reduce(
    (sum, roll) => sum + roll.discoveryModifier,
    0,
  );
  const tier = tierFromMultiplier(avgMultiplier);
  const firstNarrative = rolls[0]?.narrative ?? "";
  const combinedNarrative =
    rolls.length > 1
      ? `${firstNarrative} Across ${rolls.length} days, the outcomes varied.`
      : firstNarrative;

  return {
    activityType,
    tier,
    multiplier: avgMultiplier,
    narrative: combinedNarrative,
    discoveryModifier: totalDiscoveryModifier,
  };
}

function isDayInteractionPending(dayResult: DayResult | undefined): boolean {
  if (!dayResult?.interaction) return false;
  return !dayResult.interaction.selectedOptionId;
}

function getDayChoiceId(dayResult: DayResult | undefined): SimulationChoiceId | undefined {
  const selected = dayResult?.interaction?.selectedOptionId;
  if (selected === "scan" || selected === "focus" || selected === "network") {
    return selected;
  }
  return undefined;
}

function canonicalizeCountry(value?: string): string | undefined {
  return normalizeCountryKey(value);
}

function resolveScoutHomeCountry(
  scout: Scout,
  regionalKnowledge: GameState["regionalKnowledge"],
): string {
  const pinnedHomeCountry = canonicalizeCountry(scout.homeCountry);
  if (pinnedHomeCountry) return pinnedHomeCountry;

  for (const [key, reputation] of Object.entries(scout.countryReputations ?? {})) {
    const countryId = canonicalizeCountry(reputation.country) ?? canonicalizeCountry(key);
    if (countryId && reputation.familiarity >= 50) {
      return countryId;
    }
  }

  const nationalityCountry = countryKeyFromNationality(scout.nationality);
  if (nationalityCountry) {
    return nationalityCountry;
  }

  for (const [key, reputation] of Object.entries(scout.countryReputations ?? {})) {
    const countryId = canonicalizeCountry(reputation.country) ?? canonicalizeCountry(key);
    if (countryId) {
      return countryId;
    }
  }

  return (
    Object.keys(regionalKnowledge)
      .map((countryId) => canonicalizeCountry(countryId))
      .find((countryId): countryId is string => !!countryId)
    ?? "england"
  );
}

function resolveScoutEffectiveCountry(
  scout: Scout,
  regionalKnowledge: GameState["regionalKnowledge"],
  currentWeek: number,
): string {
  const abroadCountry = isScoutAbroad(scout, currentWeek)
    ? canonicalizeCountry(scout.travelBooking?.destinationCountry)
    : undefined;

  return abroadCountry ?? resolveScoutHomeCountry(scout, regionalKnowledge);
}

export function buildScoutQualityData(
  scout: Scout,
  regionalKnowledge: GameState["regionalKnowledge"],
  countryKey?: string,
  presenceDiscoveryMultiplier = 1,
): ScoutQualityData {
  const knowledgeLevel = canonicalizeCountry(countryKey)
    ? (regionalKnowledge[canonicalizeCountry(countryKey)!]?.knowledgeLevel ?? 0)
    : 0;
  return {
    intuition: scout.attributes?.intuition ?? 10,
    regionalKnowledge: knowledgeLevel,
    specializationLevel: scout.specializationLevel ?? 0,
    isYouthSpecialist: scout.primarySpecialization === 'youth',
    presenceDiscoveryMultiplier,
  };
}

function buildScoutQualityDataForState(
  state: GameState,
  countryKey?: string,
): ScoutQualityData {
  const presenceMultiplier = countryKey
    ? deriveRegionalPresence(state, countryKey).effects.discoveryMultiplier
    : 1;
  return buildScoutQualityData(
    state.scout,
    state.regionalKnowledge,
    countryKey,
    presenceMultiplier || 1,
  );
}

// ── Factory ────────────────────────────────────────────────────────────────

export function createWeeklyActions(get: GetState, set: SetState) {
  return {
  // ══════════════════════════════════════════════════════════════════════════
  // Schedule Management (scheduleActivity, unscheduleActivity)
  // ══════════════════════════════════════════════════════════════════════════

  scheduleActivity: (activity: Activity, dayIndex: number) => {
    const { gameState } = get();
    if (!gameState) return;
    if (
      hasRepresentedCareerCompletionState(gameState) ||
      isBankruptcyRecoveryActive(gameState.finances)
    ) {
      return;
    }
    // Equipment travelSlotReduction: reduce slot cost for travel activities
    let effectiveActivity = activity;
    if (activity.type === "travel" || activity.type === "internationalTravel") {
      const travelEquipBonuses = gameState.finances?.equipment
        ? getActiveEquipmentBonuses(gameState.finances.equipment.loadout)
        : undefined;
      const slotReduction = travelEquipBonuses?.travelSlotReduction ?? 0;
      if (slotReduction > 0 && activity.slots > 1) {
        effectiveActivity = { ...activity, slots: Math.max(1, activity.slots - slotReduction) };
      }
    }
    const schedule = addActivity(gameState.schedule, effectiveActivity, dayIndex);
    set({
      gameState: { ...gameState, schedule },
      weekSimulation: null,
    });

    // Tutorial auto-advance — generic and specialization-specific conditions.
    const tutorial = useTutorialStore.getState();
    tutorial.checkAutoAdvance("activityScheduled");
    tutorial.completeMilestone("scheduledActivity");

    const YOUTH_ACTIVITIES = new Set([
      "schoolMatch", "grassrootsTournament", "streetFootball",
      "academyTrialDay", "youthFestival", "youthTournament",
    ]);
    if (YOUTH_ACTIVITIES.has(activity.type)) {
      tutorial.checkAutoAdvance("youthActivityScheduled");
      // Contextual trigger: first youth activity → specialization onboarding
      const hasClub = !!gameState.scout.currentClubId;
      tutorial.startSequence(resolveOnboardingSequence("youth", hasClub));
    }

    const DATA_ACTIVITIES = new Set([
      "databaseQuery", "deepVideoAnalysis", "statsBriefing",
      "algorithmCalibration", "marketInefficiency",
    ]);
    if (DATA_ACTIVITIES.has(activity.type)) {
      tutorial.checkAutoAdvance("dataActivityScheduled");
      // Contextual trigger: first data activity → specialization onboarding
      const hasClub = !!gameState.scout.currentClubId;
      tutorial.startSequence(resolveOnboardingSequence("data", hasClub));
    }

    // Contextual trigger: first opposition analysis → first team onboarding
    const FT_ACTIVITIES = new Set([
      "oppositionAnalysis", "reserveMatch", "tacticalBriefing",
    ]);
    if (FT_ACTIVITIES.has(activity.type)) {
      const hasClub = !!gameState.scout.currentClubId;
      tutorial.startSequence(resolveOnboardingSequence("firstTeam", hasClub));
    }
  },

  unscheduleActivity: (dayIndex: number) => {
    const { gameState } = get();
    if (!gameState) return;
    const schedule = removeActivity(gameState.schedule, dayIndex);
    set({
      gameState: { ...gameState, schedule },
      weekSimulation: null,
    });
  },

  setWeeklyIntent: (intentId: WeeklyIntentId) => {
    const { gameState } = get();
    if (!gameState) return;
    set({
      gameState: {
        ...gameState,
        weeklyStrategy: selectWeeklyIntent(
          gameState.weeklyStrategy,
          intentId,
          gameState.currentWeek,
          gameState.currentSeason,
        ),
      },
      weekSimulation: null,
    });
  },

  setDelegationPolicy: (policyId: DelegationPolicyId) => {
    const { gameState } = get();
    if (!gameState) return;
    set({
      gameState: {
        ...gameState,
        weeklyStrategy: selectDelegationPolicy(
          gameState.weeklyStrategy,
          policyId,
          gameState.currentWeek,
          gameState.currentSeason,
        ),
      },
      weekSimulation: null,
    });
  },

  // ══════════════════════════════════════════════════════════════════════════
  // Week Advancement (requestWeekAdvance, resolveSeasonEvent, advanceWeek)
  // ══════════════════════════════════════════════════════════════════════════

  requestWeekAdvance: () => {
    const { weekSimulation } = get();
    if (weekSimulation) {
      set({ currentScreen: "weekSimulation" });
      return;
    }
    useTutorialStore.getState().completeMilestone("advancedWeek");
    get().startWeekSimulation();
  },

  resolveSeasonEvent: (eventId: string, choiceIndex: number) => {
    const { gameState } = get();
    if (!gameState) return;
    const newState = resolveSeasonEventChoice(gameState, eventId, choiceIndex);
    set({
      gameState: newState,
      weekSimulation: null,
    });
  },

  advanceWeek: () => {
    const { gameState } = get();
    if (!gameState) return;

    // Checkpoint autosave before processing — if the game crashes during week
    // simulation the player has a save from immediately before.
    if (_batchAdvanceDepth === 0) {
      getActiveSaveProvider()
        .then((provider) => provider.save("autosave", JSON.stringify(gameState), "Autosave"))
        .catch((err) => {
          console.warn("Pre-advance checkpoint autosave failed:", err);
        });
    }

    const simState = get().weekSimulation;

    // Keep progression consistent across all entry points:
    // advancing a week must flow through day-by-day simulation first.
    if (!simState) {
      get().startWeekSimulation();
      return;
    }
    if (simState.dayResults.some((day) => isDayInteractionPending(day))) {
      return;
    }

    // ── Demo limit gate ────────────────────────────────────────────────────
    if (isDemoLimitReached(gameState.currentSeason)) {
      set({ currentScreen: "demoEnd" as GameScreen });
      return;
    }

    // ── Gate: play all scheduled attendMatch fixtures interactively first ───
    // Find every attendMatch activity in this week's schedule that has a
    // targetId (fixture ID) which hasn't been played via the MatchScreen yet.
    // Youth scouts skip this gate — they cannot attend first-team matches.
    if (gameState.scout.primarySpecialization !== "youth") {
      const pendingFixtureIds = get().getPendingMatches();
      if (pendingFixtureIds.length > 0) {
        // Launch the first unplayed fixture. The user will call endMatch(), which
        // records it in playedFixtures. They then click "Advance Week" again and
        // this gate re-evaluates — eventually clearing all pending matches.
        get().startMatch(pendingFixtureIds[0]);
        return;
      }
    }

    // Non-match interactive sessions are optional, but skipped sessions now
    // incur opportunity-cost penalties in the modifier aggregation stage below.

    const rng = createRNG(`${gameState.seed}-week-${gameState.currentWeek}-${gameState.currentSeason}`);

    // Process scheduled activities → fatigue, skill XP, attribute XP
    const weekResult = processCompletedWeek(gameState.schedule, gameState.scout, rng);

    // ── Roll activity quality per day/instance ─────────────────────────────
    // This keeps multi-day activities dynamic (e.g., day 1 excellent, day 2 poor)
    // while remaining deterministic across save/load.
    const qualityRollsByDay: Array<{
      dayIndex: number;
      activity: Activity;
      result: ActivityQualityResult;
    }> = [];
    const qualityBucketsByType = new Map<Activity["type"], ActivityQualityResult[]>();
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const activity = gameState.schedule.activities[dayIndex];
      if (!isQualityRelevantActivity(activity)) continue;
      const result = rollDayActivityQuality(gameState, activity, dayIndex);
      qualityRollsByDay.push({ dayIndex, activity, result });
      const bucket = qualityBucketsByType.get(activity.type) ?? [];
      bucket.push(result);
      qualityBucketsByType.set(activity.type, bucket);
    }
    const qualityRolls = qualityRollsByDay.map((entry) => entry.result);
    const qualityByType = new Map<Activity["type"], ActivityQualityResult>();
    for (const [activityType, rolls] of qualityBucketsByType.entries()) {
      qualityByType.set(activityType, aggregateQualityForType(activityType, rolls));
    }

    // Apply blended XP multiplier from quality rolls
    if (qualityRolls.length > 0) {
      const avgMultiplier =
        qualityRolls.reduce((sum, q) => sum + q.multiplier, 0) / qualityRolls.length;
      for (const skill of Object.keys(weekResult.skillXpGained) as Array<keyof typeof weekResult.skillXpGained>) {
        const val = weekResult.skillXpGained[skill];
        if (val) weekResult.skillXpGained[skill] = Math.round(val * avgMultiplier);
      }
      for (const attr of Object.keys(weekResult.attributeXpGained) as Array<keyof typeof weekResult.attributeXpGained>) {
        const val = weekResult.attributeXpGained[attr];
        if (val) weekResult.attributeXpGained[attr] = Math.round(val * avgMultiplier);
      }
    }

    const choiceDiscoveryModifiers = new Map<Activity["type"], number>();
    const choiceProfileModifiers = new Map<Activity["type"], number>();
    const choiceAnomalyModifiers = new Map<Activity["type"], number>();
    const choiceRelationshipModifiers = new Map<Activity["type"], number>();
    const choiceReportQualityModifiers = new Map<Activity["type"], number>();
    const choiceFocusDepthByType = new Map<Activity["type"], number>();
    const choiceFocusedPlayersByType = new Map<Activity["type"], string[]>();
    const simChoices = get().weekSimulation;
    if (simChoices) {
      for (const day of simChoices.dayResults) {
        const activity = gameState.schedule.activities[day.dayIndex];
        if (!activity) continue;
        const choiceId = getDayChoiceId(day);
        if (!choiceId) continue;
        const effect = getActivityInteractionEffect(activity.type, choiceId);
        choiceDiscoveryModifiers.set(
          activity.type,
          (choiceDiscoveryModifiers.get(activity.type) ?? 0) + (effect.discoveryModifier ?? 0),
        );
        choiceProfileModifiers.set(
          activity.type,
          (choiceProfileModifiers.get(activity.type) ?? 0) + (effect.profileModifier ?? 0),
        );
        choiceAnomalyModifiers.set(
          activity.type,
          (choiceAnomalyModifiers.get(activity.type) ?? 0) + (effect.anomalyModifier ?? 0),
        );
        choiceRelationshipModifiers.set(
          activity.type,
          (choiceRelationshipModifiers.get(activity.type) ?? 0) + (effect.relationshipModifier ?? 0),
        );
        choiceReportQualityModifiers.set(
          activity.type,
          (choiceReportQualityModifiers.get(activity.type) ?? 0) + (effect.reportQualityModifier ?? 0),
        );
        if (choiceId === "focus") {
          const selectedFocusIds = Array.from(
            new Set(
              (
                day.interaction?.focusedPlayerIds
                ?? (day.interaction?.focusedPlayerId ? [day.interaction.focusedPlayerId] : undefined)
                ?? simChoices.focusedYouthPlayerIds
                ?? (simChoices.focusedYouthPlayerId ? [simChoices.focusedYouthPlayerId] : [])
              ).filter(Boolean),
            ),
          ).slice(0, 3);

          if (selectedFocusIds.length > 0) {
            const existing = choiceFocusedPlayersByType.get(activity.type) ?? [];
            const merged = [...existing];
            for (const playerId of selectedFocusIds) {
              if (!merged.includes(playerId)) merged.push(playerId);
            }
            choiceFocusedPlayersByType.set(activity.type, merged);

            // Single-target focus yields deepest reads. Splitting attention reduces depth.
            const depthGain = Math.max(1, 4 - selectedFocusIds.length); // 1->3, 2->2, 3->1
            choiceFocusDepthByType.set(
              activity.type,
              (choiceFocusDepthByType.get(activity.type) ?? 0) + depthGain,
            );
          }
        }
      }
    }

    const strategy = normalizeWeeklyStrategyState(
      gameState.weeklyStrategy,
      gameState.currentWeek,
      gameState.currentSeason,
    );
    const accumulateStrategyModifier = (
      activityType: Activity["type"],
      modifier: WeeklyStrategyModifier,
    ) => {
      choiceDiscoveryModifiers.set(
        activityType,
        (choiceDiscoveryModifiers.get(activityType) ?? 0) + (modifier.discoveryModifier ?? 0),
      );
      choiceProfileModifiers.set(
        activityType,
        (choiceProfileModifiers.get(activityType) ?? 0) + (modifier.profileModifier ?? 0),
      );
      choiceAnomalyModifiers.set(
        activityType,
        (choiceAnomalyModifiers.get(activityType) ?? 0) + (modifier.anomalyModifier ?? 0),
      );
      choiceRelationshipModifiers.set(
        activityType,
        (choiceRelationshipModifiers.get(activityType) ?? 0) + (modifier.relationshipModifier ?? 0),
      );
      choiceReportQualityModifiers.set(
        activityType,
        (choiceReportQualityModifiers.get(activityType) ?? 0) + (modifier.reportQualityModifier ?? 0),
      );
    };

    // Strategy is applied once per scheduled activity instance. This keeps
    // manual and auto-scheduled weeks equivalent while making the selected
    // weekly intent a real edge with an explicit opposing cost.
    for (const instance of getScheduledActivityInstances(gameState.schedule)) {
      accumulateStrategyModifier(
        instance.activity.type,
        getWeeklyIntentActivityModifier(strategy.intentId, instance.activity),
      );
    }

    // A skipped live call is not silently converted into a generic choice.
    // The persisted standing order resolves it and adds its own tradeoff.
    for (const day of simChoices?.dayResults ?? []) {
      if (day.interaction?.resolutionMode !== "delegated" || !day.activity) continue;
      accumulateStrategyModifier(
        day.activity.type,
        getDelegationPolicyModifier(
          day.interaction.delegationPolicyId ?? strategy.delegationPolicyId,
        ),
      );
    }

    // Interactive observation sessions should have concrete gameplay impact.
    // Each completed scheduled instance adds a mode-specific bonus.
    const completedInteractiveIds = new Set(gameState.completedInteractiveSessions ?? []);
    const scheduledInstances = getScheduledActivityInstances(gameState.schedule);
    const skippedInteractiveByType = new Map<Activity["type"], number>();
    const completedLiveActivityTypes = new Set<Activity["type"]>();
    for (const instance of scheduledInstances) {
      const activity = instance.activity;
      if (activity.type === "attendMatch") continue; // handled by fixture gate
      const mode = ACTIVITY_MODE_MAP[activity.type];
      if (!mode) continue;

      const instanceKey = getInteractiveActivityCompletionKey(activity, instance.dayIndex);
      if (completedInteractiveIds.has(instanceKey)) {
        switch (mode) {
          case "fullObservation":
            // The live session now writes its own observations. Do not add a
            // second generic bonus on top of that evidence.
            completedLiveActivityTypes.add(activity.type);
            break;
          case "investigation":
            choiceRelationshipModifiers.set(
              activity.type,
              (choiceRelationshipModifiers.get(activity.type) ?? 0) + 1,
            );
            choiceReportQualityModifiers.set(
              activity.type,
              (choiceReportQualityModifiers.get(activity.type) ?? 0) + 1,
            );
            break;
          case "analysis":
            choiceProfileModifiers.set(
              activity.type,
              (choiceProfileModifiers.get(activity.type) ?? 0) + 1,
            );
            choiceAnomalyModifiers.set(
              activity.type,
              (choiceAnomalyModifiers.get(activity.type) ?? 0) + 1,
            );
            break;
          case "quickInteraction":
            choiceRelationshipModifiers.set(
              activity.type,
              (choiceRelationshipModifiers.get(activity.type) ?? 0) + 1,
            );
            break;
        }
      } else {
        skippedInteractiveByType.set(
          activity.type,
          (skippedInteractiveByType.get(activity.type) ?? 0) + 1,
        );
      }
    }

    // Skipping live sessions carries a small opportunity-cost penalty.
    for (const [activityType, skippedCount] of skippedInteractiveByType.entries()) {
      if (skippedCount <= 0) continue;
      const mode = ACTIVITY_MODE_MAP[activityType];
      if (!mode) continue;
      switch (mode) {
        case "fullObservation":
          choiceDiscoveryModifiers.set(
            activityType,
            (choiceDiscoveryModifiers.get(activityType) ?? 0) - 1,
          );
          break;
        case "investigation":
          choiceRelationshipModifiers.set(
            activityType,
            (choiceRelationshipModifiers.get(activityType) ?? 0) - 1,
          );
          break;
        case "analysis":
          choiceProfileModifiers.set(
            activityType,
            (choiceProfileModifiers.get(activityType) ?? 0) - 1,
          );
          break;
        case "quickInteraction":
          choiceRelationshipModifiers.set(
            activityType,
            (choiceRelationshipModifiers.get(activityType) ?? 0) - 1,
          );
          break;
      }
    }

    let updatedScout = applyWeekResults(gameState.scout, weekResult);
    const priorPerkIds = new Set(gameState.scout.unlockedPerks ?? []);
    const newlyUnlockedPerks = updatedScout.unlockedPerks
      .filter((perkId) => !priorPerkIds.has(perkId))
      .map((perkId) => ALL_PERKS.find((perk) => perk.id === perkId))
      .filter((perk): perk is NonNullable<typeof perk> => !!perk);

    // Central equipment bonus aggregation for the week
    const weekEquipBonuses = gameState.finances?.equipment
      ? getActiveEquipmentBonuses(gameState.finances.equipment.loadout)
      : undefined;

    // Issue 5c+5d: Apply tool fatigue reduction bonuses
    const weekToolBonuses = getActiveToolBonuses(gameState.unlockedTools);
    const fatigueReduction = weekToolBonuses.fatigueReduction ?? 0;
    const travelFatigueReduction = weekToolBonuses.travelFatigueReduction ?? 0;

    const scheduledTravelActivity = gameState.schedule.activities.find(
      (activity) => activity?.type === "internationalTravel" || activity?.type === "travel",
    );
    const travelDestination = scheduledTravelActivity?.targetId
      ?? gameState.scout.travelBooking?.destinationCountry;
    const infrastructureTravelMultiplier = calculateInfrastructureEffects(
      gameState.scoutingInfrastructure,
    ).travelFatigueMultiplier;
    const presenceTravelMultiplier = travelDestination
      ? deriveRegionalPresence(gameState, travelDestination).effects.travelFatigueMultiplier
      : 1;
    const baseTravelFatigue = scheduledTravelActivity
      ? ACTIVITY_FATIGUE_COSTS_MAP[scheduledTravelActivity.type]
      : 0;
    const regionalAndInfrastructureTravelReduction = Math.max(
      0,
      Math.round(
        baseTravelFatigue
          * (1 - infrastructureTravelMultiplier * presenceTravelMultiplier),
      ),
    );

    // Equipment fatigueReduction: per-activity-type reductions from equipped items
    let equipFatigueReduction = 0;
    if (weekEquipBonuses?.fatigueReduction) {
      const seenTypes = new Set<string>();
      for (const activity of gameState.schedule.activities) {
        if (activity && !seenTypes.has(activity.type)) {
          seenTypes.add(activity.type);
          const activityReduction = weekEquipBonuses.fatigueReduction[activity.type] ?? 0;
          if (activityReduction > 0) equipFatigueReduction += activityReduction;
        }
      }
    }

    if (
      fatigueReduction > 0
      || travelFatigueReduction > 0
      || equipFatigueReduction > 0
      || regionalAndInfrastructureTravelReduction > 0
    ) {
      // Check if any travel activities were scheduled this week
      const hasTravelActivity = gameState.schedule.activities.some(
        (a) => a?.type === "internationalTravel" || a?.type === "travel",
      );
      const totalReduction = fatigueReduction
        + (hasTravelActivity ? travelFatigueReduction : 0)
        + equipFatigueReduction
        + (hasTravelActivity ? regionalAndInfrastructureTravelReduction : 0);
      if (totalReduction > 0) {
        updatedScout = {
          ...updatedScout,
          fatigue: Math.max(0, updatedScout.fatigue - totalReduction),
        };
      }
    }

    // Tick insight cooldown
    const currentInsightForTick = updatedScout.insightState;
    if (currentInsightForTick) {
      updatedScout = {
        ...updatedScout,
        insightState: tickCooldown(currentInsightForTick as any) as any,
      };
    }

    // Accumulate Insight Points earned during the week
    if (weekResult.insightPointsEarned > 0) {
      const insightForAccum = (updatedScout.insightState ?? createInsightState()) as any;
      const ipCapacity = calculateCapacity(updatedScout.attributes.intuition);
      updatedScout = {
        ...updatedScout,
        insightState: accumulateInsight(insightForAccum, weekResult.insightPointsEarned, ipCapacity) as any,
      };
    }

    let stateWithScheduleApplied = {
      ...gameState,
      scout: updatedScout,
      inbox: updatedScout.specializationLevel > gameState.scout.specializationLevel
        ? [
            ...gameState.inbox,
            {
              id: `specialization-level-${updatedScout.specializationLevel}-s${gameState.currentSeason}w${gameState.currentWeek}`,
              week: gameState.currentWeek,
              season: gameState.currentSeason,
              type: "performance" as const,
              title: `${updatedScout.primarySpecialization === "youth" ? "Youth Scouting" : "Scouting"} Mastery: Level ${updatedScout.specializationLevel}`,
              body: newlyUnlockedPerks.length > 0
                ? `Your fieldwork unlocked ${newlyUnlockedPerks.map((perk) => perk.name).join(", ")}. ${newlyUnlockedPerks.map((perk) => perk.description).join(" ")}`
                : "Continued fieldwork has deepened your specialization mastery.",
              read: false,
              actionRequired: false,
            },
          ]
        : gameState.inbox,
    };

    // ── Process week results for new activity types ─────────────────────────

    // a) NPC reports reviewed — mark each report as reviewed
    if (weekResult.npcReportsReviewed.length > 0) {
      const updatedNpcReports = { ...stateWithScheduleApplied.npcReports };
      for (const reportId of weekResult.npcReportsReviewed) {
        const report = updatedNpcReports[reportId];
        if (report) {
          updatedNpcReports[reportId] = { ...report, reviewed: true };
        }
      }
      stateWithScheduleApplied = { ...stateWithScheduleApplied, npcReports: updatedNpcReports };
    }

    // b) Manager meeting — call processManagerMeeting and apply relationship changes
    if (weekResult.managerMeetingExecuted && stateWithScheduleApplied.scout.managerRelationship) {
      stateWithScheduleApplied = conductManagerMeeting(
        stateWithScheduleApplied,
        "listen",
        { fatigueAlreadyPaid: true },
      ).state;
    }

    // c) Board presentation — apply reputation boost for tier 5 scouts
    if (
      weekResult.boardPresentationExecuted &&
      stateWithScheduleApplied.scout.careerTier === 5
    ) {
      stateWithScheduleApplied = conductBoardMeeting(
        stateWithScheduleApplied,
        "accountability",
        { fatigueAlreadyPaid: true },
      ).state;
    }

    // d) Network meetings — call meetContact() for each meeting and apply results
    if (weekResult.meetingsHeld.length > 0) {
      const updatedContacts = { ...stateWithScheduleApplied.contacts };
      const meetingMessages: InboxMessage[] = [];
      let updatedIntel = { ...(stateWithScheduleApplied.contactIntel ?? {}) };

      // Issue 5b: Get tool bonuses for relationship gain
      const meetingToolBonuses = getActiveToolBonuses(stateWithScheduleApplied.unlockedTools);
      const meetingEquipBonuses = stateWithScheduleApplied.finances?.equipment
        ? getActiveEquipmentBonuses(stateWithScheduleApplied.finances.equipment.loadout)
        : undefined;

      for (const contactId of weekResult.meetingsHeld) {
        const contact = updatedContacts[contactId];
        if (!contact) continue;

        const meetingRng = createRNG(
          `${gameState.seed}-meeting-${contactId}-${gameState.currentWeek}-${gameState.currentSeason}`,
        );
        const result = meetContact(
          meetingRng,
          stateWithScheduleApplied.scout,
          contact,
          {
            consequenceState: stateWithScheduleApplied.consequenceState,
            now: {
              week: stateWithScheduleApplied.currentWeek,
              season: stateWithScheduleApplied.currentSeason,
            },
            seasonLength: getSeasonLength(
              stateWithScheduleApplied.fixtures,
              stateWithScheduleApplied.currentSeason,
            ),
          },
        );

        // Issue 5b: Apply relationship gain bonus from tools + equipment
        const interactionRelBonus = (choiceRelationshipModifiers.get("networkMeeting") ?? 0) * 0.05;
        // W3f: Apply lifestyle networking bonus
        const lifestyleNetBonus = stateWithScheduleApplied.finances
          ? getLifestyleNetworkingBonus(stateWithScheduleApplied.finances.lifestyle)
          : 0;
        const relBonus =
          (meetingToolBonuses.relationshipGainBonus ?? 0)
          + (meetingEquipBonuses?.relationshipGainBonus ?? 0)
          + interactionRelBonus
          + lifestyleNetBonus;
        const adjustedChange = result.relationshipChange >= 0
          ? Math.max(1, Math.round(result.relationshipChange * (1 + relBonus)))
          : result.relationshipChange;

        // Apply relationship change — clamp to 0–100
        const newRelationship = Math.max(
          0,
          Math.min(100, contact.relationship + adjustedChange),
        );
        const actualRelationshipChange = newRelationship - contact.relationship;
        // F3: Apply trust change and record interaction history
        const currentTrust = contact.trustLevel ?? contact.relationship;
        const newTrust = Math.max(0, Math.min(100, currentTrust + (result.trustDelta ?? 0)));
        const meetingInteraction = result.interaction
          ? { ...result.interaction, week: gameState.currentWeek }
          : undefined;
        updatedContacts[contactId] = {
          ...contact,
          relationship: newRelationship,
          trustLevel: newTrust,
          lastInteractionWeek: gameState.currentWeek,
          interactionHistory: meetingInteraction
            ? [...(contact.interactionHistory ?? []), meetingInteraction]
            : (contact.interactionHistory ?? []),
        };

        // Issue 7: Store contact intel entries
        // Equipment intelReliabilityBonus: boosts reliability of intel received
        const intelRelBonus = meetingEquipBonuses?.intelReliabilityBonus ?? 0;
        for (const hint of result.intel) {
          const boostedHint = intelRelBonus > 0
            ? { ...hint, reliability: Math.min(1, hint.reliability + intelRelBonus) }
            : hint;
          const existing = updatedIntel[boostedHint.playerId] ?? [];
          updatedIntel[boostedHint.playerId] = [...existing, boostedHint];
        }

        const contactTypeLabel = humanizeIdentifier(contact.type);
        // Build meeting summary message
        const relationshipLine =
          actualRelationshipChange > 0
            ? `Relationship improved by ${actualRelationshipChange} point${actualRelationshipChange === 1 ? "" : "s"} (now ${newRelationship}/100).`
            : actualRelationshipChange < 0
              ? `Relationship declined by ${Math.abs(actualRelationshipChange)} point${Math.abs(actualRelationshipChange) === 1 ? "" : "s"} (now ${newRelationship}/100).`
              : `Relationship held steady at ${newRelationship}/100.`;
        const parts: string[] = [
          `You met with ${contact.name} (${contactTypeLabel}).`,
          relationshipLine,
        ];
        if (result.stakeholderMemoryReason) {
          parts.push("", `PAST DEALINGS: ${result.stakeholderMemoryReason}`);
        }

        for (const intel of result.intel) {
          const resolvedPlayer = resolvePlayerEntity(stateWithScheduleApplied, intel.playerId)?.player
            ?? stateWithScheduleApplied.players[intel.playerId];
          const playerName = resolvedPlayer
            ? `${resolvedPlayer.firstName} ${resolvedPlayer.lastName}`
            : "a player";
          parts.push("");
          parts.push(`INTEL on ${playerName}: ${intel.hint}`);
        }

        for (const tip of result.tips) {
          const resolvedPlayer = resolvePlayerEntity(stateWithScheduleApplied, tip.playerId)?.player
            ?? stateWithScheduleApplied.players[tip.playerId];
          const playerName = resolvedPlayer
            ? `${resolvedPlayer.firstName} ${resolvedPlayer.lastName}`
            : "a player";
          parts.push("");
          parts.push(`TIP: ${playerName} ${tip.description}`);
        }

        // Youth scout: boost visibility/buzz for youth mentioned in tips
        if (stateWithScheduleApplied.scout.primarySpecialization === "youth") {
          for (const tip of result.tips) {
            const youth = resolveUnsignedYouth(stateWithScheduleApplied, tip.playerId);
            if (!youth || youth.placed || youth.retired) continue;
            stateWithScheduleApplied = {
              ...stateWithScheduleApplied,
              unsignedYouth: {
                ...stateWithScheduleApplied.unsignedYouth,
                [youth.id]: {
                  ...youth,
                  visibility: Math.min(100, youth.visibility + 5),
                  buzzLevel: Math.min(100, youth.buzzLevel + 5),
                  discoveredBy: youth.discoveredBy.includes(stateWithScheduleApplied.scout.id)
                    ? youth.discoveredBy
                    : [...youth.discoveredBy, stateWithScheduleApplied.scout.id],
                },
              },
            };
          }
        }

        // Wire "contractRunningDown" tips to free agent pool discovery
        for (const tip of result.tips) {
          if (tip.tipType === "contractRunningDown" && stateWithScheduleApplied.freeAgentPool) {
            stateWithScheduleApplied = {
              ...stateWithScheduleApplied,
              freeAgentPool: processContactFreeAgentTip(
                stateWithScheduleApplied.freeAgentPool,
                tip.playerId,
              ),
            };
          }
        }

        meetingMessages.push({
          id: `meeting-${contactId}-w${gameState.currentWeek}-s${gameState.currentSeason}`,
          week: stateWithScheduleApplied.currentWeek,
          season: stateWithScheduleApplied.currentSeason,
          type: "event" as const,
          title: `Meeting with ${contact.name}`,
          body: parts.join("\n"),
          read: false,
          actionRequired: false,
        });
      }

      stateWithScheduleApplied = {
        ...stateWithScheduleApplied,
        contacts: updatedContacts,
        contactIntel: updatedIntel,
        inbox: [...stateWithScheduleApplied.inbox, ...meetingMessages],
      };

      // Tournament tips from contacts
      const tipMessages: typeof meetingMessages = [];
      let updatedTournaments = { ...(stateWithScheduleApplied.youthTournaments ?? {}) };
      for (const contactId of weekResult.meetingsHeld) {
        const contact = updatedContacts[contactId];
        if (!contact) continue;
        const tipRng = createRNG(
          `${gameState.seed}-tip-${contactId}-w${gameState.currentWeek}-s${gameState.currentSeason}`,
        );
        const tournamentTip = processContactTournamentTip(
          tipRng, contact, updatedTournaments,
          stateWithScheduleApplied.subRegions,
          stateWithScheduleApplied.currentWeek,
          stateWithScheduleApplied.currentSeason,
        );
        if (tournamentTip) {
          updatedTournaments[tournamentTip.id] = tournamentTip;
          tipMessages.push({
            id: `tournament-tip-${tournamentTip.id}`,
            week: stateWithScheduleApplied.currentWeek,
            season: stateWithScheduleApplied.currentSeason,
            type: "event" as const,
            title: `Tournament Tip: ${tournamentTip.name}`,
            body: `${contact.name} mentioned ${tournamentTip.name} — a ${tournamentTip.prestige} youth tournament in ${tournamentTip.country} (weeks ${tournamentTip.startWeek}–${tournamentTip.endWeek}). Consider scheduling a visit.`,
            read: false,
            actionRequired: false,
          });
        }
      }
      if (tipMessages.length > 0) {
        stateWithScheduleApplied = {
          ...stateWithScheduleApplied,
          youthTournaments: updatedTournaments,
          inbox: [...stateWithScheduleApplied.inbox, ...tipMessages],
        };
      }
    }

    // d2) Free agent outreach — direct, schedule-driven discovery pressure.
    // This makes the calendar activity materially different from passive weekly
    // pool discovery by surfacing immediate leads tied to player choices.
    if (weekResult.freeAgentOutreachExecuted > 0 && stateWithScheduleApplied.freeAgentPool) {
      const qr = qualityByType.get("freeAgentOutreach");
      const qualityDiscoveryMod = qr?.discoveryModifier ?? 0;
      const choiceDiscoveryMod = choiceDiscoveryModifiers.get("freeAgentOutreach") ?? 0;
      const totalDiscoveryBudget = Math.max(
        1,
        weekResult.freeAgentOutreachExecuted + qualityDiscoveryMod + choiceDiscoveryMod,
      );
      const focusIds = new Set(choiceFocusedPlayersByType.get("freeAgentOutreach") ?? []);
      const candidates = stateWithScheduleApplied.freeAgentPool.agents.filter(
        (agent) => agent.status === "available" && !agent.discoveredByScout,
      );
      const prioritized = [...candidates].sort((a, b) => {
        const aFocus = focusIds.has(a.playerId) ? 1 : 0;
        const bFocus = focusIds.has(b.playerId) ? 1 : 0;
        if (aFocus !== bFocus) return bFocus - aFocus;
        const interestDelta = b.npcInterest.length - a.npcInterest.length;
        if (interestDelta !== 0) return interestDelta;
        return b.weeksInPool - a.weeksInPool;
      });
      const discoveredNow = prioritized.slice(0, totalDiscoveryBudget);

      if (discoveredNow.length > 0) {
        const discoveredIds = new Set(discoveredNow.map((agent) => agent.playerId));
        const updatedAgents = stateWithScheduleApplied.freeAgentPool.agents.map((agent) =>
          discoveredIds.has(agent.playerId)
            ? { ...agent, discoveredByScout: true, discoverySource: "contactTip" as const }
            : agent,
        );
        const outreachMessages: InboxMessage[] = [];
        for (const [idx, agent] of discoveredNow.entries()) {
          const player = stateWithScheduleApplied.players[agent.playerId];
          if (!player) continue;
          const formerClub = stateWithScheduleApplied.clubs[agent.releasedFrom];
          const formerClubName = formerClub?.name ?? "an unknown club";
          const qualityPrefix = qr && idx === 0 ? `${qr.narrative}\n\n` : "";
          outreachMessages.push({
            id: `fa-outreach-${agent.playerId}-w${stateWithScheduleApplied.currentWeek}-${idx}`,
            week: stateWithScheduleApplied.currentWeek,
            season: stateWithScheduleApplied.currentSeason,
            type: "news" as const,
            title: `Free Agent Lead: ${player.firstName} ${player.lastName}`,
            body: `${qualityPrefix}Your outreach work surfaced ${player.firstName} ${player.lastName} (${player.position}, ${player.age}) after release from ${formerClubName}. This player is now in your known free agent pool.`,
            read: false,
            actionRequired: false,
            relatedId: player.id,
            relatedEntityType: "player" as const,
          });
        }

        stateWithScheduleApplied = {
          ...stateWithScheduleApplied,
          freeAgentPool: {
            ...stateWithScheduleApplied.freeAgentPool,
            agents: updatedAgents,
          },
          inbox: [...stateWithScheduleApplied.inbox, ...outreachMessages],
        };
      }
    }

    // d3) Loan activity counters → reputation bumps
    if (weekResult.loanMonitoringExecuted > 0) {
      const monitoringRep = weekResult.loanMonitoringExecuted * 1;
      stateWithScheduleApplied = {
        ...stateWithScheduleApplied,
        scout: {
          ...stateWithScheduleApplied.scout,
          reputation: Math.min(100, stateWithScheduleApplied.scout.reputation + monitoringRep),
        },
      };
    }

    // e) Write Reports — process scheduled writeReport activities into actual reports
    if (weekResult.reportsWritten.length > 0) {
      const updatedReports = { ...stateWithScheduleApplied.reports };
      let updatedScoutingCases = { ...(stateWithScheduleApplied.scoutingCases ?? {}) };
      let reportScout = { ...stateWithScheduleApplied.scout };
      let reportDiscoveries = [...(stateWithScheduleApplied.discoveryRecords ?? [])];
      const reportMessages: InboxMessage[] = [];

      for (const playerId of weekResult.reportsWritten) {
        const player = stateWithScheduleApplied.players[playerId];
        if (!player) continue;

        const playerObs = Object.values(stateWithScheduleApplied.observations).filter(
          (o) => o.playerId === playerId && o.scoutId === reportScout.id,
        );
        if (playerObs.length === 0) {
          reportMessages.push({
            id: `report-noobs-${playerId}-w${stateWithScheduleApplied.currentWeek}`,
            week: stateWithScheduleApplied.currentWeek,
            season: stateWithScheduleApplied.currentSeason,
            type: "feedback" as const,
            title: `Report Failed: ${player.firstName} ${player.lastName}`,
            body: `You attempted to write a report on ${player.firstName} ${player.lastName}, but you have no observations on this player yet. Scout them first through match attendance, training visits, or venue activities before writing a report.`,
            read: false,
            actionRequired: false,
            relatedId: playerId,
            relatedEntityType: "player" as const,
          });
          continue;
        }

        const previousReport = getLatestReportInScope(
          Object.values(updatedReports),
          reportScout.id,
          playerId,
        );
        if (getFreshReportObservationIds(playerObs, previousReport).length === 0) {
          reportMessages.push({
            id: `report-no-new-evidence-${playerId}-w${stateWithScheduleApplied.currentWeek}-s${stateWithScheduleApplied.currentSeason}`,
            week: stateWithScheduleApplied.currentWeek,
            season: stateWithScheduleApplied.currentSeason,
            type: "feedback" as const,
            title: `Report Deferred: ${player.firstName} ${player.lastName}`,
            body: `Your existing case already contains all available observations on ${player.firstName} ${player.lastName}. Gather new evidence before scheduling another revision; repeat paperwork does not create reputation or performance credit.`,
            read: false,
            actionRequired: false,
            relatedId: playerId,
            relatedEntityType: "player" as const,
          });
          continue;
        }

        const draft = generateReportContent(player, playerObs, reportScout);
        const report = attachReportEvidence(finalizeReport(
          draft,
          "recommend",
          `Scouting report on ${player.firstName} ${player.lastName} based on ${playerObs.length} observation${playerObs.length !== 1 ? "s" : ""}.`,
          draft.suggestedStrengths ?? [],
          draft.suggestedWeaknesses ?? [],
          reportScout,
          stateWithScheduleApplied.currentWeek,
          stateWithScheduleApplied.currentSeason,
          playerId,
        ), playerObs, previousReport);
        const qualityMod = choiceReportQualityModifiers.get("writeReport") ?? 0;
        // F14: Include infrastructure report quality bonus + equipment reportQuality bonus
        const infraReportBonus = calculateInfrastructureEffects(stateWithScheduleApplied.scoutingInfrastructure).reportQualityBonus;
        const equipReportBonus = weekEquipBonuses?.reportQuality ?? 0;
        const craftQuality = calculateReportCraftQualityDetailed(
          report,
          playerObs,
          reportScout,
          player,
          infraReportBonus + equipReportBonus,
        );
        const quality = Math.max(0, Math.min(100, craftQuality.score + qualityMod));
        const isNewCase = previousReport === undefined;
        const repBefore = reportScout.reputation;
        if (isNewCase) {
          reportScout = updateReputation(reportScout, { type: "reportSubmitted", quality });
          reportScout = { ...reportScout, reportsSubmitted: reportScout.reportsSubmitted + 1 };
        }
        const repDelta = +(reportScout.reputation - repBefore).toFixed(1);
        let scoredReport: ScoutReport = {
          ...report,
          qualityScore: quality,
          reputationDelta: repDelta,
          craftBreakdown: craftQuality.breakdown,
          validationSnapshot: Object.fromEntries(
            report.attributeAssessments.map((assessment) => [
              assessment.attribute,
              player.attributes[assessment.attribute],
            ]),
          ),
        };
        const caseLink = ensureScoutingCaseForReport(updatedScoutingCases, scoredReport);
        updatedScoutingCases = caseLink.scoutingCases;
        scoredReport = caseLink.report;
        updatedReports[scoredReport.id] = scoredReport;

        // Record discovery
        const alreadyDiscovered = reportDiscoveries.some((r) => r.playerId === playerId);
        if (!alreadyDiscovered) {
          const disc = recordDiscovery(player, reportScout, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason);
          reportDiscoveries = [...reportDiscoveries, disc];
        }

        reportMessages.push({
          id: `auto-report-${playerId}-w${stateWithScheduleApplied.currentWeek}`,
          week: stateWithScheduleApplied.currentWeek,
          season: stateWithScheduleApplied.currentSeason,
          type: "feedback" as const,
          title: `${isNewCase ? "Report Filed" : `Revision ${scoredReport.revision ?? 1} Filed`}: ${player.firstName} ${player.lastName}`,
          body: isNewCase
            ? `Your scouting report on ${player.firstName} ${player.lastName} has been filed.\nQuality: ${quality}/100 | Reputation ${repDelta >= 0 ? "+" : ""}${repDelta}`
            : `New evidence has been preserved as revision ${scoredReport.revision ?? 1} of this case.\nQuality: ${quality}/100 | Case revisions improve accountability but do not inflate report volume or submission reputation.`,
          read: false,
          actionRequired: false,
          relatedId: playerId,
          relatedEntityType: "player" as const,
        });
      }

      stateWithScheduleApplied = {
        ...stateWithScheduleApplied,
        reports: updatedReports,
        scoutingCases: updatedScoutingCases,
        scout: reportScout,
        discoveryRecords: reportDiscoveries,
        inbox: [...stateWithScheduleApplied.inbox, ...reportMessages],
      };
    }

    // f) Activity feedback — narrative-driven feedback using quality rolls
    //    Scouting activities (academy/tournament/training/video) skip here;
    //    their narratives are prepended to observation messages in section (g).
    {
      const SCOUTING_TYPES = new Set([
        "academyVisit", "youthTournament", "trainingVisit", "watchVideo",
        "schoolMatch", "grassrootsTournament", "streetFootball", "academyTrialDay",
        "youthFestival", "followUpSession", "parentCoachMeeting",
        "reserveMatch", "scoutingMission", "oppositionAnalysis", "agentShowcase", "trialMatch",
        "databaseQuery", "deepVideoAnalysis", "statsBriefing", "algorithmCalibration",
        "marketInefficiency", "analyticsTeamMeeting",
      ]);
      const ACTIVITY_LABELS: Record<string, string> = {
        attendMatch: "Match Attendance",
        watchVideo: "Video Analysis",
        writeReport: "Report Writing",
        networkMeeting: "Network Meeting",
        trainingVisit: "Training Visit",
        study: "Study Session",
        academyVisit: "Academy Visit",
        youthTournament: "Youth Tournament",
      };
      const SKILL_LABELS_MAP: Record<string, string> = {
        technicalEye: "Technical Eye", physicalAssessment: "Physical Assessment",
        psychologicalRead: "Psychological Read", tacticalUnderstanding: "Tactical Understanding",
        dataLiteracy: "Data Literacy", playerJudgment: "Player Judgment",
        potentialAssessment: "Potential Assessment",
      };
      const TIER_LABELS: Record<string, string> = {
        poor: "Poor", average: "Average", good: "Good",
        excellent: "Excellent", exceptional: "Exceptional",
      };
      const DAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

      const feedbackMessages: InboxMessage[] = [];
      for (const [idx, entry] of qualityRollsByDay.entries()) {
        const qr = entry.result;
        // Skip scouting types — they get narratives prepended in section (g)
        if (SCOUTING_TYPES.has(qr.activityType)) continue;

        const label = ACTIVITY_LABELS[qr.activityType] ?? qr.activityType;
        const tierLabel = TIER_LABELS[qr.tier] ?? qr.tier;
        const dayLabel = DAY_LABELS[entry.dayIndex] ?? `Day ${entry.dayIndex + 1}`;

        const parts: string[] = [qr.narrative, ""];
        const skillXp = weekResult.skillXpGained;
        const attrXp = weekResult.attributeXpGained;
        for (const [skill, val] of Object.entries(skillXp)) {
          if (val && val > 0) parts.push(`${SKILL_LABELS_MAP[skill] ?? skill} +${val} XP`);
        }
        for (const [attr, val] of Object.entries(attrXp)) {
          if (val && val > 0) parts.push(`${attr.charAt(0).toUpperCase() + attr.slice(1)} +${val} XP`);
        }
        parts.push(`Fatigue ${weekResult.fatigueChange >= 0 ? "+" : ""}${weekResult.fatigueChange}.`);

        feedbackMessages.push({
          id: `activity-${qr.activityType}-d${entry.dayIndex}-w${stateWithScheduleApplied.currentWeek}-${idx}`,
          week: stateWithScheduleApplied.currentWeek,
          season: stateWithScheduleApplied.currentSeason,
          type: "feedback" as const,
          title: `${label} (${tierLabel}) — ${dayLabel}`,
          body: parts.join("\n"),
          read: false,
          actionRequired: false,
        });
      }
      if (feedbackMessages.length > 0) {
        stateWithScheduleApplied = {
          ...stateWithScheduleApplied,
          inbox: [...stateWithScheduleApplied.inbox, ...feedbackMessages],
        };
      }
    }

    // g) Activity-based observations — academy visits, youth tournaments,
    //    training visits, and video analysis generate player observations.
    //    Quality rolls modify discovery counts and prepend narratives.
    let weekPlayersDiscovered = 0;
    let weekObservationsGenerated = 0;
    {
      const actObsRng = createRNG(
        `${gameState.seed}-actobs-${gameState.currentWeek}-${gameState.currentSeason}`,
      );
      const updatedObservations = { ...stateWithScheduleApplied.observations };
      const preexistingObservationIds = new Set(Object.keys(updatedObservations));
      let actDiscoveries = [...(stateWithScheduleApplied.discoveryRecords ?? [])];
      const actObsMessages: InboxMessage[] = [];
      const allPlayers = Object.values(stateWithScheduleApplied.players);
      const existingObs = Object.values(updatedObservations);
      const observationEvidenceIndex = createObservationEvidenceIndex(existingObs);
      const playerEvidence = (playerId: string): Observation[] =>
        getPlayerObservationEvidence(observationEvidenceIndex, playerId);
      const recordObservation = (observation: Observation): void => {
        updatedObservations[observation.id] = observation;
        upsertObservationEvidence(observationEvidenceIndex, observation);
      };
      const observedPlayerIds = new Set(existingObs.map((o) => o.playerId));
      const currentScout = stateWithScheduleApplied.scout;
      const effectiveScoutCountry = resolveScoutEffectiveCountry(
        currentScout,
        stateWithScheduleApplied.regionalKnowledge,
        stateWithScheduleApplied.currentWeek,
      );

      // Equipment attributesPerSession bonus: extra attributes revealed per observation
      const extraAttrsPerSession = weekEquipBonuses?.attributesPerSession ?? 0;

      // Lookup aggregated quality for a given activity type.
      // Aggregation is built from day-level rolls to keep outcomes consistent
      // with week simulation while preserving existing handler contracts.
      const qualityMap = qualityByType;

      const TIER_LABELS: Record<string, string> = {
        poor: "Poor", average: "Average", good: "Good",
        excellent: "Excellent", exceptional: "Exceptional",
      };

      // Helper: apply discovery modifier to base range, clamped to min 1
      function adjustedRange(baseMin: number, baseMax: number, mod: number): [number, number] {
        return [Math.max(1, baseMin + mod), Math.max(1, baseMax + mod)];
      }

      function choiceDiscoveryMod(activityType: Activity["type"]): number {
        return choiceDiscoveryModifiers.get(activityType) ?? 0;
      }

      function choiceProfileMod(activityType: Activity["type"]): number {
        return choiceProfileModifiers.get(activityType) ?? 0;
      }

      function choiceAnomalyMod(activityType: Activity["type"]): number {
        return choiceAnomalyModifiers.get(activityType) ?? 0;
      }

      function choiceRelationshipMod(activityType: Activity["type"]): number {
        return choiceRelationshipModifiers.get(activityType) ?? 0;
      }

      function choiceReportQualityMod(activityType: Activity["type"]): number {
        return choiceReportQualityModifiers.get(activityType) ?? 0;
      }

      function focusDepth(activityType: Activity["type"]): number {
        return choiceFocusDepthByType.get(activityType) ?? 0;
      }

      function focusPlayers(activityType: Activity["type"]): string[] {
        const selected = choiceFocusedPlayersByType.get(activityType);
        if (selected && selected.length > 0) return selected;
        if (simChoices?.focusedYouthPlayerIds && simChoices.focusedYouthPlayerIds.length > 0) {
          return simChoices.focusedYouthPlayerIds;
        }
        if (simChoices?.focusedYouthPlayerId) return [simChoices.focusedYouthPlayerId];
        return [];
      }

      function prioritizeFocusedYouth(
        pool: UnsignedYouth[],
        activityType: Activity["type"],
      ): UnsignedYouth[] {
        const targetIds = focusPlayers(activityType);
        if (targetIds.length === 0) return pool;

        const orderMap = new Map(targetIds.map((id, idx) => [id, idx]));
        const focused: UnsignedYouth[] = [];
        const rest: UnsignedYouth[] = [];
        for (const youth of pool) {
          if (orderMap.has(youth.player.id)) {
            focused.push(youth);
          } else {
            rest.push(youth);
          }
        }

        focused.sort((a, b) => {
          const aOrder = orderMap.get(a.player.id) ?? Number.MAX_SAFE_INTEGER;
          const bOrder = orderMap.get(b.player.id) ?? Number.MAX_SAFE_INTEGER;
          return aOrder - bOrder;
        });
        return [...focused, ...rest];
      }

      function prioritizeFocusedPlayers(
        pool: Player[],
        activityType: Activity["type"],
      ): Player[] {
        const targetIds = focusPlayers(activityType);
        if (targetIds.length === 0) return pool;

        const orderMap = new Map(targetIds.map((id, idx) => [id, idx]));
        const focused: Player[] = [];
        const rest: Player[] = [];
        for (const player of pool) {
          if (orderMap.has(player.id)) {
            focused.push(player);
          } else {
            rest.push(player);
          }
        }

        focused.sort((a, b) => {
          const aOrder = orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
          const bOrder = orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
          return aOrder - bOrder;
        });
        return [...focused, ...rest];
      }

      // --- Academy Visit: base 2-3, modified by quality ---
      // Youth scouts use the proper youth venue system to draw from unsignedYouth.
      if (weekResult.academyVisitsExecuted > 0) {
        const qr = qualityMap.get("academyVisit");
        const discMod = (qr?.discoveryModifier ?? 0) + choiceDiscoveryMod("academyVisit");
        const [rangeMin, rangeMax] = adjustedRange(2, 3, discMod);
        const tierLabel = qr ? TIER_LABELS[qr.tier] ?? qr.tier : "";

        if (currentScout.primarySpecialization === "youth") {
          // Youth scouts: use getYouthVenuePool to draw from unsigned youth
          const venuePool = getYouthVenuePool(
            actObsRng,
            "academyTrialDay", // academyVisit maps to academyTrialDay venue
            stateWithScheduleApplied.unsignedYouth,
            currentScout,
            undefined,
            undefined,
            undefined,
            stateWithScheduleApplied.currentWeek,
            undefined,
            buildScoutQualityDataForState(
              stateWithScheduleApplied,
              effectiveScoutCountry,
            ),
          );
          const prioritizedPool = prioritizeFocusedYouth([...venuePool], "academyVisit");
          const count = Math.min(prioritizedPool.length, actObsRng.nextInt(rangeMin, rangeMax));
          for (let i = 0; i < count; i++) {
            const youth = prioritizedPool[i];
            const existingObsForYouth = playerEvidence(youth.player.id);
            const result = processVenueObservation(
              actObsRng, currentScout, youth, "academyVisit",
              existingObsForYouth, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason,
            );
            recordObservation(result.observation);
            weekObservationsGenerated++;
            const alreadyDiscovered = actDiscoveries.some((r) => r.playerId === youth.player.id);
            if (!alreadyDiscovered) {
              actDiscoveries = [...actDiscoveries, recordDiscovery(youth.player, currentScout, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason)];
              weekPlayersDiscovered++;
            }
            const topAttrs = result.observation.attributeReadings
              .sort((a, b) => b.perceivedValue - a.perceivedValue)
              .slice(0, 3)
              .map((r) => `${r.attribute} ${r.perceivedValue}`)
              .join(", ");
            const narrativePrefix = qr && i === 0 ? `${qr.narrative}\n\n` : "";
            actObsMessages.push({
              id: `obs-academy-${youth.player.id}-w${stateWithScheduleApplied.currentWeek}`,
              week: stateWithScheduleApplied.currentWeek,
              season: stateWithScheduleApplied.currentSeason,
              type: "feedback" as const,
              title: `Academy Visit${tierLabel ? ` (${tierLabel})` : ""}: ${youth.player.firstName} ${youth.player.lastName}`,
              body: `${narrativePrefix}You observed ${youth.player.firstName} ${youth.player.lastName} (age ${youth.player.age}, ${youth.player.position}) from ${youth.country} during an academy visit. ${result.observation.attributeReadings.length} attributes assessed. Notable: ${topAttrs}.`,
              read: false,
              actionRequired: false,
              relatedId: youth.player.id,
              relatedEntityType: "player" as const,
            });
          }

          const focusTargetIds = focusPlayers("academyVisit");
          const focusRepeats = focusDepth("academyVisit");
          if (focusTargetIds.length > 0 && focusRepeats > 0) {
            const focusedYouthList = focusTargetIds
              .map((id) =>
                prioritizedPool.find((y) => y.player.id === id)
                ?? Object.values(stateWithScheduleApplied.unsignedYouth).find((y) => y.player.id === id),
              )
              .filter((y): y is UnsignedYouth => !!y);

            if (focusedYouthList.length > 0) {
              for (let repeat = 0; repeat < focusRepeats; repeat++) {
                const focusedYouth = focusedYouthList[repeat % focusedYouthList.length];
                const focusObsForYouth = playerEvidence(focusedYouth.player.id);
                const focusResult = processVenueObservation(
                  actObsRng,
                  currentScout,
                  focusedYouth,
                  "followUpSession",
                  focusObsForYouth,
                  stateWithScheduleApplied.currentWeek,
                  stateWithScheduleApplied.currentSeason,
                );
                recordObservation(focusResult.observation);
                weekObservationsGenerated++;
              }
            }
          }
        } else {
          // Non-youth scouts: existing behaviour using signed players
          const youthPool = allPlayers.filter(
            (p) => p.age <= 21 && !observedPlayerIds.has(p.id),
          );
          const prioritizedPlayers = prioritizeFocusedPlayers(
            actObsRng.shuffle([...youthPool]),
            "academyVisit",
          );
          const count = Math.min(prioritizedPlayers.length, actObsRng.nextInt(rangeMin, rangeMax));

          for (let i = 0; i < count; i++) {
            const player = prioritizedPlayers[i];

            const obs = observePlayerLight(actObsRng, player, currentScout, "academyVisit", playerEvidence(player.id), extraAttrsPerSession);
            obs.week = stateWithScheduleApplied.currentWeek;
            obs.season = stateWithScheduleApplied.currentSeason;
            recordObservation(obs);
            observedPlayerIds.add(player.id);
            weekObservationsGenerated++;

            const alreadyDiscovered = actDiscoveries.some((r) => r.playerId === player.id);
            if (!alreadyDiscovered) {
              actDiscoveries = [...actDiscoveries, recordDiscovery(player, currentScout, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason)];
              weekPlayersDiscovered++;
            }

            const topAttrs = obs.attributeReadings
              .sort((a, b) => b.perceivedValue - a.perceivedValue)
              .slice(0, 3)
              .map((r) => `${r.attribute} ${r.perceivedValue}`)
              .join(", ");
            const club = player.clubId ? stateWithScheduleApplied.clubs[player.clubId] : undefined;
            const narrativePrefix = qr && i === 0 ? `${qr.narrative}\n\n` : "";
            actObsMessages.push({
              id: `obs-academy-${player.id}-w${stateWithScheduleApplied.currentWeek}`,
              week: stateWithScheduleApplied.currentWeek,
              season: stateWithScheduleApplied.currentSeason,
              type: "feedback" as const,
              title: `Academy Visit${tierLabel ? ` (${tierLabel})` : ""}: ${player.firstName} ${player.lastName}`,
              body: `${narrativePrefix}You observed ${player.firstName} ${player.lastName} (age ${player.age}, ${player.position}) from ${club?.name ?? "Unknown"} during an academy visit. ${obs.attributeReadings.length} attributes assessed. Notable: ${topAttrs}.`,
              read: false,
              actionRequired: false,
              relatedId: player.id,
              relatedEntityType: "player" as const,
            });
          }

          const focusTargetIds = focusPlayers("academyVisit");
          const focusRepeats = focusDepth("academyVisit");
          if (focusTargetIds.length > 0 && focusRepeats > 0) {
            const focusedPlayers = focusTargetIds
              .map((id) => prioritizedPlayers.find((p) => p.id === id) ?? stateWithScheduleApplied.players[id])
              .filter((p): p is Player => !!p);

            for (let repeat = 0; repeat < focusRepeats && focusedPlayers.length > 0; repeat++) {
              const focusedPlayer = focusedPlayers[repeat % focusedPlayers.length];
              const focusObs = observePlayerLight(
                actObsRng,
                focusedPlayer,
                currentScout,
                "academyVisit",
                playerEvidence(focusedPlayer.id),
                extraAttrsPerSession,
              );
              focusObs.week = stateWithScheduleApplied.currentWeek;
              focusObs.season = stateWithScheduleApplied.currentSeason;
              recordObservation(focusObs);
              observedPlayerIds.add(focusedPlayer.id);
              weekObservationsGenerated++;
            }
          }
        }
      }

      // --- Youth Tournament: base 3-5, modified by quality ---
      // Youth scouts use the proper youth venue system to draw from unsignedYouth.
      if (weekResult.youthTournamentsExecuted > 0) {
        const qr = qualityMap.get("youthTournament");
        const discMod = (qr?.discoveryModifier ?? 0) + choiceDiscoveryMod("youthTournament");
        const [rangeMin, rangeMax] = adjustedRange(3, 5, discMod);
        const tierLabel = qr ? TIER_LABELS[qr.tier] ?? qr.tier : "";

        if (currentScout.primarySpecialization === "youth") {
          // Youth scouts: use getYouthVenuePool with youthFestival venue type
          const venuePool = getYouthVenuePool(
            actObsRng,
            "youthFestival", // youthTournament maps to youthFestival venue
            stateWithScheduleApplied.unsignedYouth,
            currentScout,
            undefined,
            undefined,
            undefined,
            stateWithScheduleApplied.currentWeek,
            undefined,
            buildScoutQualityDataForState(
              stateWithScheduleApplied,
              effectiveScoutCountry,
            ),
          );
          const prioritizedPool = prioritizeFocusedYouth([...venuePool], "youthTournament");
          const count = Math.min(prioritizedPool.length, actObsRng.nextInt(rangeMin, rangeMax));
          for (let i = 0; i < count; i++) {
            const youth = prioritizedPool[i];
            const existingObsForYouth = playerEvidence(youth.player.id);
            const result = processVenueObservation(
              actObsRng, currentScout, youth, "youthTournament",
              existingObsForYouth, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason,
            );
            recordObservation(result.observation);
            weekObservationsGenerated++;
            const alreadyDiscovered = actDiscoveries.some((r) => r.playerId === youth.player.id);
            if (!alreadyDiscovered) {
              actDiscoveries = [...actDiscoveries, recordDiscovery(youth.player, currentScout, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason)];
              weekPlayersDiscovered++;
            }
            const topAttrs = result.observation.attributeReadings
              .sort((a, b) => b.perceivedValue - a.perceivedValue)
              .slice(0, 3)
              .map((r) => `${r.attribute} ${r.perceivedValue}`)
              .join(", ");
            const narrativePrefix = qr && i === 0 ? `${qr.narrative}\n\n` : "";
            actObsMessages.push({
              id: `obs-tournament-${youth.player.id}-w${stateWithScheduleApplied.currentWeek}`,
              week: stateWithScheduleApplied.currentWeek,
              season: stateWithScheduleApplied.currentSeason,
              type: "feedback" as const,
              title: `Youth Tournament${tierLabel ? ` (${tierLabel})` : ""}: ${youth.player.firstName} ${youth.player.lastName}`,
              body: `${narrativePrefix}You spotted ${youth.player.firstName} ${youth.player.lastName} (age ${youth.player.age}, ${youth.player.position}) from ${youth.country} at a youth tournament. ${result.observation.attributeReadings.length} attributes assessed. Notable: ${topAttrs}.`,
              read: false,
              actionRequired: false,
              relatedId: youth.player.id,
              relatedEntityType: "player" as const,
            });
          }

          const focusTargetIds = focusPlayers("youthTournament");
          const focusRepeats = focusDepth("youthTournament");
          if (focusTargetIds.length > 0 && focusRepeats > 0) {
            const focusedYouthList = focusTargetIds
              .map((id) =>
                prioritizedPool.find((y) => y.player.id === id)
                ?? Object.values(stateWithScheduleApplied.unsignedYouth).find((y) => y.player.id === id),
              )
              .filter((y): y is UnsignedYouth => !!y);

            if (focusedYouthList.length > 0) {
              for (let repeat = 0; repeat < focusRepeats; repeat++) {
                const focusedYouth = focusedYouthList[repeat % focusedYouthList.length];
                const focusObsForYouth = playerEvidence(focusedYouth.player.id);
                const focusResult = processVenueObservation(
                  actObsRng,
                  currentScout,
                  focusedYouth,
                  "followUpSession",
                  focusObsForYouth,
                  stateWithScheduleApplied.currentWeek,
                  stateWithScheduleApplied.currentSeason,
                );
                recordObservation(focusResult.observation);
                weekObservationsGenerated++;
              }
            }
          }
        } else {
          // Non-youth scouts: existing behaviour using signed players
          const youthPool = allPlayers.filter(
            (p) => p.age <= 21 && !observedPlayerIds.has(p.id),
          );
          const prioritizedPlayers = prioritizeFocusedPlayers(
            actObsRng.shuffle([...youthPool]),
            "youthTournament",
          );
          const count = Math.min(prioritizedPlayers.length, actObsRng.nextInt(rangeMin, rangeMax));

          for (let i = 0; i < count; i++) {
            const player = prioritizedPlayers[i];

            const obs = observePlayerLight(actObsRng, player, currentScout, "youthTournament", playerEvidence(player.id), extraAttrsPerSession);
            obs.week = stateWithScheduleApplied.currentWeek;
            obs.season = stateWithScheduleApplied.currentSeason;
            recordObservation(obs);
            observedPlayerIds.add(player.id);
            weekObservationsGenerated++;

            const alreadyDiscovered = actDiscoveries.some((r) => r.playerId === player.id);
            if (!alreadyDiscovered) {
              actDiscoveries = [...actDiscoveries, recordDiscovery(player, currentScout, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason)];
              weekPlayersDiscovered++;
            }

            const topAttrs = obs.attributeReadings
              .sort((a, b) => b.perceivedValue - a.perceivedValue)
              .slice(0, 3)
              .map((r) => `${r.attribute} ${r.perceivedValue}`)
              .join(", ");
            const club = player.clubId ? stateWithScheduleApplied.clubs[player.clubId] : undefined;
            const narrativePrefix = qr && i === 0 ? `${qr.narrative}\n\n` : "";
            actObsMessages.push({
              id: `obs-tournament-${player.id}-w${stateWithScheduleApplied.currentWeek}`,
              week: stateWithScheduleApplied.currentWeek,
              season: stateWithScheduleApplied.currentSeason,
              type: "feedback" as const,
              title: `Youth Tournament${tierLabel ? ` (${tierLabel})` : ""}: ${player.firstName} ${player.lastName}`,
              body: `${narrativePrefix}You spotted ${player.firstName} ${player.lastName} (age ${player.age}, ${player.position}) from ${club?.name ?? "Unknown"} at a youth tournament. ${obs.attributeReadings.length} attributes assessed. Notable: ${topAttrs}.`,
              read: false,
              actionRequired: false,
              relatedId: player.id,
              relatedEntityType: "player" as const,
            });
          }

          const focusTargetIds = focusPlayers("youthTournament");
          const focusRepeats = focusDepth("youthTournament");
          if (focusTargetIds.length > 0 && focusRepeats > 0) {
            const focusedPlayers = focusTargetIds
              .map((id) => prioritizedPlayers.find((p) => p.id === id) ?? stateWithScheduleApplied.players[id])
              .filter((p): p is Player => !!p);

            for (let repeat = 0; repeat < focusRepeats && focusedPlayers.length > 0; repeat++) {
              const focusedPlayer = focusedPlayers[repeat % focusedPlayers.length];
              const focusObs = observePlayerLight(
                actObsRng,
                focusedPlayer,
                currentScout,
                "youthTournament",
                playerEvidence(focusedPlayer.id),
                extraAttrsPerSession,
              );
              focusObs.week = stateWithScheduleApplied.currentWeek;
              focusObs.season = stateWithScheduleApplied.currentSeason;
              recordObservation(focusObs);
              observedPlayerIds.add(focusedPlayer.id);
              weekObservationsGenerated++;
            }
          }
        }
      }

      // --- Training Visit: base 1-2, modified by quality ---
      if (weekResult.trainingVisitsExecuted > 0) {
        const qr = qualityMap.get("trainingVisit");
        const discMod = (qr?.discoveryModifier ?? 0) + choiceDiscoveryMod("trainingVisit");
        const [rangeMin, rangeMax] = adjustedRange(1, 2, discMod);
        const clubId = currentScout.currentClubId;
        const candidatePool = clubId
          ? allPlayers.filter((p) => p.clubId === clubId)
          : allPlayers;
        const pool = candidatePool.length > 0 ? [...candidatePool] : [...allPlayers];
        const prioritizedPlayers = prioritizeFocusedPlayers(
          actObsRng.shuffle(pool),
          "trainingVisit",
        );
        const count = Math.min(prioritizedPlayers.length, actObsRng.nextInt(rangeMin, rangeMax));
        const tierLabel = qr ? TIER_LABELS[qr.tier] ?? qr.tier : "";

        for (let i = 0; i < count; i++) {
          const player = prioritizedPlayers[i];

          const obs = observePlayerLight(actObsRng, player, currentScout, "trainingGround", playerEvidence(player.id), extraAttrsPerSession);
          obs.week = stateWithScheduleApplied.currentWeek;
          obs.season = stateWithScheduleApplied.currentSeason;
          recordObservation(obs);
          observedPlayerIds.add(player.id);
          weekObservationsGenerated++;

          const alreadyDiscovered = actDiscoveries.some((r) => r.playerId === player.id);
          if (!alreadyDiscovered) {
            actDiscoveries = [...actDiscoveries, recordDiscovery(player, currentScout, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason)];
            weekPlayersDiscovered++;
          }

          const topAttrs = obs.attributeReadings
            .sort((a, b) => b.perceivedValue - a.perceivedValue)
            .slice(0, 3)
            .map((r) => `${r.attribute} ${r.perceivedValue}`)
            .join(", ");
          const club = player.clubId ? stateWithScheduleApplied.clubs[player.clubId] : undefined;
          const narrativePrefix = qr && i === 0 ? `${qr.narrative}\n\n` : "";
          actObsMessages.push({
            id: `obs-training-${player.id}-w${stateWithScheduleApplied.currentWeek}`,
            week: stateWithScheduleApplied.currentWeek,
            season: stateWithScheduleApplied.currentSeason,
            type: "feedback" as const,
            title: `Training Visit${tierLabel ? ` (${tierLabel})` : ""}: ${player.firstName} ${player.lastName}`,
            body: `${narrativePrefix}You observed ${player.firstName} ${player.lastName} (age ${player.age}, ${player.position}) from ${club?.name ?? "Unknown"} during training. ${obs.attributeReadings.length} attributes assessed with high accuracy. Notable: ${topAttrs}.`,
            read: false,
            actionRequired: false,
            relatedId: player.id,
            relatedEntityType: "player" as const,
          });
        }

        const focusTargetIds = focusPlayers("trainingVisit");
        const focusRepeats = focusDepth("trainingVisit");
        if (focusTargetIds.length > 0 && focusRepeats > 0) {
          const focusedPlayers = focusTargetIds
            .map((id) => prioritizedPlayers.find((p) => p.id === id) ?? stateWithScheduleApplied.players[id])
            .filter((p): p is Player => !!p);

          for (let repeat = 0; repeat < focusRepeats && focusedPlayers.length > 0; repeat++) {
            const focusedPlayer = focusedPlayers[repeat % focusedPlayers.length];
            const focusObs = observePlayerLight(
              actObsRng,
              focusedPlayer,
              currentScout,
              "trainingGround",
              playerEvidence(focusedPlayer.id),
              extraAttrsPerSession,
            );
            focusObs.week = stateWithScheduleApplied.currentWeek;
            focusObs.season = stateWithScheduleApplied.currentSeason;
            recordObservation(focusObs);
            observedPlayerIds.add(focusedPlayer.id);
            weekObservationsGenerated++;
          }
        }
      }

      // --- Video Analysis: base 1-2, modified by quality ---
      if (weekResult.videoSessionsExecuted > 0) {
        // Equipment videoConfidence bonus: boost confidence on video-sourced observations
        const videoConfBoost = weekEquipBonuses?.videoConfidence ?? 0;
        const qr = qualityMap.get("watchVideo");
        const discMod = (qr?.discoveryModifier ?? 0) + choiceDiscoveryMod("watchVideo");
        const [rangeMin, rangeMax] = adjustedRange(1, 2, discMod);
        const tierLabel = qr ? TIER_LABELS[qr.tier] ?? qr.tier : "";
        const scheduledVideoActivities = getScheduledActivityInstances(stateWithScheduleApplied.schedule)
          .filter((entry) => entry.activity.type === "watchVideo")
          .map((entry) => entry.activity);

        if (currentScout.primarySpecialization === "youth") {
          // Youth scouts: each scheduled video choice maps to its own youth venue pool
          const venueMapping: Record<string, string> = {
            "video-academy": "academyTrialDay",
            "video-grassroots": "grassrootsTournament",
            "video-school": "schoolMatch",
          };
          let updatedUnsignedYouthVideo = { ...stateWithScheduleApplied.unsignedYouth };
          scheduledVideoActivities.forEach((videoActivity, videoIdx) => {
            const venueType = (venueMapping[videoActivity.targetId ?? ""] ?? "youthFestival") as
              "academyTrialDay" | "grassrootsTournament" | "schoolMatch" | "youthFestival";
            const venuePool = getYouthVenuePool(
              actObsRng,
              venueType,
              updatedUnsignedYouthVideo,
              currentScout,
              undefined,
              undefined,
              undefined,
              stateWithScheduleApplied.currentWeek,
              undefined,
              buildScoutQualityDataForState(
                stateWithScheduleApplied,
                effectiveScoutCountry,
              ),
            );
            const prioritizedPool = prioritizeFocusedYouth([...venuePool], "watchVideo");
            const count = Math.min(prioritizedPool.length, actObsRng.nextInt(rangeMin, rangeMax));

            for (let i = 0; i < count; i++) {
              const youth = prioritizedPool[i];
              const existingObsForYouth = playerEvidence(youth.player.id);
              const result = processVenueObservation(
                actObsRng, currentScout, youth, "videoAnalysis",
                existingObsForYouth, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason,
              );
              // Apply equipment videoConfidence boost
              if (videoConfBoost > 0) {
                result.observation.attributeReadings = result.observation.attributeReadings.map((r) => ({
                  ...r,
                  confidence: Math.min(1, r.confidence + videoConfBoost),
                }));
              }
              recordObservation(result.observation);
              weekObservationsGenerated++;
              const alreadyDiscovered = actDiscoveries.some((r) => r.playerId === youth.player.id);
              if (!alreadyDiscovered) {
                actDiscoveries = [...actDiscoveries, recordDiscovery(youth.player, currentScout, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason)];
                weekPlayersDiscovered++;
              }
              // Smaller visibility/buzz boost for video vs physical venue
              const updatedYouth = updatedUnsignedYouthVideo[youth.id];
              if (updatedYouth) {
                updatedUnsignedYouthVideo = {
                  ...updatedUnsignedYouthVideo,
                  [youth.id]: {
                    ...updatedYouth,
                    visibility: Math.min(100, updatedYouth.visibility + 2),
                    buzzLevel: Math.min(100, updatedYouth.buzzLevel + 2),
                    discoveredBy: updatedYouth.discoveredBy.includes(currentScout.id)
                      ? updatedYouth.discoveredBy
                      : [...updatedYouth.discoveredBy, currentScout.id],
                  },
                };
              }
              const topAttrs = result.observation.attributeReadings
                .sort((a, b) => b.perceivedValue - a.perceivedValue)
                .slice(0, 3)
                .map((r) => `${r.attribute} ${r.perceivedValue}`)
                .join(", ");
              const narrativePrefix = qr && videoIdx === 0 && i === 0 ? `${qr.narrative}\n\n` : "";
              actObsMessages.push({
                id: `obs-video-${youth.player.id}-w${stateWithScheduleApplied.currentWeek}-v${videoIdx}`,
                week: stateWithScheduleApplied.currentWeek,
                season: stateWithScheduleApplied.currentSeason,
                type: "feedback" as const,
                title: `Video Analysis${tierLabel ? ` (${tierLabel})` : ""}: ${youth.player.firstName} ${youth.player.lastName}`,
                body: `${narrativePrefix}You reviewed footage of ${youth.player.firstName} ${youth.player.lastName} (age ${youth.player.age}, ${youth.player.position}) from ${youth.country}. ${result.observation.attributeReadings.length} attributes assessed. Notable: ${topAttrs}.`,
                read: false,
                actionRequired: false,
                relatedId: youth.player.id,
                relatedEntityType: "player" as const,
              });
            }
          });

          const focusTargetIds = focusPlayers("watchVideo");
          const focusRepeats = focusDepth("watchVideo");
          if (focusTargetIds.length > 0 && focusRepeats > 0) {
            const focusedYouthList = focusTargetIds
              .map((id) => Object.values(updatedUnsignedYouthVideo).find((y) => y.player.id === id))
              .filter((y): y is UnsignedYouth => !!y);

            if (focusedYouthList.length > 0) {
              for (let repeat = 0; repeat < focusRepeats; repeat++) {
                const focusedYouth = focusedYouthList[repeat % focusedYouthList.length];
                const focusObsForYouth = playerEvidence(focusedYouth.player.id);
                const focusResult = processVenueObservation(
                  actObsRng,
                  currentScout,
                  focusedYouth,
                  "followUpSession",
                  focusObsForYouth,
                  stateWithScheduleApplied.currentWeek,
                  stateWithScheduleApplied.currentSeason,
                );
                recordObservation(focusResult.observation);
                weekObservationsGenerated++;
              }
            }
          }
          stateWithScheduleApplied = {
            ...stateWithScheduleApplied,
            unsignedYouth: updatedUnsignedYouthVideo,
          };
        } else {
          // Non-youth scouts: existing senior player video analysis
          const previouslyObserved = allPlayers.filter((p) => observedPlayerIds.has(p.id));
          const pool = previouslyObserved.length > 0 ? [...previouslyObserved] : [...allPlayers];
          const prioritizedPlayers = prioritizeFocusedPlayers(
            actObsRng.shuffle(pool),
            "watchVideo",
          );
          const count = Math.min(prioritizedPlayers.length, actObsRng.nextInt(rangeMin, rangeMax));

          for (let i = 0; i < count; i++) {
            const player = prioritizedPlayers[i];

            const obs = observePlayerLight(actObsRng, player, currentScout, "videoAnalysis", playerEvidence(player.id), extraAttrsPerSession);
            obs.week = stateWithScheduleApplied.currentWeek;
            obs.season = stateWithScheduleApplied.currentSeason;
            // Apply equipment videoConfidence boost
            if (videoConfBoost > 0) {
              obs.attributeReadings = obs.attributeReadings.map((r) => ({
                ...r,
                confidence: Math.min(1, r.confidence + videoConfBoost),
              }));
            }
            recordObservation(obs);
            observedPlayerIds.add(player.id);
            weekObservationsGenerated++;

            const topAttrs = obs.attributeReadings
              .sort((a, b) => b.perceivedValue - a.perceivedValue)
              .slice(0, 3)
              .map((r) => `${r.attribute} ${r.perceivedValue}`)
              .join(", ");
            const narrativePrefix = qr && i === 0 ? `${qr.narrative}\n\n` : "";
            actObsMessages.push({
              id: `obs-video-${player.id}-w${stateWithScheduleApplied.currentWeek}`,
              week: stateWithScheduleApplied.currentWeek,
              season: stateWithScheduleApplied.currentSeason,
              type: "feedback" as const,
              title: `Video Analysis${tierLabel ? ` (${tierLabel})` : ""}: ${player.firstName} ${player.lastName}`,
              body: `${narrativePrefix}You reviewed video footage of ${player.firstName} ${player.lastName} (${player.position}). ${obs.attributeReadings.length} attributes assessed. Notable: ${topAttrs}. This supplements your existing observations.`,
              read: false,
              actionRequired: false,
              relatedId: player.id,
              relatedEntityType: "player" as const,
            });
          }

          const focusTargetIds = focusPlayers("watchVideo");
          const focusRepeats = focusDepth("watchVideo");
          if (focusTargetIds.length > 0 && focusRepeats > 0) {
            const focusedPlayers = focusTargetIds
              .map((id) => prioritizedPlayers.find((p) => p.id === id) ?? stateWithScheduleApplied.players[id])
              .filter((p): p is Player => !!p);

            for (let repeat = 0; repeat < focusRepeats && focusedPlayers.length > 0; repeat++) {
              const focusedPlayer = focusedPlayers[repeat % focusedPlayers.length];
              const focusObs = observePlayerLight(
                actObsRng,
                focusedPlayer,
                currentScout,
                "videoAnalysis",
                playerEvidence(focusedPlayer.id),
                extraAttrsPerSession,
              );
              focusObs.week = stateWithScheduleApplied.currentWeek;
              focusObs.season = stateWithScheduleApplied.currentSeason;
              recordObservation(focusObs);
              observedPlayerIds.add(focusedPlayer.id);
              weekObservationsGenerated++;
            }
          }
        }
      }

      // --- Reserve Match: observe 2-4 fringe players from scout's own club ---
      if (weekResult.reserveMatchesExecuted > 0) {
        const qr = qualityMap.get("reserveMatch");
        const discMod = (qr?.discoveryModifier ?? 0) + choiceDiscoveryMod("reserveMatch");
        const [rangeMin, rangeMax] = adjustedRange(2, 4, discMod);
        const clubId = currentScout.currentClubId;
        const candidatePool = clubId
          ? allPlayers.filter((p) => p.clubId === clubId && !observedPlayerIds.has(p.id))
          : allPlayers.filter((p) => !observedPlayerIds.has(p.id));
        const pool = candidatePool.length > 0 ? [...candidatePool] : [...allPlayers.filter((p) => !observedPlayerIds.has(p.id))];
        const prioritizedPlayers = prioritizeFocusedPlayers(
          actObsRng.shuffle(pool),
          "reserveMatch",
        );
        const count = Math.min(prioritizedPlayers.length, actObsRng.nextInt(rangeMin, rangeMax));
        const tierLabel = qr ? TIER_LABELS[qr.tier] ?? qr.tier : "";

        for (let i = 0; i < count; i++) {
          const player = prioritizedPlayers[i];

          const obs = observePlayerLight(actObsRng, player, currentScout, "reserveMatch", playerEvidence(player.id), extraAttrsPerSession);
          obs.week = stateWithScheduleApplied.currentWeek;
          obs.season = stateWithScheduleApplied.currentSeason;
          recordObservation(obs);
          observedPlayerIds.add(player.id);
          weekObservationsGenerated++;

          const alreadyDiscovered = actDiscoveries.some((r) => r.playerId === player.id);
          if (!alreadyDiscovered) {
            actDiscoveries = [...actDiscoveries, recordDiscovery(player, currentScout, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason)];
            weekPlayersDiscovered++;
          }

          const topAttrs = obs.attributeReadings
            .sort((a, b) => b.perceivedValue - a.perceivedValue)
            .slice(0, 3)
            .map((r) => `${r.attribute} ${r.perceivedValue}`)
            .join(", ");
          const club = player.clubId ? stateWithScheduleApplied.clubs[player.clubId] : undefined;
          const narrativePrefix = qr && i === 0 ? `${qr.narrative}\n\n` : "";
          actObsMessages.push({
            id: `obs-reserve-${player.id}-w${stateWithScheduleApplied.currentWeek}`,
            week: stateWithScheduleApplied.currentWeek,
            season: stateWithScheduleApplied.currentSeason,
            type: "feedback" as const,
            title: `Reserve Match${tierLabel ? ` (${tierLabel})` : ""}: ${player.firstName} ${player.lastName}`,
            body: `${narrativePrefix}You observed ${player.firstName} ${player.lastName} (age ${player.age}, ${player.position}) from ${club?.name ?? "Unknown"} in a reserve fixture. ${obs.attributeReadings.length} attributes assessed. Notable: ${topAttrs}.`,
            read: false,
            actionRequired: false,
            relatedId: player.id,
            relatedEntityType: "player" as const,
          });
        }

        const focusTargetIds = focusPlayers("reserveMatch");
        const focusRepeats = focusDepth("reserveMatch");
        if (focusTargetIds.length > 0 && focusRepeats > 0) {
          const focusedPlayers = focusTargetIds
            .map((id) => prioritizedPlayers.find((p) => p.id === id) ?? stateWithScheduleApplied.players[id])
            .filter((p): p is Player => !!p);
          for (let repeat = 0; repeat < focusRepeats && focusedPlayers.length > 0; repeat++) {
            const focusedPlayer = focusedPlayers[repeat % focusedPlayers.length];
            const focusObs = observePlayerLight(
              actObsRng,
              focusedPlayer,
              currentScout,
              "reserveMatch",
              playerEvidence(focusedPlayer.id),
              extraAttrsPerSession,
            );
            focusObs.week = stateWithScheduleApplied.currentWeek;
            focusObs.season = stateWithScheduleApplied.currentSeason;
            recordObservation(focusObs);
            observedPlayerIds.add(focusedPlayer.id);
            weekObservationsGenerated++;
          }
        }
      }

      // --- Scouting Mission: observe 4-6 players across one league ---
      if (weekResult.scoutingMissionsExecuted > 0) {
        const qr = qualityMap.get("scoutingMission");
        const discMod = (qr?.discoveryModifier ?? 0) + choiceDiscoveryMod("scoutingMission");
        const [rangeMin, rangeMax] = adjustedRange(4, 6, discMod);
        // Pick players from a random league's clubs (prefer scout's territory)
        const leagueIds = Object.keys(stateWithScheduleApplied.leagues);
        const targetLeagueId = leagueIds.length > 0
          ? leagueIds[actObsRng.nextInt(0, leagueIds.length - 1)]
          : null;
        const targetLeague = targetLeagueId ? stateWithScheduleApplied.leagues[targetLeagueId] : null;
        const leagueClubIds = targetLeague ? new Set(targetLeague.clubIds) : new Set<string>();
        const pool = (targetLeague && leagueClubIds.size > 0
          ? allPlayers.filter((p) => leagueClubIds.has(p.clubId) && !observedPlayerIds.has(p.id))
          : allPlayers.filter((p) => !observedPlayerIds.has(p.id))
        ).slice();
        const prioritizedPlayers = prioritizeFocusedPlayers(
          actObsRng.shuffle(pool),
          "scoutingMission",
        );
        const count = Math.min(prioritizedPlayers.length, actObsRng.nextInt(rangeMin, rangeMax));
        const tierLabel = qr ? TIER_LABELS[qr.tier] ?? qr.tier : "";

        for (let i = 0; i < count; i++) {
          const player = prioritizedPlayers[i];

          const obs = observePlayerLight(actObsRng, player, currentScout, "liveMatch", playerEvidence(player.id), extraAttrsPerSession);
          obs.week = stateWithScheduleApplied.currentWeek;
          obs.season = stateWithScheduleApplied.currentSeason;
          recordObservation(obs);
          observedPlayerIds.add(player.id);
          weekObservationsGenerated++;

          const alreadyDiscovered = actDiscoveries.some((r) => r.playerId === player.id);
          if (!alreadyDiscovered) {
            actDiscoveries = [...actDiscoveries, recordDiscovery(player, currentScout, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason)];
            weekPlayersDiscovered++;
          }

          const topAttrs = obs.attributeReadings
            .sort((a, b) => b.perceivedValue - a.perceivedValue)
            .slice(0, 3)
            .map((r) => `${r.attribute} ${r.perceivedValue}`)
            .join(", ");
          const club = player.clubId ? stateWithScheduleApplied.clubs[player.clubId] : undefined;
          const narrativePrefix = qr && i === 0 ? `${qr.narrative}\n\n` : "";
          actObsMessages.push({
            id: `obs-mission-${player.id}-w${stateWithScheduleApplied.currentWeek}`,
            week: stateWithScheduleApplied.currentWeek,
            season: stateWithScheduleApplied.currentSeason,
            type: "feedback" as const,
            title: `Scouting Mission${tierLabel ? ` (${tierLabel})` : ""}: ${player.firstName} ${player.lastName}`,
            body: `${narrativePrefix}You spotted ${player.firstName} ${player.lastName} (age ${player.age}, ${player.position}) from ${club?.name ?? "Unknown"} during a scouting mission. ${obs.attributeReadings.length} attributes assessed. Notable: ${topAttrs}.`,
            read: false,
            actionRequired: false,
            relatedId: player.id,
            relatedEntityType: "player" as const,
          });
        }

        const focusTargetIds = focusPlayers("scoutingMission");
        const focusRepeats = focusDepth("scoutingMission");
        if (focusTargetIds.length > 0 && focusRepeats > 0) {
          const focusedPlayers = focusTargetIds
            .map((id) => prioritizedPlayers.find((p) => p.id === id) ?? stateWithScheduleApplied.players[id])
            .filter((p): p is Player => !!p);
          for (let repeat = 0; repeat < focusRepeats && focusedPlayers.length > 0; repeat++) {
            const focusedPlayer = focusedPlayers[repeat % focusedPlayers.length];
            const focusObs = observePlayerLight(
              actObsRng,
              focusedPlayer,
              currentScout,
              "liveMatch",
              playerEvidence(focusedPlayer.id),
              extraAttrsPerSession,
            );
            focusObs.week = stateWithScheduleApplied.currentWeek;
            focusObs.season = stateWithScheduleApplied.currentSeason;
            recordObservation(focusObs);
            observedPlayerIds.add(focusedPlayer.id);
            weekObservationsGenerated++;
          }
        }
      }

      // --- Opposition Analysis: observe 2-3 players from an opposing team ---
      if (weekResult.oppositionAnalysesExecuted > 0) {
        const qr = qualityMap.get("oppositionAnalysis");
        const discMod = (qr?.discoveryModifier ?? 0) + choiceDiscoveryMod("oppositionAnalysis");
        const [rangeMin, rangeMax] = adjustedRange(2, 3, discMod);
        // Pick a random opposing club (any club that is not the scout's own)
        const clubIds = Object.keys(stateWithScheduleApplied.clubs).filter(
          (id) => id !== currentScout.currentClubId,
        );
        const targetClubId = clubIds.length > 0
          ? clubIds[actObsRng.nextInt(0, clubIds.length - 1)]
          : null;
        const pool = (targetClubId
          ? allPlayers.filter((p) => p.clubId === targetClubId && !observedPlayerIds.has(p.id))
          : allPlayers.filter((p) => !observedPlayerIds.has(p.id))
        ).slice();
        const prioritizedPlayers = prioritizeFocusedPlayers(
          actObsRng.shuffle(pool),
          "oppositionAnalysis",
        );
        const count = Math.min(prioritizedPlayers.length, actObsRng.nextInt(rangeMin, rangeMax));
        const tierLabel = qr ? TIER_LABELS[qr.tier] ?? qr.tier : "";

        for (let i = 0; i < count; i++) {
          const player = prioritizedPlayers[i];

          const obs = observePlayerLight(actObsRng, player, currentScout, "oppositionAnalysis", playerEvidence(player.id), extraAttrsPerSession);
          obs.week = stateWithScheduleApplied.currentWeek;
          obs.season = stateWithScheduleApplied.currentSeason;
          recordObservation(obs);
          observedPlayerIds.add(player.id);
          weekObservationsGenerated++;

          const alreadyDiscovered = actDiscoveries.some((r) => r.playerId === player.id);
          if (!alreadyDiscovered) {
            actDiscoveries = [...actDiscoveries, recordDiscovery(player, currentScout, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason)];
            weekPlayersDiscovered++;
          }

          const topAttrs = obs.attributeReadings
            .sort((a, b) => b.perceivedValue - a.perceivedValue)
            .slice(0, 3)
            .map((r) => `${r.attribute} ${r.perceivedValue}`)
            .join(", ");
          const club = player.clubId ? stateWithScheduleApplied.clubs[player.clubId] : undefined;
          const narrativePrefix = qr && i === 0 ? `${qr.narrative}\n\n` : "";
          actObsMessages.push({
            id: `obs-opposition-${player.id}-w${stateWithScheduleApplied.currentWeek}`,
            week: stateWithScheduleApplied.currentWeek,
            season: stateWithScheduleApplied.currentSeason,
            type: "feedback" as const,
            title: `Opposition Analysis${tierLabel ? ` (${tierLabel})` : ""}: ${player.firstName} ${player.lastName}`,
            body: `${narrativePrefix}You analysed ${player.firstName} ${player.lastName} (age ${player.age}, ${player.position}) from ${club?.name ?? "Unknown"} ahead of a fixture. ${obs.attributeReadings.length} attributes assessed. Notable: ${topAttrs}.`,
            read: false,
            actionRequired: false,
            relatedId: player.id,
            relatedEntityType: "player" as const,
          });
        }

        const focusTargetIds = focusPlayers("oppositionAnalysis");
        const focusRepeats = focusDepth("oppositionAnalysis");
        if (focusTargetIds.length > 0 && focusRepeats > 0) {
          const focusedPlayers = focusTargetIds
            .map((id) => prioritizedPlayers.find((p) => p.id === id) ?? stateWithScheduleApplied.players[id])
            .filter((p): p is Player => !!p);
          for (let repeat = 0; repeat < focusRepeats && focusedPlayers.length > 0; repeat++) {
            const focusedPlayer = focusedPlayers[repeat % focusedPlayers.length];
            const focusObs = observePlayerLight(
              actObsRng,
              focusedPlayer,
              currentScout,
              "oppositionAnalysis",
              playerEvidence(focusedPlayer.id),
              extraAttrsPerSession,
            );
            focusObs.week = stateWithScheduleApplied.currentWeek;
            focusObs.season = stateWithScheduleApplied.currentSeason;
            recordObservation(focusObs);
            observedPlayerIds.add(focusedPlayer.id);
            weekObservationsGenerated++;
          }
        }
      }

      // --- Agent Showcase: observe 2-3 players presented by agents ---
      if (weekResult.agentShowcasesExecuted > 0) {
        const qr = qualityMap.get("agentShowcase");
        const discMod = (qr?.discoveryModifier ?? 0) + choiceDiscoveryMod("agentShowcase");
        const [rangeMin, rangeMax] = adjustedRange(2, 3, discMod);
        const pool = allPlayers.filter((p) => !observedPlayerIds.has(p.id)).slice();
        const prioritizedPlayers = prioritizeFocusedPlayers(
          actObsRng.shuffle(pool),
          "agentShowcase",
        );
        const count = Math.min(prioritizedPlayers.length, actObsRng.nextInt(rangeMin, rangeMax));
        const tierLabel = qr ? TIER_LABELS[qr.tier] ?? qr.tier : "";

        for (let i = 0; i < count; i++) {
          const player = prioritizedPlayers[i];

          const obs = observePlayerLight(actObsRng, player, currentScout, "agentShowcase", playerEvidence(player.id), extraAttrsPerSession);
          obs.week = stateWithScheduleApplied.currentWeek;
          obs.season = stateWithScheduleApplied.currentSeason;
          recordObservation(obs);
          observedPlayerIds.add(player.id);
          weekObservationsGenerated++;

          const alreadyDiscovered = actDiscoveries.some((r) => r.playerId === player.id);
          if (!alreadyDiscovered) {
            actDiscoveries = [...actDiscoveries, recordDiscovery(player, currentScout, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason)];
            weekPlayersDiscovered++;
          }

          const topAttrs = obs.attributeReadings
            .sort((a, b) => b.perceivedValue - a.perceivedValue)
            .slice(0, 3)
            .map((r) => `${r.attribute} ${r.perceivedValue}`)
            .join(", ");
          const club = player.clubId ? stateWithScheduleApplied.clubs[player.clubId] : undefined;
          const narrativePrefix = qr && i === 0 ? `${qr.narrative}\n\n` : "";
          actObsMessages.push({
            id: `obs-showcase-${player.id}-w${stateWithScheduleApplied.currentWeek}`,
            week: stateWithScheduleApplied.currentWeek,
            season: stateWithScheduleApplied.currentSeason,
            type: "feedback" as const,
            title: `Agent Showcase${tierLabel ? ` (${tierLabel})` : ""}: ${player.firstName} ${player.lastName}`,
            body: `${narrativePrefix}An agent presented ${player.firstName} ${player.lastName} (age ${player.age}, ${player.position}) from ${club?.name ?? "Unknown"} to you directly. ${obs.attributeReadings.length} attributes assessed. Notable: ${topAttrs}.`,
            read: false,
            actionRequired: false,
            relatedId: player.id,
            relatedEntityType: "player" as const,
          });
        }

        const focusTargetIds = focusPlayers("agentShowcase");
        const focusRepeats = focusDepth("agentShowcase");
        if (focusTargetIds.length > 0 && focusRepeats > 0) {
          const focusedPlayers = focusTargetIds
            .map((id) => prioritizedPlayers.find((p) => p.id === id) ?? stateWithScheduleApplied.players[id])
            .filter((p): p is Player => !!p);
          for (let repeat = 0; repeat < focusRepeats && focusedPlayers.length > 0; repeat++) {
            const focusedPlayer = focusedPlayers[repeat % focusedPlayers.length];
            const focusObs = observePlayerLight(
              actObsRng,
              focusedPlayer,
              currentScout,
              "agentShowcase",
              playerEvidence(focusedPlayer.id),
              extraAttrsPerSession,
            );
            focusObs.week = stateWithScheduleApplied.currentWeek;
            focusObs.season = stateWithScheduleApplied.currentSeason;
            recordObservation(focusObs);
            observedPlayerIds.add(focusedPlayer.id);
            weekObservationsGenerated++;
          }
        }
      }

      // --- Trial Match: observe 1-2 players in a controlled trial ---
      if (weekResult.trialMatchesExecuted > 0) {
        const qr = qualityMap.get("trialMatch");
        const discMod = (qr?.discoveryModifier ?? 0) + choiceDiscoveryMod("trialMatch");
        const [rangeMin, rangeMax] = adjustedRange(1, 2, discMod);
        const pool = allPlayers.filter((p) => !observedPlayerIds.has(p.id)).slice();
        const prioritizedPlayers = prioritizeFocusedPlayers(
          actObsRng.shuffle(pool),
          "trialMatch",
        );
        const count = Math.min(prioritizedPlayers.length, actObsRng.nextInt(rangeMin, rangeMax));
        const tierLabel = qr ? TIER_LABELS[qr.tier] ?? qr.tier : "";

        for (let i = 0; i < count; i++) {
          const player = prioritizedPlayers[i];

          const obs = observePlayerLight(actObsRng, player, currentScout, "trialMatch", playerEvidence(player.id), extraAttrsPerSession);
          obs.week = stateWithScheduleApplied.currentWeek;
          obs.season = stateWithScheduleApplied.currentSeason;
          recordObservation(obs);
          observedPlayerIds.add(player.id);
          weekObservationsGenerated++;

          const alreadyDiscovered = actDiscoveries.some((r) => r.playerId === player.id);
          if (!alreadyDiscovered) {
            actDiscoveries = [...actDiscoveries, recordDiscovery(player, currentScout, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason)];
            weekPlayersDiscovered++;
          }

          // Resolve trial outcome for any pending trial responses
          if (currentScout.currentClubId) {
            const trialRng = createRNG(
              `${gameState.seed}-trial-${player.id}-w${stateWithScheduleApplied.currentWeek}-s${stateWithScheduleApplied.currentSeason}`,
            );
            const trialClub = stateWithScheduleApplied.clubs[currentScout.currentClubId];
            if (trialClub) {
              const trialOutcome = processTrialOutcome(
                trialRng,
                player,
                trialClub,
                stateWithScheduleApplied.players,
              );
              // Update any pending trial ClubResponse with the resolved outcome
              const updatedClubResponses = stateWithScheduleApplied.clubResponses.map((resp) =>
                resp.response === "trial" && !resp.directiveId
                  ? { ...resp, response: trialOutcome }
                  : resp,
              );
              stateWithScheduleApplied = {
                ...stateWithScheduleApplied,
                clubResponses: updatedClubResponses,
              };
            }
          }

          const topAttrs = obs.attributeReadings
            .sort((a, b) => b.perceivedValue - a.perceivedValue)
            .slice(0, 3)
            .map((r) => `${r.attribute} ${r.perceivedValue}`)
            .join(", ");
          const club = player.clubId ? stateWithScheduleApplied.clubs[player.clubId] : undefined;
          const narrativePrefix = qr && i === 0 ? `${qr.narrative}\n\n` : "";
          actObsMessages.push({
            id: `obs-trial-${player.id}-w${stateWithScheduleApplied.currentWeek}`,
            week: stateWithScheduleApplied.currentWeek,
            season: stateWithScheduleApplied.currentSeason,
            type: "feedback" as const,
            title: `Trial Match${tierLabel ? ` (${tierLabel})` : ""}: ${player.firstName} ${player.lastName}`,
            body: `${narrativePrefix}${player.firstName} ${player.lastName} (age ${player.age}, ${player.position}) from ${club?.name ?? "Unknown"} participated in a trial match. Closely assessed under controlled conditions. ${obs.attributeReadings.length} attributes recorded. Notable: ${topAttrs}.`,
            read: false,
            actionRequired: false,
            relatedId: player.id,
            relatedEntityType: "player" as const,
          });
        }

        const focusTargetIds = focusPlayers("trialMatch");
        const focusRepeats = focusDepth("trialMatch");
        if (focusTargetIds.length > 0 && focusRepeats > 0) {
          const focusedPlayers = focusTargetIds
            .map((id) => prioritizedPlayers.find((p) => p.id === id) ?? stateWithScheduleApplied.players[id])
            .filter((p): p is Player => !!p);
          for (let repeat = 0; repeat < focusRepeats && focusedPlayers.length > 0; repeat++) {
            const focusedPlayer = focusedPlayers[repeat % focusedPlayers.length];
            const focusObs = observePlayerLight(
              actObsRng,
              focusedPlayer,
              currentScout,
              "trialMatch",
              playerEvidence(focusedPlayer.id),
              extraAttrsPerSession,
            );
            focusObs.week = stateWithScheduleApplied.currentWeek;
            focusObs.season = stateWithScheduleApplied.currentSeason;
            recordObservation(focusObs);
            observedPlayerIds.add(focusedPlayer.id);
            weekObservationsGenerated++;
          }
        }
      }

      // --- Contract Negotiations: no observations — just XP and inbox message ---
      if (weekResult.contractNegotiationsExecuted > 0) {
        const relationshipDelta = choiceRelationshipMod("contractNegotiation");
        const qualityDelta = choiceReportQualityMod("contractNegotiation");
        actObsMessages.push({
          id: `obs-negotiation-w${stateWithScheduleApplied.currentWeek}-s${stateWithScheduleApplied.currentSeason}`,
          week: stateWithScheduleApplied.currentWeek,
          season: stateWithScheduleApplied.currentSeason,
          type: "feedback" as const,
          title: "Contract Negotiation Assistance",
          body: `You assisted the club's negotiation team this week. Your insight into the player's strengths and market value helped structure the offer. XP gained in persuasion and network skills.${relationshipDelta !== 0 ? ` Relationship leverage ${relationshipDelta > 0 ? "+" : ""}${relationshipDelta}.` : ""}${qualityDelta !== 0 ? ` Deal quality signal ${qualityDelta > 0 ? "+" : ""}${qualityDelta}.` : ""}`,
          read: false,
          actionRequired: false,
        });
      }

      // --- Database Query: generate statistical profiles for league players ---
      if (weekResult.databaseQueriesExecuted > 0) {
        // Equipment dataAccuracy bonus: extra profiles discovered per query
        const dbDataAccBonus = weekEquipBonuses?.dataAccuracy ?? 0;
        const dbRng = createRNG(
          `${gameState.seed}-dbquery-${gameState.currentWeek}-${gameState.currentSeason}`,
        );
        let queryProfileMod = choiceProfileMod("databaseQuery") + (dbDataAccBonus > 0 ? Math.round(dbDataAccBonus * 5) : 0);
        const queryAnomalyMod = choiceAnomalyMod("databaseQuery");
        const leagueIds = Object.keys(stateWithScheduleApplied.leagues);
        if (leagueIds.length > 0) {
          const targetLeagueId = dbRng.pickWeighted(
            leagueIds.map((leagueId) => ({
              item: leagueId,
              weight: deriveRegionalPresence(
                stateWithScheduleApplied,
                stateWithScheduleApplied.leagues[leagueId]?.country ?? "",
              ).effects.opportunityMultiplier || 0.25,
            })),
          );
          const targetLeague = stateWithScheduleApplied.leagues[targetLeagueId];
          if (targetLeague) {
            const dataPresence = deriveRegionalPresence(
              stateWithScheduleApplied,
              targetLeague.country,
            );
            queryProfileMod += Math.round(dataPresence.effects.dataConfidenceBonus * 10);
            const queryResult = executeDatabaseQuery(
              dbRng,
              currentScout,
              targetLeague,
              stateWithScheduleApplied.players,
              {},
              stateWithScheduleApplied.currentSeason,
              stateWithScheduleApplied.currentWeek,
            );
            let effectiveProfiles = [...queryResult.profiles];
            let effectivePlayerIds = [...queryResult.playerIds];
            const selectedSet = new Set(effectivePlayerIds);

            if (queryProfileMod > 0) {
              const leagueClubIds = new Set(targetLeague.clubIds);
              const extraCandidates = Object.values(stateWithScheduleApplied.players).filter(
                (p) => leagueClubIds.has(p.clubId) && !selectedSet.has(p.id),
              );
              const extraCount = Math.min(queryProfileMod, extraCandidates.length);
              const extraPlayers = dbRng.shuffle(extraCandidates).slice(0, extraCount);
              for (const player of extraPlayers) {
                const extraProfile = executeDeepVideoAnalysis(
                  dbRng,
                  currentScout,
                  player,
                  stateWithScheduleApplied.currentSeason,
                  stateWithScheduleApplied.currentWeek,
                  stateWithScheduleApplied.statisticalProfiles[player.id],
                );
                effectiveProfiles.push(extraProfile);
                effectivePlayerIds.push(player.id);
                selectedSet.add(player.id);
              }
            } else if (queryProfileMod < 0 && effectiveProfiles.length > 0) {
              const keepCount = Math.max(1, effectiveProfiles.length + queryProfileMod);
              const trimmedProfiles = dbRng.shuffle(effectiveProfiles).slice(0, keepCount);
              const keepIds = new Set(trimmedProfiles.map((p) => p.playerId));
              effectiveProfiles = trimmedProfiles;
              effectivePlayerIds = effectivePlayerIds.filter((id) => keepIds.has(id));
            }

            const updatedProfiles = { ...stateWithScheduleApplied.statisticalProfiles };
            for (const profile of effectiveProfiles) {
              updatedProfiles[profile.playerId] = {
                ...profile,
                evidenceContext: {
                  countryId: dataPresence.countryId,
                  confidence: Math.min(
                    1,
                    0.5 + dataPresence.effects.dataConfidenceBonus + dbDataAccBonus,
                  ),
                  accessTier: dataPresence.accessTier,
                  explanation: dataPresence.summary,
                },
              };
            }

            let nextAnomalyFlags = stateWithScheduleApplied.anomalyFlags;
            if (queryAnomalyMod > 0 && effectivePlayerIds.length > 0) {
              const anomalyCandidates = dbRng.shuffle(effectivePlayerIds).slice(
                0,
                Math.min(queryAnomalyMod, effectivePlayerIds.length),
              );
              const generated: AnomalyFlag[] = anomalyCandidates.map((playerId, idx) => {
                const player = stateWithScheduleApplied.players[playerId];
                return {
                  id: `query-anomaly-${playerId}-w${stateWithScheduleApplied.currentWeek}-i${idx}`,
                  playerId,
                  stat: "goals",
                  direction: dbRng.nextFloat(0, 1) > 0.5 ? "positive" : "negative",
                  severity: +(dbRng.nextFloat(0, 1) * 1.5 + 0.5).toFixed(1),
                  description: `${player?.firstName ?? "Player"} ${player?.lastName ?? ""} triggered a query-side anomaly check due to outlier metric combinations.`,
                  investigated: false,
                  week: stateWithScheduleApplied.currentWeek,
                  season: stateWithScheduleApplied.currentSeason,
                };
              });
              nextAnomalyFlags = [...stateWithScheduleApplied.anomalyFlags, ...generated];
            }

            stateWithScheduleApplied = {
              ...stateWithScheduleApplied,
              statisticalProfiles: updatedProfiles,
              anomalyFlags: nextAnomalyFlags,
            };
            const playerNames = effectivePlayerIds
              .slice(0, 5)
              .map((id) => {
                const p = stateWithScheduleApplied.players[id];
                return p ? `${p.firstName} ${p.lastName}` : id;
              })
              .join(", ");
            actObsMessages.push({
              id: `obs-dbquery-w${stateWithScheduleApplied.currentWeek}-s${stateWithScheduleApplied.currentSeason}`,
              week: stateWithScheduleApplied.currentWeek,
              season: stateWithScheduleApplied.currentSeason,
              type: "feedback" as const,
              title: `Database Query: ${targetLeague.name}`,
              body: `Your database query returned ${effectivePlayerIds.length} player${effectivePlayerIds.length !== 1 ? "s" : ""} in ${targetLeague.name}. Statistical profiles generated. Key finds: ${playerNames || "none"}.${queryAnomalyMod > 0 ? ` Additional anomaly flags: +${Math.min(queryAnomalyMod, effectivePlayerIds.length)}.` : ""}`,
              read: false,
              actionRequired: false,
            });
          }
        }
      }

      // --- Deep Video Analysis: enhanced statistical profile + observation ---
      if (weekResult.deepVideoAnalysesExecuted > 0) {
        // Equipment videoConfidence + dataAccuracy bonuses for deep video analysis
        const deepVideoConfBoost = weekEquipBonuses?.videoConfidence ?? 0;
        const deepDataAccBoost = weekEquipBonuses?.dataAccuracy ?? 0;
        const deepVideoRng = createRNG(
          `${gameState.seed}-deepvideo-${gameState.currentWeek}-${gameState.currentSeason}`,
        );
        const deepProfileMod = choiceProfileMod("deepVideoAnalysis");
        const previouslyObserved = allPlayers.filter((p) => observedPlayerIds.has(p.id));
        const pool = previouslyObserved.length > 0 ? [...previouslyObserved] : [...allPlayers];
        const prioritizedPlayers = prioritizeFocusedPlayers(
          deepVideoRng.shuffle(pool),
          "deepVideoAnalysis",
        );
        if (prioritizedPlayers.length > 0) {
          const analysisCount = Math.max(
            1,
            Math.min(prioritizedPlayers.length, 1 + deepProfileMod),
          );
          const updatedProfiles = { ...stateWithScheduleApplied.statisticalProfiles };
          for (let i = 0; i < analysisCount; i++) {
            const player = prioritizedPlayers[i];
            const existingProfile = updatedProfiles[player.id];
            const deepProfile = executeDeepVideoAnalysis(
              deepVideoRng,
              currentScout,
              player,
              stateWithScheduleApplied.currentSeason,
              stateWithScheduleApplied.currentWeek,
              existingProfile,
            );
            const playerCountry = getPlayerScoutingCountry(
              stateWithScheduleApplied,
              player,
            );
            const dataPresence = playerCountry
              ? deriveRegionalPresence(stateWithScheduleApplied, playerCountry)
              : undefined;
            updatedProfiles[player.id] = dataPresence
              ? {
                  ...deepProfile,
                  evidenceContext: {
                    countryId: dataPresence.countryId,
                    confidence: Math.min(
                      1,
                      0.55 + dataPresence.effects.dataConfidenceBonus + deepDataAccBoost,
                    ),
                    accessTier: dataPresence.accessTier,
                    explanation: dataPresence.summary,
                  },
                }
              : deepProfile;

            const obs = observePlayerLight(
              deepVideoRng,
              player,
              currentScout,
              "videoAnalysis",
              playerEvidence(player.id),
              extraAttrsPerSession,
            );
            obs.week = stateWithScheduleApplied.currentWeek;
            obs.season = stateWithScheduleApplied.currentSeason;
            // Apply equipment videoConfidence + dataAccuracy boost for deep video
            if (deepVideoConfBoost > 0 || deepDataAccBoost > 0) {
              obs.attributeReadings = obs.attributeReadings.map((r) => ({
                ...r,
                confidence: Math.min(1, r.confidence + deepVideoConfBoost + deepDataAccBoost),
              }));
            }
            recordObservation(obs);
            observedPlayerIds.add(player.id);
            weekObservationsGenerated++;

            const topAttrs = obs.attributeReadings
              .sort((a, b) => b.perceivedValue - a.perceivedValue)
              .slice(0, 3)
              .map((r) => `${r.attribute} ${r.perceivedValue}`)
              .join(", ");
            actObsMessages.push({
              id: `obs-deepvideo-${player.id}-w${stateWithScheduleApplied.currentWeek}-i${i}`,
              week: stateWithScheduleApplied.currentWeek,
              season: stateWithScheduleApplied.currentSeason,
              type: "feedback" as const,
              title: `Deep Video Analysis: ${player.firstName} ${player.lastName}`,
              body: `You conducted an intensive video analysis session on ${player.firstName} ${player.lastName} (${player.position}). Statistical profile ${existingProfile ? "refined" : "created"}. ${obs.attributeReadings.length} attributes assessed. Notable: ${topAttrs}.`,
              read: false,
              actionRequired: false,
              relatedId: player.id,
              relatedEntityType: "player" as const,
            });
          }

          stateWithScheduleApplied = {
            ...stateWithScheduleApplied,
            statisticalProfiles: updatedProfiles,
          };
        }
      }

      // --- Stats Briefing: generate anomaly flags and highlights ---
      if (weekResult.statsBriefingsExecuted > 0) {
        // Equipment dataAccuracy bonus: extra anomalies found during briefing
        const briefingDataAccBonus = weekEquipBonuses?.dataAccuracy ?? 0;
        const briefingRng = createRNG(
          `${gameState.seed}-briefing-${gameState.currentWeek}-${gameState.currentSeason}`,
        );
        const anomalyMod = choiceAnomalyMod("statsBriefing") + (briefingDataAccBonus > 0 ? Math.round(briefingDataAccBonus * 3) : 0);
        const leagueIds = Object.keys(stateWithScheduleApplied.leagues);
        if (leagueIds.length > 0) {
          const targetLeagueId = leagueIds[briefingRng.nextInt(0, leagueIds.length - 1)];
          const targetLeague = stateWithScheduleApplied.leagues[targetLeagueId];
          if (targetLeague) {
            const briefing = generateStatsBriefing(
              briefingRng,
              currentScout,
              targetLeague,
              stateWithScheduleApplied.players,
              stateWithScheduleApplied.currentSeason,
              stateWithScheduleApplied.currentWeek,
            );
            let briefingAnomalies = [...briefing.anomalies];
            if (anomalyMod < 0) {
              const keepCount = Math.max(0, briefingAnomalies.length + anomalyMod);
              briefingAnomalies = briefingAnomalies.slice(0, keepCount);
            } else if (anomalyMod > 0) {
              const extraCandidates = briefing.topPerformers.filter(
                (playerId) => !briefingAnomalies.some((a) => a.playerId === playerId),
              );
              const extraCount = Math.min(anomalyMod, extraCandidates.length);
              for (let i = 0; i < extraCount; i++) {
                const playerId = extraCandidates[i];
                const player = stateWithScheduleApplied.players[playerId];
                briefingAnomalies.push({
                  id: `briefing-extra-${playerId}-w${stateWithScheduleApplied.currentWeek}-i${i}`,
                  playerId,
                  stat: "goals",
                  direction: briefingRng.nextFloat(0, 1) > 0.5 ? "positive" : "negative",
                  severity: +(briefingRng.nextFloat(0, 1) * 1.2 + 0.4).toFixed(1),
                  description: `${player?.firstName ?? "Player"} ${player?.lastName ?? ""} was flagged during focused anomaly review.`,
                  investigated: false,
                  week: stateWithScheduleApplied.currentWeek,
                  season: stateWithScheduleApplied.currentSeason,
                });
              }
            }
            const updatedAnomalyFlags = [
              ...stateWithScheduleApplied.anomalyFlags,
              ...briefingAnomalies,
            ];
            stateWithScheduleApplied = {
              ...stateWithScheduleApplied,
              anomalyFlags: updatedAnomalyFlags,
            };
            actObsMessages.push({
              id: `obs-briefing-w${stateWithScheduleApplied.currentWeek}-s${stateWithScheduleApplied.currentSeason}`,
              week: stateWithScheduleApplied.currentWeek,
              season: stateWithScheduleApplied.currentSeason,
              type: "feedback" as const,
              title: `Stats Briefing: ${targetLeague.name}`,
              body: `${briefing.highlights.join("\n")}\n\nAnomalies flagged this cycle: ${briefingAnomalies.length}.`,
              read: false,
              actionRequired: false,
            });
          }
        }
      }

      // --- Data Conference: networking + optional profile breakthroughs ---
      if (weekResult.dataConferencesExecuted > 0) {
        const conferenceRng = createRNG(
          `${gameState.seed}-conference-${gameState.currentWeek}-${gameState.currentSeason}`,
        );
        const conferenceRelMod = choiceRelationshipMod("dataConference");
        const conferenceProfileMod = choiceProfileMod("dataConference");
        const conferenceQualityMod = choiceReportQualityMod("dataConference");

        let conferenceProfilesAdded = 0;
        if (conferenceProfileMod > 0) {
          const profileCandidates = conferenceRng.shuffle(
            allPlayers.filter((p) => !stateWithScheduleApplied.statisticalProfiles[p.id]),
          );
          const selected = profileCandidates.slice(
            0,
            Math.min(conferenceProfileMod, profileCandidates.length),
          );
          if (selected.length > 0) {
            const updatedProfiles = { ...stateWithScheduleApplied.statisticalProfiles };
            for (const player of selected) {
              updatedProfiles[player.id] = executeDeepVideoAnalysis(
                conferenceRng,
                currentScout,
                player,
                stateWithScheduleApplied.currentSeason,
                stateWithScheduleApplied.currentWeek,
                updatedProfiles[player.id],
              );
            }
            conferenceProfilesAdded = selected.length;
            stateWithScheduleApplied = {
              ...stateWithScheduleApplied,
              statisticalProfiles: updatedProfiles,
            };
          }
        }

        if (conferenceRelMod !== 0 && stateWithScheduleApplied.dataAnalysts.length > 0) {
          const adjustedAnalysts = stateWithScheduleApplied.dataAnalysts.map((analyst) => ({
            ...analyst,
            morale: Math.max(0, Math.min(100, analyst.morale + conferenceRelMod * 2)),
          }));
          stateWithScheduleApplied = {
            ...stateWithScheduleApplied,
            dataAnalysts: adjustedAnalysts,
          };
        }

        actObsMessages.push({
          id: `obs-conference-w${stateWithScheduleApplied.currentWeek}-s${stateWithScheduleApplied.currentSeason}`,
          week: stateWithScheduleApplied.currentWeek,
          season: stateWithScheduleApplied.currentSeason,
          type: "feedback" as const,
          title: "Data Conference Attended",
          body: `You attended a data analytics conference this week. Networking with analysts and data scientists from across football expanded your professional network and sharpened your statistical toolkit.${conferenceProfilesAdded > 0 ? ` Fresh contacts opened ${conferenceProfilesAdded} new profile lead${conferenceProfilesAdded !== 1 ? "s" : ""}.` : ""}${conferenceQualityMod !== 0 ? ` Method quality signal ${conferenceQualityMod > 0 ? "+" : ""}${conferenceQualityMod}.` : ""}`,
          read: false,
          actionRequired: false,
        });
      }

      // --- Algorithm Calibration: improve accuracy of statistical profiles ---
      if (weekResult.algorithmCalibrationsExecuted > 0) {
        // Equipment anomalyDetectionRate bonus: extra anomalies from calibration
        const calibAnomalyBonus = weekEquipBonuses?.anomalyDetectionRate ?? 0;
        const calibrationRng = createRNG(
          `${gameState.seed}-calibration-${gameState.currentWeek}-${gameState.currentSeason}`,
        );
        const calibrationProfileMod = choiceProfileMod("algorithmCalibration");
        const calibrationAnomalyMod = choiceAnomalyMod("algorithmCalibration") + (calibAnomalyBonus > 0 ? Math.round(calibAnomalyBonus * 3) : 0);
        // Reduce noise in existing profiles by re-running deep analysis on a sample
        const profiledPlayerIds = Object.keys(stateWithScheduleApplied.statisticalProfiles);
        const targetCalibrations = Math.max(1, 3 + calibrationProfileMod);
        const calibrated = Math.min(targetCalibrations, profiledPlayerIds.length);
        const sampleIds = calibrationRng.shuffle(profiledPlayerIds).slice(0, calibrated);
        const updatedProfiles = { ...stateWithScheduleApplied.statisticalProfiles };
        for (const playerId of sampleIds) {
          const player = stateWithScheduleApplied.players[playerId];
          const existingProfile = updatedProfiles[playerId];
          if (player && existingProfile) {
            updatedProfiles[playerId] = executeDeepVideoAnalysis(
              calibrationRng,
              currentScout,
              player,
              stateWithScheduleApplied.currentSeason,
              stateWithScheduleApplied.currentWeek,
              existingProfile,
            );
          }
        }

        let updatedAnomalyFlags = [...stateWithScheduleApplied.anomalyFlags];
        if (calibrationAnomalyMod > 0 && sampleIds.length > 0) {
          const anomalySample = calibrationRng.shuffle(sampleIds).slice(
            0,
            Math.min(calibrationAnomalyMod, sampleIds.length),
          );
          const generatedCalibrationFlags: AnomalyFlag[] = anomalySample.map((playerId, idx) => {
            const player = stateWithScheduleApplied.players[playerId];
            return {
              id: `calibration-anomaly-${playerId}-w${stateWithScheduleApplied.currentWeek}-i${idx}`,
              playerId,
              stat: "passCompletion",
              direction: calibrationRng.nextFloat(0, 1) > 0.5 ? "positive" : "negative",
              severity: +(calibrationRng.nextFloat(0, 1) * 1.3 + 0.5).toFixed(1),
              description: `${player?.firstName ?? "Player"} ${player?.lastName ?? ""} surfaced during model recalibration as a statistical outlier.`,
              investigated: false,
              week: stateWithScheduleApplied.currentWeek,
              season: stateWithScheduleApplied.currentSeason,
            };
          });
          updatedAnomalyFlags = [...updatedAnomalyFlags, ...generatedCalibrationFlags];
        } else if (calibrationAnomalyMod < 0 && updatedAnomalyFlags.length > 0) {
          const toTrim = Math.min(Math.abs(calibrationAnomalyMod), updatedAnomalyFlags.length);
          updatedAnomalyFlags = updatedAnomalyFlags.slice(toTrim);
        }

        stateWithScheduleApplied = {
          ...stateWithScheduleApplied,
          statisticalProfiles: updatedProfiles,
          anomalyFlags: updatedAnomalyFlags,
        };
        actObsMessages.push({
          id: `obs-calibration-w${stateWithScheduleApplied.currentWeek}-s${stateWithScheduleApplied.currentSeason}`,
          week: stateWithScheduleApplied.currentWeek,
          season: stateWithScheduleApplied.currentSeason,
          type: "feedback" as const,
          title: "Algorithm Calibration Complete",
          body: `You recalibrated your statistical models this week. ${calibrated} player profile${calibrated !== 1 ? "s" : ""} refined with improved accuracy.${calibrationAnomalyMod > 0 ? ` Additional anomalies identified: +${Math.min(calibrationAnomalyMod, sampleIds.length)}.` : calibrationAnomalyMod < 0 ? ` Noise reduced: ${Math.min(Math.abs(calibrationAnomalyMod), stateWithScheduleApplied.anomalyFlags.length)} low-confidence flags cleared.` : ""}`,
          read: false,
          actionRequired: false,
        });
      }

      // --- Market Inefficiency Scan: identify undervalued players ---
      if (weekResult.marketInefficienciesExecuted > 0) {
        // Equipment anomalyDetectionRate + valuationAccuracy bonuses for market scans
        const marketAnomalyEquipBonus = weekEquipBonuses?.anomalyDetectionRate ?? 0;
        const marketValuationBonus = weekEquipBonuses?.valuationAccuracy ?? 0;
        const marketRng = createRNG(
          `${gameState.seed}-market-${gameState.currentWeek}-${gameState.currentSeason}`,
        );
        const marketProfileMod = choiceProfileMod("marketInefficiency") + (marketValuationBonus > 0 ? Math.round(marketValuationBonus * 5) : 0);
        const marketAnomalyMod = choiceAnomalyMod("marketInefficiency") + (marketAnomalyEquipBonus > 0 ? Math.round(marketAnomalyEquipBonus * 3) : 0);
        const marketQualityMod = choiceReportQualityMod("marketInefficiency");
        // Find players whose CA significantly exceeds their market value expectations
        const undervalued = allPlayers
          .filter((p) => {
            const caExpectedValue = p.currentAbility * 50000;
            return p.marketValue < caExpectedValue * 0.7;
          })
          .slice();
        const sampleSize = Math.min(
          Math.max(1, 5 + marketProfileMod),
          undervalued.length,
        );
        const baseFinds = marketRng.shuffle(undervalued).slice(0, sampleSize);
        const effectiveFinds = marketAnomalyMod < 0
          ? baseFinds.slice(0, Math.max(0, baseFinds.length + marketAnomalyMod))
          : baseFinds;
        let marketAnomaliesAdded = 0;
        if (marketAnomalyMod > 0 && effectiveFinds.length > 0) {
          const anomalyPlayers = marketRng.shuffle(effectiveFinds).slice(
            0,
            Math.min(marketAnomalyMod, effectiveFinds.length),
          );
          const generatedMarketFlags: AnomalyFlag[] = anomalyPlayers.map((player, idx) => ({
            id: `market-anomaly-${player.id}-w${stateWithScheduleApplied.currentWeek}-i${idx}`,
            playerId: player.id,
            stat: "goals",
            direction: marketRng.nextFloat(0, 1) > 0.5 ? "positive" : "negative",
            severity: +(marketRng.nextFloat(0, 1) * 1.4 + 0.6).toFixed(1),
            description: `${player.firstName} ${player.lastName} showed a valuation/performance mismatch in this market scan.`,
            investigated: false,
            week: stateWithScheduleApplied.currentWeek,
            season: stateWithScheduleApplied.currentSeason,
          }));
          marketAnomaliesAdded = generatedMarketFlags.length;
          stateWithScheduleApplied = {
            ...stateWithScheduleApplied,
            anomalyFlags: [...stateWithScheduleApplied.anomalyFlags, ...generatedMarketFlags],
          };
        }
        const findsText = effectiveFinds.length > 0
          ? effectiveFinds.map((p) => {
              const club = p.clubId ? stateWithScheduleApplied.clubs[p.clubId] : undefined;
              return `${p.firstName} ${p.lastName} (${p.position}, ${club?.name ?? "Unknown"})`;
            }).join("; ")
          : "No significant inefficiencies found this week.";
        actObsMessages.push({
          id: `obs-market-w${stateWithScheduleApplied.currentWeek}-s${stateWithScheduleApplied.currentSeason}`,
          week: stateWithScheduleApplied.currentWeek,
          season: stateWithScheduleApplied.currentSeason,
          type: "feedback" as const,
          title: "Market Inefficiency Scan",
          body: `Your scan identified ${effectiveFinds.length} potentially undervalued player${effectiveFinds.length !== 1 ? "s" : ""} this week.${marketAnomaliesAdded > 0 ? ` Added ${marketAnomaliesAdded} anomaly follow-up${marketAnomaliesAdded !== 1 ? "s" : ""}.` : ""}${marketQualityMod !== 0 ? ` Confidence ${marketQualityMod > 0 ? "up" : "down"} (${marketQualityMod > 0 ? "+" : ""}${marketQualityMod}).` : ""}\n\n${findsText}`,
          read: false,
          actionRequired: false,
        });
      }

      // --- Analytics Team Meeting: generate analyst reports and update morale ---
      if (weekResult.analyticsTeamMeetingsExecuted > 0) {
        const meetingRng = createRNG(
          `${gameState.seed}-analystmeeting-${gameState.currentWeek}-${gameState.currentSeason}`,
        );
        const meetingRelMod = choiceRelationshipMod("analyticsTeamMeeting");
        const meetingAnomalyMod = choiceAnomalyMod("analyticsTeamMeeting");
        const meetingProfileMod = choiceProfileMod("analyticsTeamMeeting");
        const meetingQualityMod = choiceReportQualityMod("analyticsTeamMeeting");
        const updatedAnalysts = [...stateWithScheduleApplied.dataAnalysts];
        const updatedAnalystReports = { ...stateWithScheduleApplied.analystReports };
        const profileCandidateIds = new Set<string>();

        for (let analystIdx = 0; analystIdx < updatedAnalysts.length; analystIdx++) {
          const analyst = updatedAnalysts[analystIdx];
          if (!analyst.assignedLeagueId) continue;
          const analystLeague = stateWithScheduleApplied.leagues[analyst.assignedLeagueId];
          if (!analystLeague) continue;

          const reportId = `analyst-report-${analyst.id}-w${stateWithScheduleApplied.currentWeek}-s${stateWithScheduleApplied.currentSeason}`;
          const boostedAnalyst = {
            ...analyst,
            morale: Math.max(
              0,
              Math.min(100, analyst.morale + meetingRelMod * 3 + meetingQualityMod * 2),
            ),
          };
          let report = generateAnalystReport(
            meetingRng,
            boostedAnalyst,
            analystLeague,
            stateWithScheduleApplied.players,
            stateWithScheduleApplied.currentSeason,
            stateWithScheduleApplied.currentWeek,
            reportId,
          );
          if (meetingAnomalyMod !== 0) {
            if (meetingAnomalyMod < 0) {
              const keepCount = Math.max(0, report.anomalies.length + meetingAnomalyMod);
              report = { ...report, anomalies: report.anomalies.slice(0, keepCount) };
            } else if (report.highlightedPlayerIds.length > 0) {
              const existing = new Set(report.anomalies.map((a) => a.playerId));
              const extraTargets = report.highlightedPlayerIds.filter((id) => !existing.has(id)).slice(
                0,
                meetingAnomalyMod,
              );
              if (extraTargets.length > 0) {
                const extraAnomalies: AnomalyFlag[] = extraTargets.map((playerId, idx) => {
                  const player = stateWithScheduleApplied.players[playerId];
                  return {
                    id: `meeting-anomaly-${playerId}-w${stateWithScheduleApplied.currentWeek}-i${idx}`,
                    playerId,
                    stat: "assists",
                    direction: meetingRng.nextFloat(0, 1) > 0.5 ? "positive" : "negative",
                    severity: +(meetingRng.nextFloat(0, 1) * 1.1 + 0.5).toFixed(1),
                    description: `${player?.firstName ?? "Player"} ${player?.lastName ?? ""} was escalated during analyst standup anomaly triage.`,
                    investigated: false,
                    week: stateWithScheduleApplied.currentWeek,
                    season: stateWithScheduleApplied.currentSeason,
                  };
                });
                report = { ...report, anomalies: [...report.anomalies, ...extraAnomalies] };
              }
            }
          }
          for (const playerId of report.highlightedPlayerIds) {
            profileCandidateIds.add(playerId);
          }
          updatedAnalystReports[reportId] = report;

          // Morale improves when a meeting is held, with interaction-based adjustment.
          const meetingUpdated = updateAnalystMorale(analyst, { hadMeeting: true });
          updatedAnalysts[analystIdx] = {
            ...meetingUpdated,
            morale: Math.max(0, Math.min(100, meetingUpdated.morale + meetingRelMod * 2)),
          };
        }

        let profilesAddedFromMeeting = 0;
        if (meetingProfileMod > 0 && profileCandidateIds.size > 0) {
          const candidates = meetingRng.shuffle([...profileCandidateIds]);
          const selectedIds = candidates.slice(0, Math.min(meetingProfileMod, candidates.length));
          if (selectedIds.length > 0) {
            const updatedProfiles = { ...stateWithScheduleApplied.statisticalProfiles };
            for (const playerId of selectedIds) {
              const player = stateWithScheduleApplied.players[playerId];
              if (!player) continue;
              updatedProfiles[playerId] = executeDeepVideoAnalysis(
                meetingRng,
                currentScout,
                player,
                stateWithScheduleApplied.currentSeason,
                stateWithScheduleApplied.currentWeek,
                updatedProfiles[playerId],
              );
              profilesAddedFromMeeting++;
            }
            stateWithScheduleApplied = {
              ...stateWithScheduleApplied,
              statisticalProfiles: updatedProfiles,
            };
          }
        }

        stateWithScheduleApplied = {
          ...stateWithScheduleApplied,
          dataAnalysts: updatedAnalysts,
          analystReports: updatedAnalystReports,
        };

        actObsMessages.push({
          id: `obs-analystmeeting-w${stateWithScheduleApplied.currentWeek}-s${stateWithScheduleApplied.currentSeason}`,
          week: stateWithScheduleApplied.currentWeek,
          season: stateWithScheduleApplied.currentSeason,
          type: "feedback" as const,
          title: "Analytics Team Meeting",
          body: `You held a team meeting with your data analysts this week. ${updatedAnalysts.length > 0 ? `${updatedAnalysts.length} analyst${updatedAnalysts.length !== 1 ? "s" : ""} reported in.` : "No analysts are currently assigned to your team."}${profilesAddedFromMeeting > 0 ? ` ${profilesAddedFromMeeting} additional profile${profilesAddedFromMeeting !== 1 ? "s" : ""} were deepened from meeting actions.` : ""} Reports are available in your analytics dashboard.`,
          read: false,
          actionRequired: false,
        });
      }

      // ── Youth-exclusive activity observation handlers ──────────────────────
      // These use the proper youth venue system (getYouthVenuePool + processVenueObservation)
      // which draws from unsignedYouth rather than signed professionals.

      // Check for pre-computed results from week simulation
      const simYouthResults = get().weekSimulation?.youthVenueResults;
      if (simYouthResults) {
        // A completed live session has already written authoritative evidence
        // for its activity instance. Keep the pre-computed result only when
        // the player skipped the session, so reports never count both paths.
        const applicableSimObservations = Object.values(
          simYouthResults.newObservations,
        ).filter(
          (observation) => !observation.activityInstanceId
            || !completedInteractiveIds.has(observation.activityInstanceId),
        );
        for (const observation of applicableSimObservations) {
          recordObservation(observation);
        }
        const dedupedNewDiscoveries = simYouthResults.newDiscoveries.filter(
          (nd) => !actDiscoveries.some((d) => d.playerId === nd.playerId),
        );
        actDiscoveries = [...actDiscoveries, ...dedupedNewDiscoveries];
        weekObservationsGenerated += applicableSimObservations.length;
        weekPlayersDiscovered += simYouthResults.totalDiscoveries;
        stateWithScheduleApplied = {
          ...stateWithScheduleApplied,
          unsignedYouth: { ...stateWithScheduleApplied.unsignedYouth, ...simYouthResults.updatedUnsignedYouth },
          observations: updatedObservations,
          discoveryRecords: actDiscoveries,
        };

        let updatedUnsignedYouthObs = { ...stateWithScheduleApplied.unsignedYouth };

        // --- Follow-Up Session: deepens observation on a specific youth ---
        if (weekResult.followUpSessionsExecuted > 0) {
          const qr = qualityMap.get("followUpSession");
          const tierLabel = qr ? TIER_LABELS[qr.tier] ?? qr.tier : "";
          const followUpActivities = getScheduledActivityInstances(stateWithScheduleApplied.schedule)
            .map((entry) => entry.activity)
            .filter((a) => a.type === "followUpSession" && !!a.targetId);
          for (const followUpAct of followUpActivities) {
            if (!followUpAct.targetId) continue;
            const targetYouthId = followUpAct.targetId;
            const pool = getYouthVenuePool(
              actObsRng,
              "followUpSession",
              updatedUnsignedYouthObs,
              currentScout,
              undefined,
              targetYouthId,
              undefined,
              stateWithScheduleApplied.currentWeek,
              undefined,
              buildScoutQualityDataForState(
                stateWithScheduleApplied,
                effectiveScoutCountry,
              ),
            );
            if (pool.length === 0) continue;
            const youth = pool[0];
            const existingObsForYouth = playerEvidence(youth.player.id);
            const result = processVenueObservation(
              actObsRng,
              currentScout,
              youth,
              "followUpSession",
              existingObsForYouth,
              stateWithScheduleApplied.currentWeek,
              stateWithScheduleApplied.currentSeason,
            );

            recordObservation(result.observation);
            updatedUnsignedYouthObs[youth.id] = result.updatedYouth;
            weekObservationsGenerated++;

            const topAttrs = result.observation.attributeReadings
              .sort((a, b) => b.perceivedValue - a.perceivedValue)
              .slice(0, 3)
              .map((r) => `${r.attribute} ${r.perceivedValue}`)
              .join(", ");
            const narrativePrefix = qr ? `${qr.narrative}\n\n` : "";
            actObsMessages.push({
              id: `obs-followup-${youth.player.id}-w${stateWithScheduleApplied.currentWeek}`,
              week: stateWithScheduleApplied.currentWeek,
              season: stateWithScheduleApplied.currentSeason,
              type: "feedback" as const,
              title: `Follow-Up Session${tierLabel ? ` (${tierLabel})` : ""}: ${youth.player.firstName} ${youth.player.lastName}`,
              body: `${narrativePrefix}You conducted a focused follow-up session on ${youth.player.firstName} ${youth.player.lastName} (age ${youth.player.age}, ${youth.player.position}). This deeper assessment refines your earlier observations. ${result.observation.attributeReadings.length} attributes assessed with higher confidence. Notable: ${topAttrs}.`,
              read: false,
              actionRequired: false,
              relatedId: youth.player.id,
              relatedEntityType: "player" as const,
            });
          }
        }

        // --- Parent/Coach Meeting: reveals hidden intel, no attribute observations ---
        if (weekResult.parentCoachMeetingsExecuted > 0) {
          const qr = qualityMap.get("parentCoachMeeting");
          const tierLabel = qr ? TIER_LABELS[qr.tier] ?? qr.tier : "";
          const meetingActivities = getScheduledActivityInstances(stateWithScheduleApplied.schedule)
            .map((entry) => entry.activity)
            .filter((a) => a.type === "parentCoachMeeting" && !!a.targetId);
          for (const meetingAct of meetingActivities) {
            if (!meetingAct.targetId) continue;
            const targetYouthId = meetingAct.targetId;
            const youth = updatedUnsignedYouthObs[targetYouthId];
            if (!youth || youth.placed || youth.retired) continue;

            const meetingResult = processParentCoachMeeting(actObsRng, currentScout, youth);
            const intelLines = [
              ...meetingResult.hiddenIntel.map((h) => `Intel: ${h}`),
              ...meetingResult.characterNotes.map((c) => `Character: ${c}`),
            ];
            const narrativePrefix = qr ? `${qr.narrative}\n\n` : "";
            actObsMessages.push({
              id: `obs-parentcoach-${youth.player.id}-w${stateWithScheduleApplied.currentWeek}`,
              week: stateWithScheduleApplied.currentWeek,
              season: stateWithScheduleApplied.currentSeason,
              type: "feedback" as const,
              title: `Parent/Coach Meeting${tierLabel ? ` (${tierLabel})` : ""}: ${youth.player.firstName} ${youth.player.lastName}`,
              body: `${narrativePrefix}You met with ${youth.player.firstName} ${youth.player.lastName}'s family and coaching staff.\n\n${intelLines.join("\n")}`,
              read: false,
              actionRequired: false,
              relatedId: youth.player.id,
              relatedEntityType: "player" as const,
            });
          }
        }

        // ── Focus observations for youth venues (main path) ──────────────
        // The fallback path has this inline; the main path must run it too.
        const YOUTH_VENUE_TYPES_FOR_FOCUS = [
          "schoolMatch", "grassrootsTournament", "streetFootball",
          "academyTrialDay", "youthFestival",
        ] as const;
        for (const venueType of YOUTH_VENUE_TYPES_FOR_FOCUS) {
          if (completedLiveActivityTypes.has(venueType)) continue;
          const focusTargetIds = focusPlayers(venueType);
          const focusRepeats = focusDepth(venueType);
          if (focusTargetIds.length === 0 || focusRepeats === 0) continue;

          const focusedYouthList = focusTargetIds
            .map((id) => Object.values(updatedUnsignedYouthObs).find((y) => y.player.id === id))
            .filter((y): y is UnsignedYouth => !!y);

          for (let repeat = 0; repeat < focusRepeats && focusedYouthList.length > 0; repeat++) {
            const focusedYouth = focusedYouthList[repeat % focusedYouthList.length];
            const focusObsForYouth = playerEvidence(focusedYouth.player.id);
            const focusResult = processVenueObservation(
              actObsRng,
              currentScout,
              focusedYouth,
              "followUpSession",
              focusObsForYouth,
              stateWithScheduleApplied.currentWeek,
              stateWithScheduleApplied.currentSeason,
              2, // extraAttributes — focus reveals more per pass
            );
            recordObservation(focusResult.observation);
            updatedUnsignedYouthObs[focusedYouth.id] = focusResult.updatedYouth;
            weekObservationsGenerated++;
          }
        }

        stateWithScheduleApplied = {
          ...stateWithScheduleApplied,
          unsignedYouth: updatedUnsignedYouthObs,
          observations: updatedObservations,
          discoveryRecords: actDiscoveries,
          inbox: [...stateWithScheduleApplied.inbox, ...actObsMessages],
        };
      } else {
      // Fallback: process youth venues for old/incomplete live-session saves.
      // Missing results are also normal on weeks without a youth venue, so
      // prospect supply must remain a season-boundary responsibility.

      let updatedUnsignedYouthObs = { ...stateWithScheduleApplied.unsignedYouth };

      // ── Passive tournament discovery ─────────────────────────────────────
      {
        const discoveryRng = createRNG(
          `${gameState.seed}-discovery-w${gameState.currentWeek}-s${gameState.currentSeason}`,
        );
        const scoutCountry = getScoutHome(stateWithScheduleApplied.scout);
        const { updatedTournaments, discovered } = discoverTournamentsPassive(
          discoveryRng,
          stateWithScheduleApplied.youthTournaments ?? {},
          stateWithScheduleApplied.subRegions,
          stateWithScheduleApplied.currentWeek,
          scoutCountry,
        );
        stateWithScheduleApplied = {
          ...stateWithScheduleApplied,
          youthTournaments: updatedTournaments,
        };
        for (const t of discovered) {
          actObsMessages.push({
            id: `tournament-discovered-${t.id}`,
            week: stateWithScheduleApplied.currentWeek,
            season: stateWithScheduleApplied.currentSeason,
            type: "event" as const,
            title: `Tournament Discovered: ${t.name}`,
            body: `You've heard about ${t.name}, a ${t.prestige} youth tournament in ${t.country}. It runs from week ${t.startWeek} to ${t.endWeek}. Schedule a visit to scout the talent on show.`,
            read: false,
            actionRequired: false,
          });
        }
      }

      // Extract tournament IDs from scheduled activities
      const scheduledForTournament = getScheduledActivityInstances(stateWithScheduleApplied.schedule);
      const tournamentIdForType = (type: string): string | undefined =>
        scheduledForTournament.find(i => i.activity.type === type)?.activity.targetId;

      // ── Gut feeling setup for youth observations ──────────────────────
      const newGutFeelings: GutFeeling[] = [];
      const gutEquipBonuses = stateWithScheduleApplied.finances?.equipment
        ? getActiveEquipmentBonuses(stateWithScheduleApplied.finances.equipment.loadout)
        : undefined;
      const hasGutFeelingBonus = stateWithScheduleApplied.scout.unlockedPerks.some((perkId) => {
        const perk = ALL_PERKS.find((p) => p.id === perkId);
        return perk?.effect.type === "gutFeelingBonus";
      });
      const hasPAEstimate = stateWithScheduleApplied.scout.unlockedPerks.some((perkId) => {
        const perk = ALL_PERKS.find((p) => p.id === perkId);
        return perk?.effect.type === "paEstimate";
      });
      const gutPerkMods = {
        gutFeelingBonus: hasGutFeelingBonus,
        paEstimate: hasPAEstimate,
      };
      const hasWonderkidRadar = stateWithScheduleApplied.scout.unlockedPerks.some((perkId) => {
        const perk = ALL_PERKS.find((p) => p.id === perkId);
        return perk?.effect.type === "wonderkidDetection";
      });
      const highUpsideAlertsSent = new Set<string>();

      // Helper for youth venue observation processing
      const processYouthVenueActivity = (
        venueType: "schoolMatch" | "grassrootsTournament" | "streetFootball" | "academyTrialDay" | "youthFestival" | "agencyShowcase",
        executedCount: number,
        activityLabel: string,
        msgPrefix: string,
        tournamentId?: string,
      ) => {
        if (executedCount <= 0) return;
        // Look up tournament for pool/observation bonuses
        const tournament = tournamentId
          ? stateWithScheduleApplied.youthTournaments?.[tournamentId]
          : undefined;
        const displayLabel = tournament ? tournament.name : activityLabel;
        const qr = qualityMap.get(venueType === "agencyShowcase" ? "youthFestival" : venueType);
        const discMod = (qr?.discoveryModifier ?? 0) + choiceDiscoveryMod(venueType === "agencyShowcase" ? "youthFestival" : venueType);
        const tierLabel = qr ? TIER_LABELS[qr.tier] ?? qr.tier : "";
        const equipBonuses = stateWithScheduleApplied.finances?.equipment
          ? getActiveEquipmentBonuses(stateWithScheduleApplied.finances.equipment.loadout)
          : { youthDiscoveryBonus: 0 };
        const youthBonus = equipBonuses.youthDiscoveryBonus ?? 0;

        // agencyShowcase uses youthFestival venue mechanics
        const effectiveVenueType = venueType === "agencyShowcase" ? "youthFestival" as const : venueType;

        const pool = getYouthVenuePool(
          actObsRng,
          effectiveVenueType,
          updatedUnsignedYouthObs,
          currentScout,
          undefined,
          undefined,
          youthBonus,
          stateWithScheduleApplied.currentWeek,
          tournament,
          buildScoutQualityDataForState(
            stateWithScheduleApplied,
            tournament?.country ?? effectiveScoutCountry,
          ),
        );

        // Deduct travel cost for international tournaments (first attendance)
        // Equipment travelCostReduction bonus reduces the cost
        if (tournament?.travelCost && stateWithScheduleApplied.finances) {
          const travelCostReductionRate = weekEquipBonuses?.travelCostReduction ?? 0;
          const tournamentPresence = deriveRegionalPresence(
            stateWithScheduleApplied,
            tournament.country,
          );
          const reducedTravelCost = Math.round(
            tournament.travelCost
              * tournamentPresence.effects.travelCostMultiplier
              * (1 - travelCostReductionRate),
          );
          stateWithScheduleApplied = {
            ...stateWithScheduleApplied,
            finances: {
              ...stateWithScheduleApplied.finances,
              balance: stateWithScheduleApplied.finances.balance - reducedTravelCost,
              transactions: [
                ...stateWithScheduleApplied.finances.transactions,
                {
                  week: stateWithScheduleApplied.currentWeek,
                  season: stateWithScheduleApplied.currentSeason,
                  amount: -reducedTravelCost,
                  description: `Travel + accommodation: ${tournament.name} (${tournamentPresence.accessTier} regional route)`,
                },
              ],
            },
          };
        }

        // Deduct organization cost for agency showcase
        if (tournament?.organizationCost && stateWithScheduleApplied.finances) {
          stateWithScheduleApplied = {
            ...stateWithScheduleApplied,
            finances: {
              ...stateWithScheduleApplied.finances,
              balance: stateWithScheduleApplied.finances.balance - tournament.organizationCost,
              transactions: [
                ...stateWithScheduleApplied.finances.transactions,
                {
                  week: stateWithScheduleApplied.currentWeek,
                  season: stateWithScheduleApplied.currentSeason,
                  amount: -tournament.organizationCost,
                  description: `Organization cost: ${tournament.name}`,
                },
              ],
            },
          };
        }

        // Apply quality modifier to pool size
        const adjustedCount = Math.max(1, pool.length + discMod);
        const finalPool = prioritizeFocusedYouth([...pool], venueType).slice(0, adjustedCount);

        for (let i = 0; i < finalPool.length; i++) {
          const youth = finalPool[i];
          const context = mapVenueTypeToContext(effectiveVenueType);
          const existingObsForYouth = playerEvidence(youth.player.id);
          const result = processVenueObservation(
            actObsRng,
            currentScout,
            youth,
            context,
            existingObsForYouth,
            stateWithScheduleApplied.currentWeek,
            stateWithScheduleApplied.currentSeason,
            undefined,
            tournament,
          );

          recordObservation(result.observation);
          updatedUnsignedYouthObs[youth.id] = result.updatedYouth;
          weekObservationsGenerated++;

          const alreadyDiscovered = actDiscoveries.some((r) => r.playerId === youth.player.id);
          if (!alreadyDiscovered) {
            actDiscoveries = [...actDiscoveries, recordDiscovery(
              youth.player,
              currentScout,
              stateWithScheduleApplied.currentWeek,
              stateWithScheduleApplied.currentSeason,
            )];
            weekPlayersDiscovered++;
          }

          // Roll gut feeling for this youth observation
          const gutFeeling = rollGutFeeling(
            actObsRng,
            currentScout,
            youth,
            context,
            gutPerkMods,
            gutEquipBonuses?.gutFeelingBonus ?? 0,
          );
          if (gutFeeling) {
            gutFeeling.week = stateWithScheduleApplied.currentWeek;
            gutFeeling.season = stateWithScheduleApplied.currentSeason;
            if (hasPAEstimate) {
              gutFeeling.narrative = formatGutFeelingWithPA(
                gutFeeling,
                youth,
                gutPerkMods,
                gutEquipBonuses?.paEstimateAccuracy ?? 0,
              );
            }
            newGutFeelings.push(gutFeeling);
          }

          // The perk surfaces an evidence-based signal, not hidden PA truth.
          const perceivedAbility = getPerceivedAbility(
            playerEvidence(youth.player.id),
            youth.player.id,
          );
          if (
            hasWonderkidRadar &&
            youth.player.age <= 16 &&
            perceivedAbility !== null &&
            perceivedAbility.paHigh >= 4 &&
            perceivedAbility.paConfidence >= 0.25 &&
            !highUpsideAlertsSent.has(youth.player.id)
          ) {
            highUpsideAlertsSent.add(youth.player.id);
            actObsMessages.push({
              id: `wk-radar-${youth.player.id}-w${stateWithScheduleApplied.currentWeek}`,
              week: stateWithScheduleApplied.currentWeek,
              season: stateWithScheduleApplied.currentSeason,
              type: "news" as const,
              title: `High-Upside Signal: ${youth.player.firstName} ${youth.player.lastName}`,
              body: `Your radar picked up a promising pattern around ${youth.player.firstName} ${youth.player.lastName} (age ${youth.player.age}, ${youth.player.position}). This is an uncertain signal, not a hidden rating—schedule a follow-up before committing.`,
              read: false,
              actionRequired: false,
              relatedId: youth.player.id,
              relatedEntityType: "player" as const,
            });
          }

          const topAttrs = result.observation.attributeReadings
            .sort((a, b) => b.perceivedValue - a.perceivedValue)
            .slice(0, 3)
            .map((r) => `${r.attribute} ${r.perceivedValue}`)
            .join(", ");
          const narrativePrefix = qr && i === 0 ? `${qr.narrative}\n\n` : "";
          actObsMessages.push({
            id: `obs-${venueType}-${youth.player.id}-w${stateWithScheduleApplied.currentWeek}`,
            week: stateWithScheduleApplied.currentWeek,
            season: stateWithScheduleApplied.currentSeason,
            type: "feedback" as const,
            title: `${displayLabel}${tierLabel ? ` (${tierLabel})` : ""}: ${youth.player.firstName} ${youth.player.lastName}`,
            body: `${narrativePrefix}${msgPrefix} ${youth.player.firstName} ${youth.player.lastName} (age ${youth.player.age}, ${youth.player.position}) from ${youth.country}. ${result.observation.attributeReadings.length} attributes assessed. Notable: ${topAttrs}. Buzz +${result.buzzIncrease}, Visibility +${result.visibilityIncrease}.`,
            read: false,
            actionRequired: false,
            relatedId: youth.player.id,
            relatedEntityType: "player" as const,
          });
        }

        const focusTargetIds = focusPlayers(venueType);
        const focusRepeats = focusDepth(venueType);
        if (focusTargetIds.length > 0 && focusRepeats > 0) {
          const focusedYouthList = focusTargetIds
            .map((id) =>
              finalPool.find((y) => y.player.id === id)
              ?? Object.values(updatedUnsignedYouthObs).find((y) => y.player.id === id),
            )
            .filter((y): y is UnsignedYouth => !!y);

          for (let repeat = 0; repeat < focusRepeats && focusedYouthList.length > 0; repeat++) {
            const focusedYouth = focusedYouthList[repeat % focusedYouthList.length];
            const focusObsForYouth = playerEvidence(focusedYouth.player.id);
            const focusResult = processVenueObservation(
              actObsRng,
              currentScout,
              focusedYouth,
              "followUpSession",
              focusObsForYouth,
              stateWithScheduleApplied.currentWeek,
              stateWithScheduleApplied.currentSeason,
            );
            recordObservation(focusResult.observation);
            updatedUnsignedYouthObs[focusedYouth.id] = focusResult.updatedYouth;
            weekObservationsGenerated++;

            // Roll gut feeling for focused follow-up observation
            const focusGutFeeling = rollGutFeeling(
              actObsRng,
              currentScout,
              focusedYouth,
              "followUpSession",
              gutPerkMods,
              gutEquipBonuses?.gutFeelingBonus ?? 0,
            );
            if (focusGutFeeling) {
              focusGutFeeling.week = stateWithScheduleApplied.currentWeek;
              focusGutFeeling.season = stateWithScheduleApplied.currentSeason;
              if (hasPAEstimate) {
                focusGutFeeling.narrative = formatGutFeelingWithPA(
                  focusGutFeeling,
                  focusedYouth,
                  gutPerkMods,
                  gutEquipBonuses?.paEstimateAccuracy ?? 0,
                );
              }
              newGutFeelings.push(focusGutFeeling);
            }
          }
        }

        // Mark tournament as attended
        if (tournament && tournamentId && stateWithScheduleApplied.youthTournaments) {
          stateWithScheduleApplied = {
            ...stateWithScheduleApplied,
            youthTournaments: {
              ...stateWithScheduleApplied.youthTournaments,
              [tournamentId]: { ...tournament, attended: true },
            },
          };
        }
      };

      processYouthVenueActivity(
        "schoolMatch",
        weekResult.schoolMatchesExecuted,
        "School Match",
        "You watched",
      );
      processYouthVenueActivity(
        "grassrootsTournament",
        weekResult.grassrootsTournamentsExecuted,
        "Grassroots Tournament",
        "You scouted",
        tournamentIdForType("grassrootsTournament"),
      );
      processYouthVenueActivity(
        "streetFootball",
        weekResult.streetFootballExecuted,
        "Street Football",
        "You observed",
      );
      processYouthVenueActivity(
        "academyTrialDay",
        weekResult.academyTrialDaysExecuted,
        "Academy Trial Day",
        "You evaluated",
      );
      processYouthVenueActivity(
        "youthFestival",
        weekResult.youthFestivalsExecuted,
        "Youth Festival",
        "You spotted",
        tournamentIdForType("youthFestival"),
      );
      processYouthVenueActivity(
        "agencyShowcase",
        weekResult.agencyShowcasesExecuted,
        "Agency Showcase",
        "You hosted",
        tournamentIdForType("agencyShowcase"),
      );

      // --- Follow-Up Session: deepens observation on a specific youth ---
        if (weekResult.followUpSessionsExecuted > 0) {
          const qr = qualityMap.get("followUpSession");
          const tierLabel = qr ? TIER_LABELS[qr.tier] ?? qr.tier : "";
          // Find the followUpSession activity to get its targetId
          const followUpActivities = getScheduledActivityInstances(stateWithScheduleApplied.schedule)
            .map((entry) => entry.activity)
            .filter((a) => a.type === "followUpSession" && !!a.targetId);
          for (const followUpAct of followUpActivities) {
            if (!followUpAct?.targetId) continue;
            const targetYouthId = followUpAct.targetId;
          const pool = getYouthVenuePool(
            actObsRng,
            "followUpSession",
            updatedUnsignedYouthObs,
            currentScout,
            undefined,
            targetYouthId,
            undefined,
            stateWithScheduleApplied.currentWeek,
            undefined,
            buildScoutQualityDataForState(
              stateWithScheduleApplied,
              effectiveScoutCountry,
            ),
          );
          if (pool.length === 0) continue;
          const youth = pool[0];
          const existingObsForYouth = playerEvidence(youth.player.id);
          const result = processVenueObservation(
            actObsRng,
            currentScout,
            youth,
            "followUpSession",
            existingObsForYouth,
            stateWithScheduleApplied.currentWeek,
            stateWithScheduleApplied.currentSeason,
          );

          recordObservation(result.observation);
          updatedUnsignedYouthObs[youth.id] = result.updatedYouth;
          weekObservationsGenerated++;

          // Roll gut feeling for standalone follow-up observation
          const followUpGutFeeling = rollGutFeeling(
            actObsRng,
            currentScout,
            youth,
            "followUpSession",
            gutPerkMods,
            gutEquipBonuses?.gutFeelingBonus ?? 0,
          );
          if (followUpGutFeeling) {
            followUpGutFeeling.week = stateWithScheduleApplied.currentWeek;
            followUpGutFeeling.season = stateWithScheduleApplied.currentSeason;
            if (hasPAEstimate) {
              followUpGutFeeling.narrative = formatGutFeelingWithPA(
                followUpGutFeeling,
                youth,
                gutPerkMods,
                gutEquipBonuses?.paEstimateAccuracy ?? 0,
              );
            }
            newGutFeelings.push(followUpGutFeeling);
          }

          const topAttrs = result.observation.attributeReadings
            .sort((a, b) => b.perceivedValue - a.perceivedValue)
            .slice(0, 3)
            .map((r) => `${r.attribute} ${r.perceivedValue}`)
            .join(", ");
          const narrativePrefix = qr ? `${qr.narrative}\n\n` : "";
          actObsMessages.push({
            id: `obs-followup-${youth.player.id}-w${stateWithScheduleApplied.currentWeek}`,
            week: stateWithScheduleApplied.currentWeek,
            season: stateWithScheduleApplied.currentSeason,
            type: "feedback" as const,
            title: `Follow-Up Session${tierLabel ? ` (${tierLabel})` : ""}: ${youth.player.firstName} ${youth.player.lastName}`,
            body: `${narrativePrefix}You conducted a focused follow-up session on ${youth.player.firstName} ${youth.player.lastName} (age ${youth.player.age}, ${youth.player.position}). This deeper assessment refines your earlier observations. ${result.observation.attributeReadings.length} attributes assessed with higher confidence. Notable: ${topAttrs}.`,
            read: false,
            actionRequired: false,
            relatedId: youth.player.id,
            relatedEntityType: "player" as const,
          });
        }
      }

      // --- Parent/Coach Meeting: reveals hidden intel, no attribute observations ---
        if (weekResult.parentCoachMeetingsExecuted > 0) {
          const qr = qualityMap.get("parentCoachMeeting");
          const tierLabel = qr ? TIER_LABELS[qr.tier] ?? qr.tier : "";
          const meetingActivities = getScheduledActivityInstances(stateWithScheduleApplied.schedule)
            .map((entry) => entry.activity)
            .filter((a) => a.type === "parentCoachMeeting" && !!a.targetId);
          for (const meetingAct of meetingActivities) {
            if (!meetingAct?.targetId) continue;
          const targetYouthId = meetingAct.targetId;
          const youth = updatedUnsignedYouthObs[targetYouthId];
          if (!youth || youth.placed || youth.retired) continue;

          const meetingResult = processParentCoachMeeting(actObsRng, currentScout, youth);

          const intelLines = [
            ...meetingResult.hiddenIntel.map((h) => `Intel: ${h}`),
            ...meetingResult.characterNotes.map((c) => `Character: ${c}`),
          ];
          const narrativePrefix = qr ? `${qr.narrative}\n\n` : "";
          actObsMessages.push({
            id: `obs-parentcoach-${youth.player.id}-w${stateWithScheduleApplied.currentWeek}`,
            week: stateWithScheduleApplied.currentWeek,
            season: stateWithScheduleApplied.currentSeason,
            type: "feedback" as const,
            title: `Parent/Coach Meeting${tierLabel ? ` (${tierLabel})` : ""}: ${youth.player.firstName} ${youth.player.lastName}`,
            body: `${narrativePrefix}You met with ${youth.player.firstName} ${youth.player.lastName}'s family and coaching staff.\n\n${intelLines.join("\n")}`,
            read: false,
            actionRequired: false,
            relatedId: youth.player.id,
            relatedEntityType: "player" as const,
          });
        }
      }

      // Apply updated unsigned youth back to state
      stateWithScheduleApplied = {
        ...stateWithScheduleApplied,
        unsignedYouth: updatedUnsignedYouthObs,
      };

      if (actObsMessages.length > 0 || Object.keys(updatedObservations).length !== Object.keys(stateWithScheduleApplied.observations).length) {
        stateWithScheduleApplied = {
          ...stateWithScheduleApplied,
          observations: updatedObservations,
          discoveryRecords: actDiscoveries,
          inbox: [...stateWithScheduleApplied.inbox, ...actObsMessages],
        };
      }

      // Merge any gut feelings generated during youth observations
      if (newGutFeelings.length > 0) {
        stateWithScheduleApplied = {
          ...stateWithScheduleApplied,
          gutFeelings: [...stateWithScheduleApplied.gutFeelings, ...newGutFeelings],
        };
      }
      } // end else (fallback for old saves)

      // Apply regional context once, after every manual/week-simulation path
      // has converged on the same authoritative observation collection.
      const presenceAdjustedObservations = {
        ...stateWithScheduleApplied.observations,
      };
      for (const [observationId, observation] of Object.entries(presenceAdjustedObservations)) {
        if (preexistingObservationIds.has(observationId)) continue;
        presenceAdjustedObservations[observationId] = applyRegionalPresenceToObservation(
          stateWithScheduleApplied,
          observation,
        );
      }
      stateWithScheduleApplied = {
        ...stateWithScheduleApplied,
        observations: presenceAdjustedObservations,
      };
    }

    // ── Youth placement resolution ────────────────────────────────────────
    // A placement is a delivery of an existing authored report, not a second
    // standalone opinion. Persist it now, then let the club decide no earlier
    // than the following game week.
    const hasPendingPlacement = Object.values(stateWithScheduleApplied.placementReports).some(
      (report) => report.clubResponse === "pending",
    );
    if (weekResult.writePlacementReportsExecuted > 0 || hasPendingPlacement) {
      const placementRng = createRNG(
        `${gameState.seed}-placement-${gameState.currentWeek}-${gameState.currentSeason}`,
      );
      let preparedPlacementReports = { ...stateWithScheduleApplied.placementReports };
      let preparedReports = { ...stateWithScheduleApplied.reports };
      let preparedScoutingCases = { ...(stateWithScheduleApplied.scoutingCases ?? {}) };
      let preparedReportDeliveries = { ...(stateWithScheduleApplied.reportDeliveries ?? {}) };
      const submissionMessages: InboxMessage[] = [];
      const scheduledPlacementActivities = weekResult.writePlacementReportsExecuted > 0
        ? getScheduledActivityInstances(stateWithScheduleApplied.schedule)
            .map((entry) => entry.activity)
            .filter((activity) => activity.type === "writePlacementReport" && !!activity.targetId)
        : [];

      for (const placementActivity of scheduledPlacementActivities) {
        if (!placementActivity.targetId) continue;
        const youth = resolveUnsignedYouth(stateWithScheduleApplied, placementActivity.targetId);
        if (!youth || youth.placed || youth.retired) continue;
        const existingPending = Object.values(preparedPlacementReports).some(
          (r) => r.unsignedYouthId === youth.id && r.clubResponse === "pending",
        );
        if (existingPending) continue;

        const youthObservations = Object.values(stateWithScheduleApplied.observations).filter(
          (o) => o.playerId === youth.player.id,
        );
        if (youthObservations.length === 0) continue;

        const sourceReport = Object.values(preparedReports)
          .filter((report) =>
            report.playerId === youth.player.id
            && report.scoutId === stateWithScheduleApplied.scout.id
          )
          .sort((left, right) =>
            right.submittedSeason - left.submittedSeason
            || right.submittedWeek - left.submittedWeek
            || right.id.localeCompare(left.id)
          )[0];
        if (!sourceReport) {
          submissionMessages.push({
            id: `placement-report-required-${youth.id}-${stateWithScheduleApplied.currentSeason}-${stateWithScheduleApplied.currentWeek}`,
            week: stateWithScheduleApplied.currentWeek,
            season: stateWithScheduleApplied.currentSeason,
            type: "feedback",
            title: "Authored Report Required",
            body: `Write and submit a scouting report for ${youth.player.firstName} ${youth.player.lastName} before pitching a club. A placement must stand behind a preserved opinion, not just raw observations.`,
            read: false,
            actionRequired: true,
            relatedId: youth.player.id,
            relatedEntityType: "player",
          });
          continue;
        }

        const targetClubId = sourceReport.intendedClubId
          ?? placementActivity.destinationClubId;
        const eligibleClubs = getEligibleClubsForPlacement(
          youth,
          Object.values(stateWithScheduleApplied.clubs),
          stateWithScheduleApplied.scout,
          stateWithScheduleApplied.leagues,
          { preferredClubId: targetClubId },
        );
        const targetClub = targetClubId
          ? eligibleClubs.find((club) => club.id === targetClubId)
          : eligibleClubs[0];
        if (!targetClub) continue;

        const generatedReport = {
          ...generatePlacementReport(
          placementRng,
          youth,
          targetClub,
          youthObservations,
          stateWithScheduleApplied.scout,
          stateWithScheduleApplied.currentWeek,
          stateWithScheduleApplied.currentSeason,
          ),
          conviction: sourceReport.conviction,
          qualityScore: sourceReport.qualityScore,
          briefId: sourceReport.briefId,
        };
        const linked = ensureScoutingCaseForReport(preparedScoutingCases, sourceReport);
        const recorded = recordDirectPlacementDelivery({
          scoutingCases: linked.scoutingCases,
          reportDeliveries: preparedReportDeliveries,
          report: linked.report,
          placementReport: generatedReport,
          seasonLength: getSeasonLength(
            stateWithScheduleApplied.fixtures,
            stateWithScheduleApplied.currentSeason,
          ),
        });
        preparedReports[sourceReport.id] = recorded.report;
        preparedScoutingCases = recorded.scoutingCases;
        preparedReportDeliveries = recorded.reportDeliveries;
        preparedPlacementReports[recorded.placementReport.id] = recorded.placementReport;
      }

      stateWithScheduleApplied = {
        ...stateWithScheduleApplied,
        reports: preparedReports,
        placementReports: preparedPlacementReports,
        scoutingCases: preparedScoutingCases,
        reportDeliveries: preparedReportDeliveries,
        inbox: [...stateWithScheduleApplied.inbox, ...submissionMessages],
      };

      const pendingReports = Object.values(preparedPlacementReports).filter(
        (report) =>
          report.clubResponse === "pending"
          && report.deliveryId
          && isGameDateDue(
            stateWithScheduleApplied.currentWeek,
            stateWithScheduleApplied.currentSeason,
            report.responseDueWeek ?? report.week + 1,
            report.responseDueSeason ?? report.season,
          ),
      );

      if (pendingReports.length > 0) {
        let updatedPlacementReports = { ...stateWithScheduleApplied.placementReports };
        let updatedUnsignedYouth = { ...stateWithScheduleApplied.unsignedYouth };
        let placementLifecycle = getLifecycleWorld(stateWithScheduleApplied);
        let updatedAlumniRecords = [...stateWithScheduleApplied.alumniRecords];
        let updatedScoutingCases = { ...stateWithScheduleApplied.scoutingCases };
        let updatedReportDeliveries = { ...stateWithScheduleApplied.reportDeliveries };
        let updatedClubDecisions = { ...(stateWithScheduleApplied.clubDecisions ?? {}) };
        let updatedConsequenceState = stateWithScheduleApplied.consequenceState;
        let updatedRecruitmentBriefs = { ...stateWithScheduleApplied.youthRecruitmentBriefs };
        let updatedRecommendationReviews = { ...stateWithScheduleApplied.recommendationReviews };
        const placementMessages: InboxMessage[] = [];
        const currentScoutForPlacement = stateWithScheduleApplied.scout;

        for (const report of pendingReports) {
          let resolvedClubDecision: ClubDecision | undefined;
          const youth = updatedUnsignedYouth[report.unsignedYouthId];
          const club = placementLifecycle.clubs[report.targetClubId];
          if (!youth || !club) continue;
          if (!report.deliveryId || updatedReportDeliveries[report.deliveryId]?.decisionId) continue;
          const sourceReport = report.reportId
            ? stateWithScheduleApplied.reports[report.reportId]
            : undefined;
          const brief = sourceReport?.briefId
            ? updatedRecruitmentBriefs[sourceReport.briefId]
            : undefined;
          const relationshipScore = Math.max(
            0,
            ...Object.values(stateWithScheduleApplied.contacts)
              .filter((contact) => contact.organization === club.name)
              .map((contact) => contact.relationship),
          );
          const structuredDecision = sourceReport && brief
            ? scoreAcademyClubDecision({
                rng: createRNG(`${stateWithScheduleApplied.seed}-academy-decision-${report.id}`),
                report: sourceReport,
                brief,
                player: youth.player,
                observations: Object.values(stateWithScheduleApplied.observations).filter(
                  (observation) => observation.playerId === youth.player.id,
                ),
                scout: currentScoutForPlacement,
                club,
                relationshipScore,
                stakeholderContext: {
                  consequenceState: updatedConsequenceState,
                  now: {
                    week: stateWithScheduleApplied.currentWeek,
                    season: stateWithScheduleApplied.currentSeason,
                  },
                  seasonLength: getSeasonLength(
                    stateWithScheduleApplied.fixtures,
                    stateWithScheduleApplied.currentSeason,
                  ),
                },
                worldConditionContext: {
                  scoreAdjustment: getWorldConditionModifiers(
                    stateWithScheduleApplied,
                    stateWithScheduleApplied.leagues[club.leagueId]?.country,
                  ).recruitmentScoreAdjustment,
                  label: getActiveWorldConditionNames(
                    stateWithScheduleApplied,
                    stateWithScheduleApplied.leagues[club.leagueId]?.country,
                  ).join(" and ") || "The seasonal recruitment climate",
                },
              })
            : undefined;
          const legacyDecisionScore = Math.round(
            report.qualityScore * 0.65
            + ({ note: 20, recommend: 50, strongRecommend: 75, tablePound: 92 } as const)[report.conviction] * 0.35
            + (placementRng.next() - 0.5) * 8,
          );
          let decisionOutcome = structuredDecision?.outcome
            ?? (legacyDecisionScore >= 58 ? "accepted" as const : "rejected" as const);
          const outcome = decisionOutcome === "accepted"
            ? processPlacementOutcome(placementRng, report, 1, youth, club)
            : processPlacementOutcome(placementRng, report, 0, youth, club);

          let signedPlayerId: string | undefined;
          if (outcome.success && outcome.newPlayer) {
            const detachedPlayer = {
              ...outcome.newPlayer,
              clubId: "",
              contractClubId: undefined,
              contractExpiry: 0,
              wage: 0,
            };
            const resolution = resolvePlayerMovements(
              {
                ...placementLifecycle,
                players: {
                  ...placementLifecycle.players,
                  [detachedPlayer.id]: detachedPlayer,
                },
              },
              [{
                type: "youthSigning",
                playerId: detachedPlayer.id,
                toClubId: club.id,
                contractLength: 3,
                wage: Math.max(100, Math.round(sourceReport?.estimatedWeeklyWage ?? 250)),
                reason: `Placement report ${report.id} accepted`,
              }],
              stateWithScheduleApplied.currentWeek,
              stateWithScheduleApplied.currentSeason,
              getSeasonLength(
                stateWithScheduleApplied.fixtures,
                stateWithScheduleApplied.currentSeason,
              ),
            );
            if (resolution.applied.length > 0) {
              placementLifecycle = resolution.state;
              signedPlayerId = detachedPlayer.id;
            }
          }

          if (decisionOutcome === "accepted" && !signedPlayerId) {
            decisionOutcome = "rejected";
          }

          if (signedPlayerId) {
            const resolved = resolveClubDecision({
              scoutingCases: updatedScoutingCases,
              reportDeliveries: updatedReportDeliveries,
              clubDecisions: updatedClubDecisions,
              deliveryId: report.deliveryId,
              outcome: "accepted",
              week: stateWithScheduleApplied.currentWeek,
              season: stateWithScheduleApplied.currentSeason,
              reason: structuredDecision?.reasons.join(" ")
                ?? "Club accepted the youth placement recommendation",
              reasons: structuredDecision?.reasons,
              scoreBreakdown: structuredDecision?.breakdown,
            });
            updatedScoutingCases = resolved.scoutingCases;
            updatedReportDeliveries = resolved.reportDeliveries;
            updatedClubDecisions = resolved.clubDecisions;
            resolvedClubDecision = resolved.decision;
            // Update placement report as accepted
            const acceptedPlacement = {
              ...report,
              clubResponse: "accepted" as const,
              placementType: outcome.placementType ?? undefined,
              decisionId: resolved.decision?.id,
            };
            updatedPlacementReports[report.id] = acceptedPlacement;

            // The authoritative Player, movement, report, case, and alumni
            // record now own this history. Keep the unsigned pool limited to
            // live opportunities instead of retaining a duplicate dossier.
            delete updatedUnsignedYouth[report.unsignedYouthId];

            // Create alumni record
            const alumniRecord = createAlumniRecord(
              youth,
              club.id,
              stateWithScheduleApplied.currentWeek,
              stateWithScheduleApplied.currentSeason,
              {
                caseId: report.caseId,
                placementReportId: report.id,
                originatingReportId: report.reportId,
              },
            );
            updatedAlumniRecords = [...updatedAlumniRecords, alumniRecord];
            if (report.caseId && updatedScoutingCases[report.caseId]) {
              updatedScoutingCases[report.caseId] = {
                ...updatedScoutingCases[report.caseId],
                status: "placed",
                alumniRecordId: alumniRecord.id,
              };
            }
            if (brief && report.caseId) {
              updatedRecruitmentBriefs[brief.id] = fulfillYouthRecruitmentBrief(
                brief,
                report.caseId,
                youth.player.id,
              );
            }
            const placedCase = report.caseId ? updatedScoutingCases[report.caseId] : undefined;
            if (placedCase && sourceReport && resolved.decision) {
              const reviewSchedule = scheduleAcademyRecommendationReviews({
                scoutingCase: placedCase,
                report: sourceReport,
                placementReport: acceptedPlacement,
                clubDecision: resolved.decision,
                movementHistory: placementLifecycle.playerMovementHistory,
                existingReviews: Object.values(updatedRecommendationReviews),
                seasonLength: getSeasonLength(
                  stateWithScheduleApplied.fixtures,
                  stateWithScheduleApplied.currentSeason,
                ),
              });
              for (const review of reviewSchedule.created) {
                updatedRecommendationReviews[review.id] = review;
              }
              if (reviewSchedule.created.length > 0) {
                updatedScoutingCases[placedCase.id] = {
                  ...placedCase,
                  reviewIds: [
                    ...(placedCase.reviewIds ?? []),
                    ...reviewSchedule.created.map((review) => review.id),
                  ],
                };
              }
            }

            placementMessages.push({
              id: `placement-accepted-${report.id}`,
              week: stateWithScheduleApplied.currentWeek,
              season: stateWithScheduleApplied.currentSeason,
              type: "event" as const,
              title: `Placement Accepted: ${youth.player.firstName} ${youth.player.lastName}`,
              body: `${club.name} accepted your placement recommendation for ${youth.player.firstName} ${youth.player.lastName}! The ${outcome.placementType === "academyIntake" ? "academy intake" : "youth contract"} has been finalized. You can track their career progress in your alumni records.`,
              read: false,
              actionRequired: false,
              relatedId: signedPlayerId,
              relatedEntityType: "player" as const,
            });
          } else if (decisionOutcome === "followUpRequested") {
            const followUpDue = nextGameWeek(
              stateWithScheduleApplied.currentWeek,
              stateWithScheduleApplied.currentSeason,
              getSeasonLength(
                stateWithScheduleApplied.fixtures,
                stateWithScheduleApplied.currentSeason,
              ),
            );
            const resolved = resolveClubDecision({
              scoutingCases: updatedScoutingCases,
              reportDeliveries: updatedReportDeliveries,
              clubDecisions: updatedClubDecisions,
              deliveryId: report.deliveryId,
              outcome: "followUpRequested",
              week: stateWithScheduleApplied.currentWeek,
              season: stateWithScheduleApplied.currentSeason,
              reason: structuredDecision?.reasons.join(" ") ?? "The club requested more evidence.",
              reasons: structuredDecision?.reasons,
              scoreBreakdown: structuredDecision?.breakdown,
              requestedEvidenceCategory: structuredDecision?.requestedEvidenceCategory,
              followUpDueWeek: followUpDue.week,
              followUpDueSeason: followUpDue.season,
            });
            updatedScoutingCases = resolved.scoutingCases;
            updatedReportDeliveries = resolved.reportDeliveries;
            updatedClubDecisions = resolved.clubDecisions;
            resolvedClubDecision = resolved.decision;
            updatedPlacementReports[report.id] = {
              ...report,
              clubResponse: "followUpRequested",
              decisionId: resolved.decision?.id,
            };
            placementMessages.push({
              id: `placement-follow-up-${report.id}`,
              week: stateWithScheduleApplied.currentWeek,
              season: stateWithScheduleApplied.currentSeason,
              type: "feedback",
              title: `More Evidence Requested: ${youth.player.firstName} ${youth.player.lastName}`,
              body: `${club.name} is not ready to offer a place. ${structuredDecision?.reasons.join(" ") ?? "Build the case in another context."} Requested focus: ${structuredDecision?.requestedEvidenceCategory ?? "overall confidence"}.`,
              read: false,
              actionRequired: true,
              relatedId: youth.player.id,
              relatedEntityType: "player",
            });
          } else {
            const resolved = resolveClubDecision({
              scoutingCases: updatedScoutingCases,
              reportDeliveries: updatedReportDeliveries,
              clubDecisions: updatedClubDecisions,
              deliveryId: report.deliveryId,
              outcome: "rejected",
              week: stateWithScheduleApplied.currentWeek,
              season: stateWithScheduleApplied.currentSeason,
              reason: structuredDecision?.reasons.join(" ")
                ?? "Club declined the youth placement recommendation",
              reasons: structuredDecision?.reasons,
              scoreBreakdown: structuredDecision?.breakdown,
            });
            updatedScoutingCases = resolved.scoutingCases;
            updatedReportDeliveries = resolved.reportDeliveries;
            updatedClubDecisions = resolved.clubDecisions;
            resolvedClubDecision = resolved.decision;
            // Update placement report as rejected
            updatedPlacementReports[report.id] = {
              ...report,
              clubResponse: "rejected",
              decisionId: resolved.decision?.id,
            };

            placementMessages.push({
              id: `placement-rejected-${report.id}`,
              week: stateWithScheduleApplied.currentWeek,
              season: stateWithScheduleApplied.currentSeason,
              type: "event" as const,
              title: `Placement Declined: ${youth.player.firstName} ${youth.player.lastName}`,
              body: `${club.name} declined your placement recommendation for ${youth.player.firstName} ${youth.player.lastName}. ${structuredDecision?.reasons.join(" ") ?? "Consider building more observations or targeting a different club."}`,
              read: false,
              actionRequired: false,
              relatedId: youth.player.id,
              relatedEntityType: "player" as const,
            });
          }
          if (resolvedClubDecision && sourceReport) {
            const memoryResult = recordStakeholderMemory(
              updatedConsequenceState,
              createAcademyClubDecisionMemory({
                decision: resolvedClubDecision,
                report: sourceReport,
                scoutId: currentScoutForPlacement.id,
              }),
            );
            if (memoryResult.success) updatedConsequenceState = memoryResult.state;
          }
        }

        stateWithScheduleApplied = {
          ...withLifecycleWorld(stateWithScheduleApplied, placementLifecycle),
          placementReports: updatedPlacementReports,
          unsignedYouth: updatedUnsignedYouth,
          alumniRecords: updatedAlumniRecords,
          scoutingCases: updatedScoutingCases,
          reportDeliveries: updatedReportDeliveries,
          clubDecisions: updatedClubDecisions,
          consequenceState: updatedConsequenceState,
          youthRecruitmentBriefs: updatedRecruitmentBriefs,
          recommendationReviews: updatedRecommendationReviews,
          inbox: [...stateWithScheduleApplied.inbox, ...placementMessages],
        };
      }
    }

    // h) New contact generation — every 8th week, 30% chance
    // Academy briefs age every week: pressure rises, expired opportunities
    // close, and a bounded number of new club needs enter the market.
    const academyBriefSeasonLength = Math.max(
      stateWithScheduleApplied.currentWeek,
      getSeasonLength(
        stateWithScheduleApplied.fixtures,
        stateWithScheduleApplied.currentSeason,
      ),
    );
    const academyBriefDate = nextGameWeek(
      stateWithScheduleApplied.currentWeek,
      stateWithScheduleApplied.currentSeason,
      academyBriefSeasonLength,
    );
    const briefCycle = advanceYouthRecruitmentBriefs(
      stateWithScheduleApplied.youthRecruitmentBriefs,
      academyBriefDate.week,
      academyBriefDate.season,
      academyBriefSeasonLength,
    );
    const replacementBriefs = generateYouthRecruitmentBriefs(
      createRNG(`${stateWithScheduleApplied.seed}-academy-brief-refresh-s${academyBriefDate.season}w${academyBriefDate.week}`),
      Object.values(stateWithScheduleApplied.clubs),
      stateWithScheduleApplied.players,
      academyBriefDate.week,
      academyBriefDate.season,
      briefCycle.briefs,
      Math.max(
        6,
        Math.round(
          12 * getWorldConditionModifiers(stateWithScheduleApplied)
            .opportunityMultiplier,
        ),
      ),
      academyBriefSeasonLength,
      stateWithScheduleApplied.seed,
    );
    const recruitmentBriefs = {
      ...briefCycle.briefs,
      ...Object.fromEntries(replacementBriefs.map((brief) => [brief.id, brief])),
    };
    const briefMessages: InboxMessage[] = [
      ...briefCycle.expiredIds.map((briefId) => {
        const brief = briefCycle.briefs[briefId];
        const clubName = brief ? stateWithScheduleApplied.clubs[brief.clubId]?.name : undefined;
        return {
          id: `academy-brief-expired-${briefId}`,
          week: academyBriefDate.week,
          season: academyBriefDate.season,
          type: "event" as const,
          title: "Academy Brief Expired",
          body: `${clubName ?? "A client club"} closed its ${brief?.requiredPositions.join("/") ?? "youth"} request. Waiting for certainty carried an opportunity cost.`,
          read: false,
          actionRequired: false,
        };
      }),
      ...replacementBriefs.map((brief) => ({
        id: `academy-brief-opened-${brief.id}`,
        week: academyBriefDate.week,
        season: academyBriefDate.season,
        type: "event" as const,
        title: `New Academy Brief: ${brief.requiredPositions.join("/")}`,
        body: `${stateWithScheduleApplied.clubs[brief.clubId]?.name ?? "A client club"} needs a ${brief.requiredPositions.join("/")} prospect by Season ${brief.expiresSeason}, Week ${brief.expiresWeek}. Rival pressure is ${brief.competitionPressure}/100.`,
        read: false,
        actionRequired: false,
      })),
    ];
    stateWithScheduleApplied = {
      ...stateWithScheduleApplied,
      youthRecruitmentBriefs: recruitmentBriefs,
      inbox: briefMessages.length > 0
        ? [...stateWithScheduleApplied.inbox, ...briefMessages]
        : stateWithScheduleApplied.inbox,
    };

    // Complete due one- and two-season reviews from canonical movement,
    // appearance/rating, and injury history. Hidden ability is never read.
    let recommendationReviews = { ...stateWithScheduleApplied.recommendationReviews };
    let calibratedNPCReports = stateWithScheduleApplied.npcReports;
    let calibratedContactIntel = stateWithScheduleApplied.contactIntel;
    const reviewMessages: InboxMessage[] = [];
    for (const review of Object.values(recommendationReviews)) {
      if (review.status !== "scheduled") continue;
      const due = stateWithScheduleApplied.currentSeason > review.dueSeason
        || (
          stateWithScheduleApplied.currentSeason === review.dueSeason
          && stateWithScheduleApplied.currentWeek >= review.dueWeek
        );
      if (!due) continue;
      const scoutingCase = stateWithScheduleApplied.scoutingCases[review.caseId];
      const sourceReport = stateWithScheduleApplied.reports[review.reportId];
      const placementReport = scoutingCase?.placementReportIds
        .map((id) => stateWithScheduleApplied.placementReports[id])
        .find((placement) =>
          placement?.reportId === review.reportId
          && placement.targetClubId === review.clubId
          && placement.clubResponse === "accepted"
        );
      const clubDecision = placementReport?.decisionId
        ? stateWithScheduleApplied.clubDecisions[placementReport.decisionId]
        : undefined;
      const reviewedPlayer = stateWithScheduleApplied.players[review.playerId]
        ?? stateWithScheduleApplied.retiredPlayers[review.playerId];
      if (!scoutingCase || !sourceReport || !placementReport || !clubDecision || !reviewedPlayer) {
        continue;
      }
      const result = completeAcademyRecommendationReview({
        review,
        scoutingCase,
        report: sourceReport,
        caseReports: scoutingCase.reportIds
          .map((id) => stateWithScheduleApplied.reports[id])
          .filter((candidate): candidate is ScoutReport => Boolean(candidate)),
        placementReport,
        clubDecision,
        player: reviewedPlayer,
        movementHistory: stateWithScheduleApplied.playerMovementHistory,
        currentWeek: stateWithScheduleApplied.currentWeek,
        currentSeason: stateWithScheduleApplied.currentSeason,
        seasonLength: getSeasonLength(
          stateWithScheduleApplied.fixtures,
          stateWithScheduleApplied.currentSeason,
        ),
      });
      if (result.status !== "completed") continue;
      recommendationReviews[result.review.id] = result.review;
      const sourceCalibration = calibrateSourceEvidenceFromReview({
        npcReports: calibratedNPCReports,
        contactIntel: calibratedContactIntel,
        review: result.review,
      });
      calibratedNPCReports = sourceCalibration.npcReports;
      calibratedContactIntel = sourceCalibration.contactIntel;
      reviewMessages.push({
        id: `recommendation-review-${result.review.id}`,
        week: stateWithScheduleApplied.currentWeek,
        season: stateWithScheduleApplied.currentSeason,
        type: "feedback",
        title: `${review.checkpoint === "oneSeason" ? "One-Season" : "Two-Season"} Recommendation Review`,
        body: `Your recommendation for ${reviewedPlayer.firstName} ${reviewedPlayer.lastName} scored ${result.review.overallScore ?? "unresolved"}/100. ${(result.review.findings ?? []).join(" ")}${sourceCalibration.calibratedClaimIds.length > 0 ? ` ${sourceCalibration.calibratedClaimIds.length} attributed source claim${sourceCalibration.calibratedClaimIds.length === 1 ? " was" : "s were"} calibrated against the observable outcome.` : ""}`,
        read: false,
        actionRequired: false,
        relatedId: reviewedPlayer.id,
        relatedEntityType: "player",
      });
    }
    stateWithScheduleApplied = {
      ...stateWithScheduleApplied,
      recommendationReviews,
      npcReports: calibratedNPCReports,
      contactIntel: calibratedContactIntel,
      inbox: reviewMessages.length > 0
        ? [...stateWithScheduleApplied.inbox, ...reviewMessages]
        : stateWithScheduleApplied.inbox,
    };

    if (stateWithScheduleApplied.currentWeek % 8 === 0) {
      const contactRng = createRNG(
        `${gameState.seed}-newcontact-${gameState.currentWeek}-${gameState.currentSeason}`,
      );
      if (contactRng.nextFloat(0, 1) < 0.3) {
        const contactTypes: Array<"agent" | "scout" | "clubStaff" | "journalist" | "academyCoach" | "sportingDirector"> = [
          "agent", "scout", "clubStaff", "journalist", "academyCoach", "sportingDirector",
        ];
        const type = contactRng.pick(contactTypes);
        const orgs = ["Base Soccer", "Elite Scouting", "Global Football Network", "Football Insights"];
        const org = contactRng.pick(orgs);
        const newContact = generateContactForType(
          contactRng,
          type,
          org,
          getScoutHome(gameState.scout),
        );
        const knownIds = seedKnownPlayersForContact(
          contactRng,
          newContact,
          stateWithScheduleApplied,
        );
        const contactWithPlayers = { ...newContact, knownPlayerIds: knownIds };
        const contactMsg: InboxMessage = {
          id: `new-contact-${newContact.id}`,
          week: stateWithScheduleApplied.currentWeek,
          season: stateWithScheduleApplied.currentSeason,
          type: "event" as const,
          title: `New Contact: ${newContact.name}`,
          body: `You've been introduced to ${newContact.name} (${type}) from ${org}${newContact.region ? `, covering ${newContact.region}` : ""}. They know ${knownIds.length} player${knownIds.length !== 1 ? "s" : ""} and appear in your contact network.`,
          read: false,
          actionRequired: false,
          relatedId: newContact.id,
          relatedEntityType: "contact" as const,
        };
        stateWithScheduleApplied = {
          ...stateWithScheduleApplied,
          contacts: { ...stateWithScheduleApplied.contacts, [newContact.id]: contactWithPlayers },
          inbox: [...stateWithScheduleApplied.inbox, contactMsg],
        };
      }
    }

    // ── Process cross-country transfers (only when multiple countries are active) ──
    // ── Process international system — generate/expire assignments periodically ──
    const internationalRng = createRNG(
      `${gameState.seed}-international-${gameState.currentWeek}-${gameState.currentSeason}`,
    );
    const internationalResult = processInternationalWeek(
      internationalRng,
      stateWithScheduleApplied.scout,
      stateWithScheduleApplied,
      stateWithScheduleApplied.internationalAssignments,
    );

    // Surface new international assignments as inbox messages so the player is notified
    const retainedAssignments = stateWithScheduleApplied.internationalAssignments.filter(
      (assignment) => !internationalResult.expiredAssignmentIds.includes(assignment.id),
    );
    const updatedAssignments = [...retainedAssignments, ...internationalResult.newAssignments];
    let stateWithInternational = {
      ...stateWithScheduleApplied,
      internationalAssignments: updatedAssignments,
    };
    if (internationalResult.newAssignments.length > 0) {
      const newMessages: InboxMessage[] = internationalResult.newAssignments.map((assignment) => ({
        id: `assignment-${assignment.id}`,
        week: stateWithScheduleApplied.currentWeek,
        season: stateWithScheduleApplied.currentSeason,
        type: "assignment" as const,
        title: `International Assignment: ${assignment.country}`,
        body: assignment.description,
        read: false,
        actionRequired: true,
        relatedId: assignment.id,
        relatedEntityType: "assignment" as const,
      }));
      stateWithInternational = {
        ...stateWithInternational,
        inbox: [...stateWithScheduleApplied.inbox, ...newMessages],
      };
    }

    // ── Phase 2: Finance, Rivals, Narrative Events, Tools ──────────────────

    let stateWithPhase2 = stateWithInternational;

    // 1. Process finances (only acts on weeks that are multiples of 4)
    //    Difficulty modifiers adjust income and expenses.
    if (stateWithPhase2.finances) {
      const financeRng = createRNG(
        `${gameState.seed}-finance-${gameState.currentWeek}-${gameState.currentSeason}`,
      );
      void financeRng; // seed is consumed for determinism; finance is pure math
      // Migrate old saves that lack the new loans/starterBonus fields
      const existingBonus = stateWithPhase2.finances.starterBonus ?? { firstReportBonusUsed: false, firstPlacementBonusUsed: false, starterStipendWeeksRemaining: 0 };
      const migratedFinances = {
        ...stateWithPhase2.finances,
        loans: stateWithPhase2.finances.loans ?? [],
        starterBonus: {
          ...existingBonus,
          // Existing saves without stipend tracking are treated as exhausted
          starterStipendWeeksRemaining: existingBonus.starterStipendWeeksRemaining ?? 0,
        },
      };
      const rawFinances = processWeeklyFinances(
        migratedFinances,
        stateWithPhase2.scout,
        stateWithPhase2.currentWeek,
        stateWithPhase2.currentSeason,
      );

      // Apply starter stipend (guaranteed income for first 4 weeks)
      const updatedFinances = processStarterStipend(
        rawFinances,
        stateWithPhase2.difficulty,
        stateWithPhase2.currentWeek,
        stateWithPhase2.currentSeason,
      );

      // Apply difficulty multipliers to income/expenses on pay weeks
      const diffMods = getDifficultyModifiers(stateWithPhase2.difficulty);
      if (stateWithPhase2.currentWeek % 4 === 0) {
        const baseIncome = updatedFinances.monthlyIncome;
        // Contractual debt service is not an operating expense and must not be
        // charged again through the difficulty expense multiplier.
        const baseExpenseTotal = sumOperatingExpenses(updatedFinances.expenses);
        // Compute the difference caused by difficulty multipliers
        const incomeAdjustment = Math.round(baseIncome * (diffMods.incomeMultiplier - 1));
        const expenseAdjustment = Math.round(baseExpenseTotal * (diffMods.expenseMultiplier - 1));
        const adjustedFinances = applyDifficultyFinancialAdjustments(
          updatedFinances,
          incomeAdjustment,
          expenseAdjustment,
          stateWithPhase2.currentWeek,
          stateWithPhase2.currentSeason,
        );
        stateWithPhase2 = { ...stateWithPhase2, finances: adjustedFinances };
      } else {
        stateWithPhase2 = { ...stateWithPhase2, finances: updatedFinances };
      }
    }

    // 1a. Economics, marketplace, agency, and career-business processing
    stateWithPhase2 = processWeeklyEconomy(stateWithPhase2, gameState);

    // 1aa. F14: Process weekly infrastructure costs and assistant scout work
    {
      stateWithPhase2 = processWeeklyInfrastructureCosts(stateWithPhase2);
      const asstRng = createRNG(
        `${gameState.seed}-asst-${gameState.currentWeek}-${gameState.currentSeason}`,
      );
      stateWithPhase2 = processAssistantScoutWeek(stateWithPhase2, asstRng);
    }

    // 1b. Transfer window urgency — generate urgent assessments during open windows
    // Youth scouts discover talent organically; they don't receive club-driven
    // urgent assessment requests for signed players.
    const activeTransferWindow = stateWithPhase2.transferWindow;
    if (activeTransferWindow?.isOpen && stateWithPhase2.scout.primarySpecialization !== "youth") {
      const twRng = createRNG(
        `${gameState.seed}-tw-${gameState.currentWeek}-${gameState.currentSeason}`,
      );
      const urgent = generateUrgentAssessment(twRng, stateWithPhase2);
      if (urgent) {
        const urgentPlayer = stateWithPhase2.players[urgent.playerId];
        const urgentMsg: InboxMessage = {
          id: `urgent-${urgent.id}`,
          week: stateWithPhase2.currentWeek,
          season: stateWithPhase2.currentSeason,
          type: "assignment" as const,
          title: "Urgent Assessment Request",
          body: `${urgent.requestedBy} needs a report on ${urgentPlayer ? `${urgentPlayer.firstName} ${urgentPlayer.lastName}` : "a player"} by day ${urgent.deadline}. Reward: +${urgent.reputationReward} reputation.`,
          read: false,
          actionRequired: true,
          relatedId: urgent.playerId,
          relatedEntityType: "player" as const,
        };
        stateWithPhase2 = {
          ...stateWithPhase2,
          inbox: [...stateWithPhase2.inbox, urgentMsg],
        };
      }
      if (isDeadlineDayPressure(activeTransferWindow, stateWithPhase2.currentWeek)) {
        const deadlineMsg: InboxMessage = {
          id: `deadline-w${stateWithPhase2.currentWeek}-s${stateWithPhase2.currentSeason}`,
          week: stateWithPhase2.currentWeek,
          season: stateWithPhase2.currentSeason,
          type: "news" as const,
          title: "Transfer Deadline Approaching",
          body: "The transfer window closes this week. Clubs are making final decisions — file any outstanding reports now.",
          read: false,
          actionRequired: false,
        };
        stateWithPhase2 = {
          ...stateWithPhase2,
          inbox: [...stateWithPhase2.inbox, deadlineMsg],
        };
      }
    }

    // 2. Process the persistent organization layer before individual rivals.
    // The resulting pressure is ephemeral for this week, while the action,
    // agenda progression, opportunity, and fact all survive save/load.
    const organizationBase = migrateRivalOrganizationState(
      stateWithPhase2.seed,
      stateWithPhase2.rivalScouts,
      stateWithPhase2.rivalOrganizationState,
      Math.max(1, stateWithPhase2.currentSeason),
    );
    const organizationResult = processRivalOrganizationWeek(
      organizationBase,
      {
        rootSeed: stateWithPhase2.seed,
        season: stateWithPhase2.currentSeason,
        week: stateWithPhase2.currentWeek,
        seasonLength: getSeasonLength(
          stateWithPhase2.fixtures,
          stateWithPhase2.currentSeason,
        ),
        rivalScouts: stateWithPhase2.rivalScouts,
      },
    );
    const organizationFacts = Object.fromEntries(
      organizationResult.facts.map((fact) => [fact.id, fact]),
    );
    stateWithPhase2 = {
      ...stateWithPhase2,
      rivalOrganizationState: organizationResult.state,
      consequenceState: {
        ...stateWithPhase2.consequenceState,
        facts: {
          ...stateWithPhase2.consequenceState.facts,
          ...organizationFacts,
        },
      },
      inbox: [...stateWithPhase2.inbox, ...organizationResult.messages],
    };

    // 2a. Process individual rival scouts under this week's organization pressure.
    const rivalRng = createRNG(
      `${gameState.seed}-rivals-${gameState.currentWeek}-${gameState.currentSeason}`,
    );
    const rivalModifiers = getRunSimulationModifiers(stateWithPhase2.runManifest);
    const getRivalConditionPressure = (
      rival: (typeof stateWithPhase2.rivalScouts)[string],
      playerId?: string,
    ): number => {
      const playerCountry = playerId
        ? getPlayerScoutingCountry(stateWithPhase2, playerId)
        : undefined;
      const rivalClub = rival.clubId ? stateWithPhase2.clubs[rival.clubId] : undefined;
      const rivalCountry = rivalClub
        ? stateWithPhase2.leagues[rivalClub.leagueId]?.country
        : undefined;
      return getWorldConditionModifiers(
        stateWithPhase2,
        playerCountry ?? rivalCountry,
      ).rivalPressureMultiplier;
    };
    const rivalResult = processRivalScoutWeek(rivalRng, stateWithPhase2, {
      discoveryChanceMultiplier:
        rivalModifiers.rivalDiscoveryChanceMultiplier
        * organizationResult.pressure.discoveryChanceMultiplier,
      poachChanceMultiplier:
        rivalModifiers.rivalPoachChanceMultiplier
        * organizationResult.pressure.poachChanceMultiplier,
      signingChanceMultiplier:
        rivalModifiers.rivalSigningChanceMultiplier
        * organizationResult.pressure.signingChanceMultiplier,
      contextualPressureMultiplier: getRivalConditionPressure,
    });
    let rivalInboxMessages: InboxMessage[] = [...rivalResult.newMessages];
    if (rivalResult.poachWarnings.length > 0) {
      const poachMessages = rivalResult.poachWarnings.map((warning) => {
        const rivalScout = rivalResult.updatedRivals[warning.rivalId];
        const player = stateWithPhase2.players[warning.playerId];
        const rivalName = rivalScout?.name ?? "A rival scout";
        const playerName = player
          ? `${player.firstName} ${player.lastName}`
          : "a player you have reported on";
        return {
          id: `rival-poach-${warning.rivalId}-${warning.playerId}-w${stateWithPhase2.currentWeek}`,
          week: stateWithPhase2.currentWeek,
          season: stateWithPhase2.currentSeason,
          type: "event" as const,
          title: "Rival Scout Alert",
          body: `${rivalName} is now tracking ${playerName} — a player you have already reported on. Consider submitting a stronger recommendation before they act.`,
          read: false,
          actionRequired: false,
          relatedId: warning.playerId,
          relatedEntityType: "player" as const,
        };
      });
      rivalInboxMessages = [...rivalInboxMessages, ...poachMessages];
    }
    // Generate contact intelligence about rival movements (F8)
    const intelMessages = generateRivalIntelligence(rivalRng, stateWithPhase2, stateWithPhase2.contacts);
    rivalInboxMessages = [...rivalInboxMessages, ...intelMessages];
    // Track rival activities (F8), capping at 50 entries
    const existingActivities = stateWithPhase2.rivalActivities ?? [];
    const mergedActivities = [...existingActivities, ...rivalResult.newActivities].slice(-50);
    stateWithPhase2 = {
      ...stateWithPhase2,
      rivalScouts: rivalResult.updatedRivals,
      rivalActivities: mergedActivities,
      inbox: [...stateWithPhase2.inbox, ...rivalInboxMessages],
    };

    // 2b. Process poach signings — generate rivalPoachBid narrative events
    // Youth rivals compete for the same unsigned prospects using only public
    // buzz, visibility, venue exposure, and known interest. Successful claims
    // go through the canonical movement ledger and displace pending pitches.
    let youthRivalLifecycle = getLifecycleWorld(stateWithPhase2);
    let youthRivalScouts = { ...stateWithPhase2.rivalScouts };
    let youthRivalPool = { ...stateWithPhase2.unsignedYouth };
    let youthRivalActivities = [...(stateWithPhase2.rivalActivities ?? [])];
    let youthRivalInbox = [...stateWithPhase2.inbox];
    let youthRivalPlacementReports = { ...stateWithPhase2.placementReports };
    let youthRivalCases = { ...stateWithPhase2.scoutingCases };
    let youthRivalDeliveries = { ...stateWithPhase2.reportDeliveries };
    let youthRivalDecisions = { ...stateWithPhase2.clubDecisions };
    let youthRivalBriefs = { ...stateWithPhase2.youthRecruitmentBriefs };

    for (const rival of Object.values(youthRivalScouts).filter(
      (candidate) => candidate.specialization === "youth",
    )) {
      const target = selectYouthRivalTarget(
        createRNG(`${stateWithPhase2.seed}-youth-rival-target-${rival.id}-s${stateWithPhase2.currentSeason}w${stateWithPhase2.currentWeek}`),
        rival,
        youthRivalPool,
      );
      if (!target) continue;
      const youth = youthRivalPool[target.youthId];
      if (!youth) continue;
      const scoutHasInterest = youth.discoveredBy.includes(stateWithPhase2.scout.id)
        || Object.values(stateWithPhase2.observations).some(
          (observation) => observation.playerId === youth.player.id,
        )
        || Object.values(stateWithPhase2.reports).some(
          (report) => report.playerId === youth.player.id,
        );
      const pressureResult = advanceYouthRivalPressure({
        rival,
        youth,
        week: stateWithPhase2.currentWeek,
        season: stateWithPhase2.currentSeason,
        scoutHasInterest,
        organizationProgressBonus:
          organizationResult.pressure.sourceOrganizationId
          && organizationResult.state.organizations[
            organizationResult.pressure.sourceOrganizationId
          ]?.memberRivalIds.includes(rival.id)
            ? organizationResult.pressure.youthProgressBonus
            : 0,
        existingActivities: youthRivalActivities,
        existingMessages: youthRivalInbox,
      });
      youthRivalScouts[rival.id] = pressureResult.updatedRival;
      youthRivalPool[youth.id] = pressureResult.updatedYouth;
      youthRivalActivities = pressureResult.activities;
      youthRivalInbox = pressureResult.messages;

      for (const brief of Object.values(youthRivalBriefs)) {
        if (
          brief.status === "open"
          && (
            brief.requiredPositions.includes(youth.player.position)
            || youth.player.secondaryPositions.some((position) => brief.requiredPositions.includes(position))
          )
          && pressureResult.pressure > brief.competitionPressure
        ) {
          youthRivalBriefs[brief.id] = {
            ...brief,
            competitionPressure: pressureResult.pressure,
          };
        }
      }

      const claim = resolveRivalYouthClaim(
        createRNG(`${stateWithPhase2.seed}-youth-rival-claim-${rival.id}-${youth.id}-s${stateWithPhase2.currentSeason}w${stateWithPhase2.currentWeek}`),
        {
          rival: pressureResult.updatedRival,
          youth: pressureResult.updatedYouth,
          week: stateWithPhase2.currentWeek,
          season: stateWithPhase2.currentSeason,
          scoutHasInterest,
          placementReports: youthRivalPlacementReports,
          existingActivities: youthRivalActivities,
          existingMessages: youthRivalInbox,
        },
      );
      if (!claim.success || !claim.signedPlayer) continue;

      const detachedPlayer = {
        ...youth.player,
        clubId: "",
        contractClubId: undefined,
        contractExpiry: 0,
        wage: 0,
      };
      const movement = resolvePlayerMovements(
        {
          ...youthRivalLifecycle,
          players: {
            ...youthRivalLifecycle.players,
            [detachedPlayer.id]: detachedPlayer,
          },
        },
        [{
          type: "youthSigning",
          playerId: detachedPlayer.id,
          toClubId: rival.clubId,
          contractLength: 3,
          wage: Math.max(100, rival.quality * 150),
          reason: `Rival youth recommendation by ${rival.name}`,
        }],
        stateWithPhase2.currentWeek,
        stateWithPhase2.currentSeason,
        getSeasonLength(stateWithPhase2.fixtures, stateWithPhase2.currentSeason),
      );
      if (movement.applied.length === 0) continue;
      youthRivalLifecycle = movement.state;
      const movedPlayer = youthRivalLifecycle.players[detachedPlayer.id];
      youthRivalPool[youth.id] = {
        ...claim.updatedYouth,
        ...(movedPlayer ? { player: movedPlayer } : {}),
      };
      youthRivalScouts[rival.id] = claim.updatedRival;
      youthRivalActivities = claim.activities;
      youthRivalInbox = claim.messages;

      for (const placementReportId of claim.displacedPlacementReportIds) {
        const placementReport = youthRivalPlacementReports[placementReportId];
        if (!placementReport) continue;
        youthRivalPlacementReports[placementReportId] = {
          ...placementReport,
          clubResponse: "rejected",
        };
        if (placementReport.deliveryId && !youthRivalDeliveries[placementReport.deliveryId]?.decisionId) {
          const resolved = resolveClubDecision({
            scoutingCases: youthRivalCases,
            reportDeliveries: youthRivalDeliveries,
            clubDecisions: youthRivalDecisions,
            deliveryId: placementReport.deliveryId,
            outcome: "rejected",
            week: stateWithPhase2.currentWeek,
            season: stateWithPhase2.currentSeason,
            reason: `${rival.name} moved first and the prospect is no longer available.`,
            reasons: [
              "A rival recruitment team completed the youth signing first.",
              "Additional certainty came at the cost of the opportunity.",
            ],
          });
          youthRivalCases = resolved.scoutingCases;
          youthRivalDeliveries = resolved.reportDeliveries;
          youthRivalDecisions = resolved.clubDecisions;
          youthRivalPlacementReports[placementReportId] = {
            ...youthRivalPlacementReports[placementReportId],
            decisionId: resolved.decision?.id,
          };
        } else if (placementReport.caseId && youthRivalCases[placementReport.caseId]) {
          youthRivalCases[placementReport.caseId] = {
            ...youthRivalCases[placementReport.caseId],
            status: "closed",
            lastUpdatedWeek: stateWithPhase2.currentWeek,
            lastUpdatedSeason: stateWithPhase2.currentSeason,
          };
        }
      }
    }

    stateWithPhase2 = {
      ...withLifecycleWorld(stateWithPhase2, youthRivalLifecycle),
      rivalScouts: youthRivalScouts,
      unsignedYouth: youthRivalPool,
      rivalActivities: youthRivalActivities.slice(-50),
      inbox: youthRivalInbox,
      placementReports: youthRivalPlacementReports,
      scoutingCases: youthRivalCases,
      reportDeliveries: youthRivalDeliveries,
      clubDecisions: youthRivalDecisions,
      youthRecruitmentBriefs: youthRivalBriefs,
    };

    if (rivalResult.poachSignings && rivalResult.poachSignings.length > 0) {
      const poachNarrativeEvents: NarrativeEvent[] = [];
      const poachInboxMessages: InboxMessage[] = [];

      for (const signing of rivalResult.poachSignings) {
        const rivalScout = stateWithPhase2.rivalScouts[signing.rivalId];
        const player = stateWithPhase2.players[signing.playerId];
        if (!rivalScout || !player) continue;

        const resolvedSigning = resolveRivalSigningAttempt(
          getLifecycleWorld(stateWithPhase2),
          rivalScout,
          player.id,
          stateWithPhase2.currentWeek,
          stateWithPhase2.currentSeason,
        );
        if (!resolvedSigning.success) continue;

        stateWithPhase2 = withLifecycleWorld(
          stateWithPhase2,
          resolvedSigning.lifecycle,
        );
        const signedPlayer = stateWithPhase2.players[player.id];
        if (!signedPlayer) continue;

        const rivalName = rivalScout.name;
        const playerName = `${signedPlayer.firstName} ${signedPlayer.lastName}`;
        const rivalClub = stateWithPhase2.clubs[rivalScout.clubId];
        const eligibility = getPoachCounterBidEligibility(
          getLifecycleWorld(stateWithPhase2),
          rivalScout,
          signedPlayer,
          stateWithPhase2.scout,
        );
        const cleanedRival = {
          ...rivalScout,
          targetPlayerIds: rivalScout.targetPlayerIds.filter((id) => id !== player.id),
          competingForPlayers: rivalScout.competingForPlayers.filter((id) => id !== player.id),
          currentTarget: rivalScout.currentTarget === player.id
            ? undefined
            : rivalScout.currentTarget,
        };
        stateWithPhase2 = {
          ...stateWithPhase2,
          rivalScouts: {
            ...stateWithPhase2.rivalScouts,
            [rivalScout.id]: cleanedRival,
          },
          rivalActivities: [
            ...(stateWithPhase2.rivalActivities ?? []),
            {
              rivalId: rivalScout.id,
              type: "playerSigned" as const,
              playerId: player.id,
              week: stateWithPhase2.currentWeek,
              season: stateWithPhase2.currentSeason,
            },
          ].slice(-50),
        };

        const eventId = `poach-bid-${signing.rivalId}-${signing.playerId}-w${stateWithPhase2.currentWeek}`;

        if (!eligibility.eligible) {
          stateWithPhase2 = {
            ...stateWithPhase2,
            rivalScouts: {
              ...stateWithPhase2.rivalScouts,
              [rivalScout.id]: {
                ...cleanedRival,
                winsAgainstPlayer: (cleanedRival.winsAgainstPlayer ?? 0) + 1,
              },
            },
          };
          poachInboxMessages.push({
            id: `rival-signing-${eventId}`,
            week: stateWithPhase2.currentWeek,
            season: stateWithPhase2.currentSeason,
            type: "event" as const,
            title: `Player Signed by ${rivalClub?.name ?? "Rival Club"}`,
            body: `${rivalClub?.name ?? "The rival club"} completed the signing of ${playerName} following ${rivalName}'s recommendation. ${eligibility.reason ?? "Your club cannot submit a valid counter-bid."}`,
            read: false,
            actionRequired: false,
            relatedId: player.id,
            relatedEntityType: "player" as const,
          });
          continue;
        }

        const narrativeEvent: NarrativeEvent = {
          id: eventId,
          type: "rivalPoachBid",
          week: stateWithPhase2.currentWeek,
          season: stateWithPhase2.currentSeason,
          title: `Rival Signing: ${playerName}`,
          description:
            `${rivalName} has signed ${playerName} — a player you previously reported on. ` +
            `Your club can attempt a ${eligibility.cost.toLocaleString()} transfer or concede the player.`,
          relatedIds: [signing.playerId, signing.rivalId],
          acknowledged: false,
          choices: [
            { label: `Counter-Bid (${eligibility.cost.toLocaleString()})`, effect: "counterBid" },
            { label: "Concede", effect: "concede" },
          ],
          selectedChoice: undefined,
        };

        poachNarrativeEvents.push(narrativeEvent);

        poachInboxMessages.push({
          id: `narrative-${eventId}`,
          week: stateWithPhase2.currentWeek,
          season: stateWithPhase2.currentSeason,
          type: "event" as const,
          title: narrativeEvent.title,
          body: narrativeEvent.description,
          read: false,
          actionRequired: true,
          relatedId: narrativeEvent.id,
        });
      }

      stateWithPhase2 = registerNarrativeDecisions({
        ...stateWithPhase2,
        narrativeEvents: [...stateWithPhase2.narrativeEvents, ...poachNarrativeEvents],
        inbox: [...stateWithPhase2.inbox, ...poachInboxMessages],
      }, poachNarrativeEvents);
    }

    // 3. Generate narrative event (12% weekly chance, with F2 chain support)
    const eventRng = createRNG(
      `${gameState.runManifest.rootSeed}-events-${gameState.currentWeek}-${gameState.currentSeason}`,
    );
    // Ensure eventChains is initialized for chain processing
    if (!stateWithPhase2.eventChains) {
      stateWithPhase2 = { ...stateWithPhase2, eventChains: [] };
    }
    const weeklyResult = directWeeklyNarrativeEvent(eventRng, stateWithPhase2);
    stateWithPhase2 = {
      ...stateWithPhase2,
      eventDirector: weeklyResult.director,
    };
    const narrativeEvent = weeklyResult.event;

    if (narrativeEvent) {
      const eventInboxMessage: InboxMessage = {
        id: `narrative-${narrativeEvent.id}`,
        week: stateWithPhase2.currentWeek,
        season: stateWithPhase2.currentSeason,
        type: "event" as const,
        title: narrativeEvent.title,
        body: narrativeEvent.description,
        read: false,
        actionRequired: (narrativeEvent.choices?.length ?? 0) > 0,
        relatedId: narrativeEvent.id,
        relatedEntityType: "narrative" as const,
      };
      stateWithPhase2 = registerNarrativeDecisions({
        ...stateWithPhase2,
        narrativeEvents: [...stateWithPhase2.narrativeEvents, narrativeEvent],
        inbox: [...stateWithPhase2.inbox, eventInboxMessage],
      }, [narrativeEvent]);
    }

    // F2: Update event chains if a chain was advanced or started
    if (weeklyResult.advancedChain) {
      const updatedChains = (stateWithPhase2.eventChains ?? []).map((c) =>
        c.id === weeklyResult.advancedChain!.chain.id
          ? weeklyResult.advancedChain!.chain
          : c,
      );
      stateWithPhase2 = { ...stateWithPhase2, eventChains: updatedChains };
    }
    if (weeklyResult.newChain) {
      stateWithPhase2 = {
        ...stateWithPhase2,
        eventChains: [...(stateWithPhase2.eventChains ?? []), weeklyResult.newChain.chain],
      };
    }

    // 3b. Storyline system — trigger new storylines and advance active ones
    const storylineRng = createRNG(
      `${gameState.runManifest.rootSeed}-storylines-${gameState.currentWeek}-${gameState.currentSeason}`,
    );

    // Attempt to start a new storyline (5% weekly chance, max 2 active)
    const storylineModifiers = getRunSimulationModifiers(stateWithPhase2.runManifest);
    const newStoryline = checkStorylineTriggers(
      stateWithPhase2,
      storylineRng,
      0.05 * storylineModifiers.storylineChanceMultiplier,
    );
    if (newStoryline) {
      stateWithPhase2 = {
        ...stateWithPhase2,
        activeStorylines: [...stateWithPhase2.activeStorylines, newStoryline],
      };
    }

    // Advance all active storylines that are due this week
    const { events: storylineEvents, updatedStorylines } = processActiveStorylines(
      stateWithPhase2,
      storylineRng,
    );

    if (updatedStorylines !== stateWithPhase2.activeStorylines || storylineEvents.length > 0) {
      const storylineInboxMessages: InboxMessage[] = storylineEvents.map((evt) => ({
        id: `narrative-${evt.id}`,
        week: stateWithPhase2.currentWeek,
        season: stateWithPhase2.currentSeason,
        type: "event" as const,
        title: evt.title,
        body: evt.description,
        read: false,
        actionRequired: (evt.choices?.length ?? 0) > 0,
        relatedId: evt.id,
        relatedEntityType: "narrative" as const,
      }));

      stateWithPhase2 = registerNarrativeDecisions({
        ...stateWithPhase2,
        narrativeEvents: [...stateWithPhase2.narrativeEvents, ...storylineEvents],
        inbox: [...stateWithPhase2.inbox, ...storylineInboxMessages],
        activeStorylines: updatedStorylines,
      }, storylineEvents);
    }

    // 4. Check for newly unlocked tools
    const toolRng = createRNG(
      `${gameState.seed}-tools-${gameState.currentWeek}-${gameState.currentSeason}`,
    );
    void toolRng; // deterministic seed; unlock check is pure
    const newlyUnlocked = checkToolUnlocks(stateWithPhase2.scout, stateWithPhase2.unlockedTools);
    if (newlyUnlocked.length > 0) {
      const toolMessages: InboxMessage[] = newlyUnlocked.map((toolId) => ({
        id: `tool-unlocked-${toolId}-w${stateWithPhase2.currentWeek}`,
        week: stateWithPhase2.currentWeek,
        season: stateWithPhase2.currentSeason,
        type: "event" as const,
        title: "New Tool Unlocked",
        body: `You have unlocked a new scouting tool: ${toolId}. Check your tools panel to see the bonuses it provides.`,
        read: false,
        actionRequired: false,
        relatedId: toolId,
        relatedEntityType: "tool" as const,
      }));
      stateWithPhase2 = {
        ...stateWithPhase2,
        unlockedTools: [...stateWithPhase2.unlockedTools, ...newlyUnlocked],
        inbox: [...stateWithPhase2.inbox, ...toolMessages],
      };
    }

    // ── First-Team Weekly System Processing ─────────────────────────────────

    if (stateWithPhase2.scout.primarySpecialization === "firstTeam") {
      // Process any pending trial ClubResponses that need resolution this week
      const pendingTrials = stateWithPhase2.clubResponses.filter(
        (resp) => resp.response === "trial",
      );
      if (pendingTrials.length > 0 && stateWithPhase2.scout.currentClubId) {
        const trialResolutionRng = createRNG(
          `${gameState.seed}-trialresolve-${gameState.currentWeek}-${gameState.currentSeason}`,
        );
        const trialClub = stateWithPhase2.clubs[stateWithPhase2.scout.currentClubId];
        if (trialClub) {
          const resolvedResponses = stateWithPhase2.clubResponses.map((resp) => {
            if (resp.response !== "trial") return resp;
            // Only resolve trials that have been pending for at least 1 week
            const player = stateWithPhase2.players[resp.reportId] ??
              Object.values(stateWithPhase2.players).find((p) =>
                stateWithPhase2.reports[resp.reportId]?.playerId === p.id,
              );
            if (!player) return resp;
            const outcome = processTrialOutcome(
              trialResolutionRng,
              player,
              trialClub,
              stateWithPhase2.players,
            );
            return { ...resp, response: outcome };
          });
          stateWithPhase2 = { ...stateWithPhase2, clubResponses: resolvedResponses };
        }
      }
    }

    // ── Data Scout Weekly System Processing ─────────────────────────────────

    if (stateWithPhase2.scout.primarySpecialization === "data") {
      // 1. Generate passive analyst reports for assigned analysts
      if (stateWithPhase2.dataAnalysts.length > 0) {
        const passiveReportRng = createRNG(
          `${gameState.seed}-passivereports-${gameState.currentWeek}-${gameState.currentSeason}`,
        );
        const updatedAnalysts = [...stateWithPhase2.dataAnalysts];
        const updatedAnalystReports = { ...stateWithPhase2.analystReports };
        const hadMeetingThisWeek = weekResult.analyticsTeamMeetingsExecuted > 0;

        for (let i = 0; i < updatedAnalysts.length; i++) {
          const analyst = updatedAnalysts[i];
          if (!analyst.assignedLeagueId) {
            // Analyst is unassigned — apply idle morale decay
            updatedAnalysts[i] = updateAnalystMorale(analyst, { ignored: true });
            continue;
          }
          const analystLeague = stateWithPhase2.leagues[analyst.assignedLeagueId];
          if (!analystLeague) continue;

          const reportId = `passive-${analyst.id}-w${stateWithPhase2.currentWeek}-s${stateWithPhase2.currentSeason}`;
          // Only generate if no meeting report was already created for this analyst this week
          if (!updatedAnalystReports[reportId]) {
            const report = generateAnalystReport(
              passiveReportRng,
              analyst,
              analystLeague,
              stateWithPhase2.players,
              stateWithPhase2.currentSeason,
              stateWithPhase2.currentWeek,
              reportId,
            );
            updatedAnalystReports[reportId] = report;
          }

          // Update morale: decay if no meeting held this week
          if (!hadMeetingThisWeek) {
            updatedAnalysts[i] = updateAnalystMorale(analyst, { ignored: false });
          }
        }

        stateWithPhase2 = {
          ...stateWithPhase2,
          dataAnalysts: updatedAnalysts,
          analystReports: updatedAnalystReports,
        };
      }

      // 2. Resolve predictions whose deadline season has passed
      if (stateWithPhase2.predictions.length > 0) {
        const predRng = createRNG(
          `${gameState.seed}-predresolve-${gameState.currentWeek}-${gameState.currentSeason}`,
        );
        const faPlayerIds = new Set(
          (stateWithPhase2.freeAgentPool?.agents ?? []).map((a) => a.playerId),
        );
        const predAccuracyBonus = weekEquipBonuses?.predictionAccuracy ?? 0;
        const resolvedPredictions = resolvePredictions(
          stateWithPhase2.predictions,
          stateWithPhase2.players,
          stateWithPhase2.currentSeason,
          stateWithPhase2.currentWeek,
          predRng,
          faPlayerIds,
          predAccuracyBonus,
        );
        if (resolvedPredictions.some((p, i) => p !== stateWithPhase2.predictions[i])) {
          stateWithPhase2 = { ...stateWithPhase2, predictions: resolvedPredictions };
        }
      }
    }

    // ── Core game loop tick ─────────────────────────────────────────────────

    // Reconcile assignment evidence from this abroad week before the date
    // advances. The same canonical IDs are also reconciled by interactive
    // actions, so manual, batch, retries, and save/reload stay equivalent.
    stateWithPhase2 = synchronizeInternationalAssignmentProgress(stateWithPhase2);
    const tickResult = processWeeklyTick(stateWithPhase2, rng);
    let newState = advanceWeekEngine(stateWithPhase2, tickResult);
    newState = processNPCDelegations(newState, rng).state;
    newState = processInternationalTravelLifecycle(newState);
    newState = {
      ...newState,
      weeklyStrategy: recordWeeklyStrategyOutcome(
        newState.weeklyStrategy,
        gameState.currentWeek,
        gameState.currentSeason,
        simChoices?.dayResults ?? [],
      ),
    };

    const consequenceDate = {
      week: newState.currentWeek,
      season: newState.currentSeason,
    };
    const consequenceSeasonLength = getSeasonLength(
      newState.fixtures,
      newState.currentSeason,
    );
    const expiredDecisions = expireDueDecisions(
      newState.consequenceState,
      consequenceDate,
      consequenceSeasonLength,
    );
    const expiredDecisionState = synchronizeConsequenceMetrics(
      newState,
      expiredDecisions.state,
    );
    newState = projectExpiredNarrativeDefaults(
      { ...newState, consequenceState: expiredDecisionState },
      expiredDecisions.expiredDecisionIds,
    );
    const synchronizedConsequenceState = synchronizeConsequenceMetrics(
      newState,
      newState.consequenceState,
    );
    const processedConsequences = processDueConsequences(
      synchronizedConsequenceState,
      consequenceDate,
      consequenceSeasonLength,
    );
    const maintainedConsequences = maintainConsequenceLifecycle(
      processedConsequences.state,
      consequenceDate,
      consequenceSeasonLength,
    );
    const consequenceOutcomeMessages: InboxMessage[] = processedConsequences
      .appliedConsequenceIds
      .flatMap((consequenceId) => {
        const consequence = processedConsequences.state.consequences[consequenceId];
        if (!consequence?.tags.includes("turning-point")) return [];
        const success = consequence.tags.includes("crossroads-success");
        const reputationEffect = consequence.effects.find((effect) =>
          effect.type === "adjustMetric" && effect.metricKey === "scout:reputation",
        );
        const delta = reputationEffect?.type === "adjustMetric"
          ? reputationEffect.delta
          : 0;
        return [{
          id: `consequence-outcome-${consequence.id}`,
          week: consequenceDate.week,
          season: consequenceDate.season,
          type: "feedback" as const,
          title: success
            ? "Career Crossroads: Vindicated"
            : "Career Crossroads: The Risk Came Due",
          body: success
            ? `The recommendation has paid off. The football world now connects the decision to your judgment, changing your reputation by +${delta}.`
            : `The recommendation did not deliver. Because your name was attached to the call, your reputation changes by ${delta}. The result is now part of your permanent decision history.`,
          read: false,
          actionRequired: false,
          relatedId: consequence.decisionId,
          relatedEntityType: "narrative" as const,
        }];
      });
    const consequenceErrors = [
      ...(expiredDecisions.error ? [expiredDecisions.error] : []),
      ...processedConsequences.errors,
    ];
    newState = projectConsequenceMetrics({
      ...newState,
      consequenceState: maintainedConsequences.state,
      inbox: consequenceErrors.length === 0 && consequenceOutcomeMessages.length === 0
        ? newState.inbox
        : [
            ...newState.inbox,
            ...consequenceOutcomeMessages,
            ...consequenceErrors.map((error, index) => ({
              id: `consequence-error-s${newState.currentSeason}w${newState.currentWeek}-${index}`,
              week: newState.currentWeek,
              season: newState.currentSeason,
              type: "warning" as const,
              title: "A delayed consequence could not be resolved",
              body: error,
              read: false,
              actionRequired: false,
            })),
          ],
    }, maintainedConsequences.state);

    // ── B10: Link transfers to scout reports for accountability tracking ────
    // Only transfers accepted by the authoritative lifecycle resolver may
    // produce records, bonuses, placement fees, or sell-on payments. A market
    // proposal can still be rejected when a higher-priority lifecycle event
    // resolves for the same player in this tick.
    const newlyAppliedMovements = newState.playerMovementHistory.slice(
      stateWithPhase2.playerMovementHistory.length,
    );
    const appliedPermanentTransferKeys = new Set(
      newlyAppliedMovements
        .filter((movement) => movement.type === "permanentTransfer")
        .map(
          (movement) =>
            `${movement.playerId}:${movement.fromClubId ?? ""}:${movement.toClubId ?? ""}:${movement.fee ?? 0}`,
        ),
    );
    const appliedTransfers = tickResult.transfers.filter((transfer) =>
      appliedPermanentTransferKeys.has(
        `${transfer.playerId}:${transfer.fromClubId}:${transfer.toClubId}:${transfer.fee}`,
      ),
    );

    if (appliedTransfers.length > 0) {
      const transferLinkRng = createRNG(
        `${gameState.seed}-trlink-${gameState.currentWeek}-${gameState.currentSeason}`,
      );
      const existingTransferKeys = new Set(
        newState.transferRecords.map(
          (record: TransferRecord) =>
            `${record.playerId}:${record.fromClubId}:${record.toClubId}:${record.transferSeason}:${record.transferWeek}`,
        ),
      );
      const newTransferRecords = linkReportsToTransfers(
        transferLinkRng,
        appliedTransfers,
        newState.reports,
        newState.players,
        newState.scout.id,
        stateWithPhase2.currentWeek,
        stateWithPhase2.currentSeason,
        existingTransferKeys,
      );
      if (newTransferRecords.length > 0) {
        newState = {
          ...newState,
          transferRecords: [...newState.transferRecords, ...newTransferRecords],
        };
      }

      // W3d: Discovery bonus for club scouts when their reports match transfers
      // W3e: Placement fees for independent scouts when their reports match transfers
      if (newState.finances) {
        let transferFinances = newState.finances;
        const transferBonusMessages: InboxMessage[] = [];

        for (const transfer of appliedTransfers) {
          // Check if the scout has a report on this transferred player
          const matchingReport = checkPlacementFeeEligibility(
            transfer.playerId,
            newState.reports,
            newState.scout.id,
          );
          if (!matchingReport) continue;

          const transferPlayer = newState.players[transfer.playerId];
          const playerName = transferPlayer
            ? `${transferPlayer.firstName} ${transferPlayer.lastName}`
            : "a player";

          if (newState.scout.careerPath === "club") {
            // W3d: Discovery bonus for club scouts
            const discoveryBonus = calculateDiscoveryBonus(
              transfer.fee,
              newState.scout.careerTier,
              matchingReport.conviction,
            );
            if (discoveryBonus > 0) {
              transferFinances = {
                ...transferFinances,
                balance: transferFinances.balance + discoveryBonus,
                bonusRevenue: transferFinances.bonusRevenue + discoveryBonus,
                transactions: [
                  ...transferFinances.transactions,
                  {
                    week: newState.currentWeek,
                    season: newState.currentSeason,
                    amount: discoveryBonus,
                    description: `Discovery bonus (${playerName})`,
                  },
                ],
              };
              transferBonusMessages.push({
                id: `discovery-bonus-${transfer.playerId}-w${newState.currentWeek}`,
                week: newState.currentWeek,
                season: newState.currentSeason,
                type: "event" as const,
                title: "Discovery Bonus",
                body: `Your scouting report on ${playerName} contributed to a successful transfer (£${transfer.fee.toLocaleString()}). You've received a £${discoveryBonus.toLocaleString()} discovery bonus.`,
                read: false,
                actionRequired: false,
              });
            }
          } else if (newState.scout.careerPath === "independent") {
            // W3e: Placement fee for independent scouts
            const weeksAgo = gameWeeksBetween(
              newState.fixtures,
              {
                season: matchingReport.submittedSeason,
                week: matchingReport.submittedWeek,
              },
              { season: newState.currentSeason, week: newState.currentWeek },
            );
            const fee = calculatePlacementFee(
              transfer.fee,
              matchingReport,
              newState.scout,
              weeksAgo,
              false, // not exclusive
            );
            const sellOnPct = transferPlayer
              ? calculateSellOnPercentage(transferPlayer.age, matchingReport.conviction)
              : 0;

            transferFinances = triggerPlacementFee(
              transferFinances,
              fee,
              transfer.playerId,
              transfer.toClubId,
              transfer.fee,
              sellOnPct,
              newState.currentWeek,
              newState.currentSeason,
            );

            transferBonusMessages.push({
              id: `placement-fee-${transfer.playerId}-w${newState.currentWeek}`,
              week: newState.currentWeek,
              season: newState.currentSeason,
              type: "event" as const,
              title: "Placement Fee Earned",
              body: `Your scouting report on ${playerName} led to a transfer (£${transfer.fee.toLocaleString()}). You've earned a £${fee.toLocaleString()} placement fee.${sellOnPct > 0 ? ` A ${(sellOnPct * 100).toFixed(1)}% sell-on clause has been registered.` : ""}`,
              read: false,
              actionRequired: false,
            });
          }
        }

        newState = {
          ...newState,
          finances: transferFinances,
          inbox: [...newState.inbox, ...transferBonusMessages],
        };
      }

      // W3e: Process sell-on clauses from this week's transfers
      if (newState.finances && newState.finances.placementFeeRecords.length > 0) {
        const sellOnTransfers = appliedTransfers.map((t) => ({
          playerId: t.playerId,
          fee: t.fee,
        }));
        if (sellOnTransfers.length > 0) {
          const afterSellOn = processSellOnClauses(
            newState.finances,
            sellOnTransfers,
            newState.currentWeek,
            newState.currentSeason,
          );
          // Check if sell-on revenue increased
          if (afterSellOn.sellOnRevenue > newState.finances.sellOnRevenue) {
            const sellOnEarned = afterSellOn.sellOnRevenue - newState.finances.sellOnRevenue;
            newState = {
              ...newState,
              finances: afterSellOn,
              inbox: [
                ...newState.inbox,
                {
                  id: `sell-on-w${newState.currentWeek}-s${newState.currentSeason}`,
                  week: newState.currentWeek,
                  season: newState.currentSeason,
                  type: "event" as const,
                  title: "Sell-On Clause Payment",
                  body: `A player you previously placed has been transferred. You've received £${sellOnEarned.toLocaleString()} from sell-on clauses.`,
                  read: false,
                  actionRequired: false,
                },
              ],
            };
          } else {
            newState = { ...newState, finances: afterSellOn };
          }
        }
      }
    }

    // ── Process player loan system results ─────────────────────────────────
    // ── Alumni milestones → inbox messages ──────────────────────────────────
    if (tickResult.alumniMilestones && tickResult.alumniMilestones.length > 0) {
      const alumniMessages: InboxMessage[] = tickResult.alumniMilestones.map((milestone, index) => ({
        id: `msg_alumni_${milestone.type}_s${newState.currentSeason}w${newState.currentWeek}_${index}`,
        week: newState.currentWeek,
        season: newState.currentSeason,
        type: "event" as const,
        title: `Alumni Milestone: ${milestone.type.replace(/([A-Z])/g, " $1").trim()}`,
        body: milestone.description,
        read: false,
        actionRequired: false,
      }));
      newState = {
        ...newState,
        inbox: [...newState.inbox, ...alumniMessages],
      };
    }

    // ── Network: Relationship decay warnings (5b) ────────────────────────────
    // Compare pre-tick and post-tick contact states to detect first-time
    // threshold crossings. Warnings fire once per contact per threshold.
    {
      const decayWarnings: InboxMessage[] = [];
      for (const [contactId, postContact] of Object.entries(newState.contacts)) {
        const preContact = gameState.contacts[contactId];
        if (!preContact) continue;

        // Warning 1: Contact has gone dormant for the first time
        if (postContact.dormant && !preContact.dormant) {
          decayWarnings.push({
            id: `decay-dormant-${contactId}-w${newState.currentWeek}-s${newState.currentSeason}`,
            week: newState.currentWeek,
            season: newState.currentSeason,
            type: "warning" as const,
            title: `Contact Gone Dormant: ${postContact.name}`,
            body: `Your contact ${postContact.name} has gone dormant. Schedule a meeting to rebuild the relationship.`,
            read: false,
            actionRequired: false,
            relatedId: contactId,
            relatedEntityType: "contact" as const,
          });
        }

        // Warning 2: Relationship crossed below 30 (approaching dormant threshold of 20)
        if (
          preContact.relationship >= 30 &&
          postContact.relationship < 30 &&
          !postContact.dormant
        ) {
          decayWarnings.push({
            id: `decay-fading-${contactId}-w${newState.currentWeek}-s${newState.currentSeason}`,
            week: newState.currentWeek,
            season: newState.currentSeason,
            type: "warning" as const,
            title: `Relationship Fading: ${postContact.name}`,
            body: `Your relationship with ${postContact.name} is fading. Consider reaching out.`,
            read: false,
            actionRequired: false,
            relatedId: contactId,
            relatedEntityType: "contact" as const,
          });
        }
      }
      if (decayWarnings.length > 0) {
        newState = {
          ...newState,
          inbox: [...newState.inbox, ...decayWarnings],
        };
      }
    }

    // ── Monthly performance snapshot (uses post-tick state for accuracy) ────
    const monthlySnapshot = processMonthlySnapshot(newState);
    if (monthlySnapshot) {
      newState = {
        ...newState,
        performanceHistory: [...newState.performanceHistory, monthlySnapshot],
      };
    }

    // ── Deep Systems: Financial consequences, performance pulse, fatigue ────
    if (newState.finances) {
      let updatedFinances = newState.finances;
      let updatedScout = newState.scout;
      const dsMessages: InboxMessage[] = [];

      // Monthly credit score processing (every 4 weeks)
      if (newState.currentWeek % 4 === 0) {
        updatedFinances = processMonthlyCredit(updatedFinances);

        // Check retainer deliverables for failures
        const deliverableResult = checkRetainerDeliverables(
          updatedFinances,
          newState.currentWeek,
          newState.currentSeason,
        );
        updatedFinances = deliverableResult.finances;
        for (const [index, msg] of deliverableResult.messages.entries()) {
          dsMessages.push({
            id: `retainer_fail_s${newState.currentSeason}w${newState.currentWeek}_${index}`,
            week: newState.currentWeek,
            season: newState.currentSeason,
            type: "financial" as any,
            title: msg.title,
            body: msg.body,
            read: false,
            actionRequired: false,
          });
          // Reputation penalty for failed contracts
          if (msg.title === "Contract Terminated") {
            updatedScout = {
              ...updatedScout,
              reputation: Math.max(0, updatedScout.reputation - 5),
            };
          }
        }
      }

      // Financial distress processing (every week)
      const preDistressLevel = updatedFinances.distressLevel ?? "healthy";
      const preDistressTier = updatedScout.careerTier;
      const preDistressClubId = updatedScout.currentClubId;
      const distressResult = processDistress(
        updatedFinances,
        updatedScout,
        newState.currentWeek,
        newState.currentSeason,
      );
      updatedFinances = distressResult.finances;
      updatedScout = distressResult.scout;
      dsMessages.push(...distressResult.messages);

      // Performance pulse (every 4 weeks)
      if (shouldGeneratePulse(newState.currentWeek)) {
        const pulse = generatePerformancePulse(newState, updatedScout);
        const pulseResult = applyPulseConsequences(
          updatedScout,
          pulse,
          newState.currentWeek,
          newState.currentSeason,
        );
        updatedScout = pulseResult.scout;
        dsMessages.push(...pulseResult.messages);
      }

      // Fatigue hard consequences
      const fatigueResult = evaluateFatigueConsequences(
        updatedScout.fatigue,
        0, // consecutive rest weeks tracked elsewhere
      );
      if (fatigueResult.burnoutRisk) {
        const burnoutRng = createRNG(
          `${gameState.seed}-burnout-${newState.currentWeek}-${newState.currentSeason}`,
        );
        const burnout = rollBurnoutIllness(updatedScout, burnoutRng);
        if (burnout.triggered) {
          updatedScout = burnout.updatedScout;
          dsMessages.push({
            id: `burnout_${newState.currentWeek}_${newState.currentSeason}`,
            week: newState.currentWeek,
            season: newState.currentSeason,
            type: "health" as any,
            title: "Burnout Illness",
            body: `The relentless pace has caught up with you. You've fallen ill and your ${burnout.affectedAttribute} has permanently decreased by 2. Take better care of yourself.`,
            read: false,
            actionRequired: false,
          });
        }
      }
      if (fatigueResult.forcedRest) {
        dsMessages.push({
          id: `forced_rest_${newState.currentWeek}_${newState.currentSeason}`,
          week: newState.currentWeek,
          season: newState.currentSeason,
          type: "health" as any,
          title: fatigueResult.status === "burnout_risk" ? "Burnout Warning — Forced Rest" : "Exhaustion — Forced Rest",
          body: "You are too exhausted to work effectively. You must rest next week. All scheduled activities have been cleared.",
          read: false,
          actionRequired: false,
        });
      }

      newState = {
        ...newState,
        finances: updatedFinances,
        scout: updatedScout,
        inbox: [...newState.inbox, ...dsMessages],
      };
      if (
        preDistressLevel !== "bankruptcy"
        && updatedFinances.distressLevel === "bankruptcy"
      ) {
        // Bankruptcy owns the whole employment/agency transition. Do not leave
        // a former club's staff, territories, or leadership obligations alive
        // after the financial engine has moved the scout to Tier 1.
        newState = applyCareerPathTransition(newState, "independent");
        newState = openCareerSetback(newState, {
          kind: "bankruptcy",
          previousTier: preDistressTier,
          previousClubId: preDistressClubId,
        });
      }
    }

    // ── Season transition: regenerate events, fixtures, and transfer windows ─
    if (tickResult.endOfSeasonTriggered) {
      const completedSeason = stateWithPhase2.currentSeason;
      if (newState.scout.managerRelationship) {
        newState = {
          ...newState,
          scout: {
            ...newState.scout,
            managerRelationship: {
              ...newState.scout.managerRelationship,
              meetingsThisSeason: 0,
            },
          },
        };
      }
      // Process end-of-season discoveries before transitioning
      const updatedDiscoveryRecords = processSeasonDiscoveries(
        newState.discoveryRecords,
        newState.players,
        completedSeason,
      );
      newState = { ...newState, discoveryRecords: updatedDiscoveryRecords };

      // B10: Update transfer records with season data and classify outcomes
      const trUpdateRng = createRNG(
        `${gameState.seed}-trupdate-${stateWithPhase2.currentSeason}`,
      );
      const updatedTransferRecs = updateTransferRecords(
        trUpdateRng,
        newState.transferRecords,
        { ...newState.retiredPlayers, ...newState.players },
        newState.matchRatings,
        {
          fixtures: newState.fixtures,
          completedSeason,
          seasonLength: getSeasonLength(newState.fixtures, completedSeason),
          retiredPlayerIds: new Set(newState.retiredPlayerIds),
        },
      );
      newState = { ...newState, transferRecords: updatedTransferRecs };

      // B10: Apply scout accountability for newly classified outcomes
      const accountabilityResult = applyScoutAccountability(
        newState.transferRecords,
        { ...newState.retiredPlayers, ...newState.players },
        newState.clubs,
        newState.currentWeek,
        newState.currentSeason,
      );
      if (accountabilityResult.reputationDelta !== 0 || accountabilityResult.messages.length > 0) {
        const newReputation = Math.max(
          0,
          Math.min(100, newState.scout.reputation + accountabilityResult.reputationDelta),
        );
        newState = {
          ...newState,
          transferRecords: accountabilityResult.updatedRecords,
          scout: { ...newState.scout, reputation: newReputation },
          inbox: [...newState.inbox, ...accountabilityResult.messages],
        };
      }

      const seasonEndMessages: InboxMessage[] = [];
      const seasonReviewMetrics = deriveSeasonReviewMetrics(
        newState,
        completedSeason,
      );

      // ── Issue 3: Performance review ──────────────────────────────────────
      const seasonReports = Object.values(newState.reports).filter(
        (r) => r.submittedSeason === completedSeason,
      );
      const tierContext: TierReviewContext = {
        countriesScoutedThisSeason:
          seasonReviewMetrics.countriesScoutedThisSeason,
        regionsScoutedThisSeason:
          seasonReviewMetrics.regionsScoutedThisSeason,
        homeCountry: seasonReviewMetrics.homeCountry,
        npcScouts: Object.values(newState.npcScouts),
        managerRelationship: newState.scout.managerRelationship,
        boardDirectives: newState.scout.boardDirectives,
        unsignedYouthDiscovered:
          seasonReviewMetrics.unsignedYouthDiscovered,
        successfulPlacements: seasonReviewMetrics.successfulPlacements,
        alumniMilestonesThisSeason:
          seasonReviewMetrics.alumniMilestonesThisSeason,
      };
      const review = calculatePerformanceReview(
        newState.scout,
        seasonReports,
        completedSeason,
        tierContext,
      );
      newState = {
        ...newState,
        performanceReviews: [...newState.performanceReviews, review],
      };

      // An independent scout cannot be "fired" by a non-existent employer.
      // The same score becomes a formal career warning and opens a recovery
      // plan; bankruptcy remains the independent path's true terminal crisis.
      const hasActiveEmployer = Boolean(
        newState.scout.careerPath === "club" && newState.scout.currentClubId,
      );
      let effectiveReview = review.outcome === "fired" && !hasActiveEmployer
        ? { ...review, outcome: "warning" as const }
        : review;
      if (effectiveReview !== review) {
        newState = {
          ...newState,
          performanceReviews: [
            ...newState.performanceReviews.slice(0, -1),
            effectiveReview,
          ],
        };
      }

      // Ironman permadeath: if fired at end-of-season, trigger game over
      if (
        effectiveReview.outcome === "fired" &&
        getDifficultyModifiers(newState.difficulty).permadeath
      ) {
        set({
          gameState: null,
          isLoaded: false,
          currentScreen: "mainMenu",
        });
        return;
      }

      // Enforce tier gate: block promotion if required courses not completed
      if (review.outcome === "promoted" && newState.scout.careerTier < 5) {
        const targetTier = (newState.scout.careerTier + 1) as CareerTier;
        if (!hasRequiredCoursesForTier(newState.finances?.completedCourses ?? [], targetTier)) {
          effectiveReview = { ...review, outcome: "retained" };
          // Update the stored review with the blocked outcome
          newState = {
            ...newState,
            performanceReviews: [
              ...newState.performanceReviews.slice(0, -1),
              effectiveReview,
            ],
          };
          seasonEndMessages.push({
            id: `promotion-blocked-s${completedSeason}`,
            week: newState.currentWeek,
            season: newState.currentSeason,
            type: "feedback" as const,
            title: "Promotion Blocked",
            body: "Your performance merited a promotion, but you lack the required course qualifications for the next tier. Complete the necessary courses to advance.",
            read: false,
            actionRequired: false,
          });
        }
      }

      // Apply reputation change from review
      const reviewedScout = updateReputation(newState.scout, {
        type: "seasonEnd",
        reviewOutcome: effectiveReview.outcome,
      });
      newState = { ...newState, scout: reviewedScout };

      // If promoted, advance career tier
      if (effectiveReview.outcome === "promoted" && newState.scout.careerTier < 5) {
        const newTier = (newState.scout.careerTier + 1) as CareerTier;
        newState = {
          ...newState,
          scout: {
            ...newState.scout,
            careerTier: newTier,
          },
        };

        // F10: Generate board profile on promotion to tier 5
        if (newTier === 5 && !newState.boardProfile) {
          const boardRng = createRNG(`${gameState.seed}-board-profile-${completedSeason}`);
          newState = {
            ...newState,
            boardProfile: generateBoardProfile(boardRng),
          };
        }
      }

      const reviewOutcomeText =
        effectiveReview.outcome === "promoted"
          ? "Congratulations! You have been promoted."
          : effectiveReview.outcome === "retained"
            ? "You have been retained for next season."
            : effectiveReview.outcome === "warning"
              ? "You have received a formal warning. Improve your performance next season."
              : "Your contract has been terminated.";
      seasonEndMessages.push({
        id: `review-s${completedSeason}`,
        week: newState.currentWeek,
        season: newState.currentSeason,
        type: "feedback" as const,
        title: `Season ${completedSeason} Performance Review`,
        body: `Reports submitted: ${review.reportsSubmitted} | Avg quality: ${review.averageQuality}/100\nSuccessful recommendations: ${review.successfulRecommendations}\nReputation change: ${review.reputationChange >= 0 ? "+" : ""}${review.reputationChange}\n\n${reviewOutcomeText}`,
        read: false,
        actionRequired: false,
      });

      // W3d: Performance bonus for club-path scouts
      if (newState.scout.careerPath === "club" && newState.finances) {
        const perfBonus = calculatePerformanceBonusAmount(
          effectiveReview,
          newState.scout.careerTier,
        );
        if (perfBonus > 0) {
          newState = {
            ...newState,
            finances: {
              ...newState.finances,
              balance: newState.finances.balance + perfBonus,
              bonusRevenue: newState.finances.bonusRevenue + perfBonus,
              transactions: [
                ...newState.finances.transactions,
                {
                  week: newState.currentWeek,
                  season: newState.currentSeason,
                  amount: perfBonus,
                  description: `Performance bonus (${effectiveReview.outcome})`,
                },
              ],
            },
          };
          seasonEndMessages.push({
            id: `perf-bonus-s${completedSeason}`,
            week: newState.currentWeek,
            season: newState.currentSeason,
            type: "event" as const,
            title: "Performance Bonus",
            body: `You've received a £${perfBonus.toLocaleString()} performance bonus based on your season review.`,
            read: false,
            actionRequired: false,
          });
        }
      }

      // W3d: Golden parachute for tier 5 club scouts who are fired
      if (
        effectiveReview.outcome === "fired" &&
        newState.scout.careerPath === "club" &&
        newState.finances &&
        newState.scout.careerTier === 5
      ) {
        const remainingSeasons = Math.max(
          0,
          (newState.scout.contractEndSeason ?? newState.currentSeason) - newState.currentSeason,
        );
        const parachute = calculateGoldenParachute(
          newState.scout.salary,
          remainingSeasons,
        );
        if (parachute > 0) {
          newState = {
            ...newState,
            finances: {
              ...newState.finances,
              balance: newState.finances.balance + parachute,
              bonusRevenue: newState.finances.bonusRevenue + parachute,
              transactions: [
                ...newState.finances.transactions,
                {
                  week: newState.currentWeek,
                  season: newState.currentSeason,
                  amount: parachute,
                  description: "Golden parachute severance",
                },
              ],
            },
          };
          seasonEndMessages.push({
            id: `golden-parachute-s${completedSeason}`,
            week: newState.currentWeek,
            season: newState.currentSeason,
            type: "event" as const,
            title: "Golden Parachute",
            body: `Your contract included a golden parachute clause. You've received £${parachute.toLocaleString()} in severance pay for ${remainingSeasons} remaining season(s).`,
            read: false,
            actionRequired: false,
          });
        }
      }

      // ── Issue 1: Generate job offers ─────────────────────────────────────
      // A normal-mode firing is an atomic employment transition, not only a
      // narrative outcome. Preserve lifetime career statistics while clearing
      // every field that would otherwise leave the scout employed on paper.
      if (
        effectiveReview.outcome === "fired"
        && newState.scout.careerPath === "club"
        && newState.scout.currentClubId
      ) {
        const previousTier = newState.scout.careerTier;
        const previousClubId = newState.scout.currentClubId;
        newState = applyCareerPathTransition(newState, "independent");
        newState = openCareerSetback(newState, {
          kind: "firing",
          previousTier,
          previousClubId,
        });
        seasonEndMessages.push({
          id: `employment-ended-s${completedSeason}`,
          week: newState.currentWeek,
          season: newState.currentSeason,
          type: "feedback" as const,
          title: "Now Available for Work",
          body: "Your club employment has ended. Your career record remains intact, and you can rebuild independently or accept a new offer.",
          read: false,
          actionRequired: false,
        });
      } else if (
        effectiveReview.outcome === "warning"
        && (
          !newState.careerRecovery?.current
          || newState.careerRecovery.current.status === "completed"
          || newState.careerRecovery.current.status === "failed"
        )
      ) {
        newState = openCareerSetback(newState, {
          kind: "warning",
          previousTier: newState.scout.careerTier,
          previousClubId: newState.scout.currentClubId,
        });
      }

      const seasonEndRng = createRNG(`${gameState.seed}-seasonend-${completedSeason}`);
      const offers = isCareerRecoveryBlockingOffers(newState)
        ? []
        : generateJobOffers(
            seasonEndRng,
            newState.scout,
            newState.clubs,
            newState.currentSeason,
            getSeasonLength(newState.fixtures, newState.currentSeason),
          );
      if (offers.length > 0) {
        newState = { ...newState, jobOffers: [...newState.jobOffers, ...offers] };
        for (const offer of offers) {
          const club = newState.clubs[offer.clubId];
          seasonEndMessages.push({
            id: `job-offer-${offer.id}`,
            week: newState.currentWeek,
            season: newState.currentSeason,
            title: `Job Offer: ${club?.name ?? "Unknown"}`,
            body: `You've been offered a ${offer.role} position. Salary: £${offer.salary}/month. Contract: ${offer.contractLength} season${offer.contractLength !== 1 ? "s" : ""}. Expires week ${offer.expiresWeek}.`,
            type: "jobOffer" as const,
            read: false,
            actionRequired: true,
            relatedId: offer.id,
            relatedEntityType: "jobOffer" as const,
          });
        }
      }

      // ── Issue 8: Post-transfer retrospective accuracy ────────────────────
      const alumniPlayerIds = new Set(
        newState.alumniRecords.map((record) => record.playerId),
      );
      const transferredReportIds = new Set(
        newState.transferRecords.map((record) => record.reportId),
      );
      const reportCases = groupReportRevisionsByCase(
        Object.values(newState.reports),
      );
      const casesReadyForValidation = reportCases.filter((reportCase) =>
        reportCase.latestReport.postTransferRating === undefined
        && completedSeason - reportCase.latestReport.submittedSeason >= 2
        && (
          alumniPlayerIds.has(reportCase.latestReport.playerId)
          || reportCase.revisions.some((report) =>
            report.clubResponse === "signed"
            || transferredReportIds.has(report.id)
          )
        )
      );
      if (casesReadyForValidation.length > 0) {
        const updatedReports = { ...newState.reports };
        let validationScout = newState.scout;
        const accuracyHistory = [...(validationScout.accuracyHistory ?? [])];
        for (const reportCase of casesReadyForValidation) {
          const accountableReport = reportCase.latestReport;
          const player = resolvePlayerEntity(
            newState,
            accountableReport.playerId,
          )?.player;
          if (!player) continue;
          const seasonsSinceSigning = completedSeason - accountableReport.submittedSeason;
          const accountableAccuracy = trackPostTransfer(
            accountableReport,
            player,
            seasonsSinceSigning,
          );
          const reputationBefore = validationScout.reputation;
          if (!reportCase.wasPreviouslyValidated) {
            validationScout = updateReputation(validationScout, {
              type: "reportValidated",
              accuracy: accountableAccuracy,
            });
          }
          const accuracyReputationDelta = reportCase.wasPreviouslyValidated
            ? 0
            : +(
              validationScout.reputation - reputationBefore
            ).toFixed(1);
          const assessmentAverage = accountableReport.attributeAssessments.length > 0
            ? accountableReport.attributeAssessments.reduce(
                (sum, assessment) => sum + assessment.estimatedValue,
                0,
              ) / accountableReport.attributeAssessments.length
            : 10;
          const predictedCA = accountableReport.perceivedCAStars !== undefined
            ? starsToAbility(accountableReport.perceivedCAStars)
            : Math.round((assessmentAverage / 20) * 200);
          if (!reportCase.wasPreviouslyValidated) {
            accuracyHistory.push({
              week: newState.currentWeek,
              season: newState.currentSeason,
              predictedCA,
              actualCA: player.currentAbility,
            });
          }
          for (const report of reportCase.revisions) {
            if (
              report.postTransferRating !== undefined
              || completedSeason - report.submittedSeason < 2
            ) {
              continue;
            }
            updatedReports[report.id] = {
              ...report,
              postTransferRating: trackPostTransfer(
                report,
                player,
                completedSeason - report.submittedSeason,
              ),
              accuracyReputationDelta:
                report.id === accountableReport.id
                  ? accuracyReputationDelta
                  : 0,
            };
          }
          seasonEndMessages.push({
            id: `retro-${accountableReport.id}-s${completedSeason}`,
            week: newState.currentWeek,
            season: newState.currentSeason,
            title: `Report Validated: ${player.firstName} ${player.lastName}`,
            body: `Your active judgment on ${player.firstName} ${player.lastName} from season ${accountableReport.submittedSeason} has been validated after ${seasonsSinceSigning} seasons. Accuracy: ${accountableAccuracy}/100. This scouting case changed reputation ${accuracyReputationDelta >= 0 ? "+" : ""}${accuracyReputationDelta}; earlier revisions were reviewed without multiplying the reward.`,
            type: "feedback" as const,
            read: false,
            actionRequired: false,
            relatedId: player.id,
            relatedEntityType: "player" as const,
          });
        }
        newState = {
          ...newState,
          reports: updatedReports,
          scout: {
            ...validationScout,
            accuracyHistory: accuracyHistory.slice(-50),
          },
        };
      }
      newState = {
        ...newState,
        discoveryRecords: synchronizeDiscoveryAccuracyWithReports(
          newState.discoveryRecords,
          newState.reports,
        ),
      };

      // W3d: Department bonus pool for tier 4+ club scouts at season end
      if (
        newState.scout.careerPath === "club" &&
        newState.scout.careerTier >= 4 &&
        newState.finances
      ) {
        // Count successful signings from transfer records this season
        const seasonSuccesses = newState.transferRecords.filter(
          (tr) =>
            tr.transferSeason === completedSeason &&
            tr.reportId &&
            (tr.outcome === "hit" || tr.outcome === "decent"),
        ).length;
        const deptBonus = calculateDepartmentBonusPool(
          seasonSuccesses,
          newState.scout.careerTier,
        );
        if (deptBonus > 0) {
          newState = {
            ...newState,
            finances: {
              ...newState.finances,
              balance: newState.finances.balance + deptBonus,
              bonusRevenue: newState.finances.bonusRevenue + deptBonus,
              transactions: [
                ...newState.finances.transactions,
                {
                  week: newState.currentWeek,
                  season: newState.currentSeason,
                  amount: deptBonus,
                  description: `Department bonus pool (${seasonSuccesses} successful signings)`,
                },
              ],
            },
          };
          seasonEndMessages.push({
            id: `dept-bonus-s${completedSeason}`,
            week: newState.currentWeek,
            season: newState.currentSeason,
            type: "event" as const,
            title: "Department Bonus",
            body: `Your department achieved ${seasonSuccesses} successful signing(s) this season. You've received a £${deptBonus.toLocaleString()} department bonus.`,
            read: false,
            actionRequired: false,
          });
        }
      }

      // A8: Generate season awards data before transitioning
      const seasonAwardsData = generateSeasonAwardsData(newState, completedSeason);
      newState = { ...newState, seasonAwardsData };

      // Add all season-end messages to inbox
      if (seasonEndMessages.length > 0) {
        newState = { ...newState, inbox: [...newState.inbox, ...seasonEndMessages] };
      }

      // Generate new season fixtures for core leagues only (skip secondary talent pools)
      const fixtureRng = createRNG(`${gameState.seed}-fixtures-s${newState.currentSeason}`);
      const secondaryCountryKeys = new Set(getSecondaryCountries());
      const scheduledLeagueIds: string[] = [];
      for (const league of Object.values(newState.leagues)) {
        // Derive country key from territory to skip secondary leagues
        const territory = Object.values(newState.territories).find(
          (t) => t.leagueIds.includes(league.id),
        );
        const countryKey = territory
          ? territory.countryKey
            ?? normalizeCountryKey(territory.country)
            ?? territory.id.replace("territory_", "")
          : "";
        if (secondaryCountryKeys.has(countryKey)) continue;
        scheduledLeagueIds.push(league.id);
      }
      newState = {
        ...newState,
        fixtures: ensureSeasonFixtures(
          fixtureRng,
          newState.leagues,
          newState.fixtures,
          newState.currentSeason,
          scheduledLeagueIds,
          completedSeason,
        ),
      };

      const newSeasonEvents = generateSeasonEvents(
        newState.currentSeason,
        getSeasonLength(newState.fixtures, newState.currentSeason),
      );
      const newTransferWindows = initializeTransferWindows(newState.currentSeason);
      const newTransferWindow = getCurrentTransferWindow(
        newTransferWindows.map((w) => ({
          ...w,
          isOpen: isTransferWindowOpen([w], newState.currentWeek),
        })),
        newState.currentWeek,
      );
      // Generate youth tournaments for the new season
      const tournamentRng = createRNG(`${newState.seed}-tournaments-s${newState.currentSeason}`);
      const newTournaments = generateSeasonTournaments(
        tournamentRng, newState.currentSeason, newState.countries, newState.scout,
      );
      newState = {
        ...newState,
        seasonEvents: newSeasonEvents,
        transferWindow: newTransferWindow,
        youthTournaments: newTournaments,
        // Reset at the start of each new season — every fixture is fresh
        playedFixtures: [],
        completedInteractiveSessions: [],
      };

      // ── Generate unsigned youth and academy intakes for the new season ──────
      // Country data was loaded into the sync registry during startNewGame, so
      // getCountryDataSync is safe to call here without awaiting.
      const youthRng = createRNG(`${gameState.seed}-youth-s${newState.currentSeason}`);
      const newYouth: UnsignedYouth[] = [];
      const newAcademyPlayers: Player[] = [];

      for (const countryKey of newState.countries) {
        const countryData = getCountryDataSync(countryKey);
        if (!countryData) continue;

        // Regional youth generation
        const countrySubRegions = Object.values(newState.subRegions).filter(
          (sr) => sr.country.toLowerCase() === countryData.name.toLowerCase(),
        );
        // Use week=1 for the season-start batch (season boundary context)
        const batch = generateRegionalYouth(
          youthRng,
          countryData,
          newState.currentSeason,
          1,
          countrySubRegions,
          getDifficultyModifiers(newState.difficulty).wonderkidRateMultiplier
            * getRunSimulationModifiers(newState.runManifest).youthTalentMultiplier,
          "season-start",
          getWorldConditionModifiers(newState, countryKey).discoveryMultiplier,
        );
        newYouth.push(...batch);

        // Academy intake for all clubs in this country
        const countryClubs = Object.values(newState.clubs).filter((c) => {
          const league = newState.leagues[c.leagueId];
          return league?.country.toLowerCase() === countryData.name.toLowerCase();
        });
        for (const club of countryClubs) {
          const intake = generateAcademyIntake(
            youthRng,
            club,
            countryData,
            newState.currentSeason,
          );
          newAcademyPlayers.push(...intake);
        }
      }

      // Merge unsigned youth pool
      if (newYouth.length > 0) {
        const updatedUnsignedYouth = { ...newState.unsignedYouth };
        for (const y of newYouth) {
          updatedUnsignedYouth[y.id] = y;
        }
        newState = { ...newState, unsignedYouth: updatedUnsignedYouth };
      }

      // Merge academy intake players into players + club rosters
      if (newAcademyPlayers.length > 0) {
        const updatedPlayers = { ...newState.players };
        const updatedClubs = { ...newState.clubs };
        for (const p of newAcademyPlayers) {
          updatedPlayers[p.id] = p;
          const club = updatedClubs[p.clubId];
          if (club) {
            updatedClubs[p.clubId] = {
              ...club,
              academyPlayerIds: [
                ...new Set([...(club.academyPlayerIds ?? []), p.id]),
              ],
            };
          }
        }
        newState = { ...newState, players: updatedPlayers, clubs: updatedClubs };
      }

      // ── First-team season-end: regenerate directives and update transfer records ──
      if (newState.scout.primarySpecialization === "firstTeam") {
        // Generate new manager directives for the new season
        if (newState.scout.currentClubId) {
          const newSeasonDirectiveRng = createRNG(
            `${gameState.seed}-directives-s${newState.currentSeason}`,
          );
          const scoutClub = newState.clubs[newState.scout.currentClubId];
          const scoutManager = newState.managerProfiles[newState.scout.currentClubId];
          if (scoutClub && scoutManager) {
            const newDirectives = generateDirectives(
              newSeasonDirectiveRng,
              scoutClub,
              scoutManager,
              newState.players,
              newState.currentSeason,
            );
            newState = { ...newState, managerDirectives: newDirectives };
          }
        }

      }

      // ── Board directives for tier 5+ scouts ────────────────────────────────
      if (newState.scout.careerTier >= 5) {
        const boardDirRng = createRNG(
          `${gameState.seed}-board-directives-s${newState.currentSeason}`,
        );
        const directives = generateBoardDirectives(boardDirRng, newState.scout, newState.currentSeason);
        newState = {
          ...newState,
          scout: { ...newState.scout, boardDirectives: directives },
        };
      }

      // ── Season consolidation: matchRatings → player.seasonRatings, then wipe ──
      if (Object.keys(newState.matchRatings).length > 0) {
        const consolidatedPlayers = { ...newState.players };

        // Gather all ratings per player from all fixtures this season
        const playerSeasonRatings = new Map<string, import("@/engine/core/types").PlayerMatchRating[]>();
        for (const fixtureRatings of Object.values(newState.matchRatings)) {
          for (const [pid, rating] of Object.entries(fixtureRatings)) {
            if (!playerSeasonRatings.has(pid)) playerSeasonRatings.set(pid, []);
            playerSeasonRatings.get(pid)!.push(rating);
          }
        }

        // Build SeasonRatingRecord for each player
        for (const [pid, ratings] of playerSeasonRatings) {
          const player = consolidatedPlayers[pid];
          if (!player) continue;

          const avgRating = ratings.reduce((s, r) => s + r.rating, 0) / ratings.length;
          const appearances = ratings.length;
          let goals = 0;
          let assists = 0;
          let cleanSheets = 0;
          for (const r of ratings) {
            goals += r.stats.goals ?? 0;
            assists += r.stats.assists ?? 0;
            if (r.stats.cleanSheet) cleanSheets++;
          }

          const seasonRecord = {
            season: completedSeason,
            avgRating: Math.round(avgRating * 10) / 10,
            appearances,
            goals,
            assists,
            cleanSheets,
          };

          consolidatedPlayers[pid] = {
            ...player,
            seasonRatings: [...(player.seasonRatings ?? []), seasonRecord],
          };
        }

        // Wipe per-fixture match ratings, keep recentMatchRatings on players (carries form)
        newState = { ...newState, players: consolidatedPlayers, matchRatings: {} };
      }

      // ── Data scout season-end: resolve predictions and generate new analyst candidates ──
      if (newState.scout.primarySpecialization === "data") {
        // Resolve all outstanding predictions for the completed season
        if (newState.predictions.length > 0) {
          const endSeasonPredRng = createRNG(
            `${gameState.seed}-predend-s${completedSeason}`,
          );
          const faPlayerIdsEnd = new Set(
            (newState.freeAgentPool?.agents ?? []).map((a) => a.playerId),
          );
          const endPredAccBonus = weekEquipBonuses?.predictionAccuracy ?? 0;
          const resolvedAtSeasonEnd = resolvePredictions(
            newState.predictions,
            newState.players,
            completedSeason,
            newState.currentWeek,
            endSeasonPredRng,
            faPlayerIdsEnd,
            endPredAccBonus,
          );
          newState = { ...newState, predictions: resolvedAtSeasonEnd };
        }

        // Generate a new analyst candidate as an end-of-season event
        const analystCandidateRng = createRNG(
          `${gameState.seed}-analystcandidate-s${newState.currentSeason}`,
        );
        const candidate = generateAnalystCandidate(
          analystCandidateRng,
          newState.currentSeason,
          `season-${newState.currentSeason}`,
        );
        const candidateMsg: InboxMessage = {
          id: `analyst-candidate-s${newState.currentSeason}`,
          week: newState.currentWeek,
          season: newState.currentSeason,
          type: "event" as const,
          title: "New Analyst Candidate Available",
          body: `A data analyst has expressed interest in joining your team. ${candidate.name} (Skill: ${candidate.skill}/20, Focus: ${candidate.focus}) is available for £${candidate.salary}/week. Review their profile in your analytics dashboard.`,
          read: false,
          actionRequired: false,
        };
        newState = {
          ...newState,
          inbox: [...newState.inbox, candidateMsg],
        };
      }

      // Archive projection is complete; retain material movements for the
      // bounded history window and only recent routine renewal detail.
      newState = compactLongCareerHistory(newState);
    } else {
      // Keep season events as-is; update transfer window open/closed state
      const existingWindows = initializeTransferWindows(newState.currentSeason);
      const updatedTransferWindow = getCurrentTransferWindow(
        existingWindows.map((w) => ({
          ...w,
          isOpen: isTransferWindowOpen([w], newState.currentWeek),
        })),
        newState.currentWeek,
      );
      newState = { ...newState, transferWindow: updatedTransferWindow };
    }

    // Resolved or orphaned narrative prompts must not remain permanently pinned
    // as action-required messages in long-running saves.
    const repairedNarrativeInbox = clearTerminalNarrativeInboxActions(
      newState.inbox,
      newState.narrativeEvents,
    );
    if (repairedNarrativeInbox !== newState.inbox) {
      newState = { ...newState, inbox: repairedNarrativeInbox };
    }

    // Prune inbox to keep most recent messages, but never drop unread action-required ones (Fix #57)
    if (newState.inbox.length > 200) {
      const priority = newState.inbox.filter((m) => m.actionRequired && !m.read);
      const rest = newState.inbox.filter((m) => !(m.actionRequired && !m.read));
      const trimmedRest = rest.slice(-Math.max(0, 200 - priority.length));
      newState = { ...newState, inbox: [...trimmedRest, ...priority] };
    }

    // Issue 17: Prune old acknowledged narrative events (keep last 10 weeks)
    if (newState.narrativeEvents.length > 0) {
      const previousSeasonLength = getSeasonLength(
        newState.fixtures,
        Math.max(1, newState.currentSeason - 1),
      );
      const prunedNarratives = newState.narrativeEvents.filter(
        (e) =>
          !e.acknowledged
          || getNarrativeRetentionAge(
            e,
            {
              season: newState.currentSeason,
              week: newState.currentWeek,
            },
            previousSeasonLength,
          ) < 10,
      );
      newState = { ...newState, narrativeEvents: prunedNarratives };
    }

    // ── Build week summary for UI feedback ──────────────────────────────────
    // Career-high and completed-season history must survive setbacks such as a
    // later firing or bankruptcy; legacy perks are based on what was actually
    // achieved, not only the scout's final-week tier.
    newState = {
      ...newState,
      legacyScore: {
        ...newState.legacyScore,
        careerHighTier: Math.max(
          newState.legacyScore.careerHighTier,
          newState.scout.careerTier,
        ),
        totalSeasons: Math.max(
          newState.legacyScore.totalSeasons,
          getCareerSeasonOrdinal(newState.currentSeason) - 1,
        ),
      },
    };

    newState = processCareerRecoveryWeek(newState, gameState.schedule);

    // Leadership is a real responsibility unlock, not merely a navigation
    // gate. Bootstrap a small, assigned team exactly once when Tier 4 is first
    // reached, regardless of the path that produced the promotion.
    const leadershipBootstrap = isCareerRecoveryBlockingOffers(newState)
      ? { state: newState, addedScoutIds: [] }
      : ensureLeadershipDelegationTeam(
          newState,
          createRNG(
            `${newState.seed}-leadership-bootstrap-${newState.scout.id}-tier${newState.scout.careerTier}`,
          ),
        );
    if (leadershipBootstrap.addedScoutIds.length > 0) {
      newState = {
        ...leadershipBootstrap.state,
        inbox: [
          ...leadershipBootstrap.state.inbox,
          {
            id: `leadership-team-tier${leadershipBootstrap.state.scout.careerTier}`,
            week: leadershipBootstrap.state.currentWeek,
            season: leadershipBootstrap.state.currentSeason,
            type: "event",
            title: "Your scouting team is ready",
            body: `${leadershipBootstrap.addedScoutIds.length} scouts have joined your department and received regional assignments. You can now delegate focused player follow-ups from NPC Scout Management.`,
            read: false,
            actionRequired: false,
          },
        ],
      };
    }
    newState = processLeadershipPortfolioWeek(newState);

    const newInboxCount = newState.inbox.length - gameState.inbox.length;
    const isPayWeek = gameState.currentWeek % 4 === 0;
    const actualFatigueChange = newState.scout.fatigue - gameState.scout.fatigue;
    const actualReputationChange = newState.scout.reputation - gameState.scout.reputation;
    const actualPlayersDiscovered = Math.max(
      0,
      newState.discoveryRecords.length - gameState.discoveryRecords.length,
    );
    const actualObservationsGenerated = Math.max(
      0,
      Object.keys(newState.observations).length - Object.keys(gameState.observations).length,
    );
    const youthActivityCount = getScheduledActivityInstances(gameState.schedule).filter(({ activity }) =>
      YOUTH_SUMMARY_ACTIVITY_TYPES.has(activity.type),
    ).length;
    void weekPlayersDiscovered;
    void weekObservationsGenerated;
    const weekSummary: WeekSummary = {
      continueScreen:
        tickResult.endOfSeasonTriggered && newState.seasonAwardsData
          ? "seasonAwards"
          : undefined,
      fatigueChange: actualFatigueChange,
      reputationChange: actualReputationChange,
      skillXpGained: weekResult.skillXpGained as Record<string, number>,
      attributeXpGained: weekResult.attributeXpGained as Record<string, number>,
      matchesAttended: gameState.scout.primarySpecialization === "youth"
        ? youthActivityCount
        : weekResult.matchesAttended.length,
      reportsWritten: weekResult.reportsWritten.length,
      meetingsHeld: weekResult.meetingsHeld.length,
      newMessages: Math.max(0, newInboxCount),
      rivalAlerts: rivalInboxMessages.length,
      financeSummary: isPayWeek && gameState.finances
        ? {
            income: gameState.finances.monthlyIncome,
            expenses: Object.values(gameState.finances.expenses).reduce((s, v) => s + v, 0),
          }
        : null,
      activityQualities: qualityRollsByDay.map(({ dayIndex, result }) => ({
        activityType: result.activityType,
        tier: result.tier,
        narrative: `[${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][dayIndex]}] ${result.narrative}`,
      })),
      playersDiscovered: actualPlayersDiscovered,
      observationsGenerated: actualObservationsGenerated,
    };

    // ── Scenario objective checking ─────────────────────────────────────────
    const { scenarioProgressUpdate, scenarioOutcomeUpdate } = deriveScenarioState(newState);
    const pendingCelebration = derivePendingCelebration(
      gameState,
      newState,
      scenarioOutcomeUpdate,
      newlyUnlocked,
    );
    let resolvedScenarioId: string | null = null;
    if (scenarioOutcomeUpdate !== null) {
      const latched = resolveScenarioOutcome(newState, scenarioOutcomeUpdate);
      newState = latched.state;
      resolvedScenarioId = latched.resolvedScenarioId;
    }
    const tierPromoted = newState.scout.careerTier > gameState.scout.careerTier;

    // ── Guided session milestone ──────────────────────────────────────────────
    useTutorialStore.getState().completeMilestone("advancedWeek");

    // ── Weekly mentor check-ins (first season only) ─────────────────────────
    if (newState.currentSeason === 1) {
      const week = newState.currentWeek;
      if (week === 2) useTutorialStore.getState().startSequence("mentorCheckin:week2");
      else if (week === 3) useTutorialStore.getState().startSequence("mentorCheckin:week3");
      else if (week === 4) useTutorialStore.getState().startSequence("mentorCheckin:week4");
    }

    // ── Tutorial trigger: career progression ─────────────────────────────────
    if (tierPromoted) {
      useTutorialStore.getState().startSequence("careerProgression");
    }

    // ── Feature discovery tracking ─────────────────────────────────────────
    // Record organic feature discoveries based on game state changes so that
    // contextual tutorials are skipped for features the player already figured out.
    {
      const tut = useTutorialStore.getState();
      if ((newState.finances?.equipment?.ownedItems.length ?? 0) > 0)
        tut.recordFeatureDiscovery("equipment");
      if (Object.keys(newState.npcScouts).length > 0)
        tut.recordFeatureDiscovery("npcManagement");
      if (newState.freeAgentPool?.agents.some((a) => a.discoveredByScout))
        tut.recordFeatureDiscovery("freeAgent");
      if (Object.values(newState.contacts).some((c) => c.relationship > 0))
        tut.recordFeatureDiscovery("network");
      if (Object.keys(newState.rivalScouts).length > 0)
        tut.recordFeatureDiscovery("rival");
    }

    // ── Aha moment triggers ────────────────────────────────────────────────
    const tutorialState = useTutorialStore.getState();

    // Youth aha: first placement accepted this week
    const hadAcceptedBefore = Object.values(gameState.placementReports).some(
      (r) => r.clubResponse === "accepted",
    );
    const hasAcceptedNow = Object.values(newState.placementReports).some(
      (r) => r.clubResponse === "accepted",
    );
    if (
      newState.scout.primarySpecialization === "youth" &&
      !tutorialState.completedSequences.has("ahaMoment:youth") &&
      !hadAcceptedBefore &&
      hasAcceptedNow
    ) {
      tutorialState.queueSequence("ahaMoment:youth");
    }

    // Data aha: first anomaly flags generated this week
    if (
      newState.scout.primarySpecialization === "data" &&
      !tutorialState.completedSequences.has("ahaMoment:data") &&
      gameState.anomalyFlags.length === 0 &&
      newState.anomalyFlags.length > 0
    ) {
      tutorialState.queueSequence("ahaMoment:data");
    }

    // Equipment aha: first equipment bonus applied (equipment purchased this week)
    if (
      !tutorialState.completedSequences.has("ahaMoment:equipment") &&
      !gameState.finances?.equipment?.ownedItems.length &&
      (newState.finances?.equipment?.ownedItems.length ?? 0) > 0
    ) {
      tutorialState.queueSequence("ahaMoment:equipment");
    }

    // NPC report aha: first NPC scout auto-report appeared
    if (
      !tutorialState.completedSequences.has("ahaMoment:npcReport") &&
      Object.keys(gameState.npcReports).length === 0 &&
      Object.keys(newState.npcReports).length > 0
    ) {
      tutorialState.queueSequence("ahaMoment:npcReport");
    }

    // Free agent aha: first free agent signed (status changed to "signed" by scout)
    if (
      !tutorialState.completedSequences.has("ahaMoment:freeAgent") &&
      newState.freeAgentPool?.agents.some(
        (a) => a.discoveredByScout && a.status === "signed",
      ) &&
      !gameState.freeAgentPool?.agents.some(
        (a) => a.discoveredByScout && a.status === "signed",
      )
    ) {
      tutorialState.queueSequence("ahaMoment:freeAgent");
    }

    // Season award aha: first season awards data generated
    if (
      !tutorialState.completedSequences.has("ahaMoment:seasonAward") &&
      !gameState.seasonAwardsData &&
      newState.seasonAwardsData
    ) {
      tutorialState.queueSequence("ahaMoment:seasonAward");
    }

    // Contact intel aha: first hidden intel received from a contact
    if (
      !tutorialState.completedSequences.has("ahaMoment:contactIntel") &&
      Object.keys(gameState.contactIntel).length === 0 &&
      Object.keys(newState.contactIntel).length > 0
    ) {
      tutorialState.queueSequence("ahaMoment:contactIntel");
    }

    // Perk activated aha: first specialization perk unlocked
    if (
      !tutorialState.completedSequences.has("ahaMoment:perkActivated") &&
      gameState.scout.unlockedPerks.length === 0 &&
      newState.scout.unlockedPerks.length > 0
    ) {
      tutorialState.queueSequence("ahaMoment:perkActivated");
    }

    set({
      gameState: newState,
      lastWeekSummary: weekSummary,
      ...(scenarioProgressUpdate !== null ? { scenarioProgress: scenarioProgressUpdate } : {}),
      ...(scenarioOutcomeUpdate !== null
        ? {
            scenarioOutcome: scenarioOutcomeUpdate,
            scenarioOutcomeScenarioId: resolvedScenarioId,
          }
        : {}),
      ...(pendingCelebration !== null ? { pendingCelebration } : {}),
      ...(tickResult.endOfSeasonTriggered && newState.seasonAwardsData
        ? { currentScreen: "calendar" as GameScreen }
        : {}),
    });
    // ── Evaluate contextual hints ────────────────────────────────────────────
    // Expiring a causal-ledger decision is not enough for narrative choices:
    // the domain event must also record the designed default so storylines and
    // event chains can release their persisted choice gate. Reuse the normal
    // action path to keep all branch effects identical to an explicit choice.
    for (const decisionId of expiredDecisions.expiredDecisionIds) {
      const liveStore = get();
      const liveState = liveStore.gameState;
      const decision = liveState?.consequenceState.decisions[decisionId];
      if (
        !liveState ||
        !decision ||
        decision.source.kind !== "narrativeEvent" ||
        decision.selectionKind !== "default" ||
        !decision.selectedOptionId
      ) {
        continue;
      }
      const event = liveState.narrativeEvents.find(
        (candidate) => candidate.id === decision.source.id,
      );
      if (!event || event.selectedChoice !== undefined) continue;
      const choiceIndex = decision.options.findIndex(
        (option) => option.id === decision.selectedOptionId,
      );
      if (choiceIndex >= 0) {
        liveStore.resolveNarrativeEventChoice(event.id, choiceIndex);
      }
    }

    {
      const tutState = useTutorialStore.getState();
      const npcHiredCount = Object.keys(newState.npcScouts).length;
      const totalNpcSlots = Object.values(newState.territories).reduce(
        (sum, t) => sum + t.maxScouts, 0,
      );
      const freeAgents = newState.freeAgentPool?.agents.filter(
        (a) => a.status === "available",
      ) ?? [];
      const equipment = newState.finances?.equipment;
      const emptySlots = equipment
        ? (["notebook", "video", "travel", "network", "analysis"] as const).filter(
            (slot) => !equipment.loadout[slot],
          ).length
        : 0;
      const loanWindowOpen = !!(
        newState.transferWindow?.isOpen && newState.activeLoans !== undefined
      );
      const hint = evaluateHints(
        {
          currentWeek: newState.currentWeek,
          currentSeason: newState.currentSeason,
          fatigue: newState.scout.fatigue,
          savings: newState.finances?.balance ?? 0,
          hasClub: !!newState.scout.currentClubId,
          observationCount: Object.keys(newState.observations).length,
          reportCount: selectLatestReportsByCase(
            Object.values(newState.reports),
          ).length,
          comparisonCount: 0,
          networkMeetingsHeld: Object.values(newState.contacts).filter(c => c.relationship > 0).length,
          unfulfilledDirectiveWeeks: newState.managerDirectives
            ? newState.managerDirectives.filter(d => !d.fulfilled).length > 0
              ? Math.max(0, newState.currentWeek - 1)
              : 0
            : 0,
          scheduledRestDays: newState.schedule.activities.filter(a => a?.type === "rest").length,
          transferWindowClosingIn: newState.transferWindow?.isOpen && newState.transferWindow.closeWeek
            ? newState.transferWindow.closeWeek - newState.currentWeek
            : null,
          unsubmittedReportCount: 0,
          specialization: newState.scout.primarySpecialization,
          // Phase 4B expanded fields
          // Specialization perks are granted automatically by applyWeekResults;
          // there is intentionally no separate claimable-perk state.
          unclaimedPerks: 0,
          emptyEquipmentSlots: emptySlots,
          discoveryCount: newState.discoveryRecords.length,
          alumniCount: newState.alumniRecords.length,
          hasCheckedAlumni: tutState.visitedScreens.has("alumniDashboard"),
          hasCheckedLeaderboard: tutState.visitedScreens.has("leaderboard"),
          npcSlotsAvailable: Math.max(0, totalNpcSlots - npcHiredCount),
          npcHiredCount,
          freeAgentCount: freeAgents.length,
          hasBrowsedFreeAgents: tutState.visitedScreens.has("freeAgents"),
          loanMarketActive: loanWindowOpen,
          hasBrowsedLoans: hasBrowsedYouthLoanWorkspace(tutState.visitedScreens),
          careerTier: newState.scout.careerTier,
        },
        tutState.dismissedHints,
      );
      if (hint) tutState.showHint(hint);
    }

    // Autosave after each week advance — guard against race condition (Fix #24)
    if (_batchAdvanceDepth === 0) queueAutosave(newState, set);
  },

  // ── Quick Scout Mode (F17) ──────────────────────────────────────────────
  autoSchedule: (priorities?: QuickScoutPriorities) => { const { gameState } = get(); if (!gameState) return; const p = priorities ?? buildDefaultPriorities(gameState); const ns = autoScheduleWeek(gameState, p); set({ gameState: { ...gameState, schedule: ns }, weekSimulation: null }); },
  batchAdvance: (weeks: number, priorities?: QuickScoutPriorities) => {
    const initialState = get().gameState;
    if (!initialState) return;

    // Batch advancement is deliberately an input policy over the authoritative
    // day-by-day/week transaction. It must never own a second world simulation.
    // This path is currently hidden in Youth EA, but keeping it canonical makes
    // long-running tests and future delegation trustworthy.
    const requestedWeeks = Math.min(Math.max(1, weeks), 8);
    const startingFatigue = initialState.scout.fatigue;
    const weekSummaries: BatchWeekSummary[] = [];
    const totalSkillXp: Record<string, number> = {};
    const totalAttributeXp: Record<string, number> = {};
    let totalNewMessages = 0;
    let totalPlayersDiscovered = 0;
    let totalObservationsGenerated = 0;
    let seasonTransitionOccurred = false;

    _batchAdvanceDepth++;
    try {
      for (let index = 0; index < requestedWeeks; index++) {
      const before = get().gameState;
      if (!before || before.scout.fatigue >= 100) break;

      const policy = priorities ?? buildDefaultPriorities(before);
      get().autoSchedule(policy);
      const scheduled = get().gameState;
      if (!scheduled) break;
      const scheduledInstances = getScheduledActivityInstances(scheduled.schedule);

      get().startWeekSimulation();
      if (!get().weekSimulation) break;
      get().fastForwardWeek();

      const after = get().gameState;
      if (!after) break;
      const advanced = after.currentSeason !== before.currentSeason
        || after.currentWeek !== before.currentWeek;
      if (!advanced) break;

      const newMessages = Math.max(0, after.inbox.length - before.inbox.length);
      const newDiscoveries = Math.max(
        0,
        after.discoveryRecords.length - before.discoveryRecords.length,
      );
      const newObservations = Math.max(
        0,
        Object.keys(after.observations).length - Object.keys(before.observations).length,
      );
      const didTransition = after.currentSeason !== before.currentSeason;
      seasonTransitionOccurred ||= didTransition;

      const keyEvents = after.inbox
        .slice(before.inbox.length)
        .slice(0, 5)
        .map((message) => message.title);
      if (didTransition) keyEvents.unshift(`Season ${before.currentSeason} ended`);

      weekSummaries.push({
        week: before.currentWeek,
        season: before.currentSeason,
        fatigueChange: after.scout.fatigue - before.scout.fatigue,
        matchesAttended: scheduledInstances.filter(({ activity }) => activity.type === "attendMatch").length,
        reportsWritten: scheduledInstances.filter(({ activity }) => activity.type === "writeReport").length,
        meetingsHeld: scheduledInstances.filter(({ activity }) => activity.type === "networkMeeting").length,
        newMessages,
        playersDiscovered: newDiscoveries,
        observationsGenerated: newObservations,
        keyEvents,
      });

      for (const [skill, xp] of Object.entries(after.scout.skillXp)) {
        const delta = (xp ?? 0) - (before.scout.skillXp[skill as keyof typeof before.scout.skillXp] ?? 0);
        if (delta > 0) totalSkillXp[skill] = (totalSkillXp[skill] ?? 0) + delta;
      }
      for (const [attribute, xp] of Object.entries(after.scout.attributeXp)) {
        const delta = (xp ?? 0) - (before.scout.attributeXp[attribute as keyof typeof before.scout.attributeXp] ?? 0);
        if (delta > 0) totalAttributeXp[attribute] = (totalAttributeXp[attribute] ?? 0) + delta;
      }
      totalNewMessages += newMessages;
      totalPlayersDiscovered += newDiscoveries;
      totalObservationsGenerated += newObservations;

      if (didTransition) break;
      }
    } finally {
      _batchAdvanceDepth = Math.max(0, _batchAdvanceDepth - 1);
    }

    const finalState = get().gameState;
    if (!finalState) return;
    const result: BatchAdvanceResult = {
      weekSummaries,
      weeksAdvanced: weekSummaries.length,
      startingFatigue,
      endingFatigue: finalState.scout.fatigue,
      totalSkillXp,
      totalAttributeXp,
      totalNewMessages,
      totalPlayersDiscovered,
      totalObservationsGenerated,
      seasonTransitionOccurred,
    };
    set({ batchSummary: result });
    queueAutosave(finalState, set);
  },
  delegateScouting: (npcScoutId: string, playerId: string) => { const { gameState } = get(); if (!gameState) return; const { state: ns, result } = delegateScoutingTask(gameState, npcScoutId, playerId); if (!result.accepted) { set({ gameState: { ...gameState, inbox: [...gameState.inbox, { id: `deleg-rej-${npcScoutId}-${playerId}-${gameState.currentWeek}`, week: gameState.currentWeek, season: gameState.currentSeason, type: "event" as const, title: "Delegation Rejected", body: result.rejectionReason ?? "NPC scout could not accept.", read: false, actionRequired: false }] } }); return; } set({ gameState: ns }); },
  resolveLeadershipResponsibility: (
    responsibilityId: string,
    choice: LeadershipResponsibilityChoice,
    npcScoutId?: string,
  ) => {
    const { gameState } = get();
    if (!gameState) return;
    const result = chooseLeadershipResponsibility(
      gameState,
      responsibilityId,
      choice,
      npcScoutId,
    );
    if (result.accepted) {
      set({ gameState: result.state });
      return;
    }
    set({
      gameState: {
        ...gameState,
        inbox: [
          ...gameState.inbox,
          {
            id: `leadership-choice-rejected:${responsibilityId}:${gameState.currentSeason}:${gameState.currentWeek}`,
            week: gameState.currentWeek,
            season: gameState.currentSeason,
            type: "event",
            title: "Leadership choice unavailable",
            body: result.reason ?? "That responsibility can no longer be changed.",
            read: false,
            actionRequired: false,
          },
        ],
      },
    });
  },

  ...createWeekSimulationActions(get, set, {
    buildDaySpanInfo,
    buildDayInteraction,
    isQualityRelevantActivity,
    rollDayActivityQuality,
    resolveScoutEffectiveCountry,
    buildScoutQualityDataForState,
    isDayInteractionPending,
  }),

  ...createMatchActions(get, set),
  };
}
